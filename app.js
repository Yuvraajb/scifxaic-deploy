require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const cors = require('cors');

const requiredEnv = [
  'SLACK_SIGNING_SECRET',
  'SLACK_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
  'FINNHUB_API_KEY',
  'SLACK_CHANNEL_ID',
];

const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`);
}

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// ── API middleware ──────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);
receiver.router.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
receiver.router.use(require('express').json());

require('./routes/api')(receiver.router);

// Respond to any message that contains "hi"
app.message('hi', async ({ message, say }) => {
  await say(`Hey there, <@${message.user}>!`);
});

// Slash command: /hello
app.command('/hello', async ({ command, ack, respond }) => {
  await ack();
  await respond(`Hey <@${command.user_id}>! The bot is alive and working!`);
});

require('./slack/deckUpload')(app);
require('./slack/subscriptions')(app);

// App mention: @YourBot
app.event('app_mention', async ({ event, say }) => {
  await say(`Hey <@${event.user}>! You mentioned me?`);
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

  // News classification agent: poll Finnhub -> classify -> dispatch HIGH_ALERT /
  // monthly digest to Slack, on 3 weekday ET slots (08:30 / 13:00 / 16:30).
  // The classifier is an ES module, so it is loaded with dynamic import(); the
  // keepalive ping above keeps this (free) web service warm between slots so the
  // in-process scheduler survives idle gaps. Failures here must NOT take down the
  // HTTP server, so the promise is isolated with .catch().
  import('./classifier/src/run.js')
    .then(({ scheduleLoop }) => {
      console.log('[AGENT] starting news classifier scheduler (3 ET slots/weekday)');
      return scheduleLoop();
    })
    .catch(err =>
      console.error('[AGENT ERROR] classifier scheduler failed to start:', err.message)
    );
})();
