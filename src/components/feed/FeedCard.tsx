import React from 'react';
import type { FeedItem, Sentiment } from '../../types';
import { MaterialityBadge } from './MaterialityBadge';
import { timeAgo } from '../../utils/formatTime';

const SENTIMENT_CONFIG: Record<Sentiment, { label: string; className: string }> = {
  Bullish:  { label: '▲ Bullish',  className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  Bearish:  { label: '▼ Bearish',  className: 'bg-red-50    text-red-700    border border-red-200'     },
  Neutral:  { label: '→ Neutral',  className: 'bg-gray-50   text-gray-500   border border-gray-200'   },
  Pending:  { label: '…',          className: 'bg-gray-50   text-gray-400   border border-gray-200'   },
};

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

  const sentiment = SENTIMENT_CONFIG[item.sentiment];

  return (
    <article
      className={`bg-white rounded-xl border border-gray-200 border-l-4 ${borderColor} p-4 shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">

          {/* Top row: ticker + type + source + time */}
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
            {item.type === 'news' && (
              <span className="text-xs font-semibold text-white bg-emerald-600 px-2 py-0.5 rounded">
                NEWS
              </span>
            )}
            {item.channels?.slice(0, 2).map((ch) => (
              <span key={ch} className="text-xs px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">
                {ch}
              </span>
            ))}
            <span className="text-xs text-gray-400 ml-auto shrink-0">
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
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">{item.summary}</p>

          {/* Bottom row: sentiment + immediate + notification */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sentiment.className}`}>
              {sentiment.label}
            </span>

            {item.immediate && item.materiality !== 'Pending' && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-50 text-orange-700 border border-orange-200">
                ⚡ Immediate
              </span>
            )}

            {item.notificationWorthy && item.materiality !== 'Pending' && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 border border-blue-200">
                🔔 Alert
              </span>
            )}

            <span className="text-xs text-gray-400 ml-auto">{item.source}</span>
          </div>
        </div>

        {/* Materiality badge */}
        <div className="shrink-0 pt-0.5">
          <MaterialityBadge level={item.materiality} />
        </div>
      </div>
    </article>
  );
});

FeedCard.displayName = 'FeedCard';
