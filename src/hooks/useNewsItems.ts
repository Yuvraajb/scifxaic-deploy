import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { fetchBenzingaNews } from '../services/benzingaService';
import { POLL_INTERVAL_MS } from '../config/constants';

export function useNewsItems(benzingaToken: string) {
  const watchlist = useAppStore((s) => s.watchlist);
  const upsertFeedItem = useAppStore((s) => s.upsertFeedItem);
  const addError = useAppStore((s) => s.addError);
  const seenIds = useRef(new Set<string>());

  const tickers = watchlist.map((e) => e.ticker);

  async function poll() {
    if (!tickers.length || !benzingaToken) return;
    try {
      const items = await fetchBenzingaNews(tickers, benzingaToken);
      for (const item of items) {
        if (!seenIds.current.has(item.id)) {
          seenIds.current.add(item.id);
          upsertFeedItem(item);
        }
      }
    } catch (err) {
      addError(`Benzinga News fetch error: ${(err as Error).message}`);
    }
  }

  useEffect(() => {
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(','), benzingaToken]);
}
