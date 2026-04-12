import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FeedItem, WatchlistEntry, TabFilter, ClassificationResult } from '../types';
import { MATERIALITY_ORDER, MAX_FEED_ITEMS } from '../config/constants';

interface AppStore {
  // Watchlist
  watchlist: WatchlistEntry[];
  addTicker: (ticker: string) => void;
  removeTicker: (ticker: string) => void;

  // Feed
  feedItems: FeedItem[];
  upsertFeedItem: (item: FeedItem) => void;
  updateClassification: (id: string, result: ClassificationResult) => void;

  // UI
  activeTab: TabFilter;
  setActiveTab: (tab: TabFilter) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  lastRefreshed: Date | null;
  setLastRefreshed: (d: Date) => void;

  // Errors
  errors: string[];
  addError: (msg: string) => void;
  clearErrors: () => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      // Watchlist
      watchlist: [],
      addTicker: (ticker) =>
        set((s) => {
          const upper = ticker.toUpperCase().trim();
          if (!upper || s.watchlist.some((e) => e.ticker === upper)) return s;
          return { watchlist: [...s.watchlist, { ticker: upper }] };
        }),
      removeTicker: (ticker) =>
        set((s) => ({
          watchlist: s.watchlist.filter((e) => e.ticker !== ticker),
        })),

      // Feed
      feedItems: [],
      upsertFeedItem: (item) =>
        set((s) => {
          const existing = s.feedItems.find((i) => i.id === item.id);
          if (existing) return s; // already tracked
          const updated = [item, ...s.feedItems];
          // Cap at MAX_FEED_ITEMS, evict oldest Low-materiality items first
          if (updated.length > MAX_FEED_ITEMS) {
            const lowIdx = [...updated]
              .reverse()
              .findIndex((i) => i.materiality === 'Low');
            if (lowIdx !== -1) {
              updated.splice(updated.length - 1 - lowIdx, 1);
            } else {
              updated.pop();
            }
          }
          return { feedItems: updated };
        }),
      updateClassification: (id, result) =>
        set((s) => ({
          feedItems: s.feedItems.map((item) =>
            item.id === id
              ? {
                  ...item,
                  materiality: result.materiality,
                  summary: result.summary,
                  immediate: result.immediate,
                  notificationWorthy: result.notificationWorthy,
                  sentiment: result.sentiment,
                  classifiedAt: new Date(),
                }
              : item,
          ),
        })),

      // UI
      activeTab: 'all',
      setActiveTab: (tab) => set({ activeTab: tab }),
      isLoading: false,
      setIsLoading: (v) => set({ isLoading: v }),
      lastRefreshed: null,
      setLastRefreshed: (d) => set({ lastRefreshed: d }),

      // Errors
      errors: [],
      addError: (msg) =>
        set((s) => ({ errors: [...s.errors.slice(-4), msg] })),
      clearErrors: () => set({ errors: [] }),
    }),
    {
      name: 'scifx-store',
      // Only persist watchlist + UI prefs; feed items are ephemeral
      partialize: (s) => ({ watchlist: s.watchlist, activeTab: s.activeTab }),
    },
  ),
);

// Derived selector: sorted + filtered feed items
export function selectFilteredItems(
  feedItems: FeedItem[],
  activeTab: TabFilter,
): FeedItem[] {
  return [...feedItems]
    .filter((item) => {
      if (activeTab === 'filings') return item.type === 'filing';
      if (activeTab === 'news') return item.type === 'news';
      return true;
    })
    .sort((a, b) => {
      const mDiff =
        (MATERIALITY_ORDER[a.materiality] ?? 3) -
        (MATERIALITY_ORDER[b.materiality] ?? 3);
      if (mDiff !== 0) return mDiff;
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    });
}
