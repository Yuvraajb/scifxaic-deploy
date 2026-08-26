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

async function saveInvestment(investment) {
  const row = buildInvestmentRow(investment);
  const result = await supabase.from(INVESTMENT_TRACKER_TABLE).insert(row);
  assertNoSupabaseError(result, 'Supabase insert failed');

  return { ticker: row.ticker, thesis: row.thesis };
}

module.exports = {
  INVESTMENT_TRACKER_TABLE,
  buildInvestmentRow,
  saveInvestment,
};
