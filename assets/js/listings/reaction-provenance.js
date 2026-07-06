// listings/reaction-provenance.js — pure classification of reaction PROVENANCE:
// was a reaction a genuine, one-at-a-time judgement, or part of an en-masse sweep?
// No network, no DB, no DOM — imports cleanly in the browser and Node, and is
// unit-tested in tests/reaction-provenance.test.js.
//
// WHY THIS EXISTS. ~85% of the household's append-only reaction log is bulk area /
// price sweeps + administrative area removals, all rejected at ~100%. Counting those
// as genuine preference signal:
//   (a) inflates the Refinement engine's baseline reject rate to ~98.6%, so EVERY
//       area and type shows ~99–100% reject with a "lift" of ≈1.0 — including the
//       user's FAVOURITE types (a detached home, rejected mostly because its AREA was
//       swept, looked "99% rejected, strong pattern"); and
//   (b) makes the "how many homes have I reviewed?" count meaningless (3.6k vs ~360).
//
// Provenance separates the genuine, one-at-a-time signal from the sweeps. Since
// ADR 0009 the log carries a durable `source` column, self-declared by every writer
// ('manual'/'bulk'/'admin'/'import') and heuristic-backfilled once over the historical
// rows; classifyProvenance() prefers that durable value and falls back to the read-time
// heuristic (created_at bursts + the removed_area tag) for rows without one (old
// localStorage caches, fixtures). Two consumers:
//   • genuineReactions()   → the Refinement findings filter (so baseline/lift are real);
//   • provenanceSummary()  → the portal's honest "your reactions" engagement display.
//
// NOTE: this is deliberately NOT used by the learned-preference WEIGHTS engine. There,
// reason-attributed bulk rejects (too_expensive → price, wrong_area → area) carry
// correct, attributable signal and are kept; only unattributed rejects are dropped
// (see learned-preferences/weights.js + reactions.js isUnattributedReject).

import { isNonTrainingReaction } from './reactions.js';

/**
 * Cadence threshold: a graded (like/reject) reaction sharing its minute with this many
 * or more graded reactions is treated as part of an en-masse sweep ("bulk"). A careful,
 * one-at-a-time review never approaches this rate (≥6/min ≈ one every 10s). Tunable;
 * mirrored by the SQL used to regenerate findings (see docs/REFINEMENT_README.md).
 */
export const REACTION_CADENCE = { BULK_PER_MIN: 6 };

const GRADED = new Set(['like', 'reject']);

/**
 * Durable `source` (ADR 0009) → provenance class. 'import' is en-masse re-ingested
 * data, not a one-at-a-time judgement, so it classes as 'bulk'. Unknown/absent
 * values fall through to the read-time heuristic.
 */
const SOURCE_TO_PROVENANCE = { manual: 'individual', bulk: 'bulk', admin: 'admin', import: 'bulk' };

/** Minute-bucket key for a timestamp (UTC, truncated to the minute). 'na' if undated. */
function minuteKey(created_at) {
  const t = new Date(created_at).getTime();
  return Number.isFinite(t) ? String(Math.floor(t / 60_000)) : 'na';
}

/** The three provenance classes a reaction can carry. */
export const PROVENANCE = ['individual', 'bulk', 'admin'];

/**
 * Per-reaction provenance for an append-only reaction log. Returns a NEW array of
 * { ...row, provenance } where provenance is one of:
 *   • 'admin'      — administrative (removed_area): a wholesale "ignore this area".
 *   • 'bulk'       — part of an en-masse minute-burst (≥ BULK_PER_MIN graded that minute).
 *   • 'individual' — a genuine, one-at-a-time judgement.
 *
 * Rules: a durable `source` (ADR 0009) wins verbatim when recognised. On the
 * heuristic path: a `like` is ALWAYS individual — you never bulk-like (verified in
 * the data, every reasoned like was entered alone). Only a `reject` can be 'bulk'.
 * A `pass` (non-graded soft skip) is 'individual'. Admin wins over bulk.
 *
 * @param {Array} log   reaction rows { reaction, reason?, reasons?, created_at, source? }
 * @param {object} [opts] { bulkPerMin }
 */
export function classifyProvenance(log, opts = {}) {
  const bulkPerMin = opts.bulkPerMin ?? REACTION_CADENCE.BULK_PER_MIN;
  const rows = Array.isArray(log) ? log : [];
  // Count graded reactions per minute bucket — the burst signal (heuristic fallback).
  const perMinute = new Map();
  for (const r of rows) {
    if (!r || !GRADED.has(r.reaction)) continue;
    const k = minuteKey(r.created_at);
    perMinute.set(k, (perMinute.get(k) || 0) + 1);
  }
  return rows.map((r) => {
    const durable = r ? SOURCE_TO_PROVENANCE[r.source] : undefined;
    if (durable) return { ...r, provenance: durable };
    let provenance = 'individual';
    if (isNonTrainingReaction(r)) provenance = 'admin';
    else if (r && r.reaction === 'reject'
      && (perMinute.get(minuteKey(r.created_at)) || 0) >= bulkPerMin) provenance = 'bulk';
    return { ...r, provenance };
  });
}

/**
 * The genuine, individual reaction signal: drop administrative (removed_area) and
 * en-masse bulk-burst reactions; keep one-at-a-time judgements (every like + every
 * individual reject + passes). This is what the Refinement engine should aggregate so
 * its baseline and lift reflect real preferences, not sweeps.
 * @param {Array} log
 * @param {object} [opts] { bulkPerMin }
 * @returns {Array} the filtered log (provenance stripped back to the original shape)
 */
export function genuineReactions(log, opts = {}) {
  return classifyProvenance(log, opts)
    .filter((r) => r.provenance === 'individual')
    .map(({ provenance, ...row }) => row); // eslint-disable-line no-unused-vars
}

/**
 * Honest engagement summary for the portal's "your reactions" panel. Counts how much of
 * the append-only log is genuine individual judgement vs en-masse sweep vs admin removal.
 * `individual.total` is the truthful "homes personally reviewed" headline; `genuineGraded`
 * (likes + individual rejects) is the count that actually shapes the findings.
 *
 * @param {Array} log
 * @param {object} [opts] { bulkPerMin }
 * @returns {{ total:number, individual:{total,likes,rejects,passes}, bulk:number,
 *             admin:number, genuineGraded:number }}
 */
export function provenanceSummary(log, opts = {}) {
  const rows = classifyProvenance(log, opts);
  const s = { total: rows.length, individual: { total: 0, likes: 0, rejects: 0, passes: 0 }, bulk: 0, admin: 0 };
  for (const r of rows) {
    if (r.provenance === 'admin') { s.admin += 1; continue; }
    if (r.provenance === 'bulk') { s.bulk += 1; continue; }
    s.individual.total += 1;
    if (r.reaction === 'like') s.individual.likes += 1;
    else if (r.reaction === 'reject') s.individual.rejects += 1;
    else s.individual.passes += 1;
  }
  s.genuineGraded = s.individual.likes + s.individual.rejects;
  return s;
}
