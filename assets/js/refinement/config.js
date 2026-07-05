// refinement/config.js — single source of truth for the Model Refinement Engine's
// tunable numbers (docs/archive/REFINEMENT_PLAN.md §5). The engine (./engine.js) is pure and
// reads everything from a resolved config object; nothing is hard-coded downstream.
//
// Two classes of constant:
//   • PRESET levers — the four numbers the Cautious/Balanced/Aggressive buttons change
//     (plan §4.6 + §5 preset matrix). Shipped default = Cautious (Luke's choice).
//   • FIXED — the same across presets, plus the engine internals that operationalise
//     the §2 spec (Wilson z, small-n continuity threshold, tier boundaries, FDR family
//     mode, and the "volume artefact" thresholds).
//
// If you change a number here, reconcile docs/archive/REFINEMENT_PLAN.md §5 in the same commit.

/** The four preset-controlled levers (plan §5 preset matrix).
 *
 * MIN_LIFT calibration note (2026-06-19): lift is `p_hat / baseline`, and the genuine-only
 * baseline reject rate sits ~0.82, which caps the *maximum achievable* lift at `1/0.82 ≈ 1.22`.
 * The original Cautious/Balanced floors (1.6 / 1.3) were tuned for the ~98.7% RAW baseline and
 * are unreachable against the genuine baseline — so no suggestion could ever become actionable.
 * Floors are rebased to that real headroom: Cautious stays the strict, near-silent floor (only
 * near-100%-reject signals clear it); Balanced is the recommended working setting; Aggressive is
 * the loosest. Wilson/FDR/MIN_DISTINCT (unchanged) still do the heavy lifting, so this surfaces
 * only a handful of genuinely disproportionate values, not a flood. Reconcile with
 * docs/archive/REFINEMENT_PLAN.md §5 + docs/REFINEMENT_README.md on any change here.
 */
export const PRESETS = {
  cautious:   { WILSON_FLOOR: 0.88, MIN_LIFT: 1.20, PERSISTENCE_RUNS: 5, PERSISTENCE_DAYS: 14, FDR_Q: 0.05 },
  balanced:   { WILSON_FLOOR: 0.80, MIN_LIFT: 1.10, PERSISTENCE_RUNS: 3, PERSISTENCE_DAYS: 7,  FDR_Q: 0.10 },
  aggressive: { WILSON_FLOOR: 0.72, MIN_LIFT: 1.05, PERSISTENCE_RUNS: 2, PERSISTENCE_DAYS: 3,  FDR_Q: 0.15 },
};

/**
 * Shipped default preset (owner decision 2026-07-05 — Balanced). Cautious was the
 * original default, but against the measured genuine baseline (reject rate ≈ 0.88,
 * capping achievable lift at ≈ 1/0.88 ≈ 1.14 < its MIN_LIFT 1.20) it could never
 * produce an actionable suggestion — every real run logged actionable_count = 0.
 */
export const DEFAULT_PRESET = 'balanced';

/**
 * Dimensions the engine scores (2026-06-19 expansion). `area` + `property_type` are the
 * original two; the rest broaden coverage of reaction trends to the same buckets the
 * learned-preferences layer uses (learned-preferences/signals.js), so labels agree.
 */
export const DIMENSIONS = ['area', 'property_type', 'price_band', 'beds', 'outdoor', 'parking', 'outcode'];

/**
 * Only these dimensions can drive a *scrape* change ("stop searching"): the fetcher
 * searches by area/postcode, so you can't "stop scraping 3-bed homes". Every other
 * dimension is display-hide / observation only. Mirrors the scrape_probation CHECK.
 */
export const SCRAPE_ELIGIBLE_DIMENSIONS = ['area', 'property_type'];

/** Whether a dimension can be put on scrape probation (vs display-hide only). */
export function isScrapeEligible(dimension) {
  return SCRAPE_ELIGIBLE_DIMENSIONS.includes(dimension);
}

/** Constants identical across presets (plan §5 "Fixed constants" + engine internals). */
export const FIXED = {
  // ── plan §5 fixed constants ────────────────────────────────────────────────
  HALF_LIFE_DAYS: 150,        // recency decay half-life (§2.2)
  GLOBAL_MIN_FEEDBACK: 300,   // no suggestions until this many decayed reactions system-wide (gate 1)
  DIM_MIN_FEEDBACK: 150,      // per-dimension (area / type) minimum decayed reactions (gate 1)
  MIN_EFFECTIVE_SAMPLE: 12,   // min n_eff for a single value to be eligible (gate 2)
  MIN_DISTINCT: 6,            // min distinct rejected listings (anti-skew, gate 2)
  FORMING_FLOOR: 0.65,        // below this Wilson lower bound, not even "forming" (§2.7)
  MAX_INBOX: 5,               // max suggestions shown at once (UI, plan §4.1)
  PROBATION_REPROBE_RUNS: 6,  // re-probe a removed value every N scraper runs (Stage 6)
  RECONSIDER_RATE: 0.60,      // probation re-probe reject rate below this → "Reconsider?" (Stage 6)
  RECONSIDER_MIN_REACTIONS: 5, // ≥ this many post-probation trials before the hint may flip
                               // (step 4.6b — one lucky like must not headline "worth another look")
  EXCLUDE_PASSES: false,      // confirmed: `pass` counts as a non-reject trial (§2.1)

  // ── engine internals (operationalise the §2 spec; not user-facing) ──────────
  WILSON_Z: 1.96,             // z for the 95% Wilson lower bound (§2.3)
  CONTINUITY_N_MAX: 30,       // apply small-n continuity correction below this n_eff (§2.3)
  TIER_CONFIDENT: 0.90,       // tier boundary: Probable → Confident (§2.7)
  TIER_STRONG: 0.95,          // tier boundary: Confident → Strong (§2.7)
  FDR_PER_DIMENSION: true,    // BH family = per dimension vs one pooled family (§2.5 switch)
  VOLUME_ARTEFACT_MAX_LIFT: 1.0,   // a value is an artefact only when lift ≤ this (§2.8)
  VOLUME_ARTEFACT_MIN_REJECTS: 30, // …and its raw reject count is "high" (≥ this) (§2.8)

  // ── per-dimension gate overrides (2026-07-05 recalibration) ─────────────────────
  // The flat gates are calibrated for the type dimension, where every reaction lands in
  // one of ~12 buckets. The AREA dimension spreads the same reactions across ~190
  // buckets, so per-area genuine volume is structurally small: an all-reject area's
  // continuity-corrected Wilson lower bound is ≈ 0.66 at n_eff=10 and only reaches
  // ≈ 0.72 at n_eff=13 — the flat 0.80/0.88 floors mathematically require ~20–30
  // judgements per area, which a 190-area rotation never accrues. A 0.65 floor lets a
  // consistently-rejected area surface from ~10 decayed judgements while FDR + lift +
  // persistence still guard against noise. Any key here shadows the flat constant for
  // that dimension only (engine.js `dimConfig`).
  DIM_GATES: {
    area: { MIN_EFFECTIVE_SAMPLE: 8, MIN_DISTINCT: 5, WILSON_FLOOR: 0.65 },
  },

  // ── per-area learned search radius (radius.js; docs/REFINEMENT_README.md "Radius") ──
  // The radius learner reads the time-decayed distance_mi of LIKED homes per area and
  // recommends radius = clamp(weightedQuantile(like_distances, QUANTILE) + MARGIN_MI,
  // FLOOR_MI, CEIL_MI), gated on ≥ MIN_LIKES decayed likes. CEIL_MI doubles as the
  // exploration-ring radius. Reconcile docs/REFINEMENT_README.md on any change here.
  DEFAULT_RADIUS_MI: 3,         // the current uniform search/geofence radius (fallback "current")
  RADIUS_FLOOR_MI: 0.5,         // never tighten below this (tiny suburban cores)
  RADIUS_CEIL_MI: 3.0,          // never widen past this; also the exploration-ring radius
  RADIUS_QUANTILE: 0.9,         // cover the 90th percentile of liked-home distances
  RADIUS_MARGIN_MI: 0.3,        // headroom added above the quantile so the boundary isn't tight
  RADIUS_MIN_LIKES: 5,          // need ≥ this many decayed, distance-bearing likes to recommend
  RADIUS_MIN_CHANGE_MI: 0.5,    // only raise a suggestion when |recommended − current| ≥ this
  RADIUS_EXPLORE_EVERY_DAYS: 7, // re-widen an area to CEIL every N days to keep the boundary honest
  RADIUS_EXPLORE_WINDOW_H: 12,  // …for this many hours per exploration cycle

  // ── directional ("petal") geofence — per-compass-sector keep radius ──────────────
  // Each area is split into RADIUS_SECTORS sectors around its centre. A sector defaults
  // to the area's scalar radius (rural-safe: a direction is never cut without its own
  // evidence). A sector with its own likes is fit to them (can reach toward rural up to
  // CEIL, or pull in if those likes are close); a sector that is reject-dominated with
  // no likes is pulled in to its rejects' keep-quantile (cut the far urban tail).
  RADIUS_SECTORS: 8,                    // compass sectors (45° each); sector 0 = North
  RADIUS_SECTOR_MIN_LIKES: 3,           // decayed likes in a sector before it fits its own radius
  RADIUS_SECTOR_MIN_REJECTS: 8,         // decayed rejects before a like-less sector may be cut
  RADIUS_SECTOR_REJECT_KEEP_QUANTILE: 0.5, // a cut sector keeps up to this quantile of its reject distances
};

/**
 * Resolve a flat config object from a preset name plus optional overrides.
 * @param {{ preset?: keyof typeof PRESETS, overrides?: object }} [opts]
 * @returns {object} flat config (FIXED ∪ preset levers ∪ overrides) + `preset` name.
 */
export function resolveConfig({ preset = DEFAULT_PRESET, overrides = {} } = {}) {
  const name = PRESETS[preset] ? preset : DEFAULT_PRESET;
  return { preset: name, ...FIXED, ...PRESETS[name], ...overrides };
}
