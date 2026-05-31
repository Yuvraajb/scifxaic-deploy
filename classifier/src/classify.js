// Tool-using Classification Agent.
//
// Sources (all under langchain_docs/oss/javascript/langchain/):
//   - agents.md  → createAgent runtime, systemPrompt, "An agent runs until a stop
//                  condition is met - i.e., when the model emits a final output or
//                  an iteration limit is reached."
//   - tools.md   → tool definitions (see src/tools.js for citation)
//   - models.md  → ChatOpenAI direct instantiation with provider params.
//
// The agent terminates by calling classify_article. If it ends without committing,
// the article stays NULL in the DB and this module records it as IGNORE with a
// "no commit" rationale.

import { config as loadEnv } from 'dotenv';
loadEnv({ override: true });
import { createAgent } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import {
  claimNextPending,
  getArticleClassification,
  markClassification,
  loadFullArticle,
} from './repo.js';
import { tools } from './tools.js';
import { dispatchOne } from './dispatch.js';

const MODEL = process.env.LLM_MODEL || 'gpt-5.5';

const SYSTEM_PROMPT = `You are an equity research analyst working through one news article at a time. The fund holds a small portfolio of companies, each with a written investment thesis. Your job is to decide whether each article is a HIGH_ALERT, a MONTHLY_OVERVIEW, or an IGNORE for the company it concerns, then commit your verdict by calling the classify_article tool.

You have four tools:

1. get_thesis(ticker) — fetch the active structured thesis. CALL THIS FIRST for every article.
2. get_recent_classifications(ticker, limit) — see how you have labeled similar past articles for this ticker. Useful when the headline is ambiguous and you want to stay consistent.
3. fetch_article_body(article_id) — try to pull the full article body. The free Finnhub plan does not expose bodies, so this tool will typically return a message telling you to decide from the headline + summary. Only call it when you genuinely cannot decide from the headline + summary.
4. classify_article(article_id, label, rationale) — record your final verdict. Call this EXACTLY ONCE as the last step of your turn. After you call it, stop.

Label definitions:
- HIGH_ALERT: material to the thesis AND time-sensitive. A human analyst would want to know today.
- MONTHLY_OVERVIEW: thesis-relevant but not urgent. A human analyst would want to read this at month-end.
- IGNORE: not relevant to the thesis.

Always cite the specific thesis element(s) the article touches in your rationale. If you label IGNORE, briefly state "no relevant element" and why.`;

const model = new ChatOpenAI({
  model: MODEL,
  // gpt-5.5 rejects any temperature other than the default (1); omit the field.
  apiKey: process.env.OPENAI_API_KEY,
});

const classificationAgent = createAgent({
  model,
  tools,
  systemPrompt: SYSTEM_PROMPT,
});

function buildUserMessage(row) {
  return `Article to classify:

ticker: ${row.ticker}
article_id: ${row.id}
published_at: ${row.published_at}
url: ${row.url}
headline: ${row.headline}
summary: ${row.summary || '(no summary)'}

Start by calling get_thesis for this ticker. Then decide and call classify_article with your verdict.`;
}

export async function classifyNext() {
  const row = await claimNextPending();
  if (!row) return null;

  try {
    await classificationAgent.invoke({
      messages: [{ role: 'user', content: buildUserMessage(row) }],
    });
  } catch (e) {
    const status = e?.status ?? e?.response?.status;
    const transient =
      status === 401 ||
      status === 403 ||
      status === 429 ||
      (typeof status === 'number' && status >= 500 && status < 600);
    console.error(`classify failed for article ${row.id} (status=${status}):`, e.message);
    if (transient) {
      throw new Error(`transient LLM error (status ${status}); halting this cycle`);
    }
    // Non-transient: record IGNORE so the worklist progresses.
    const rationale = `classification failed: ${e.message}`;
    await markClassification(row.id, 'IGNORE', rationale);
    await dispatchOne({ ...(await loadFullArticle(row.id)) });
    return { ...row, label: 'IGNORE', rationale };
  }

  // The agent terminates by calling classify_article. Verify that happened.
  const post = await getArticleClassification(row.id);
  if (!post || !post.classification) {
    const rationale =
      'Agent terminated without calling classify_article; recording IGNORE so the worklist progresses.';
    console.warn(`article ${row.id}: ${rationale}`);
    await markClassification(row.id, 'IGNORE', rationale);
    await dispatchOne({ ...(await loadFullArticle(row.id)) });
    return { ...row, label: 'IGNORE', rationale };
  }

  return { ...row, label: post.classification, rationale: post.rationale };
}

export async function classifyAllPending() {
  let count = 0;
  while (true) {
    let r;
    try {
      r = await classifyNext();
    } catch (e) {
      console.error('classifyAllPending halted:', e.message);
      break;
    }
    if (!r) break;
    count++;
    console.log(`classified article ${r.id} (${r.ticker}) -> ${r.label}`);
  }
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  classifyAllPending().then((n) => {
    console.log(`done; classified ${n} articles`);
    process.exit(0);
  });
}
