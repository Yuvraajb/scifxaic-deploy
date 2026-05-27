import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { fetchEdgarFilings } from '../services/edgarService';
import { POLL_INTERVAL_MS } from '../config/constants';

export function useSECFilings() {
  const watchlist = useAppStore((s) => s.watchlist);
  const upsertFeedItem = useAppStore((s) => s.upsertFeedItem);
  const setIsLoading = useAppStore((s) => s.setIsLoading);
  const setLastRefreshed = useAppStore((s) => s.setLastRefreshed);
  const addError = useAppStore((s) => s.addError);
  const seenIds = useRef(new Set<string>());

  const tickers = watchlist.map((e) => e.ticker);

  async function poll() {
    if (!tickers.length) return;
    setIsLoading(true);
    try {
      const items = await fetchEdgarFilings(tickers);
      for (const item of items) {
        if (!seenIds.current.has(item.id)) {
          seenIds.current.add(item.id);
          upsertFeedItem(item);
        }
      }
      setLastRefreshed(new Date());
    } catch (err) {
      addError(`SEC EDGAR fetch error: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(',')]);
}
