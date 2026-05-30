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

/** Stressed-rate uplift over contract rate (percentage points). Source: PRA guidance. */
export const STRESS_UPLIFT_PP = 3;

/** Stressed payment / take-home above this triggers a whyVerdict warning. */
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
};
