import type { FeedItem } from '../types';
import { hashKey } from '../utils/cache';

// Capital IQ requires a backend proxy — all calls go through /api/ciq
// which is proxied via vite.config.ts in dev, or a Cloudflare Worker / Express proxy in prod.
// This service is only active when VITE_ENABLE_CAPITAL_IQ=true.

interface CIQNewsItem {
  id: string;
  headline: string;
  body: string;
  publishedDate: string;
  sourceUrl: string;
  subjects: { ticker: string; companyName: string }[];
}

export async function fetchCapitalIQNews(watchlist: string[]): Promise<FeedItem[]> {
  if (!watchlist.length) return [];

  const res = await fetch('/api/ciq/news', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickers: watchlist, limit: 50 }),
  });

  if (!res.ok) {
    throw new Error(`Capital IQ fetch failed: ${res.status} ${res.statusText}`);
  }

  const articles: CIQNewsItem[] = await res.json();
  const items: FeedItem[] = [];

  for (const article of articles) {
    const matched = article.subjects?.find((s) =>
      watchlist.includes(s.ticker.toUpperCase()),
    );
    if (!matched) continue;

    const id = await hashKey(`ciq:${article.id}`);
    items.push({
      id,
      type: 'capital_iq',
      ticker: matched.ticker.toUpperCase(),
      companyName: matched.companyName,
      title: article.headline,
      summary: article.body?.slice(0, 200) || article.headline,
      materiality: 'Pending',
      source: 'Capital IQ',
      publishedAt: new Date(article.publishedDate),
      url: article.sourceUrl,
      rawSnippet: `${article.headline}. ${article.body || ''}`.slice(0, 500),
    });
  }

  return items;
}
