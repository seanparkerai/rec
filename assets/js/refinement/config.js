// refinement/config.js — single source of truth for the Model Refinement Engine's
// tunable numbers (docs/REFINEMENT_PLAN.md §5). The engine (./engine.js) is pure and
// reads everything from a resolved config object; nothing is hard-coded downstream.
//
// Two classes of constant:
//   • PRESET levers — the four numbers the Cautious/Balanced/Aggressive buttons change
//     (plan §4.6 + §5 preset matrix). Shipped default = Cautious (Luke's choice).
//   • FIXED — the same across presets, plus the engine internals that operationalise
//     the §2 spec (Wilson z, small-n continuity threshold, tier boundaries, FDR family
//     mode, and the "volume artefact" thresholds).
//
// If you change a number here, reconcile docs/REFINEMENT_PLAN.md §5 in the same commit.

/** The four preset-controlled levers (plan §5 preset matrix). */
export const PRESETS = {
  cautious:   { WILSON_FLOOR: 0.88, MIN_LIFT: 1.6,  PERSISTENCE_RUNS: 5, FDR_Q: 0.05 },
  balanced:   { WILSON_FLOOR: 0.80, MIN_LIFT: 1.3,  PERSISTENCE_RUNS: 3, FDR_Q: 0.10 },
  aggressive: { WILSON_FLOOR: 0.72, MIN_LIFT: 1.15, PERSISTENCE_RUNS: 2, FDR_Q: 0.15 },
};

/** Shipped default preset (plan §4.6 — Cautious). */
export const DEFAULT_PRESET = 'cautious';

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
  EXCLUDE_PASSES: false,      // confirmed: `pass` counts as a non-reject trial (§2.1)

  // ── engine internals (operationalise the §2 spec; not user-facing) ──────────
  WILSON_Z: 1.96,             // z for the 95% Wilson lower bound (§2.3)
  CONTINUITY_N_MAX: 30,       // apply small-n continuity correction below this n_eff (§2.3)
  TIER_CONFIDENT: 0.90,       // tier boundary: Probable → Confident (§2.7)
  TIER_STRONG: 0.95,          // tier boundary: Confident → Strong (§2.7)
  FDR_PER_DIMENSION: true,    // BH family = per dimension vs one pooled family (§2.5 switch)
  VOLUME_ARTEFACT_MAX_LIFT: 1.0,   // a value is an artefact only when lift ≤ this (§2.8)
  VOLUME_ARTEFACT_MIN_REJECTS: 30, // …and its raw reject count is "high" (≥ this) (§2.8)
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
