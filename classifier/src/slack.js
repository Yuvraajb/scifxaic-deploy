// Slack outbound for the classification worker.
//
// Ported from slack-bot/alerts.py (build_alert_blocks) so the Slack-side
// UX is unchanged. Only HIGH_ALERT articles are posted — the worker is now the
// single source of Slack notifications; the Python bot no longer polls/classifies.
//
// Citations:
//   docs/slack_docs/messaging__sending-and-scheduling-messages.md — outbound posting
//     uses chat.postMessage over the Web API with a chat:write token.
//   docs/slack_docs/apis__events-api__using-socket-mode.md — Socket Mode is only for
//     RECEIVING events; outbound posting needs no app-level token.
//
// The Node 18+ global fetch is used; no extra dependency.

import { config as loadEnv } from 'dotenv';
loadEnv({ override: true });
import { LABELS } from './labels.js';

const SLACK_POST_URL = 'https://slack.com/api/chat.postMessage';

// Map the three-label thesis vocabulary onto a readable Slack badge.
const LABEL_BADGE = {
  [LABELS.HIGH_ALERT]: 'HIGH ALERT',
  [LABELS.MONTHLY_OVERVIEW]: 'MONTHLY OVERVIEW',
  [LABELS.IGNORE]: 'IGNORE',
};

// Format an optional ticker into a Slack string, falling back when absent.
function tickerSuffix(ticker, fallback, format) {
  return ticker ? format(ticker) : fallback;
}

// Build a Slack Block Kit payload for a classified article. Mirrors the block
// structure of the original Python build_alert_blocks().
function buildAlertBlocks(article) {
  const tickerStr = tickerSuffix(article.ticker, '', (t) => ` ($${t})`);
  const badge = LABEL_BADGE[article.classification] || article.classification;
  const blocks = [
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*${article.name || article.ticker}*${tickerStr}` },
        { type: 'mrkdwn', text: `*${badge}*\n_${article.published_at}_` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `:newspaper: *${article.headline}*` },
    },
  ];

  if (article.summary) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `_${article.summary}_` },
    });
  }

  blocks.push(
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `:dart: *Thesis impact:* ${article.rationale || '(no rationale)'}` },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Source: *${article.source || 'News'}*${article.url ? `  •  <${article.url}|link>` : ''}`,
        },
      ],
    },
    { type: 'divider' },
  );
  return blocks;
}

function buildFallbackText(article) {
  const tickerStr = tickerSuffix(article.ticker, '', (t) => ` ($${t})`);
  return (
    `HIGH ALERT — ${article.name || article.ticker}${tickerStr}\n` +
    `${article.headline}\n` +
    `Thesis impact: ${article.rationale || '(no rationale)'}\n` +
    `Source: ${article.source || 'News'}`
  );
}

// Post a HIGH_ALERT article to the configured Slack channel.
// No-op (logs a warning) when SLACK_BOT_TOKEN or SLACK_CHANNEL_ID is missing,
// so local runs without Slack credentials still work.
export async function notifySlack(article) {
  return postToSlack({
    text: buildFallbackText(article),
    blocks: buildAlertBlocks(article),
  });
}

// One markdown line per overview item. Kept compact so many items fit a single
// digest message.
function overviewLine(article) {
  const date = (article.published_at || '').slice(0, 10);
  const ticker = tickerSuffix(article.ticker, '*—*', (t) => `*$${t}*`);
  const link = article.url ? `<${article.url}|${article.headline}>` : article.headline;
  const rationale = article.rationale ? ` — ${article.rationale}` : '';
  return `• \`${date}\` ${ticker}: ${link}${rationale}`;
}

// Slack caps a section's text at 3000 chars and a message at 50 blocks. Pack the
// overview lines into as few section blocks as possible, starting a new section
// before the 3000-char limit so the digest survives any item count.
const SECTION_TEXT_LIMIT = 2900;

function buildMonthlyOverviewBlocks(articles, monthLabel) {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Monthly Overview — ${monthLabel}`, emoji: true },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${articles.length} thesis-relevant item${articles.length === 1 ? '' : 's'} from ${monthLabel}` },
      ],
    },
    { type: 'divider' },
  ];

  let buffer = '';
  for (const article of articles) {
    const line = overviewLine(article);
    if (buffer && buffer.length + line.length + 1 > SECTION_TEXT_LIMIT) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: buffer } });
      buffer = '';
    }
    buffer = buffer ? `${buffer}\n${line}` : line;
  }
  if (buffer) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: buffer } });
  }
  return blocks;
}

// Post the start-of-month digest of the previous month's MONTHLY_OVERVIEW items.
// `monthLabel` is the human month name (e.g. "May 2026"). Caller guarantees a
// non-empty article list.
export async function postMonthlyOverview(articles, monthLabel) {
  return postToSlack({
    text: `Monthly Overview — ${monthLabel}: ${articles.length} item${articles.length === 1 ? '' : 's'}`,
    blocks: buildMonthlyOverviewBlocks(articles, monthLabel),
  });
}

// Marker per label for the cycle outline. IGNORE items are listed too — the
// point of the summary is proving what was scanned, not only what mattered.
const LABEL_MARKER = {
  [LABELS.HIGH_ALERT]: ':red_circle:',
  [LABELS.MONTHLY_OVERVIEW]: ':large_yellow_circle:',
  [LABELS.IGNORE]: ':white_circle:',
};

// Slack mrkdwn requires these three escaped everywhere, and especially inside
// <url|label> links, where a raw & or > corrupts the whole block
// (invalid_blocks). See Slack "Formatting text for app surfaces".
function escapeMrkdwn(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// One outline line per scanned article: marker + linked headline.
function cycleItemLine(item) {
  const raw = item.headline.length > 120 ? `${item.headline.slice(0, 117)}…` : item.headline;
  const headline = escapeMrkdwn(raw);
  const linked = item.url ? `<${item.url}|${headline}>` : headline;
  return `${LABEL_MARKER[item.label] || ':white_circle:'} ${linked}`;
}

// Group the cycle's articles by ticker and pack the lines into section blocks.
// Packing is line-by-line (not group-by-group) so a single busy ticker larger
// than the section limit still splits cleanly instead of producing an
// oversized section that Slack rejects wholesale.
function buildCycleOutlineBlocks(items) {
  const byTicker = new Map();
  for (const item of items) {
    if (!byTicker.has(item.ticker)) byTicker.set(item.ticker, []);
    byTicker.get(item.ticker).push(item);
  }

  const lines = [];
  for (const [ticker, tickerItems] of byTicker) {
    lines.push(`*$${ticker}*`);
    lines.push(...tickerItems.map(cycleItemLine));
    lines.push(''); // blank line between ticker groups
  }
  if (lines[lines.length - 1] === '') lines.pop();

  const blocks = [];
  let buffer = '';
  for (const line of lines) {
    if (buffer && buffer.length + line.length + 1 > SECTION_TEXT_LIMIT) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: buffer } });
      buffer = '';
      if (line === '') continue; // no leading blank line in a fresh section
    }
    buffer = buffer ? `${buffer}\n${line}` : line;
  }
  if (buffer) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: buffer } });
  return blocks;
}

// Post one heartbeat message after every poll cycle, whatever the outcome, so
// the channel shows the pipeline is alive even when nothing was thesis-relevant.
// Header line carries the counts; when articles were scanned, a combined
// outline (grouped by ticker, one linked headline per article) follows in the
// same message.
export async function postCycleSummary({ inserted, classified, byLabel, items = [] }) {
  const parts = [`${inserted} new article${inserted === 1 ? '' : 's'}`];
  if (classified > 0) {
    parts.push(`${byLabel[LABELS.HIGH_ALERT] || 0} HIGH ALERT`);
    parts.push(`${byLabel[LABELS.MONTHLY_OVERVIEW] || 0} monthly`);
    parts.push(`${byLabel[LABELS.IGNORE] || 0} ignored`);
  } else if (inserted === 0) {
    parts.push('nothing new to classify');
  }
  const headline = `:arrows_counterclockwise: News poll — ${parts.join(' · ')}`;

  const blocks = [{ type: 'context', elements: [{ type: 'mrkdwn', text: headline }] }];
  if (items.length > 0) blocks.push(...buildCycleOutlineBlocks(items));

  return postToSlack({ text: headline, blocks });
}

// Shared chat.postMessage call. No-op (logs a warning) when SLACK_BOT_TOKEN or
// SLACK_CHANNEL_ID is missing, so local runs without Slack credentials work.
async function postToSlack({ text, blocks }) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_CHANNEL_ID;
  if (!token || !channel) {
    console.warn('slack: SLACK_BOT_TOKEN or SLACK_CHANNEL_ID not set; skipping post');
    return false;
  }

  try {
    const res = await fetch(SLACK_POST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, text, blocks, unfurl_links: false }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`slack post failed: ${data.error}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('slack post error:', e.message);
    return false;
  }
}
