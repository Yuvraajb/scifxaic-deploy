const { createClient } = require('@supabase/supabase-js');

const USER_SUBSCRIPTION_PREFERENCES_TABLE = 'user_subscription_preferences';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * @param {string} slackUserId
 * @returns {Promise<string[]>}
 */
async function getSectorsForSlackUser(slackUserId) {
  const { data, error } = await supabase
    .from(USER_SUBSCRIPTION_PREFERENCES_TABLE)
    .select('sectors')
    .eq('slack_user_id', slackUserId)
    .maybeSingle();

  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  if (!data?.sectors) return [];
  return Array.isArray(data.sectors) ? data.sectors : [];
}

/**
 * @param {string} slackUserId
 * @param {string[]} sectors
 */
async function upsertSubscriptionSectors(slackUserId, sectors) {
  const now = new Date().toISOString();
  const { error } = await supabase.from(USER_SUBSCRIPTION_PREFERENCES_TABLE).upsert(
    {
      slack_user_id: slackUserId,
      sectors: sectors ?? [],
      updated_at: now,
    },
    { onConflict: 'slack_user_id' }
  );

  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
}

module.exports = {
  USER_SUBSCRIPTION_PREFERENCES_TABLE,
  getSectorsForSlackUser,
  upsertSubscriptionSectors,
};
