# CHECKLIST — live progress tracker

Tick items as completed and **commit**. To resume in a fresh chat: read this file, then `docs/PLAN.md` +
`docs/CONTEXT.md`, run a Haiku scan, run tests, continue at the first unchecked box.

**Status:** Phase 0 complete · Phase 1 in progress.

---

## Phase 0 — Foundation & governance
- [x] `CLAUDE.md` (operating rules)
- [x] `.gitignore`
- [x] `README.md` (overview, run/preview, Pages toggle)
- [x] `docs/PLAN.md` (approved plan)
- [x] `docs/CONTEXT.md` (research foundation)
- [x] `docs/CHECKLIST.md` (this file)
- [x] `docs/AREAS.md` (master area list, seeded)
- [x] `docs/USER_PROFILE.md` (narrative template)
- [x] `tools/insert-content.mjs` (large-content splice helper)
- [x] Commit + push Phase 0

## Phase 1 — App skeleton & shared shell
- [ ] Create folders: `assets/css`, `assets/js`, `assets/img/{areas,house-types}`, `components`, `data`, `pages`
- [ ] `assets/css/tokens.css` (design tokens: colour, spacing, type; light/dark)
- [ ] `assets/css/base.css` (Pico import + global layout, top-nav, cards)
- [ ] `assets/css/dashboard.css` (dashboard grid + component styles)
- [ ] `components/header.html` (brand + theme toggle)
- [ ] `components/nav.html` (7-page top nav)
- [ ] `components/footer.html`
- [ ] `assets/js/components.js` (fetch-inject partials, active-nav, theme toggle)
- [ ] `assets/js/storage.js` (storage abstraction)
- [ ] `assets/js/data-loader.js` (load `data/*.json`, cache, errors)
- [ ] `index.html` (dashboard shell: stat tiles, savings sparkline slot, areas slot, map slot)
- [ ] Stub pages: `pages/{profile,criteria,areas,area-detail,house-types,finances,map}.html`
- [ ] Seed minimal `data/*.json` so the shell renders without errors
- [ ] `tests/assert.js`, `tests/schemas.js`, `tests/tests.html` (smoke: pages 200, partials mount)
- [ ] `.github/workflows/pages.yml` + `.nojekyll`
- [ ] Verify locally (`python3 -m http.server`) — shell loads, nav highlights, theme toggles
- [ ] Commit + push
- [ ] **Design review checkpoint with user** (appearance/tokens/layout before content)

## Phase 2 — Profile & criteria *(priority pillar)*
- [ ] Request profile + criteria details from user
- [ ] `data/profile.json` + `data/criteria.json`
- [ ] `pages/profile.html` (editable form → storage)
- [ ] `pages/criteria.html` (must-haves vs nice-to-haves, editable)
- [ ] `docs/USER_PROFILE.md` filled from user input
- [ ] Tests: schemas + persistence round-trip
- [ ] Commit + push

## Phase 3 — Areas directory & profiles (batched) *(priority pillar)*
- [ ] Request user's area list + resources; merge with seed
- [ ] `data/areas.json` seeded + `docs/AREAS.md` updated with statuses
- [ ] `pages/areas.html` (search/filter/sort, county tabs, cards)
- [ ] `pages/area-detail.html` (renders by `?id=`, 9-category framework)
- [ ] Area content batches (research → temp file → splice → licence-safe images → tests → commit per batch)

## Phase 4 — House-types gallery (batched)
- [ ] `data/house-types.json` seeded
- [ ] `pages/house-types.html` gallery + cross-links to areas
- [ ] House-type content + imagery batches (tests → commit per batch)

## Phase 5 — Finances & savings tracker
- [ ] `data/finances.json` template
- [ ] `assets/js/finances.js` calculators (SDLT, LISA, LTV, progress) — pure & tested
- [ ] `pages/finances.html` (savings chart + cost breakdown + tools)
- [ ] Tests: calculator benchmarks
- [ ] Commit + push

## Phase 6 — Interactive map
- [ ] `assets/js/map.js` (Leaflet + Geoman, OSM tiles)
- [ ] `pages/map.html` (markers from `areas.json`, draw/save/load zones as GeoJSON in localStorage)
- [ ] Tests: markers render, draw round-trips
- [ ] Commit + push

## Phase 7 — Dashboard polish & future-proofing
- [ ] `index.html` aggregates (savings snapshot, shortlist, recent areas, map preview)
- [ ] Responsive + accessibility + dark-mode pass
- [ ] Document storage → backend/login migration path
- [ ] Full regression run of `tests.html`
- [ ] Commit + push
