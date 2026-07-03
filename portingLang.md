# Porting to LangChain — Audit of OpenAI SDK Usage

> Snapshot of branch `Rishit` (July 2026). Maps every LLM call site in the repo,
> says which ones already use LangChain, and which ones should be ported off the
> raw `openai` SDK.

## TL;DR

Most of the work is already done. The news classifier is fully on LangChain.
Exactly **one** call site still uses the raw OpenAI SDK:
`handlers/upload.js → extractTickerAndThesis()`. Port that one function and the
`openai` dependency can be removed from the root `package.json` entirely.

---

## 1. Already on LangChain (no work needed)

### `classifier/src/classify.js`
- Uses `createAgent` from `langchain` and `ChatOpenAI` from `@langchain/openai`.
- Tool-using agent loop: `get_thesis` → optional `get_recent_classifications` /
  `fetch_article_body` → terminal `classify_article` commit.
- Model comes from `LLM_MODEL` env (default `gpt-5.5`). Swapping providers later
  is a one-line change (`ChatOpenAI` → `ChatAnthropic`, etc.) because the agent
  only sees the `model` object.

### `classifier/src/tools.js`
- All four agent tools built with `tool(handler, { name, description, schema })`
  from `langchain`, with Zod schemas. This is the idiomatic LangChain v1 tool
  pattern — nothing to change.

### Deterministic modules (deliberately no LLM — leave them alone)
- `classifier/src/dispatch.js` — routes classified articles (Slack + markdown audit log).
- `classifier/src/monthly.js` — start-of-month digest, pure date/DB logic.
- `classifier/src/finnhub.js`, `repo.js`, `slack.js`, `supabase.js` — I/O plumbing.

Per the project's design, everything outside the single Classification Agent is
deterministic. Do **not** introduce LangChain (or any LLM call) into these.

---

## 2. Port target: `handlers/upload.js`

The only remaining raw OpenAI SDK usage in the repo:

```js
// handlers/upload.js (current)
const OpenAILib = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function extractTickerAndThesis(text) {
  const completion = await openai.chat.completions.create({
    model: process.env.LLM_MODEL || 'gpt-5.5',
    messages: [ /* system + user */ ],
    max_tokens: 500,
  });
  const raw = completion.choices[0].message.content.trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);       // regex JSON rescue
    if (match) return JSON.parse(match[0]);
    throw new Error(`Could not parse OpenAI response as JSON: ${raw}`);
  }
}
```

### Why port it
1. **Structured output for free.** The manual `JSON.parse` + regex-rescue
   fallback disappears. LangChain's `withStructuredOutput(zodSchema)` uses the
   provider's native structured-output/tool-calling path and returns a
   validated object — no string parsing at all.
2. **One LLM stack.** The classifier already imports `@langchain/openai`; after
   this port, the raw `openai` package (currently in root `package.json`) has
   zero call sites and can be uninstalled.
3. **Provider portability.** `LLM_MODEL` swap or an Anthropic/other-provider
   switch later touches only the model constructor, same as the classifier.
4. **Zod is already a dependency** (root `package.json` has `zod ^4.x`), so the
   schema costs nothing.

### Proposed replacement

```js
// handlers/upload.js (ported)
const { ChatOpenAI } = require('@langchain/openai');   // ships CJS + ESM builds
const { z } = require('zod');

const TickerThesisSchema = z.object({
  ticker: z
    .string()
    .describe('Ticker symbol, e.g. AAPL. If none found, closest match or company name uppercased.'),
  thesis: z.string().describe('Central investment thesis in 2-4 sentences.'),
});

const model = new ChatOpenAI({
  model: process.env.LLM_MODEL || 'gpt-5.5',
  apiKey: process.env.OPENAI_API_KEY,
  maxTokens: 500,
});

const extractor = model.withStructuredOutput(TickerThesisSchema);

async function extractTickerAndThesis(text) {
  return extractor.invoke([
    {
      role: 'system',
      content:
        'You are an expert investment analyst. Given the text of a pitch deck or investment presentation, extract the ticker symbol of the company being presented and its central investment thesis in 2-4 sentences.',
    },
    {
      role: 'user',
      content: `Extract the ticker and thesis from this presentation:\n\n${text.slice(0, 8000)}`,
    },
  ]);
}
```

Notes:
- Return shape is unchanged (`{ ticker, thesis }`), so `processFile` /
  `processFileBuffer` and their callers need no edits.
- `handlers/upload.js` is CommonJS; `@langchain/openai` v1 is dual ESM/CJS, so
  `require()` works. (`classifier/` is ESM and imports the same package.)
- Keep the existing error behavior at the caller: a thrown error still
  propagates the same way — LangChain throws on schema-validation failure
  instead of the old "Could not parse OpenAI response as JSON" error.
- `gpt-5.5` rejects non-default temperature (see comment in `classify.js`);
  omit `temperature` here too.

---

## 3. Cleanup after the port

| Item | Action |
|---|---|
| `openai` in root `package.json` | Remove (`npm uninstall openai`) — no call sites remain. |
| `OPENAI_API_KEY` startup check in `app.js` | Keep — LangChain's `ChatOpenAI` uses the same key. |
| `.env.example` | No change — same env vars (`OPENAI_API_KEY`, `LLM_MODEL`). |

## 4. Places NOT worth LangChain

- **`app.js`** — only validates `OPENAI_API_KEY` and schedules the classifier;
  no LLM calls of its own.
- **`frontend/`** — no LLM usage; talks to the backend API only.
- **Chains/RAG/embeddings** — out of scope by design. The project explicitly
  has no embeddings, no vector retrieval, and one agent; adding LangChain
  chains, retrievers, or memory here would be complexity with no payoff.

## 5. Suggested port order

1. Port `extractTickerAndThesis` in `handlers/upload.js` (code above).
2. Test upload path end-to-end (PDF + PPTX through Slack and direct API).
3. `npm uninstall openai` at root; confirm `npm start` boots and classifier
   cycle still runs.
