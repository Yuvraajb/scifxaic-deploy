"""
alerts.py
---------
Formats and sends instant needle-mover alerts to Slack.
This module is designed to be called from external scripts — CS1/CS2 teammates
can import send_instant_alert() directly from their pipelines.

Public API:
  send_instant_alert(company, event_type, sector, verdict, explanation,
                     ticker="", source="Unknown", timestamp="Just now",
                     channel=None, client=None)

  build_alert_blocks(...)  -> list[dict]   (Slack Block Kit payload)
  format_alert_text(...)   -> str          (plain-text fallback)
"""

import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Verdict helpers
# ---------------------------------------------------------------------------

VERDICT_ICONS = {
    "BREAKS": "❌",
    "SUPPORTS": "✅",
    "NEUTRAL": "⚪",
}

VERDICT_COLORS = {
    "BREAKS": "#E53935",    # red
    "SUPPORTS": "#43A047",  # green
    "NEUTRAL": "#757575",   # grey
}


def _icon(verdict: str) -> str:
    return VERDICT_ICONS.get(verdict.upper(), "❓")


def _color(verdict: str) -> str:
    return VERDICT_COLORS.get(verdict.upper(), "#000000")


# ---------------------------------------------------------------------------
# Message builders
# ---------------------------------------------------------------------------

def build_alert_blocks(
    company: str,
    event_type: str,
    sector: str,
    verdict: str,
    explanation: str,
    ticker: str = "",
    source: str = "Unknown",
    timestamp: str = "Just now",
) -> list[dict]:
    """
    Build a Slack Block Kit payload for a needle-mover alert.
    Returns a list of block dicts ready to pass to client.chat_postMessage.
    """
    ticker_str = f" (${ticker})" if ticker else ""
    verdict_upper = verdict.upper()
    icon = _icon(verdict_upper)

    blocks = [
        # Header
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🚨 NEEDLE-MOVER ALERT",
                "emoji": True,
            },
        },
        {"type": "divider"},
        # Company + sector
        {
            "type": "section",
            "fields": [
                {
                    "type": "mrkdwn",
                    "text": f"*Company:*\n{company}{ticker_str}",
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Sector:*\n{sector}",
                },
            ],
        },
        # Event + verdict
        {
            "type": "section",
            "fields": [
                {
                    "type": "mrkdwn",
                    "text": f"*Event:*\n{event_type}",
                },
                {
                    "type": "mrkdwn",
                    "text": f"*Thesis Impact:*\n{verdict_upper} {icon}",
                },
            ],
        },
        # Explanation
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Why:* {explanation}",
            },
        },
        {"type": "divider"},
        # Footer
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": f"_Sourced from: {source} • {timestamp}_",
                }
            ],
        },
    ]
    return blocks


def format_alert_text(
    company: str,
    event_type: str,
    sector: str,
    verdict: str,
    explanation: str,
    ticker: str = "",
    source: str = "Unknown",
    timestamp: str = "Just now",
) -> str:
    """
    Plain-text fallback for the alert (also useful for console logging/testing
    without a live Slack connection).
    """
    ticker_str = f" (${ticker})" if ticker else ""
    icon = _icon(verdict.upper())
    divider = "━" * 21

    return (
        f"🚨 *NEEDLE-MOVER ALERT*\n"
        f"{divider}\n"
        f"*Company:* {company}{ticker_str}\n"
        f"*Sector:* {sector}\n"
        f"*Event:* {event_type}\n"
        f"*Thesis Impact:* {verdict.upper()} {icon}\n"
        f"*Why:* {explanation}\n"
        f"{divider}\n"
        f"_Sourced from: {source} • {timestamp}_"
    )


# ---------------------------------------------------------------------------
# Core sender
# ---------------------------------------------------------------------------

def send_instant_alert(
    company: str,
    event_type: str,
    sector: str,
    verdict: str,
    explanation: str,
    ticker: str = "",
    source: str = "Unknown",
    timestamp: str = "Just now",
    channel: str | None = None,
    client=None,
) -> bool:
    """
    Format and post a needle-mover alert to Slack.

    Args:
        company      : Company name, e.g. "Rivian"
        event_type   : Short description of the event, e.g. "CEO Departure"
        sector       : Sector string, e.g. "EV / Clean Energy"
        verdict      : "BREAKS", "SUPPORTS", or "NEUTRAL"
        explanation  : One-sentence impact summary (can come from Claude API)
        ticker       : Optional ticker symbol, e.g. "RIVN"
        source       : Where the news came from, e.g. "Bloomberg"
        timestamp    : Human-readable age string, e.g. "2 mins ago"
        channel      : Slack channel ID; falls back to SLACK_CHANNEL_ID env var
        client       : slack_sdk WebClient instance; if None, a dry-run is done

    Returns:
        True if the message was posted successfully, False otherwise.
    """
    resolved_channel = channel or os.getenv("SLACK_CHANNEL_ID", "")

    blocks = build_alert_blocks(
        company=company,
        event_type=event_type,
        sector=sector,
        verdict=verdict,
        explanation=explanation,
        ticker=ticker,
        source=source,
        timestamp=timestamp,
    )

    fallback_text = format_alert_text(
        company=company,
        event_type=event_type,
        sector=sector,
        verdict=verdict,
        explanation=explanation,
        ticker=ticker,
        source=source,
        timestamp=timestamp,
    )

    # Dry-run mode: no Slack client provided (useful for tests & local dev)
    if client is None:
        print("[DRY RUN] Would post alert to Slack:")
        print(fallback_text)
        print()
        return True

    if not resolved_channel:
        print("ERROR: No channel specified and SLACK_CHANNEL_ID env var is not set.")
        return False

    try:
        client.chat_postMessage(
            channel=resolved_channel,
            text=fallback_text,        # fallback for notifications
            blocks=blocks,
            unfurl_links=False,
        )
        return True
    except Exception as e:
        print(f"ERROR sending alert for {company}: {e}")
        return False


def send_dm_alert(
    user_id: str,
    company: str,
    event_type: str,
    sector: str,
    verdict: str,
    explanation: str,
    ticker: str = "",
    source: str = "Unknown",
    timestamp: str = "Just now",
    client=None,
) -> bool:
    """
    Send a needle-mover alert as a DM to a specific analyst.
    Used by the subscription system to notify only relevant subscribers.
    """
    return send_instant_alert(
        company=company,
        event_type=event_type,
        sector=sector,
        verdict=verdict,
        explanation=explanation,
        ticker=ticker,
        source=source,
        timestamp=timestamp,
        channel=user_id,   # Slack accepts user_id as a DM channel target
        client=client,
    )


# ---------------------------------------------------------------------------
# Quick self-test (run: python alerts.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=== Dry-run alert test ===\n")
    send_instant_alert(
        company="Rivian",
        ticker="RIVN",
        sector="EV / Clean Energy",
        event_type="CEO Departure",
        verdict="BREAKS",
        explanation=(
            "Growth thesis was heavily dependent on current leadership's "
            "operational execution and customer ramp strategy."
        ),
        source="Bloomberg",
        timestamp="2 mins ago",
        client=None,   # dry run
    )

    send_instant_alert(
        company="Moderna",
        ticker="MRNA",
        sector="Biotech",
        event_type="FDA Approval — RSV Vaccine",
        verdict="SUPPORTS",
        explanation="Approval validates mRNA platform and unlocks a new revenue stream.",
        source="Reuters",
        timestamp="1 hr ago",
        client=None,
    )

    send_instant_alert(
        company="Tesla",
        ticker="TSLA",
        sector="EV / Clean Energy",
        event_type="Analyst Downgrade",
        verdict="NEUTRAL",
        explanation="Downgrade reflects valuation concerns, not fundamental deterioration.",
        source="Morgan Stanley",
        timestamp="5 hrs ago",
        client=None,
    )
