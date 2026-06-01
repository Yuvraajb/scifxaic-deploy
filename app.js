require('dotenv').config();
const crypto = require('crypto');
const { App, ExpressReceiver } = require('@slack/bolt');

const requiredEnv = [
  'SLACK_SIGNING_SECRET',
  'SLACK_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GROQ_API_KEY',
];

const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`);
}

const { saveInvestment } = require('./handlers/investments');
const { getSectorsForSlackUser, upsertSubscriptionSectors } = require('./handlers/subscriptions');
const { processFile } = require('./handlers/upload');

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// Health check endpoint for Render deploy readiness.
receiver.router.get('/health', (req, res) => {
  res.send('OK');
});

// Respond to any message that contains "hi"
app.message('hi', async ({ message, say }) => {
  await say(`Hey there, <@${message.user}>!`);
});

// Slash command: /hello
app.command('/hello', async ({ command, ack, respond }) => {
  await ack();
  await respond(`Hey <@${command.user_id}>! 👋 The bot is alive and working!`);
});

// Tracks pending deck upload intents: `${channelId}:${userId}` -> { slackIds }
const pendingUploads = new Map();
const pendingAttributions = new Map();
const processedDecks = new Map();
const supportedDeckTypes = new Set(['pdf', 'pptx']);
const subscriptionCategoryOptions = [
  {
    text: {
      type: 'plain_text',
      text: 'Consumer',
    },
    value: 'consumer',
  },
  {
    text: {
      type: 'plain_text',
      text: 'Healthcare',
    },
    value: 'healthcare',
  },
  {
    text: {
      type: 'plain_text',
      text: 'TMT',
    },
    value: 'tmt',
  },
];

function rememberProcessedDeck(deck) {
  const id = crypto.randomUUID();
  processedDecks.set(id, deck);
  setTimeout(() => {
    processedDecks.delete(id);
    for (const [key, pendingId] of pendingAttributions.entries()) {
      if (pendingId === id) pendingAttributions.delete(key);
    }
  }, 60 * 60 * 1000);
  return id;
}

function expireProcessedDeck(id, channel, user) {
  processedDecks.delete(id);
  pendingAttributions.delete(`${channel}:${user}`);
}

function parseSlackMentionIds(text) {
  return [...text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)]
    .map(match => match[1])
    .filter((id, index, ids) => ids.indexOf(id) === index);
}

function normalizeMentionsOrText(text) {
  const mentionIds = parseSlackMentionIds(text);
  if (mentionIds.length > 0) {
    return mentionIds.map(id => `<@${id}>`).join(', ');
  }

  return text.trim();
}

function readLabeledAttribution(text, labels) {
  const escapedLabels = labels.map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const labelPattern = escapedLabels.join('|');
  const match = text.match(new RegExp(`(?:^|\\n)\\s*\\*?\\s*(?:${labelPattern})\\s*\\*?\\s*:\\s*([^\\n]+)`, 'i'));
  return match ? normalizeMentionsOrText(match[1]) : '';
}

function parseAttributionText(text) {
  const attribution = {
    deckCreator: readLabeledAttribution(text, ['deck creator', 'created by', 'creator']),
    investmentMaker: readLabeledAttribution(text, ['investment maker', 'investor', 'investment by', 'made by']),
    thesisContributors: readLabeledAttribution(text, ['thesis contributors', 'thesis', 'contributors', 'worked on thesis']),
  };

  if (!attribution.deckCreator && !attribution.investmentMaker && !attribution.thesisContributors) {
    const mentionIds = parseSlackMentionIds(text);
    if (mentionIds.length > 0) {
      attribution.thesisContributors = mentionIds.map(id => `<@${id}>`).join(', ');
    }
  }

  return attribution;
}

function hasAttribution(attribution) {
  return Boolean(
    attribution.deckCreator ||
    attribution.investmentMaker ||
    attribution.thesisContributors
  );
}

async function saveDeckAttribution({ deckId, attribution, client, fallbackChannel, fallbackThreadTs }) {
  const deck = processedDecks.get(deckId);
  if (!deck) {
    await client.chat.postMessage({
      channel: fallbackChannel,
      thread_ts: fallbackThreadTs,
      text: 'I could not find the processed deck details anymore. Please run /deck and upload the deck again.',
    });
    return;
  }

  await saveInvestment({
    ticker: deck.ticker,
    thesis: deck.thesis,
    slackIds: deck.slackIds,
    attribution,
  });
  expireProcessedDeck(deckId, deck.channel, deck.user);

  await client.chat.postMessage({
    channel: deck.channel,
    thread_ts: deck.threadTs,
    text: `Saved *${deck.ticker}* to the investment tracker with attribution details.`,
  });
}

function getSupportedDeckType(file) {
  if (supportedDeckTypes.has(file.filetype)) return file.filetype;

  const extension = file.name?.split('.').pop()?.toLowerCase();
  if (supportedDeckTypes.has(extension)) return extension;

  return null;
}

async function handleDeckUploadCommand({ command, ack, respond }) {
  await ack();

  const mentionedIds = [...command.text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)]
    .map(m => m[1]);

  const slackIds = [...new Set([command.user_id, ...mentionedIds])];

  pendingUploads.set(`${command.channel_id}:${command.user_id}`, { slackIds });

  const mentions = slackIds.map(id => `<@${id}>`).join(', ');
  await respond(
    `Got it! Tracking for ${mentions}. Share the pitch deck (PDF or PPTX) in this channel and I'll extract the ticker and thesis automatically.`
  );
}

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
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
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

// Slash command: /deck [@user1 @user2 ...]
// Optional mentions associate additional Slack users with the investment.
// The invoker is always included. Ticker is detected from the deck automatically.
app.command('/upload', handleDeckUploadCommand);

app.command('/subscribe', handleSubscribeCommand);

// Listen for file shares. Only processes files when a deck upload intent is pending
// for that user+channel, then clears the intent.
app.event('message', async ({ event: message, client, say }) => {
  const key = `${message.channel}:${message.user}`;
  const pendingAttributionDeckId = pendingAttributions.get(key);
  if (!message.files && pendingAttributionDeckId && message.text) {
    const attribution = parseAttributionText(message.text);
    if (!hasAttribution(attribution)) {
      await say('Please include Slack @mentions for the deck attribution details.');
      return;
    }

    try {
      await saveDeckAttribution({
        deckId: pendingAttributionDeckId,
        attribution,
        client,
        fallbackChannel: message.channel,
        fallbackThreadTs: message.thread_ts || message.ts,
      });
    } catch (err) {
      console.error('[SAVE ERROR]', err.message);
      await say(`I extracted the thesis, but could not save the attribution details: ${err.message}`);
    }
    return;
  }

  if (!message.files || message.files.length === 0) return;

  const pending = pendingUploads.get(key);
  if (!pending) return;

  const file = message.files.find(f => getSupportedDeckType(f));
  if (!file) {
    await say('Please upload a PDF or PPTX file.');
    return;
  }
  const fileType = getSupportedDeckType(file);

  pendingUploads.delete(key);

  const channel = message.channel;
  const threadTs = message.thread_ts || message.ts;
  const postMessage = async payload => {
    const messagePayload = typeof payload === 'string' ? { text: payload } : payload;
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      ...messagePayload,
    });
  };

  // Ack the event immediately, then process async so Bolt doesn't time out
  postMessage('Processing your pitch deck... this may take a moment.').catch(() => {});

  setImmediate(async () => {
    try {
      let downloadUrl = file.url_private_download;
      if (!downloadUrl) {
        const info = await client.files.info({ file: file.id });
        downloadUrl = info.file.url_private_download;
      }

      console.log(`[PROCESS] starting extraction for file ${file.id} type=${file.filetype}`);
      const { ticker, thesis } = await processFile({
        fileType,
        downloadUrl,
        slackToken: process.env.SLACK_BOT_TOKEN,
      });
      console.log(`[PROCESS] done ticker=${ticker}`);

      const mentions = pending.slackIds.map(id => `<@${id}>`).join(', ');
      const deckId = rememberProcessedDeck({
        ticker,
        thesis,
        slackIds: pending.slackIds,
        channel,
        threadTs,
        user: message.user,
      });
      pendingAttributions.set(key, deckId);

      await postMessage({
        text: `${ticker} thesis extracted. Add attribution details to save it.`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${ticker} — Thesis:*\n\n>${thesis}\n\n_Tracking: ${mentions}_\n\nAdd attribution details to save this to the investment tracker. You can click the button, or reply here with lines like:\n\`Deck creator: @name\`\n\`Investment maker: @name\`\n\`Thesis contributors: @name @name\``,
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Add details and save',
                },
                style: 'primary',
                action_id: 'open_deck_attribution_modal',
                value: deckId,
              },
            ],
          },
        ],
      });
    } catch (err) {
      console.error('[PROCESS ERROR]', err.message);
      await postMessage(`Sorry, I ran into an error: ${err.message}`);
    }
  });
});

app.action('open_deck_attribution_modal', async ({ ack, body, action, client }) => {
  await ack();

  const deck = processedDecks.get(action.value);
  if (!deck) {
    await client.chat.postMessage({
      channel: body.channel.id,
      thread_ts: body.message?.thread_ts || body.message?.ts,
      text: 'I could not find the processed deck details anymore. Please run /deck and upload the deck again.',
    });
    return;
  }

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'deck_attribution_submission',
      private_metadata: JSON.stringify({ deckId: action.value }),
      title: {
        type: 'plain_text',
        text: 'Deck details',
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
          block_id: 'deck_creator',
          label: {
            type: 'plain_text',
            text: 'Who created the deck?',
          },
          element: {
            type: 'plain_text_input',
            action_id: 'value',
            placeholder: {
              type: 'plain_text',
              text: 'Name, team, or Slack handles',
            },
          },
        },
        {
          type: 'input',
          block_id: 'investment_maker',
          label: {
            type: 'plain_text',
            text: 'Who made the investment?',
          },
          element: {
            type: 'plain_text_input',
            action_id: 'value',
            placeholder: {
              type: 'plain_text',
              text: 'Name, fund, or decision maker',
            },
          },
        },
        {
          type: 'input',
          block_id: 'thesis_contributors',
          label: {
            type: 'plain_text',
            text: 'Who worked on the thesis?',
          },
          element: {
            type: 'plain_text_input',
            action_id: 'value',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: 'Names, teams, or Slack handles',
            },
          },
        },
      ],
    },
  });
});

app.view('deck_attribution_submission', async ({ ack, body, view, client }) => {
  await ack();

  const { deckId } = JSON.parse(view.private_metadata);
  const deck = processedDecks.get(deckId);
  if (!deck) {
    await client.chat.postMessage({
      channel: body.user.id,
      text: 'I could not find the processed deck details anymore. Please run /deck and upload the deck again.',
    });
    return;
  }

  const values = view.state.values;
  const attribution = {
    deckCreator: normalizeMentionsOrText(values.deck_creator.value.value),
    investmentMaker: normalizeMentionsOrText(values.investment_maker.value.value),
    thesisContributors: normalizeMentionsOrText(values.thesis_contributors.value.value),
  };

  try {
    await saveDeckAttribution({
      deckId,
      attribution,
      client,
      fallbackChannel: body.user.id,
    });
  } catch (err) {
    console.error('[SAVE ERROR]', err.message);
    await client.chat.postMessage({
      channel: deck.channel,
      thread_ts: deck.threadTs,
      text: `I extracted the thesis, but could not save the attribution details: ${err.message}`,
    });
  }
});

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

// App mention: @YourBot
app.event('app_mention', async ({ event, say }) => {
  await say(`Hey <@${event.user}>! You mentioned me? 👀`);
});

app.error(async (error) => {
  console.error('[APP ERROR]', error.message, error.original?.message);
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('Bot is running');

  const renderExternalUrl =
    process.env.RENDER_EXTERNAL_URL ||
    (process.env.RENDER_EXTERNAL_HOSTNAME
      ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
      : '');

  if (renderExternalUrl) {
    const https = require('https');
    setInterval(() => {
      https.get(`${renderExternalUrl}/health`, res => {
        console.log(`[KEEPALIVE] status=${res.statusCode}`);
      }).on('error', err => {
        console.error('[KEEPALIVE ERROR]', err.message);
      });
    }, 4 * 60 * 1000);
  }
})();
