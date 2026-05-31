"""
subscriptions.py
----------------
Manages analyst sector subscriptions, backed by the Supabase `subscriptions`
table (user_id text, sector text, primary key (user_id, sector)).

Replaces the old subscriptions.json file. The same table is the one the React
frontend will write to later, so the bot and the frontend stay in sync.

Public API:
  subscribe(user_id, sector)        -> (bool, str)   success + message
  unsubscribe(user_id, sector)      -> (bool, str)
  subscribe_all(user_id)            -> (bool, str)
  unsubscribe_all(user_id)          -> (bool, str)
  set_subscriptions(user_id, secs)  -> (bool, str)   replace the user's full set
  get_subscriptions(user_id)        -> list[str]
  get_subscribers_for_sector(sec)   -> list[str]      list of user_ids
  format_subscriptions_list(user_id) -> str
"""

from supabase_client import get_client

# Canonical sector list. Every pitch deck falls under one of these three.
KNOWN_SECTORS = [
    "TMT",         # Technology, Media & Telecom
    "Healthcare",
    "Consumer",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize(sector: str) -> str:
    """
    Normalize a sector string for consistent storage.

    Exact (case-insensitive) match against a known sector wins first ("tmt" ->
    "TMT"), so canonical names round-trip cleanly. Only when there is no exact
    match do we fall back to substring matching for shorthand. Unknown input is
    stored title-cased.
    """
    stripped = sector.strip()
    lower = stripped.lower()
    for known in KNOWN_SECTORS:
        if lower == known.lower():
            return known
    for known in KNOWN_SECTORS:
        if lower in known.lower():
            return known
    return stripped.title()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def subscribe(user_id: str, sector: str) -> tuple[bool, str]:
    """Subscribe a user to a sector. Idempotent at the table level (PK)."""
    normalized = _normalize(sector)
    if normalized in get_subscriptions(user_id):
        return False, f"You're already subscribed to *{normalized}*."

    get_client().table("subscriptions").insert(
        {"user_id": user_id, "sector": normalized}
    ).execute()
    return True, f"Subscribed to *{normalized}* alerts."


def subscribe_all(user_id: str) -> tuple[bool, str]:
    """Subscribe a user to every known sector (replaces their current set)."""
    set_subscriptions(user_id, list(KNOWN_SECTORS), _quiet=True)
    return True, f"Subscribed to *all* {len(KNOWN_SECTORS)} sectors."


def unsubscribe(user_id: str, sector: str) -> tuple[bool, str]:
    """Unsubscribe a user from a sector."""
    normalized = _normalize(sector)
    if normalized not in get_subscriptions(user_id):
        return False, f"You aren't subscribed to *{normalized}*."

    (
        get_client()
        .table("subscriptions")
        .delete()
        .eq("user_id", user_id)
        .eq("sector", normalized)
        .execute()
    )
    return True, f"Unsubscribed from *{normalized}*."


def unsubscribe_all(user_id: str) -> tuple[bool, str]:
    """Remove all sector subscriptions for a user."""
    get_client().table("subscriptions").delete().eq("user_id", user_id).execute()
    return True, "Unsubscribed from all sectors."


def set_subscriptions(user_id: str, sectors: list[str], _quiet: bool = False):
    """
    Replace a user's full subscription set in one shot. Used by the onboarding
    "Save my preferences" flow. Deletes the user's existing rows, then inserts
    the normalized chosen sectors.
    """
    client = get_client()
    client.table("subscriptions").delete().eq("user_id", user_id).execute()

    normalized = sorted({_normalize(s) for s in sectors})
    if normalized:
        client.table("subscriptions").insert(
            [{"user_id": user_id, "sector": s} for s in normalized]
        ).execute()

    if _quiet:
        return True
    return True, f"Saved {len(normalized)} subscription(s)."


def get_subscriptions(user_id: str) -> list[str]:
    """Return the list of sectors a user is subscribed to."""
    res = (
        get_client()
        .table("subscriptions")
        .select("sector")
        .eq("user_id", user_id)
        .execute()
    )
    return [row["sector"] for row in res.data]


def get_subscribers_for_sector(sector: str) -> list[str]:
    """Return all user_ids subscribed to a given sector."""
    normalized = _normalize(sector)
    res = (
        get_client()
        .table("subscriptions")
        .select("user_id")
        .eq("sector", normalized)
        .execute()
    )
    return [row["user_id"] for row in res.data]


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
