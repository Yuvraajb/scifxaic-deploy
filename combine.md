# SCIF Thesis Tracker — Integration Plan: MVP → Larger Codebase

## 1. Current State

Two parallel systems live in this repo today:

**A. `mvp/` — Node/JS Classification Agent** (single source of LLM reasoning)
- `mvp/src/run.js` — 10-min cycle: `pollFinnhub() → classifyAllPending() → dispatchAll()`.
- `mvp/src/finnhub.js` — pulls `GET /api/v1/company-news` per ticker, caps 5/ticker, paces 250 ms between calls.
- `mvp/src/classify.js` — LangChain `createAgent` + `ChatOpenAI` agent that terminates by calling the `classify_article` tool. Three labels only: `HIGH_ALERT | MONTHLY_OVERVIEW | IGNORE`.
- `mvp/src/tools.js` — four tools: `get_thesis`, `get_recent_classifications`, `fetch_article_body`, `classify_article`.
- `mvp/src/db.js` — local **SQLite** (`./data/scif.db`, WAL).
- `mvp/src/dispatch.js` — appends to two flat markdown files (`overviews/HIGH_ALERTS.md`, `overviews/MONTHLY_OVERVIEWS.md`).
- `mvp/src/seed.js` — three seeded portfolio companies (NVDA, MSFT, LLY) with structured theses.

**B. `scif-slack-bot/` — Python Slack worker** (delivery + UI surface)
- `scheduler.py` — polls Finnhub every 15 min via `news_fetcher.py`, classifies with **Gemini** (`classifier.py`), routes to instant alerts or daily digest.
- `alerts.py` — Block Kit alert payloads (`send_instant_alert`, public API ready for external callers).
- `bot.py` — Slack Bolt app, Socket Mode, `/subscribe`, `/unsubscribe`, `/subscriptions`.
- `subscriptions.py` — sector→user map in `subscriptions.json` (file-backed).
- `scheduler.py` — seen-state in `seen_articles.json`, digest queue in `digest_queue.json`.
- Already deployed via `render.yaml` (`type: worker`, `rootDir: scif-slack-bot`).

**C. `src/` — Vite/React/TS frontend** (no backing service today).

**D. `supabase/migrations/` — empty.**

### The duplication problem
Both systems poll Finnhub, both classify, both maintain their own state, and they disagree on the label vocabulary (MVP: 3-label thesis-relevance; Slack bot: `material/verdict/urgent/event_type` + `BREAKS/SUPPORTS/NEUTRAL`). The MVP's tool-using agent is the better reasoning core; the Slack bot is the better delivery surface; neither has a durable backing store the frontend can read.

## 2. Target Architecture

One pipeline, one source of truth:

```
                                       ┌── overviews/*.md (kept; live audit log)
                                       │
Finnhub poll ─► Supabase (articles) ─► Classification Agent (mvp, JS) ─► Supabase (classifications)
   (mvp)                                              │                          │
                                                     ▼                          ▼
                                          Render worker loop          Slack delivery (HIGH_ALERT only)
                                                                              │
                                                                     React frontend reads
                                                                     Supabase for the analyst view
```

Specifically:
1. **MVP becomes the only classifier.** Slack bot's `classifier.py` and `news_fetcher.py` are deleted; Slack bot becomes a pure consumer of `articles` rows where `classification = 'HIGH_ALERT'`.
2. **SQLite → Supabase Postgres.** Same schema (`companies`, `theses`, `articles`), moved to Supabase so React + Slack worker + MVP all share one store.
3. **MVP runs on Render** as a second `worker` service alongside the Slack bot, using the same Finnhub key.
4. **React frontend reads Supabase directly** for the dashboard (analyst portfolio view, recent classifications, thesis editor).

## 3. Design Decisions, With Citations

Every decision below cites the specific `.md` file(s) it draws from. **No MCP / Context7 sources used — only the local `langchain_docs/`, `finnhub_docs/`, `render_docs/`, `slack_docs/`, `supabase_docs/` trees.**

### 3.1 Keep `createAgent` as the classification core
**Decision:** Reuse `mvp/src/classify.js` unchanged. The four-tool agent (with `classify_article` as the terminator) is already idiomatic LangChain.

**Sources:**
- `langchain_docs/oss/javascript/langchain/agents.md` — "`createAgent()` provides a production-ready agent implementation. An agent runs until a stop condition is met — i.e., when the model emits a final output or an iteration limit is reached." The MVP's pattern of letting the agent terminate by calling `classify_article` matches the documented stop-condition contract exactly.
- `langchain_docs/oss/javascript/langchain/tools.md` — "The simplest way to create a tool is by importing the `tool` function from the `langchain` package." Also: "Prefer `snake_case` for tool names … Sticking to alphanumeric characters, underscores, and hyphens helps to improve compatibility across providers." `mvp/src/tools.js` already follows both rules; nothing to change.

### 3.2 Replace SQLite with Supabase Postgres
**Decision:** Port the three tables (`companies`, `theses`, `articles`) from `mvp/src/db.js` into a new Supabase migration under `supabase/migrations/`. Drop `better-sqlite3`; add `@supabase/supabase-js` to `mvp/package.json`.

**Sources:**
- `supabase_docs/guides/database/overview.md` — "Every Supabase project comes with a full Postgres database." Confirms a managed Postgres is available with no extra ops, removing the need for SQLite + a persistent disk on Render.
- `supabase_docs/guides/database/connecting-to-postgres.md` — "For application traffic from persistent clients, and support for both IPv4 and IPv6, use **pooler session mode**." The MVP worker is a persistent client → use the session-mode pooler connection string, not the direct connection.
- `supabase_docs/reference/javascript/initializing.md` — Standard `createClient(supabaseUrl, supabaseKey)` entrypoint for the Node worker.
- `supabase_docs/reference/javascript/insert.md` — "By default, inserted rows are not returned. To return it, chain the call with `.select()`." Use this for the `articles` insert path so the agent's downstream code keeps receiving the row id without a second round-trip.

### 3.3 Reuse the existing schema verbatim — three labels, structured thesis
**Decision:** The Supabase tables match `mvp/src/db.js` 1:1, including the `check (classification in ('HIGH_ALERT','MONTHLY_OVERVIEW','IGNORE'))` constraint, the `unique (source, source_event_id)` constraint, and the partial index `idx_articles_pending on articles(classification) where classification is null`.

Rationale: the MVP already has the project's no-embeddings + three-label discipline baked into this schema. The Slack bot's overlapping `BREAKS/SUPPORTS/NEUTRAL + urgent` vocabulary is **dropped**; HIGH_ALERT replaces "urgent + material" in one step.

### 3.4 Article ingestion: keep MVP's Finnhub puller
**Decision:** Keep `mvp/src/finnhub.js` as the only Finnhub caller. Delete `scif-slack-bot/news_fetcher.py`.

**Sources:**
- `finnhub_docs/company-news.md` — confirms response shape (`id, datetime, headline, summary, url, source, image, related`). MVP's `insertArticle` already maps these into the schema exactly.
- `finnhub_docs/rate-limit.md` — "On top of all plan's limit, there is a 30 API calls/ second limit. If your limit is exceeded, you will receive a response with status code `429`." MVP already paces at 250 ms (≈4 req/s, well under 30). Keep the cap. The classifier's `transient` branch in `mvp/src/classify.js` already handles 429 by halting the cycle, consistent with this doc.
- `finnhub_docs/websocket-news.md` — websocket news exists but the MVP intentionally uses the polling REST endpoint. Decision: **stay on REST**; websocket would force long-lived connections per Finnhub WS and complicate Render restart semantics (`render_docs/background-workers.md` documents the worker shape we want — a polling loop is the canonical worker pattern). Revisit if HIGH_ALERT latency becomes a complaint.

### 3.5 Dispatch fans out two ways
**Decision:** `mvp/src/dispatch.js` is split into:
- `dispatchOne()` keeps writing the markdown audit log (`overviews/HIGH_ALERTS.md`, `overviews/MONTHLY_OVERVIEWS.md`) — this is the human-readable trail.
- A new `notifySlack(article)` step **only** fires for `HIGH_ALERT`, posting to the existing Slack channel via the Slack Web API.

**Sources:**
- `slack_docs/messaging__sending-and-scheduling-messages.md` — "we'll use that token to make some [Web API](/apis/web-api/) calls." Confirms the right surface is `chat.postMessage` over the Web API with a `chat:write` token (the Slack bot already has this scope per `scif-slack-bot/README.md` step 2).
- `slack_docs/apis__events-api__using-socket-mode.md` — Socket Mode is only required for receiving events/interactions. **Outbound posting does not need Socket Mode.** The MVP worker therefore does not need an app-level token; it can post with the existing `SLACK_BOT_TOKEN`.
- `scif-slack-bot/alerts.py` already exports `build_alert_blocks()` returning a Block Kit payload. The simplest seam is to port that builder to JS in `mvp/src/slack.js` (or call out to the Python service over an internal endpoint). **Pick the JS port** — one fewer service to coordinate, and Block Kit is just JSON. The block structure stays the same so the Slack-side UX is unchanged.

### 3.6 Drop Gemini, drop the Slack bot's classifier
**Decision:** Delete `scif-slack-bot/classifier.py` and the Gemini dependency. The Slack bot becomes alert-only.

Rationale: two LLMs disagreeing on the same headline is the worst possible state. The MVP's `createAgent` reasoning loop is strictly more capable (per `langchain_docs/oss/javascript/langchain/agents.md`'s tool-loop model) and is already wired to the structured theses, so it wins.

### 3.7 Subscriptions table moves to Supabase
**Decision:** The current `scif-slack-bot/subscriptions.json` is migrated to a `subscriptions(user_id text, sector text)` table in Supabase. The Slack bot's `/subscribe` handler writes to Supabase instead of the file.

**Sources:**
- `supabase_docs/guides/database/postgres/row-level-security.md` — "RLS _must_ always be enabled on any tables stored in an exposed schema." Since the React frontend will read Supabase directly with the anon key, **all four tables** (`companies`, `theses`, `articles`, `subscriptions`) get RLS enabled. Initial policy: `select` allowed for anon on `companies`/`articles`/`theses`; `subscriptions` is service-role only (the Slack bot uses the service-role key from the Render worker).
- `supabase_docs/reference/javascript/insert.md` and `supabase_docs/reference/javascript/initializing.md` for the actual client calls in the new `subscriptions` write path.

### 3.8 Render deployment topology
**Decision:** Two `worker` services in one Blueprint:

```yaml
services:
  - type: worker
    name: scif-classifier        # NEW — runs mvp/src/run.js
    runtime: node
    rootDir: mvp
    buildCommand: npm ci
    startCommand: npm start
    envVars:
      - key: OPENAI_API_KEY
        sync: false
      - key: FINNHUB_API_KEY
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: SLACK_BOT_TOKEN
        sync: false
      - key: SLACK_CHANNEL_ID
        sync: false
      - key: POLL_INTERVAL_MIN
        value: "10"

  - type: worker
    name: scif-slack-bot         # EXISTING — slimmed down
    runtime: python
    rootDir: scif-slack-bot
    buildCommand: pip install -r requirements.txt
    startCommand: python main.py
    envVars:
      - key: SLACK_BOT_TOKEN
        sync: false
      - key: SLACK_APP_TOKEN
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
```

**Sources:**
- `render_docs/background-workers.md` — "Background workers are services that run continuously … but they don't receive any incoming network traffic. Instead, these services usually poll a task queue … and process new tasks as they come in." A Finnhub polling loop is exactly this pattern → both services stay as `type: worker`.
- `render_docs/cronjobs.md` — considered for the classifier; rejected. Cron jobs run "periodically on a schedule," but the MVP's `run.js` keeps in-memory state across cycles (LangChain agent initialization, `setInterval`) and benefits from a warm process. Worker is the right primitive.
- `render_docs/monorepo-support.md` — "Set a service's [root directory] to ignore file changes _outside_ that directory." The Blueprint above uses `rootDir: mvp` and `rootDir: scif-slack-bot` so each service rebuilds only when its own files change.
- `render_docs/blueprint-spec.md` — confirms the `services[].envVars[].sync: false` pattern for secrets (Render prompts for values in the dashboard, never committed). Matches the existing `render.yaml`.
- `render_docs/configure-environment-variables.md` — "Don't commit the values of secret credentials to your `render.yaml` file! Instead, you can declare placeholder environment variables for secret values that you then populate from the Render Dashboard." All API keys above use `sync: false`.
- `render_docs/disks.md` — explicitly **not** using a persistent disk. The current `mvp/data/scif.db` lives on local SSD; once we move to Supabase, the worker filesystem is allowed to be ephemeral, which is Render's default. The markdown audit log under `overviews/` is the only filesystem write; we'll either (a) attach a small persistent disk for it, or (b) mirror those rows into Supabase and treat the markdown files as a local-dev-only convenience. **Recommendation: (b)** — disks add cost and complicate the deploy, and Supabase already has the data.

### 3.9 Frontend (React) reads Supabase directly
**Decision:** Wire `src/` to `@supabase/supabase-js` with the anon key, read-only against `articles` + `companies` + `theses`. No new API server.

**Sources:**
- `supabase_docs/reference/javascript/initializing.md` — anon-key `createClient` is exactly the browser-side pattern intended for frontend use.
- `supabase_docs/guides/database/postgres/row-level-security.md` — "Supabase allows convenient and secure data access from the browser, **as long as you enable RLS.**" The RLS policies from §3.7 enforce read-only access from the browser.

### 3.10 Observability / failure handling stays
- `mvp/src/classify.js` already distinguishes transient (`401/403/429/5xx → halt cycle`) from non-transient (`record IGNORE, move on`). Keep both behaviors.
- `finnhub_docs/rate-limit.md` is the justification for halting on 429.
- `langchain_docs/oss/javascript/langchain/agents.md` (stop-condition section) justifies the "agent terminated without calling classify_article → IGNORE with rationale" fallback already in `classifyNext()`.

## 4. Migration Steps (in execution order)

1. **Supabase project bootstrap**
   - Create project. Capture URL + service-role + anon keys.
   - Write `supabase/migrations/0001_init.sql` with the schema from `mvp/src/db.js` (with `id` as `bigserial`, `published_at` as `timestamptz`, `ingested_at default now()`).
   - Add `subscriptions(user_id text, sector text, primary key (user_id, sector))`.
   - Enable RLS on all four tables per `supabase_docs/guides/database/postgres/row-level-security.md`; write policies (anon read for `articles/companies/theses`; service-role only for `subscriptions`).

2. **Port `mvp/src/db.js`**
   - Replace `better-sqlite3` Database with a `@supabase/supabase-js` client.
   - Replace the prepared statements in `db.js`, `finnhub.js`, `classify.js`, `tools.js`, `dispatch.js` with `from('articles').insert(...).select()` / `.update()` / `.select()` calls per `supabase_docs/reference/javascript/insert.md` and `supabase_docs/reference/javascript/select.md`.
   - The hot path (`claimRow` in `classify.js`) becomes `select * from articles where classification is null order by published_at limit 1` against Supabase; the same partial index from the migration keeps this cheap.

3. **Seed**
   - Convert `mvp/src/seed.js` to upsert into the Supabase tables. Run once at deploy time (Render `initialDeployHook` per `render_docs/blueprint-spec.md`).

4. **Slack outbound port**
   - New `mvp/src/slack.js`: port `build_alert_blocks()` from `scif-slack-bot/alerts.py` to JS. Same block structure.
   - In `dispatch.js`, when `article.classification === 'HIGH_ALERT'`, also POST to `https://slack.com/api/chat.postMessage` with `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID`. Source: `slack_docs/messaging__sending-and-scheduling-messages.md`.

5. **Slim down `scif-slack-bot/`**
   - Delete `news_fetcher.py`, `classifier.py`, `scheduler.py`, `digest.py` (digest can be re-added later as a Supabase scheduled query if needed).
   - Rewrite `subscriptions.py` to read/write the Supabase `subscriptions` table.
   - `bot.py` keeps `/subscribe`, `/unsubscribe`, `/subscriptions` over Socket Mode (`slack_docs/apis__events-api__using-socket-mode.md` confirms Socket Mode is the right transport for receiving slash commands without a public URL).

6. **Render Blueprint update**
   - Edit `render.yaml` to add the new `scif-classifier` worker and the new env vars per `render_docs/blueprint-spec.md` + `render_docs/monorepo-support.md`.
   - Push; Render rebuilds only the affected `rootDir`.

7. **Frontend wiring**
   - Add `@supabase/supabase-js` to `package.json`.
   - `src/services/supabase.ts`: `createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)`.
   - Build read-only views over `articles` + `theses`.

## 5. Things Explicitly Out of Scope
- **No embeddings, no pgvector, no retrieval.** Three-label thesis-relevance only.
- **No new classifier labels.** `HIGH_ALERT | MONTHLY_OVERVIEW | IGNORE` stay as-is.
- **No websocket Finnhub feed.** Polling REST stays, per §3.4.
- **No digest** in the first cut. If reintroduced later, it's a daily Supabase query over `articles where classification = 'MONTHLY_OVERVIEW' and published_at >= now() - interval '1 day'`, not a stateful queue file.
- **No persistent disk on Render.** All durable state lives in Supabase.

## 6. Open Questions
1. Do we want to keep `overviews/HIGH_ALERTS.md` as a real artifact, or is the Supabase row + Slack message enough? (Recommendation: drop the file, query Supabase.)
2. Frontend auth — anon read is fine for an internal-only deployment, but if the dashboard ever leaves the team we need Supabase Auth + per-user RLS policies (covered conceptually by `supabase_docs/guides/database/postgres/row-level-security.md`).
3. Where does the thesis editor live? Today theses are seeded in code (`mvp/src/seed.js`). If analysts need to edit them, the React app needs a write path — which means real auth + RLS, not anon.
