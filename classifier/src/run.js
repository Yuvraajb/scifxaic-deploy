// SCIF classification worker.
//
// Runs the pull→classify→dispatch cycle exactly THREE times per weekday, at the
// times when US financial news clusters (all Eastern Time):
//   08:30 ET — pre-open earnings wave (≈56% of earnings drop before 8am) +
//              the 8:30 macro prints (CPI, jobs, GDP).
//   13:00 ET — intraday sweep (FDA decisions, M&A, analyst actions, breaking news).
//   16:30 ET — post-close earnings wave (≈44%, released ~4:05pm; tech especially).
// Weekends are skipped — corporate news clusters Tue–Thu and is sparse Sat/Sun.
//
// The schedule is computed in America/New_York via Intl, so it is correct under
// both EST and EDT regardless of the host's timezone (no reliance on $TZ).
//
// One-shot: `node src/run.js --now` runs a single cycle and exits (deploy check).

import { config as loadEnv } from 'dotenv';
loadEnv({ override: true });
import { pollFinnhub } from './finnhub.js';
import { classifyAllPending } from './classify.js';
import { dispatchAll } from './dispatch.js';
import { maybeSendMonthlyOverview } from './monthly.js';
import { isMainModule } from './util.js';

// Daily pull times, as minutes-after-midnight Eastern Time.
const SLOTS_ET = [
  8 * 60 + 30, //  8:30 ET — pre-open wave
  13 * 60, //     13:00 ET — intraday sweep
  16 * 60 + 30, // 16:30 ET — post-close wave
];

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const WEEKDAYS = [1, 2, 3, 4, 5]; // Mon..Fri (0 = Sun, 6 = Sat)

// Current Eastern-Time wall clock as { dow, hour, minute, second }, independent
// of the host timezone. dow: 0 = Sunday … 6 = Saturday.
function easternNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  const dowByName = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dow: dowByName[get('weekday')],
    hour: Number(get('hour')) % 24, // some engines emit "24" at midnight
    minute: Number(get('minute')),
    second: Number(get('second')),
  };
}

// All weekday pull slots, as minute-of-week values, sorted ascending.
function weeklySlots() {
  const slots = [];
  for (const day of WEEKDAYS) {
    for (const slot of SLOTS_ET) slots.push(day * MINUTES_PER_DAY + slot);
  }
  return slots.sort((a, b) => a - b);
}

// Milliseconds from now until the next scheduled pull. Computed in ET wall-clock
// minutes, then applied to the real clock; a DST flip mid-wait would shift the
// landing by at most an hour (≈once a year) and self-corrects on the next loop.
function msUntilNextSlot() {
  const { dow, hour, minute, second } = easternNow();
  const nowMinuteOfWeek = dow * MINUTES_PER_DAY + hour * 60 + minute;
  const slots = weeklySlots();

  let targetMinuteOfWeek = slots.find((s) => s > nowMinuteOfWeek);
  if (targetMinuteOfWeek === undefined) {
    // No slot left this week — wrap to the first slot of next week.
    targetMinuteOfWeek = slots[0] + MINUTES_PER_WEEK;
  }

  // Subtract the current seconds so we land on the minute boundary, not after it.
  return ((targetMinuteOfWeek - nowMinuteOfWeek) * 60 - second) * 1000;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatEastern = (date) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);

export async function cycle() {
  const t0 = Date.now();
  console.log(`\n── cycle start ${new Date().toISOString()} ──`);
  try {
    await pollFinnhub();
    await classifyAllPending();
    await dispatchAll();
    await maybeSendMonthlyOverview();
  } catch (e) {
    console.error('cycle error:', e);
  }
  console.log(`── cycle done in ${Math.round((Date.now() - t0) / 1000)}s ──`);
}

export async function scheduleLoop() {
  console.log('scheduler: 3 pulls/weekday at 08:30, 13:00, 16:30 ET');
  while (true) {
    const waitMs = msUntilNextSlot();
    const nextAt = new Date(Date.now() + waitMs);
    console.log(
      `scheduler: next pull ${formatEastern(nextAt)} (in ${Math.round(waitMs / 60000)} min)`
    );
    await sleep(waitMs);
    await cycle();
  }
}

// Auto-run ONLY when launched directly (`node src/run.js [--now]`). When this
// module is imported (e.g. by the hosted app.js), nothing runs until the caller
// invokes scheduleLoop() or cycle() — so importing it has no side effects.
const isMain = isMainModule(import.meta.url);
if (isMain) {
  // `--now` runs a single cycle and exits — useful for deploy verification.
  if (process.argv.includes('--now')) {
    await cycle();
    process.exit(0);
  } else {
    await scheduleLoop();
  }
}
