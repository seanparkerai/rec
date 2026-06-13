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
export function scopeInvariant(areas = [], probationRows = []) {
  const active = activeAreaIds(areas);
  const paused = probationAreaSet(probationRows);
  return {
    probationedButActive: [...paused].filter((id) => active.has(id)).sort(),
    probationedNotActive: [...paused].filter((id) => !active.has(id)).sort(),
  };
}
