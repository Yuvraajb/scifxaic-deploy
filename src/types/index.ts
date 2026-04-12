export type MaterialityLevel = 'High' | 'Medium' | 'Low' | 'Pending';
export type Sentiment = 'Bullish' | 'Bearish' | 'Neutral' | 'Pending';
export type FeedItemType = 'filing' | 'news';
export type TabFilter = 'all' | 'filings' | 'news';
export type FilingType = '8-K' | '10-K' | '10-Q';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  ticker: string | null;
  companyName: string;
  title: string;
  summary: string;
  materiality: MaterialityLevel;
  sentiment: Sentiment;
  /** True = time-sensitive, requires immediate attention */
  immediate: boolean;
  /** True = should surface as a push/desktop notification */
  notificationWorthy: boolean;
  filingType?: FilingType;
  /** Benzinga channels array — used for fast-path classification */
  channels?: string[];
  source: string;
  publishedAt: Date;
  url: string;
  rawSnippet: string;
  classifiedAt?: Date;
}

export interface WatchlistEntry {
  ticker: string;
  companyName?: string;
}

export interface ClassificationResult {
  materiality: Exclude<MaterialityLevel, 'Pending'>;
  summary: string;
  immediate: boolean;
  notificationWorthy: boolean;
  sentiment: Exclude<Sentiment, 'Pending'>;
}
