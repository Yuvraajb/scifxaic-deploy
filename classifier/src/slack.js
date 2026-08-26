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
