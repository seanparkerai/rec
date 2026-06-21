// refinement/radius.js — the pure, deterministic per-area search-radius learner.
// Distance-of-liked-homes in → recommended per-area radius (+ tighten/widen advice) out.
// NO UI, NO Supabase, NO clock reads except the `now` you pass, NO randomness.
//
// WHY THIS EXISTS. Every area is scraped + geofenced with the SAME ~3mi radius, but the
// accept/reject data shows the optimal radius varies ~9× per area: tight suburban cores
// see likes only within ~0.3–0.5mi while rural areas see them out to ~2.6mi. A single
// radius therefore over-scrapes suburban areas (paid noise + reject fatigue) and (if it
// were tightened globally) would starve rural ones. This learner sets a per-area radius
// from each area's own liked-home distances.
//
// THE MODEL (per area, per household, time-decayed by HALF_LIFE_DAYS):
//   recommended = clamp(weightedQuantile(like_distances, QUANTILE) + MARGIN_MI,
//                       FLOOR_MI, CEIL_MI)
//   gated on Σ decayed like-weight ≥ MIN_LIKES (else null → the fetcher keeps the
//   default). The AREA-GLOBAL applied value is the MAX across households (a union,
//   mirroring priceBandForAreas, so a tight household never starves a wider one). A
//   per-household SUGGESTION is raised when |recommended − current| ≥ MIN_CHANGE_MI.
//
// Distances + area come from the reaction's `listing_snapshot` (distance_mi + area_id) —
// the same source the Refinement engine reads. Likes without a stored distance_mi simply
// don't contribute (no phantom sample). Stage-2 driver (tools/radius-tune.mjs) wraps this
// with persistence; tools/fetch-listings.mjs reads the applied radius live.

import { decayWeight } from './engine.js';
import { resolveConfig } from './config.js';

const DAY_MS = 86_400_000;

/**
 * Weighted quantile of `{ value, weight }` samples (recency-weighted distances). Sorts
 * by value ascending and returns the smallest value whose cumulative weight reaches
 * `q · totalWeight`. Returns null when there is no positive-weight, finite sample.
 */
export function weightedQuantile(samples, q) {
  const pts = (samples || [])
    .filter((s) => Number.isFinite(s.value) && s.weight > 0)
    .sort((a, b) => a.value - b.value);
  if (!pts.length) return null;
  const total = pts.reduce((s, p) => s + p.weight, 0);
  if (!(total > 0)) return null;
  const target = q * total;
  let cum = 0;
  for (const p of pts) {
    cum += p.weight;
    if (cum >= target) return p.value;
  }
  return pts[pts.length - 1].value;
}

const clampMi = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round2 = (x) => (Number.isFinite(x) ? Number(x.toFixed(2)) : x);

/** Read distance_mi (a finite, non-negative number) from a reaction's snapshot. */
function distanceOf(reaction) {
  const snap = reaction.listing_snapshot || {};
  const d = snap.distance_mi != null ? Number(snap.distance_mi) : NaN;
  return Number.isFinite(d) && d >= 0 ? d : null;
}

/** Read the area id from a reaction's snapshot. */
function areaOf(reaction) {
  const snap = reaction.listing_snapshot || {};
  return snap.area_id != null && snap.area_id !== '' ? String(snap.area_id) : null;
}

/** Read a reaction's bearing (deg from the town centre), normalised to [0,360). */
function bearingOf(reaction) {
  const b = reaction.bearing != null ? Number(reaction.bearing) : NaN;
  return Number.isFinite(b) ? ((b % 360) + 360) % 360 : null;
}

/** Compass sector index (0..n-1) for a bearing; sector 0 centred on North. */
function sectorOf(bearing, n) {
  if (bearing == null) return null;
  return Math.round((bearing % 360) / (360 / n)) % n;
}

/**
 * Per-sector ("petal") radii around a town, given pooled (cross-household) sector samples
 * and the area's scalar radius R. Each sector defaults to R (rural-safe — a direction is
 * never cut without its own evidence). A sector with its own likes is fit to them (q90 +
 * margin, can reach toward rural up to the cap or pull in if close); a like-less sector
 * with a real reject cluster is pulled in to its rejects' keep-quantile (cut the far urban
 * tail). All clamped to [floor, cap].
 */
function computePetals(sectors, R, config) {
  const n = config.RADIUS_SECTORS;
  const out = new Array(n).fill(R);
  for (let s = 0; s < n; s++) {
    const likes = sectors.likes[s];
    const rejects = sectors.rejects[s];
    const likeW = likes.reduce((a, p) => a + p.weight, 0);
    if (likeW >= config.RADIUS_SECTOR_MIN_LIKES) {
      const q = weightedQuantile(likes, config.RADIUS_QUANTILE);
      if (q != null) out[s] = round2(clampMi(q + config.RADIUS_MARGIN_MI, config.RADIUS_FLOOR_MI, config.RADIUS_CEIL_MI));
      continue;
    }
    const rejectW = rejects.reduce((a, p) => a + p.weight, 0);
    if (rejectW >= config.RADIUS_SECTOR_MIN_REJECTS) {
      const keep = weightedQuantile(rejects, config.RADIUS_SECTOR_REJECT_KEEP_QUANTILE);
      if (keep != null) out[s] = round2(clampMi(Math.min(R, keep), config.RADIUS_FLOOR_MI, config.RADIUS_CEIL_MI));
    }
  }
  return out;
}

/** Direction of a recommended radius vs the current one (eps guards float noise). */
function directionOf(recommendedMi, currentMi) {
  if (recommendedMi == null) return 'hold';
  const eps = 1e-6;
  if (recommendedMi < currentMi - eps) return 'tighten';
  if (recommendedMi > currentMi + eps) return 'widen';
  return 'hold';
}

/** One-line, user-facing rationale for a radius suggestion. */
function reasonFor({ direction, currentMi, recommendedMi, likeCount, distantRejectWaste }) {
  const verb = direction === 'tighten' ? 'Tighten' : direction === 'widen' ? 'Widen' : 'Keep';
  const likes = `${Math.round(likeCount)} liked home${Math.round(likeCount) === 1 ? '' : 's'}`;
  let s = `${verb} the search from ${round2(currentMi)}mi to ${round2(recommendedMi)}mi — `
    + `your ${likes} here cluster within ${round2(recommendedMi)}mi`;
  if (distantRejectWaste > 0.05) {
    s += `, and ${Math.round(distantRejectWaste * 100)}% of rejects here sit beyond it`;
  }
  return `${s}.`;
}

/**
 * Learn per-area radii from a cross-household reaction log.
 *
 * @param {Array} reactions  rows { household_id, reaction, created_at, listing_snapshot:{ area_id, distance_mi } }.
 *   Pre-filter to GENUINE individual reactions upstream (the driver does, like refinement-run).
 * @param {object} [opts]
 * @param {object} [opts.config]      resolved config (default: Cautious + the RADIUS_* block).
 * @param {Date|string} [opts.now]    stamp for generated_at + decay.
 * @param {Record<string,number>} [opts.currentRadii]  current applied radius per area_id
 *   (e.g. from existing tuning rows); falls back to config.DEFAULT_RADIUS_MI.
 * @returns {{ generatedAt:string, config:object,
 *   areas: Array<{ areaId, recommendedMi, appliedMi, currentMi, sampleSize, likeCount,
 *     confidence, method, direction, distantRejectWaste, contributingHouseholds }>,
 *   suggestions: Array<{ householdId, areaId, recommendedMi, currentMi, direction,
 *     likeCount, sampleSize, distantRejectWaste, reason }> }}
 */
export function learnRadii(reactions = [], opts = {}) {
  const config = opts.config || resolveConfig();
  const now = opts.now ? new Date(opts.now) : new Date();
  const nowMs = now.getTime();
  const currentRadii = opts.currentRadii || {};
  const halfLife = config.HALF_LIFE_DAYS;
  const method = `like-quantile-${config.RADIUS_QUANTILE}+${config.RADIUS_MARGIN_MI}mi`;

  // Group reactions: area → household → { likeSamples, likeWeight, rejectWeight,
  // rejectDistances } (decayed). Only distance-bearing reactions contribute distances.
  // In parallel, pool per-sector like/reject distances across households per area (the
  // directional "petals") — only reactions that carry a bearing contribute here.
  const nSectors = config.RADIUS_SECTORS;
  const byArea = new Map();
  const sectorByArea = new Map();
  const blankSectors = () => ({
    likes: Array.from({ length: nSectors }, () => []),
    rejects: Array.from({ length: nSectors }, () => []),
  });
  for (const r of reactions) {
    const areaId = areaOf(r);
    if (!areaId) continue;
    const ageDays = (nowMs - new Date(r.created_at).getTime()) / DAY_MS;
    const w = decayWeight(ageDays, halfLife);
    const hh = r.household_id != null ? String(r.household_id) : '_';
    const dist = distanceOf(r);
    let area = byArea.get(areaId);
    if (!area) { area = new Map(); byArea.set(areaId, area); }
    let e = area.get(hh);
    if (!e) {
      e = { likeSamples: [], likeWeight: 0, rejectWeight: 0, rejectWeightWithDist: 0, rejectDistances: [], sampleWeight: 0 };
      area.set(hh, e);
    }
    e.sampleWeight += w;
    const sector = dist != null ? sectorOf(bearingOf(r), nSectors) : null;
    let sec = sectorByArea.get(areaId);
    if (!sec) { sec = blankSectors(); sectorByArea.set(areaId, sec); }
    if (r.reaction === 'like') {
      e.likeWeight += w;
      if (dist != null) {
        e.likeSamples.push({ value: dist, weight: w });
        if (sector != null) sec.likes[sector].push({ value: dist, weight: w });
      }
    } else if (r.reaction === 'reject') {
      e.rejectWeight += w;
      if (dist != null) {
        e.rejectWeightWithDist += w;
        e.rejectDistances.push({ value: dist, weight: w });
        if (sector != null) sec.rejects[sector].push({ value: dist, weight: w });
      }
    }
  }

  const areas = [];
  const suggestions = [];

  for (const [areaId, households] of byArea) {
    const currentMi = currentRadii[areaId] != null ? Number(currentRadii[areaId]) : config.DEFAULT_RADIUS_MI;

    // Per-household recommendation (own reactions only) → suggestions + the union.
    let unionRec = null;
    let contributing = 0;
    let areaSampleWeight = 0;
    let areaLikeWeight = 0;
    let areaRejectWithDist = 0;
    const areaRejectDistances = [];

    for (const [hh, e] of households) {
      areaSampleWeight += e.sampleWeight;
      areaLikeWeight += e.likeWeight;
      areaRejectWithDist += e.rejectWeightWithDist;
      for (const d of e.rejectDistances) areaRejectDistances.push(d);

      // Gate: need enough decayed, distance-bearing likes for this household.
      const hhLikeDistWeight = e.likeSamples.reduce((s, p) => s + p.weight, 0);
      if (hhLikeDistWeight < config.RADIUS_MIN_LIKES) continue;
      const q = weightedQuantile(e.likeSamples, config.RADIUS_QUANTILE);
      if (q == null) continue;
      const hhRec = round2(clampMi(q + config.RADIUS_MARGIN_MI, config.RADIUS_FLOOR_MI, config.RADIUS_CEIL_MI));
      contributing += 1;
      if (unionRec == null || hhRec > unionRec) unionRec = hhRec;

      // Per-household distant-reject waste (share of this hh's distance-bearing rejects
      // sitting beyond its own recommendation) — the rationale for tightening.
      const beyond = e.rejectDistances.reduce((s, p) => s + (p.value > hhRec ? p.weight : 0), 0);
      const hhWaste = e.rejectWeightWithDist > 0 ? beyond / e.rejectWeightWithDist : 0;
      const hhDir = directionOf(hhRec, currentMi);
      if (hhDir !== 'hold' && Math.abs(hhRec - currentMi) >= config.RADIUS_MIN_CHANGE_MI) {
        suggestions.push({
          householdId: hh,
          areaId,
          recommendedMi: hhRec,
          currentMi: round2(currentMi),
          direction: hhDir,
          likeCount: round2(hhLikeDistWeight),
          sampleSize: round2(e.sampleWeight),
          distantRejectWaste: round2(hhWaste),
          method,
          reason: reasonFor({ direction: hhDir, currentMi, recommendedMi: hhRec, likeCount: hhLikeDistWeight, distantRejectWaste: hhWaste }),
        });
      }
    }

    if (unionRec == null) continue; // no household cleared the gate → keep the default, no row

    const beyondUnion = areaRejectDistances.reduce((s, p) => s + (p.value > unionRec ? p.weight : 0), 0);
    const distantRejectWaste = areaRejectWithDist > 0 ? round2(beyondUnion / areaRejectWithDist) : 0;

    // Directional petals around the scalar radius R (=unionRec). With no bearing data the
    // sectors are empty → every petal = R → searchMi = R (identical to the symmetric model).
    const petals = computePetals(sectorByArea.get(areaId) || blankSectors(), unionRec, config);
    const searchMi = round2(Math.max(...petals));
    const directional = petals.some((p) => p !== unionRec);

    areas.push({
      areaId,
      recommendedMi: unionRec,
      appliedMi: unionRec, // override (if any) is applied by the persistence layer
      searchMi,                 // the Rightmove disk = widest petal (covers every sector), ≤ cap
      geofenceRadiiMi: petals,  // per-sector keep radius (the directional "petals")
      directional,              // true once any sector differs from the scalar radius
      currentMi: round2(currentMi),
      sampleSize: round2(areaSampleWeight),
      likeCount: round2(areaLikeWeight),
      confidence: 'high', // a row is only emitted once the like gate is cleared
      method,
      direction: directionOf(unionRec, currentMi),
      distantRejectWaste,
      contributingHouseholds: contributing,
    });
  }

  // Deterministic ordering (stable SQL plans + readable logs).
  areas.sort((a, b) => (a.areaId < b.areaId ? -1 : a.areaId > b.areaId ? 1 : 0));
  suggestions.sort((a, b) => (a.areaId < b.areaId ? -1 : a.areaId > b.areaId ? 1
    : a.householdId < b.householdId ? -1 : a.householdId > b.householdId ? 1 : 0));

  return { generatedAt: now.toISOString(), config, areas, suggestions };
}
