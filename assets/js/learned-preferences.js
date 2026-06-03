// learned-preferences.js — re-export shim (REFACTOR P7c).
//
// The v3 L4/L5 preference engine was split into single-purpose modules under
// ./learned-preferences/ (signals · weights · search). This shim preserves the
// original 18-export surface so importers — assets/js/storage.js (recompute path),
// assets/js/page-listings.js (re-rank + cold-start deck), tools/fetch-listings.mjs
// (search-spec narrowing), and tests/learned-preferences.test.js — keep importing
// from './learned-preferences.js' unchanged.
//
// Pure, side-effect-free engine. See docs/INTELLIGENCE_RULES.md §"Learned preferences"
// for the Layer 1/2/3 contract and the cold-start guardrail.
export * from './learned-preferences/signals.js';
export * from './learned-preferences/weights.js';
export * from './learned-preferences/search.js';
