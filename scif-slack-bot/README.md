# SCIF Slack Bot

A Slack bot for the Student Investment Fund that monitors portfolio company news and instantly alerts analysts when thesis-moving events occur.

---

## What this bot does

- **Instant needle-mover alerts** — posts a formatted alert the moment a material event is detected (earnings, SEC filing, leadership change, rating change, etc.), tagged with a `BREAKS / SUPPORTS / NEUTRAL` thesis verdict
- **Monthly portfolio digest** — posts a sector-grouped summary of every event from the past month
- **Sector subscriptions** — analysts subscribe to sectors they cover; only relevant analysts are notified via DM when an alert fires
- **Modular data layer** — swap `mock_data.py` for a real SEC EDGAR or news API feed with no changes to the rest of the codebase

---

## 1  Create a Slack app and get tokens

### Step 1 — Create the app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**, give it a name (e.g. `SCIF Bot`), and pick your workspace
3. Click **Create App**

### Step 2 — Add bot scopes

1. In the left sidebar go to **OAuth & Permissions**
2. Under **Scopes → Bot Token Scopes** add:
   - `chat:write` — post messages
   - `im:write` — send DMs to analysts
   - `commands` — receive slash commands
   - `app_mentions:read` — respond to @mentions

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
2. Under **Subscribe to bot events** add `app_mention`
3. Save changes

### Step 7 — Get your channel ID

1. Open Slack in a browser
2. Right-click the channel you want alerts posted to
3. Click **View channel details** → copy the **Channel ID** at the bottom (starts with `C`)

---

## 2  Install dependencies

```bash
cd scif-slack-bot
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

---

## 3  Configure environment variables

```bash
cp .env.example .env
# Now open .env and fill in your three tokens
```

---

## 4  Run the mock demo (no Slack token required)

This fires 3 instant alerts and 1 monthly digest to your terminal so you can verify formatting before connecting to Slack:

```bash
python main.py --demo
```

You can also test individual modules:

```bash
python mock_data.py       # prints all mock events
python alerts.py          # dry-run of 3 instant alerts
python digest.py          # dry-run of monthly digest
python subscriptions.py   # runs subscription add/remove tests
```

---

## 5  Run the real bot

```bash
python main.py
```

The bot will connect via Socket Mode and begin listening for slash commands and @mentions. When you're ready to send real alerts, call `send_instant_alert()` from `alerts.py` inside whatever data-ingestion script your team builds.

---

## For CS1 / CS2 teammates — plugging in real data

Replace `mock_data.py`'s `get_mock_events()` with your actual data fetcher, then trigger alerts like this from your pipeline script:

```python
from alerts import send_instant_alert
from slack_sdk import WebClient

client = WebClient(token="xoxb-your-token")

send_instant_alert(
    company="Rivian",
    ticker="RIVN",
    sector="EV / Clean Energy",
    event_type="CEO Departure",
    verdict="BREAKS",
    explanation="Growth thesis was dependent on current leadership's execution.",
    source="Bloomberg",
    timestamp="2 mins ago",
    channel="C0123456789",   # your channel ID
    client=client,
)
```

---

## Project structure

```
scif-slack-bot/
├── main.py            Entry point; --demo flag for dry runs
├── bot.py             Slack Bolt app + all slash command handlers
├── alerts.py          send_instant_alert() — format + post one alert
├── digest.py          send_monthly_digest() — format + post digest
├── subscriptions.py   Analyst sector subscription management
├── mock_data.py       Fake events for testing; swap for real data
├── subscriptions.json Auto-created; stores analyst subscriptions
├── .env               Your secrets (gitignored)
├── .env.example       Token template
└── requirements.txt   Python dependencies
```
