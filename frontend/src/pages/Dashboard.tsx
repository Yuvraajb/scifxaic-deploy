import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import DeckCard from '../components/DeckCard';
import UploadModal from '../components/UploadModal';
import SectorChangeModal from '../components/SectorChangeModal';
import type { Deck } from '../types';
import { deleteDeck } from '../lib/api';

interface PendingMove {
  deck: Deck;
  toSector: string;
}

export default function Dashboard() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [dragOverSector, setDragOverSector] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const draggingDeck = useRef<Deck | null>(null);

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

  // Live refresh: refetch whenever investment_tracker changes (deck uploaded
  // via Slack or API, sector moved by another user). The table is in the
  // supabase_realtime publication (migration 0002); RLS decides what we see,
  // so the refetch re-applies the same sector filter as the initial load.
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('investment-tracker-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'investment_tracker' },
        () => { fetchDecks(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchDecks]);

  function handleDragStart(deck: Deck) {
    draggingDeck.current = deck;
  }

  function handleDragOver(e: React.DragEvent, sector: string) {
    e.preventDefault();
    if (draggingDeck.current?.sector !== sector) setDragOverSector(sector);
  }

  function handleDrop(e: React.DragEvent, toSector: string) {
    e.preventDefault();
    setDragOverSector(null);
    const deck = draggingDeck.current;
    if (!deck || deck.sector === toSector) return;
    setPendingMove({ deck, toSector });
  }

  async function confirmMove() {
    if (!pendingMove) return;
    const { deck, toSector } = pendingMove;
    // Optimistic update
    setDecks(prev => prev.map(d => d.id === deck.id ? { ...d, sector: toSector } : d));
    setPendingMove(null);
    const { error } = await supabase
      .from('investment_tracker')
      .update({ sector: toSector })
      .eq('id', deck.id);
    if (error) {
      // Rollback on failure
      setDecks(prev => prev.map(d => d.id === deck.id ? { ...d, sector: deck.sector } : d));
    }
  }

  async function handleDelete(deck: Deck) {
    // Optimistic remove; restore on failure. Other open dashboards converge
    // via the realtime subscription.
    setDecks(prev => prev.filter(d => d.id !== deck.id));
    try {
      await deleteDeck(deck.id);
    } catch (err) {
      setDecks(prev => [...prev, deck]);
      alert(err instanceof Error ? err.message : 'Could not delete deck');
    }
  }

  function cancelMove() {
    setPendingMove(null);
    draggingDeck.current = null;
  }

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
              const isOver = dragOverSector === sector;
              return (
                <div
                  key={sector}
                  onDragOver={(e) => handleDragOver(e, sector)}
                  onDragLeave={() => setDragOverSector(null)}
                  onDrop={(e) => handleDrop(e, sector)}
                  className={`rounded-2xl p-5 border-2 transition-all duration-150 ${
                    isOver
                      ? 'border-crimson-400 bg-crimson-50 scale-[1.01] shadow-lg'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-gray-900">{sector}</h2>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                      {sectorDecks.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {sectorDecks.map((deck) => (
                      <DeckCard
                        key={deck.id}
                        deck={deck}
                        onDragStart={() => handleDragStart(deck)}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>

                  <button
                    onClick={() => setShowUpload(true)}
                    className={`mt-3 w-full border-2 border-dashed rounded-xl py-4 text-sm transition-colors ${
                      isOver
                        ? 'border-crimson-400 text-crimson-500 bg-crimson-50'
                        : 'border-gray-200 text-gray-400 hover:border-crimson-300 hover:text-crimson-500'
                    }`}
                  >
                    {isOver ? 'Drop here' : '+ Add deck'}
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

      {pendingMove && (
        <SectorChangeModal
          deckTicker={pendingMove.deck.ticker}
          fromSector={pendingMove.deck.sector || 'Unknown'}
          toSector={pendingMove.toSector}
          onConfirm={confirmMove}
          onCancel={cancelMove}
        />
      )}
    </div>
  );
}
