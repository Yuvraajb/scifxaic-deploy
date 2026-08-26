const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const { parseOffice } = require('officeparser');
const { ChatOpenAI } = require('@langchain/openai');
const { z } = require('zod');

const MODEL = process.env.LLM_MODEL || 'gpt-5.5';
// Structured thesis (5 arrays) needs more room than the old 500-token cap.
const MAX_OUTPUT_TOKENS = 1500;
const MAX_DECK_TEXT_CHARS = 8000;

// Structured-output schema. LangChain validates the model's response against
// this and returns a typed object, replacing the old manual JSON.parse.
//
// structuredThesis mirrors the shape the classifier agent reads from
// theses.structured_json (see classifier/src/seed.js) — its rationale must cite
// specific thesis elements, so the deck extraction produces those elements here.
const TickerThesisSchema = z.object({
  ticker: z
    .string()
    .describe(
      'Ticker symbol, e.g. AAPL. If no standard ticker is found, infer the closest match or use the company name in uppercase.',
    ),
  thesis: z.string().describe('Central investment thesis in 2-4 sentences.'),
  structuredThesis: z.object({
    growth_drivers: z
      .array(z.string())
      .describe('What must go right for the investment to work.'),
    risks: z
      .array(z.string())
      .describe('What could break the thesis.'),
    catalysts: z
      .array(z.string())
      .describe('Specific upcoming events that would confirm or advance the thesis.'),
    valuation_assumptions: z
      .array(z.string())
      .describe('Quantitative assumptions the valuation rests on (margins, growth rates).'),
    key_metrics: z
      .array(z.string())
      .describe('Metrics to monitor in future news, e.g. "Gross margin".'),
  }).describe(
    'The thesis decomposed into monitorable elements. Extract from the deck; keep each item to one sentence. Use empty arrays for elements the deck does not cover.',
  ),
});

const model = new ChatOpenAI({
  model: MODEL,
  // gpt-5.5 rejects any temperature other than the default (1); omit the field.
  apiKey: process.env.OPENAI_API_KEY,
  maxTokens: MAX_OUTPUT_TOKENS,
});

const extractor = model.withStructuredOutput(TickerThesisSchema);

// Download a Slack private file using the bot token for auth.
async function downloadFile(url, token) {
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
  });
  return Buffer.from(response.data);
}

// Extract raw text from a PDF buffer.
async function extractPdf(buffer) {
  const data = await pdfParse(buffer);
  return data.text;
}

// Extract raw text from a PPTX buffer via a temp file.
async function extractPptx(buffer) {
  const tmpPath = path.join(os.tmpdir(), `upload_${Date.now()}.pptx`);
  try {
    fs.writeFileSync(tmpPath, buffer);
    const ast = await parseOffice(tmpPath);
    return typeof ast === 'string' ? ast : ast.toText();
  } finally {
    fs.unlinkSync(tmpPath);
  }
}

async function extractText(buffer, fileType) {
  if (fileType === 'pdf') return extractPdf(buffer);
  if (fileType === 'pptx') return extractPptx(buffer);
  throw new Error(`Unsupported file type: ${fileType}`);
}

// Strip non-printable characters and collapse excessive whitespace.
function cleanText(text) {
  return text
    .replace(/[^\x20-\x7E\n\t]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Extract the ticker symbol and investment thesis from slide text via LangChain
// structured output. Returns a validated { ticker, thesis, structuredThesis };
// throws on schema-validation failure instead of the old JSON-parse rescue.
async function extractTickerAndThesis(text) {
  return extractor.invoke([
    {
      role: 'system',
      content:
        'You are an expert investment analyst. Given the text of a pitch deck or investment presentation, extract the ticker symbol of the company being presented (e.g. AAPL, TSLA), its central investment thesis in 2-4 sentences, and the thesis decomposed into growth drivers, risks, catalysts, valuation assumptions, and key metrics to monitor.',
    },
    {
      role: 'user',
      content: `Extract the ticker and thesis from this presentation:\n\n${text.slice(0, MAX_DECK_TEXT_CHARS)}`,
    },
  ]);
}

async function extractAndClean(buffer, fileType) {
  const rawText = await extractText(buffer, fileType);
  return cleanText(rawText);
}

// Orchestrate download → extract → clean → LLM.
async function processFile({ downloadUrl, fileType, slackToken }) {
  const buffer = await downloadFile(downloadUrl, slackToken);
  const cleanedText = await extractAndClean(buffer, fileType);
  const result = await extractTickerAndThesis(cleanedText);
  return { ...result, buffer };
}

// Buffer-based version for direct API uploads (no Slack download needed).
async function processFileBuffer({ buffer, fileType }) {
  const cleanedText = await extractAndClean(buffer, fileType);
  return extractTickerAndThesis(cleanedText);
}

module.exports = { processFile, processFileBuffer };
