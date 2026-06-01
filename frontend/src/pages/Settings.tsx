import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { listUsers, inviteUser, deleteUser, updateUserSectors } from '../lib/api';
import { SECTORS } from '../types';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  subscribed_sectors: string[];
}

export default function Settings() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteSectors, setInviteSectors] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  useEffect(() => {
    if (profile?.role !== 'god') { navigate('/dashboard'); return; }
    loadUsers();
  }, [profile]);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await listUsers();
      setUsers(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setInviting(true);
    try {
      await inviteUser(inviteEmail, inviteName, inviteSectors, invitePassword);
      setInviteSuccess(`${inviteEmail} has been added.`);
      setInviteEmail(''); setInviteName(''); setInvitePassword(''); setInviteSectors([]);
      loadUsers();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to invite');
    } finally {
      setInviting(false);
    }
  }

  async function handleDelete(id: string, email: string) {
    if (!confirm(`Remove ${email}?`)) return;
    await deleteUser(id);
    loadUsers();
  }

  async function handleSectorToggle(userId: string, sector: string, current: string[]) {
    const next = current.includes(sector)
      ? current.filter((s) => s !== sector)
      : [...current, sector];
    await updateUserSectors(userId, next);
    loadUsers();
  }

  function toggleInviteSector(s: string) {
    setInviteSectors((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-crimson-800 rounded-md flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <span className="font-semibold text-gray-900 text-sm">SCIF Portfolio Manager</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-100">
            ← Dashboard
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

        {/* Invite user */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Invite Member</h2>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-crimson-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-crimson-300"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
              <input
                type="password"
                required
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="They can change it later"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-crimson-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sectors</label>
              <div className="flex gap-2">
                {SECTORS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleInviteSector(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      inviteSectors.includes(s)
                        ? 'bg-crimson-800 text-white border-crimson-800'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {inviteError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{inviteError}</p>}
            {inviteSuccess && <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">{inviteSuccess}</p>}

            <button
              type="submit"
              disabled={inviting}
              className="px-5 py-2 bg-crimson-800 hover:bg-crimson-900 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
            >
              {inviting ? 'Adding…' : 'Add Member'}
            </button>
          </form>
        </div>

        {/* Members list */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Members</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {users.map((u) => (
                <div key={u.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-crimson-800 flex items-center justify-center text-white text-xs font-bold">
                      {(u.name || u.email).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{u.name || '—'}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                    {u.role === 'god' && (
                      <span className="text-xs bg-crimson-100 text-crimson-800 px-2 py-0.5 rounded-full font-semibold">GOD</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {u.role !== 'god' && (
                      <div className="flex gap-1.5">
                        {SECTORS.map((s) => (
                          <button
                            key={s}
                            onClick={() => handleSectorToggle(u.id, s, u.subscribed_sectors)}
                            className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                              u.subscribed_sectors?.includes(s)
                                ? 'bg-crimson-800 text-white border-crimson-800'
                                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    {u.role !== 'god' && (
                      <button
                        onClick={() => handleDelete(u.id, u.email)}
                        className="text-xs text-red-400 hover:text-red-600 font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
