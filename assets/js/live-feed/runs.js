// live-feed/runs.js — PURE reconstruction of Rightmove-scraper "runs" from the
// public sync_log feed. No DOM, no storage, no Supabase — just row → run maths so
// it is fully unit-testable (tests/live-feed-runs.test.js).
//
// The fetcher (tools/fetch-listings.mjs) writes one sync_log row per affected
// listing during a run: table_name='listings', actor='system',
// action ∈ {insert,update,delete}, timestamp `at`. A single fetch therefore
// appears as a tight burst of rows; clustering by time-gap rebuilds each run.

const MIN = 60 * 1000;

const toMs = (v) => {
  if (v == null) return NaN;
  if (v instanceof Date) return v.getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
};

/**
 * Cluster raw sync_log rows into scraper "runs", newest first.
 * A new (older→newer) row opens a fresh run when its gap to the previous row in
 * the same cluster exceeds `gapMinutes`. Rows with an unparseable `at` are dropped.
 *
 * @param {Array<{action?:string, at?:string|Date}>} rows
 * @param {object} [opts]
 * @param {number} [opts.gapMinutes=20] inter-run silence that splits two runs
 * @param {number} [opts.liveWindowMinutes=3] recency for `isLive` (still writing)
 * @param {number} [opts.now=Date.now()] clock injection for tests
 * @returns {Array<{startedAt,finishedAt,added,updated,removed,total,isLive}>}
 *          times are ISO strings; newest run first.
 */
export function clusterRuns(rows, { gapMinutes = 20, liveWindowMinutes = 3, now = Date.now() } = {}) {
  const clean = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ action: String(r?.action ?? '').toLowerCase(), ms: toMs(r?.at) }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms); // oldest → newest for gap walking

  const gap = gapMinutes * MIN;
  const liveWindow = liveWindowMinutes * MIN;
  const runs = [];
  let cur = null;

  for (const row of clean) {
    if (!cur || row.ms - cur._last > gap) {
      cur = { _first: row.ms, _last: row.ms, added: 0, updated: 0, removed: 0, total: 0 };
      runs.push(cur);
    }
    cur._last = row.ms;
    cur.total += 1;
    if (row.action === 'insert') cur.added += 1;
    else if (row.action === 'update') cur.updated += 1;
    else if (row.action === 'delete') cur.removed += 1;
  }

  return runs
    .map((r) => ({
      startedAt: new Date(r._first).toISOString(),
      finishedAt: new Date(r._last).toISOString(),
      added: r.added,
      updated: r.updated,
      removed: r.removed,
      total: r.total,
      isLive: now - r._last < liveWindow,
    }))
    .sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt)); // newest first
}

/**
 * Client-side averages over the feed's own runs (the RPC already provides the
 * headline listings/day; this powers the feed's "runs/day" footer). Counts runs
 * whose finishedAt falls inside the trailing `days` window.
 *
 * @param {Array<{finishedAt:string, added:number}>} runs  output of clusterRuns
 * @param {object} [opts]
 * @param {number} [opts.days=7]
 * @param {number} [opts.now=Date.now()]
 * @returns {{ runsPerDay:number, addedPerDay:number, runs:number }}
 */
export function dailyAverages(runs, { days = 7, now = Date.now() } = {}) {
  const since = now - days * 24 * 60 * MIN;
  const inWindow = (Array.isArray(runs) ? runs : []).filter((r) => {
    const t = toMs(r?.finishedAt);
    return Number.isFinite(t) && t >= since;
  });
  const added = inWindow.reduce((acc, r) => acc + (Number(r?.added) || 0), 0);
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    runs: inWindow.length,
    runsPerDay: round2(inWindow.length / days),
    addedPerDay: round2(added / days),
  };
}

// Scheduled London fetch slots — display-only, mirrors docs/FETCH_SCHEDULE.md.
export const FETCH_SLOTS = [8, 12, 14, 18];

// ms to add to a UTC instant to reach Europe/London wall-clock at that instant.
function londonOffsetMs(date) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(
    dtf.formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]),
  );
  // '24' is emitted for midnight by some ICU builds — normalise to 0.
  const hour = p.hour === '24' ? 0 : Number(p.hour);
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}

/**
 * The next scheduled London fetch slot after `now` (display-only). DST is handled
 * by computing the London offset at `now`; the ~1×/year hour-shift between a slot
 * and the next is immaterial to the four daytime slots.
 * @param {Date|number|string} [now=new Date()]
 * @returns {{ at: Date, hour: number, label: string }}
 */
export function nextSlot(now = new Date()) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const off = londonOffsetMs(nowDate);
  const lon = new Date(nowDate.getTime() + off); // London wall-clock, read via getUTC*
  const curMin = lon.getUTCHours() * 60 + lon.getUTCMinutes();

  let hour = FETCH_SLOTS.find((h) => h * 60 > curMin);
  let addDay = 0;
  if (hour === undefined) { hour = FETCH_SLOTS[0]; addDay = 1; }

  const targetWall = Date.UTC(lon.getUTCFullYear(), lon.getUTCMonth(), lon.getUTCDate() + addDay, hour, 0, 0);
  const at = new Date(targetWall - off);
  const label = `${String(hour).padStart(2, '0')}:00`;
  return { at, hour, label };
}
