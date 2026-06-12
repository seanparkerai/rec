# Refactor Notes — Code Quality Pass (2026-05)

Archaeology summary for the behaviour-preserving refactor executed across `REFACTOR_PLAN.md` Phases 0–9.

## What was done

| Phase | Change |
|-------|--------|
| 0 | Characterization snapshot tests for `page-home.js`, `page-finances.js`, `page-outreach.js` |
| 0.5 | Doc currency audit: stale CLAUDE.md spots fixed, PROGRESS.md archived, README updated |
| 1 | Created `dom.js`, `motion.js`, `svg.js`, `css-vars.js`; eliminated 10+ duplicate inline copies across 11 page modules |
| 2 | Created `intelligence-constants.js` + `flow-constants.js`; extracted `FLOW_PALETTE`, `LADDER_RANGE`, `LTI_BANDS` etc. from page modules |
| 3 | Split `page-home.js` (was ~900 lines) into 12 dashboard tile modules in `assets/js/dashboard/`; coordinator < 200 lines |
| 4 | Split `page-finances.js` (was ~1100 lines) into 8 finance section modules in `assets/js/finances/`; coordinator < 200 lines |
| 5 | Split `page-outreach.js` (was ~900 lines) into 8 outreach modules in `assets/js/outreach/`; coordinator < 200 lines |
| 6 | Split `dashboard.css` (was ~2000 lines) into `@import` shell + per-tile (`assets/css/dashboard/`) + per-page (`assets/css/pages/`) partials |
| 7 | Extracted `data-sync.html` inline `<style>` → `assets/css/pages/data-sync.css`; inline `<script>` → `assets/js/page-data-sync.js`; applied `byId`/`on` dom.js helpers |
| 8 | Removed 2 `onclick=` attributes from `about-search.html`; bound handlers in new `assets/js/page-about-search.js` |
| 9 | Renamed 5 phase-numbered CSS files to descriptive names; confirmed `supabase-types.ts` location and `page-profile.js` vs `page-profile-detail.js` naming |

## Key decisions

- **No behaviour changes** throughout. All 184 tests pass before and after every phase.
- `dom.js` helpers (`byId`, `on`, `esc`, `setText`, `setHTML`) used consistently for DOM access; no new `document.querySelector` patterns introduced in refactored code.
- Dashboard tiles and finance sections are **ESM modules** exported as named functions; page coordinators import and call them. No globals introduced.
- `dashboard.css` kept as a single `@import` shell loaded by every page — no HTML changes needed.
- Guard-railed files (`tokens.css`, `storage.js`, `config.js`, `data-loader.js`, `finances.js`, `area.schema.json`, `.github/workflows/*`) untouched throughout.

## Files created

```
assets/js/dom.js
assets/js/motion.js
assets/js/svg.js
assets/js/css-vars.js
assets/js/intelligence-constants.js
assets/js/flow-constants.js
assets/js/dashboard/tile-*.js  (×12)
assets/js/finances/section-*.js + chart-helpers.js  (×9)
assets/js/outreach/*.js  (×8)
assets/js/page-data-sync.js
assets/js/page-about-search.js
assets/css/pages/data-sync.css
```

## Files renamed (no content change)

```
dashboard/tile-phase4.css       → dashboard/tile-extended.css
pages/finances-phase4.css       → pages/finances-widgets.css
pages/areas-phase4b.css         → pages/areas-rows.css
pages/shared-phase4c.css        → pages/shared.css
pages/finances-v3-charts.css    → pages/finances-charts.css
```

## Test baseline

184/184 tests pass throughout. Harness: `node tools/run-intelligence-tests.mjs`.
