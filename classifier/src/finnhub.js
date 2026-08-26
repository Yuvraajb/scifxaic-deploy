import { config as loadEnv } from 'dotenv';
loadEnv({ override: true });
import axios from 'axios';
import { getActiveCompanies, insertArticle } from './repo.js';
import { isMainModule } from './util.js';

// Per docs/finnhub_docs/company-news.md (free, NA-only):
//   GET /api/v1/company-news?symbol&from&to&token
//   returns array of { id, category, datetime, headline, summary, url, source, related, image }
// Headline + summary + url is all we get on free tier. No body field.
const BASE = 'https://finnhub.io/api/v1';
const KEY = process.env.FINNHUB_API_KEY;
if (!KEY) throw new Error('FINNHUB_API_KEY missing');
const MAX_PER_TICKER = 5;
const FINNHUB_REQUEST_TIMEOUT_MS = 15000;
const FINNHUB_RATE_LIMIT_DELAY_MS = 250;

const ymd = (d) => d.toISOString().slice(0, 10);

async function fetchCompanyNews(ticker, fromDate, toDate) {
  const url = `${BASE}/company-news?symbol=${ticker}&from=${fromDate}&to=${toDate}&token=${KEY}`;
  const res = await axios.get(url, { timeout: FINNHUB_REQUEST_TIMEOUT_MS });
  return res.data ?? [];
}

export async function pollFinnhub() {
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const companies = await getActiveCompanies();

  let inserted = 0;
  for (const c of companies) {
    try {
      const allItems = await fetchCompanyNews(c.ticker, ymd(yesterday), ymd(today));
      // Newest first; take MAX_PER_TICKER.
      const items = [...allItems]
        .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
        .slice(0, MAX_PER_TICKER);
      for (const it of items) {
        const wasInserted = await insertArticle({
          company_id: c.id,
          source: 'finnhub_company_news',
          source_event_id: String(it.id),
          headline: it.headline ?? '(no headline)',
          summary: it.summary ?? '',
          url: it.url ?? '',
          published_at: new Date(it.datetime * 1000).toISOString(),
          raw_json: it, // jsonb column — store the object, not a string
        });
        if (wasInserted) inserted++;
      }
      console.log(`finnhub: ${c.ticker} -> ${allItems.length} returned, ${items.length} kept (cap ${MAX_PER_TICKER})`);
      await new Promise((r) => setTimeout(r, FINNHUB_RATE_LIMIT_DELAY_MS)); // pace under 30 req/s
    } catch (e) {
      console.error(`finnhub error for ${c.ticker}:`, e.message);
    }
  }
  console.log(`finnhub poll done; new articles: ${inserted}`);
  return inserted;
}

if (isMainModule(import.meta.url)) {
  pollFinnhub().then(() => process.exit(0));
}
