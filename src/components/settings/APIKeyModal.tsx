import React, { useState } from 'react';

interface Props {
  onSave: (keys: { anthropicKey: string; benzingaToken: string }) => void;
}

export const APIKeyModal: React.FC<Props> = ({ onSave }) => {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [benzingaToken, setBenzingaToken] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ anthropicKey, benzingaToken });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-1">API Keys Required</h2>
        <p className="text-sm text-gray-500 mb-5">
          Enter your API keys to start fetching news and classifying filings.
          Keys are stored in sessionStorage only and cleared when you close the tab.
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
            <p className="text-xs text-gray-400 mt-1">Used for AI materiality + sentiment classification</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Benzinga API Token
              <span className="text-gray-400 font-normal"> (for financial news)</span>
            </label>
            <input
              type="password"
              value={benzingaToken}
              onChange={(e) => setBenzingaToken(e.target.value)}
              placeholder="your-benzinga-token"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              Get a free token at{' '}
              <span className="font-medium text-gray-500">pro.benzinga.com → API Keys</span>
            </p>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save &amp; Continue
          </button>
        </form>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            SEC EDGAR filings work with <span className="font-medium">no keys</span> — add tickers and you'll see filings immediately.
            News + AI classification require the keys above.
          </p>
        </div>
      </div>
    </div>
  );
};
