import type { Deck } from '../types';

interface Props {
  deck: Deck;
}

function initials(name: string | null) {
  if (!name) return '??';
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DeckCard({ deck }: Props) {
  const creator = deck.deck_creator || 'Unknown';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
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
      <div className="bg-gray-50 rounded-lg h-28 flex items-center justify-center mb-3">
        <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Uploaded {fmtDate(deck.created_at)}</span>
        <span>{creator}</span>
      </div>

      {deck.thesis && (
        <p className="mt-2 text-xs text-gray-500 line-clamp-2 border-t border-gray-100 pt-2">{deck.thesis}</p>
      )}
    </div>
  );
}
