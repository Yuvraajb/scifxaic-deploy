import type { Deck } from '../types';

interface Props {
  deck: Deck;
  onClose: () => void;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ThesisModal({ deck, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                {deck.ticker}
              </span>
              {deck.sector && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{deck.sector}</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900">{deck.company_name || deck.ticker}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Uploaded {fmtDate(deck.created_at)} · {deck.deck_creator}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Thesis */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Investment Thesis</h3>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {deck.thesis || 'No thesis available.'}
          </p>

          {(deck.investment_maker || deck.thesis_contributors) && (
            <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
              {deck.investment_maker && (
                <div className="flex gap-2 text-sm">
                  <span className="text-gray-400 w-36 shrink-0">Investment maker</span>
                  <span className="text-gray-700">{deck.investment_maker}</span>
                </div>
              )}
              {deck.thesis_contributors && (
                <div className="flex gap-2 text-sm">
                  <span className="text-gray-400 w-36 shrink-0">Thesis contributors</span>
                  <span className="text-gray-700">{deck.thesis_contributors}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 pt-3 border-t border-gray-100 flex items-center justify-between">
          {deck.file_url ? (
            <a
              href={deck.file_url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-crimson-800 hover:bg-crimson-900 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Deck
            </a>
          ) : (
            <span className="text-xs text-gray-400 italic">File not available for download</span>
          )}
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
