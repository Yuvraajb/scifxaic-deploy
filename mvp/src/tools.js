// Tools for the Classification Agent.
//
// Pattern from langchain_docs/oss/javascript/langchain/tools.md:
//   "The simplest way to create a tool is by importing the `tool` function from
//   the `langchain` package."  Each tool is `tool(handler, { name, description, schema })`,
//   with snake_case names ("Sticking to alphanumeric characters, underscores, and hyphens
//   helps to improve compatibility across providers.").
//
// All four tools share module-level access to `db` and `dispatchOne`. They are
// stateless across calls; per-row state is reconstructed each time by the agent
// passing `article_id`/`ticker` arguments.

import { tool } from 'langchain';
import { z } from 'zod';
import { db } from './db.js';
import { dispatchOne } from './dispatch.js';

// ─── get_thesis(ticker) ───────────────────────────────────────────────────────
const getThesisSql = db.prepare(`
  select t.structured_json, c.ticker, c.name
  from theses t
  join companies c on c.id = t.company_id
  where c.ticker = ? and t.active = 1
`);

export const get_thesis = tool(
  ({ ticker }) => {
    const row = getThesisSql.get(ticker);
    if (!row) {
      return `No active thesis found for ticker ${ticker}.`;
    }
    const parsed = JSON.parse(row.structured_json);
    return {
      ticker: row.ticker,
      company: row.name,
      thesis: parsed,
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
const getRecentSql = db.prepare(`
  select a.id, a.headline, a.classification as label, a.rationale, a.classified_at
  from articles a
  join companies c on c.id = a.company_id
  where c.ticker = ?
    and a.classification is not null
  order by a.classified_at desc
  limit ?
`);

export const get_recent_classifications = tool(
  ({ ticker, limit }) => {
    const n = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 25) : 5;
    const rows = getRecentSql.all(ticker, n);
    if (rows.length === 0) {
      return `No prior classifications for ${ticker}.`;
    }
    return rows.map((r) => ({
      article_id: r.id,
      headline: r.headline,
      label: r.label,
      rationale: r.rationale,
      classified_at: r.classified_at,
    }));
  },
  {
    name: 'get_recent_classifications',
    description:
      'Return the last N classified articles for this ticker, with their labels and rationales. ' +
      'Use this when you want to stay consistent with prior decisions on similar headlines.',
    schema: z.object({
      ticker: z.string().describe('The portfolio ticker, e.g. "NVDA".'),
      limit: z.number().int().optional().describe('Max prior classifications to return. Defaults to 5.'),
    }),
  }
);

// ─── fetch_article_body(article_id) ───────────────────────────────────────────
// Per finnhub_docs/company-news.md the only free-tier news endpoint returns
// headline + summary + url; no body field. newsroom and press-releases fields
// (`fullText`, full description) are Enterprise-gated and return 403 on our key.
// This tool exists for the agent to ASK for a body; it must fail gracefully and
// tell the agent that the only available text is what was passed in.
export const fetch_article_body = tool(
  ({ article_id }) => {
    const row = db
      .prepare('select id, headline, summary, url from articles where id = ?')
      .get(article_id);
    if (!row) {
      return `Article ${article_id} not found in the local database.`;
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
        .describe('Numeric id of the article row in the local database.'),
    }),
  }
);

// ─── classify_article(article_id, label, rationale) ───────────────────────────
const LABELS = ['HIGH_ALERT', 'MONTHLY_OVERVIEW', 'IGNORE'];

const updateClassificationSql = db.prepare(`
  update articles
  set classification = ?, rationale = ?, classified_at = current_timestamp
  where id = ?
`);
const loadFullArticleSql = db.prepare(`
  select a.*, c.ticker
  from articles a
  join companies c on c.id = a.company_id
  where a.id = ?
`);

export const classify_article = tool(
  ({ article_id, label, rationale }) => {
    if (!LABELS.includes(label)) {
      return `Error: invalid label "${label}". Must be one of: ${LABELS.join(', ')}. Call classify_article again with a valid label.`;
    }
    if (!rationale || rationale.trim().length === 0) {
      return `Error: rationale is required. Call classify_article again with a non-empty rationale.`;
    }
    const existing = loadFullArticleSql.get(article_id);
    if (!existing) {
      return `Error: article ${article_id} not found.`;
    }
    if (existing.classification) {
      return `Article ${article_id} was already classified as ${existing.classification}. No-op.`;
    }
    updateClassificationSql.run(label, rationale, article_id);
    const refreshed = loadFullArticleSql.get(article_id);
    // dispatchOne writes to the per-label markdown file immediately and sets dispatched_at.
    dispatchOne({
      ...refreshed,
      classification: label,
      rationale,
    });
    return `Recorded article ${article_id} (${existing.ticker}) as ${label}. You are done; do not call any more tools.`;
  },
  {
    name: 'classify_article',
    description:
      'Record the final classification verdict for an article. ' +
      'This tool writes the label + rationale to the database and appends to the matching markdown file. ' +
      'Call this exactly once per article, as the LAST step of your turn. ' +
      'Valid labels: HIGH_ALERT (material to thesis AND time-sensitive), ' +
      'MONTHLY_OVERVIEW (thesis-relevant but not urgent), ' +
      'IGNORE (not relevant to the thesis).',
    schema: z.object({
      article_id: z.number().int().describe('Numeric id of the article being classified.'),
      label: z
        .enum(['HIGH_ALERT', 'MONTHLY_OVERVIEW', 'IGNORE'])
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
