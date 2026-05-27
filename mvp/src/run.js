import { config as loadEnv } from 'dotenv';
loadEnv({ override: true });
import { pollFinnhub } from './finnhub.js';
import { classifyAllPending } from './classify.js';
import { dispatchAll } from './dispatch.js';

const intervalMin = Number(process.env.POLL_INTERVAL_MIN || 10);

async function cycle() {
  const t0 = Date.now();
  console.log(`\n── cycle start ${new Date().toISOString()} ──`);
  try {
    await pollFinnhub();
    await classifyAllPending();
    dispatchAll();
  } catch (e) {
    console.error('cycle error:', e);
  }
  console.log(`── cycle done in ${Math.round((Date.now() - t0) / 1000)}s ──`);
}

await cycle();
setInterval(cycle, intervalMin * 60 * 1000);
