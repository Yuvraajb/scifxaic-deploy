// Start-of-month MONTHLY_OVERVIEW digest.
//
// During the month the agent classifies thesis-relevant-but-not-urgent news as
// MONTHLY_OVERVIEW; those rows accumulate in Supabase with dispatched_at = null
// (dispatch.js deliberately holds them back). At the start of each month this
// gathers the items from completed months and posts them to Slack as one digest,
// then stamps dispatched_at so they are never re-sent.
//
// Idempotency reuses the existing articles.dispatched_at column — no extra
// table. "Already sent" == dispatched_at is set. Trigger == there exist
// undispatched MONTHLY_OVERVIEW rows published before this month started, which
// first becomes true on the first cycle of a new month.
//
// Months are computed in UTC; a few hours of skew versus Eastern Time at a month
// boundary does not matter for a monthly recap and avoids offset arithmetic.

import { getUndispatchedMonthlyOverview, markManyDispatched } from './repo.js';
import { postMonthlyOverview } from './slack.js';
import { appendOverviewAudit } from './dispatch.js';

// Start of the current month (UTC) as an ISO instant. Only items published
// before this — i.e. in a completed month — are eligible, so current-month items
// keep accumulating until next month.
function currentMonthStartIso(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// Human label for the previous calendar month, e.g. "May 2026". Date.UTC
// normalizes month -1 into December of the prior year.
function previousMonthLabel(now) {
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(prevStart);
}

// Post the digest of completed-month MONTHLY_OVERVIEW items once they exist.
// Safe to call every cycle: returns early when there is nothing pending, and
// only stamps dispatched_at after a successful post so a failed post is retried
// on the next cycle rather than silently dropping a month's digest.
export async function maybeSendMonthlyOverview(now = new Date()) {
  const articles = await getUndispatchedMonthlyOverview(currentMonthStartIso(now));
  if (articles.length === 0) return;

  const label = previousMonthLabel(now);
  const posted = await postMonthlyOverview(articles, label);
  if (!posted) {
    console.warn(`monthly: post failed for ${label}; leaving ${articles.length} item(s) pending for retry`);
    return;
  }

  for (const article of articles) appendOverviewAudit(article);
  await markManyDispatched(articles.map((a) => a.id));
  console.log(`monthly: posted ${articles.length} overview item(s) for ${label}`);
}
