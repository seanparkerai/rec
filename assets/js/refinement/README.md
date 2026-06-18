# refinement/ — Model Refinement Engine: statistical core & UI

**Domain:** The Layer 4 refinement engine — learning area & property-type patterns from user reactions and surfacing actionable suggestions. The engine is pure deterministic statistics; the UI wraps it with persistence, logging, and control.

**Naming convention:** `engine.js` (statistical pipeline, pure); `view.js` (view-model builders for the control panel, pure); `config.js` (tunable constants); `scope.js` (scope mutation); `persistence.js` (DB mutation planning); `trends-glance.js` (quick-glance summary rendering).

**Entry points & architecture:**
- `engine.js` — deterministic statistical core: normalise → time-decay → Wilson lower bound → baseline + lift + two-proportion test → Benjamini-Hochberg FDR → five gates → tiers → ranking. Takes a snapshot, returns ranked candidates. NO UI, NO Supabase, NO randomness.
- `config.js` — the four preset levers (Cautious/Balanced/Aggressive) that control WILSON_FLOOR, MIN_LIFT, PERSISTENCE_RUNS, FDR_Q; also fixed constants (half-life, thresholds, tier boundaries).
- `persistence.js` — Stage 3 planner: turns an engine run into intended DB mutations (suggestion upserts, audit row, sync_log). Pure; the driver executes.
- `view.js` — Stage 4: humanises raw engine output into display-ready objects (labels, confidence meters, volume-artefact notes).
- `scope.js` (tbd) — scope mutation (which areas/types to include/exclude).

**Key constraint:** `engine.js` is pure and can run offline. See docs/archive/REFINEMENT_PLAN.md for the full design.

**Live file list:** `find assets/js/refinement -name '*.js' | sort`

See docs/REPO_MAP.md for the whole-repo map.
