// Tools for the Classification Agent.
//
// Pattern from docs/langchain_docs/oss/javascript/langchain/tools.md:
//   "The simplest way to create a tool is by importing the `tool` function from
//   the `langchain` package."  Each tool is `tool(handler, { name, description, schema })`,
//   with snake_case names ("Sticking to alphanumeric characters, underscores, and hyphens
//   helps to improve compatibility across providers.").
//
// Handlers are async because the backing store is Supabase (network calls).
// Per-row state is reconstructed each call from the article_id/ticker arguments.

import { tool } from 'langchain';
import { z } from 'zod';
import {
  getThesis,
  getRecentClassifications,
  getArticleBasic,
  loadFullArticle,
  getArticleClassification,
  markClassification,
} from './repo.js';
import { dispatchOne } from './dispatch.js';
import { LABEL_VALUES } from './labels.js';

const DEFAULT_RECENT_LIMIT = 5;
const MAX_RECENT_LIMIT = 25;

// ─── get_thesis(ticker) ───────────────────────────────────────────────────────
export const get_thesis = tool(
  async ({ ticker }) => {
    const result = await getThesis(ticker);
    if (!result) {
      return `No active thesis found for ticker ${ticker}.`;
    }
    return {
      ticker: result.ticker,
      company: result.name,
      thesis: result.thesis,
    };
  },
  {
    name: 'get_thesis',
    description:
      "Fetch the fund's active structured investment thesis for a portfolio ticker. " +
      'Returns growth_drivers, risks, catalysts, valuation_assumptions, and key_metrics. ' +
      'Call this first before classifying any article.',
    schema: z.object({
      ticker: z.string().describe('The portfolio ticker, e.g. "NVDA".'),
    }),
  }
);

// ─── get_recent_classifications(ticker, limit) ────────────────────────────────
export const get_recent_classifications = tool(
  async ({ ticker, limit }) => {
    const n = Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_RECENT_LIMIT) : DEFAULT_RECENT_LIMIT;
    const rows = await getRecentClassifications(ticker, n);
    if (rows.length === 0) {
      return `No prior classifications for ${ticker}.`;
    }
    return rows;
  },
  {
    name: 'get_recent_classifications',
    description:
      'Return the last N classified articles for this ticker, with their labels and rationales. ' +
      'Use this when you want to stay consistent with prior decisions on similar headlines.',
    schema: z.object({
      ticker: z.string().describe('The portfolio ticker, e.g. "NVDA".'),
      limit: z.number().int().optional().describe(`Max prior classifications to return. Defaults to ${DEFAULT_RECENT_LIMIT}.`),
    }),
  }
);

// ─── fetch_article_body(article_id) ───────────────────────────────────────────
// Per docs/finnhub_docs/company-news.md the only free-tier news endpoint returns
// headline + summary + url; no body field. This tool exists for the agent to
// ASK for a body; it fails gracefully and tells the agent to decide from the
// headline + summary already provided.
export const fetch_article_body = tool(
  async ({ article_id }) => {
    const row = await getArticleBasic(article_id);
    if (!row) {
      return `Article ${article_id} not found in the database.`;
    }
    return (
      `Full article body is not available on the current Finnhub plan. ` +
      `Decide based on the headline and summary already provided in the user message. ` +
      `(Article ${article_id}: "${row.headline}"; url: ${row.url || 'n/a'})`
    );
  },
  {
    name: 'fetch_article_body',
    description:
      'Attempt to fetch the full article body for an article. ' +
      'NOTE: the body is not available on the current Finnhub plan, so this tool will ' +
      'usually return a message saying so. Only call it when headline + summary are ' +
      'genuinely ambiguous and you want to confirm body access before deciding.',
    schema: z.object({
      article_id: z
        .number()
        .int()
        .describe('Numeric id of the article row in the database.'),
    }),
  }
);

// ─── classify_article(article_id, label, rationale) ───────────────────────────
export const classify_article = tool(
  async ({ article_id, label, rationale }) => {
    if (!LABEL_VALUES.includes(label)) {
      return `Error: invalid label "${label}". Must be one of: ${LABEL_VALUES.join(', ')}. Call classify_article again with a valid label.`;
    }
    if (!rationale || rationale.trim().length === 0) {
      return `Error: rationale is required. Call classify_article again with a non-empty rationale.`;
    }
    const existing = await loadFullArticle(article_id);
    if (!existing) {
      return `Error: article ${article_id} not found.`;
    }
    if (existing.classification) {
      return `Article ${article_id} was already classified as ${existing.classification}. No-op.`;
    }
    await markClassification(article_id, label, rationale);
    // dispatchOne posts HIGH_ALERT to Slack, writes the audit log, and sets
    // dispatched_at — all in one step.
    await dispatchOne({ ...existing, classification: label, rationale });
    return `Recorded article ${article_id} (${existing.ticker}) as ${label}. You are done; do not call any more tools.`;
  },
  {
    name: 'classify_article',
    description:
      'Record the final classification verdict for an article. ' +
      'This tool writes the label + rationale to the database and dispatches the result. ' +
      'Call this exactly once per article, as the LAST step of your turn. ' +
      'Valid labels: HIGH_ALERT (material to thesis AND time-sensitive), ' +
      'MONTHLY_OVERVIEW (thesis-relevant but not urgent), ' +
      'IGNORE (not relevant to the thesis).',
    schema: z.object({
      article_id: z.number().int().describe('Numeric id of the article being classified.'),
      label: z
        .enum(LABEL_VALUES)
        .describe('The classification verdict.'),
      rationale: z
        .string()
        .describe(
          "1-3 sentences citing the specific thesis element(s) the article touches, or stating 'no relevant element' when the label is IGNORE."
        ),
    }),
  }
);

export const tools = [
  get_thesis,
  get_recent_classifications,
  fetch_article_body,
  classify_article,
];
