-- Keep companies.sector in step with dashboard sector moves.
--
-- The dashboard's drag-and-drop updates investment_tracker.sector directly
-- (frontend/src/pages/Dashboard.tsx confirmMove). companies.sector — the row
-- the classifier and Slack flows read — was left stale. A trigger syncs it so
-- EVERY writer (frontend, Slack bot, backfills) stays consistent without each
-- one remembering to double-write.
--
-- SECURITY DEFINER: the authenticated role has no update grant on companies;
-- the trigger runs as the function owner so the sync succeeds anyway. The
-- function only touches companies.sector for the matching ticker.

create or replace function public.sync_company_sector()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.companies
  set sector = new.sector
  where ticker = upper(trim(new.ticker));
  return new;
end;
$$;

drop trigger if exists investment_tracker_sector_sync on public.investment_tracker;
create trigger investment_tracker_sector_sync
after update of sector on public.investment_tracker
for each row
when (new.sector is distinct from old.sector)
execute function public.sync_company_sector();
