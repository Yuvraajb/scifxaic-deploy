import type { FeedItem, ClassificationResult } from '../types';
import { CLAUDE_API_URL, CLAUDE_MODEL, CLASSIFICATION_DRAIN_INTERVAL_MS, getFastPathRule } from '../config/constants';
import { cacheGet, cacheSet, hashKey } from '../utils/cache';

interface QueueItem {
  item: FeedItem;
  resolve: (result: ClassificationResult) => void;
  reject: (err: Error) => void;
}

const queue: QueueItem[] = [];
let drainTimer: ReturnType<typeof setInterval> | null = null;

const SYSTEM_PROMPT = `You are a financial analyst assistant specializing in real-time market intelligence.

Given a financial news headline and snippet, return a JSON object with EXACTLY these fields:

{
  "materiality": "High" | "Medium" | "Low",
  "summary": "one concise sentence (max 20 words)",
  "immediate": true | false,
  "notification_worthy": true | false,
  "sentiment": "Bullish" | "Bearish" | "Neutral"
}

Definitions:
- materiality:
  • High — merger/acquisition, bankruptcy, earnings restatement, guidance cut/raise, CEO/CFO change, FDA decision, going concern, major litigation
  • Medium — earnings beat/miss, analyst upgrade/downgrade, new product, executive hire below C-suite, contract win, dividend change
  • Low — routine filing, press release, minor operational update, boilerplate disclosure

- immediate: true if the news requires attention within the next trading session (price-moving, time-sensitive)
- notification_worthy: true if an investor holding this stock should be proactively alerted (subset of immediate, but also includes major analyst calls)
- sentiment: market impact on the stock — Bullish (positive), Bearish (negative), Neutral (no clear directional bias)

Return ONLY the JSON object. No markdown, no explanation.`;

async function classifyViaLLM(
  item: FeedItem,
  apiKey: string,
): Promise<ClassificationResult> {
  const cacheKey = await hashKey(item.title + item.rawSnippet);
  const cached = cacheGet<ClassificationResult>('clf', cacheKey);
  if (cached) return cached;

  // Include Benzinga channels as additional context for the LLM
  const channelContext = item.channels?.length
    ? `\nBenzinga channels: ${item.channels.join(', ')}`
    : '';

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
          content: `Title: ${item.title}\nSnippet: ${item.rawSnippet}${channelContext}`,
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

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude response did not contain JSON');

  const raw = JSON.parse(jsonMatch[0]);

  const result: ClassificationResult = {
    materiality: raw.materiality ?? 'Low',
    summary: raw.summary ?? item.title,
    immediate: Boolean(raw.immediate),
    notificationWorthy: Boolean(raw.notification_worthy ?? raw.notificationWorthy),
    sentiment: raw.sentiment ?? 'Neutral',
  };

  if (!['High', 'Medium', 'Low'].includes(result.materiality)) {
    throw new Error(`Invalid materiality: ${result.materiality}`);
  }

  cacheSet('clf', cacheKey, result);
  return result;
}

/**
 * Hybrid classification:
 * 1. Check Benzinga channel fast-path rules first (no API call, ~instant)
 * 2. Fall back to LLM for ambiguous / unlabeled items
 */
export async function classifyItem(
  item: FeedItem,
  apiKey: string,
): Promise<ClassificationResult> {
  // Fast-path: use Benzinga channel rules when available
  if (item.channels?.length) {
    const rule = getFastPathRule(item.channels);
    if (rule) {
      return {
        materiality: rule.materiality,
        summary: item.summary !== item.title ? item.summary : item.title,
        immediate: rule.immediate,
        notificationWorthy: rule.notificationWorthy,
        sentiment: rule.sentiment,
      };
    }
  }

  // LLM path for everything else (SEC filings always go here)
  return classifyViaLLM(item, apiKey);
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
