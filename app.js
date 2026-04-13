require('dotenv').config();
const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
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

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('Bot is running');
})();
