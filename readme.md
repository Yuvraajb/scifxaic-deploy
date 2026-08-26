# SCIF Thesis Tracker

News-to-Slack pipeline for the Student Investment Fund. Finnhub poller + LangChain
classification agent run embedded inside the main server, which also serves the
Slack command surface and a REST API for the React dashboard — all sharing a
single Supabase project as the source of truth.

---

## Layout

```
scifxaic/
├── app.js           Express + Slack Bolt server — the one deployed process.
│                    Slash commands, REST API, embeds classifier/src/run.js on startup.
├── handlers/        CommonJS modules used by app.js (investments, subscriptions, upload)
├── classifier/      Node package — Finnhub poll → LangChain agent → Supabase → Slack
│   └── src/*.js     Also importable standalone (`npm start` inside classifier/)
├── frontend/        React + Vite + TS dashboard — reads Supabase directly, calls
│                    app.js REST API for privileged writes
├── supabase/        Database migrations
├── render.yaml       Render Blueprint — deploys app.js as the single web service
└── *_docs/          Vendored vendor docs (finnhub, langchain, render, slack, supabase)
```

See `ARCHITECTURE.md` for the full component/data-flow diagram.

---

## Quickstart

```bash
# Main server (Slack bot + REST API + embedded classifier)
npm ci && cp .env.example .env && npm start

# Classifier, standalone (optional — app.js already runs this in-process)
cd classifier && npm ci && cp .env.example .env && npm start

# Frontend dev server
cd frontend && npm ci && cp .env.example .env && npm run dev
```

`make seed` is gone — seed via `node classifier/src/seed.js` directly.

---

## Environment

No secrets are committed. Root `.env` and `classifier/.env` overlap on Supabase +
Slack and diverge on provider keys.

| Variable | app.js | classifier |
|---|:---:|:---:|
| `SUPABASE_URL` | ✓ | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ |
| `SLACK_SIGNING_SECRET` | ✓ | — |
| `SLACK_BOT_TOKEN` | ✓ | ✓ (post alerts) |
| `SLACK_CHANNEL_ID` | ✓ | ✓ (alert target) |
| `FINNHUB_API_KEY` | — | ✓ |
| `OPENAI_API_KEY` | ✓ (upload extraction) | ✓ (classification) |
| `LLM_MODEL` | — | ✓ |

`frontend/.env` needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.

---

## Deploy

`render.yaml` declares one web service (`app.js`) with `npm ci && npm start` and
health check `/health`. Secrets are declared with `sync: false` and populated in
the Render dashboard.
