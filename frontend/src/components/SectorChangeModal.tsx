interface Props {
  deckTicker: string;
  fromSector: string;
  toSector: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SectorChangeModal({ deckTicker, fromSector, toSector, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
        </div>

        <h2 className="text-lg font-bold text-gray-900 text-center mb-2">Change Sector?</h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          Moving <span className="font-semibold text-gray-800">{deckTicker}</span> from{' '}
          <span className="font-semibold text-gray-800">{fromSector}</span> to{' '}
          <span className="font-semibold text-crimson-700">{toSector}</span>. This will update the record permanently.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-crimson-800 hover:bg-crimson-900 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Move it
          </button>
        </div>
      </div>
    </div>
  );
}
