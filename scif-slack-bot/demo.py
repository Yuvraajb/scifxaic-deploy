"""
demo.py
-------
Interactive step-by-step demo of the full SCIF bot flow.

Requirements:
  - Bot must be running in another terminal: ./start.sh
  - Run this script: python demo.py

Flow:
  1. Posts onboarding message with sector checkboxes to the channel
  2. Pauses — you select sectors in Slack and hit Save
  3. Detects your selections and posts alerts for those sectors only
  4. Posts the daily digest
"""

import os
import json
import time
from pathlib import Path
from slack_sdk import WebClient
from dotenv import load_dotenv

load_dotenv()

from mock_data import get_mock_events
from alerts import send_instant_alert
from digest import send_monthly_digest
from bot import _build_onboarding_blocks

SUBSCRIPTIONS_FILE = Path(__file__).parent / "subscriptions.json"


def _get_latest_subscriptions() -> tuple[str, list[str]]:
    """Return (user_id, sectors) for the most recently updated user."""
    if not SUBSCRIPTIONS_FILE.exists():
        return "", []
    with open(SUBSCRIPTIONS_FILE) as f:
        data = json.load(f)
    # Pick the user with the most subscriptions (most recently onboarded)
    if not data:
        return "", []
    user_id = max(data, key=lambda uid: len(data[uid]))
    return user_id, data[user_id]


def _wait_for_subscription(before: dict) -> tuple[str, list[str]]:
    """Poll subscriptions.json until a new/changed entry appears."""
    print("  Waiting for you to select sectors in Slack", end="", flush=True)
    while True:
        time.sleep(2)
        print(".", end="", flush=True)
        if not SUBSCRIPTIONS_FILE.exists():
            continue
        with open(SUBSCRIPTIONS_FILE) as f:
            after = json.load(f)
        if after != before:
            # Find the changed user
            for uid, sectors in after.items():
                if after.get(uid) != before.get(uid) and sectors:
                    print()
                    return uid, sectors


def _snapshot_subscriptions() -> dict:
    if not SUBSCRIPTIONS_FILE.exists():
        return {}
    with open(SUBSCRIPTIONS_FILE) as f:
        return json.load(f)


def run_demo() -> None:
    client = WebClient(token=os.environ["SLACK_BOT_TOKEN"])
    channel = os.environ["SLACK_CHANNEL_ID"]

    print("\n" + "=" * 50)
    print("  SCIF Bot — Interactive Demo")
    print("=" * 50)
    print("\nMake sure the bot is running in another terminal (./start.sh)\n")

    # ------------------------------------------------------------------ 1
    input("Press Enter to post the onboarding message to Slack...")
    print("\nStep 1: Posting onboarding message...")

    before = _snapshot_subscriptions()
    client.chat_postMessage(
        channel=channel,
        text="Welcome to SCIF Alerts! Please select your sector subscriptions.",
        blocks=_build_onboarding_blocks(),
    )
    print("  ✓ Onboarding message posted!\n")

    # ------------------------------------------------------------------ 2
    print("Step 2: Go to Slack, check the sectors you want, and hit Save.")
    user_id, chosen_sectors = _wait_for_subscription(before)

    print(f"\n  ✓ Got it! Subscribed to {len(chosen_sectors)} sector(s):")
    for s in chosen_sectors:
        print(f"    • {s}")

    # ------------------------------------------------------------------ 3
    input("\nPress Enter to fire alerts for your sectors...")
    print("\nStep 3: Sending news alerts...\n")

    all_events = get_mock_events()
    # Filter to events matching the user's chosen sectors
    matched = [e for e in all_events if e["sector"] in chosen_sectors]

    if not matched:
        print("  No mock events match your sectors — sending all events instead.")
        matched = all_events[:3]

    for i, event in enumerate(matched, 1):
        verdict_icon = {"BREAKS": "❌", "SUPPORTS": "✅", "NEUTRAL": "⚪"}.get(event["verdict"], "")
        print(f"  [{i}/{len(matched)}] {event['company']} — {event['event_type'][:45]}... {verdict_icon}")
        send_instant_alert(
            company=event["company"],
            ticker=event["ticker"],
            sector=event["sector"],
            event_type=event["event_type"],
            verdict=event["verdict"],
            explanation=event["explanation"],
            summary=event.get("summary", ""),
            source=event["source"],
            timestamp=event["timestamp"],
            channel=channel,
            client=client,
        )
        time.sleep(1.5)

    print(f"\n  ✓ {len(matched)} alert(s) posted to Slack!\n")

    # ------------------------------------------------------------------ 4
    input("Press Enter to send the daily digest...")
    print("\nStep 4: Sending daily digest...")

    send_monthly_digest(
        events=all_events,
        channel=channel,
        client=client,
        month_label="Daily Digest — April 19, 2026",
    )
    print("  ✓ Digest posted!\n")

    print("=" * 50)
    print("  Demo complete!")
    print("=" * 50 + "\n")


if __name__ == "__main__":
    run_demo()
