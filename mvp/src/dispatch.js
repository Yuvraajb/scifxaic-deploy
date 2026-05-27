import { mkdirSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { db } from './db.js';

const DIR = './overviews';
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

const markDispatched = db.prepare(
  `update articles set dispatched_at = current_timestamp where id = ?`
);

function entryBlock(a) {
  return (
    `## ${a.ticker} — ${a.published_at}\n` +
    `**${a.headline}**\n\n` +
    `${a.rationale || '(no rationale)'}\n\n` +
    `Source: ${a.source} · ${a.url ? `[link](${a.url})` : '(no url)'}\n\n` +
    `---\n\n`
  );
}

// Append one classified article to the appropriate flat file.
// Caller must pass a row already joined with companies.ticker.
export function dispatchOne(article) {
  if (!article || !article.classification) return false;
  if (article.classification === 'HIGH_ALERT') {
    appendFileSync(HIGH_ALERT_FILE, entryBlock(article));
    console.log(`\n═══ HIGH_ALERT  ${article.ticker}  ${article.published_at} ═══`);
    console.log(`  headline: ${article.headline}`);
    console.log(`  rationale: ${article.rationale}`);
    console.log(`  url: ${article.url}\n`);
  } else if (article.classification === 'MONTHLY_OVERVIEW') {
    appendFileSync(MONTHLY_OVERVIEW_FILE, entryBlock(article));
  }
  // IGNORE: no file write; row is still marked dispatched so it isn't reprocessed.
  markDispatched.run(article.id);
  return true;
}

// Sweep any classified-but-not-yet-dispatched rows (backfill on startup).
const pending = db.prepare(`
  select a.*, c.ticker
  from articles a
  join companies c on c.id = a.company_id
  where a.classification is not null
    and a.dispatched_at is null
  order by a.published_at
`);

export function dispatchAll() {
  const rows = pending.all();
  let alerted = 0, appended = 0, ignored = 0;
  for (const a of rows) {
    dispatchOne(a);
    if (a.classification === 'HIGH_ALERT') alerted++;
    else if (a.classification === 'MONTHLY_OVERVIEW') appended++;
    else ignored++;
  }
  console.log(`dispatch done: ${alerted} alerted, ${appended} appended, ${ignored} ignored`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  dispatchAll();
  process.exit(0);
}
