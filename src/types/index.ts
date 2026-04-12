export type MaterialityLevel = 'High' | 'Medium' | 'Low' | 'Pending';
export type FeedItemType = 'filing' | 'news' | 'capital_iq';
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
  filingType?: FilingType;
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
}
