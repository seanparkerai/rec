// refinement/type-priority.js — the property-type FEED-ORDER primitive (Pillar B of the
// 2026-07-05 Trends overhaul). PURE: no DOM, no I/O, injectable clock.
//
// WHAT. The user's genuine keep-rates differ ~70× across property types (Cottage ~70%
// liked vs Terraced ~1%), but the feed had no way to express "detached first, then
// semi-detached, then bungalows". This module learns a ranked type order from the
// genuine reaction log and grades a fit-score contribution from a saved order, so the
// default 'fit' sort actually leads with the types the user keeps.
//
// WHERE IT LIVES. The learned order is presented on the Trends page ("Your feed order")
// and — only after the user taps Apply (golden rule: engine proposes, user confirms) —
// persisted as `criteria.propertyTypePrefs.priority` (ordered string[], normalised) +
// `prioritySource: 'learned'|'manual'` + `priorityAt`. Absent/empty priority ⇒
// listings/fit.js behaves exactly as before (legacy 3-tier preferred/acceptable);
// `excluded` always wins regardless.
//
// RANKING STAT. Types are ranked by the WILSON LOWER BOUND of their keep rate
// (likes / graded), not the raw rate — so Cottage at 7/10 (lower bound ≈ 0.39) outranks
// a type at 2/200 even though both are "small" samples, and thin evidence can't jump
// the queue on one lucky like. Types with fewer than `minJudged` graded judgements are
// appended after the evidenced ones, flagged `thin`.
import { wilsonLowerBound } from './engine.js';
import { genuineReactions } from '../listings/reaction-provenance.js';

const normType = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Learn the ranked type order from the reaction log.
 * @param {Array} reactionLog  full append-only log (sweeps stripped here).
 * @param {{ minJudged?: number, z?: number }} [opts]
 * @returns {Array<{ type: string, label: string, likes: number, rejects: number,
 *   judged: number, keepRate: number, keepLower: number, thin: boolean }>}
 *   sorted best-first (Wilson keep-lower desc; thin entries appended, same ordering).
 */
export function computeTypePriority(reactionLog, { minJudged = 5, z = 1.96 } = {}) {
  const byType = new Map();
  for (const r of genuineReactions(reactionLog || [])) {
    if (r.reaction !== 'like' && r.reaction !== 'reject') continue; // passes don't grade
    const raw = r.listing_snapshot?.property_type ?? r.listing?.property_type;
    const type = normType(raw);
    if (!type) continue;
    let e = byType.get(type);
    if (!e) { e = { type, label: String(raw).trim(), likes: 0, rejects: 0 }; byType.set(type, e); }
    if (r.reaction === 'like') e.likes += 1; else e.rejects += 1;
  }
  const rows = [...byType.values()].map((e) => {
    const judged = e.likes + e.rejects;
    return {
      ...e,
      judged,
      keepRate: judged > 0 ? e.likes / judged : 0,
      keepLower: wilsonLowerBound(e.likes, judged, { z, continuity: judged < 30 }),
      thin: judged < minJudged,
    };
  });
  const cmp = (a, b) => (b.keepLower - a.keepLower)
    || (b.keepRate - a.keepRate)
    || (b.judged - a.judged)
    || a.type.localeCompare(b.type);
  return [...rows.filter((r) => !r.thin).sort(cmp), ...rows.filter((r) => r.thin).sort(cmp)];
}

/** 0-based rank of a type in a saved priority order, or null when unranked. */
export function priorityRank(priority, type) {
  if (!Array.isArray(priority) || !priority.length) return null;
  const t = normType(type);
  if (!t) return null;
  const i = priority.findIndex((p) => normType(p) === t);
  return i >= 0 ? i : null;
}

/**
 * Graded fit-score contribution for a rank in an order of `length` types:
 * linear from +maxWeight at rank 0 to −maxWeight at the last rank; 0 for an
 * unranked type (null rank) or a degenerate single-entry order.
 */
export function typePriorityDelta(rank, length, maxWeight) {
  const w = Number(maxWeight) || 0;
  if (rank == null || !Number.isFinite(Number(rank)) || length < 2 || !w) return 0;
  const t = Math.min(Math.max(Number(rank), 0), length - 1) / (length - 1); // 0 → 1
  return w * (1 - 2 * t);
}

/** Do two type orders differ (after normalisation)? Drives the Apply-button state. */
export function ordersDiffer(a, b) {
  const na = (Array.isArray(a) ? a : []).map(normType);
  const nb = (Array.isArray(b) ? b : []).map(normType);
  if (na.length !== nb.length) return true;
  return na.some((v, i) => v !== nb[i]);
}
