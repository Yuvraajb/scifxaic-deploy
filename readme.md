# SCIF Thesis Tracker

News-to-Slack pipeline for the Student Investment Fund. One Finnhub poller, one
LangChain classification agent, one Slack command surface, one React dashboard —
all sharing a single Supabase project as the source of truth.

> Architecture rationale and migration history: [`combine.md`](combine.md).
> Render endpoint plan: [`render.md`](render.md).

---

## Layout

This repo holds **three deployable pieces** plus shared docs. Each piece is
self-contained with its own runtime and dependency manifest.

```
scifxaic/
├── classifier/      Node worker — Finnhub poll → LangChain agent → Supabase → Slack
│   └── src/*.js
├── slack-bot/       Python worker — Slack slash commands + onboarding (Socket Mode)
│   └── *.py
├── src/             React + Vite frontend — analyst dashboard (reads Supabase)
├── supabase/        Database migrations
├── render.yaml      Render Blueprint — both workers as `type: worker`
├── Makefile         One entry point to install and run every piece
└── *_docs/          Vendored vendor docs (finnhub, langchain, render, slack, supabase)
```

### The two workers, and why they stay separate

| Piece | Runtime | Job | Entry |
|---|---|---|---|
| `classifier/` | Node | Poll Finnhub, classify with the LangChain agent (3 labels: `HIGH_ALERT`/`MONTHLY_OVERVIEW`/`IGNORE`), write Supabase, post `HIGH_ALERT` to Slack | `npm start` → `src/run.js` |
| `slack-bot/` | Python | `/subscribe`, `/unsubscribe`, `/subscriptions` + analyst onboarding over Socket Mode | `python main.py` |

They are **one project, two processes**. The classifier is the only thing that
polls and classifies; the Slack bot is a pure command surface. They never call
each other in-process — they coordinate through the shared Supabase tables. That
is why they remain distinct services with distinct languages rather than one
binary. See [`combine.md`](combine.md) for the full reasoning.

---

## Quickstart

Each service needs its own `.env` (copy from the adjacent `.env.example`). The
Makefile wraps the per-service setup:

```bash
make install        # install deps for classifier + slack-bot + frontend
make classifier     # run the Node poller/classifier worker
make slack-bot      # run the Python Slack bot (Socket Mode)
make frontend       # run the Vite dev server
make seed           # seed portfolio companies + theses into Supabase
make help           # list all targets
```

Run a service directly without the Makefile:

```bash
# Classifier (Node)
cd classifier && npm ci && cp .env.example .env && npm start

# Slack bot (Python)
cd slack-bot && python -m venv venv && source venv/bin/activate \
  && pip install -r requirements.txt && cp .env.example .env && python main.py
```

Per-service setup detail lives in [`slack-bot/README.md`](slack-bot/README.md).

---

## Environment

No secrets are committed. Each worker reads its own `.env`; the variables overlap
on Supabase + Slack and diverge on provider keys.

| Variable | classifier | slack-bot |
|---|:---:|:---:|
| `SUPABASE_URL` | ✓ | ✓ |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ |
| `SLACK_BOT_TOKEN` | ✓ (post alerts) | ✓ (post onboarding) |
| `SLACK_APP_TOKEN` | — | ✓ (Socket Mode) |
| `SLACK_CHANNEL_ID` | ✓ (alert target) | — |
| `FINNHUB_API_KEY` | ✓ | — |
| `OPENAI_API_KEY` | ✓ | — |

---

## Deploy

`render.yaml` declares both workers as `type: worker` with per-service `rootDir`
(`classifier`, `slack-bot`), so each rebuilds only when its own files change.
Secrets are declared with `sync: false` and populated in the Render dashboard.
