// Per-cycle dispatch of a classified article:
//   HIGH_ALERT -> append to the local markdown audit log + post to Slack
//   IGNORE     -> nothing visible
//   always     -> mark the row dispatched in Supabase
//
// MONTHLY_OVERVIEW is intentionally NOT handled here. Those rows stay pending
// (dispatched_at null) and are batched into a start-of-month Slack digest by
// monthly.js, which reuses appendOverviewAudit() below for the markdown trail.
//
// The markdown files are a human-readable local trail; on an ephemeral Render
// filesystem they are best-effort and never block dispatch. Supabase is the
// durable source of truth.

import { mkdirSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { markDispatched, getPendingDispatch } from './repo.js';
import { notifySlack } from './slack.js';
import { LABELS } from './labels.js';
import { isMainModule } from './util.js';

// Anchor to the module's own location so the audit log always lands in the
// repo-root overviews/ regardless of the process cwd (standalone vs. embedded).
const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'overviews');
const HIGH_ALERT_FILE = `${DIR}/HIGH_ALERTS.md`;
const MONTHLY_OVERVIEW_FILE = `${DIR}/MONTHLY_OVERVIEWS.md`;

mkdirSync(DIR, { recursive: true });
if (!existsSync(HIGH_ALERT_FILE)) {
  writeFileSync(
    HIGH_ALERT_FILE,
    '# HIGH_ALERTS\n\nLive log. Each entry written immediately when the agent classifies an article HIGH_ALERT.\n\n---\n\n'
  );
}
if (!existsSync(MONTHLY_OVERVIEW_FILE)) {
  writeFileSync(
    MONTHLY_OVERVIEW_FILE,
    '# MONTHLY_OVERVIEWS\n\nLive log. Each entry written immediately when the agent classifies an article MONTHLY_OVERVIEW.\n\n---\n\n'
  );
}

function entryBlock(a) {
  return (
    `## ${a.ticker} — ${a.published_at}\n` +
    `**${a.headline}**\n\n` +
    `${a.rationale || '(no rationale)'}\n\n` +
    `Source: ${a.source} · ${a.url ? `[link](${a.url})` : '(no url)'}\n\n` +
    `---\n\n`
  );
}

// Best-effort local markdown append; never throws into the caller.
function appendAudit(file, article) {
  try {
    appendFileSync(file, entryBlock(article));
  } catch (e) {
    console.warn(`audit-log write failed (${file}):`, e.message);
  }
}

// Append a MONTHLY_OVERVIEW item to its audit log. Called by monthly.js when the
// start-of-month digest is sent, so the markdown trail mirrors what reached Slack.
export function appendOverviewAudit(article) {
  appendAudit(MONTHLY_OVERVIEW_FILE, article);
}

// Dispatch one classified article. Caller must pass a row already joined with
// companies.ticker. Returns true once the row is marked dispatched, false if it
// was left pending (MONTHLY_OVERVIEW is handled by monthly.js instead).
export async function dispatchOne(article) {
  if (!article || !article.classification) return false;

  // MONTHLY_OVERVIEW is not dispatched per cycle; leave it pending so monthly.js
  // can batch it into the start-of-month digest.
  if (article.classification === LABELS.MONTHLY_OVERVIEW) return false;

  if (article.classification === LABELS.HIGH_ALERT) {
    appendAudit(HIGH_ALERT_FILE, article);
    await notifySlack(article);
    console.log(`\n═══ HIGH_ALERT  ${article.ticker}  ${article.published_at} ═══`);
    console.log(`  headline: ${article.headline}`);
    console.log(`  rationale: ${article.rationale}`);
    console.log(`  url: ${article.url}\n`);
  }
  // IGNORE: no audit write, no Slack; still marked dispatched so it isn't reprocessed.

  await markDispatched(article.id);
  return true;
}

// Sweep classified-but-not-yet-dispatched rows (backfill on startup).
// getPendingDispatch excludes MONTHLY_OVERVIEW, so this only sees HIGH_ALERT
// and IGNORE.
export async function dispatchAll() {
  const rows = await getPendingDispatch();
  let alerted = 0, ignored = 0;
  for (const a of rows) {
    await dispatchOne(a);
    if (a.classification === LABELS.HIGH_ALERT) alerted++;
    else ignored++;
  }
  console.log(`dispatch done: ${alerted} alerted, ${ignored} ignored`);
}

if (isMainModule(import.meta.url)) {
  dispatchAll().then(() => process.exit(0));
}
