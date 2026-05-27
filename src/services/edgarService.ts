import type { FeedItem, FilingType } from '../types';
import { EDGAR_BASE_URL, EDGAR_FILING_TYPES } from '../config/constants';
import { parseAtomFeed } from '../utils/xmlParser';
import { resolveTickerFromCik, matchCompanyNameToWatchlist } from '../utils/tickerMatcher';
import { hashKey } from '../utils/cache';

async function fetchFilingType(type: string): Promise<FeedItem[]> {
  const url = `${EDGAR_BASE_URL}&type=${encodeURIComponent(type)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EDGAR ${type} fetch failed: ${res.status}`);
  const xml = await res.text();
  return parseAtomFeed(xml).map((entry) => ({
    id: '', // filled below
    type: 'filing' as const,
    ticker: null,
    companyName: entry.companyName,
    title: entry.title,
    summary: entry.summary || entry.title,
    materiality: 'Pending' as const,
    filingType: (type as FilingType),
    source: 'SEC EDGAR',
    publishedAt: new Date(entry.updated || Date.now()),
    url: entry.link,
    rawSnippet: `${entry.title}. ${entry.summary}`.slice(0, 500),
    _cik: entry.cik,
    _rawId: entry.id,
  })) as (FeedItem & { _cik: string; _rawId: string })[];
}

export async function fetchEdgarFilings(watchlist: string[]): Promise<FeedItem[]> {
  const results: FeedItem[] = [];

  for (const type of EDGAR_FILING_TYPES) {
    try {
      const raw = await fetchFilingType(type) as (FeedItem & { _cik: string; _rawId: string })[];

      for (const item of raw) {
        // Try to match ticker
        let ticker = matchCompanyNameToWatchlist(item.companyName, watchlist);
        if (!ticker && item._cik) {
          ticker = await resolveTickerFromCik(item._cik, watchlist);
        }
        if (!ticker) continue; // not in watchlist

        const id = await hashKey(item._rawId || item.url);
        results.push({ ...item, id, ticker });
      }
    } catch (err) {
      console.warn(`EDGAR fetch error for ${type}:`, err);
    }
  }

  return results;
}
