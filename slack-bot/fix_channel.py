"""
fix_channel.py
--------------
Forces the bot to join the channel and verifies it can post.
Run this once to fix the 'not_in_channel' error.
"""

import os
from slack_sdk import WebClient
from dotenv import load_dotenv

load_dotenv()

client = WebClient(token=os.getenv("SLACK_BOT_TOKEN"))
channel_id = os.getenv("SLACK_CHANNEL_ID")

print(f"Channel ID: {channel_id}")

# Step 1 — check who the bot token belongs to
auth = client.auth_test()
print(f"Bot name:   {auth['user']}")
print(f"Workspace:  {auth['team']}")
print()

# Step 2 — try to join the channel
try:
    client.conversations_join(channel=channel_id)
    print("Joined channel successfully.")
except Exception as e:
    print(f"Could not join (may already be member): {e}")

# Step 3 — try posting a test message
try:
    client.chat_postMessage(
        channel=channel_id,
        text="SCIF Bot connected successfully! Alerts will appear here."
    )
    print("Test message posted! Check your Slack channel.")
except Exception as e:
    print(f"Still cannot post: {e}")
