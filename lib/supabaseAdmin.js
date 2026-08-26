const { createClient } = require('@supabase/supabase-js');

// Shared service-role Supabase client for all CommonJS code (app.js, handlers/,
// routes/, slack/). The ESM classifier package has its own client
// (classifier/src/supabase.js) — different module system, separate runtime
// boundary, deliberately not shared with this one.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = supabaseAdmin;
