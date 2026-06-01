export type Role = 'god' | 'member';

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  subscribed_sectors: string[];
  created_at: string;
}

export interface Deck {
  id: number;
  ticker: string;
  company_name: string | null;
  sector: string | null;
  thesis: string | null;
  deck_creator: string | null;
  investment_maker: string | null;
  thesis_contributors: string | null;
  slack_ids: string[] | null;
  created_at: string;
}

export const SECTORS = ['Consumer', 'Healthcare', 'TMT'] as const;
export type Sector = (typeof SECTORS)[number];
