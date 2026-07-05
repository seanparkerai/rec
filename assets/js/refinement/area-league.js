// refinement/area-league.js — the AREA LEAGUE TABLE (Pillar C of the 2026-07-05 Trends
// overhaul). PURE: no DOM, no I/O, injectable clock.
//
// WHY. The household searches ~190 areas; the question the Trends page never answered
// is "which areas am I always rejecting, and what should I do about them?". This module
// distils the genuine reaction log into one ranked, per-area decision surface: judged
// counts, keep rate, an evidence-honest reject lower bound (the sort key), the top
// stated reject reason ("always too expensive"), a recent-vs-prior trend, the current
// search radius, and pause state — so every row can carry Stop-searching / Tighten /
// Bring-back actions the page already knows how to route.
import { wilsonLowerBound } from './engine.js';
import { humaniseValue } from './view.js';
import { genuineReactions } from '../listings/reaction-provenance.js';
import { REJECT_REASONS } from '../listings/reactions.js';

const DAY_MS = 86_400_000;
const REASON_LABEL = Object.fromEntries(REJECT_REASONS.map((r) => [r.key, r.label]));
const KNOWN_REASONS = new Set(REJECT_REASONS.map((r) => r.key));

/** Every stated reject-reason key on one reaction (scalar `reason` + `reasons[]`). */
function reasonKeysOf(r) {
  const keys = new Set();
  if (r.reason && KNOWN_REASONS.has(r.reason)) keys.add(r.reason);
  for (const entry of Array.isArray(r.reasons) ? r.reasons : []) {
    const k = entry && typeof entry === 'object' ? entry.key : entry;
    if (k && KNOWN_REASONS.has(k)) keys.add(k);
  }
  return [...keys];
}

const TREND_WINDOW_DAYS = 90;
const TREND_MIN_PER_WINDOW = 4;
const TREND_DELTA = 0.15;

/**
 * Build the ranked league rows.
 * @param {object} args
 * @param {Array}  args.reactionLog       full append-only log (sweeps stripped here).
 * @param {object} [args.areasMeta]       { [areaId]: { name, geofenceRadiusMi } }.
 * @param {Array}  [args.tuning]          area_search_tuning rows.
 * @param {object} [args.radiusOverrides] criteria.location.areaRadiusOverrides.
 * @param {Array}  [args.probation]       scrape_probation rows.
 * @param {Date}   [args.now]
 * @param {number} [args.minJudged]       evidence threshold for the 'some' tier.
 * @returns {Array<{ areaId, name, judged, likes, rejects, passes, keepRate, rejectLower,
 *   topReason: {key,label,pct}|null, trend: 'worsening'|'improving'|'flat'|null,
 *   radiusMi: number|null, overrideMi: number|null, paused: boolean,
 *   pausedStatus: string|null, evidence: 'strong'|'some'|'thin' }>}
 *   worst-first (reject lower bound desc, judged desc).
 */
export function buildAreaLeague({
  reactionLog, areasMeta = {}, tuning = [], radiusOverrides = {}, probation = [],
  now = new Date(), minJudged = 5,
} = {}) {
  const byArea = new Map();
  for (const r of genuineReactions(reactionLog || [])) {
    if (r.reaction !== 'like' && r.reaction !== 'reject' && r.reaction !== 'pass') continue;
    const areaId = String(r.listing_snapshot?.area_id ?? r.listing?.area_id ?? '').trim().toLowerCase();
    if (!areaId) continue;
    let e = byArea.get(areaId);
    if (!e) {
      e = { areaId, likes: 0, rejects: 0, passes: 0, reasons: new Map(), graded: [] };
      byArea.set(areaId, e);
    }
    if (r.reaction === 'pass') { e.passes += 1; continue; }
    const isReject = r.reaction === 'reject';
    if (isReject) {
      e.rejects += 1;
      for (const k of reasonKeysOf(r)) e.reasons.set(k, (e.reasons.get(k) || 0) + 1);
    } else {
      e.likes += 1;
    }
    e.graded.push({ isReject, at: new Date(r.created_at).getTime() });
  }

  const tuningByArea = new Map((tuning || []).map((t) => [String(t.area_id).toLowerCase(), t]));
  const pausedByArea = new Map((probation || [])
    .filter((p) => p.dimension === 'area')
    .map((p) => [String(p.value).trim().toLowerCase(), p]));
  const cutoff = now.getTime() - TREND_WINDOW_DAYS * DAY_MS;

  const rows = [...byArea.values()].map((e) => {
    const judged = e.likes + e.rejects;
    const keepRate = judged > 0 ? e.likes / judged : 0;
    const rejectLower = wilsonLowerBound(e.rejects, judged, { continuity: judged < 30 });

    let topReason = null;
    if (e.reasons.size) {
      const [key, count] = [...e.reasons.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      topReason = { key, label: REASON_LABEL[key] || key, pct: Math.round((count / Math.max(1, e.rejects)) * 100) };
    }

    // Trend: recent-window reject rate vs everything before it.
    const recent = e.graded.filter((g) => g.at >= cutoff);
    const prior = e.graded.filter((g) => g.at < cutoff);
    let trend = null;
    if (recent.length >= TREND_MIN_PER_WINDOW && prior.length >= TREND_MIN_PER_WINDOW) {
      const rate = (list) => list.filter((g) => g.isReject).length / list.length;
      const d = rate(recent) - rate(prior);
      trend = d > TREND_DELTA ? 'worsening' : d < -TREND_DELTA ? 'improving' : 'flat';
    }

    const t = tuningByArea.get(e.areaId);
    const radiusMi = t?.search_radius_mi != null ? Number(t.search_radius_mi)
      : (areasMeta[e.areaId]?.geofenceRadiusMi != null ? Number(areasMeta[e.areaId].geofenceRadiusMi) : null);
    const overrideRaw = radiusOverrides?.[e.areaId];
    const prob = pausedByArea.get(e.areaId) || null;

    return {
      areaId: e.areaId,
      name: areasMeta[e.areaId]?.name || humaniseValue('area', e.areaId),
      judged,
      likes: e.likes,
      rejects: e.rejects,
      passes: e.passes,
      keepRate,
      rejectLower,
      topReason,
      trend,
      radiusMi,
      overrideMi: Number.isFinite(Number(overrideRaw)) ? Number(overrideRaw) : null,
      recommendedMi: t?.recommended_radius_mi != null ? Number(t.recommended_radius_mi) : null,
      paused: !!prob,
      pausedStatus: prob?.status || null,
      evidence: judged >= 10 ? 'strong' : judged >= minJudged ? 'some' : 'thin',
    };
  });

  return rows.sort((a, b) => (b.rejectLower - a.rejectLower)
    || (b.judged - a.judged)
    || a.name.localeCompare(b.name));
}

/** One-line headline for the section ("8 areas have 10+ judgements and not one like."). */
export function leagueHeadline(rows = []) {
  const zeroLike = rows.filter((r) => r.judged >= 10 && r.likes === 0).length;
  if (zeroLike > 0) {
    return `${zeroLike} area${zeroLike === 1 ? ' has' : 's have'} 10+ judgements and not one like.`;
  }
  const judged = rows.filter((r) => r.evidence !== 'thin').length;
  if (judged > 0) return `${judged} area${judged === 1 ? '' : 's'} with enough judgements to rank.`;
  return '';
}
