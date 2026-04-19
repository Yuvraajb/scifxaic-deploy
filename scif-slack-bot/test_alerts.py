"""
test_alerts.py
--------------
Run this to post live test alerts and a digest to your Slack channel.
Make sure your .env file is filled in and the bot is running first.

Usage:
    python test_alerts.py
"""

import os
from slack_sdk import WebClient
from dotenv import load_dotenv
from alerts import send_instant_alert
from digest import send_monthly_digest
from mock_data import get_mock_events, get_demo_events

load_dotenv()

client = WebClient(token=os.getenv("SLACK_BOT_TOKEN"))

print("Sending 3 instant alerts to Slack...")

for event in get_demo_events(3):
    send_instant_alert(
        company=event["company"],
        ticker=event.get("ticker", ""),
        sector=event["sector"],
        event_type=event["event_type"],
        verdict=event["verdict"],
        explanation=event["explanation"],
        source=event.get("source", ""),
        timestamp=event.get("timestamp", "Just now"),
        client=client,
    )
    print(f"  Sent: {event['company']} — {event['event_type']}")

channel_id = os.getenv("SLACK_CHANNEL_ID")
print(f"\nSending monthly digest to Slack (channel: {channel_id})...")
send_monthly_digest(get_mock_events(), client=client, month_label="April 2026", channel=channel_id)
print("  Sent!")

print("\nDone. Check your Slack channel.")
