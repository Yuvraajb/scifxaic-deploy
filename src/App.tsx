import { useState } from 'react';
import { Header } from './components/layout/Header';
import { TabBar } from './components/layout/TabBar';
import { FeedContainer } from './components/feed/FeedContainer';
import { APIKeyModal } from './components/settings/APIKeyModal';
import { useSECFilings } from './hooks/useSECFilings';
import { useNewsItems } from './hooks/useNewsItems';
import { useCapitalIQ } from './hooks/useCapitalIQ';
import { useClassification } from './hooks/useClassification';

function getStoredKey(envKey: string, storageKey: string): string {
  return (
    (import.meta.env[envKey] as string | undefined) ||
    sessionStorage.getItem(storageKey) ||
    ''
  );
}

function DataLayer() {
  const anthropicKey = getStoredKey('VITE_ANTHROPIC_API_KEY', 'anthropic_key');
  const alpacaKey = getStoredKey('VITE_ALPACA_API_KEY', 'alpaca_key');
  const alpacaSecret = getStoredKey('VITE_ALPACA_API_SECRET', 'alpaca_secret');

  useSECFilings();
  useNewsItems(alpacaKey, alpacaSecret);
  useCapitalIQ();
  useClassification(anthropicKey);

  return null;
}

export default function App() {
  const [showModal, setShowModal] = useState(() => {
    const hasKey =
      (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined) ||
      sessionStorage.getItem('anthropic_key');
    return !hasKey;
  });

  function handleSaveKeys(keys: {
    anthropicKey: string;
    alpacaKey: string;
    alpacaSecret: string;
  }) {
    if (keys.anthropicKey) sessionStorage.setItem('anthropic_key', keys.anthropicKey);
    if (keys.alpacaKey) sessionStorage.setItem('alpaca_key', keys.alpacaKey);
    if (keys.alpacaSecret) sessionStorage.setItem('alpaca_secret', keys.alpacaSecret);
    setShowModal(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {showModal && <APIKeyModal onSave={handleSaveKeys} />}
      {!showModal && <DataLayer />}

      <Header onOpenSettings={() => setShowModal(true)} />

      <main className="max-w-4xl mx-auto px-4 py-6">
        <TabBar />
        <FeedContainer />
      </main>
    </div>
  );
}
