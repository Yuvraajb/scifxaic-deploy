const { getSectorsForSlackUser, upsertSubscriptionSectors } = require('../handlers/subscriptions');
const { subscriptionCategoryOptions } = require('./categories');

const SECTORS_FETCH_TIMEOUT_MS = 1500;

function formatSubscriptionCategories(values) {
  if (values.length === 0) return 'No categories selected.';

  const names = subscriptionCategoryOptions
    .filter(option => values.includes(option.value))
    .map(option => option.text.text);

  return names.join(', ');
}

async function handleSubscribeCommand({ command, ack, client }) {
  console.log('[SUBSCRIBE] received, acking...');
  await ack();
  console.log('[SUBSCRIBE] acked, fetching sectors...');

  let savedSectors = [];
  try {
    savedSectors = await Promise.race([
      getSectorsForSlackUser(command.user_id),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), SECTORS_FETCH_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.error('[SUBSCRIBE LOAD ERROR]', err.message);
  }
  console.log('[SUBSCRIBE] sectors fetched, opening modal...');

  const initialOptions = subscriptionCategoryOptions.filter(option =>
    savedSectors.includes(option.value)
  );
  const categoryElement = {
    type: 'multi_static_select',
    action_id: 'categories',
    placeholder: {
      type: 'plain_text',
      text: 'Select categories',
    },
    options: subscriptionCategoryOptions,
  };

  if (initialOptions.length > 0) {
    categoryElement.initial_options = initialOptions;
  }

  try {
    await client.views.open({
    trigger_id: command.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'subscription_preferences_submission',
      private_metadata: JSON.stringify({ userId: command.user_id }),
      title: {
        type: 'plain_text',
        text: 'Subscriptions',
      },
      submit: {
        type: 'plain_text',
        text: 'Save',
      },
      close: {
        type: 'plain_text',
        text: 'Cancel',
      },
      blocks: [
        {
          type: 'input',
          block_id: 'subscription_categories',
          optional: true,
          label: {
            type: 'plain_text',
            text: 'Categories',
          },
          element: categoryElement,
        },
      ],
    },
  });
    console.log('[SUBSCRIBE] modal opened successfully');
  } catch (err) {
    console.error('[SUBSCRIBE MODAL ERROR]', err.message, err.data);
  }
}

function registerSubscriptions(app) {
  app.command('/subscribe', handleSubscribeCommand);

  app.view('subscription_preferences_submission', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const userId = metadata.userId || body.user.id;
      const selectedOptions =
        view.state.values.subscription_categories.categories.selected_options || [];
      const selectedValues = selectedOptions.map(option => option.value);

      await upsertSubscriptionSectors(userId, selectedValues);
      console.log(`[SUBSCRIBE] saved for user=${userId} categories=${selectedValues.join(',')}`);

      await client.chat.postMessage({
        channel: userId,
        text: `Subscription preferences saved: ${formatSubscriptionCategories(selectedValues)}`,
      });
    } catch (err) {
      console.error('[SUBSCRIBE ERROR]', err.message, err.stack);
      let dmUser = body.user?.id;
      try {
        const metadata = JSON.parse(view.private_metadata);
        dmUser = metadata.userId || dmUser;
      } catch (_) {
        /* use body.user.id */
      }
      if (dmUser) {
        try {
          await client.chat.postMessage({
            channel: dmUser,
            text: `Could not save subscription preferences: ${err.message}`,
          });
        } catch (_) {
          // ignore DM failure
        }
      }
    }
  });
}

module.exports = registerSubscriptions;
