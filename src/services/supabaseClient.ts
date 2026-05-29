import { createClient } from '@supabase/supabase-js';

// Browser-side client. Uses the anon (publishable) key, which is safe to ship
// to the browser ONLY because RLS is enabled on every table
// (supabase_docs/guides/database/postgres/row-level-security.md). The anon key
// can read companies/theses/articles and nothing else.
//
// Vite exposes only env vars prefixed with VITE_ to client code, so these must
// be named VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (not the bare
// SUPABASE_* vars used by the Python/Node workers).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy them from your ' +
      'Supabase project (Settings → API) into .env.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
