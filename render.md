# Render Migration: Functions → HTTP Endpoints

This document specifies how to wrap the catalogued functions in `scif-slack-bot/` (Python) and `mvp/src/` (JS) as HTTP endpoints on Render, alongside the existing Slack-bot worker.

All Render guidance below is sourced strictly from this repo's `render_docs/` folder. File names cited in parentheses point to `render_docs/<file>.md`.

---

## 1. Why Render needs HTTP wrappers in the first place

Render has no function-as-a-service / serverless offering. Per `service-types.md`, the only ways to run code on Render are: web service, static site, private service, background worker, cron job, or workflow (`service-types.md:1-12`).

- A **web service** is "the most common service type. Dynamic web apps with a public `onrender.com` subdomain for receiving traffic over HTTP" (`service-types.md:68-72`).
- A **background worker** runs "internal apps that run continuously... Background workers do *not* expose a URL or internal hostname" (`service-types.md:106-115`). This is what `render.yaml` currently uses for `scif-slack-bot`.
- A **private service** is "just like a web service" but only reachable on Render's private network (`private-services.md:1-12`). Useful if endpoints should only be callable from other Render services, not the public internet.

To expose any Python or JS function as an endpoint, it must be served by a long-running HTTP process inside a `type: web` (public) or `type: pserv` (private) service. Every web service "must bind to a port on host `0.0.0.0` to serve HTTP requests. The default expected port is `10000`" (`web-services.md` port-binding note, lines 7-9).

---

## 2. Framework choice per side

### 2.1 Python side — FastAPI

Use **FastAPI** for `scif-slack-bot/` endpoints.

Render documents FastAPI as a first-class supported framework in `deploy-fastapi.md`. The recommended start command from that doc is `uvicorn main:app --host 0.0.0.0 --port $PORT` (`deploy-fastapi.md:10-15`), which satisfies the `0.0.0.0` binding requirement in `web-services.md`.

Reasons over Flask:

- Native async — matches the existing `requests` / Slack-bot pattern without adding a WSGI server like Gunicorn (Flask's recommended start command is `gunicorn app:app`, `deploy-flask.md:23-30`).
- Pydantic models give the team request/response schemas for free, mirroring the existing JSON-shaped tool I/O in `classifier.py`.
- Auto-generates OpenAPI / `/docs` UI — useful for CS1/CS2 teammates who already import these functions today.

Flask is acceptable as an alternative; Render supports it the same way (`deploy-flask.md`). Either choice keeps `Language: Python 3`, `Build Command: pip install -r requirements.txt`.

### 2.2 JS side — Express

Use **Express** for `mvp/src/` endpoints.

Render documents Express in `deploy-node-express-app.md` with `Language: Node`, `Build Command: yarn` (or `npm install`), `Start Command: node app.js` (`deploy-node-express-app.md:14-22`). The existing `mvp/package.json` already uses `"type": "module"` and Node, so Express drops in cleanly.

Reasons over Fastify:

- Larger ecosystem, less surprise for collaborators.
- Fastify's default `.listen` binds to `localhost`, not `0.0.0.0`; Render explicitly calls this out as a setup pitfall ("Fastify's `.listen` method default binding uses `localhost` (`127.0.0.1`), whereas Render requires `0.0.0.0`", `deploy-node-fastify-app.md:5-7`). Express avoids that footgun.

---

## 3. New files and where they live

The repo is effectively a monorepo: two roots (`scif-slack-bot/` Python, `mvp/` JS) with separate `requirements.txt` / `package.json`. Render supports this directly — set a per-service `rootDir` to "ignore file changes *outside* that directory" (`monorepo-support.md:30-36`). The existing worker already does so (`rootDir: scif-slack-bot`).

```
scifxaic/
├── render.yaml                 # extended (see §5)
├── render.md                   # this file
│
├── scif-slack-bot/             # existing Python worker dir
│   ├── api.py                  # NEW — FastAPI app, imports existing modules
│   ├── requirements.txt        # add: fastapi, uvicorn[standard]
│   ├── alerts.py
│   ├── digest.py
│   ├── classifier.py
│   ├── news_fetcher.py
│   ├── subscriptions.py
│   ├── scheduler.py
│   ├── main.py                 # untouched — still entry point for worker
│   └── ...
│
└── mvp/                        # existing JS CLI dir
    ├── package.json            # add: express
    └── src/
        ├── server.js           # NEW — Express app, imports existing modules
        ├── run.js              # untouched — still CLI loop entry
        ├── classify.js
        ├── dispatch.js
        ├── finnhub.js
        ├── tools.js
        └── ...
```

No existing files move. The HTTP entry points (`api.py`, `server.js`) are pure adapters: they import the already-exported functions and bind them to routes.

---

## 4. Function-to-route mapping

Method/path choices below follow REST conventions. Bodies are JSON.

### 4.1 Python (`scif-slack-bot/api.py`, FastAPI)


| Function (source)                                    | Method + Path                              | Body / Query                                           | Notes                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `classifier.classify_news(...)`                      | `POST /classify`                           | `{company, ticker, sector, thesis, headline, summary}` | Pure function; ideal endpoint candidate. Returns `{material, verdict, urgent, event_type, explanation}` or 502 on Gemini failure. |
| `news_fetcher.fetch_company_news(ticker, days_back)` | `GET /news/{ticker}?days_back=1`           | path + query                                           | Thin Finnhub proxy.                                                                                                               |
| `alerts.build_alert_blocks(...)`                     | `POST /alerts/preview`                     | alert payload                                          | Returns Slack Block Kit JSON without posting.                                                                                     |
| `alerts.format_alert_text(...)`                      | `POST /alerts/preview-text`                | alert payload                                          | Plain-text variant.                                                                                                               |
| `alerts.send_instant_alert(...)`                     | `POST /alerts/instant`                     | alert payload + optional `channel`                     | Posts to Slack channel; needs `SLACK_BOT_TOKEN` in env.                                                                           |
| `alerts.send_dm_alert(user_id, ...)`                 | `POST /alerts/dm/{user_id}`                | alert payload                                          | DMs a single analyst.                                                                                                             |
| `digest.build_digest_blocks/text(...)`               | `POST /digest/preview`                     | `{events, month_label?}`                               | Returns Block Kit or text without posting.                                                                                        |
| `digest.send_monthly_digest(events, ...)`            | `POST /digest/send`                        | `{events, channel?, month_label?}`                     | Posts digest to Slack.                                                                                                            |
| `subscriptions.subscribe(user_id, sector)`           | `POST /subscriptions/{user_id}`            | `{sector}`                                             |                                                                                                                                   |
| `subscriptions.subscribe_all(user_id)`               | `POST /subscriptions/{user_id}/all`        | —                                                      |                                                                                                                                   |
| `subscriptions.unsubscribe(user_id, sector)`         | `DELETE /subscriptions/{user_id}/{sector}` | —                                                      |                                                                                                                                   |
| `subscriptions.unsubscribe_all(user_id)`             | `DELETE /subscriptions/{user_id}`          | —                                                      |                                                                                                                                   |
| `subscriptions.get_subscriptions(user_id)`           | `GET /subscriptions/{user_id}`             | —                                                      |                                                                                                                                   |
| `subscriptions.get_subscribers_for_sector(sector)`   | `GET /subscribers?sector=...`              | query                                                  |                                                                                                                                   |
| `scheduler.poll_news(client)`                        | `POST /admin/poll`                         | —                                                      | Manual trigger; instantiates a Slack `WebClient` server-side. Protect (see §6.3).                                                 |
| `scheduler.send_daily_digest(client)`                | `POST /admin/digest`                       | —                                                      | Manual trigger. Protect.                                                                                                          |
| `main.run_mock_demo()`                               | `POST /admin/demo`                         | —                                                      | Dry-run smoke test. Protect.                                                                                                      |


Skeleton (FastAPI + uvicorn, exactly as documented in `deploy-fastapi.md:14`):

```python
# scif-slack-bot/api.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from classifier import classify_news
from news_fetcher import fetch_company_news
from alerts import send_instant_alert, build_alert_blocks
from digest import send_monthly_digest, build_digest_blocks
from subscriptions import (
    subscribe, subscribe_all, unsubscribe, unsubscribe_all,
    get_subscriptions, get_subscribers_for_sector,
)

app = FastAPI()

class ClassifyRequest(BaseModel):
    company: str
    ticker: str
    sector: str
    thesis: str
    headline: str
    summary: str = ""

@app.post("/classify")
def classify(req: ClassifyRequest):
    result = classify_news(**req.model_dump())
    if result is None:
        raise HTTPException(status_code=502, detail="classifier unavailable")
    return result

# ... remaining routes follow the same pattern
```

Start command (per `deploy-fastapi.md:14`): `uvicorn api:app --host 0.0.0.0 --port $PORT`.

### 4.2 JS (`mvp/src/server.js`, Express)


| Function (source)                                        | Method + Path                           | Body / Query         | Notes                                                       |
| -------------------------------------------------------- | --------------------------------------- | -------------------- | ----------------------------------------------------------- |
| `finnhub.pollFinnhub()`                                  | `POST /poll`                            | —                    | Triggers one Finnhub poll cycle.                            |
| `classify.classifyNext()`                                | `POST /classify/next`                   | —                    | Classifies the oldest pending article.                      |
| `classify.classifyAllPending()`                          | `POST /classify/all`                    | —                    | Drains the pending queue. Long-running — see §6.4.          |
| `dispatch.dispatchOne(article)`                          | `POST /dispatch/one`                    | `{article}`          |                                                             |
| `dispatch.dispatchAll()`                                 | `POST /dispatch/all`                    | —                    |                                                             |
| `tools.get_thesis({ticker})`                             | `GET /thesis/{ticker}`                  | path                 | Already structured as a tool — wrap by calling its handler. |
| `tools.get_recent_classifications({ticker, limit})`      | `GET /classifications/{ticker}?limit=N` | path + query         |                                                             |
| `tools.fetch_article_body({article_id})`                 | `GET /articles/{article_id}/body`       | path                 |                                                             |
| `tools.classify_article({article_id, label, rationale})` | `POST /articles/{article_id}/classify`  | `{label, rationale}` | Writes DB row + markdown file.                              |


Skeleton (Express, matches the start command convention in `deploy-node-express-app.md:14-22`):

```javascript
// mvp/src/server.js
import express from 'express';
import { config as loadEnv } from 'dotenv';
loadEnv({ override: true });

import { pollFinnhub } from './finnhub.js';
import { classifyNext, classifyAllPending } from './classify.js';
import { dispatchOne, dispatchAll } from './dispatch.js';

const app = express();
app.use(express.json());

app.post('/poll', async (_req, res) => {
  try {
    const inserted = await pollFinnhub();
    res.json({ inserted });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/classify/next', async (_req, res) => {
  const result = await classifyNext();
  res.json(result ?? { status: 'no pending articles' });
});

// ... remaining routes

const port = Number(process.env.PORT || 10000);
app.listen(port, '0.0.0.0', () => console.log(`server on :${port}`));
```

The explicit `'0.0.0.0'` bind is required per the web-service port-binding rule (`web-services.md:7-9`). Default expected port is `10000`; Render also sets `$PORT` in the runtime environment, which the snippet honors.

---

## 5. `render.yaml` changes

Current file (worker only):

```yaml
services:
  - type: worker
    name: scif-slack-bot
    runtime: python
    rootDir: scif-slack-bot
    buildCommand: pip install -r requirements.txt
    startCommand: python main.py
    envVars:
      - key: SLACK_BOT_TOKEN
        sync: false
      - key: SLACK_APP_TOKEN
        sync: false
      - key: SLACK_CHANNEL_ID
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: FINNHUB_API_KEY
        sync: false
```

Extended file (worker + two web services). Field syntax follows `blueprint-spec.md:13-65`:

```yaml
services:
  # 1. Existing Slack-bot worker — Supabase env vars added so the worker
  #    and the new web services read/write the same shared state (§6.2).
  - type: worker
    name: scif-slack-bot
    runtime: python
    rootDir: scif-slack-bot
    buildCommand: pip install -r requirements.txt
    startCommand: python main.py
    envVars:
      - key: SLACK_BOT_TOKEN
        sync: false
      - key: SLACK_APP_TOKEN
        sync: false
      - key: SLACK_CHANNEL_ID
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: FINNHUB_API_KEY
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: SUPABASE_DB_URL
        sync: false

  # 2. NEW — Python HTTP surface (FastAPI).
  - type: web
    name: scif-api
    runtime: python
    rootDir: scif-slack-bot
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn api:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /docs
    envVars:
      - key: SLACK_BOT_TOKEN
        sync: false
      - key: SLACK_CHANNEL_ID
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: FINNHUB_API_KEY
        sync: false
      - key: SUPABASE_URL
        sync: false        # https://<project-ref>.supabase.co
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false        # server-side only; bypasses RLS
      - key: SUPABASE_DB_URL
        sync: false        # optional, Supavisor session pooler postgres://...:5432/postgres
      - key: API_AUTH_TOKEN
        sync: false        # see §6.3

  # 3. NEW — JS HTTP surface (Express).
  - type: web
    name: scif-mvp-api
    runtime: node
    rootDir: mvp
    buildCommand: npm install
    startCommand: node src/server.js
    healthCheckPath: /
    envVars:
      - key: FINNHUB_API_KEY
        sync: false
      - key: OPENAI_API_KEY
        sync: false
      - key: LLM_MODEL
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: SUPABASE_DB_URL
        sync: false
      - key: API_AUTH_TOKEN
        sync: false
```

Notes on the new fields:

- `type: web` plus the start command/host/port comes straight from `deploy-fastapi.md:14` (Python) and `deploy-node-express-app.md:14-22` (JS).
- `rootDir` scopes builds and redeploys to one subtree of the monorepo (`monorepo-support.md:30-36`).
- `healthCheckPath` is listed in `blueprint-spec.md:81` and is highly recommended for web services. `/docs` exists automatically on FastAPI; for Express, add a tiny `GET /` returning `200`.
- `sync: false` causes Render to "prompt for a value in the Render Dashboard" instead of committing the secret (`blueprint-spec.md:49`). Same pattern the existing worker already uses.
- Public access can be disabled per service with `renderSubdomainPolicy: disabled` (`blueprint-spec.md:42`) if the team wants endpoints reachable only via custom domains.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` are duplicated across all three services above. They are good candidates for a Render **environment group** referenced via `fromGroup` (`blueprint-spec.md:59`) so the values live in one place. Treat the service-role key as a production secret — it bypasses Supabase RLS.

To make `scif-api` reachable *only* by other Render services (not the public internet), change `type: web` to `type: pserv` (private service). Per `private-services.md:1-12`, private services are "just like web services" but skip the `onrender.com` subdomain.

---

## 6. Shared code, auth, and config concerns

### 6.1 Environment variables and secrets

Both new services need every secret the existing worker uses (Slack tokens, Finnhub key, Gemini key, OpenAI key). Declare them under each service's `envVars` with `sync: false`, exactly as the current worker does (`blueprint-spec.md:43-49`). Render will prompt for values on first deploy.

If many services will share the same secret set, factor them into an environment group and reference with `fromGroup` (`blueprint-spec.md:59`).

### 6.2 Shared state — Supabase Postgres (hard requirement)

Render's default filesystem is ephemeral: "without a persistent disk, any changes you make to a service's local files are *lost* every time the service redeploys or restarts" (`disks.md:1-7`). Today the Python bot persists state via three JSON files (`subscriptions.py:22`, `scheduler.py:33-34`); the JS MVP persists state in a local SQLite DB (`mvp/src/db.js`). On the existing worker this already loses data on every deploy.

Render-native options (persistent disk, Render Postgres, Render Key Value) are **not used** for this project. State lives in **Supabase Postgres**, which all three Render services (worker + two web services) connect to over the network. This is a clean fit:

- A Supabase project *is* a managed Postgres instance. The Render-side change is just env vars + a client library — no Render data product is provisioned.
- Render's "disk can only attach to one service" limitation (`disks.md`) does not apply: Supabase is reached over the network, so the worker and both web services read/write the same tables.
- The empty `supabase/migrations/` directory at the repo root is where schema migrations belong.

Connection options from Render → Supabase (`supabase_docs/guides/database/connecting-to-postgres/serverless-drivers.md`):


| From                                                       | Recommended path                                                                                       | Why                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Python (`scif-slack-bot/`) — worker + FastAPI              | `**supabase-py` SDK** using `SUPABASE_URL` + service-role key                                          | Server-side trusted code; SDK wraps PostgREST, no connection-pool tuning needed. Init pattern in `supabase_docs/reference/python/initializing.md`.                                                     |
| JS (`mvp/`) — Express + CLI                                | `**@supabase/supabase-js`** using `SUPABASE_URL` + service-role key                                    | Same rationale; matches existing `"type": "module"` setup.                                                                                                                                             |
| Either, when raw SQL is needed (migrations, complex joins) | **Supavisor session-mode pooler** via `DATABASE_URL` (`postgres://…pooler.supabase.com:5432/postgres`) | Render web services and workers are long-running persistent backends → session mode, not transaction mode. Pooler URL works on IPv4 and IPv6; the direct `db.<ref>.supabase.co:5432` URL is IPv6-only. |


Use the **service-role key**, not the anon key, for these backends. They run server-side, bypass RLS, and never receive user JWTs. Keep RLS enabled on the tables anyway (defense in depth) — service-role traffic ignores it; any future browser-facing surface will hit it.

Schema to add under `supabase/migrations/` before any web-service write path is enabled:

- `subscriptions(user_id text, sector text, created_at timestamptz default now(), primary key (user_id, sector))` — replaces `subscriptions.json`.
- `seen_articles(source_event_id text primary key, ticker text, seen_at timestamptz default now())` — replaces `seen_articles.json`.
- `digest_queue(id bigserial primary key, payload jsonb not null, queued_at timestamptz default now(), sent_at timestamptz)` — replaces `digest_queue.json`.
- The JS MVP's `companies` / `theses` / `articles` tables in `mvp/src/db.js` move into Supabase verbatim (drop SQLite `integer primary key autoincrement` → `bigserial`; `check (classification in (...))` → Postgres `text` + check constraint as-is).

Migration order: write the SQL migrations first, run them against the Supabase project, *then* swap the Python JSON readers and `mvp/src/db.js` over to the Supabase client. Until both sides write to Supabase, treat the worker's local files as the source of truth and the web service as read-only.

### 6.3 Authentication

None of the catalogued functions check identity today. Once exposed on a public `onrender.com` URL, they become callable by anyone on the internet. At minimum:

- Require a shared secret header (e.g. `X-API-Token`) checked against `API_AUTH_TOKEN` in `envVars`. `generateValue: true` in `blueprint-spec.md:46` will have Render mint "a base64-encoded 256-bit value" automatically.
- For endpoints that send Slack messages or trigger LLM spend (`/alerts/`*, `/digest/send`, `/classify`, `/admin/*`), this is mandatory — they cost real money per call.
- If endpoints are only ever consumed by other Render services, switch the new service to `type: pserv` (`private-services.md`) so the public internet cannot reach them at all.
- Optionally use `ipAllowList` (`blueprint-spec.md:60-64`) to limit callers to known office/CI IPs (Scale + Enterprise plans only).

### 6.4 Long-running endpoints

`scheduler.poll_news` and `classify.classifyAllPending` can each run for minutes (Gemini rate-limit sleeps, multiple Finnhub fetches). Render web services do support long requests, but endpoints that may exceed a request budget should:

- Return `202 Accepted` immediately, kick off work in a background task (FastAPI's `BackgroundTasks`, or `setImmediate` in Express), and write status somewhere queryable.
- Or be replaced by a Render **cron job** that runs on a schedule (`service-types.md:117-123`) and a small HTTP endpoint that only reports progress.

### 6.5 Scheduler thread vs. web service

The existing worker calls `start_scheduler(slack_client)` from `main.py:81`, which spawns a daemon thread (`scheduler.py:199-204`) that polls Finnhub every 15 minutes. Do **not** also start the scheduler inside `api.py` — that would double-poll. Keep `main.py` (worker) as the only place that owns the scheduler. The web service should be a read/write surface over the same code, not a second copy of the loop.

If we want manual `/admin/poll` and `/admin/digest` endpoints to share state with the worker (seen-article IDs, digest queue), those state files must live on shared storage — which for this project is Supabase Postgres (see §6.2). The web service cannot read the worker's local filesystem.

### 6.6 Auto-deploys per subdirectory

The two new services build off `rootDir: scif-slack-bot` and `rootDir: mvp` respectively. Per `monorepo-support.md:30-36`, this already prevents JS changes from triggering Python rebuilds and vice versa. No additional build filters needed unless we later add more subprojects.

### 6.7 CORS

If a future frontend at `index.html` / `src/` (Vite app) calls these endpoints from a browser, enable CORS:

- FastAPI: `from fastapi.middleware.cors import CORSMiddleware`.
- Express: `app.use(cors({ origin: ALLOWED_ORIGINS }))`.

Lock the allowlist to the static-site domain rather than `*`.

---

## 7. Migration order (suggested)

1. Provision the Supabase project (if not already done). Capture `SUPABASE_URL`, the **service-role** key, and the Supavisor session-mode `DATABASE_URL`.
2. Write the schema migrations described in §6.2 into `supabase/migrations/` and apply them to the Supabase project. Keep RLS enabled on all tables.
3. Add `fastapi`, `uvicorn[standard]`, and `supabase` (the Python client) to `scif-slack-bot/requirements.txt`. Add `express` and `@supabase/supabase-js` to `mvp/package.json`.
4. Port `subscriptions.py`, the `seen_articles` / `digest_queue` writers in `scheduler.py`, and `mvp/src/db.js` from JSON/SQLite to the Supabase client. Worker (and only the worker) writes first; verify locally against Supabase.
5. Create `scif-slack-bot/api.py` with a single route (`/classify`) and `mvp/src/server.js` with `/poll`. Verify locally on `:10000`, reading shared state from Supabase.
6. Update `render.yaml` to add the two `type: web` services and the Supabase env vars on all three services (§5). Push.
7. In the Render Dashboard, fill in the prompted `sync: false` secrets — including `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` — for each service on first deploy. Prefer an env group.
8. Add `API_AUTH_TOKEN` enforcement (§6.3) before adding any state-mutating routes.
9. Add remaining routes from the §4 tables, one feature at a time.

---

## 8. Reference index


| Topic                                                                                                         | Source                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Service types overview, decision flowchart                                                                    | `render_docs/service-types.md`                                               |
| Web service port binding (`0.0.0.0`, default `10000`)                                                         | `render_docs/web-services.md`                                                |
| FastAPI quickstart and start command                                                                          | `render_docs/deploy-fastapi.md`                                              |
| Flask quickstart (alternative)                                                                                | `render_docs/deploy-flask.md`                                                |
| Express quickstart                                                                                            | `render_docs/deploy-node-express-app.md`                                     |
| Fastify quickstart and `0.0.0.0` gotcha                                                                       | `render_docs/deploy-node-fastify-app.md`                                     |
| Private services (internal-only HTTP)                                                                         | `render_docs/private-services.md`                                            |
| `render.yaml` field reference (envVars, sync, fromGroup, healthCheckPath, ipAllowList, renderSubdomainPolicy) | `render_docs/blueprint-spec.md`                                              |
| Multi-service architecture pattern                                                                            | `render_docs/multi-service-architecture.md`                                  |
| Monorepo support (`rootDir`, build filters)                                                                   | `render_docs/monorepo-support.md`                                            |
| Persistent disks vs. ephemeral filesystem                                                                     | `render_docs/disks.md`                                                       |
| Supabase Postgres connection methods (direct, Supavisor session/transaction)                                  | `supabase_docs/guides/database/connecting-to-postgres/serverless-drivers.md` |
| `supabase-py` client initialization                                                                           | `supabase_docs/reference/python/initializing.md`                             |
| `@supabase/supabase-js` reference                                                                             | `supabase_docs/reference/javascript/`                                        |


