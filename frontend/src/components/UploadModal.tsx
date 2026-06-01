import { useState, useRef, useCallback } from 'react';
import { uploadDeck } from '../lib/api';
import { SECTORS } from '../types';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ onClose, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [ticker, setTicker] = useState('');
  const [sector, setSector] = useState<string>(SECTORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('companyName', companyName);
      fd.append('ticker', ticker);
      fd.append('sector', sector);
      await uploadDeck(fd);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h2 className="text-xl font-bold text-gray-900">Upload Slide Deck</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-crimson-400 bg-crimson-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex justify-center mb-3">
              <div className="w-12 h-12 bg-crimson-50 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-crimson-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                </svg>
              </div>
            </div>
            {file ? (
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">Drop your .pptx or .pdf here</p>
                <p className="text-xs text-gray-400 mt-1">or click to browse</p>
              </>
            )}
            <button
              type="button"
              className="mt-3 px-4 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 font-medium"
            >
              Browse Files
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.pptx"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
            />
          </div>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., Acme Corp"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-crimson-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ticker Symbol</label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="e.g., ACME"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-crimson-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sector</label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-crimson-300 bg-white"
            >
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || loading}
              className="flex-1 py-3 bg-crimson-700 hover:bg-crimson-800 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {loading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
