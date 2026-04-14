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
    subscribe,
    subscribe_all,
    unsubscribe,
    unsubscribe_all,
    get_subscriptions,
    format_subscriptions_list,
)
from alerts import send_instant_alert, send_dm_alert
from digest import send_monthly_digest

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

def _register_handlers(app: App) -> None:
    """Attach all slash commands and event listeners to the app."""

    # ------------------------------------------------------------------
    # /subscribe <sector|all>
    # ------------------------------------------------------------------
    @app.command("/subscribe")
    def handle_subscribe(ack, command, say):
        """
        Subscribe the calling analyst to a sector (or all sectors).
        Usage: /subscribe tech | /subscribe all
        """
        ack()  # acknowledge within 3 seconds
        user_id = command["user_id"]
        sector_arg = command.get("text", "").strip()

        if not sector_arg:
            say(
                "Please specify a sector. Examples:\n"
                "• `/subscribe tech`\n"
                "• `/subscribe biotech`\n"
                "• `/subscribe all`\n\n"
                f"Available sectors: {', '.join(['EV / Clean Energy', 'Biotech', 'Enterprise Tech / AI', 'Consumer', 'Financials', 'Healthcare', 'Energy', 'Industrials', 'Real Estate'])}"
            )
            return

        if sector_arg.lower() == "all":
            ok, msg = subscribe_all(user_id)
        else:
            ok, msg = subscribe(user_id, sector_arg)

        # Reply only visible to the user who ran the command
        say(msg)

    # ------------------------------------------------------------------
    # /unsubscribe <sector|all>
    # ------------------------------------------------------------------
    @app.command("/unsubscribe")
    def handle_unsubscribe(ack, command, say):
        """
        Unsubscribe the calling analyst from a sector (or all sectors).
        Usage: /unsubscribe tech | /unsubscribe all
        """
        ack()
        user_id = command["user_id"]
        sector_arg = command.get("text", "").strip()

        if not sector_arg:
            say("Please specify a sector or `all`. Example: `/unsubscribe biotech`")
            return

        if sector_arg.lower() == "all":
            ok, msg = unsubscribe_all(user_id)
        else:
            ok, msg = unsubscribe(user_id, sector_arg)

        say(msg)

    # ------------------------------------------------------------------
    # /subscriptions — list current subscriptions
    # ------------------------------------------------------------------
    @app.command("/subscriptions")
    def handle_list_subscriptions(ack, command, say):
        """Show the analyst their current sector subscriptions."""
        ack()
        user_id = command["user_id"]
        say(format_subscriptions_list(user_id))

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
            "*Available sectors:* EV / Clean Energy, Biotech, Enterprise Tech / AI, "
            "Consumer, Financials, Healthcare, Energy, Industrials, Real Estate\n\n"
            "_Instant needle-mover alerts and monthly digests are posted "
            "automatically when events are detected._"
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
