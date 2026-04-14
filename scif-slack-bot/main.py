"""
main.py
-------
Entry point for the SCIF Slack bot.

Two modes:
  python main.py          — starts the live bot (Socket Mode)
  python main.py --demo   — fires mock alerts + digest to stdout (no Slack needed)
"""

import sys
import argparse
from mock_data import get_mock_events, get_demo_events
from alerts import send_instant_alert
from digest import send_monthly_digest


# ---------------------------------------------------------------------------
# Mock demo — fires 3 instant alerts then 1 monthly digest (dry-run)
# ---------------------------------------------------------------------------

def run_mock_demo() -> None:
    """
    Demo function: sends 3 instant alerts followed by 1 monthly digest.
    Runs in dry-run mode (no Slack token required) — output goes to stdout.
    CS1 / CS2 teammates can call this to verify their data pipeline output.
    """
    print("=" * 55)
    print("  SCIF SLACK BOT — MOCK DEMO")
    print("=" * 55)
    print()

    # ---- 3 instant needle-mover alerts ----
    demo_events = get_demo_events(n=3)

    for i, event in enumerate(demo_events, start=1):
        print(f"--- Alert {i} of {len(demo_events)} ---")
        send_instant_alert(
            company=event["company"],
            ticker=event.get("ticker", ""),
            sector=event["sector"],
            event_type=event["event_type"],
            verdict=event["verdict"],
            explanation=event["explanation"],
            source=event.get("source", "Unknown"),
            timestamp=event.get("timestamp", "Just now"),
            client=None,   # dry-run: prints to stdout instead of posting
        )

    # ---- 1 monthly digest using all mock events ----
    print("--- Monthly Digest ---")
    send_monthly_digest(
        events=get_mock_events(),
        month_label="April 2026",
        client=None,   # dry-run
    )

    print("=" * 55)
    print("  Demo complete. Run `python main.py` to start the live bot.")
    print("=" * 55)


# ---------------------------------------------------------------------------
# Live bot entry point
# ---------------------------------------------------------------------------

def run_bot() -> None:
    """Start the live Slack bot using Socket Mode."""
    try:
        from bot import create_app, start_socket_mode
        app = create_app()
        start_socket_mode(app)
    except EnvironmentError as e:
        print(f"\n[CONFIG ERROR]\n{e}\n")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nBot stopped.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="SCIF Slack Bot — portfolio company news alerts"
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run the mock demo (no Slack token required)",
    )
    args = parser.parse_args()

    if args.demo:
        run_mock_demo()
    else:
        run_bot()
