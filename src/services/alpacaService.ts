import type { FeedItem } from '../types';
import { ALPACA_NEWS_URL } from '../config/constants';
import { hashKey } from '../utils/cache';

interface AlpacaArticle {
  id: number;
  headline: string;
  summary: string;
  author: string;
  created_at: string;
  updated_at: string;
  url: string;
  symbols: string[];
  source: string;
}

export async function fetchAlpacaNews(
  watchlist: string[],
  apiKey: string,
  apiSecret: string,
): Promise<FeedItem[]> {
  if (!watchlist.length || !apiKey) return [];

  // Batch up to 50 tickers per request
  const symbols = watchlist.slice(0, 50).join(',');
  const url = `${ALPACA_NEWS_URL}?symbols=${encodeURIComponent(symbols)}&limit=50&sort=desc`;

  const res = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': apiSecret,
    },
  });

  if (!res.ok) {
    throw new Error(`Alpaca News fetch failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const articles: AlpacaArticle[] = data.news ?? data ?? [];

  const items: FeedItem[] = [];
  for (const article of articles) {
    const matchedTicker =
      article.symbols?.find((s) => watchlist.includes(s.toUpperCase())) ?? null;
    if (!matchedTicker) continue;

    const id = await hashKey(`alpaca:${article.id}`);
    items.push({
      id,
      type: 'news',
      ticker: matchedTicker.toUpperCase(),
      companyName: matchedTicker.toUpperCase(),
      title: article.headline,
      summary: article.summary || article.headline,
      materiality: 'Pending',
      source: `Alpaca / ${article.source}`,
      publishedAt: new Date(article.created_at),
      url: article.url,
      rawSnippet: `${article.headline}. ${article.summary}`.slice(0, 500),
    });
  }

  return items;
}
