// refinement/scope.js — PURE scrape-scope derivation for the probation lever
// (docs/archive/REFINEMENT_PLAN.md §6 enforcement + §8 invariant). No I/O. The scraper
// (tools/fetch-listings.mjs, service role) and the invariant checker
// (tools/refinement-scope-check.mjs) both consume these helpers, so the scope maths is
// unit-tested once and reused.
//
// Golden rule: the engine proposes; ONLY a user-applied scrape_probation row (written
// from the portal, §6) removes an area from the active scrape set — never automatically.
// The active scrape set = active areas (areas.active !== false) MINUS probationed areas,
// with a periodic exploration RE-PROBE that temporarily re-includes a probationed area so
// the engine keeps learning about it (§1.2 "acquire wide, display narrow").
import { resolveConfig } from './config.js';
import { extractValue } from './engine.js';

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** Area ids the scraper would pull absent any probation (areas.active !== false). */
export function activeAreaIds(areas = []) {
  return new Set((areas || []).filter((a) => a && a.active !== false).map((a) => norm(a.id)));
}

/**
 * Area ids currently paused by probation. 'active' and 'reconsider' both pause the
 * scrape (reconsider is a UI hint, still paused); only 'restored' (a bring-back tombstone)
 * does not. Property-type probation rows are ignored — scrape scope is area-based.
 */
export function probationAreaSet(probationRows = []) {
  return new Set(
    (probationRows || [])
      .filter((p) => p && p.dimension === 'area' && p.status !== 'restored')
      .map((p) => norm(p.value)),
  );
}

/**
 * Which probationed areas to RE-PROBE this run (temporarily re-include for exploration).
 * With no `runIndex` (the default), nothing is re-probed — probation is fully enforced and
 * the scraper makes no extra writes. When the workflow supplies a monotonic run index, an
 * area is re-probed once `runIndex - last_reprobe_run >= reprobe_every_runs`.
 */
export function reprobeThisRun(probationRows = [], runIndex = null, config = resolveConfig()) {
  const out = new Set();
  if (runIndex == null) return out;
  for (const p of probationRows || []) {
    if (!p || p.dimension !== 'area' || p.status === 'restored') continue;
    const every = Number(p.reprobe_every_runs) || config.PROBATION_REPROBE_RUNS;
    const last = Number(p.last_reprobe_run) || 0;
    if (runIndex - last >= every) out.add(norm(p.value));
  }
  return out;
}

/**
 * The set of area ids to DROP from the active scrape set this run = paused minus re-probed.
 * This is the single value the scraper folds into its existing `dropAreas` prune.
 */
export function probationDropIds(probationRows = [], runIndex = null, config = resolveConfig()) {
  const drop = probationAreaSet(probationRows);
  for (const id of reprobeThisRun(probationRows, runIndex, config)) drop.delete(id);
  return drop;
}

/**
 * §8 invariant: re-derive scope correctness so it can't silently drift.
 *  • `probationedButActive` — areas the user paused that are STILL active in `areas`
 *    (i.e. would be scraped unless explicitly subtracted). The scraper MUST drop these;
 *    after correct enforcement a live check (excluding any re-probe) is empty.
 *  • `probationedNotActive` — probation rows whose area is already inactive (harmless,
 *    but flagged as stale so the user can bring it back / clean it up).
 */
/**
 * Reconsider detection (step 4.6b, plan §4.3 "Reconsider?" badge): which paused areas'
 * status HINT should flip, given the reactions since each pause began. Evidence = the
 * caller's reactions (pass GENUINE ones — the driver pre-filters bulk/admin sweeps)
 * created strictly after the row's `approved_at` whose snapshot resolves to the paused
 * area — post-pause stock only reaches the user via the exploration re-probe, so this
 * IS the re-probe reject rate. A pass counts as a non-reject trial (EXCLUDE_PASSES
 * mirror, §2.1); no decay — the post-pause window is recent by construction.
 *
 * Flips are bidirectional between the two paused statuses and nothing else:
 *   active → reconsider  when rate < RECONSIDER_RATE ("worth another look")
 *   reconsider → active  when the evidence no longer supports the hint
 * `restored` (user tombstone) and property_type rows are never touched, and no flip
 * happens below RECONSIDER_MIN_REACTIONS trials. NOTIFY-ONLY: both statuses keep the
 * area paused (see probationAreaSet) — only the user changes scrape scope.
 *
 * @returns {Array<{value:string, from:string, to:string, rate:number, n:number}>} sorted by value.
 */
export function reconsiderUpdates(probationRows = [], reactions = [], config = resolveConfig()) {
  const out = [];
  for (const p of probationRows || []) {
    if (!p || p.dimension !== 'area') continue;
    if (p.status !== 'active' && p.status !== 'reconsider') continue;
    const value = norm(p.value);
    const approved = new Date(p.approved_at || 0).getTime();
    let n = 0;
    let k = 0;
    for (const r of reactions || []) {
      if (!r || (r.reaction !== 'like' && r.reaction !== 'pass' && r.reaction !== 'reject')) continue;
      if (config.EXCLUDE_PASSES && r.reaction === 'pass') continue;
      const t = new Date(r.created_at || NaN).getTime();
      if (!Number.isFinite(t) || t <= approved) continue;
      if (extractValue(r, 'area') !== value) continue;
      n += 1;
      if (r.reaction === 'reject') k += 1;
    }
    if (n < config.RECONSIDER_MIN_REACTIONS) continue;
    const rate = k / n;
    const to = rate < config.RECONSIDER_RATE ? 'reconsider' : 'active';
    if (to !== p.status) out.push({ value, from: p.status, to, rate, n });
  }
  return out.sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

export function scopeInvariant(areas = [], probationRows = []) {
  const active = activeAreaIds(areas);
  const paused = probationAreaSet(probationRows);
  return {
    probationedButActive: [...paused].filter((id) => active.has(id)).sort(),
    probationedNotActive: [...paused].filter((id) => !active.has(id)).sort(),
  };
}
