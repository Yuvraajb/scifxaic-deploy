"""
news_fetcher.py
---------------
Fetches recent company news from Finnhub (free tier).
Get a free API key at https://finnhub.io/register

Env var required:
  FINNHUB_API_KEY=your_key_here
"""

import os
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

FINNHUB_BASE = "https://finnhub.io/api/v1"


def fetch_company_news(ticker: str, days_back: int = 1) -> list[dict]:
    """
    Fetch recent news articles for a company from Finnhub.

    Returns a list of dicts with keys:
      id, headline, summary, source, datetime (unix ts), url
    Returns [] on error or if no API key is set.
    """
    api_key = os.getenv("FINNHUB_API_KEY", "")
    if not api_key:
        return []

    today = datetime.now().strftime("%Y-%m-%d")
    from_date = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")

    try:
        resp = requests.get(
            f"{FINNHUB_BASE}/company-news",
            params={"symbol": ticker, "from": from_date, "to": today, "token": api_key},
            timeout=10,
        )
        resp.raise_for_status()
        articles = resp.json()
        # Finnhub returns a list; filter out empty headlines
        return [a for a in articles if a.get("headline")]
    except Exception as e:
        print(f"[news_fetcher] Error fetching {ticker}: {e}")
        return []


# ---------------------------------------------------------------------------
# Quick self-test (run: python news_fetcher.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    from portfolio import PORTFOLIO

    for company in PORTFOLIO[:3]:
        ticker = company["ticker"]
        articles = fetch_company_news(ticker)
        print(f"{ticker}: {len(articles)} articles")
        for a in articles[:2]:
            print(f"  [{a.get('source')}] {a.get('headline', '')[:80]}")
        print()
