import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { WatchlistChip } from './WatchlistChip';

export const WatchlistInput: React.FC = () => {
  const watchlist = useAppStore((s) => s.watchlist);
  const addTicker = useAppStore((s) => s.addTicker);
  const removeTicker = useAppStore((s) => s.removeTicker);
  const [input, setInput] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parts = input.split(/[,\s]+/).filter(Boolean);
    parts.forEach((t) => addTicker(t));
    setInput('');
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add tickers (e.g. AAPL, MSFT, TSLA)"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        />
        <button
          type="submit"
          className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          Add
        </button>
      </form>
      {watchlist.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {watchlist.map((e) => (
            <WatchlistChip key={e.ticker} ticker={e.ticker} onRemove={removeTicker} />
          ))}
        </div>
      )}
    </div>
  );
};
