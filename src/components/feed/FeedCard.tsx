import React from 'react';
import type { FeedItem } from '../../types';
import { MaterialityBadge } from './MaterialityBadge';
import { timeAgo } from '../../utils/formatTime';

const SOURCE_COLORS: Record<string, string> = {
  'SEC EDGAR': 'bg-indigo-50 text-indigo-700',
  'Capital IQ': 'bg-purple-50 text-purple-700',
};

function sourceColor(source: string) {
  for (const key of Object.keys(SOURCE_COLORS)) {
    if (source.startsWith(key)) return SOURCE_COLORS[key];
  }
  return 'bg-slate-50 text-slate-600';
}

interface Props {
  item: FeedItem;
}

export const FeedCard: React.FC<Props> = React.memo(({ item }) => {
  const borderColor =
    item.materiality === 'High'
      ? 'border-l-red-400'
      : item.materiality === 'Medium'
        ? 'border-l-yellow-400'
        : item.materiality === 'Low'
          ? 'border-l-green-400'
          : 'border-l-gray-300';

  return (
    <article
      className={`bg-white rounded-xl border border-gray-200 border-l-4 ${borderColor} p-4 shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Top row: ticker + type tag + source + time */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {item.ticker && (
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {item.ticker}
              </span>
            )}
            {item.filingType && (
              <span className="text-xs font-semibold text-white bg-indigo-600 px-2 py-0.5 rounded">
                {item.filingType}
              </span>
            )}
            {item.type === 'news' || item.type === 'capital_iq' ? (
              <span className="text-xs font-semibold text-white bg-emerald-600 px-2 py-0.5 rounded">
                NEWS
              </span>
            ) : null}
            <span className={`text-xs px-2 py-0.5 rounded ${sourceColor(item.source)}`}>
              {item.source}
            </span>
            <span className="text-xs text-gray-400 ml-auto">
              {timeAgo(item.publishedAt)}
            </span>
          </div>

          {/* Company name */}
          <p className="text-xs text-gray-500 font-medium mb-0.5">{item.companyName}</p>

          {/* Title */}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-gray-900 hover:text-blue-700 transition-colors line-clamp-2 block mb-1"
          >
            {item.title}
          </a>

          {/* Summary */}
          <p className="text-sm text-gray-600 line-clamp-2">{item.summary}</p>
        </div>

        {/* Materiality badge */}
        <div className="shrink-0">
          <MaterialityBadge level={item.materiality} />
        </div>
      </div>
    </article>
  );
});

FeedCard.displayName = 'FeedCard';
