"""
subscriptions.py
----------------
Manages analyst sector subscriptions.
Each Slack user_id maps to a list of subscribed sector strings.
Data is persisted in subscriptions.json in the same directory.

Public API:
  subscribe(user_id, sector)       -> (bool, str)  success + message
  unsubscribe(user_id, sector)     -> (bool, str)
  get_subscriptions(user_id)       -> list[str]
  get_subscribers_for_sector(sec)  -> list[str]     list of user_ids
  subscribe_all(user_id)           -> (bool, str)
  unsubscribe_all(user_id)         -> (bool, str)
"""

import json
import os
from pathlib import Path

# Where subscription data lives on disk
SUBSCRIPTIONS_FILE = Path(__file__).parent / "subscriptions.json"

# Canonical sector list — analysts can also subscribe to custom sectors
KNOWN_SECTORS = [
    "EV / Clean Energy",
    "Biotech",
    "Enterprise Tech / AI",
    "Consumer",
    "Financials",
    "Industrials",
    "Healthcare",
    "Energy",
    "Real Estate",
]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load() -> dict:
    """Load subscriptions from disk; return empty dict if file doesn't exist."""
    if SUBSCRIPTIONS_FILE.exists():
        with open(SUBSCRIPTIONS_FILE, "r") as f:
            return json.load(f)
    return {}


def _save(data: dict) -> None:
    """Persist subscriptions dict to disk."""
    with open(SUBSCRIPTIONS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def _normalize(sector: str) -> str:
    """
    Normalize a sector string for consistent storage.
    'tech' -> 'Enterprise Tech / AI' if it matches a known sector keyword,
    otherwise store the raw lowercased input.
    """
    lower = sector.strip().lower()
    # Attempt fuzzy match against known sectors
    for known in KNOWN_SECTORS:
        if lower in known.lower():
            return known
    # Fall back to title-cased user input
    return sector.strip().title()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def subscribe(user_id: str, sector: str) -> tuple[bool, str]:
    """
    Subscribe a user to a sector.
    Returns (True, success_message) or (False, error_message).
    """
    data = _load()
    normalized = _normalize(sector)

    if user_id not in data:
        data[user_id] = []

    if normalized in data[user_id]:
        return False, f"You're already subscribed to *{normalized}*."

    data[user_id].append(normalized)
    _save(data)
    return True, f"Subscribed to *{normalized}* alerts."


def subscribe_all(user_id: str) -> tuple[bool, str]:
    """Subscribe a user to every known sector."""
    data = _load()
    data[user_id] = list(KNOWN_SECTORS)
    _save(data)
    return True, f"Subscribed to *all* {len(KNOWN_SECTORS)} sectors."


def unsubscribe(user_id: str, sector: str) -> tuple[bool, str]:
    """
    Unsubscribe a user from a sector.
    Returns (True, success_message) or (False, error_message).
    """
    data = _load()
    normalized = _normalize(sector)

    if user_id not in data or normalized not in data[user_id]:
        return False, f"You aren't subscribed to *{normalized}*."

    data[user_id].remove(normalized)
    _save(data)
    return True, f"Unsubscribed from *{normalized}*."


def unsubscribe_all(user_id: str) -> tuple[bool, str]:
    """Remove all sector subscriptions for a user."""
    data = _load()
    data[user_id] = []
    _save(data)
    return True, "Unsubscribed from all sectors."


def get_subscriptions(user_id: str) -> list[str]:
    """Return list of sectors a user is subscribed to (empty list if none)."""
    data = _load()
    return data.get(user_id, [])


def get_subscribers_for_sector(sector: str) -> list[str]:
    """
    Return all user_ids subscribed to a given sector.
    Used by alerts.py to determine who to DM when an event fires.
    """
    data = _load()
    normalized = _normalize(sector)
    return [uid for uid, sectors in data.items() if normalized in sectors]


def format_subscriptions_list(user_id: str) -> str:
    """Return a human-readable Slack-formatted string of a user's subscriptions."""
    subs = get_subscriptions(user_id)
    if not subs:
        return (
            "You have no active subscriptions.\n"
            "Use `/subscribe <sector>` or `/subscribe all` to get started."
        )
    bullet_list = "\n".join(f"• {s}" for s in subs)
    return f"*Your current subscriptions ({len(subs)}):*\n{bullet_list}"


# ---------------------------------------------------------------------------
# Quick self-test (run: python subscriptions.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    TEST_USER = "U_TEST_123"

    # Clean up any prior test state
    data = _load()
    data.pop(TEST_USER, None)
    _save(data)

    ok, msg = subscribe(TEST_USER, "biotech")
    print(f"subscribe biotech: {ok} — {msg}")

    ok, msg = subscribe(TEST_USER, "biotech")
    print(f"subscribe biotech again: {ok} — {msg}")

    ok, msg = subscribe(TEST_USER, "tech")
    print(f"subscribe tech: {ok} — {msg}")

    print("\n" + format_subscriptions_list(TEST_USER))

    print("\nSubscribers for Biotech:", get_subscribers_for_sector("biotech"))

    ok, msg = unsubscribe(TEST_USER, "biotech")
    print(f"\nunsubscribe biotech: {ok} — {msg}")

    print(format_subscriptions_list(TEST_USER))

    # Clean up test data
    data = _load()
    data.pop(TEST_USER, None)
    _save(data)
    print("\nTest user cleaned up. ✓")
