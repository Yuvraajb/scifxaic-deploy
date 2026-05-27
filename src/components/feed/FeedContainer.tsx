import React from 'react';
import { useAppStore, selectFilteredItems } from '../../store/useAppStore';
import { FeedCard } from './FeedCard';
import { LoadingSkeleton } from './LoadingSkeleton';

export const FeedContainer: React.FC = () => {
  const feedItems = useAppStore((s) => s.feedItems);
  const activeTab = useAppStore((s) => s.activeTab);
  const isLoading = useAppStore((s) => s.isLoading);
  const watchlist = useAppStore((s) => s.watchlist);

  const items = selectFilteredItems(feedItems, activeTab);

  if (isLoading && items.length === 0) {
    return <LoadingSkeleton />;
  }

  if (watchlist.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-lg font-medium">Add tickers to your watchlist</p>
        <p className="text-sm mt-1">Enter stock symbols above to start monitoring filings and news</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">🔍</p>
        <p className="text-lg font-medium">No recent items found</p>
        <p className="text-sm mt-1">No filings or news for your watchlist yet — check back soon</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <FeedCard key={item.id} item={item} />
      ))}
    </div>
  );
};
