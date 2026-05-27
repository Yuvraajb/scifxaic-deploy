"""
classifier.py
-------------
Uses Gemini Flash to classify financial news articles.
Determines: material?, verdict (BREAKS/SUPPORTS/NEUTRAL), urgency, event type, explanation.

Env var required:
  GEMINI_API_KEY=your_key_here
"""

import os
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "material": {
            "type": "boolean",
            "description": (
                "True if this news is material to the investment thesis — "
                "earnings, FDA decisions, major contracts, leadership changes, M&A, "
                "analyst upgrades/downgrades, significant regulatory events. "
                "False for routine/fluff articles."
            ),
        },
        "verdict": {
            "type": "string",
            "enum": ["BREAKS", "SUPPORTS", "NEUTRAL"],
            "description": (
                "BREAKS: news undermines the core investment thesis. "
                "SUPPORTS: news validates or strengthens the thesis. "
                "NEUTRAL: material but doesn't clearly move the thesis."
            ),
        },
        "urgent": {
            "type": "boolean",
            "description": (
                "True for breaking events needing immediate attention: earnings beats/misses, "
                "FDA approvals/rejections, CEO departure, major M&A, large contract wins/losses. "
                "False for slower-moving news suitable for a daily digest."
            ),
        },
        "event_type": {
            "type": "string",
            "description": (
                "Short label for the event. Examples: 'Q2 Earnings Beat', "
                "'CEO Departure', 'FDA Approval', 'Analyst Downgrade'."
            ),
        },
        "explanation": {
            "type": "string",
            "description": "One sentence (max 20 words) explaining why this matters to the thesis.",
        },
    },
    "required": ["material", "verdict", "urgent", "event_type", "explanation"],
}


def classify_news(
    company: str,
    ticker: str,
    sector: str,
    thesis: str,
    headline: str,
    summary: str,
) -> dict | None:
    """
    Classify a news article using Gemini Flash.

    Returns a dict with keys: material, verdict, urgent, event_type, explanation.
    Returns None on API error or missing key.
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return None

    client = genai.Client(api_key=api_key)

    prompt = (
        f"You are analyzing news for a student investment fund portfolio.\n\n"
        f"Company: {company} (${ticker}) — {sector}\n"
        f"Investment thesis: {thesis}\n\n"
        f"News headline: {headline}\n"
        f"Summary: {summary[:500] if summary else 'No summary available.'}\n\n"
        f"Classify this news article using the provided JSON schema."
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_RESPONSE_SCHEMA,
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"[classifier] Error classifying '{headline[:60]}': {e}")
        return None


# ---------------------------------------------------------------------------
# Quick self-test (run: python classifier.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    from portfolio import PORTFOLIO

    test_company = PORTFOLIO[0]  # Rivian
    result = classify_news(
        company=test_company["company"],
        ticker=test_company["ticker"],
        sector=test_company["sector"],
        thesis=test_company["thesis"],
        headline="Rivian misses Q1 production targets for third consecutive quarter",
        summary="Rivian produced 11,400 vehicles in Q1, missing analyst estimates of 13,000.",
    )
    print("Classification result:")
    print(json.dumps(result, indent=2))
