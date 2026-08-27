import { useState } from 'react';
import type { Deck } from '../types';
import ThesisModal from './ThesisModal';

export async function downloadFile(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

interface Props {
  deck: Deck;
  onDragStart?: (e: React.DragEvent) => void;
  onDelete?: (deck: Deck) => void;
}

function initials(name: string | null) {
  if (!name) return '??';
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DeckCard({ deck, onDragStart, onDelete }: Props) {
  const [showThesis, setShowThesis] = useState(false);
  const creator = deck.deck_creator || 'Unknown';

  return (
    <>
      <div
        draggable
        onDragStart={onDragStart}
        className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing active:opacity-60 active:scale-95 transition-all"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="text-gray-300 cursor-grab">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{deck.company_name || deck.ticker}</p>
              <p className="text-xs text-gray-400">{deck.ticker}</p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-crimson-800 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials(creator)}
          </div>
        </div>

        {/* File preview placeholder */}
        <div className="bg-gray-50 rounded-lg h-24 flex items-center justify-center mb-3">
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
          <span>Uploaded {fmtDate(deck.created_at)}</span>
          <span>{creator}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => setShowThesis(true)}
            className="flex-1 py-1.5 text-xs font-medium text-crimson-700 hover:text-crimson-900 hover:bg-crimson-50 rounded-lg transition-colors"
          >
            Read thesis
          </button>
          {deck.file_url && (
            <button
              onClick={() => downloadFile(deck.file_url!, `${deck.ticker}-deck.${deck.file_url!.split('.').pop()}`)}
              className="flex items-center gap-1 py-1.5 px-3 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => {
                if (window.confirm(`Delete the ${deck.ticker} deck? The classifier will stop watching ${deck.ticker} if this is its only deck.`)) {
                  onDelete(deck);
                }
              }}
              aria-label={`Delete ${deck.ticker} deck`}
              className="py-1.5 px-2 text-xs font-medium text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showThesis && <ThesisModal deck={deck} onClose={() => setShowThesis(false)} />}
    </>
  );
}
