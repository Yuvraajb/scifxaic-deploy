import React from 'react';

interface Props {
  ticker: string;
  onRemove: (ticker: string) => void;
}

export const WatchlistChip: React.FC<Props> = ({ ticker, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
    {ticker}
    <button
      onClick={() => onRemove(ticker)}
      className="ml-0.5 text-blue-500 hover:text-blue-800 transition-colors leading-none"
      aria-label={`Remove ${ticker}`}
    >
      ×
    </button>
  </span>
);
