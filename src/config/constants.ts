export const EDGAR_BASE_URL =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&dateb=&owner=include&count=40&search_text=&output=atom';

export const EDGAR_FILING_TYPES = ['8-K', '10-K', '10-Q'] as const;

export const EDGAR_SUBMISSIONS_URL = 'https://data.sec.gov/submissions/CIK';

// Proxied via Vite dev server → https://api.benzinga.com/api/v2/news
export const BENZINGA_NEWS_URL = '/api/benzinga/news';

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

/**
 * Benzinga channel → fast-path classification rules.
 * These channels are unambiguous enough that we don't need to call the LLM.
 * The LLM will still be called for all other items.
 */
export interface FastPathRule {
  materiality: 'High' | 'Medium' | 'Low';
  immediate: boolean;
  notificationWorthy: boolean;
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
}

export const BENZINGA_CHANNEL_RULES: Record<string, FastPathRule> = {
  // Definite High + Immediate
  'M&A':          { materiality: 'High',   immediate: true,  notificationWorthy: true,  sentiment: 'Neutral'  },
  'Mergers & Acquisitions': { materiality: 'High', immediate: true, notificationWorthy: true, sentiment: 'Neutral' },
  'Bankruptcy':   { materiality: 'High',   immediate: true,  notificationWorthy: true,  sentiment: 'Bearish'  },
  'FDA':          { materiality: 'High',   immediate: true,  notificationWorthy: true,  sentiment: 'Neutral'  },
  'Biotech':      { materiality: 'High',   immediate: true,  notificationWorthy: true,  sentiment: 'Neutral'  },
  'Government':   { materiality: 'High',   immediate: true,  notificationWorthy: true,  sentiment: 'Neutral'  },
  'Legal':        { materiality: 'High',   immediate: true,  notificationWorthy: true,  sentiment: 'Bearish'  },
  'Guidance':     { materiality: 'High',   immediate: true,  notificationWorthy: true,  sentiment: 'Neutral'  },
  'Downgrades':   { materiality: 'High',   immediate: true,  notificationWorthy: true,  sentiment: 'Bearish'  },

  // High but less immediately time-sensitive
  'Earnings':     { materiality: 'High',   immediate: true,  notificationWorthy: true,  sentiment: 'Neutral'  },
  'Upgrades':     { materiality: 'Medium', immediate: true,  notificationWorthy: true,  sentiment: 'Bullish'  },

  // Medium
  'IPO':          { materiality: 'Medium', immediate: false, notificationWorthy: true,  sentiment: 'Bullish'  },
  'Dividends':    { materiality: 'Medium', immediate: false, notificationWorthy: false, sentiment: 'Neutral'  },
  'Buybacks':     { materiality: 'Medium', immediate: false, notificationWorthy: false, sentiment: 'Bullish'  },
  'Management':   { materiality: 'Medium', immediate: false, notificationWorthy: true,  sentiment: 'Neutral'  },
  'Options':      { materiality: 'Medium', immediate: false, notificationWorthy: false, sentiment: 'Neutral'  },
  'Movers':       { materiality: 'Medium', immediate: true,  notificationWorthy: true,  sentiment: 'Neutral'  },

  // Low — routine
  'Press Releases': { materiality: 'Low', immediate: false, notificationWorthy: false, sentiment: 'Neutral' },
  'General':      { materiality: 'Low',   immediate: false, notificationWorthy: false, sentiment: 'Neutral'  },
};

/**
 * Given a Benzinga channels array, return the highest-priority fast-path rule
 * or null if no matching rule exists (→ must use LLM).
 */
export function getFastPathRule(channels: string[]): FastPathRule | null {
  const PRIORITY_ORDER = [
    'M&A', 'Mergers & Acquisitions', 'Bankruptcy', 'FDA', 'Biotech',
    'Government', 'Legal', 'Guidance', 'Downgrades', 'Earnings',
    'Upgrades', 'IPO', 'Management', 'Movers', 'Dividends',
    'Buybacks', 'Options', 'Press Releases', 'General',
  ];

  for (const key of PRIORITY_ORDER) {
    if (channels.some((c) => c.toLowerCase() === key.toLowerCase())) {
      return BENZINGA_CHANNEL_RULES[key] ?? null;
    }
  }
  return null;
}
