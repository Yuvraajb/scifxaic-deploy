// Shared by slack/subscriptions.js (category multi-select) and
// slack/deckUpload.js (sector select in the attribution modal).
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

module.exports = { subscriptionCategoryOptions };
