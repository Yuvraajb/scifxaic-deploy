const supabase = require('../lib/supabaseAdmin');
const assertNoSupabaseError = require('../lib/assertNoSupabaseError');

const COMPANIES_TABLE = 'companies';
const THESES_TABLE = 'theses';

// True when the structured thesis has at least one populated element.
function hasStructuredContent(structuredThesis) {
  return Boolean(
    structuredThesis &&
    Object.values(structuredThesis).some(list => Array.isArray(list) && list.length > 0)
  );
}

// Register an uploaded deck's company + thesis with the news classifier.
//
// The classifier (classifier/src/) polls Finnhub for every active row in
// `companies` and judges each article against that company's active row in
// `theses` — so this upsert is what makes an uploaded deck become a watched
// position. Without it, decks land in investment_tracker (dashboard bookkeeping)
// and the classifier never hears about them.
//
// Semantics: re-uploading a deck for the same ticker replaces the thesis — the
// previous active thesis is deactivated first because the classifier's
// getThesis() expects at most one active thesis per company (maybeSingle).
async function addToWatchlist({ ticker, companyName, sector, thesis, structuredThesis }) {
  const normalizedTicker = ticker.trim().toUpperCase();

  const companyResult = await supabase
    .from(COMPANIES_TABLE)
    .upsert(
      {
        ticker: normalizedTicker,
        name: companyName || normalizedTicker,
        sector: sector || null,
        active: true,
      },
      { onConflict: 'ticker' }
    )
    .select('id')
    .single();
  const company = assertNoSupabaseError(companyResult, 'watchlist company upsert failed');

  const deactivateResult = await supabase
    .from(THESES_TABLE)
    .update({ active: false })
    .eq('company_id', company.id)
    .eq('active', true);
  assertNoSupabaseError(deactivateResult, 'watchlist thesis deactivate failed');

  // Decks that yield no structured elements still get a monitorable thesis:
  // the flat summary under a `summary` key the agent can cite.
  const structuredJson = hasStructuredContent(structuredThesis)
    ? structuredThesis
    : { summary: thesis };

  const insertResult = await supabase
    .from(THESES_TABLE)
    .insert({ company_id: company.id, structured_json: structuredJson });
  assertNoSupabaseError(insertResult, 'watchlist thesis insert failed');

  return { companyId: company.id, ticker: normalizedTicker };
}

// Register a deck's company + thesis with the news classifier, non-fatally.
// The deck is already saved to the investment tracker by the time this runs,
// so a watchlist failure is logged and surfaced to the caller but never blocks
// the save.
async function safeAddToWatchlist(deck) {
  try {
    await addToWatchlist(deck);
    return true;
  } catch (err) {
    console.error('[WATCHLIST ERROR]', err.message);
    return false;
  }
}

module.exports = { addToWatchlist, safeAddToWatchlist, hasStructuredContent };
