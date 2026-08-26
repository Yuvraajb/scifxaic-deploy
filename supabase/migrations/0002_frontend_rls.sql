-- Frontend read/write access for the deck dashboard.
--
-- Symptom this fixes: the deployed dashboard showed zero decks while
-- investment_tracker held rows — RLS was enabled (or defaulted) with no
-- policy for the authenticated role, so logged-in frontend reads returned
-- an empty set. The service_role worker was unaffected (bypasses RLS).
--
-- Roles (docs/supabase_docs/guides/api/securing-your-api.md):
--   anon          -> no access to these tables (frontend requires login)
--   authenticated -> read decks + own profile; move decks between sectors
--   service_role  -> bypasses RLS (worker, slack bot, routes/api.js)

alter table public.investment_tracker enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "authenticated read investment_tracker" on public.investment_tracker;
create policy "authenticated read investment_tracker"
  on public.investment_tracker for select
  to authenticated
  using (true);

-- Dashboard drag-and-drop moves a deck to another sector column.
drop policy if exists "authenticated update investment_tracker sector" on public.investment_tracker;
create policy "authenticated update investment_tracker sector"
  on public.investment_tracker for update
  to authenticated
  using (true)
  with check (true);

-- useAuthStore loads the caller's own profile row after login.
drop policy if exists "authenticated read own profile" on public.profiles;
create policy "authenticated read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());
