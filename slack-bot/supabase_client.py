"""
supabase_client.py
------------------
Server-side Supabase client for the Slack bot.

Uses the service_role key, which bypasses RLS. Safe here because the bot runs
on the server (Render worker), never in a browser. The `subscriptions` table has
RLS enabled with no anon policy, so only this service_role client can read/write
it (see supabase/migrations/0001_init.sql).
"""

import os
from functools import lru_cache

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()


@lru_cache(maxsize=1)
def get_client() -> Client:
    """Return a cached Supabase client, or raise if config is missing."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise EnvironmentError(
            "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.\n"
            "Copy .env.example to .env and fill in your Supabase values."
        )
    return create_client(url, key)
