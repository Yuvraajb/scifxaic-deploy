const { createClient } = require('@supabase/supabase-js');

const INVESTMENT_TRACKER_TABLE = 'investment_tracker';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function buildInvestmentRow({ ticker, thesis, slackIds, attribution }) {
  return {
    ticker,
    slack_ids: slackIds,
    thesis,
    deck_creator: attribution.deckCreator,
    investment_maker: attribution.investmentMaker,
    thesis_contributors: attribution.thesisContributors,
  };
}

async function saveInvestment(investment) {
  const row = buildInvestmentRow(investment);
  const { error } = await supabase.from(INVESTMENT_TRACKER_TABLE).insert(row);

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);

  return {
    ticker: row.ticker,
    thesis: row.thesis,
  };
}

module.exports = {
  INVESTMENT_TRACKER_TABLE,
  buildInvestmentRow,
  saveInvestment,
};
