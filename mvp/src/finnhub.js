import { config as loadEnv } from 'dotenv';
loadEnv({ override: true });
import axios from 'axios';
import { db } from './db.js';

// Per finnhub_docs/company-news.md (free, NA-only):
//   GET /api/v1/company-news?symbol&from&to&token
//   returns array of { id, category, datetime, headline, summary, url, source, related, image }
// Headline + summary + url is all we get on free tier. No body field.
const BASE = 'https://finnhub.io/api/v1';
const KEY = process.env.FINNHUB_API_KEY;
if (!KEY) throw new Error('FINNHUB_API_KEY missing');
const MAX_PER_TICKER = 5;

const ymd = (d) => d.toISOString().slice(0, 10);

async function fetchCompanyNews(ticker, fromDate, toDate) {
  const url = `${BASE}/company-news?symbol=${ticker}&from=${fromDate}&to=${toDate}&token=${KEY}`;
  const res = await axios.get(url, { timeout: 15000 });
  return res.data ?? [];
}

const insertArticle = db.prepare(`
  insert or ignore into articles
    (company_id, source, source_event_id, headline, summary, url, published_at, raw_json)
  values (?, 'finnhub_company_news', ?, ?, ?, ?, ?, ?)
`);

export async function pollFinnhub() {
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const tickers = db
    .prepare('select id, ticker from companies where active = 1')
    .all();

  let inserted = 0;
  for (const c of tickers) {
    try {
      const allItems = await fetchCompanyNews(c.ticker, ymd(yesterday), ymd(today));
      // Newest first; take MAX_PER_TICKER.
      const items = [...allItems]
        .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
        .slice(0, MAX_PER_TICKER);
      for (const it of items) {
        const result = insertArticle.run(
          c.id,
          String(it.id),
          it.headline ?? '(no headline)',
          it.summary ?? '',
          it.url ?? '',
          new Date(it.datetime * 1000).toISOString(),
          JSON.stringify(it)
        );
        if (result.changes > 0) inserted++;
      }
      console.log(`finnhub: ${c.ticker} -> ${allItems.length} returned, ${items.length} kept (cap ${MAX_PER_TICKER})`);
      await new Promise((r) => setTimeout(r, 250)); // pace under 30 req/s
    } catch (e) {
      console.error(`finnhub error for ${c.ticker}:`, e.message);
    }
  }
  console.log(`finnhub poll done; new articles: ${inserted}`);
  return inserted;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  pollFinnhub().then(() => process.exit(0));
}
