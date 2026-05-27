import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
mkdirSync('./data', { recursive: true });
export const db = new Database('./data/scif.db');
db.pragma('journal_mode = WAL');
db.exec(`
  create table if not exists companies (
    id integer primary key autoincrement,
    ticker text unique not null,
    name text not null,
    sector text,
    active integer not null default 1
  );
  create table if not exists theses (
    id integer primary key autoincrement,
    company_id integer not null references companies(id),
    structured_json text not null,
    active integer not null default 1,
    created_at text not null default current_timestamp
  );
  create table if not exists articles (
    id integer primary key autoincrement,
    company_id integer not null references companies(id),
    source text not null,
    source_event_id text not null,
    headline text not null,
    summary text,
    body text,
    url text,
    published_at text not null,
    raw_json text not null,
    classification text check (classification in ('HIGH_ALERT','MONTHLY_OVERVIEW','IGNORE')),
    rationale text,
    classified_at text,
    dispatched_at text,
    ingested_at text not null default current_timestamp,
    unique (source, source_event_id)
  );
  create index if not exists idx_articles_pending
    on articles (classification) where classification is null;
`);
