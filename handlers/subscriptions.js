const supabase = require('../lib/supabaseAdmin');
const assertNoSupabaseError = require('../lib/assertNoSupabaseError');
const capitalize = require('../lib/capitalize');

const USER_SUBSCRIPTION_PREFERENCES_TABLE = 'user_subscription_preferences';

/**
 * @param {string} slackUserId
 * @returns {Promise<string[]>}
 */
async function getSectorsForSlackUser(slackUserId) {
  const result = await supabase
    .from(USER_SUBSCRIPTION_PREFERENCES_TABLE)
    .select('sectors')
    .eq('slack_user_id', slackUserId)
    .maybeSingle();
  const data = assertNoSupabaseError(result, 'Supabase fetch failed');

  if (!data?.sectors) return [];
  return Array.isArray(data.sectors) ? data.sectors : [];
}

/**
 * @param {string} slackUserId
 * @param {string[]} sectors
 */
async function upsertSubscriptionSectors(slackUserId, sectors) {
  const now = new Date().toISOString();
  const result = await supabase.from(USER_SUBSCRIPTION_PREFERENCES_TABLE).upsert(
    {
      slack_user_id: slackUserId,
      sectors: sectors ?? [],
      updated_at: now,
    },
    { onConflict: 'slack_user_id' }
  );
  assertNoSupabaseError(result, 'Supabase upsert failed');

  // Sync to frontend profiles table so dashboard reflects Slack subscriptions.
  // Best-effort: a sync failure here does not fail the subscribe command.
  const capitalized = (sectors ?? []).map(capitalize);
  await supabase
    .from('profiles')
    .update({ subscribed_sectors: capitalized })
    .eq('slack_user_id', slackUserId);
}

module.exports = {
  USER_SUBSCRIPTION_PREFERENCES_TABLE,
  getSectorsForSlackUser,
  upsertSubscriptionSectors,
};
