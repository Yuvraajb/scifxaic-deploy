"""
main.py
-------
Entry point for the SCIF Slack bot.

The bot is now a pure command surface: it handles /subscribe, /unsubscribe,
/subscriptions and onboarding over Socket Mode. News polling, classification and
HIGH_ALERT posting all live in the Node worker (classifier/), which writes to the same
Supabase project. This process no longer polls or classifies anything.

  python main.py    — start the live bot (Socket Mode)
"""

import sys

from bot import create_app, start_socket_mode


def run_bot() -> None:
    """Start the live Slack bot (slash commands + onboarding)."""
    try:
        app = create_app()
        start_socket_mode(app)
    except EnvironmentError as e:
        print(f"\n[CONFIG ERROR]\n{e}\n")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nBot stopped.")


if __name__ == "__main__":
    run_bot()
