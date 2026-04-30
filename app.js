require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
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

// Tracks pending /deck intents: `${channelId}:${userId}` -> { slackIds }
const pendingUploads = new Map();

// Slash command: /deck [@user1 @user2 ...]
// Optional mentions associate additional Slack users with the investment.
// The invoker is always included. Ticker is detected from the deck automatically.
app.command('/deck', async ({ command, ack, respond }) => {
  await ack();

  const mentionedIds = [...command.text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)]
    .map(m => m[1]);

  const slackIds = [...new Set([command.user_id, ...mentionedIds])];

  pendingUploads.set(`${command.channel_id}:${command.user_id}`, { slackIds });

  const mentions = slackIds.map(id => `<@${id}>`).join(', ');
  await respond(
    `Got it! Tracking for ${mentions}. Share the pitch deck (PDF or PPTX) in this channel and I'll extract the ticker and thesis automatically.`
  );
});

// Listen for file shares. Only processes files when a /deck intent is pending
// for that user+channel, then clears the intent.
app.message(async ({ message, client, say }) => {
  if (!message.files || message.files.length === 0) return;

  const key = `${message.channel}:${message.user}`;
  const pending = pendingUploads.get(key);
  if (!pending) return;

  const supported = new Set(['pdf', 'pptx']);
  const file = message.files.find(f => supported.has(f.filetype));
  if (!file) {
    await say('Please upload a PDF or PPTX file.');
    return;
  }

  pendingUploads.delete(key);
  await say('Processing your pitch deck… this may take a moment.');

  try {
    let downloadUrl = file.url_private_download;
    if (!downloadUrl) {
      const info = await client.files.info({ file: file.id });
      downloadUrl = info.file.url_private_download;
    }

    const { ticker, thesis } = await processFile({
      fileType: file.filetype,
      downloadUrl,
      slackIds: pending.slackIds,
      slackToken: process.env.SLACK_BOT_TOKEN,
    });

    const mentions = pending.slackIds.map(id => `<@${id}>`).join(', ');
    await say(
      `*${ticker} — Thesis:*\n\n>${thesis}\n\n_Saved to investment tracker. Tracking: ${mentions}_`
    );
  } catch (err) {
    console.error('Upload handler error:', err);
    await say(`Sorry, I ran into an error processing the deck: ${err.message}`);
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
