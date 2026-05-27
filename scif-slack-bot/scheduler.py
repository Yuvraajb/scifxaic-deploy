"""
scheduler.py
------------
Background polling loop that:
  1. Every 15 minutes: fetches news for all portfolio companies, classifies each
     article, and routes urgent items to instant alerts or queues them for the
     daily digest.
  2. At DIGEST_HOUR (default 5pm) each day: sends the accumulated digest and
     clears the queue.

Start it with:
  from scheduler import start_scheduler
  start_scheduler(slack_client)
"""

import os
import json
import time
import logging
import threading
from datetime import datetime
from pathlib import Path

from portfolio import PORTFOLIO
from news_fetcher import fetch_company_news
from classifier import classify_news
from alerts import send_instant_alert, send_dm_alert
from digest import send_monthly_digest
from subscriptions import get_subscribers_for_sector

logger = logging.getLogger(__name__)

SEEN_FILE = Path(__file__).parent / "seen_articles.json"
DIGEST_FILE = Path(__file__).parent / "digest_queue.json"

POLL_INTERVAL = 900   # seconds between news polls (15 minutes)
DIGEST_HOUR = 17      # hour (24h) to send the daily digest


# ---------------------------------------------------------------------------
# State helpers
# ---------------------------------------------------------------------------

def _load_seen() -> set:
    if SEEN_FILE.exists():
        with open(SEEN_FILE) as f:
            return set(json.load(f))
    return set()


def _save_seen(seen: set) -> None:
    # Keep only the most recent 2000 article IDs to prevent unbounded growth
    with open(SEEN_FILE, "w") as f:
        json.dump(list(seen)[-2000:], f)


def _load_digest_queue() -> list:
    if DIGEST_FILE.exists():
        with open(DIGEST_FILE) as f:
            return json.load(f)
    return []


def _save_digest_queue(queue: list) -> None:
    with open(DIGEST_FILE, "w") as f:
        json.dump(queue, f, indent=2)


# ---------------------------------------------------------------------------
# News poll
# ---------------------------------------------------------------------------

def poll_news(client) -> None:
    """Fetch and process news for all portfolio companies."""
    seen = _load_seen()
    digest_queue = _load_digest_queue()
    channel = os.getenv("SLACK_CHANNEL_ID", "")

    for company in PORTFOLIO:
        ticker = company["ticker"]
        sector = company["sector"]

        articles = fetch_company_news(ticker)[:5]  # max 5 per company per poll
        logger.info(f"[scheduler] {ticker}: {len(articles)} articles fetched")

        for article in articles:
            # Use Finnhub article id; fall back to URL
            article_id = str(article.get("id") or article.get("url", ""))
            if not article_id or article_id in seen:
                continue

            seen.add(article_id)

            headline = article.get("headline", "").strip()
            summary = article.get("summary", "").strip()
            if not headline:
                continue

            # Stay under Gemini free tier (15 req/min) — 5s gap = 12 req/min max
            time.sleep(5)

            result = classify_news(
                company=company["company"],
                ticker=ticker,
                sector=sector,
                thesis=company["thesis"],
                headline=headline,
                summary=summary,
            )

            if not result or not result.get("material"):
                continue

            ts_unix = article.get("datetime", int(time.time()))
            ts_str = datetime.fromtimestamp(ts_unix).strftime("%b %d, %H:%M")

            event = {
                "company": company["company"],
                "ticker": ticker,
                "sector": sector,
                "event_type": result.get("event_type", headline[:80]),
                "verdict": result.get("verdict", "NEUTRAL"),
                "explanation": result.get("explanation", ""),
                "source": article.get("source", "News"),
                "timestamp": ts_str,
            }

            if result.get("urgent"):
                logger.info(f"[scheduler] URGENT alert: {ticker} — {event['event_type']}")
                # Post to channel
                send_instant_alert(**event, channel=channel, client=client)
                # DM each subscriber for this sector
                for user_id in get_subscribers_for_sector(sector):
                    send_dm_alert(user_id=user_id, **event, client=client)
            else:
                logger.info(f"[scheduler] Queued for digest: {ticker} — {event['event_type']}")
                digest_queue.append(event)

    _save_seen(seen)
    _save_digest_queue(digest_queue)


# ---------------------------------------------------------------------------
# Daily digest
# ---------------------------------------------------------------------------

def send_daily_digest(client) -> None:
    """Send the accumulated digest and clear the queue."""
    queue = _load_digest_queue()
    if not queue:
        logger.info("[scheduler] Daily digest: no events queued, skipping.")
        return

    channel = os.getenv("SLACK_CHANNEL_ID", "")
    today = datetime.now().strftime("%B %d, %Y")

    logger.info(f"[scheduler] Sending daily digest ({len(queue)} events)")
    send_monthly_digest(
        events=queue,
        channel=channel,
        client=client,
        month_label=f"Daily Digest — {today}",
    )
    _save_digest_queue([])


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def _run_loop(client) -> None:
    last_digest_date = None

    # Run first poll immediately on startup
    try:
        poll_news(client)
    except Exception as e:
        logger.error(f"[scheduler] Initial poll error: {e}")

    while True:
        time.sleep(POLL_INTERVAL)

        try:
            poll_news(client)
        except Exception as e:
            logger.error(f"[scheduler] Poll error: {e}")

        # Daily digest check
        now = datetime.now()
        today = now.date()
        if now.hour >= DIGEST_HOUR and last_digest_date != today:
            try:
                send_daily_digest(client)
                last_digest_date = today
            except Exception as e:
                logger.error(f"[scheduler] Digest error: {e}")


def start_scheduler(client) -> threading.Thread:
    """Start the scheduler in a daemon thread and return it."""
    thread = threading.Thread(target=_run_loop, args=(client,), daemon=True, name="scif-scheduler")
    thread.start()
    logger.info("[scheduler] Started (polls every 15 min, digest at 5pm).")
    return thread
