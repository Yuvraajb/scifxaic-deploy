import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import DeckCard from '../components/DeckCard';
import UploadModal from '../components/UploadModal';
import type { Deck } from '../types';

export default function Dashboard() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  const sectors = profile?.role === 'god'
    ? ['Consumer', 'Healthcare', 'TMT']
    : (profile?.subscribed_sectors ?? []);

  const fetchDecks = useCallback(async () => {
    if (!profile) return;
    let query = supabase.from('investment_tracker').select('*').order('created_at', { ascending: false });
    if (profile.role !== 'god' && sectors.length > 0) {
      query = query.in('sector', sectors);
    }
    const { data } = await query;
    setDecks((data as Deck[]) ?? []);
  }, [profile, sectors.join(',')]);

  useEffect(() => { fetchDecks(); }, [fetchDecks]);

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="SCIF" className="w-8 h-8 object-contain" />
          <span className="font-semibold text-gray-900 text-sm">SCIF Portfolio Manager</span>
        </div>

        <div className="flex items-center gap-3">
          {profile?.role === 'god' && (
            <button
              onClick={() => navigate('/settings')}
              className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              ⚙ Settings
            </button>
          )}
          <button
            onClick={() => setShowUpload(true)}
            className="px-4 py-2 bg-crimson-800 hover:bg-crimson-900 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            + Upload Deck
          </button>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900">Investment Portfolio</h1>
        <p className="text-sm text-gray-500 mt-1">Organize and manage company slide decks across sectors</p>

        {/* Sector columns */}
        {sectors.length === 0 ? (
          <div className="mt-12 text-center text-gray-400">
            <p className="text-lg">No sectors subscribed yet.</p>
            <p className="text-sm mt-1">Ask your administrator to assign sectors to your account.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-6" style={{ gridTemplateColumns: `repeat(${sectors.length}, minmax(0, 1fr))` }}>
            {sectors.map((sector) => {
              const sectorDecks = decks.filter((d) => d.sector === sector);
              return (
                <div key={sector} className="bg-white border border-gray-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-900">{sector}</h2>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                      {sectorDecks.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {sectorDecks.map((deck) => (
                      <DeckCard key={deck.id} deck={deck} />
                    ))}
                  </div>

                  {/* Add new placeholder */}
                  <button
                    onClick={() => setShowUpload(true)}
                    className="mt-3 w-full border-2 border-dashed border-gray-200 rounded-xl py-4 text-sm text-gray-400 hover:border-crimson-300 hover:text-crimson-500 transition-colors"
                  >
                    + Add deck
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={fetchDecks}
        />
      )}
    </div>
  );
}
