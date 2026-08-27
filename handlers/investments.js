const supabase = require('../lib/supabaseAdmin');
const assertNoSupabaseError = require('../lib/assertNoSupabaseError');

const INVESTMENT_TRACKER_TABLE = 'investment_tracker';

function buildInvestmentRow({ ticker, companyName, sector, thesis, fileUrl, slackIds, attribution = {} }) {
  return {
    ticker,
    company_name: companyName || ticker,
    sector: sector || null,
    slack_ids: slackIds,
    thesis,
    file_url: fileUrl || null,
    deck_creator: attribution.deckCreator,
    investment_maker: attribution.investmentMaker,
    thesis_contributors: attribution.thesisContributors,
  };
}

// One tracker row per ticker: re-uploading a deck REPLACES the previous row
// (mirrors the watchlist's replace-the-thesis semantics), so the dashboard
// never shows duplicate company cards.
async function saveInvestment(investment) {
  const row = buildInvestmentRow(investment);
  const normalizedTicker = row.ticker.trim().toUpperCase();

  const deleteResult = await supabase
    .from(INVESTMENT_TRACKER_TABLE)
    .delete()
    .ilike('ticker', normalizedTicker);
  assertNoSupabaseError(deleteResult, 'Supabase stale-deck delete failed');

  const result = await supabase
    .from(INVESTMENT_TRACKER_TABLE)
    .insert({ ...row, ticker: normalizedTicker });
  assertNoSupabaseError(result, 'Supabase insert failed');

  return { ticker: normalizedTicker, thesis: row.thesis };
}

module.exports = {
  INVESTMENT_TRACKER_TABLE,
  buildInvestmentRow,
  saveInvestment,
};
