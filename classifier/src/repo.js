// Supabase data-access layer for the classification worker.
//
// Replaces the better-sqlite3 prepared statements that previously lived in
// db.js, finnhub.js, classify.js, tools.js and dispatch.js. Every function is
// async because Supabase queries are network calls.
//
// Schema is the one applied in supabase/migrations/0001_init.sql:
//   companies(id, ticker, name, sector, active)
//   theses(id, company_id, structured_json jsonb, active, created_at)
//   articles(id, company_id, source, source_event_id, headline, summary, body,
//            url, published_at, raw_json jsonb, classification, rationale,
//            classified_at, dispatched_at, ingested_at)
//
// Citation: docs/supabase_docs/reference/javascript/insert.md — "By default,
// inserted rows are not returned. To return it, chain the call with .select()."
// We use .select() on inserts so callers still get the row id back.

import { supabase } from './supabase.js';
import { LABELS } from './labels.js';

// Supabase returns { data, error }. Throw a clear Error on failure so the
// caller's existing try/catch paths fire; return data otherwise.
function unwrap(result, context) {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}

const nowIso = () => new Date().toISOString();

// Flatten the nested company object Supabase returns for an embedded join
// (e.g. { ...article, companies: { ticker, name } }) into top-level fields,
// matching the shape the rest of the code expected from the old SQL join.
function flattenCompany(row) {
  if (!row) return row;
  const { companies, ...rest } = row;
  return { ...rest, ...(companies || {}) };
}

// ─── companies ────────────────────────────────────────────────────────────────

export async function getActiveCompanies() {
  const res = await supabase
    .from('companies')
    .select('id, ticker')
    .eq('active', true);
  return unwrap(res, 'getActiveCompanies');
}

// ─── articles: ingestion ────────────────────────────────────────────────────────

// Insert a news article, ignoring rows that collide on the
// unique (source, source_event_id) constraint. Returns true if a new row was
// inserted, false if it was a duplicate.
//
// ignoreDuplicates mirrors the old `insert or ignore`. With it on, a duplicate
// yields an empty data array instead of an error.
export async function insertArticle(article) {
  const res = await supabase
    .from('articles')
    .upsert(article, {
      onConflict: 'source,source_event_id',
      ignoreDuplicates: true,
    })
    .select('id');
  const data = unwrap(res, 'insertArticle');
  return Array.isArray(data) && data.length > 0;
}

// ─── articles: classification work queue ────────────────────────────────────────

// Claim the next unclassified article (oldest first), joined with its company.
// Returns null when the queue is empty.
export async function claimNextPending() {
  const res = await supabase
    .from('articles')
    .select('*, companies(ticker, name)')
    .is('classification', null)
    .order('published_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return flattenCompany(unwrap(res, 'claimNextPending'));
}

export async function getArticleClassification(id) {
  const res = await supabase
    .from('articles')
    .select('classification, rationale')
    .eq('id', id)
    .maybeSingle();
  return unwrap(res, 'getArticleClassification');
}

export async function markClassification(id, label, rationale) {
  const res = await supabase
    .from('articles')
    .update({ classification: label, rationale, classified_at: nowIso() })
    .eq('id', id);
  unwrap(res, 'markClassification');
}

export async function loadFullArticle(id) {
  const res = await supabase
    .from('articles')
    .select('*, companies(ticker)')
    .eq('id', id)
    .maybeSingle();
  return flattenCompany(unwrap(res, 'loadFullArticle'));
}

export async function getArticleBasic(id) {
  const res = await supabase
    .from('articles')
    .select('id, headline, summary, url')
    .eq('id', id)
    .maybeSingle();
  return unwrap(res, 'getArticleBasic');
}

// ─── articles: dispatch ─────────────────────────────────────────────────────────

export async function markDispatched(id) {
  const res = await supabase
    .from('articles')
    .update({ dispatched_at: nowIso() })
    .eq('id', id);
  unwrap(res, 'markDispatched');
}

// Classified rows not yet dispatched (backfill sweep on startup). Excludes
// MONTHLY_OVERVIEW — those are held back and batched into the start-of-month
// digest by monthly.js, not dispatched per cycle.
export async function getPendingDispatch() {
  const res = await supabase
    .from('articles')
    .select('*, companies(ticker)')
    .not('classification', 'is', null)
    .neq('classification', LABELS.MONTHLY_OVERVIEW)
    .is('dispatched_at', null)
    .order('published_at', { ascending: true });
  const data = unwrap(res, 'getPendingDispatch');
  return (data || []).map(flattenCompany);
}

// ─── monthly overview digest ────────────────────────────────────────────────────

// MONTHLY_OVERVIEW articles awaiting their monthly Slack digest: classified
// MONTHLY_OVERVIEW, not yet dispatched, and published before `beforeIso` (the
// start of the current month — so only completed months are sent). The existing
// dispatched_at column doubles as the "already sent" marker, so no extra table
// is needed: once the digest posts and stamps dispatched_at, these rows drop out
// of this query and cannot be re-sent.
export async function getUndispatchedMonthlyOverview(beforeIso) {
  const res = await supabase
    .from('articles')
    .select('id, headline, summary, url, source, published_at, rationale, companies(ticker, name)')
    .eq('classification', LABELS.MONTHLY_OVERVIEW)
    .is('dispatched_at', null)
    .lt('published_at', beforeIso)
    .order('published_at', { ascending: true });
  const data = unwrap(res, 'getUndispatchedMonthlyOverview');
  return (data || []).map(flattenCompany);
}

// Stamp dispatched_at on a batch of articles in one round-trip.
export async function markManyDispatched(ids) {
  if (!ids || ids.length === 0) return;
  const res = await supabase
    .from('articles')
    .update({ dispatched_at: nowIso() })
    .in('id', ids);
  unwrap(res, 'markManyDispatched');
}

// ─── theses ─────────────────────────────────────────────────────────────────────

// Active structured thesis for a ticker. structured_json is jsonb, so Supabase
// returns it already parsed (no JSON.parse needed). Returns null if absent.
export async function getThesis(ticker) {
  const res = await supabase
    .from('theses')
    .select('structured_json, companies!inner(ticker, name)')
    .eq('companies.ticker', ticker)
    .eq('active', true)
    .maybeSingle();
  const row = unwrap(res, 'getThesis');
  if (!row) return null;
  return {
    ticker: row.companies.ticker,
    name: row.companies.name,
    thesis: row.structured_json,
  };
}

export async function getRecentClassifications(ticker, limit) {
  const res = await supabase
    .from('articles')
    .select('id, headline, classification, rationale, classified_at, companies!inner(ticker)')
    .eq('companies.ticker', ticker)
    .not('classification', 'is', null)
    .order('classified_at', { ascending: false })
    .limit(limit);
  const data = unwrap(res, 'getRecentClassifications');
  return (data || []).map((r) => ({
    article_id: r.id,
    headline: r.headline,
    label: r.classification,
    rationale: r.rationale,
    classified_at: r.classified_at,
  }));
}

// ─── seed ───────────────────────────────────────────────────────────────────────

export async function upsertCompany({ ticker, name, sector }) {
  const res = await supabase
    .from('companies')
    .upsert({ ticker, name, sector }, { onConflict: 'ticker' })
    .select('id')
    .maybeSingle();
  return unwrap(res, 'upsertCompany');
}

export async function getActiveThesisFor(companyId) {
  const res = await supabase
    .from('theses')
    .select('id')
    .eq('company_id', companyId)
    .eq('active', true)
    .maybeSingle();
  return unwrap(res, 'getActiveThesisFor');
}

export async function insertThesis(companyId, structuredJson) {
  const res = await supabase
    .from('theses')
    .insert({ company_id: companyId, structured_json: structuredJson });
  unwrap(res, 'insertThesis');
}
