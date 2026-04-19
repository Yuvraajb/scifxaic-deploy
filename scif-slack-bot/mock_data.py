"""
mock_data.py
------------
Realistic fake news events for demo purposes.
Each event mirrors what the real news pipeline will produce.
"""

MOCK_EVENTS = [
    {
        "company": "Rivian",
        "ticker": "RIVN",
        "sector": "EV / Clean Energy",
        "event_type": "CEO Departure — RJ Scaringe Steps Down",
        "verdict": "BREAKS",
        "summary": (
            "Rivian announced this morning that founder and CEO RJ Scaringe will step down "
            "effective immediately, citing personal reasons. COO Frank Klein will serve as "
            "interim CEO while the board conducts a search. The news sent shares down 18% "
            "in pre-market trading. Scaringe had been the architect of Rivian's Amazon "
            "partnership and consumer vehicle strategy since the company's founding."
        ),
        "explanation": "Growth thesis was built on Scaringe's execution; leadership vacuum threatens the Amazon ramp.",
        "source": "Reuters",
        "timestamp": "6 mins ago",
    },
    {
        "company": "Moderna",
        "ticker": "MRNA",
        "sector": "Biotech",
        "event_type": "FDA Approval — mRNA-1345 RSV Vaccine",
        "verdict": "SUPPORTS",
        "summary": (
            "The FDA today granted full approval to Moderna's mRNA-1345 RSV vaccine for adults "
            "aged 60 and older, marking the second major mRNA product approval for the company "
            "after COVID-19. The vaccine demonstrated 83.7% efficacy in Phase 3 trials. "
            "Analysts at Goldman Sachs estimate peak annual revenue of $3.2B for the RSV franchise. "
            "Moderna plans to launch commercially within 30 days ahead of the fall respiratory season."
        ),
        "explanation": "FDA approval validates the mRNA platform thesis and unlocks a new multi-billion revenue stream.",
        "source": "FDA Press Release",
        "timestamp": "22 mins ago",
    },
    {
        "company": "Palantir",
        "ticker": "PLTR",
        "sector": "Enterprise Tech / AI",
        "event_type": "DoD Contract Renewal — $1.2B over 5 Years",
        "verdict": "SUPPORTS",
        "summary": (
            "The U.S. Department of Defense has renewed Palantir's data analytics contract "
            "for $1.2 billion over five years, expanding the scope to include AI-powered "
            "battlefield intelligence capabilities under the Maven Smart System program. "
            "The contract represents a 40% increase from the prior agreement. Palantir's "
            "CEO Alex Karp called it 'a validation of our AI platform at the highest levels "
            "of national security.' The stock rose 11% on the news."
        ),
        "explanation": "Renewed DoD contract confirms recurring government revenue and validates defense AI adoption.",
        "source": "Department of Defense",
        "timestamp": "1 hr ago",
    },
    {
        "company": "Nvidia",
        "ticker": "NVDA",
        "sector": "Enterprise Tech / AI",
        "event_type": "Q1 FY2026 Earnings Beat — Revenue +78% YoY",
        "verdict": "SUPPORTS",
        "summary": (
            "Nvidia reported Q1 FY2026 revenue of $44.1B, up 78% year-over-year and beating "
            "consensus estimates of $43.2B. Data center revenue alone came in at $39.1B, "
            "driven by insatiable demand for Blackwell GPUs. The company guided Q2 revenue "
            "to $45.0B ± 2%. CEO Jensen Huang said on the call: 'The demand for Blackwell "
            "is extraordinary. Every cloud provider and enterprise is racing to build AI "
            "infrastructure.' Free cash flow hit $26B for the quarter."
        ),
        "explanation": "Blackwell ramp beat confirms AI infrastructure supercycle thesis is intact.",
        "source": "Earnings Release",
        "timestamp": "Just now",
    },
    {
        "company": "Tesla",
        "ticker": "TSLA",
        "sector": "EV / Clean Energy",
        "event_type": "Q1 Deliveries Miss — 336K vs 390K Est.",
        "verdict": "BREAKS",
        "summary": (
            "Tesla reported Q1 2026 deliveries of 336,681 vehicles, significantly below "
            "analyst consensus of 390,000 and down 12% from Q1 2025. The company cited "
            "factory retooling for the refreshed Model Y as the primary cause, but several "
            "analysts flagged growing competition from BYD in China as a structural concern. "
            "Tesla's market share in China fell to 8.3% from 13.1% a year ago. The stock "
            "fell 9% in after-hours trading."
        ),
        "explanation": "Third consecutive delivery miss calls into question volume growth assumptions in the thesis model.",
        "source": "Tesla Investor Relations",
        "timestamp": "3 hrs ago",
    },
    {
        "company": "Snowflake",
        "ticker": "SNOW",
        "sector": "Enterprise Tech / AI",
        "event_type": "Q1 Earnings — Product Revenue +34% YoY, Guidance Raised",
        "verdict": "SUPPORTS",
        "summary": (
            "Snowflake posted Q1 product revenue of $996M, up 34% year-over-year and ahead "
            "of the $970M consensus. Remaining Performance Obligations grew 40% to $6.2B, "
            "signaling strong forward demand. Management raised full-year product revenue "
            "guidance to $4.25B from $4.0B. CEO Sridhar Ramaswamy highlighted accelerating "
            "AI workload adoption: 'Over 3,000 customers are now running AI and ML workloads "
            "on Snowflake, up from 1,200 last quarter.'"
        ),
        "explanation": "Revenue beat and raised guidance reinforce the data-cloud AI consolidation thesis.",
        "source": "Earnings Release",
        "timestamp": "45 mins ago",
    },
    {
        "company": "Eli Lilly",
        "ticker": "LLY",
        "sector": "Healthcare",
        "event_type": "FDA Expands Zepbound Approval to Cardiovascular Indications",
        "verdict": "SUPPORTS",
        "summary": (
            "The FDA approved a new indication for Eli Lilly's Zepbound (tirzepatide) for "
            "reducing cardiovascular risk in obese patients with established heart disease. "
            "The SURMOUNT-MMO trial showed a 23% reduction in major adverse cardiovascular "
            "events. This significantly expands the addressable market beyond obesity into "
            "cardiology, where payers have historically been more willing to cover treatments. "
            "Analysts raised peak sales estimates for Zepbound to $28B annually."
        ),
        "explanation": "CV indication expands addressable market and strengthens payer coverage thesis for Zepbound.",
        "source": "FDA / Eli Lilly Press Release",
        "timestamp": "2 hrs ago",
    },
    {
        "company": "Pfizer",
        "ticker": "PFE",
        "sector": "Healthcare",
        "event_type": "CFO Departure Announced — Effective Immediately",
        "verdict": "NEUTRAL",
        "summary": (
            "Pfizer announced the immediate departure of CFO David Denton, who is leaving "
            "to pursue other opportunities. EVP and Chief Business Officer Aamir Malik will "
            "serve as interim CFO. The announcement comes as Pfizer is mid-way through a "
            "$4B cost restructuring program. Analysts noted the timing is unusual but noted "
            "the restructuring is largely on track and the pipeline remains solid with 8 "
            "potential blockbuster drugs in Phase 3 trials."
        ),
        "explanation": "CFO exit creates near-term uncertainty but restructuring remains on track; thesis intact.",
        "source": "Pfizer Press Release",
        "timestamp": "5 hrs ago",
    },
]


def get_mock_events() -> list[dict]:
    return MOCK_EVENTS


def get_events_by_sector(sector: str) -> list[dict]:
    sector_lower = sector.lower()
    return [e for e in MOCK_EVENTS if sector_lower in e["sector"].lower()]


def get_demo_events(n: int = 3) -> list[dict]:
    return MOCK_EVENTS[:n]


if __name__ == "__main__":
    for e in MOCK_EVENTS:
        verdict_icon = {"BREAKS": "❌", "SUPPORTS": "✅", "NEUTRAL": "⚪"}.get(e["verdict"], "")
        print(f"  [{e['sector']}] {e['company']} — {e['event_type']} {verdict_icon}")
        print(f"    {e['summary'][:80]}...")
        print()
