-- SCIF Thesis Tracker — initial schema
-- Ports mvp/src/db.js (SQLite) to Supabase Postgres, plus subscriptions.
-- Three labels only: HIGH_ALERT | MONTHLY_OVERVIEW | IGNORE. No embeddings.
--
-- ---------------------------------------------------------------------------
-- Reset: drop the legacy embeddings-based schema (May-3 design) so this
-- project's simplified, no-embeddings model becomes the single source of
-- truth. Only test-seed data existed; no production rows. CASCADE clears
-- the FK web (chunks -> decks, matches -> pillars/news_items, etc).
-- ---------------------------------------------------------------------------
drop table if exists public.pitch_deck_chunks     cascade;
drop table if exists public.slide_items           cascade;
drop table if exists public.pitch_decks           cascade;
drop table if exists public.pulse_alerts          cascade;
drop table if exists public.thesis_matches        cascade;
drop table if exists public.thesis_pillars        cascade;
drop table if exists public.filing_chunks         cascade;
drop table if exists public.filings               cascade;
drop table if exists public.news_articles         cascade;
drop table if exists public.news_items            cascade;
drop table if exists public.sector_assignments    cascade;
drop table if exists public.notification_channels cascade;
drop table if exists public.subscriptions         cascade;
drop table if exists public.portfolio_companies   cascade;
drop table if exists public.users                 cascade;

-- RLS rationale (supabase_docs/guides/database/postgres/row-level-security.md):
--   "RLS must always be enabled on any tables stored in an exposed schema."
--   The React frontend reads these tables from the browser with the anon key,
--   so RLS is enabled on all four tables.
--     companies / theses / articles  -> anon may SELECT (read-only dashboard)
--     subscriptions                  -> no anon policy; service_role only
--   The service_role key bypasses RLS, so the mvp worker and Slack bot keep
--   full write access without any policy.

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id      bigint generated always as identity primary key,
  ticker  text   not null unique,
  name    text   not null,
  sector  text,
  active  boolean not null default true
);

-- ---------------------------------------------------------------------------
-- theses  (structured_json: the company's investment thesis, no embeddings)
-- ---------------------------------------------------------------------------
create table if not exists public.theses (
  id              bigint generated always as identity primary key,
  company_id      bigint not null references public.companies (id),
  structured_json jsonb  not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- articles  (ingested news; classification filled by the mvp agent)
-- ---------------------------------------------------------------------------
create table if not exists public.articles (
  id              bigint generated always as identity primary key,
  company_id      bigint not null references public.companies (id),
  source          text   not null,
  source_event_id text   not null,
  headline        text   not null,
  summary         text,
  body            text,
  url             text,
  published_at    timestamptz not null,
  raw_json        jsonb  not null,
  classification  text check (classification in ('HIGH_ALERT','MONTHLY_OVERVIEW','IGNORE')),
  rationale       text,
  classified_at   timestamptz,
  dispatched_at   timestamptz,
  ingested_at     timestamptz not null default now(),
  unique (source, source_event_id)
);

-- Hot path: claim the next unclassified article (classify.js claimRow).
-- Partial index keeps "where classification is null" cheap.
create index if not exists idx_articles_pending
  on public.articles (classification)
  where classification is null;

-- ---------------------------------------------------------------------------
-- subscriptions  (sector -> Slack user; replaces scif-slack-bot/subscriptions.json)
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id text not null,
  sector  text not null,
  primary key (user_id, sector)
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

-- companies: anon read-only
grant select on public.companies to anon;
alter table public.companies enable row level security;
create policy "anon read companies"
  on public.companies for select
  to anon
  using (true);

-- theses: anon read-only
grant select on public.theses to anon;
alter table public.theses enable row level security;
create policy "anon read theses"
  on public.theses for select
  to anon
  using (true);

-- articles: anon read-only
grant select on public.articles to anon;
alter table public.articles enable row level security;
create policy "anon read articles"
  on public.articles for select
  to anon
  using (true);

-- subscriptions: RLS on, NO anon policy -> anon blocked.
-- Only the service_role key (mvp worker + Slack bot) can read/write.
alter table public.subscriptions enable row level security;
