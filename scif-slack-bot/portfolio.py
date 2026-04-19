"""
portfolio.py
------------
Defines the SCIF portfolio companies.
Each entry maps to a ticker that the news fetcher and classifier use.
Add/remove companies here — the scheduler picks up changes on next restart.
"""

PORTFOLIO = [
    {
        "company": "Rivian",
        "ticker": "RIVN",
        "sector": "EV / Clean Energy",
        "thesis": (
            "Electric truck and van manufacturer with Amazon fleet partnership. "
            "Thesis hinges on manufacturing scale-up, cost reduction, and demand for R1T/R1S."
        ),
    },
    {
        "company": "Moderna",
        "ticker": "MRNA",
        "sector": "Biotech",
        "thesis": (
            "mRNA technology platform with proven COVID vaccine. "
            "Thesis depends on pipeline diversification into oncology, flu, and RSV."
        ),
    },
    {
        "company": "Palantir",
        "ticker": "PLTR",
        "sector": "Enterprise Tech / AI",
        "thesis": (
            "AI-driven data analytics with strong US government contracts. "
            "Thesis driven by AIP commercial adoption and defense-sector AI expansion."
        ),
    },
    {
        "company": "Pfizer",
        "ticker": "PFE",
        "sector": "Healthcare",
        "thesis": (
            "Diversified pharma with Paxlovid and oncology acquisitions. "
            "Thesis tied to post-COVID revenue normalization and pipeline execution."
        ),
    },
    {
        "company": "Tesla",
        "ticker": "TSLA",
        "sector": "EV / Clean Energy",
        "thesis": (
            "Vertically integrated EV and energy company. "
            "Thesis includes autonomous driving optionality via FSD and Robotaxi."
        ),
    },
    {
        "company": "Snowflake",
        "ticker": "SNOW",
        "sector": "Enterprise Tech / AI",
        "thesis": (
            "Cloud-native data warehouse capturing enterprise data consolidation. "
            "Thesis hinges on consumption revenue growth and AI workload adoption."
        ),
    },
    {
        "company": "Nvidia",
        "ticker": "NVDA",
        "sector": "Enterprise Tech / AI",
        "thesis": (
            "GPU computing platform at the center of AI infrastructure buildout. "
            "Thesis driven by data center demand, Blackwell ramp, and software moat (CUDA)."
        ),
    },
    {
        "company": "Eli Lilly",
        "ticker": "LLY",
        "sector": "Healthcare",
        "thesis": (
            "GLP-1 leader with Mounjaro and Zepbound for diabetes/obesity. "
            "Thesis depends on manufacturing capacity expansion and Alzheimer's drug Kisunla."
        ),
    },
]
