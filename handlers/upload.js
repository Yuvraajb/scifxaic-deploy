const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const officeParser = require('officeparser');
const { createClient } = require('@supabase/supabase-js');
const GroqSDK = require('groq-sdk');

const Groq = GroqSDK.default || GroqSDK;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
    return await officeParser.parseOfficeAsync(tmpPath);
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

// Use Groq to extract both the ticker symbol and investment thesis from slide text.
// Returns { ticker, thesis }.
async function extractTickerAndThesis(text) {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content:
          'You are an expert investment analyst. Given the text of a pitch deck or investment presentation, extract two things:\n1. The ticker symbol of the company being presented (e.g. AAPL, TSLA). If no standard ticker is found, infer the closest match or use the company name in uppercase.\n2. The central investment thesis in 2–4 sentences.\n\nRespond ONLY with valid JSON in this exact format:\n{"ticker": "AAPL", "thesis": "..."}',
      },
      {
        role: 'user',
        content: `Extract the ticker and thesis from this presentation:\n\n${text.slice(0, 8000)}`,
      },
    ],
    max_tokens: 500,
  });

  const raw = completion.choices[0].message.content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    // Fallback: try to pull JSON out of any surrounding text
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Could not parse Groq response as JSON: ${raw}`);
  }
}

// Orchestrate download → extract → clean → LLM → store in investment_tracker.
async function processFile({ downloadUrl, fileType, slackIds, slackToken }) {
  const buffer = await downloadFile(downloadUrl, slackToken);
  const rawText = await extractText(buffer, fileType);
  const cleanedText = cleanText(rawText);
  const { ticker, thesis } = await extractTickerAndThesis(cleanedText);

  const { error } = await supabase.from('investment_tracker').insert({
    ticker,
    slack_ids: slackIds,
    thesis,
  });

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);

  return { ticker, thesis };
}

module.exports = { processFile };
