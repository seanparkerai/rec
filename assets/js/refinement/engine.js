// refinement/engine.js — the pure, deterministic statistical core of the Model
// Refinement Engine (docs/archive/REFINEMENT_PLAN.md §2). Snapshot in → ranked candidate
// refinements out. NO UI, NO Supabase, NO scope mutation, NO randomness, NO clock
// reads except the `now` you pass. Stage 3 wraps this with persistence + logging.
//
// Pipeline (one pass per dimension):
//   normalise → time-decayed counts (n_eff/k_eff/p_hat/distinct) → Wilson lower
//   bound (small-n continuity-corrected) → baseline p0 + lift + one-sided
//   two-proportion test → Benjamini-Hochberg FDR → the five gates → tiers →
//   ranking → volume_artefact flag.
//
// KEY MODELLING FACT (docs/SCHEMA_NOTES.md §1): the raw reject baseline is ~98.7%,
// so lift over p0 is the BINDING gate — Wilson alone passes almost everything.

import { resolveConfig } from './config.js';

const DAY_MS = 86_400_000;

// ── small numeric helpers ──────────────────────────────────────────────────────
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Normalise a dimension value: lower(trim()). Returns null for empty/missing (§2.1). */
export function normaliseValue(raw) {
  if (raw == null) return null;
  const v = String(raw).trim().toLowerCase();
  return v === '' ? null : v;
}

/**
 * Read the dimension value for a reaction: `listing_snapshot` first, then the joined
 * `listings` row (§2.1). `dimension` is 'area' (→ area_id) or 'property_type'.
 */
export function extractValue(reaction, dimension) {
  const key = dimension === 'area' ? 'area_id' : 'property_type';
  const snap = reaction.listing_snapshot || {};
  const fallback = reaction.listing || {};
  const raw = snap[key] != null ? snap[key] : fallback[key];
  return normaliseValue(raw);
}

/** Exponential recency weight: w = 0.5 ** (age_days / HALF_LIFE_DAYS) (§2.2). */
export function decayWeight(ageDays, halfLifeDays) {
  return Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
}

/**
 * Wilson score interval lower bound at confidence implied by `z` (§2.3). With a
 * continuity correction (Newcombe 1998) when `continuity` is set — used for n < 30
 * for better small-sample coverage. Works on the decayed effective counts (k, n).
 */
export function wilsonLowerBound(k, n, { z = 1.96, continuity = false } = {}) {
  if (n <= 0) return 0;
  const p = k / n;
  const z2 = z * z;
  if (!continuity) {
    const centre = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    const denom = 1 + z2 / n;
    return clamp01((centre - margin) / denom);
  }
  // Continuity-corrected Wilson lower limit (Newcombe 1998, eq. for L).
  if (p <= 0) return 0;
  const inner = z2 - 1 / n + 4 * n * p * (1 - p) + (4 * p - 2);
  const lower = (2 * n * p + z2 - 1 - z * Math.sqrt(Math.max(0, inner))) / (2 * (n + z2));
  // CC lower bound must not exceed the point estimate, nor drop below 0.
  return clamp01(Math.min(lower, p));
}

/** Standard normal CDF via an Abramowitz-Stegun erf approximation (deterministic). */
function normalCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/**
 * One-sided two-proportion z-test p-value: is group 1 rejected *more* than group 2?
 * (§2.4 — value vs rest-of-pool, decayed counts.) Returns 1 (no evidence) on
 * degenerate inputs so a candidate never sneaks through the FDR gate by accident.
 */
export function twoProportionPValue(k1, n1, k2, n2) {
  if (n1 <= 0 || n2 <= 0) return 1;
  const p1 = k1 / n1;
  const p2 = k2 / n2;
  const pPool = (k1 + k2) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (!(se > 0)) return p1 > p2 ? 0 : 1; // no variance (pool all-reject / all-keep)
  return 1 - normalCdf((p1 - p2) / se);
}

/**
 * Benjamini-Hochberg FDR across a family of candidates (§2.5). Mutates each item's
 * `fdr_significant` flag in place. Largest rank i with p_(i) ≤ (i/m)·q passes; all
 * ranks ≤ i pass too.
 */
export function benjaminiHochberg(items, q) {
  const m = items.length;
  items.forEach((it) => { it.fdr_significant = false; });
  if (m === 0) return items;
  const order = items
    .map((it, i) => ({ i, p: it.p_value }))
    .sort((a, b) => a.p - b.p);
  let maxRank = 0;
  for (let rank = 1; rank <= m; rank++) {
    if (order[rank - 1].p <= (rank / m) * q) maxRank = rank;
  }
  for (let r = 0; r < maxRank; r++) items[order[r].i].fdr_significant = true;
  return items;
}

/** Confidence tier from the Wilson lower bound (§2.7). */
export function tierFor(wilsonLower, config) {
  if (wilsonLower >= config.TIER_STRONG) return 'strong';
  if (wilsonLower >= config.TIER_CONFIDENT) return 'confident';
  if (wilsonLower >= config.WILSON_FLOOR) return 'probable';
  if (wilsonLower >= config.FORMING_FLOOR) return 'forming';
  return 'none';
}

// ── aggregation (§2.1–2.2) ──────────────────────────────────────────────────────
function aggregateDimension(reactions, dimension, { nowMs, config }) {
  const byValue = new Map();
  let dimDecayed = 0;
  for (const r of reactions) {
    if (config.EXCLUDE_PASSES && r.reaction === 'pass') continue;
    const value = extractValue(r, dimension);
    if (!value) continue;
    const ageDays = (nowMs - new Date(r.created_at).getTime()) / DAY_MS;
    const w = decayWeight(ageDays, config.HALF_LIFE_DAYS);
    const isReject = r.reaction === 'reject';
    let e = byValue.get(value);
    if (!e) {
      e = { value, n_eff: 0, k_eff: 0, n_raw: 0, k_raw: 0, rejectedListings: new Set() };
      byValue.set(value, e);
    }
    e.n_eff += w;
    e.n_raw += 1;
    if (isReject) {
      e.k_eff += w;
      e.k_raw += 1;
      if (r.listing_id != null) e.rejectedListings.add(r.listing_id);
    }
    dimDecayed += w;
  }
  const values = [...byValue.values()].map((e) => ({
    value: e.value,
    n_eff: e.n_eff,
    k_eff: e.k_eff,
    n_raw: e.n_raw,
    k_raw: e.k_raw,
    distinct_rejected_listings: e.rejectedListings.size,
  }));
  return { dimDecayed, values };
}

/**
 * Aggregate raw reactions into the decayed per-value counts the scorer consumes
 * (§2.1–2.2). Separated from scoring so the SAME scorer can run on counts computed
 * here in JS (unit tests) OR computed in SQL against the live DB (the scheduled
 * Stage-3 job) — identical downstream math, no 3.5k-row dump needed.
 *
 * @returns {{ systemDecayed:number, perDimension: Record<string,
 *   { dimDecayed:number, values: Array<{value,n_eff,k_eff,n_raw,k_raw,distinct_rejected_listings}> }> }}
 */
export function buildAggregates(reactions = [], opts = {}) {
  const config = opts.config || resolveConfig();
  const dimensions = opts.dimensions || ['area', 'property_type'];
  const now = opts.now ? new Date(opts.now) : new Date();
  const nowMs = now.getTime();
  let systemDecayed = 0;
  for (const r of reactions) {
    if (config.EXCLUDE_PASSES && r.reaction === 'pass') continue;
    const ageDays = (nowMs - new Date(r.created_at).getTime()) / DAY_MS;
    systemDecayed += decayWeight(ageDays, config.HALF_LIFE_DAYS);
  }
  const perDimension = {};
  for (const dim of dimensions) perDimension[dim] = aggregateDimension(reactions, dim, { nowMs, config });
  return { systemDecayed, perDimension };
}

function reasonSummary(c, p0) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const rate = c.n_raw > 0 ? c.k_raw / c.n_raw : 0;
  if (c.volume_artefact) {
    return `High volume (${c.k_raw} of ${c.n_raw} rejected) but about your usual rate — not disproportionately disliked.`;
  }
  return `Rejected ${pct(rate)} of ${c.n_raw} (${c.k_raw} of ${c.n_raw}) — ${c.lift.toFixed(2)}× your ${pct(p0)} baseline reject rate.`;
}

/** Ranking comparator (§2.8): wilson_lower desc, lift desc, n_eff desc, value asc. */
function rankCmp(a, b) {
  if (b.wilson_lower !== a.wilson_lower) return b.wilson_lower - a.wilson_lower;
  if (b.lift !== a.lift) return b.lift - a.lift;
  if (b.n_eff !== a.n_eff) return b.n_eff - a.n_eff;
  return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
}

/**
 * Score pre-aggregated decayed counts into ranked candidates (§2.3–2.8). The pure
 * statistical heart — takes the output of `buildAggregates` (from JS or SQL) plus the
 * injected persistence history, and produces the full run result. No reaction rows,
 * no clock reads beyond `now`, no DB.
 *
 * @param {ReturnType<typeof buildAggregates>} aggregates
 * @param {object} [opts]
 * @param {object} [opts.config]                   resolved config (default: Cautious).
 * @param {string[]} [opts.dimensions]             default: keys of aggregates.perDimension.
 * @param {Date|string} [opts.now]                 stamp for generated_at.
 * @param {Record<string,number>} [opts.priorRunsQualified]  consecutive prior qualifying
 *   runs keyed `${dimension}:${value}` — backs the persistence gate (§2.6.5).
 * @returns {object} { config, generated_at, baseline, dimensions, candidates, actionable }
 */
export function scoreFromAggregates(aggregates, opts = {}) {
  const config = opts.config || resolveConfig();
  const now = opts.now ? new Date(opts.now) : new Date();
  const perDim = aggregates.perDimension || {};
  const dimensions = opts.dimensions || Object.keys(perDim);
  const priorRunsQualified = opts.priorRunsQualified || {};
  const globalGateOpen = (aggregates.systemDecayed || 0) >= config.GLOBAL_MIN_FEEDBACK;

  const allCandidates = [];
  const perDimension = {};

  for (const dim of dimensions) {
    const agg = perDim[dim] || { dimDecayed: 0, values: [] };
    const dimGateOpen = globalGateOpen && agg.dimDecayed >= config.DIM_MIN_FEEDBACK;

    // Baseline decayed reject rate across the whole dimension pool (§2.4).
    let Kall = 0;
    let Nall = 0;
    for (const v of agg.values) { Kall += v.k_eff; Nall += v.n_eff; }
    const p0 = Nall > 0 ? Kall / Nall : 0;

    const candidates = [];
    for (const v of agg.values) {
      const p_hat = v.n_eff > 0 ? v.k_eff / v.n_eff : 0;
      const wilson_lower = wilsonLowerBound(v.k_eff, v.n_eff, {
        z: config.WILSON_Z,
        continuity: v.n_eff < config.CONTINUITY_N_MAX,
      });
      const lift = p0 > 0 ? p_hat / p0 : 0;
      const p_value = twoProportionPValue(v.k_eff, v.n_eff, Kall - v.k_eff, Nall - v.n_eff);
      const cand = {
        dimension: dim,
        value: v.value,
        n_eff: v.n_eff,
        k_eff: v.k_eff,
        n_raw: v.n_raw,
        k_raw: v.k_raw,
        p_hat,
        wilson_lower,
        lift,
        p_value,
        distinct_rejected_listings: v.distinct_rejected_listings,
        fdr_significant: false, // set by BH below
      };
      candidates.push(cand);
      allCandidates.push(cand);
    }
    perDimension[dim] = { p0, dimDecayed: agg.dimDecayed, dimGateOpen, candidates };
  }

  // FDR across the chosen family (§2.5): per-dimension or one pooled family.
  if (config.FDR_PER_DIMENSION) {
    for (const dim of dimensions) benjaminiHochberg(perDimension[dim].candidates, config.FDR_Q);
  } else {
    benjaminiHochberg(allCandidates, config.FDR_Q);
  }

  // Gates 1–5 + tier + volume_artefact + reason (§2.6–2.8).
  for (const dim of dimensions) {
    const { dimGateOpen, p0 } = perDimension[dim];
    for (const c of perDimension[dim].candidates) {
      const gates = {
        global: dimGateOpen,
        sample: c.n_eff >= config.MIN_EFFECTIVE_SAMPLE
          && c.distinct_rejected_listings >= config.MIN_DISTINCT,
        confidence: c.wilson_lower >= config.WILSON_FLOOR,
        disproportionality: c.fdr_significant && c.lift >= config.MIN_LIFT,
      };
      const qualifiesThisRun = gates.global && gates.sample && gates.confidence && gates.disproportionality;
      const prior = priorRunsQualified[`${c.dimension}:${c.value}`] || 0;
      const runs_qualified = qualifiesThisRun ? prior + 1 : 0; // consecutive; resets on a miss
      gates.persistence = runs_qualified >= config.PERSISTENCE_RUNS;

      c.gates = gates;
      c.qualifies_this_run = qualifiesThisRun;
      c.runs_qualified = runs_qualified;
      c.actionable = qualifiesThisRun && gates.persistence;
      c.tier = tierFor(c.wilson_lower, config);
      c.volume_artefact = c.k_raw >= config.VOLUME_ARTEFACT_MIN_REJECTS
        && c.lift <= config.VOLUME_ARTEFACT_MAX_LIFT;
      c.reason = reasonSummary(c, p0);
    }
  }

  const candidates = allCandidates.slice().sort(rankCmp);
  const actionable = candidates.filter((c) => c.actionable);

  return {
    config,
    generated_at: now.toISOString(),
    system_decayed: aggregates.systemDecayed || 0,
    baseline: Object.fromEntries(dimensions.map((d) => [d, perDimension[d].p0])),
    dimensions: perDimension,
    candidates,
    actionable,
  };
}

/**
 * Run the engine over a reaction snapshot: aggregate (§2.1–2.2) then score (§2.3–2.8).
 * Thin composition of `buildAggregates` + `scoreFromAggregates`.
 *
 * @param {Array} reactions  reaction rows: { listing_id, reaction, created_at,
 *   listing_snapshot?, listing? }. `reaction` ∈ {'like','pass','reject'}.
 * @param {object} [opts]  { now?, config?, dimensions?, priorRunsQualified? } — see above.
 * @returns {object} { config, generated_at, baseline, dimensions, candidates, actionable }
 */
export function runRefinementEngine(reactions = [], opts = {}) {
  const config = opts.config || resolveConfig();
  const now = opts.now ? new Date(opts.now) : new Date();
  const dimensions = opts.dimensions || ['area', 'property_type'];
  const aggregates = buildAggregates(reactions, { dimensions, now, config });
  return scoreFromAggregates(aggregates, {
    config,
    now,
    dimensions,
    priorRunsQualified: opts.priorRunsQualified || {},
  });
}
