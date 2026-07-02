// intelligence-constants.js — single source of truth for the affordability rule
// numbers documented in docs/INTELLIGENCE_RULES.md. If you change a number here,
// update INTELLIGENCE_RULES.md in the same commit.

/** Loan-to-income (loan ÷ gross annual income). Upper bound is "out-of-reach". */
export const LTI_BANDS = { comfortable: 4.5, stretch: 5.5, tight: 6.0 };

/** Monthly mortgage payment as % of monthly take-home (P&I, contract rate). */
export const PAYMENT_BANDS_PCT = { comfortable: 40, stretch: 52, tight: 60 };

/** Monthly cash left after total-monthly minus bills + expenses + mortgage. */
export const SPARE_BANDS_GBP = { comfortable: 400, stretch: 100 };

/** LISA bonus available only up to this purchase price (statutory, current 2026). */
export const LISA_CAP_GBP = 450_000;

/** LTV tier boundaries — lender rate cliffs (%). Sorted ascending. */
export const LTV_TIERS = [60, 75, 85, 90, 95];

/** Rate-rise sensitivity (illustrative — no regulator-mandated stress rate since the
 * FPC withdrew its +3pp test on 1 Aug 2022). Sensitivity rate = the HIGHER of
 * (assumed rate + uplift) and the absolute floor; lenders typically test at
 * reversion + ~1pp with a floor around 7–8%. Both are overridable per household
 * via finances.mortgage.rateRiseUpliftPP / rateRiseFloorPct. */
export const RATE_RISE_UPLIFT_PP = 1;
export const RATE_RISE_FLOOR_PCT = 7.5;

/** Sensitivity payment / take-home above this triggers a whyVerdict warning. */
export const STRESS_WARNING_PCT = 60;

/** Affordability price-ladder range used by dashboard + finances UI. */
export const LADDER_RANGE = { min: 250_000, max: 500_000, step: 2_000 };

/** Tick marks on the affordability ladder SVG. */
export const LADDER_TICKS = [250_000, 300_000, 350_000, 400_000, 450_000, 500_000];

// ── Listing fit score (v3 L2) ────────────────────────────────────────────────
// The listing verdict is a 5-band scale, distinct from the 4-band affordability
// verdict it consumes. Affordability is a HARD GATE first (out-of-reach ⇒ reject,
// filtered from the default feed), then a soft signal blended with area/criteria
// fit (and, from L4, the learned-preference weights). See docs/INTELLIGENCE_RULES.md
// §"Listing fit". These weights are CALIBRATED and revisable — change them here and
// in INTELLIGENCE_RULES.md in the same commit.

/** 5-band listing verdict, best→worst. */
export const LISTING_VERDICTS = ['strong', 'possible', 'stretch', 'weak', 'reject'];

/** Score thresholds (0–1) → verdict band. A gated out-of-reach listing is 'reject'
 *  regardless of score. */
export const FIT_BANDS = { strong: 0.75, possible: 0.55, stretch: 0.4, weak: 0.2 };

/** Contribution weights for each fit signal (points added/removed from a 0.5 base,
 *  before clamping to 0–1). Positive = pushes toward 'strong'; negative possible. */
export const FIT_WEIGHTS = {
  affordabilityComfortable: 0.25,
  affordabilityStretch: 0.10,
  affordabilityTight: -0.05,
  bedsIdeal: 0.15,
  bedsMin: 0.05,
  bedsBelowMin: -0.30,
  typePreferred: 0.15,
  typeAcceptable: 0.0,
  typeExcluded: -0.40,
  priceInBudget: 0.10,
  priceOverBudget: -0.20,
  lisaEligible: 0.08,
  epcMeetsMin: 0.05,
  // Manual 1–10 saved-listing priority rating, applied POSITIVE-ONLY: the full
  // ratingMax at 10, scaling linearly to +0 at 1 (a low rating is a weaker boost,
  // never a penalty). Kept ≤ the strongest positive (affordabilityComfortable).
  ratingMax: 0.20,
};

// ── Learned preferences (v3 L4) ──────────────────────────────────────────────
// The append-only reaction log (Layer 1) is distilled into derived weights
// (Layer 2) that re-rank listings through the listing-fit learnedPrefs seam.
// These numbers are CALIBRATED and revisable — change them here and in
// docs/INTELLIGENCE_RULES.md §"Learned preferences" in the same commit.
//
//   COLD_START_MIN  graded (like/reject) reactions required before any derived
//                   weight is credited — below this, scoring falls back to the
//                   static fit and the feed diversifies to elicit contrast.
//   HALF_LIFE_DAYS  exponential recency half-life: a reaction's training weight
//                   halves every N days (decay basis = days since the reaction).
//   MAX_LEARNED_WEIGHT  magnitude ceiling for a single learned contribution
//                   (comparable to the strongest FIT_WEIGHTS entry).
//   MIN_SIGNAL_N    a signal must appear in at least this many graded reactions
//                   before it earns any weight (sparsity guard).
//   SMOOTHING       confidence shrinkage denominator: weight is scaled by
//                   n / (n + SMOOTHING) so thin evidence is discounted.
//   STRONG_FRACTION a learned weight counts as "strong" (e.g. for narrowing the
//                   next fetch) only at |weight| ≥ STRONG_FRACTION × MAX.
//   UNATTRIBUTED_DISCOUNT  when a reaction carries reasons, the signal kinds the
//                   reasons IMPLICATE get the full recency-weighted contribution;
//                   the signals they do NOT implicate are discounted by this
//                   factor. "Wrong area" is strong evidence against the area, weak
//                   evidence against that home's bed count or price band — so those
//                   move at 0.35× strength. A reaction with no reasons is undiscounted
//                   (full contribution to every signal — backward-compatible).
export const LEARNED_PREF = {
  COLD_START_MIN: 10,
  HALF_LIFE_DAYS: 30,
  MAX_LEARNED_WEIGHT: 0.30,
  MIN_SIGNAL_N: 2,
  SMOOTHING: 3,
  STRONG_FRACTION: 0.5,
  UNATTRIBUTED_DISCOUNT: 0.35,
  // Pass weak-negative: a pass contributes this fraction of a graded reaction's
  // recency weight as a LOCAL penalty to the discrimination of signals it carries
  // (capped at 0.5 of the range in deriveWeights). Never bootstraps cold-start,
  // never creates a new signal, never touches the shared rejected denominator.
  PASS_WEIGHT: 0.12,
  // Viewed/offered multiplier: a listing that reached a real decision (booking
  // or offer) earns this multiple of its normal recency weight in the graded pool.
  VIEWED_MULTIPLIER: 2.0,
};

/** Named training milestones (graded-reaction counts) for the L4 progress visual.
 *  Honest thresholds, NOT a magic single number — see docs/INTELLIGENCE_RULES.md.
 *  usable ≈ first meaningful re-ranking · solid ≈ confident · mature ≈ diminishing
 *  returns past here. Balance (likes vs rejects) matters more than raw volume. */
export const TRAINING_MILESTONES = { usable: 30, solid: 80, mature: 160 };

/** Recency window (days) for the "recent / optimal" listing wave: a listing is
 *  recent when added_date ≥ now − RECENCY_DAYS. Drives the cold-start review
 *  deck and the optimised fetch. Undated listings are never "recent". */
export const RECENCY_DAYS = 14;

// ── Recommendation loop / meta-observations (v3 L5) ──────────────────────────
// When learned behaviour contradicts stated criteria, surface a prompt — never
// rewrite criteria silently. A 3-condition trigger keeps it off noise; a
// dismissed prompt stays quiet for DISMISS_DAYS.
//   MIN_CONFLICT_LIKES   minimum violating likes before a conflict can fire.
//   MIN_CONFLICT_SHARE   violating likes must be this share of comparable likes
//                        (so an occasional outlier never triggers).
//   CONFLICT_RECENCY_DAYS at least one violating like must be this recent (the
//                        pattern must persist, not be a stale one-off).
//   DISMISS_DAYS         a dismissed conflict prompt stays quiet this long.
//   SAVED_STALE_DAYS     a "saved" home unactioned this long is considered stale.
export const META_OBS = {
  MIN_CONFLICT_LIKES: 3,
  MIN_CONFLICT_SHARE: 0.6,
  CONFLICT_RECENCY_DAYS: 30,
  DISMISS_DAYS: 14,
  SAVED_STALE_DAYS: 7,
  // L7.5: only propose tightening a village buffer if it would shrink by at least
  // this many miles below the farthest liked listing (avoids churny ±0.5mi nudges).
  TIGHTEN_MARGIN_MI: 1,
};
