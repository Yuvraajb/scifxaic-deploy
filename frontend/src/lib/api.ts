import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL as string;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { Authorization: `Bearer ${token}` };
}

export async function uploadDeck(formData: FormData) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

export async function inviteUser(email: string, name: string, slackUserId: string, password: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/api/invite`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, slackUserId, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Invite failed' }));
    throw new Error(err.error || 'Invite failed');
  }
  return res.json();
}

export async function listUsers() {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/api/users`, { headers });
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json() as Promise<{ id: string; email: string; name: string; role: string; subscribed_sectors: string[] }[]>;
}

export async function deleteUser(id: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/api/users/${id}`, { method: 'DELETE', headers });
  if (!res.ok) throw new Error('Failed to delete user');
}

export async function updateUserSectors(id: string, sectors: string[]) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/api/users/${id}/sectors`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sectors }),
  });
  if (!res.ok) throw new Error('Failed to update sectors');
}

export async function deleteDeck(id: number | string): Promise<{ ok: boolean; ticker: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/api/decks/${id}`, { method: 'DELETE', headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Delete failed' }));
    throw new Error(err.error || 'Delete failed');
  }
  return res.json();
}
