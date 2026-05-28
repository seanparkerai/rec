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
fade hint + scroll-snap on the nav; added no-horizontal-scroll + skip-link smoke tests.

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
- [~] Geocode coords (for the map): every area now has a `coords` value, but 191/191 are at the
      `postcode-outward-approx` centroid (±~1 km jitter so villages don't stack). Precise per-village
      geocoding ships as `tools/geocode-areas.mjs` (Nominatim, polite-UA, 1 req/s, cached + resumable,
      `--provider postcodesio` fallback). Must be run from a host with outbound access — the managed
      cloud sandbox blocks Nominatim/postcodes.io. Cache lands at `data/source/geocode-cache.json`.
- [~] Area content batches: first batch (4 villages — `stockbridge-so20`, `broughton-so20`,
      `wherwell-sp11`, `hambledon-po7`) drafted with web-cited `overview`/`character`/`amenities`/
      `pros`/`cons`/`whoItSuits`/`sources` per CLAUDE.md §7. Batch update completed: `stockbridge-so20`, `broughton-so20`, and `hambledon-po7` promoted to `researched` with schools/transport/prices added; `farley-mount-rg25` remains the only `partial` record pending data-source correction. Imagery still pending. Remaining: 153 directory villages. Pattern is `tools/enrich-batch-NN.mjs`.

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
- [~] Markers: 191/191 now render at the postcode-outward centroid (clearly flagged "(approx.)" in
      popups and counted in the map-status line). Precise per-village positions will overwrite via
      `tools/geocode-areas.mjs` (Nominatim) — see Phase 3 note. Draw + persistence loop unchanged.
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

## Phase 8 — Editorial redesign (May 2026 →)
Goal: take the app from "functional" to "stunning, mobile-first, award-quality" per `DESIGN.md`.
Each item below is one commit + push milestone. Anchor in commit message (Stripe-docs / Linear-dense).

### 8A · Foundation
- [x] `DESIGN.md` (anchors, tokens, bans, verification) + CLAUDE.md link
- [x] Self-host fonts: Fraunces (display) + Instrument Sans (body) + JetBrains Mono (data),
      `tools/fetch-fonts.mjs`, `assets/css/fonts.css`, woff2 latin + latin-ext subsets committed
- [x] Rewrite `tokens.css` on OKLCH + `color-mix`; paper/ink/hairline/accent-soft derived;
      Pico vars re-mapped; dark theme flipped on same hue ladder
- [x] Apply Fraunces to h1–h4 with optical sizing; `.num` utility for tabular mono numerals;
      cross-document View Transitions opt-in
- [ ] Split `base.css` into `assets/css/components/{card,tile,sheet,chip,segmented,table,field,dialog}.css`
      and add container queries on cards / sidebar
- Screenshot/Playwright verification was removed (see CLAUDE.md §13): the assistant has no browser, so
  visual review is done by eye in the browser by the developer.

### 8B · Map (anchor: Linear-dense; biggest single perceptual upgrade)
- [x] Apple-Maps-style 3-detent bottom sheet on mobile (peek 6rem / mid 46svh / full 92svh).
      Tap handle or sheet head to cycle; map.invalidateSize() after 320ms transition. Desktop
      keeps the side-by-side grid. Sheet body is the editorial .area-list shortlist.
- [~] Interim: CartoDB Positron / Dark Matter basemap + themed Leaflet popups + accent-soft
      markers. Cleaner than raw OSM for now; full MapLibre + PMTiles swap below.
- [ ] Swap Leaflet + Geoman → MapLibre GL JS v5 + maplibre-gl-draw
- [ ] Hampshire/Wiltshire PMTiles slice at `assets/maps/uk-south.pmtiles` from Protomaps
- [ ] Token-driven map style (light + dark variants); markers carry the only saturation
- [ ] Mobile bottom-sheet component: 15svh / 50svh / 92svh detents, drag handle, body-scroll-lock
      at full; segmented control List / Map / Split
- [ ] Port `page-map.js`: markers, shortlist toggle, drawn-zones persistence (unchanged storage API)

### 8F · iPhone mobile-first finalisation
- [x] `.page-head.has-actions` class (stacks below 640px, side-by-side ≥640px) replaces inline
      `display:flex` hacks on area-detail / journey / criteria / map page-heads
- [x] `.page-actions` buttons fill width on mobile (<480px), ≥44 px touch targets, gap-wrapped
- [x] `main.container` padding tracks safe-area-inset (left/right) and is fluid
      (`clamp(0.75rem, 4vw, 2rem)`)
- [x] `.stat-strip` collapses to 2-col below 540px with reset borders + smaller dd; long .is-text
      values now wrap rather than overflow
- [x] `<dialog>` mobile-fullscreen (100svh, safe-area-inset all four sides, no border-radius);
      desktop stays as a centred card. Scrolls inside the form, not the dialog.
- [x] Bottom sheet on map: tappable head with rotating ↑ chevron affordance, larger 40×5 handle,
      page-head shrinks to just the h1 on mobile so the map gets ~12 svh more vertical space
- [x] Brand caption hidden below 380px so the header doesn't crowd the theme toggle

### 8C · Per-page redesigns (in plan order)
- [x] `index.html` — bento dashboard, SVG progress ring with Fraunces centre, themed chart, journey step strip
- [x] `pages/profile.html` — editorial article layout, native `<dialog>` edit panel, chip-grid priorities
- [x] `pages/criteria.html` — page-head editorial + sticky bottom save bar while editing
- [x] `pages/areas.html` — editorial list view; URL-driven filters + dialog filter sheet deferred
- [x] `pages/area-detail.html` — article with hairline-divided sections; sticky TOC + mini-map deferred to 8B
- [x] `pages/house-types.html` — two-up editorial gallery, 4:3 image wells, accent-soft placeholders
- [x] `pages/journey.html` — editorial head, article column layout
- [x] `pages/finances.html` — themed chart + hero Fraunces percentage block with stat cells
- [x] Shared shell — circular ink brand mark in Fraunces, pill theme toggle, scroll-shrink header
      with backdrop-blur (`[data-scrolled]` toggle in components.js), refined nav
- [x] Named cross-document View Transition: areas row title ↔ area detail h1 morph
      (animated active-link indicator on nav: deferred)

### 8D · Imagery — blocked in this sandbox (allowlist excludes Wikimedia / Unsplash / Geograph)
- [ ] `tools/fetch-images.mjs` (CSV → assets/img + JSON credit/licence write-back) — must run
      in a host session with outbound HTTPS to commons.wikimedia.org / geograph.org.uk / unsplash.com
- [ ] 4 drafted villages (Stockbridge, Broughton, Wherwell, Hambledon) imaged
- [ ] 8 house-types imaged with type-locked CC sources

### 8E · Final sweep
- Screenshot / axe / Lighthouse acceptance dropped (see CLAUDE.md §13): no browser in the assistant's
  environment. Visual review is done by eye in the browser by the developer.
- [ ] Update `docs/PLAN.md` to mark Phase 8 complete

## Phase 9 — Finalisation (May 2026 →)
Confirmed via 25-question scope review with the user. See `docs/PLAN.md` §"Phase 9 — Finalisation"
for the full spec. Network policy of the current sandbox blocks all research / imagery / tile
sources, so 9F items are queued behind tools to be run from a connected host.

### 9A · Information architecture (on-sandbox)
- [x] Merge `pages/profile.html` + `pages/criteria.html` → `pages/about-search.html` (Stripe-docs).
      Old URLs redirect via `<meta refresh>`. Nav updated: `Profile · Criteria` → `About`.
      Both page scripts scoped to `[data-page]` section roots; profile-side collision IDs prefixed
      `p-*`; localStorage keys (`rec:profile`, `rec:criteria`) preserved verbatim.
- [x] Dashboard reorganisation: magazine lead-in + bento that aggregates from every page
      (Linear-dense hybrid). Editorial `.page-lede` (Fraunces summary + 4-stat meta) above
      the bento; new `.bento-about` and `.bento-filters` cells pull priorities / property
      types / must-haves / tenure / EPC from About + Criteria storage.
- [x] Finances kept as one page, restructured into "Now vs Later" sections. Two
      `.finance-stage` blocks ("Where you stand today" / "When you complete") with
      Fraunces stage titles + accent chip; card titles demoted to `<h3>` to preserve
      the document outline. All IDs, calculators, and storage hooks unchanged.
- [x] Journey checklists global (no per-area state) + "what unlocks next" hint per section.
      State already global (`rec:journey-checks`); each section now renders an accent-soft
      `.next-hint` panel showing the next unchecked item (with timing) or an "All done"
      end-state.

### 9B · Areas page improvements (on-sandbox)
- [x] URL-driven filter state on `pages/areas.html` (`q`/`county`/`sub`/`sort`/`starred` params).
- [x] `<dialog>` full-filter sheet on mobile. Single `<dialog class="filter-sheet" open>`
      contains all four filter controls + the shortlist toggle: styled as an inline card
      on ≥768px, full-height bottom-sheet modal below. Compact trigger row above the list
      on mobile shows active-filter pills + "Filters" button (`showModal()`); Done closes.
- [x] Sticky anchored TOC on `area-detail.html` (left rail desktop / chip row mobile).
      `<nav class="area-toc">` with 9 entries; container-query-style media split: at
      ≥1024px a 12rem hairline-rail TOC, below that a sticky pill row with
      `scroll-snap-type: x proximity`. IntersectionObserver sets `aria-current` and
      auto-scrolls the active pill into view on mobile.
- [x] Animated active-link nav indicator (View Transitions cross-document). The active
      link's `::after` underline bar carries `view-transition-name: nav-indicator`; with
      `@view-transition { navigation: auto }` already in place, the bar morphs between
      old and new active links on navigation (280ms, `--ease-out`).

### 9C · Schema additions (on-sandbox)
- [x] `areas.json` schema: `councilTaxBand`, `broadbandMedianMbps`, `nearestStation`,
      `primarySupermarket`. Schema validator updated. UI hides empty rows. A new
      `.essentials` card on `area-detail.html` renders only the populated rows; if all
      four are unset the entire card stays `hidden`.
- [x] House types expanded 8 → 15 with `status: "draft-no-sources"`. New entries:
      Edwardian villa, inter-war bay-fronted semi, post-war local-authority semi,
      converted barn, dormer bungalow, coastal Solent flat, park home. Each gets a
      "Draft" chip on the gallery card and an explicit placeholder body until
      type-specific research + licensed imagery land (CLAUDE.md §7).

### 9D · CSS component split & polish (on-sandbox)
- [x] Extract `assets/css/components/{card,tile,sheet,chip,segmented,table,field,dialog}.css`.
      Card / tile / chip / dialog / field rules migrated; sheet / segmented / table land
      as scaffold files (header comment + reservation) for incremental future moves —
      the matching live rules still live in `dashboard.css` and inline page styles.
      `base.css` `@import`s all eight so a single `<link>` continues to pull everything.
- [x] Container queries on `.card` and map sidebar. `.card` now declares
      `container-type: inline-size; container-name: card` and a
      `@container card (max-width: 360px)` rule collapses padding + heading size when a
      card is squeezed into a narrow column (e.g. half-width bento cells). Map sidebar
      already uses container queries (Phase 8C); no new rules required there.

### 9E · On-sandbox housekeeping
- [x] `tests/schemas.js` updated for new fields (`councilTaxBand`,
      `broadbandMedianMbps`, `nearestStation`, `primarySupermarket` on areas;
      `status` on house-types). Validators stay forgiving — only type-check when
      the optional key is present.
- [x] `README.md` localStorage section updated. Storage table now enumerates each
      `rec:*` key with its owning page + shape, plus a Phase 9 note that no new
      keys were introduced and that the profile/criteria URLs redirect to
      `about-search.html`.
- [x] Run `tests/tests.html` before each push — verified via a Node harness against
      all six JSON schemas (`data/{profile,criteria,areas,house-types,finances,
      checklists}.json` all pass). The browser-side test suite (page-200 + storage
      round-trip + no-horizontal-scroll + skip-link) cannot be exercised in this
      sandbox without a Chromium download but stays green on the schema side.

### 9F · Needs-network (queued; run from a connected host) — ⚠ blocked here
- [ ] `node tools/geocode-areas.mjs` → 191/191 precise coords.
- [ ] `tools/research-areas.mjs` (to write): 9-category content + 3-source min / 5 for top-N.
- [ ] `tools/fetch-images.mjs` (to write): 2–3 licensed images per village + credit/licence write-back.
- [ ] `tools/research-house-types.mjs` (to write): 15 house types fully described + cited.

- [ ] 2026-05-24: Attempted strict 10-area batch workflow; paused before writing area files because evidence collection for 10 areas did not meet the anti-shortcut/corroboration bar in one pass. Next run should complete one fully evidenced 10-area SP2 cluster batch before committing records.

- [x] 2026-05-24: Completed SP2/SP1 west-Salisbury research batch (10 areas): bemerton-sp2, burcombe-sp2, great-wishford-sp2, little-wishford-sp2, netherhampton-sp2, south-newton-sp2, stapleford-sp2, stoford-sp2, wilton-sp2, stratford-sub-castle-sp1.

- [x] 2026-05-24: Completed 50-area batch across SP5/SP4/SP3/SP1/GU34/SOxx queue: alderbury-sp5 through monkwood-gu34 (50 records promoted to researched).

- [x] 2026-05-24: Quality remediation pass reverted 60 previously templated area records from researched back to directory stubs pending proper multi-source per-area rewrite.

- [x] 2026-05-24: Re-ran next 10 records (alderbury-sp5 to charlton-all-saints-sp5) with refreshed sourced content pass.

---

## V2 Overhaul (docs/PLAN.md)

Adopted 2026-05-25. Tick each v2 phase as it lands; commits go directly to `main` per CLAUDE.md §1.

- [x] **Phase 1 — Constitution + design rules** (`c2c6038`): CLAUDE.md §14/§15/§16; DESIGN.md §3 bans + §5 five rules; `docs/INTELLIGENCE_RULES.md`; `docs/ROADMAP.md`.
- [x] **Phase 2 — Intelligence engine**: `assets/js/format.js`, `assets/js/affordability.js`, `assets/js/money-flow.js`, `assets/js/savings-velocity.js`; tests `affordability.test.js`, `money-flow.test.js`, `savings-velocity.test.js` wired into `tests/tests.html`; mechanical formatter dedupe in `page-home.js` / `page-area-detail.js` / `page-finances.js`. Node smoke runner `tools/run-intelligence-tests.mjs` passes 20/20. INTELLIGENCE_RULES.md bands re-calibrated against this household (loosened LTI to 4.5/5.5/6.0× and payment/take-home to 40/52/60%; calibration note appended).
- [x] **Phase 3 — Dashboard overhaul** *(Linear-dense)*: 7 tiles wired (deposit story · affordability ladder · money-flow · shortlist with fit dots · journey track · criteria prose · ask placeholder). `index.html` bento rewritten; `page-home.js` consumes `assessAffordability` + `getMoneyFlow` + `getMoneyFlowPostMove`; `dashboard.css` appended (existing rules untouched per PLAN.md L109; old `.bento-hero` etc. now orphan, flagged for Phase 6 cleanup). Static smoke green; visual review done by eye in the browser (no screenshot step — see CLAUDE.md §13).
- [x] **Phase 4a — Finances page overhauled** *(Linear-dense)*: NOW section gets a full-width money-flow tile and bills/expenses tables with sparkbars; deposit hero kept with LISA band added. LATER section gets side-by-side today/after-move flows, a **unified affordability widget** (one price slider drives a mono grid of deposit/loan/LTV/SDLT/LISA/monthly/stressed/spare with a colour-banded verdict pill), a "What if…" Chart.js line with baseline + ghosted scenarios, and one-time/shopping/gift-cards as `<details>`. Four old siloed calculator fieldsets removed. Parity check in `tests/affordability.test.js` (21/21 green).
- [x] **Phase 4b — Areas + area detail overhauled** *(Linear-dense + Stripe-docs)*: tools/area-fields.mjs + tools/build-areas.mjs extended to bake `priceSummary` (avgDetached/Semi/Terraced/Flat + asOf) and promote `councilTaxBand` into the lightweight index. `data/areas.json` + 191 per-area files regenerated. Areas page gains a fit-dot, bed-fit (matching property type + avg price) and council-tax-band column, plus a Fit filter pill and `fit`/`price`/`counciltax` sort options. Area-detail gains a colour-banded verdict strip at the top, Ofsted dots on schools, coloured commute bands on transport, and a foot mini-affordability widget reusing the Phase 4a `.afford-widget`. `tests/schemas.js` validates the new index fields. **Compare drawer deferred** (multi-select + side-by-side comparison) — flagged as Phase 6 follow-up.
- [x] **Phase 4c — Journey + map + house-types polish**: journey page gains a horizontal track + next-action row at the top (the dashboard tile component reused); the three checklists below stay as the management view. Map markers are now status-banded (shortlisted = full accent · researched = accent-soft · partial = paper outline · stub = hairline) with popup enrichments (fit dot + council tax band) and a bottom-right legend control. House-types cards gain a typical price-band across the type's associated areas (min–max + median) and a count of shortlisted areas that feature that type. **Dashboard journey-track bug** carried into this phase: `findNextAction` used `item.id ?? item.title` but checklists items have neither — switched to index-based state keys, matching the journey page's existing convention so ticks interoperate.
- [x] **Phase 5 — Placeholder pages** (`pages/listings.html`, `pages/outreach.html`, `pages/ask.html`): three Stripe-docs-anchor mocks — eyebrow + h1 + lead + muted illustration zone + "what this will do" bullets + dimmed example rows / template cards / suggestion chips + disabled CTA + roadmap footer linking `docs/ROADMAP.md`. Nav extended with `Listings (soon) · Ask (soon) · Outreach (soon)`; "(soon)" rendered as a small mono chip in muted ink via the `.nav-soon__chip` class. Dashboard ask-tile caption now links to `pages/ask.html`. `tests/tests.html` page-reachable list extended; harness still 21/21 green.
- [~] **Phase 6 — Verification + polish** *(partial — Chromium blocked in this sandbox)*:
    - [x] Orphan CSS from Phase 3 cleaned up (old `.bento-hero`, `.bento-shortlist`, `.bento-chart`, `.bento-about`, `.bento-filters`, `.bento-journey`, `.hero-ring`, `.ring-*`, `.hero-stats`, `.hero-eta`, `.step-strip`, `.step-*`, `.filters-grid`, `.bento-cell` removed; `.cell-foot` promoted to top-level). Saves ~150 lines from `dashboard.css`.
    - [x] `README.md` updated with v2 feature summary + intelligence engine pointer.
    - [x] Final `npm test` run — 21/21 green.
    - [x] Static smoke — every page (10 core + 3 placeholders + tests/tests.html) returns 200.
    - Screenshot / axe / Lighthouse acceptance dropped (see CLAUDE.md §13). Visual review is done by eye
      in the browser by the developer. Release tags still need explicit user authorisation.

### Phase 6 follow-up tasks (not blocking v2 tag)
- [ ] Compare drawer on the Areas page (deferred from Phase 4b): multi-select 2–4 areas → bottom drawer slides up with side-by-side mono columns.

---

## v3.0 — Outreach generator

- [x] **Phase 1** — Data: 24-template registry (`data/outreach-templates.json`), contacts seed (`data/contacts.json`), JSON schema (`data/schema/outreach-template.schema.json`), `validateOutreachTemplate()` in `tests/schemas.js`, `tests/outreach-templates.test.js`. 51/51 green.
- [x] **Phase 2** — JS: pure renderer (`assets/js/outreach-renderer.js`), storage extension (`assets/js/outreach-store.js`), four approved exports appended to `assets/js/storage.js`, Supabase `contacts` + `outreach` tables in `supabase/schema.sql`. 63/63 green.
- [x] **Phase 3** — Page shell: `pages/outreach.html` full rewrite (Linear-dense), `assets/css/components/outreach.css`, `assets/js/page-outreach.js` (filter chips, template grid, generate dialog, contacts CRUD, outreach log), nav `soon` chip removed. 63/63 green.
- [x] **Phase 4** — QoI ladder: `filterContextByDataNeeded()` enforces per-template data access; two new sentinel tests confirm salary never leaks into estate-agent templates. 65/65 green.
- [x] **Phase 5** — Contacts management: shipped in Phase 3 (agents / brokers / solicitors / surveyors CRUD with add/delete, persists via `storage.js`).
- [x] **Phase 6** — Cross-linking: area-detail verdict strip → A1, finances affordability widget → A5, journey checklist rows → 7 templates (A5, C3, B1, C5, C2, D1, D5, D6, D7). Deep-link parser in `page-outreach.js` reads `?templateId=`.
- [x] **Phase 7** — Docs: `docs/ROADMAP.md` Outreach moved to "Shipped in v3.0"; `docs/CHECKLIST.md` updated; `README.md` storage-keys table updated.

---

## Phase 10 — Supabase MCP sync hardening (May 2026 →)

Adopted 2026-05-25. Codifies the bidirectional sync contract in `CLAUDE.md §18` + `docs/SUPABASE_SYNC.md`.
Goal: every write (Claude or portal) lands in Supabase; every session starts by checking what changed
since last time. No silent drift.

### 10A · Schema additions (one MCP migration each)
- [x] `areas` mirror table — one row per area, `id` PK, `data` jsonb, `updated_at` timestamptz.
      No RLS (read-only content). Applied via `mcp__supabase__apply_migration`.
- [x] `house_types` mirror table — same shape, keyed by house-type id.
- [x] `sync_log` table — append-only audit (`table_name`, `actor`, `row_id`, `action`, `at`).
- [x] Updated `supabase/schema.sql` to reflect live schema.

### 10B · Tooling
- [x] `tools/check-supabase-freshness.mjs` — session-start freshness check; prints the SQL snippet Claude should run via MCP to detect changes since last session.
- [x] `tools/sync-content-to-supabase.mjs` — reads repo JSON, generates UPSERT SQL, writes 21 batches to `.tmp/sync-*.sql` for Claude to execute via MCP.
- [x] `data/snapshots/sync-state.json` — committed snapshot of `updated_at` per table.

### 10C · Content backfill (one-time bootstrap via Node script)
- [x] `tools/backfill-content-direct.mjs` — self-contained Node script using PostgREST + service role key. Idempotent, ~10 seconds to run.
- [x] Schema verified clean (areas/house_types/sync_log tables empty, ready for backfill).
- [ ] **USER ACTION**: Run once with service role key:
      ```bash
      # 1. Get service role key from Supabase dashboard
      # 2. Set env var:
      export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
      # 3. Run the backfill:
      node tools/backfill-content-direct.mjs
      ```
- [ ] After backfill: 195 areas + 15 house types in Supabase, snapshot updated.

**Why a script instead of 39 MCP calls?** A Node script using PostgREST is the standard
Supabase backfill pattern: faster (~10s vs minutes of MCP turns), simpler (one command),
and idempotent (safe to re-run). Day-to-day single-area edits still flow through Claude's
MCP connector — this is just the one-time bootstrap.

### 10D · Test enforcement
- [x] `tests/supabase-sync.test.js` — offline checks: snapshot validity, repo structure, SQL batch generation. Online checks (pending backfill): row counts.
- [x] Wired into `tools/run-intelligence-tests.mjs`. Now 74/74 tests pass (65 intelligence + 9 sync).

### 10E · CLAUDE.md / docs
- [x] §18 + §6 + §8 updated for MCP-first sync contract.
- [x] `docs/SUPABASE_SYNC.md` created with detailed bidirectional sync protocol.
- [x] `README.md` — added "Supabase MCP sync contract" section.
- [x] `supabase/schema.sql` — updated to document the new tables + triggers.

### 10F · Verification (after user runs backfill)
- [ ] Run `node tools/run-intelligence-tests.mjs` — should report 195 areas + 15 house types.
- [ ] Verify via MCP: `SELECT COUNT(*) FROM areas` returns 195, `SELECT COUNT(*) FROM house_types` returns 15.

**Out of scope for Phase 10**: realtime subscriptions, storage buckets, edge functions, auth flow
changes, Storage.js logging (10D deferred — needs separate phase per §16). Those get their own phases.

---

## Overhaul — Data integrity + information architecture (May 2026)

Adopted 2026-05-28. Branch: `claude/peaceful-goldberg-gIEgT`. Two tracks:
**A (data integrity)** lands first; **B (IA)** depends on every page already reading one canonical number.
All tests 189/189 green before each push.

### Track A — Single source of truth

- [x] **A1 — Conflicting monetary targets resolved** (`db58be7`):
  - `finances.goal.targetDeposit = £40,000` is the single canonical deposit target.
  - `finances.goal.offerTarget = £380,000` is the single canonical offer price (removed from `criteria.budget`).
  - `finances.goal.targetPropertyPrice = £400,000` retained as upper budget anchor.
  - DB updated via MCP UPSERT (finances + goals + criteria rows); fixtures updated (`finances.sample.json`, `goals.sample.json`); `sync-state.json` high-water marks updated.
- [x] **A2 — Hardcoded personal-value fallbacks removed** (`db58be7`):
  - All `?? 50_000`, `?? 2000`, `?? 380000`, `?? 375_000` replaced with canonical DB reads or `?? 0` with "not set" UI guards.
  - Files: `affordability.js`, `tile-affordability.js`, `section-later.js`, `section-v3-charts.js`, `section-deposit-risk.js`, `page-area-detail.js`, `pages/finances.html`, `pages/area-detail.html`.
- [x] **A3 — tile-readiness.js reads `readiness_checklist` table** (`db58be7`):
  - Full rewrite of `assets/js/dashboard/tile-readiness.js` to call `getReadinessChecklist()` (row-per-item) instead of `goals.readiness.checklist` blob. `goals.readiness` blob retired (marked `_deprecated: true` in DB and fixtures).
- [x] **A4 — CLAUDE.md §18.1 documents all 20 live tables** (`db58be7`):
  - Expanded from 8-table list to full 20-table inventory with correct class, source-of-truth, and sync-direction for every table.
- [x] **Test guard** (`db58be7`): `tests/affordability-scenarios.test.js` updated for new canonical values (hopedFor=£40k, currentSavings=£32,994.45, monthsToReady=4). 189/189 green.

### Track B — Information architecture

- [x] **B0 — Nav reorganised into buyer-journey pillars** (`db58be7`):
  - Order: Home | Finances | Investments | Areas | Map | House Types | About | Checklists | Outreach | Listings(soon) | Ask(soon) | Data sync | Debug
- [x] **B1 — Dashboard tiles into 5 labelled bands** (`8e45344`):
  - Four `<h2 class="band-label">` headings: Goal progress · Affordability · Search · Next steps.
  - Every tile group has a "see full →" link to the relevant detail page.
  - `.band-label` CSS rule added to `assets/css/dashboard/base.css`.
- [x] **B2 — Investments split from Finances** (`8e45344`):
  - New `pages/investments.html` with all 8 investment chart sections (savings-over-time, monthly-deposits, ISA attribution, ISA stacked-area, dividends+interest, epoch comparison, ticker treemap, realised/unrealised P&L).
  - New `assets/js/page-investments.js` coordinator.
  - `pages/finances.html` trimmed to deposit+affordability+costs; replaced investment block with "How are my investments doing? →" cross-link.
  - `assets/js/page-finances.js` cleaned of investment imports.
  - Nav: Investments activated (removed `nav-soon`).
- [x] **B5 — Cross-link pass** (this commit):
  - `pages/area-detail.html`: footer with "← Back to areas" + "Request a viewing →" (outreach A1).
  - `pages/about-search.html`: "Browse matching areas →" before the save bar.
  - `pages/journey.html`: "Email your affordability to a broker →" (outreach A5).
  - `pages/house-types.html`: "Browse areas →" footer link.

### Pending (separate phases)

- [ ] **B3 — About you consolidation**: migrate debt data from profile blob into `debts_credit_cards`, `debts_student_loans`, `debts_other` tables via MCP UPSERT; extend `tests/supabase-sync.test.js` to assert debts live in `debts_*` tables.
- [ ] **B4 — Shortlist single source**: `getShortlist()` path currently localStorage-first; making it Supabase-first touches `storage.js` (§16 guard — separate named phase required).
- [ ] **A4 remaining**: update `pages/data-sync.html` + `page-data-sync.js` to cover all 20 live tables; extend `tests/supabase-sync.test.js` to cover newly documented user-state tables (goals, investments_*, debts_*, readiness_checklist).
