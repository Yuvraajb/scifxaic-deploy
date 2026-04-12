import type { FeedItem, ClassificationResult } from '../types';
import { CLAUDE_API_URL, CLAUDE_MODEL, CLASSIFICATION_DRAIN_INTERVAL_MS } from '../config/constants';
import { cacheGet, cacheSet, hashKey } from '../utils/cache';

interface QueueItem {
  item: FeedItem;
  resolve: (result: ClassificationResult) => void;
  reject: (err: Error) => void;
}

const queue: QueueItem[] = [];
let drainTimer: ReturnType<typeof setInterval> | null = null;

const SYSTEM_PROMPT = `You are a financial analyst assistant. Given a financial filing or news headline and snippet, classify the materiality level and write a one-line summary.

Materiality definitions:
- High: Requires immediate attention — earnings restatement, merger/acquisition, guidance cut, CEO/CFO change, going concern, regulatory action, major litigation
- Medium: Notable but not urgent — earnings beat/miss, new product launch, executive hire below C-suite, contract wins, analyst rating change
- Low: Routine — scheduled annual/quarterly filing, minor operational update, boilerplate disclosure

Return ONLY valid JSON with this exact shape:
{"materiality":"High|Medium|Low","summary":"one concise sentence"}`;

async function classifyItem(
  item: FeedItem,
  apiKey: string,
): Promise<ClassificationResult> {
  const cacheKey = await hashKey(item.title + item.rawSnippet);
  const cached = cacheGet<ClassificationResult>('clf', cacheKey);
  if (cached) return cached;

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 256,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Title: ${item.title}\nSnippet: ${item.rawSnippet}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text ?? '{}';

  // Extract JSON even if the model wraps it in markdown
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude response did not contain JSON');

  const result: ClassificationResult = JSON.parse(jsonMatch[0]);
  if (!result.materiality || !result.summary) {
    throw new Error('Claude response missing required fields');
  }

  cacheSet('clf', cacheKey, result);
  return result;
}

export function enqueueClassification(item: FeedItem): Promise<ClassificationResult> {
  return new Promise((resolve, reject) => {
    queue.push({ item, resolve, reject });
  });
}

export function startClassificationDrain(apiKey: string): void {
  if (drainTimer) return;
  drainTimer = setInterval(async () => {
    if (!queue.length || !apiKey) return;
    const { item, resolve, reject } = queue.shift()!;
    try {
      const result = await classifyItem(item, apiKey);
      resolve(result);
    } catch (err) {
      reject(err as Error);
    }
  }, CLASSIFICATION_DRAIN_INTERVAL_MS);
}

export function stopClassificationDrain(): void {
  if (drainTimer) {
    clearInterval(drainTimer);
    drainTimer = null;
  }
}

export function getQueueLength(): number {
  return queue.length;
}
