import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { TabFilter } from '../../types';

const TABS: { id: TabFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'filings', label: 'Filings' },
  { id: 'news', label: 'News' },
];

export const TabBar: React.FC = () => {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const feedItems = useAppStore((s) => s.feedItems);
  const isLoading = useAppStore((s) => s.isLoading);
  const lastRefreshed = useAppStore((s) => s.lastRefreshed);

  const counts: Record<TabFilter, number> = {
    all: feedItems.length,
    filings: feedItems.filter((i) => i.type === 'filing').length,
    news: feedItems.filter((i) => i.type === 'news' || i.type === 'capital_iq').length,
  };

  return (
    <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
      <div className="flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
            {counts[tab.id] > 0 && (
              <span
                className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="text-xs text-gray-400 flex items-center gap-2">
        {isLoading && (
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            Fetching…
          </span>
        )}
        {lastRefreshed && !isLoading && (
          <span>Updated {lastRefreshed.toLocaleTimeString()}</span>
        )}
      </div>
    </div>
  );
};
