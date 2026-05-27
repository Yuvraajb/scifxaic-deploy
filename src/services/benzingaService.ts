import type { FeedItem } from '../types';
import { BENZINGA_NEWS_URL } from '../config/constants';
import { hashKey } from '../utils/cache';

interface BenzingaArticle {
  id: string;
  author: string;
  created: string;
  updated: string;
  title: string;
  teaser: string;
  body?: string;
  url: string;
  channels: { name: string }[];
  stocks: { name: string; exchange?: string }[];
  tags: { name: string }[];
}

interface BenzingaResponse {
  // Benzinga v2 returns an array directly or wraps in `results`
  results?: BenzingaArticle[];
}

export async function fetchBenzingaNews(
  watchlist: string[],
  apiToken: string,
): Promise<FeedItem[]> {
  if (!watchlist.length || !apiToken) return [];

  // Benzinga accepts comma-separated tickers via `tickers` param
  const params = new URLSearchParams({
    token: apiToken,
    tickers: watchlist.slice(0, 50).join(','),
    pageSize: '50',
    displayOutput: 'full',
    sort: 'created:desc',
  });

  const res = await fetch(`${BENZINGA_NEWS_URL}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Benzinga News fetch failed: ${res.status} ${res.statusText}`);
  }

  const data: BenzingaArticle[] | BenzingaResponse = await res.json();
  const articles: BenzingaArticle[] = Array.isArray(data)
    ? data
    : (data as BenzingaResponse).results ?? [];

  const items: FeedItem[] = [];

  for (const article of articles) {
    // Match at least one watchlist ticker
    const matchedTicker =
      article.stocks?.find((s) =>
        watchlist.includes(s.name?.toUpperCase()),
      )?.name?.toUpperCase() ?? null;

    if (!matchedTicker) continue;

    const channels = article.channels?.map((c) => c.name) ?? [];
    const snippet = `${article.title}. ${article.teaser || ''}`.slice(0, 500);
    const id = await hashKey(`benzinga:${article.id}`);

    items.push({
      id,
      type: 'news',
      ticker: matchedTicker,
      companyName: matchedTicker,
      title: article.title,
      summary: article.teaser || article.title,
      materiality: 'Pending',
      sentiment: 'Pending',
      immediate: false,
      notificationWorthy: false,
      channels,
      source: 'Benzinga',
      publishedAt: new Date(article.created),
      url: article.url,
      rawSnippet: snippet,
    });
  }

  return items;
}
