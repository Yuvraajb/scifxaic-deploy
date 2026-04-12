import { CACHE_TTL_MS } from '../config/constants';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

function makeKey(prefix: string, key: string): string {
  return `scifx:${prefix}:${key}`;
}

export function cacheGet<T>(prefix: string, key: string): T | null {
  try {
    const raw = sessionStorage.getItem(makeKey(prefix, key));
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      sessionStorage.removeItem(makeKey(prefix, key));
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export function cacheSet<T>(
  prefix: string,
  key: string,
  value: T,
  ttlMs = CACHE_TTL_MS,
): void {
  try {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
    sessionStorage.setItem(makeKey(prefix, key), JSON.stringify(entry));
  } catch {
    // sessionStorage quota exceeded — silently skip
  }
}

export function localGet<T>(prefix: string, key: string, _ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(makeKey(prefix, key));
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(makeKey(prefix, key));
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export function localSet<T>(prefix: string, key: string, value: T, ttlMs: number): void {
  try {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
    localStorage.setItem(makeKey(prefix, key), JSON.stringify(entry));
  } catch {
    // localStorage quota exceeded — silently skip
  }
}

export async function hashKey(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
