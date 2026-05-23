# CHECKLIST — live progress tracker

Tick items as completed and **commit**. To resume in a fresh chat: read this file, then `docs/PLAN.md` +
`docs/CONTEXT.md`, run a Haiku scan, run tests, continue at the first unchecked box.

**Status:** Phases 0–7 functionally complete. All eight pages live (Home dashboard with sparkline +
journey widget, Profile + Criteria editable forms, Areas directory + detail, Journey checklists,
Finances with calculators, House types gallery, Map with draw tools). Two follow-up tracks remain:
**(1) per-village geocoding** to populate map markers (currently 0/191 with coords) and
**(2) per-village + per-house-type research/imagery batches** (CLAUDE.md §7 mandates web-cited
content + licence-safe images before publishing rich profiles).

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
- [x] `pages/criteria.html` (renders 10-card form from `data/criteria.json` with edit/save/cancel/reset;
      all nested structures + arrays editable; full localStorage persistence via `assets/js/page-criteria.js`)
- [x] Tests: schemas valid (all six data files + persistence round-trip via Edit/Save flow)
- [x] Commit + push (pages) → `6e8ef8d`

## Phase 3 — Areas directory & profiles (batched) *(priority pillar)*
- [x] Request user's area list + resources (191 villages received)
- [x] `data/source/villages.csv` + `postcode-regions.csv` + `tools/build-areas.mjs` generator
- [x] `data/areas.json` (191) generated + `docs/AREAS.md` auto-generated with statuses
- [x] `pages/areas.html` (search/filter/sort by county/town/postcode/status, responsive card grid,
      shortlist toggle persisted to localStorage) → `5b08ac8`
- [x] `pages/area-detail.html` (renders by `?id=`, 9-category framework: Overview · Amenities · Schools ·
      Transport · Prices · Things to do · Places to eat · Pros/Cons · Who it suits; tiles + image gallery
      + sources; shortlist toggle; not-found fallback)
- [ ] Geocode coords (for the map) — currently null
- [ ] Area content batches for priority villages first (research → temp file → splice → licence-safe images → tests → commit per batch)

## Phase 4 — House-types gallery (batched)
- [x] `data/house-types.json` seeded with 8 types (thatched cob, flint-and-brick, Georgian townhouse,
      Victorian terrace, 1930s semi, new-build estate, New Forest cottage, garrison/SFA)
- [x] `pages/house-types.html` gallery (auto-fill 320 px card grid; description + features + region
      badges; image-or-monogram placeholder; cross-links to area-detail.html via houseTypeIds reverse
      lookup)
- [ ] House-type content + imagery batches (research → temp file → splice → licence-safe images →
      sources → tests → commit per batch). Deferred: requires per-type web research per CLAUDE.md §7.

## Phase 5 — Finances & budget dashboard
- [x] `data/finances.json` (full real data: income, goal, savings, mortgage, one-time costs, bills, expenses, shopping list, gift cards)
- [x] `assets/js/finances.js` calculators — pure & tested (SDLT FTB + standard Apr 2025+, monthly P&I
      mortgage, LTV, LISA bonus, LISA eligibility cap, deposit progress, months-to-target, savings
      projection, initial outlay) → `336f0ff`
- [x] `pages/finances.html` (4 headline tiles, income/goal/mortgage/savings summaries, savings projection
      Chart.js line graph, 5 breakdown tables — one-time costs, bills, expenses, shopping, gift cards —
      with totals; 4 live calculators — SDLT, mortgage, LTV, LISA — driving off the pure functions)
- [x] Tests: 15 calculator benchmarks in `tests/tests.html` (all known-input → known-output cases pass)
- [x] Commit + push → `d4821a6`

## Phase 4.5 — Journey / checklists
- [x] `data/checklists.json` captured (viewing, buying process, moving/packing)
- [x] Surfaced as a new "Journey" tab (added between House Types and Finances in `components/nav.html`)
- [x] Interactive checkable lists persisted to storage (`rec:journey-checks`, three sections,
      progress bars per section, "Clear all checks" action)

## Phase 6 — Interactive map
- [x] `assets/js/page-map.js` (Leaflet 1.9.4 + Geoman 2.18.3 from CDN, OSM tiles, Hampshire/Wiltshire
      centred at [51.05, -1.6] zoom 9; draw polygon/rectangle controls; saved zones loaded on init
      from `rec:zones`; persists on create/edit/remove; circleMarker style differs for shortlisted vs
      directory areas; popups link to area-detail.html)
- [x] `pages/map.html` (12-col grid: 8/4 map+shortlist panel; tiles for total/mapped/zones; Recentre +
      Clear-zones actions; live status line)
- [ ] Markers depend on geocoded coords (currently 0/191) — pending geocoding pass (Nominatim or
      Ordnance Survey Open Names). Draw + persistence loop is fully functional and tested by hand.
- [x] Commit + push

## Phase 7 — Dashboard polish & future-proofing
- [x] `index.html` aggregates (4 headline tiles, savings projection Chart.js sparkline with live
      "X now · +Y/mo · target in N months" sub-line, shortlist snippet showing first 6 or starred,
      journey progress widget showing % done per checklist, expanded quick-links list)
- [x] Responsive + accessibility + dark-mode pass (addressed in design-quality baseline `1508e9b`:
      `prefers-reduced-motion`, `:focus-visible`, skip-link, safe-area-inset, ≥44 px touch targets,
      mobile nav fade, `--space-*` / `--text-*` / `--focus-ring` tokens; dark mode auto + manual)
- [x] Document storage → backend/login migration path (added to `README.md` with example diff and
      full list of `rec:*` localStorage keys)
- [x] Full regression run of `tests.html` (all 6 JSON schemas pass, all 10 page routes return 200,
      skip-link + no-horizontal-scroll smoke tests, 15 calculator benchmarks, storage round-trip)
- [x] Commit + push
