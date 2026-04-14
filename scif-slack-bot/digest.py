"""
digest.py
---------
Builds and sends the monthly portfolio digest to Slack.

Public API:
  send_monthly_digest(events, channel=None, client=None, month_label=None)
  build_digest_text(events, month_label)   -> str   (plain-text fallback)
  build_digest_blocks(events, month_label) -> list[dict]
"""

import os
from datetime import datetime
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv()

# Sector emoji map — cosmetic prefix for each sector section
SECTOR_EMOJIS = {
    "EV / Clean Energy":      "🔵",
    "Biotech":                "🟢",
    "Enterprise Tech / AI":   "🟣",
    "Consumer":               "🟡",
    "Financials":             "🟠",
    "Healthcare":             "⚪",
    "Energy":                 "🔴",
    "Industrials":            "🟤",
    "Real Estate":            "🏠",
}

VERDICT_ICONS = {
    "BREAKS": "❌",
    "SUPPORTS": "✅",
    "NEUTRAL": "⚪",
}


def _icon(verdict: str) -> str:
    return VERDICT_ICONS.get(verdict.upper(), "❓")


def _sector_emoji(sector: str) -> str:
    return SECTOR_EMOJIS.get(sector, "⚫")


def _current_month_label() -> str:
    return datetime.now().strftime("%B %Y")


# ---------------------------------------------------------------------------
# Message builders
# ---------------------------------------------------------------------------

def build_digest_text(events: list[dict], month_label: str | None = None) -> str:
    """
    Build a plain-text Slack-formatted monthly digest string.

    Args:
        events      : List of event dicts (same schema as mock_data.py)
        month_label : Display string like "April 2026"; defaults to current month.
    """
    label = month_label or _current_month_label()
    divider = "━" * 21

    # Group events by sector
    by_sector: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        by_sector[e["sector"]].append(e)

    # Tally verdicts
    counts = {"BREAKS": 0, "SUPPORTS": 0, "NEUTRAL": 0}
    for e in events:
        v = e.get("verdict", "").upper()
        if v in counts:
            counts[v] += 1

    lines = [
        "📊 *SCIF MONTHLY PORTFOLIO DIGEST*",
        f"_{label}_",
        divider,
        "",
    ]

    for sector, sector_events in sorted(by_sector.items()):
        emoji = _sector_emoji(sector)
        lines.append(f"*{emoji} {sector}*")
        for e in sector_events:
            icon = _icon(e.get("verdict", ""))
            lines.append(f"• {e['company']} — {e['event_type']} {icon}")
        lines.append("")

    lines += [
        divider,
        (
            f"_{counts['BREAKS']} BREAKS  |  "
            f"{counts['SUPPORTS']} SUPPORTS  |  "
            f"{counts['NEUTRAL']} NEUTRAL_"
        ),
        "_Full report sent to portfolio directors_",
    ]

    return "\n".join(lines)


def build_digest_blocks(
    events: list[dict], month_label: str | None = None
) -> list[dict]:
    """
    Build a Slack Block Kit payload for the monthly digest.
    Returns a list of block dicts.
    """
    label = month_label or _current_month_label()

    by_sector: dict[str, list[dict]] = defaultdict(list)
    for e in events:
        by_sector[e["sector"]].append(e)

    counts = {"BREAKS": 0, "SUPPORTS": 0, "NEUTRAL": 0}
    for e in events:
        v = e.get("verdict", "").upper()
        if v in counts:
            counts[v] += 1

    blocks: list[dict] = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "📊 SCIF MONTHLY PORTFOLIO DIGEST",
                "emoji": True,
            },
        },
        {
            "type": "context",
            "elements": [{"type": "mrkdwn", "text": f"_{label}_"}],
        },
        {"type": "divider"},
    ]

    for sector, sector_events in sorted(by_sector.items()):
        emoji = _sector_emoji(sector)
        bullet_lines = "\n".join(
            f"• {e['company']} — {e['event_type']} {_icon(e.get('verdict', ''))}"
            for e in sector_events
        )
        blocks.append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*{emoji} {sector}*\n{bullet_lines}",
                },
            }
        )

    blocks += [
        {"type": "divider"},
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": (
                        f"_{counts['BREAKS']} BREAKS  |  "
                        f"{counts['SUPPORTS']} SUPPORTS  |  "
                        f"{counts['NEUTRAL']} NEUTRAL_\n"
                        "_Full report sent to portfolio directors_"
                    ),
                }
            ],
        },
    ]

    return blocks


# ---------------------------------------------------------------------------
# Core sender
# ---------------------------------------------------------------------------

def send_monthly_digest(
    events: list[dict],
    channel: str | None = None,
    client=None,
    month_label: str | None = None,
) -> bool:
    """
    Format and post the monthly digest to a Slack channel.

    Args:
        events      : List of event dicts (same schema as mock_data.py)
        channel     : Slack channel ID; falls back to SLACK_CHANNEL_ID env var
        client      : slack_sdk WebClient; if None, prints a dry-run to stdout
        month_label : e.g. "April 2026"; defaults to current month

    Returns:
        True on success, False on failure.
    """
    resolved_channel = channel or os.getenv("SLACK_CHANNEL_ID", "")
    label = month_label or _current_month_label()

    blocks = build_digest_blocks(events, label)
    fallback_text = build_digest_text(events, label)

    if client is None:
        print("[DRY RUN] Would post monthly digest to Slack:")
        print(fallback_text)
        print()
        return True

    if not resolved_channel:
        print("ERROR: No channel specified and SLACK_CHANNEL_ID env var is not set.")
        return False

    try:
        client.chat_postMessage(
            channel=resolved_channel,
            text=fallback_text,
            blocks=blocks,
            unfurl_links=False,
        )
        return True
    except Exception as e:
        print(f"ERROR sending monthly digest: {e}")
        return False


# ---------------------------------------------------------------------------
# Quick self-test (run: python digest.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    from mock_data import get_mock_events

    print("=== Dry-run digest test ===\n")
    events = get_mock_events()
    send_monthly_digest(events, month_label="April 2026", client=None)
