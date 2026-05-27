# SCIF Thesis Tracker — Build Plan (`build.md`)

> Source-of-truth engineering plan for the SCIF Thesis Tracker. Produced from discovery agents reading `finnhub_docs/`, `supabase_docs/`, `render_docs/`, `slack_docs/`, `langchain_docs/`. Codebase analysis is appended at the end and does not influence the initial architecture above it.

---

## 0. Discovery Agent Findings

Concrete decisions made by each documentation discovery agent before this plan was written.

### Finnhub Discovery
- **Polling, not websocket.** `/company-news` is the primary feed; it returns a monotonically usable `id` field documented as a `minId` cursor. The news websocket (`websocket-news.md`) has an undocumented schema; the press-release websocket is Enterprise-only.
- **"Category 9 = Red Flags" is unverified.** Finnhub's documented `category` field on `/company-news` is a free-form string, not a numeric enum. `general | forex | crypto | merger` are the only documented top-level categories on `/news`. Red-flag detection runs as a **tracker-side classifier** (keyword + filing-form rules + LLM triage), not as a Finnhub query parameter. We continue to call this category "Red Flags" internally and label it `redflag` in our own schema; we do **not** trust an undocumented Finnhub category integer.
- **Endpoint roles by tier:**
  - Tier 1 (instant): `/stock/upgrade-downgrade` (downgrades), `/stock/executive` (snapshot diff for C-suite departures), `/company-news` + `/press-releases` (keyword scan for guidance cuts / red flags), `/stock/filings` (form `NT 10-K`, `8-K Item 4.02`).
  - Tier 2 (same-day digest): `/calendar/earnings` + `/stock/earnings`, `/news?category=merger`, analyst rating changes (non-downgrade), large insider transactions.
  - Tier 3 (monthly roll-up): `/stock/newsroom`, dividend press releases, `/news-sentiment`, `/stock/metric`, sentiment drift.
- **Dedup:** native `id` for `/company-news` and `/news`; `accessNumber` for filings; deterministic composite hash for everything else (e.g. `sha256(symbol+name+gradeTime+action)` for upgrades).
- **Rate-limit plan:** assume 40-ticker portfolio. `/company-news` per ticker every 10 min (40 calls/cycle, ~240/hr, well under 30 req/s global cap). Stagger calls within each cycle and use `asyncio.Semaphore` / async `p-limit` in JS.
- **Risk flagged:** free-tier quota numbers are not in the docs — verify against the live Finnhub dashboard before final cadence lock.

### Supabase Discovery
- **No pgvector, no embeddings.** All semantic understanding happens inside the LLM. Thesis components and document text are stored as plain `text` columns; retrieval is "load full thesis for this investment" — not "top-k by cosine similarity". The thesis fits comfortably in a single LLM context, so vector retrieval is unnecessary complexity.
- **Storage:** single private bucket `pitch-decks`; path `{investment_id}/{document_id}.pdf`; MIME `application/pdf` only; file size cap 50 MB on free tier. Signed URLs TTL 3600 s for backend reads, 300 s for admin preview.
- **Auth & RLS:** three principal classes — admin (Supabase Auth, joined to `admin_users`), workers (`service_role`, bypasses RLS), Slack user (data-only, no auth session). Public-signup disabled in Auth settings; admins added by SQL invite. RLS enabled on every public table; default-deny.
- **Scheduling:** **Render Cron Jobs hitting backend HTTP endpoints**. pg_cron only for DB-internal pruning (`prompt_runs` retention).
- **Upserts:** every external write keyed by a UNIQUE constraint — `(source, source_event_id)`, `(investment_id, hash)`, `(normalized_event_id, thesis_id, prompt_version)`, `dedupe_key` on `alerts`, `(slack_user_id, scope_type, scope_value)` on `subscriptions`.
- **Connections:** workers connect through Supavisor port 6543 (transaction mode); use `(select auth.uid())` in RLS policies for per-statement cache.

### Render Discovery
- **All Node.js.** `app.js` is already `@slack/bolt` Node; LangChain.js covers every chain we need. No polyglot split.
- **Eight services in one Render workspace:** `scif-admin` (Next.js web), `scif-api` (Node REST API), `scif-slackbot` (Bolt web), `scif-worker-deck` (worker), `scif-worker-events` (worker), `scif-cron-finnhub` (cron), `scif-cron-digest` (cron), `scif-cron-rollup` (cron). All `starter` plan; crons ~$1/month each.
- **Inter-service:** crons call `scif-api` over **private network** using `fromService.property: hostport`. Slackbot and admin frontend are public-facing. Workers do not receive HTTP — they poll Supabase `jobs` table with `FOR UPDATE SKIP LOCKED`.
- **Queue:** Supabase rows + `FOR UPDATE SKIP LOCKED` (no Render Key Value / Redis required).
- **Env groups:** `supabase-core`, `llm-keys`, `slack-creds`, `finnhub`, `internal-auth` (with `generateValue: true` for `CRON_SHARED_SECRET`).
- **Free-tier traps:** Free web services sleep at 15 min idle → fatal for Slack (3 s ack window); crons and workers cannot be Free at all (`blueprint-spec.md`). Minimum bill ≈ $38/mo.
- **Deployment:** monorepo with `rootDir` + `buildFilter.paths` per service so docs-only commits don't trigger redeploys.

### Slack Discovery
- **HTTP request URLs**, not Socket Mode. Bolt-JS already wired via `ExpressReceiver` in `app.js`.
- **Bot scopes (minimum):** `chat:write`, `chat:write.public`, `commands`, `im:write`, `users:read`, `app_mentions:read` (plus `files:read` for existing `/deck` flow).
- **Slash commands:** `/subscribe`, `/unsubscribe`, `/my-subscriptions`, `/mute`, `/thesis-status` (plus existing `/deck`, `/hello`). Args use `key:value` pairs (`ticker:NVDA sector:Healthcare tier:1`).
- **Alert delivery:** worker (not Slackbot service) sends `chat.postMessage` directly using `SLACK_BOT_TOKEN`. Slackbot only receives Slack-originated traffic. DM channel IDs cached per `slack_user_id` to skip `conversations.open` calls.
- **Rate limits:** `chat.postMessage` is "Special tier" (1 msg/sec/channel). DM fan-out paced at ~5/sec with 1 s pause every 20 sends. Respect `Retry-After` on 429.
- **Dedup:** unique constraint on `alerts.dedupe_key` is the only correctness guarantee. Slack message `metadata.event_payload.dedupe_key` is verification only.
- **Trigger-id risk:** modal opens require a Supabase round-trip that must complete inside the 3-second ack window; on cold start, open the modal with empty `initial_options` rather than blow the trigger-id.

### LangChain Discovery
- **LangChain.js**, not Python. Avoids polyglot. `@langchain/openai`, `@langchain/community/document_loaders/fs/pdf`. **No vector-store package** is used — there is no vector store in this system. **Single provider (OpenAI). No cross-provider fallback chain** — retries and exponential backoff are sufficient, and a fallback model creates schema/behavior drift that the team would have to keep in sync.
- **No LangGraph for v1.** Pipeline is a linear DAG with one conditional branch (the triage gate). Plain LCEL `RunnableSequence`. Revisit LangGraph if human-in-the-loop verdict approval, analyst chat, or tool-using agents are added.
- **LLM does all reasoning. No embeddings, no vector similarity, no top-k retrieval anywhere in the pipeline.** Categorization, triage, and impact evaluation are all LLM reasoning over the article text directly. Thesis retrieval is "SELECT * FROM thesis_components WHERE thesis_id = ?" and passing the whole thing into the prompt.
- **Model split:**
  - Article categorizer + triage → cheap fast model (`gpt-5.4-mini`).
  - Thesis structuring, impact evaluator, monthly narrative → reasoning model (`gpt-5.5`).
- **Structured output:** `.withStructuredOutput(zodSchema, { strict: true })` at the model layer. One retry with stricter error-bearing system prompt on validation failure. On persistent provider errors, exponential backoff (1s, 4s, 16s) then dead-letter — no fallback model.
- **PDF handling:** `PDFLoader` extracts page text. The deck-extractor stores the per-page text rows as plain `text`. No chunking or embedding step. For thesis structuring, the LLM reads the concatenated deck text directly (truncated/summarized if it exceeds context).
- **Observability:** LangSmith from day one via env vars (`LANGSMITH_TRACING=true`). Prompt files versioned by semver (`thesis_structuring@1.0.0`); every run logged to a `prompt_runs` row containing `langsmith_trace_id` for deep-linking.

---

## 1. Architecture Map

The system has **two user-facing surfaces** and **one shared system of record**:

```
                ┌─────────────────────────┐
                │  ADMIN FRONTEND         │   Next.js on Render (scif-admin)
                │  - Pitch-deck upload    │   ─ Auth: Supabase JWT (admins only)
                │  - Investment + thesis  │   ─ Calls scif-api (public HTTPS, CORS-locked)
                │    management           │   ─ Direct Storage uploads via Supabase JS SDK
                │  - Manual reprocess     │
                └────────────┬────────────┘
                             │
                             ▼ (HTTPS, JWT)
                ┌─────────────────────────┐         ┌────────────────────────┐
                │  BACKEND API            │◄────────┤  CRON JOBS             │
                │  (scif-api)             │ private │  - scif-cron-finnhub   │
                │  - Investment CRUD      │ network │  - scif-cron-digest    │
                │  - Job enqueuer         │         │  - scif-cron-rollup    │
                │  - Internal endpoints   │         │   (all Node, on Render)│
                │    for cron triggers    │         └────────────────────────┘
                └────────┬────────────────┘
                         │
                         ▼ (rows in jobs table)
                ┌─────────────────────────┐         ┌────────────────────────┐
                │  SUPABASE (Postgres)    │◄────────┤  WORKERS (Render)      │
                │  - companies            │  poll   │  - scif-worker-deck    │
                │  - investments + theses │  jobs   │  - scif-worker-events  │
                │  - documents +          │ ◄──────►│   (LangChain.js chains)│
                │    document_pages       │ writes  │                        │
                │  - thesis_components    │ results │                        │
                │    (plain text)         │         └──────────┬─────────────┘
                │  - raw + normalized     │                    │
                │    events               │                    │
                │  - event_evaluations    │                    │
                │  - alerts (dedupe_key)  │                    ▼
                │  - subscriptions/mutes  │            ┌──────────────────┐
                │  - monthly_rollups      │            │  Slack Web API   │
                │  - prompt_runs          │            │  chat.postMessage│
                │  - Storage (decks)      │            │  conversations.open
                │  (no vector index —     │
                │   LLM-only reasoning)   │
                └────────────┬────────────┘            └──────────────────┘
                             │                         └──────────────────┘
                             │                                ▲
                             ▼ (HTTPS)                        │
                ┌─────────────────────────┐                   │
                │  FINNHUB                │                   │ inbound
                │  (REST polling)         │                   │ Slack →
                │  /company-news          │                   │ HTTPS
                │  /upgrade-downgrade     │                   │
                │  /executive (snapshot)  │                   │
                │  /earnings + calendar   │                   │
                │  /press-releases        │                   │
                │  /filings               │                   │
                └─────────────────────────┘                   │
                                                              │
                ┌─────────────────────────┐                   │
                │  SLACKBOT SERVICE       │◄──────────────────┘
                │  (scif-slackbot)        │   Slack POSTs:
                │  - /subscribe …         │   - slash commands
                │  - Block Kit modals     │   - view_submission
                │  - /my-subscriptions    │   - block_actions
                │  - /thesis-status       │   - app_mention
                │  - /mute                │
                │  - HMAC verification    │
                │   (Bolt-JS built-in)    │
                └─────────────────────────┘
```

**Component interaction summary:**

| Component | Role | Talks to | How |
|-----------|------|----------|-----|
| **Admin Frontend** (Next.js) | Pitch-deck ingestion UI; investment/thesis CRUD | scif-api (REST); Supabase Storage (direct upload via SDK); Supabase Auth | HTTPS + JWT |
| **Backend API** (scif-api) | REST API for frontend; internal endpoints for cron triggers; job enqueuer | Supabase (service-role); Finnhub (on cron trigger) | HTTPS (public for frontend, private network for crons) |
| **Slackbot** (scif-slackbot) | Receives Slack slash commands, view submissions, block actions | Supabase (service-role) for subscription writes; Slack API for ack/respond | HTTPS (Slack request URL public) |
| **Workers** (worker-deck, worker-events) | Run LangChain pipelines (deck extraction, event triage + evaluation, alert dispatch) | Supabase (read jobs, write outputs); LLM provider; Slack Web API (outbound `chat.postMessage`) | Polls Supabase; outbound HTTPS |
| **Crons** | Periodic trigger of polling/digest/rollup jobs | scif-api over private network | HTTP over Render private network |
| **Supabase** | System of record + vector store + storage + auth | All services | Postgres / PostgREST / Storage / Auth |
| **Finnhub** | Market data + news source | scif-api (during polling) | REST polling with `minId` cursor |
| **LangChain.js** | Orchestrates extraction, retrieval, triage, evaluation, narrative | Embedded in workers and API | In-process |

**Critical invariants:**
- Slack is **only** notification + subscription. Pitch decks **never** enter the system via Slack.
- Workers, not the Slackbot service, send outbound alerts (Slackbot exists to *receive*).
- Supabase is the **only** persistence layer — no Render Postgres, no Redis.
- All cross-service writes are idempotent via UNIQUE constraints.

---

## 2. Prerequisites & Environment Variables

### Required external accounts
| Service | Why | Tier needed |
|---------|-----|-------------|
| Supabase | Postgres + Storage + Auth (no pgvector — LLM-only reasoning) | Free for dev; Pro ($25/mo) recommended for 100 GB storage + daily backups |
| Render | Hosting all services | Starter or higher (Free is fatal for Slack 3-sec ack) |
| Finnhub | Market data + news | Free (verify quota in dashboard) |
| Slack workspace | Bot install | Any workspace, app installed by workspace admin |
| OpenAI | LLM provider | Pay-as-you-go API access for GPT-5.5 + GPT-5.4-mini |
| LangSmith | Observability | Free tier (5k traces/mo) |

### Environment variables (grouped per Render env group)

```bash
# ─── supabase-core (shared by scif-api, scif-slackbot, workers, crons) ───
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=...                  # public, used by admin frontend
SUPABASE_SERVICE_ROLE_KEY=...          # secret, workers + API only — never in browser
SUPABASE_JWT_SECRET=...                # for scif-api to verify admin JWTs
SUPABASE_DB_URL=postgres://...:6543/postgres?pgbouncer=true&sslmode=require  # Supavisor

# ─── llm-keys (workers, possibly API) ───
OPENAI_API_KEY=...
LLM_CATEGORIZER_MODEL=gpt-5.4-mini      # article categorization + signal extraction
LLM_TRIAGE_MODEL=gpt-5.4-mini           # importance classifier (HIGH/MED/LOW)
LLM_REASONING_MODEL=gpt-5.5             # impact evaluator + thesis structuring + monthly narrative

# ─── slack-creds (scif-slackbot, workers that dispatch alerts) ───
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_FUND_CHANNEL_ID=C0XXXXXXX        # default broadcast channel for Tier-1

# ─── finnhub (scif-api, scif-cron-finnhub, workers) ───
FINNHUB_API_KEY=...
FINNHUB_BASE_URL=https://finnhub.io/api/v1

# ─── internal-auth (scif-api + all crons) ───
CRON_SHARED_SECRET=<auto-generated by Render>   # generateValue: true

# ─── per-service ───
# scif-admin:
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=https://scif-api.onrender.com

# scif-api:
ADMIN_ORIGIN=https://scif-admin.onrender.com   # CORS allowlist
PORT=10000                              # provided by Render

# crons (one per cron service, wired via fromService property):
SCIF_API_HOSTPORT=scif-api-xxxx:10000  # internal network address

# ─── observability ───
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=scif-thesis-tracker

# ─── feature flags / tuning ───
FINNHUB_POLL_INTERVAL_MIN=10
ALERT_CONFIDENCE_MIN=0.55              # below this, downgrade tier or suppress
PROMPT_RUNS_RETENTION_DAYS=90
```

### Local development
- `.env.local` mirrors the env groups for `npm run dev`.
- `supabase start` for a local Postgres instance + Storage emulator (optional; cloud-first is fine for a small team).
- `ngrok http 3000` to expose the Slackbot dev server for Slack request URLs during testing.

---

## 3. Database Schema (Supabase)

All UUID PKs use `gen_random_uuid()` from the `pgcrypto` extension (on by default in Supabase). RLS is enabled on every table in the `public` schema; default-deny; `service_role` bypasses. **There is no `vector` extension and no embedding columns** — all semantic reasoning happens inside the LLM, over plain `text`.

### 3.1 Extensions
```sql
create extension if not exists pgcrypto;
-- optional: create extension if not exists pg_cron;  -- for DB-internal prune jobs only
```

### 3.2 Domain tables

```sql
-- 3.2.1 admin_users  (joined to auth.users)
create table public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  auth_id       uuid not null unique references auth.users(id) on delete cascade,
  email         text not null,
  role          text not null check (role in ('admin','viewer')) default 'admin',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.admin_users enable row level security;
create policy admin_self_read on public.admin_users for select to authenticated
  using ((select auth.uid()) = auth_id);

-- 3.2.2 companies
create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  ticker        text not null,
  name          text not null,
  sector        text,
  industry      text,
  finnhub_id    text,
  exchange      text,
  created_at    timestamptz not null default now(),
  unique (ticker, exchange)
);
create index on public.companies (ticker);
create index on public.companies (sector);
alter table public.companies enable row level security;
create policy companies_admin_rw on public.companies for all to authenticated
  using (exists (select 1 from admin_users where auth_id = (select auth.uid()) and active))
  with check (exists (select 1 from admin_users where auth_id = (select auth.uid()) and active));

-- 3.2.3 investments
create table public.investments (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete restrict,
  position_size       numeric(18,2),
  entry_date          date not null,
  entry_price         numeric(18,4),
  status              text not null check (status in ('active','exited','watch')) default 'active',
  created_by_admin_id uuid not null references public.admin_users(id),
  created_at          timestamptz not null default now()
);
create index on public.investments (company_id);
create index on public.investments (status) where status = 'active';
alter table public.investments enable row level security;
create policy investments_admin_rw on public.investments for all to authenticated
  using (exists (select 1 from admin_users where auth_id = (select auth.uid()) and active))
  with check (exists (select 1 from admin_users where auth_id = (select auth.uid()) and active));

-- 3.2.4 theses
create table public.theses (
  id              uuid primary key default gen_random_uuid(),
  investment_id   uuid not null references public.investments(id) on delete cascade,
  raw_text        text not null,
  structured_json jsonb not null,
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  unique (investment_id, version)
);
create index on public.theses (investment_id);
create index on public.theses using gin (structured_json jsonb_path_ops);
alter table public.theses enable row level security;
-- policies analogous to investments

-- 3.2.5 documents (pitch decks)
create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  investment_id   uuid not null references public.investments(id) on delete cascade,
  storage_path    text not null,     -- pitch-decks/{investment_id}/{document_id}.pdf
  mime            text not null default 'application/pdf',
  uploaded_by     uuid references public.admin_users(id),
  hash            text not null,     -- sha256 of file bytes
  page_count      int,
  processed_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (investment_id, hash)
);
create index on public.documents (investment_id);
create index on public.documents (processed_at) where processed_at is null;  -- work queue
```

### 3.3 Deck text and thesis components (plain text — no embeddings)

These two tables store the raw and structured outputs of the ingestion pipeline as plain `text`. Retrieval is just `SELECT ... WHERE thesis_id = ?` — no vector similarity, no top-k, no pgvector RPC. The LLM consumes the rows directly.

```sql
-- 3.3.1 document_pages  (per-page extracted text from pitch decks)
create table public.document_pages (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references public.documents(id) on delete cascade,
  investment_id   uuid not null references public.investments(id) on delete cascade,
  page            int not null,
  content         text not null,
  created_at      timestamptz not null default now(),
  unique (document_id, page)
);
create index on public.document_pages (document_id, page);
create index on public.document_pages (investment_id);

-- 3.3.2 thesis_components  (LLM-extracted thesis points, stored as text)
create table public.thesis_components (
  id              uuid primary key default gen_random_uuid(),
  thesis_id       uuid not null references public.theses(id) on delete cascade,
  investment_id   uuid not null references public.investments(id) on delete cascade,
  component_type  text not null check (component_type in (
                    'growth_driver','risk','catalyst','valuation_assumption','key_metric'
                  )),
  content         text not null,
  ordinal         int not null,                  -- preserve order within type
  created_at      timestamptz not null default now()
);
create index on public.thesis_components (thesis_id, component_type, ordinal);
create index on public.thesis_components (investment_id);
```

There are no `match_*` RPCs because there is no similarity retrieval. The evaluator loads the entire thesis with a normal SELECT and passes every component into the prompt.

### 3.4 Event pipeline tables

```sql
-- 3.4.1 raw_events (idempotent Finnhub ingest)
create table public.raw_events (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in (
                      'finnhub_news','finnhub_press_release','finnhub_newsroom',
                      'finnhub_earnings','finnhub_upgrade_downgrade',
                      'finnhub_insider','finnhub_executive','finnhub_filing'
                    )),
  source_event_id   text not null,
  company_id        uuid references public.companies(id) on delete set null,
  occurred_at       timestamptz not null,
  raw_json          jsonb not null,
  fetched_at        timestamptz not null default now(),
  unique (source, source_event_id)
);
create index on public.raw_events (company_id, occurred_at desc);
create index on public.raw_events using gin (raw_json jsonb_path_ops);

-- 3.4.2 normalized_events
create table public.normalized_events (
  id                  uuid primary key default gen_random_uuid(),
  raw_event_id        uuid not null unique references public.raw_events(id) on delete cascade,
  company_id          uuid references public.companies(id),
  category            text not null check (category in (
                        'news','earnings','upgrade_downgrade','executive_change',
                        'insider_txn','filing','press_release','redflag','other'
                      )),
  finnhub_category    text,
  headline            text not null,
  summary_text        text,
  url                 text,
  datetime            timestamptz not null,
  importance_signals  jsonb not null default '{}'::jsonb,  -- {gated_by, keywords_hit[], signals[]}
  created_at          timestamptz not null default now()
);
create index on public.normalized_events (company_id, datetime desc);
create index on public.normalized_events (category);

-- 3.4.3 event_evaluations
create table public.event_evaluations (
  id                    uuid primary key default gen_random_uuid(),
  normalized_event_id   uuid not null references public.normalized_events(id) on delete cascade,
  thesis_id             uuid not null references public.theses(id) on delete cascade,
  llm_verdict           text not null check (llm_verdict in ('BREAK','SUPPORT','NEUTRAL')),
  confidence            numeric(4,3) check (confidence between 0 and 1),
  rationale             text,
  affected_components   uuid[] not null default '{}',  -- ids from thesis_components
  prompt_version        text not null,
  model                 text not null,
  evaluated_at          timestamptz not null default now(),
  unique (normalized_event_id, thesis_id, prompt_version)
);
create index on public.event_evaluations (thesis_id);
create index on public.event_evaluations (llm_verdict, evaluated_at desc);
```

### 3.5 Notification tables

```sql
-- 3.5.1 alerts (single dedupe gate before Slack)
create table public.alerts (
  id                    uuid primary key default gen_random_uuid(),
  normalized_event_id   uuid not null references public.normalized_events(id) on delete cascade,
  thesis_id             uuid not null references public.theses(id) on delete cascade,
  tier                  int not null check (tier in (1,2,3)),
  dedupe_key            text not null unique,    -- sha256(thesis_id || normalized_event_id || date)
  status                text not null check (status in ('pending','sent','suppressed','failed')) default 'pending',
  channel_message_ts    text,                    -- Slack ts of fund-wide channel post
  sent_at               timestamptz,
  error                 text,
  created_at            timestamptz not null default now()
);
create index on public.alerts (status) where status = 'pending';
create index on public.alerts (thesis_id, sent_at desc);

-- 3.5.2 alert_recipients (per-DM fan-out tracking)
create table public.alert_recipients (
  id                uuid primary key default gen_random_uuid(),
  alert_id          uuid not null references public.alerts(id) on delete cascade,
  slack_user_id     text not null,
  dm_channel_id     text,
  dm_message_ts     text,
  status            text not null check (status in ('pending','sent','failed','muted','user_disabled')) default 'pending',
  error             text,
  sent_at           timestamptz,
  unique (alert_id, slack_user_id)
);

-- 3.5.3 subscriptions (normalized: one row per scope element)
create table public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  slack_user_id   text not null,
  scope_type      text not null check (scope_type in ('sector','ticker','category','tier')),
  scope_value     text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (slack_user_id, scope_type, scope_value)
);
create index on public.subscriptions (slack_user_id);
create index on public.subscriptions (scope_type, scope_value) where active;

-- 3.5.4 mutes (per-user, per-ticker, time-bounded)
create table public.mutes (
  id              uuid primary key default gen_random_uuid(),
  slack_user_id   text not null,
  ticker          text not null,
  mute_until      timestamptz not null,
  created_at      timestamptz not null default now()
);
create index on public.mutes (slack_user_id, ticker, mute_until);

-- 3.5.5 slack_user_dm_cache (resolve slack_user_id -> dm_channel_id)
create table public.slack_user_dm_cache (
  slack_user_id   text primary key,
  dm_channel_id   text not null,
  cached_at       timestamptz not null default now()
);

-- 3.5.6 monthly_rollups
create table public.monthly_rollups (
  id                    uuid primary key default gen_random_uuid(),
  investment_id         uuid not null references public.investments(id) on delete cascade,
  period                text not null,             -- 'YYYY-MM'
  narrative_md          text not null,
  supporting_event_ids  uuid[] not null default '{}',
  generated_at          timestamptz not null default now(),
  unique (investment_id, period)
);
create index on public.monthly_rollups (investment_id, period desc);
```

### 3.6 Operational tables

```sql
-- 3.6.1 jobs (in-DB queue, FOR UPDATE SKIP LOCKED)
create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in (
                  'extract_deck','structure_thesis','evaluate_event','dispatch_alert',
                  'generate_rollup'
                )),
  payload       jsonb not null,
  status        text not null check (status in ('pending','running','done','failed','dead'))
                  default 'pending',
  attempts      int not null default 0,
  max_attempts  int not null default 3,
  error         text,
  scheduled_at  timestamptz not null default now(),
  claimed_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index on public.jobs (status, scheduled_at) where status = 'pending';
create index on public.jobs (type, status);

-- 3.6.2 prompt_runs (LangSmith mirror + cost tracking)
create table public.prompt_runs (
  id                uuid primary key default gen_random_uuid(),
  chain_name        text not null,
  prompt_version    text not null,
  model             text not null,
  input             jsonb not null,
  output            jsonb,
  status            text not null check (status in ('success','invalid_json','rate_limit','hallucinated_id','error')),
  latency_ms        int,
  input_tokens      int,
  output_tokens     int,
  cost_usd          numeric(10,6),
  langsmith_trace_id text,
  error             text,
  created_at        timestamptz not null default now()
);
create index on public.prompt_runs (chain_name, created_at desc);
create index on public.prompt_runs (created_at) where created_at < now() - interval '90 days';
```

### 3.7 Storage bucket

```sql
-- via Supabase JS one-off script or dashboard:
-- bucket: 'pitch-decks', public=false, allowedMimeTypes=['application/pdf'], fileSizeLimit=52428800
-- RLS on storage.objects: only admins (via admin_users) may insert; service_role may select.
```

### 3.8 Helper SQL for the in-DB queue

```sql
-- worker claim: picks one job atomically, sets running
create or replace function public.claim_job(p_type text)
returns public.jobs language plpgsql as $$
declare j public.jobs;
begin
  select * into j from public.jobs
    where type = p_type
      and status = 'pending'
      and scheduled_at <= now()
    order by scheduled_at
    for update skip locked
    limit 1;
  if j.id is null then return null; end if;
  update public.jobs
    set status='running', claimed_at=now(), attempts=attempts+1
    where id = j.id
    returning * into j;
  return j;
end; $$;
```

Workers call `select * from public.claim_job('evaluate_event')` then process and update `status`. The combination of `for update skip locked` + per-row UPDATE prevents double-processing.

---

## 4. LangChain Agent Definitions

All chains live in `services/worker-events/src/chains/` and `services/worker-deck/src/chains/`. They are plain LCEL `Runnable`s, not LangGraph. Each chain is exported as a named function so it can be unit-tested in isolation. **Every semantic decision is made by an LLM reasoning over text — there are no embeddings or vector lookups anywhere in this pipeline.**

### 4.1 Extractor sub-agent (`extractDeckChain`)

**Purpose:** Turn an uploaded pitch deck (PDF) into per-page plain-text rows in `document_pages`. No LLM call, no embeddings, no chunking.

**Inputs:** `{ document_id, investment_id, storage_path }` (from an `extract_deck` job).

**Steps:**
1. Download the PDF from Supabase Storage via a service-role signed URL.
2. Load with `PDFLoader` from `@langchain/community/document_loaders/fs/pdf`. Returns one `Document` per page with `metadata.loc.pageNumber` populated.
3. For each page, INSERT one row into `document_pages(document_id, investment_id, page, content)`.
4. Update `documents.processed_at = now()`, `documents.page_count = N`.
5. Enqueue a `structure_thesis` job for this investment.

**Failure modes:**
- `PDFLoader.load` throws → mark `documents.processed_at = null`, write `error` to a dedicated `documents.extraction_error` field if added, surface to admin UI; no auto-retry (likely an unparseable PDF).

### 4.2 Thesis-structuring sub-agent (`structureThesisChain`)

**Purpose:** Convert raw deck text into a structured `Thesis` JSON via an LLM call, then persist each thesis component as a plain-text row in `thesis_components`.

**Inputs:** `{ investment_id }` (job payload). Internally pulls all `document_pages` for that investment.

**Steps:**
1. Load `document_pages` ordered by `page`. Concatenate `content` separated by `\n\n--- page N ---\n\n` into a single `deck_text` string.
2. If `deck_text` exceeds the reasoning model's context window, summarize per-page first with the cheap model and concatenate the summaries — the LLM, not embedding similarity, decides what to keep.
3. Run the **Thesis Structuring** prompt (`agent_logic.md` §5.1) with `.withStructuredOutput(ThesisSchema, { strict: true })`.
4. Persist the full structured object to `theses.structured_json`; bump `theses.version` if a thesis already exists for this investment.
5. For each list field (`growth_drivers`, `risks`, `catalysts`, `valuation_assumptions`, `key_metrics_to_watch`), insert one row per item into `thesis_components` with `content = <sentence>`, `component_type = <field name singular>`, `ordinal = index`. **No embedding column.**

**Schema enforcement:**
```ts
const ThesisSchema = z.object({
  growth_drivers: z.array(z.string()),
  risks: z.array(z.string()),
  catalysts: z.array(z.string()),
  valuation_assumptions: z.array(z.string()),
  price_target: z.object({
    value: z.number().nullable(),
    currency: z.string().default('USD'),
    methodology: z.string().nullable(),
  }),
  time_horizon: z.string(),
  key_metrics_to_watch: z.array(z.string()),
  extraction_notes: z.string().nullable(),
});
```

**Failure modes:** invalid JSON → one retry with `"Your previous response failed validation: <error>"` appended. If still invalid → mark `prompt_runs.status='invalid_json'`, do not version-bump `theses`, post to ops channel.

### 4.3 Categorizer sub-agent (`categorizeEventChain`) — LLM-driven

**Purpose:** Replace the keyword + regex gate with an LLM that reads the article and assigns it to a domain category and Tier-1 signal flags. Runs **once per raw event** (before triage and before per-thesis evaluation), so its result is reused across all theses that touch the same ticker.

**Inputs:** `{ raw_event_id }`.

**Steps:**
1. Load `raw_events.raw_json`. Build a normalized text view of the event:
   - For `finnhub_news` / `finnhub_press_release` / `finnhub_newsroom`: `headline`, `summary`, `source`, `url`, `datetime`, plus any structured `category` Finnhub returned (passed as a hint, never as the source of truth).
   - For `finnhub_upgrade_downgrade`: `action`, `fromGrade`, `toGrade`, `company` (analyst), `symbol`.
   - For `finnhub_executive` diff: synthesized text like `"CFO Jane Doe departure detected on 2026-05-21 — prior snapshot listed her as CFO since 2022-03"`.
   - For `finnhub_filing`: `form`, `filedDate`, `accessNumber`, `reportUrl`.
2. Run the **Event Categorizer** prompt (`agent_logic.md` §5.2) with `.withStructuredOutput(CategorySchema)`.
3. INSERT a `normalized_events` row with:
   - `category` = LLM-assigned category
   - `finnhub_category` = raw passthrough (audit only)
   - `headline`, `summary_text`, `url`, `datetime` populated from `raw_json`
   - `importance_signals.signals[]` = LLM-extracted Tier-1 flags
4. For each active thesis touching this ticker, enqueue an `evaluate_event` job.

**Schema:**
```ts
const CategorySchema = z.object({
  category: z.enum([
    'news','earnings','upgrade_downgrade','executive_change',
    'insider_txn','filing','press_release','redflag','other'
  ]),
  signals: z.array(z.enum([
    'guidance_cut','c_suite_departure','rating_downgrade','red_flag',
    'merger_acquisition','customer_win','customer_loss','product_launch',
    'partnership','dividend_change','earnings_beat','earnings_miss',
    'large_insider_sell','large_insider_buy','regulatory_action','none'
  ])).describe('All applicable signal flags; "none" if event has no material signals'),
  reasoning: z.string(),
});
```

**Why LLM, not regex:** keyword scanning misses paraphrase, sarcasm, and negation ("Acme denies guidance-cut rumor" should NOT trip a guidance-cut signal). The LLM reads the article and decides.

### 4.4 Triage sub-agent (`triageEventChain`)

**Purpose:** Decide whether a categorized event reaches the impact evaluator. Two paths feed in:

**(a) Structured-data hard gate (no LLM):** these come from typed Finnhub fields, not free text, so they bypass triage and go straight to evaluation:
- `category = 'upgrade_downgrade'` and `raw_json->>'action' = 'down'`
- `category = 'executive_change'` and the diffed role ∈ `{CEO, CFO, COO, President, Chair}`
- `category = 'filing'` and `raw_json->>'form'` ∈ `{ 'NT 10-K', 'NT 10-Q', '8-K' with item 4.02 }`

**(b) LLM signal gate (no extra LLM call):** any event where the categorizer (§4.3) set `signals` containing one of `{guidance_cut, c_suite_departure, rating_downgrade, red_flag, regulatory_action}` bypasses LLM triage and goes straight to evaluation. The signal was already determined by an LLM in §4.3.

**(c) LLM importance triage** (only if neither (a) nor (b) applies):
- Model: `LLM_TRIAGE_MODEL` (cheap)
- Output: `{ importance: 'HIGH'|'MED'|'LOW', reasoning }` via `.withStructuredOutput`
- `HIGH` → proceed to evaluator
- `MED`/`LOW` → persist `event_evaluations` row with `verdict='NEUTRAL', confidence=0, rationale=<reasoning>` and skip alert; included in monthly roll-up

**Output side effect:** writes the gate path to `normalized_events.importance_signals.gated_by[]` for auditability (e.g. `["structured:downgrade"]`, `["llm_signal:guidance_cut"]`, `["llm_triage:HIGH"]`).

### 4.5 Impact-evaluator sub-agent (`evaluateImpactChain`)

**Purpose:** Determine BREAK / SUPPORT / NEUTRAL impact by passing the full thesis and the full event text into an LLM. **No vector retrieval. No top-k. The LLM gets everything.**

**Inputs:** `normalized_event_id`, `thesis_id` (each active thesis evaluated separately).

**Steps:**
1. Load the thesis: `SELECT structured_json, raw_text FROM theses WHERE id = $thesis_id`.
2. Load all thesis components: `SELECT id, component_type, content, ordinal FROM thesis_components WHERE thesis_id = $thesis_id ORDER BY component_type, ordinal`.
3. Build the `thesis_components_block`: one component per line, prefixed with `[<uuid>] (<component_type>) <content>` so the LLM can cite IDs.
4. Load the event: headline, summary_text, url, datetime, category, signals.
5. Run the prompt — see `agent_logic.md` §5.4. Contains the verbatim required line: *"Given this thesis, does this event BREAK, SUPPORT, or have NEUTRAL impact on the thesis?"*
6. Schema:
   ```ts
   const ImpactSchema = z.object({
     verdict: z.enum(['BREAK','SUPPORT','NEUTRAL']),
     confidence: z.number().min(0).max(1),
     rationale: z.string(),
     affected_components: z.array(z.string().uuid()),
   });
   ```
7. Validate `affected_components` against the actual component UUIDs loaded in step 2; drop any not in the set (hallucination guard) and log to `prompt_runs.status='hallucinated_id'`.
8. INSERT into `event_evaluations` with `prompt_version = 'impact_evaluator@1.0.0'` and `model = LLM_REASONING_MODEL`.
9. Enqueue a `dispatch_alert` job with the resolved tier (see Routing in `agent_logic.md` §6).

**Why pass the whole thesis:** a typical SCIF thesis has 15–30 short component sentences. Total token count is a few hundred — trivial for any reasoning model. Top-k retrieval (whether by embedding or otherwise) introduces a risk of dropping the one component that actually matters, in exchange for zero token savings.

**Failure handling:** retries are governed by `Runnable.withRetry({ stopAfterAttempt: 4 })` with exponential backoff (1s, 4s, 16s). On persistent failure, the job moves to `jobs.status='failed'` with the error captured, and an ops-channel Slack notification fires. There is **no fallback to a different model or provider** — the team rotates the LLM identifier via env var if a provider outage requires it.

### 4.6 Narrative generator (`generateRollupChain`)

**Purpose:** Monthly markdown roll-up per investment.

**Inputs:** `{ investment_id, period }` ('YYYY-MM').

**Steps:**
1. Load thesis (latest version).
2. Load all `event_evaluations` for this investment in the period, joined to `normalized_events`.
3. Group by `verdict`. Format three blocks (`breaks_block`, `supports_block`, `neutrals_block`) as bulleted lists with `(YYYY-MM-DD) headline — rationale`.
4. Run the narrative prompt (see `agent_logic.md` §5.4) with `gpt-5.5`; no structured output (markdown only).
5. Upsert into `monthly_rollups` keyed by `(investment_id, period)`.
6. Enqueue a `dispatch_alert` job with `tier=3` so subscribers receive it.

### 4.7 Notifier (`dispatchAlertChain`) — non-LLM

**Purpose:** Resolve subscribers, post to Slack, record state.

**Inputs:** `alert_id`.

**Steps:**
1. Load `alert` + `normalized_event` + thesis ticker + sector.
2. Check `alerts.status = 'pending'`; if not, exit (idempotency).
3. Resolve subscribers — single SQL:
   ```sql
   select distinct s.slack_user_id
   from subscriptions s
   where s.active
     and (
       (s.scope_type='ticker'   and s.scope_value = $ticker) or
       (s.scope_type='sector'   and s.scope_value = $sector) or
       (s.scope_type='category' and s.scope_value = $category) or
       (s.scope_type='tier'     and s.scope_value::int >= $tier)
     )
     and not exists (
       select 1 from mutes m
       where m.slack_user_id = s.slack_user_id
         and m.ticker = $ticker
         and m.mute_until > now()
     );
   ```
4. Post to `SLACK_FUND_CHANNEL_ID` via `chat.postMessage` with the Tier-N Block Kit template. Record `channel_message_ts`.
5. For each subscriber: lookup `slack_user_dm_cache`; if miss, `conversations.open` and cache; then `chat.postMessage` to DM. Pace at 5/sec; respect `Retry-After` on 429.
6. Insert one `alert_recipients` row per send with `status` and `dm_message_ts`.
7. Update `alerts.status='sent'`, `sent_at=now()`.

**Failure:** if all subscribers fail, mark `alerts.status='failed'` with `error`. If only some fail, leave `alert.status='sent'` and the per-recipient row carries the failure.

### 4.8 Chain wiring (LCEL)

```ts
// services/worker-events/src/pipelines/event.ts
import { RunnableSequence } from '@langchain/core/runnables';

// Categorizer runs once per raw_event, before any per-thesis fan-out.
export const ingestPipeline = RunnableSequence.from([
  loadRawEvent,                  // (raw_event_id) => rawEvent
  categorizeEventChain,          // LLM categorizes + extracts signals
  persistNormalizedEvent,        // INSERT normalized_events
  enqueueEvaluateJobsPerThesis,  // one evaluate_event job per active thesis on this ticker
]);

// Per-thesis evaluation, driven by `evaluate_event` jobs.
export const eventPipeline = RunnableSequence.from([
  loadNormalizedEvent,           // (event_id) => normalizedEvent
  triageEventChain,              // adds .triage = HIGH|MED|LOW|GATED, no embeddings
  branch(
    e => e.triage === 'HIGH' || e.triage === 'GATED',
    RunnableSequence.from([
      loadFullThesis,            // SELECT theses + thesis_components (no vectors)
      evaluateImpactChain,       // full thesis + full event into prompt
      persistEvaluation,
      enqueueAlertJob,
    ]),
    persistTriageOnlyEvaluation, // verdict NEUTRAL, confidence 0
  ),
]);
```

---

## 5. Deployment Steps (Render)

### 5.1 Repository layout (monorepo)

```
scifxaic/
├── render.yaml                       # Blueprint
├── package.json                      # root npm workspaces
├── services/
│   ├── admin/                        # Next.js (scif-admin)
│   ├── api/                          # Express/Fastify (scif-api)
│   ├── slackbot/                     # Bolt-JS (scif-slackbot) — current app.js lives here
│   ├── worker-deck/                  # LangChain.js (scif-worker-deck)
│   ├── worker-events/                # LangChain.js (scif-worker-events)
│   └── cron/                         # 3 entrypoints: finnhub.js, digest.js, rollup.js
├── packages/
│   ├── db/                           # Supabase client wrapper, shared types
│   ├── prompts/                      # Versioned prompt templates + Zod schemas
│   └── shared/                       # Block Kit builders, utility fns
├── migrations/
│   └── 0001_init.sql … 0014_*.sql    # SQL migrations (run via Supabase CLI)
└── README.md
```

### 5.2 Render Blueprint (`render.yaml`)

```yaml
previews:
  generation: 'off'

envVarGroups:
  - name: supabase-core
    envVars:
      - { key: SUPABASE_URL, sync: false }
      - { key: SUPABASE_ANON_KEY, sync: false }
      - { key: SUPABASE_SERVICE_ROLE_KEY, sync: false }
      - { key: SUPABASE_JWT_SECRET, sync: false }
      - { key: SUPABASE_DB_URL, sync: false }
  - name: llm-keys
    envVars:
      - { key: OPENAI_API_KEY, sync: false }
      - { key: LANGSMITH_API_KEY, sync: false }
      - { key: LANGSMITH_TRACING, value: 'true' }
      - { key: LANGSMITH_PROJECT, value: 'scif-thesis-tracker' }
      - { key: LLM_TRIAGE_MODEL, value: 'gpt-5.4-mini' }
      - { key: LLM_REASONING_MODEL, value: 'gpt-5.5' }
      - { key: LLM_CATEGORIZER_MODEL, value: 'gpt-5.4-mini' }
  - name: slack-creds
    envVars:
      - { key: SLACK_BOT_TOKEN, sync: false }
      - { key: SLACK_SIGNING_SECRET, sync: false }
      - { key: SLACK_FUND_CHANNEL_ID, sync: false }
  - name: finnhub
    envVars:
      - { key: FINNHUB_API_KEY, sync: false }
      - { key: FINNHUB_BASE_URL, value: 'https://finnhub.io/api/v1' }
      - { key: FINNHUB_POLL_INTERVAL_MIN, value: '10' }
  - name: internal-auth
    envVars:
      - { key: CRON_SHARED_SECRET, generateValue: true }

services:
  - type: web
    name: scif-api
    runtime: node
    plan: starter
    region: oregon
    rootDir: services/api
    buildCommand: npm ci && npm run build
    startCommand: node dist/server.js
    healthCheckPath: /health
    autoDeployTrigger: commit
    buildFilter:
      paths: ['services/api/**', 'packages/**', 'migrations/**']
    envVars:
      - { key: NODE_VERSION, value: '22' }
      - { key: ADMIN_ORIGIN, fromService: { name: scif-admin, type: web, property: host } }
      - { fromGroup: supabase-core }
      - { fromGroup: llm-keys }
      - { fromGroup: finnhub }
      - { fromGroup: internal-auth }

  - type: web
    name: scif-admin
    runtime: node
    plan: starter
    region: oregon
    rootDir: services/admin
    buildCommand: npm ci && npm run build
    startCommand: npm start
    healthCheckPath: /api/health
    autoDeployTrigger: commit
    buildFilter:
      paths: ['services/admin/**', 'packages/shared/**']
    envVars:
      - { key: NEXT_PUBLIC_API_URL, fromService: { name: scif-api, type: web, property: host } }
      - { key: NEXT_PUBLIC_SUPABASE_URL, fromGroup: supabase-core }
      - { key: NEXT_PUBLIC_SUPABASE_ANON_KEY, fromGroup: supabase-core }

  - type: web
    name: scif-slackbot
    runtime: node
    plan: starter
    region: oregon
    rootDir: services/slackbot
    buildCommand: npm ci
    startCommand: node app.js
    healthCheckPath: /health
    autoDeployTrigger: commit
    buildFilter:
      paths: ['services/slackbot/**', 'packages/**']
    envVars:
      - { fromGroup: supabase-core }
      - { fromGroup: slack-creds }

  - type: worker
    name: scif-worker-deck
    runtime: node
    plan: starter
    region: oregon
    rootDir: services/worker-deck
    buildCommand: npm ci && npm run build
    startCommand: node dist/worker.js
    autoDeployTrigger: commit
    buildFilter:
      paths: ['services/worker-deck/**', 'packages/**']
    envVars:
      - { fromGroup: supabase-core }
      - { fromGroup: llm-keys }

  - type: worker
    name: scif-worker-events
    runtime: node
    plan: starter
    region: oregon
    rootDir: services/worker-events
    buildCommand: npm ci && npm run build
    startCommand: node dist/worker.js
    autoDeployTrigger: commit
    buildFilter:
      paths: ['services/worker-events/**', 'packages/**']
    envVars:
      - { fromGroup: supabase-core }
      - { fromGroup: llm-keys }
      - { fromGroup: slack-creds }
      - { fromGroup: finnhub }

  - type: cron
    name: scif-cron-finnhub
    runtime: node
    region: oregon
    schedule: '*/10 * * * *'
    rootDir: services/cron
    buildCommand: npm ci
    startCommand: node finnhub.js
    envVars:
      - { key: SCIF_API_HOSTPORT, fromService: { name: scif-api, type: web, property: hostport } }
      - { fromGroup: internal-auth }

  - type: cron
    name: scif-cron-digest
    runtime: node
    region: oregon
    schedule: '0 21 * * *'         # 16:00 ET = 21:00 UTC nightly
    rootDir: services/cron
    buildCommand: npm ci
    startCommand: node digest.js
    envVars:
      - { key: SCIF_API_HOSTPORT, fromService: { name: scif-api, type: web, property: hostport } }
      - { fromGroup: internal-auth }

  - type: cron
    name: scif-cron-rollup
    runtime: node
    region: oregon
    schedule: '0 11 1 * *'         # 1st of month, 06:00 ET = 11:00 UTC
    rootDir: services/cron
    buildCommand: npm ci
    startCommand: node rollup.js
    envVars:
      - { key: SCIF_API_HOSTPORT, fromService: { name: scif-api, type: web, property: hostport } }
      - { fromGroup: internal-auth }
```

### 5.3 Step-by-step deployment

1. **Provision Supabase project.** Create a new project on supabase.com. Note `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the Supavisor (transaction-mode) DB URL.
2. **Run migrations.** From the local repo: `supabase link --project-ref <ref>` then `supabase db push migrations/*.sql`. Verify the `pgcrypto` extension is enabled. There is no `pgvector` extension to enable — the system has no embeddings.
3. **Create Storage bucket.** Via Supabase Studio: bucket `pitch-decks`, private, MIME `application/pdf`, max file 50 MB. Apply storage RLS policies (admins insert, service-role select).
4. **Disable public Auth sign-ups** in Supabase → Authentication → Settings. Create the first admin row by inserting into `auth.users` (via Supabase Studio "Invite") then inserting into `public.admin_users`.
5. **Create LangSmith project.** `scif-thesis-tracker`. Grab the API key.
6. **Create Slack app.** Use the manifest from `agent_logic.md` §1.3 / `slack_docs/app-manifests` reference. Install to the workspace. Capture `xoxb-...` bot token and signing secret. Get the fund-wide channel ID via Slack's channel-details modal.
7. **Get a Finnhub API key.** Free tier; verify quota in dashboard.
8. **Push repo to GitHub.** Render will need read access to the repo.
9. **Create the Render workspace.** Connect the GitHub repo. Click "New Blueprint" and point at `render.yaml`. Render prompts for every `sync: false` env var on first sync — fill in all secrets from steps 1, 5, 6, 7.
10. **First deploy.** Render builds all eight services from the `main` branch. Watch the `scif-api` and `scif-slackbot` logs for boot success. Crons fire on their next scheduled tick.
11. **Update the Slack request URL.** Once `scif-slackbot` is live, copy its `https://scif-slackbot.onrender.com` URL and paste into the Slack app's Request URL fields (Slash Commands, Interactivity, Event Subscriptions). Verify the URL challenge.
12. **Smoke tests:**
    - From admin frontend: sign in as admin, upload a sample PDF, watch `documents.processed_at` flip from null to a timestamp within ~60 s. Verify `thesis_components` rows exist.
    - From Slack: run `/subscribe ticker:NVDA`, run `/my-subscriptions`. Verify rows in `subscriptions` table.
    - Trigger a manual cron: from Render dashboard click "Trigger Run" on `scif-cron-finnhub`. Verify `raw_events` rows arrive and downstream evaluations land.
    - Verify Slack alert delivery via a manually-inserted `alerts` row with `status='pending'` — the worker should pick it up and post to the fund channel within seconds.
13. **Enable LangSmith.** Trigger any LLM-bearing chain; verify traces appear at `smith.langchain.com`.
14. **Configure log retention.** Render dashboard → workspace settings; on Starter, logs are 7-day retained — ship to Datadog later if compliance requires longer.
15. **Document on-call.** README links to a runbook covering: re-running a stuck job, re-issuing a deleted Slack subscription, rotating Slack tokens, rotating Supabase service-role key.

### 5.4 Health checks

| Service | Path | Logic |
|---------|------|-------|
| scif-api | `/health` | `select 1` against Supabase; 200 if reachable, 503 otherwise |
| scif-admin | `/api/health` | Next.js route returning `{ok:true}` |
| scif-slackbot | `/health` | Already in `app.js` — returns `{ok:true}` |
| Workers | n/a | No inbound traffic; Render restarts crashed processes |
| Crons | n/a | Render shows last-run status; external uptime monitor on `scif-api` `/health` |

### 5.5 Logs and observability

- **Render dashboard** for stdout/stderr per service.
- **LangSmith** for full LLM traces (every chain auto-instrumented).
- **`prompt_runs` table** for in-DB cost + latency history (queryable via the admin frontend).
- **Slack ops channel** (`#scif-ops`) for worker error notifications — workers post a low-priority message to this channel when an alert dispatch or job retry exhausts attempts.

### 5.6 Service-to-service communication summary

| From | To | Path | Auth |
|------|----|------|------|
| Admin frontend | scif-api | Public HTTPS (CORS-locked) | Supabase JWT in `Authorization` |
| Admin frontend | Supabase Storage | Public HTTPS | Supabase JWT |
| scif-api → Supabase | Public HTTPS | Service-role key |
| scif-slackbot → Supabase | Public HTTPS | Service-role key |
| Workers → Supabase | Public HTTPS (Supavisor 6543) | Service-role key |
| Workers → Slack | Public HTTPS | `SLACK_BOT_TOKEN` |
| Workers → LLM provider | Public HTTPS | `OPENAI_API_KEY` |
| Crons → scif-api | **Render private network** | `Bearer $CRON_SHARED_SECRET` |
| Slack → scif-slackbot | Public HTTPS | Slack signing-secret HMAC (Bolt built-in) |

---
