# assets/js/suggestions/

**Domain:** Suggestion rendering and action routing — live conflict observations + refinement-engine cards → normalized view-model → markup + action dispatch.

**Naming:** `model.js` defines NormalizedSuggestion (universal shape for all suggestion kinds); `apply.js` routes actions (Apply / Snooze / Dismiss); `card.js` renders markup; `confirm.js` runs the shared confirm dialog for high-stakes actions (Stop area / Hide type); `sources.js` attaches metadata.

**Entry point:** `model.js` exports `fromConflict()` and `fromEngineCard()`, mapping source data to NormalizedSuggestion. `apply.js` exports `applySuggestion()` (action router, injected dependencies for testability). `card.js` renders the suggestion tile from the normalized shape; `confirm.js` creates a reusable `<dialog>` controller. Both Listings and Refinement pages reuse these modules.

**Key constraint:** PURE at model + apply level (no DOM, no I/O beyond injected storage writer). Normalization abstracts source (live conflict vs engine card); actions are testable via injected deps (default = real storage writers). Tier/label/message are computed, not hardcoded.

Run `find assets/js/suggestions -name '*.js'` for the live file list. See docs/REPO_MAP.md for the whole-repo map.
