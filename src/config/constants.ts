export const EDGAR_BASE_URL =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&dateb=&owner=include&count=40&search_text=&output=atom';

export const EDGAR_FILING_TYPES = ['8-K', '10-K', '10-Q'] as const;

export const EDGAR_SUBMISSIONS_URL = 'https://data.sec.gov/submissions/CIK';

export const ALPACA_NEWS_URL = 'https://data.alpaca.markets/v1beta1/news';

export const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
export const CLAUDE_MODEL = 'claude-sonnet-4-6';

export const POLL_INTERVAL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 300_000;

// Drain one classification call every 1.2s → safely under 50 RPM free-tier limit
export const CLASSIFICATION_DRAIN_INTERVAL_MS = 1200;

export const MAX_FEED_ITEMS = 200;

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const CIK_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const MATERIALITY_ORDER: Record<string, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  Pending: 3,
};
