import React, { useState } from 'react';

interface Props {
  onSave: (keys: {
    anthropicKey: string;
    alpacaKey: string;
    alpacaSecret: string;
  }) => void;
}

export const APIKeyModal: React.FC<Props> = ({ onSave }) => {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [alpacaKey, setAlpacaKey] = useState('');
  const [alpacaSecret, setAlpacaSecret] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ anthropicKey, alpacaKey, alpacaSecret });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">API Keys Required</h2>
        <p className="text-sm text-gray-500 mb-5">
          Enter your API keys to start fetching news and classifying filings. Keys are stored in
          sessionStorage only and cleared when you close the tab.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anthropic API Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-..."
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alpaca API Key ID
              <span className="text-gray-400 font-normal"> (for news)</span>
            </label>
            <input
              type="password"
              value={alpacaKey}
              onChange={(e) => setAlpacaKey(e.target.value)}
              placeholder="PKXXXXXXXX"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alpaca Secret Key
            </label>
            <input
              type="password"
              value={alpacaSecret}
              onChange={(e) => setAlpacaSecret(e.target.value)}
              placeholder="XXXXXXXX"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save &amp; Continue
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-4 text-center">
          SEC EDGAR filings work without any keys. Only news + LLM classification require API keys.
        </p>
      </div>
    </div>
  );
};
