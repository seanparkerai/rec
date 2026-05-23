# CHECKLIST — live progress tracker

Tick items as completed and **commit**. To resume in a fresh chat: read this file, then `docs/PLAN.md` +
`docs/CONTEXT.md`, run a Haiku scan, run tests, continue at the first unchecked box.

**Status:** Phases 0–1 complete (shell live). **Intake data captured** from user (profile, criteria
including full filter table, full finances/budget, three checklists, 191-village master directory). Next:
build the Profile, Criteria, Areas directory and Finances pages from this data.

**New since plan:** user supplied a full budget (one-time costs, bills, expenses, shopping list, gift cards)
→ Finances page expands to a budget dashboard; and viewing/moving **checklists** (`data/checklists.json`)
→ likely a new "Journey" tab (confirming with user).

**Design-quality baseline (sideline pass, May 2026):** appended §9–§13 to `CLAUDE.md` (design quality,
mobile-first, WCAG 2.2 AA, Pico conventions, verification rules — sourced from Anthropic frontend-design
skill, web.dev, Polypane, WCAG 2.2, Pico v2 docs). Introduced `--space-*` / `--text-*` / `--focus-ring`
tokens; added global `prefers-reduced-motion` + `:focus-visible` rules; bumped nav/button touch targets
to ≥44 px; added skip-link, `id="main"` on every page, safe-area-inset on the sticky header, mobile
fade hint + scroll-snap on the nav; added no-horizontal-scroll + skip-link smoke tests. Remaining items
for the next pass: Playwright screenshot harness, axe-core CLI in tests, `<dialog>` replacing
`window.confirm`, Lighthouse CI thresholds.

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
- [x] Create folders: `assets/css`, `assets/js`, `assets/img/{areas,house-types}`, `components`, `data`, `pages`
- [x] `assets/css/tokens.css` (design tokens: colour, spacing, type; light/dark)
- [x] `assets/css/base.css` (Pico import + global layout, top-nav, cards)
- [x] `assets/css/dashboard.css` (dashboard grid + component styles)
- [x] `assets/js/config.js` (base-URL resolver — works locally and under /rec/ on Pages)
- [x] `components/header.html` (brand + theme toggle)
- [x] `components/nav.html` (7-page top nav)
- [x] `components/footer.html`
- [x] `assets/js/components.js` (fetch-inject partials, active-nav, theme toggle)
- [x] `assets/js/storage.js` (storage abstraction)
- [x] `assets/js/data-loader.js` (load `data/*.json`, cache, errors)
- [x] `assets/js/page-home.js` (dashboard tiles + lists)
- [x] `index.html` (dashboard shell: stat tiles, savings slot, areas slot, map slot)
- [x] Stub pages: `pages/{profile,criteria,areas,area-detail,house-types,finances,map}.html`
- [x] Seed minimal `data/*.json` so the shell renders without errors
- [x] `tests/assert.js`, `tests/schemas.js`, `tests/tests.html` (schema + smoke + storage checks)
- [x] `.github/workflows/pages.yml` + `.nojekyll`
- [x] Verify: all 28 routes 200, JSON + schema valid, ESM syntax valid (Node) — browser render to be confirmed at review
- [x] Commit + push
- [ ] **Design review checkpoint with user** (appearance/tokens/layout before content) — view via Pages or `python3 -m http.server`

## Phase 2 — Profile & criteria *(priority pillar)*
- [x] Request profile + criteria details from user
- [x] `data/profile.json` + `data/criteria.json` (real data)
- [x] **Full filter table captured** in `data/criteria.json` (location, price, types, tenure, status,
      features, EPC, freshness, keywords); schema extended in `tests/schemas.js`
- [x] `docs/USER_PROFILE.md` filled from user input (incl. portal-ready filter summary)
- [x] `pages/profile.html` (renders tiles + cards from `data/profile.json`; edit/save/cancel/reset
      with localStorage overlay via `assets/js/page-profile.js`)
- [ ] `pages/criteria.html` (must-haves vs nice-to-haves, editable)
- [ ] Tests: schemas + persistence round-trip
- [ ] Commit + push (pages)

## Phase 3 — Areas directory & profiles (batched) *(priority pillar)*
- [x] Request user's area list + resources (191 villages received)
- [x] `data/source/villages.csv` + `postcode-regions.csv` + `tools/build-areas.mjs` generator
- [x] `data/areas.json` (191) generated + `docs/AREAS.md` auto-generated with statuses
- [ ] `pages/areas.html` (search/filter/sort by county/town/postcode, cards)
- [ ] `pages/area-detail.html` (renders by `?id=`, 9-category framework)
- [ ] Geocode coords (for the map) — currently null
- [ ] Area content batches for priority villages first (research → temp file → splice → licence-safe images → tests → commit per batch)

## Phase 4 — House-types gallery (batched)
- [ ] `data/house-types.json` seeded
- [ ] `pages/house-types.html` gallery + cross-links to areas
- [ ] House-type content + imagery batches (tests → commit per batch)

## Phase 5 — Finances & budget dashboard
- [x] `data/finances.json` (full real data: income, goal, savings, mortgage, one-time costs, bills, expenses, shopping list, gift cards)
- [ ] `assets/js/finances.js` calculators (SDLT, LISA, LTV, progress, totals) — pure & tested
- [ ] `pages/finances.html` (savings chart + cost/bill/expense breakdowns + shopping + gift cards + tools)
- [ ] Tests: calculator benchmarks
- [ ] Commit + push

## Phase 4.5 — Journey / checklists (NEW, pending IA confirmation)
- [x] `data/checklists.json` captured (viewing, buying process, moving/packing)
- [ ] Surface as a "Journey" tab or fold into Finances (confirming with user)
- [ ] Interactive checkable lists persisted to storage

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
