import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { fetchCapitalIQNews } from '../services/capitalIQService';
import { POLL_INTERVAL_MS } from '../config/constants';

const ENABLED = import.meta.env.VITE_ENABLE_CAPITAL_IQ === 'true';

export function useCapitalIQ() {
  const watchlist = useAppStore((s) => s.watchlist);
  const upsertFeedItem = useAppStore((s) => s.upsertFeedItem);
  const addError = useAppStore((s) => s.addError);
  const seenIds = useRef(new Set<string>());

  const tickers = watchlist.map((e) => e.ticker);

  async function poll() {
    if (!ENABLED || !tickers.length) return;
    try {
      const items = await fetchCapitalIQNews(tickers);
      for (const item of items) {
        if (!seenIds.current.has(item.id)) {
          seenIds.current.add(item.id);
          upsertFeedItem(item);
        }
      }
    } catch (err) {
      addError(`Capital IQ fetch error: ${(err as Error).message}`);
    }
  }

  useEffect(() => {
    if (!ENABLED) return;
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(',')]);
}
