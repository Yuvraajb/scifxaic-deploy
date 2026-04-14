"""
mock_data.py
------------
Fake news events for testing the SCIF Slack bot without real API data.
Each event is a dict that mirrors what a real news/filing pipeline would produce.
Swap this file for real data by replacing get_mock_events() with a live feed.
"""

from datetime import datetime


# ---------------------------------------------------------------------------
# Fake event records
# ---------------------------------------------------------------------------

MOCK_EVENTS = [
    {
        "company": "Rivian",
        "ticker": "RIVN",
        "sector": "EV / Clean Energy",
        "event_type": "CEO Departure",
        "verdict": "BREAKS",
        "explanation": (
            "Growth thesis was heavily dependent on current leadership's "
            "operational execution and customer ramp strategy."
        ),
        "source": "Bloomberg",
        "timestamp": "2 mins ago",
    },
    {
        "company": "Moderna",
        "ticker": "MRNA",
        "sector": "Biotech",
        "event_type": "FDA Approval — RSV Vaccine",
        "verdict": "SUPPORTS",
        "explanation": (
            "Approval validates mRNA platform durability and unlocks a "
            "new multi-billion dollar revenue stream ahead of schedule."
        ),
        "source": "Reuters",
        "timestamp": "1 hr ago",
    },
    {
        "company": "Palantir",
        "ticker": "PLTR",
        "sector": "Enterprise Tech / AI",
        "event_type": "DoD Contract Renewal ($1.2B)",
        "verdict": "SUPPORTS",
        "explanation": (
            "Renewed government contract confirms recurring revenue base "
            "and validates the thesis on defense-sector AI adoption."
        ),
        "source": "SEC Filing (8-K)",
        "timestamp": "30 mins ago",
    },
    {
        "company": "Pfizer",
        "ticker": "PFE",
        "sector": "Biotech",
        "event_type": "CFO Departure Announced",
        "verdict": "BREAKS",
        "explanation": (
            "Sudden CFO exit raises uncertainty around capital allocation "
            "strategy during a critical pipeline monetization phase."
        ),
        "source": "CNBC",
        "timestamp": "3 hrs ago",
    },
    {
        "company": "Tesla",
        "ticker": "TSLA",
        "sector": "EV / Clean Energy",
        "event_type": "Analyst Downgrade — Morgan Stanley",
        "verdict": "NEUTRAL",
        "explanation": (
            "Downgrade reflects valuation concerns, not fundamental "
            "deterioration; thesis intact but near-term price pressure expected."
        ),
        "source": "Morgan Stanley Research",
        "timestamp": "5 hrs ago",
    },
    {
        "company": "Snowflake",
        "ticker": "SNOW",
        "sector": "Enterprise Tech / AI",
        "event_type": "Q1 Earnings Beat — Revenue +38% YoY",
        "verdict": "SUPPORTS",
        "explanation": (
            "Beat on both top and bottom line reinforces the data-cloud "
            "consolidation thesis and de-risks near-term multiple compression."
        ),
        "source": "Earnings Release",
        "timestamp": "Just now",
    },
    {
        "company": "Rivian",
        "ticker": "RIVN",
        "sector": "EV / Clean Energy",
        "event_type": "Q1 Production Miss — 11,400 vs 13,000 est.",
        "verdict": "BREAKS",
        "explanation": (
            "Third consecutive quarterly production shortfall calls into "
            "question the manufacturing scale assumptions in the thesis model."
        ),
        "source": "Company Press Release",
        "timestamp": "45 mins ago",
    },
]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_mock_events() -> list[dict]:
    """
    Return the full list of mock news events.
    Replace this function body with a real data-fetching call when ready.
    """
    return MOCK_EVENTS


def get_events_by_sector(sector: str) -> list[dict]:
    """Return events filtered to a specific sector (case-insensitive match)."""
    sector_lower = sector.lower()
    return [e for e in MOCK_EVENTS if sector_lower in e["sector"].lower()]


def get_demo_events(n: int = 3) -> list[dict]:
    """Return the first n events — used by the mock demo in main.py."""
    return MOCK_EVENTS[:n]


# ---------------------------------------------------------------------------
# Quick self-test (run: python mock_data.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    events = get_mock_events()
    print(f"Total mock events: {len(events)}\n")
    for e in events:
        verdict_icon = {"BREAKS": "❌", "SUPPORTS": "✅", "NEUTRAL": "⚪"}.get(e["verdict"], "")
        print(f"  [{e['sector']}] {e['company']} — {e['event_type']} {verdict_icon}")

    print("\nEV sector events:")
    for e in get_events_by_sector("EV"):
        print(f"  {e['company']}: {e['event_type']}")
