const crypto = require('crypto');
const supabaseAdmin = require('../lib/supabaseAdmin');
const capitalize = require('../lib/capitalize');
const { saveInvestment } = require('../handlers/investments');
const { processFile } = require('../handlers/upload');
const { safeAddToWatchlist } = require('../handlers/watchlist');
const { subscriptionCategoryOptions } = require('./categories');

const PROCESSED_DECK_TTL_MS = 60 * 60 * 1000;

// Tracks pending deck upload intents: `${channelId}:${userId}` -> { slackIds }
const pendingUploads = new Map();
const pendingAttributions = new Map();
const processedDecks = new Map();

const supportedDeckTypes = new Set(['pdf', 'pptx']);

async function resolveDisplayName(slackUserId) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('name')
    .eq('slack_user_id', slackUserId)
    .single();
  return data?.name || `<@${slackUserId}>`;
}

function rememberProcessedDeck(deck) {
  const id = crypto.randomUUID();
  processedDecks.set(id, deck);
  setTimeout(() => {
    processedDecks.delete(id);
    for (const [key, pendingId] of pendingAttributions.entries()) {
      if (pendingId === id) pendingAttributions.delete(key);
    }
  }, PROCESSED_DECK_TTL_MS);
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

  let fileUrl = null;
  if (deck.fileBuffer && deck.fileType) {
    const storagePath = `${Date.now()}-${deck.ticker}.${deck.fileType}`;
    const mime = deck.fileType === 'pdf' ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('pitch-decks')
      .upload(storagePath, deck.fileBuffer, { contentType: mime, upsert: false });
    if (!uploadErr) {
      const { data: urlData } = supabaseAdmin.storage.from('pitch-decks').getPublicUrl(storagePath);
      fileUrl = urlData?.publicUrl || null;
    }
  }

  await saveInvestment({
    ticker: deck.ticker,
    companyName: deck.companyName || deck.ticker,
    sector: deck.sector || null,
    thesis: deck.thesis,
    fileUrl,
    slackIds: deck.slackIds,
    attribution,
  });

  const watchlisted = await safeAddToWatchlist({
    ticker: deck.ticker,
    companyName: deck.companyName || deck.ticker,
    sector: deck.sector || null,
    thesis: deck.thesis,
    structuredThesis: deck.structuredThesis,
  });

  expireProcessedDeck(deckId, deck.channel, deck.user);

  const watchlistNote = watchlisted
    ? `The news classifier is now watching *${deck.ticker}* against this thesis.`
    : `Saved, but I could not register *${deck.ticker}* with the news classifier — it will not be watched until re-uploaded.`;

  await client.chat.postMessage({
    channel: deck.channel,
    thread_ts: deck.threadTs,
    text: `Saved *${deck.ticker}* to the investment tracker with attribution details. ${watchlistNote}`,
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

function registerDeckUpload(app) {
  // Slash command: /deck [@user1 @user2 ...]
  // Optional mentions associate additional Slack users with the investment.
  // The invoker is always included. Ticker is detected from the deck automatically.
  app.command('/upload', handleDeckUploadCommand);

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
        const { ticker, thesis, structuredThesis, buffer: fileBuffer } = await processFile({
          fileType,
          downloadUrl,
          slackToken: process.env.SLACK_BOT_TOKEN,
        });
        console.log(`[PROCESS] done ticker=${ticker}`);

        const uploaderName = await resolveDisplayName(message.user);
        const mentions = pending.slackIds.map(id => `<@${id}>`).join(', ');
        const deckId = rememberProcessedDeck({
          ticker,
          companyName: ticker,
          thesis,
          structuredThesis,
          fileBuffer,
          fileType,
          slackIds: pending.slackIds,
          uploaderName,
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
          {
            type: 'input',
            block_id: 'sector',
            label: { type: 'plain_text', text: 'Sector' },
            element: {
              type: 'static_select',
              action_id: 'value',
              placeholder: { type: 'plain_text', text: 'Select sector' },
              options: subscriptionCategoryOptions.map(o => ({
                text: o.text,
                value: o.value,
              })),
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
        text: 'I could not find the processed deck details anymore. Please run /upload and upload the deck again.',
      });
      return;
    }

    const values = view.state.values;
    const rawSector = values.sector?.value?.selected_option?.value || null;
    const sector = rawSector ? capitalize(rawSector) : null;

    // Update stored deck with sector so saveDeckAttribution picks it up
    if (deck && sector) deck.sector = sector;

    const attribution = {
      deckCreator: normalizeMentionsOrText(values.deck_creator.value.value) || deck.uploaderName,
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
}

module.exports = registerDeckUpload;
