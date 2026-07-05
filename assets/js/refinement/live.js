// refinement/live.js — LIVE client-side evaluation of the refinement engine (Pillar A
// of the 2026-07-05 Trends overhaul). PURE: no DOM, no I/O, injectable clock.
//
// WHY. The scheduled server job (tools/refinement-run.mjs → refinement_suggestions) is
// the ENFORCEMENT path, but it can die silently (its secrets guard skipped every run
// 2026-06-08 → 2026-07-05 while reporting green), and its run-count persistence gate
// (PERSISTENCE_RUNS consecutive runs) stalls forever when the cadence breaks. The
// browser already loads the full reaction log on both the Trends and Listings pages,
// and the engine (engine.js) is pure — so the same statistics can run at page load.
//
// TIME-BASED PERSISTENCE. Run-count persistence approximates one question: "was this
// already true a while ago, and is it still true now?" We answer it directly: run the
// engine on the log as of NOW and again on the log truncated to `now − PERSISTENCE_DAYS`
// (with decay measured from that cutoff). A value is actionable iff it clears gates 1–4
// in BOTH snapshots. Needs no stored state and is immune to cron cadence.
//
// MERGE CONTRACT (mergeSuggestionRows). Server rows carry the user's decisions
// (confirmed_hide / confirmed_scrape / dismissed / snoozed) — those statuses ALWAYS win;
// the live row contributes fresh metrics underneath. Engine-owned server statuses
// (forming/actionable) defer to live: live metrics/tier/status replace them, and a
// server row the live data no longer supports is dropped (the pattern faded — the June
// snapshot must not outvote today's log, which is a superset of what the server saw).
// `area_radius` rows always pass through untouched (tuner-owned lane). Rows merge at
// the ROW level, before classifySuggestions, so double-showing is structurally
// impossible — one key (`dimension:value`), one row, one card.
import { resolveConfig, DIMENSIONS } from './config.js';
import { runRefinementEngine } from './engine.js';
import { isTracked, metricsOf } from './persistence.js';
import { genuineReactions } from '../listings/reaction-provenance.js';

const DAY_MS = 86_400_000;
const keyOf = (r) => `${r.dimension}:${r.value}`;

/**
 * Dismissals-map key for suppressing a LIVE-computed suggestion (no server row to
 * flip). Distinct `sug:` prefix so it can never collide with live-conflict keys or
 * `obs:` observation keys in the same learned_preferences.dismissals map.
 */
export function liveSuppressKey(dimension, value) {
  return `sug:${dimension}:${String(value ?? '').trim().toLowerCase()}`;
}

/**
 * Is a (dimension, value) suppressed by the dismissals map? Two forms:
 *   • `${dim}:${value}` — the permanent engine-dismiss memory dismissSuggestion()
 *     writes (presence = dismissed; undismiss deletes it);
 *   • `sug:${dim}:${value}` with a future `until` — a live-origin snooze/dismiss
 *     written via setConflictState (expiry re-surfaces it automatically).
 */
export function isLiveSuppressed(dismissals, dimension, value, now = new Date()) {
  if (!dismissals || typeof dismissals !== 'object') return false;
  const norm = String(value ?? '').trim().toLowerCase();
  if (dismissals[`${dimension}:${norm}`]) return true;
  const s = dismissals[liveSuppressKey(dimension, norm)];
  return !!(s && s.until && new Date(s.until) > now);
}

/**
 * Evaluate the engine live over the reaction log and emit rows in the EXACT
 * refinement_suggestions shape (+ `origin: 'live'`), so classifySuggestions/toCard
 * need zero changes downstream.
 *
 * @param {Array} reactionLog  full append-only log (sweeps are stripped here).
 * @param {object} [opts]
 * @param {Date}   [opts.now]
 * @param {object} [opts.config]      resolved config (preset-aware).
 * @param {object} [opts.dismissals]  learned_preferences.dismissals map.
 * @returns {Array|null} suggestion rows, or null when there is no genuine signal to
 *   evaluate (merge then falls back to server rows unchanged — a failed/empty log
 *   fetch must never wipe the page).
 */
export function computeLiveRows(reactionLog, { now = new Date(), config = resolveConfig(), dismissals = {} } = {}) {
  const genuine = genuineReactions(reactionLog || []);
  if (!genuine.length) return null;

  const persistenceDays = Number(config.PERSISTENCE_DAYS) || 7;
  const cutoff = new Date(now.getTime() - persistenceDays * DAY_MS);
  const resNow = runRefinementEngine(genuine, { now, config, dimensions: DIMENSIONS });
  const past = genuine.filter((r) => new Date(r.created_at) <= cutoff);
  const resPast = past.length
    ? runRefinementEngine(past, { now: cutoff, config, dimensions: DIMENSIONS })
    : { candidates: [] };
  const pastQualified = new Set(resPast.candidates.filter((c) => c.qualifies_this_run).map(keyOf));

  const nowIso = now.toISOString();
  const rows = [];
  for (const c of resNow.candidates) {
    if (!isTracked(c)) continue; // same tracking bar as the server job (persistence.js)
    if (isLiveSuppressed(dismissals, c.dimension, c.value, now)) continue;
    const persistent = c.qualifies_this_run && pastQualified.has(keyOf(c));
    rows.push({
      dimension: c.dimension,
      value: c.value,
      metrics: metricsOf(c, resNow.baseline ? resNow.baseline[c.dimension] : null),
      tier: c.tier,
      status: persistent ? 'actionable' : 'forming',
      first_detected_at: persistent ? cutoff.toISOString() : nowIso,
      last_evaluated_at: nowIso,
      runs_qualified: persistent ? 2 : (c.qualifies_this_run ? 1 : 0),
      snoozed_until: null,
      origin: 'live',
    });
  }
  return rows;
}

/** Server statuses that record a USER decision — they always survive the merge. */
export const USER_DECISION_STATUSES = new Set(['confirmed_hide', 'confirmed_scrape', 'dismissed', 'snoozed']);

/** Earlier of two ISO timestamps (either may be missing). */
function minIso(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return new Date(a) <= new Date(b) ? a : b;
}

/**
 * Merge server rows with live rows into one list (see the module-header contract).
 * `liveRows === null` (no genuine log available) returns server rows untouched.
 */
export function mergeSuggestionRows(serverRows = [], liveRows = null) {
  const server = serverRows || [];
  if (!Array.isArray(liveRows)) return server;

  const liveByKey = new Map(liveRows.map((r) => [keyOf(r), r]));
  const out = [];
  for (const s of server) {
    if (s.dimension === 'area_radius') { out.push(s); continue; } // tuner-owned lane
    const live = liveByKey.get(keyOf(s));
    if (USER_DECISION_STATUSES.has(s.status)) {
      if (live) {
        liveByKey.delete(keyOf(s));
        out.push({
          ...live,
          status: s.status,
          snoozed_until: s.snoozed_until ?? null,
          first_detected_at: minIso(s.first_detected_at, live.first_detected_at),
          origin: 'both',
        });
      } else {
        out.push(s);
      }
      continue;
    }
    // Engine-owned status (forming/actionable): live wins; unsupported rows drop.
    if (live) {
      liveByKey.delete(keyOf(s));
      out.push({
        ...live,
        first_detected_at: minIso(s.first_detected_at, live.first_detected_at),
        origin: 'both',
      });
    }
  }
  out.push(...liveByKey.values()); // live-only patterns the server has never seen
  return out;
}
