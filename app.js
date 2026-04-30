require('dotenv').config();
const crypto = require('crypto');
const { App, ExpressReceiver } = require('@slack/bolt');
const { saveInvestment } = require('./handlers/investments');
const { processFile } = require('./handlers/upload');

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// Health check endpoint — keeps Render from spinning down
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
const processedDecks = new Map();
const supportedDeckTypes = new Set(['pdf', 'pptx']);

function rememberProcessedDeck(deck) {
  const id = crypto.randomUUID();
  processedDecks.set(id, deck);
  setTimeout(() => processedDecks.delete(id), 60 * 60 * 1000);
  return id;
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

// Slash command: /deck [@user1 @user2 ...]
// Optional mentions associate additional Slack users with the investment.
// The invoker is always included. Ticker is detected from the deck automatically.
app.command('/deck', handleDeckUploadCommand);

// Listen for file shares. Only processes files when a deck upload intent is pending
// for that user+channel, then clears the intent.
app.event('message', async ({ event: message, client, say }) => {
  if (!message.files || message.files.length === 0) return;

  const key = `${message.channel}:${message.user}`;
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
      });

      await postMessage({
        text: `${ticker} thesis extracted. Add attribution details to save it.`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${ticker} — Thesis:*\n\n>${thesis}\n\n_Tracking: ${mentions}_\n\nAdd attribution details to save this to the investment tracker.`,
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
    deckCreator: values.deck_creator.value.value.trim(),
    investmentMaker: values.investment_maker.value.value.trim(),
    thesisContributors: values.thesis_contributors.value.value.trim(),
  };

  try {
    await saveInvestment({
      ticker: deck.ticker,
      thesis: deck.thesis,
      slackIds: deck.slackIds,
      attribution,
    });
    processedDecks.delete(deckId);

    await client.chat.postMessage({
      channel: deck.channel,
      thread_ts: deck.threadTs,
      text: `Saved *${deck.ticker}* to the investment tracker with attribution details.`,
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

// App mention: @YourBot
app.event('app_mention', async ({ event, say }) => {
  await say(`Hey <@${event.user}>! You mentioned me? 👀`);
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('Bot is running');
})();
