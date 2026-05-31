# SCIF Slack Bot

The Slack command surface for the Student Investment Fund thesis tracker.

This process handles slash commands and analyst onboarding over Socket Mode.
**It no longer polls or classifies news.** Finnhub polling, classification, and
HIGH_ALERT posting all live in the Node worker (`../classifier/`), which writes to the
same Supabase project this bot reads. See `../combine.md` for the full architecture.

---

## What this bot does

- **Sector subscriptions** — `/subscribe`, `/unsubscribe`, `/subscriptions`, plus
  a Block Kit onboarding flow when an analyst joins the channel.
- **Subscription store** — reads/writes the Supabase `subscriptions` table
  (the same table the React frontend will write to later).

What it does **not** do anymore: news polling, LLM classification, instant alert
posting, or the monthly digest. Those moved to the Node worker.

---

## 1  Create a Slack app and get tokens

### Step 1 — Create the app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**, give it a name (e.g. `SCIF Bot`), and pick your workspace
3. Click **Create App**

### Step 2 — Add bot scopes

1. In the left sidebar go to **OAuth & Permissions**
2. Under **Scopes → Bot Token Scopes** add:
   - `chat:write` — post onboarding messages
   - `im:write` — send onboarding DMs to analysts
   - `commands` — receive slash commands
   - `app_mentions:read` — respond to @mentions
   - `channels:read` — detect channel joins for onboarding

### Step 3 — Install the app to your workspace

1. Scroll up to **OAuth Tokens for Your Workspace** and click **Install to Workspace**
2. Copy the **Bot User OAuth Token** (starts with `xoxb-`) — this is your `SLACK_BOT_TOKEN`

### Step 4 — Enable Socket Mode

1. In the sidebar go to **Socket Mode** and toggle it on
2. Create an app-level token with the `connections:write` scope
3. Copy the token (starts with `xapp-`) — this is your `SLACK_APP_TOKEN`

### Step 5 — Register slash commands

In the sidebar go to **Slash Commands** and create three commands:

| Command | Description |
|---|---|
| `/subscribe` | Subscribe to a sector's alerts |
| `/unsubscribe` | Unsubscribe from a sector |
| `/subscriptions` | List your current subscriptions |

Set the **Request URL** to anything (Socket Mode ignores it).

### Step 6 — Enable Events API

1. Go to **Event Subscriptions** and toggle it on
2. Under **Subscribe to bot events** add `app_mention` and `member_joined_channel`
3. Save changes

> The channel ID for HIGH_ALERT posts (`SLACK_CHANNEL_ID`) belongs to the **Node
> worker**, not this bot. Find it via right-click channel → View channel details.

---

## 2  Install dependencies

```bash
cd slack-bot
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

---

## 3  Configure environment variables

```bash
cp .env.example .env
# Fill in: SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

---

## 4  Run the bot

```bash
python main.py        # or ./start.sh
```

The bot connects via Socket Mode and listens for slash commands, @mentions, and
channel joins. Subscriptions are persisted to Supabase.

---

## Project structure

```
slack-bot/
├── main.py             Entry point — starts the Socket Mode bot
├── bot.py              Slack Bolt app + slash command + onboarding handlers
├── subscriptions.py    Sector subscription CRUD against Supabase
├── supabase_client.py  Cached service_role Supabase client
├── whoami.py           Debug: print the bot's identity
├── fix_channel.py      Debug: channel membership helper
├── .env                Your secrets (gitignored)
├── .env.example        Token template
└── requirements.txt    Python dependencies
```
