"""
bot.py
------
Slack Bolt app definition and all command/event handlers.
Imported by main.py to start the bot.

Handlers registered here:
  /subscribe <sector|all>
  /unsubscribe <sector|all>
  /subscriptions
  app_mention — echo help message

The app is created with Socket Mode so no public URL is needed.
"""

import os
import logging
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler
from dotenv import load_dotenv

from subscriptions import (
    KNOWN_SECTORS,
    subscribe,
    subscribe_all,
    unsubscribe,
    unsubscribe_all,
    set_subscriptions,
    get_subscriptions,
    format_subscriptions_list,
)

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# App initialisation
# ---------------------------------------------------------------------------

def create_app() -> App:
    """
    Create and return a configured Slack Bolt App.
    Raises a clear error if required env vars are missing.
    """
    bot_token = os.getenv("SLACK_BOT_TOKEN")
    if not bot_token:
        raise EnvironmentError(
            "SLACK_BOT_TOKEN is not set.\n"
            "Copy .env.example to .env and fill in your Slack tokens."
        )

    app = App(token=bot_token)
    _register_handlers(app)
    return app


# ---------------------------------------------------------------------------
# Handler registration
# ---------------------------------------------------------------------------

def _build_onboarding_blocks() -> list[dict]:
    """Build the sector-selection onboarding message using Block Kit checkboxes."""
    sector_emojis = {
        "TMT":        "🟣",
        "Healthcare": "🟢",
        "Consumer":   "🟡",
    }
    options = [
        {
            "text": {
                "type": "plain_text",
                "text": f"{sector_emojis.get(s, '▪️')}  {s}",
                "emoji": True,
            },
            "value": s,
        }
        for s in KNOWN_SECTORS
    ]

    return [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "👋 Welcome to SCIF Alerts!",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": (
                    "I'll send you *instant alerts* for breaking events and "
                    "*daily digests* for slower-moving news.\n\n"
                    "*Select the sectors you cover:*"
                ),
            },
        },
        {
            "type": "actions",
            "block_id": "sector_onboarding",
            "elements": [
                {
                    "type": "checkboxes",
                    "action_id": "sector_checkboxes",
                    "options": options,
                }
            ],
        },
        {
            "type": "actions",
            "block_id": "onboarding_submit",
            "elements": [
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "✅  Save my preferences",
                        "emoji": True,
                    },
                    "style": "primary",
                    "action_id": "save_sector_preferences",
                    "value": "save",
                },
                {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "Subscribe to all sectors",
                        "emoji": True,
                    },
                    "action_id": "subscribe_all_sectors",
                    "value": "all",
                },
            ],
        },
    ]


def _register_handlers(app: App) -> None:
    """Attach all slash commands and event listeners to the app."""

    # ------------------------------------------------------------------
    # member_joined_channel — send onboarding DM
    # NOTE: Add 'member_joined_channel' to your Slack app's Event Subscriptions.
    # Required scope: channels:read (for public channels) or groups:read (private).
    # ------------------------------------------------------------------
    @app.event("member_joined_channel")
    def handle_member_joined(event, client, logger):
        user_id = event.get("user")
        if not user_id:
            return
        # Don't DM ourselves (the bot joining its own channel)
        bot_info = client.auth_test()
        if user_id == bot_info["user_id"]:
            return

        try:
            # Open a DM channel with the new member
            dm = client.conversations_open(users=user_id)
            dm_channel = dm["channel"]["id"]
            client.chat_postMessage(
                channel=dm_channel,
                text="Welcome to SCIF Alerts! Please select your sector subscriptions.",
                blocks=_build_onboarding_blocks(),
            )
            logger.info(f"Sent onboarding DM to {user_id}")
        except Exception as e:
            logger.error(f"Failed to send onboarding DM to {user_id}: {e}")

    # ------------------------------------------------------------------
    # Block action — user clicks "Save my preferences"
    # ------------------------------------------------------------------
    @app.action("save_sector_preferences")
    def handle_save_preferences(ack, body, client, logger):
        ack()
        user_id = body["user"]["id"]
        channel_id = body["container"]["channel_id"]
        message_ts = body["container"]["message_ts"]

        # Read checkbox state from the message payload
        state_values = body.get("state", {}).get("values", {})
        checkbox_state = state_values.get("sector_onboarding", {}).get("sector_checkboxes", {})
        selected = checkbox_state.get("selected_options", [])
        chosen_sectors = [opt["value"] for opt in selected]

        if not chosen_sectors:
            client.chat_postMessage(
                channel=channel_id,
                text="No sectors selected — use `/subscribe <sector>` anytime to add subscriptions.",
            )
            return

        # Persist subscriptions (replaces the user's full set in Supabase)
        set_subscriptions(user_id, chosen_sectors)

        bullet_list = "\n".join(f"• {s}" for s in chosen_sectors)
        client.chat_update(
            channel=channel_id,
            ts=message_ts,
            text=f"Subscriptions saved! You'll get alerts for: {', '.join(chosen_sectors)}",
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": (
                            f"*All set!* You're subscribed to {len(chosen_sectors)} sector(s):\n"
                            f"{bullet_list}\n\n"
                            "_Use `/subscribe` or `/unsubscribe` to update anytime._"
                        ),
                    },
                }
            ],
        )
        logger.info(f"User {user_id} saved subscriptions: {chosen_sectors}")

    # ------------------------------------------------------------------
    # Block action — user clicks "Subscribe to all sectors"
    # ------------------------------------------------------------------
    @app.action("subscribe_all_sectors")
    def handle_subscribe_all(ack, body, client, logger):
        ack()
        user_id = body["user"]["id"]
        channel_id = body["container"]["channel_id"]
        message_ts = body["container"]["message_ts"]
        ok, msg = subscribe_all(user_id)
        client.chat_update(
            channel=channel_id,
            ts=message_ts,
            text=msg,
            blocks=[
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": (
                            f"*All set!* You're now subscribed to all {len(KNOWN_SECTORS)} sectors.\n\n"
                            "_Use `/unsubscribe <sector>` to narrow your alerts anytime._"
                        ),
                    },
                }
            ],
        )
        logger.info(f"User {user_id} subscribed to all sectors via onboarding")

    # ------------------------------------------------------------------
    # /subscribe <sector|all>
    # ------------------------------------------------------------------
    @app.command("/subscribe")
    def handle_subscribe(ack, command, respond):
        """
        Subscribe the calling analyst to a sector (or all sectors).
        Usage: /subscribe tech | /subscribe all
        """
        ack()  # acknowledge within 3 seconds
        user_id = command["user_id"]
        sector_arg = command.get("text", "").strip()

        if not sector_arg:
            respond(
                "Please specify a sector. Examples:\n"
                "• `/subscribe tmt`\n"
                "• `/subscribe healthcare`\n"
                "• `/subscribe all`\n\n"
                f"Available sectors: {', '.join(KNOWN_SECTORS)}"
            )
            return

        if sector_arg.lower() == "all":
            ok, msg = subscribe_all(user_id)
        else:
            ok, msg = subscribe(user_id, sector_arg)

        # Reply only visible to the user who ran the command
        respond(msg)

    # ------------------------------------------------------------------
    # /unsubscribe <sector|all>
    # ------------------------------------------------------------------
    @app.command("/unsubscribe")
    def handle_unsubscribe(ack, command, respond):
        """
        Unsubscribe the calling analyst from a sector (or all sectors).
        Usage: /unsubscribe tech | /unsubscribe all
        """
        ack()
        user_id = command["user_id"]
        sector_arg = command.get("text", "").strip()

        if not sector_arg:
            respond("Please specify a sector or `all`. Example: `/unsubscribe biotech`")
            return

        if sector_arg.lower() == "all":
            ok, msg = unsubscribe_all(user_id)
        else:
            ok, msg = unsubscribe(user_id, sector_arg)

        respond(msg)

    # ------------------------------------------------------------------
    # /subscriptions — list current subscriptions
    # ------------------------------------------------------------------
    @app.command("/subscriptions")
    def handle_list_subscriptions(ack, command, respond):
        """Show the analyst their current sector subscriptions."""
        ack()
        user_id = command["user_id"]
        respond(format_subscriptions_list(user_id))

    # ------------------------------------------------------------------
    # @mention — help message
    # ------------------------------------------------------------------
    @app.event("app_mention")
    def handle_mention(event, say):
        """Reply to @mentions with a usage guide."""
        user = event.get("user", "there")
        say(
            f"Hey <@{user}>! Here's what I can do:\n\n"
            "*Subscriptions*\n"
            "• `/subscribe <sector>` — subscribe to a sector's alerts\n"
            "• `/subscribe all` — subscribe to everything\n"
            "• `/unsubscribe <sector>` — unsubscribe from a sector\n"
            "• `/subscriptions` — see your current subscriptions\n\n"
            f"*Available sectors:* {', '.join(KNOWN_SECTORS)}\n\n"
            "_HIGH_ALERT notifications are posted automatically when the "
            "classification agent flags thesis-moving events._"
        )

    # ------------------------------------------------------------------
    # Generic error handler
    # ------------------------------------------------------------------
    @app.error
    def handle_error(error, body, logger):
        logger.error(f"Slack Bolt error: {error}")
        logger.debug(f"Request body: {body}")


# ---------------------------------------------------------------------------
# Socket Mode runner
# ---------------------------------------------------------------------------

def start_socket_mode(app: App) -> None:
    """
    Start the bot using Socket Mode (no public URL required).
    Requires SLACK_APP_TOKEN env var (xapp-...).
    """
    app_token = os.getenv("SLACK_APP_TOKEN")
    if not app_token:
        raise EnvironmentError(
            "SLACK_APP_TOKEN is not set.\n"
            "Copy .env.example to .env and fill in your Slack app token."
        )

    logger.info("Starting SCIF Slack bot in Socket Mode...")
    handler = SocketModeHandler(app, app_token)
    handler.start()


# ---------------------------------------------------------------------------
# Quick self-test (run: python bot.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    # Just verify the app can be created without crashing (token may be missing)
    try:
        app = create_app()
        print("App created successfully. Handlers registered. ✓")
        print("To start the bot run: python main.py")
    except EnvironmentError as e:
        print(f"[Expected in test mode] {e}")
        sys.exit(0)
