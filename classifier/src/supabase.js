import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Server-side client for the classifier worker. Uses the service_role key, which
// BYPASSES RLS (supabase_docs/guides/database/postgres/row-level-security.md:
// "Supabase provides special 'Service' keys, which can be used to bypass RLS.
// These should never be used in the browser"). Safe here because the worker
// runs on the server (Render), never in a browser.
//
// persistSession/autoRefreshToken are off: a worker has no user session, it
// authenticates purely via the service_role key on every request.
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.',
  );
}

export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
