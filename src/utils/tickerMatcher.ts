import { localGet, localSet } from './cache';
import { EDGAR_SUBMISSIONS_URL, CIK_CACHE_TTL_MS } from '../config/constants';

// Cache of CIK → tickers[]
const cikToTickersCache = new Map<string, string[]>();

export async function getTickersForCik(cik: string): Promise<string[]> {
  if (!cik) return [];
  const padded = cik.padStart(10, '0');

  // In-memory first
  if (cikToTickersCache.has(padded)) return cikToTickersCache.get(padded)!;

  // localStorage cache
  const cached = localGet<string[]>('cik', padded, CIK_CACHE_TTL_MS);
  if (cached) {
    cikToTickersCache.set(padded, cached);
    return cached;
  }

  try {
    const res = await fetch(`${EDGAR_SUBMISSIONS_URL}${padded}.json`);
    if (!res.ok) return [];
    const data = await res.json();
    const tickers: string[] = (data.tickers ?? []).map((t: string) =>
      t.toUpperCase(),
    );
    cikToTickersCache.set(padded, tickers);
    localSet('cik', padded, tickers, CIK_CACHE_TTL_MS);
    return tickers;
  } catch {
    return [];
  }
}

export function matchCompanyNameToWatchlist(
  companyName: string,
  watchlist: string[],
): string | null {
  const nameLower = companyName.toLowerCase();
  for (const ticker of watchlist) {
    // Exact ticker mention in company name (e.g. "AAPL INC")
    if (nameLower.includes(ticker.toLowerCase())) return ticker;
  }
  return null;
}

export async function resolveTickerFromCik(
  cik: string,
  watchlist: string[],
): Promise<string | null> {
  const tickers = await getTickersForCik(cik);
  for (const t of tickers) {
    if (watchlist.includes(t.toUpperCase())) return t.toUpperCase();
  }
  return null;
}
