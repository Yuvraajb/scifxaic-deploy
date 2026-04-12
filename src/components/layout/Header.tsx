import React from 'react';
import { WatchlistInput } from '../watchlist/WatchlistInput';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  onOpenSettings: () => void;
}

export const Header: React.FC<Props> = ({ onOpenSettings }) => {
  const errors = useAppStore((s) => s.errors);
  const clearErrors = useAppStore((s) => s.clearErrors);

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-4 shadow-sm">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                SciFX Alert Dashboard
              </h1>
              <p className="text-xs text-gray-400">SEC Filings · Financial News · AI Classification</p>
            </div>
          </div>
          <button
            onClick={onOpenSettings}
            className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
          >
            ⚙ API Keys
          </button>
        </div>

        <WatchlistInput />

        {errors.length > 0 && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
            <div className="text-xs text-red-600 space-y-0.5">
              {errors.map((e, i) => (
                <p key={i}>{e}</p>
              ))}
            </div>
            <button
              onClick={clearErrors}
              className="text-red-400 hover:text-red-600 text-sm leading-none shrink-0"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
