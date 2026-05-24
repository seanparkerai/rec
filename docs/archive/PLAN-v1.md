# Plan: "Rec" — First-Time Buyer Property Search Dashboard (Hampshire & Wiltshire)

## Context — why we're building this

You are a first-time property buyer searching in and around **Hampshire and Wiltshire, UK**. Today the
information you need is scattered: search criteria in your head, savings in a banking app, area research
across Rightmove/Zoopla/Google, property types you half-recognise, and no single place that ties it
together. This project creates a **clean, modern, single-source web dashboard** that holds:

- Your **profile** — who's buying, how you want to live, and what you're looking for.
- Your **search criteria** — must-haves vs nice-to-haves, property types, sizes, desires.
- An **areas directory** — a master list of towns/villages with rich, AI-written, research-backed profiles
  (character, amenities, schools, commute, prices, things to do, places to eat, pros/cons), plus imagery.
- A **house-types** section — the property styles characteristic of each area, with accurate, area-specific
  images and explanations.
- **Finances** — savings tracking with progress graphs, a deposit goal, SDLT/LISA/cost calculators.
- An **interactive map** (built progressively) — area markers and hand-drawn search zones.

**Now:** a zero-build static web app (HTML/CSS/JS) that lives in your GitHub repo and stores all content
inline as editable JSON + pages. **Later:** the same app behind a login on a real web server. We design the
storage layer so that future migration is a swap, not a rewrite.

This file is the master plan. Because we are currently in **plan mode**, no project files have been created
yet — every file below is created in **Phase 0** the moment this plan is approved. The plan fully specifies
each one so execution is mechanical and resumable.

---

## Confirmed decisions

1. **Branch workflow** — **commit & push directly to `main`** (no sub-branches). The session's feature
   branch is set aside per your instruction.
2. **Hosting/preview** — **enable GitHub Pages** (deploy from `main`), plus a documented local preview
   command for fast iteration.
3. **First build priority** — after the full app shell, make **Areas (directory + profiles)** and a
   **Profile about me** the first fully-working pillars. **You will supply comprehensive area lists and
   resource information on request** — so Phases 2–3 begin by asking you for those, then I incorporate what
   you give me and supplement with researched content. Finances and Map follow.
4. **Imagery strategy** — **licence-safe images downloaded and stored in the repo** (Wikimedia Commons,
   Geograph CC, Unsplash, official tourism), with `credit` + `licence` recorded for every image.

---

## What I'll need from you (supply checkpoints)

You feed the real content at clear points. I'll prompt you each time, and proceed with sensible
placeholders if you'd rather supply later:
- **Before Phase 2 (Profile/Criteria):** who's buying (you / couple / family), budget & target deposit,
  must-haves vs nice-to-haves, how you want to live, deal-breakers, any notes.
- **Before Phase 3 (Areas):** your comprehensive list of target towns/villages and any resources you've
  gathered (links, notes, saved searches, areas to avoid). Your list leads; I supplement with research.
- **Before Phase 5 (Finances):** savings to date, monthly contributions, LISA balance, target date.
- **Anytime:** a logo / brand colour if you have one, and any photos you own and want to use.
- **End of Phase 1 — design review checkpoint:** you view the live shell and we tweak appearance before
  any content goes in.

## Design & appearance (confirmed via design Q&A)

- **Layout:** **top navigation bar + card-based content** sections; responsive, collapsing to a mobile menu.
- **Theme:** **auto light/dark** following system preference with a **manual toggle** persisted in
  `localStorage`; neutral base + a single **accent** colour, all defined as design tokens in `tokens.css`.
- **Information architecture — 7 top-nav pages:** Home (dashboard) · Profile · Criteria · Areas ·
  House Types · Finances · Map.
- **Visual depth: balanced** — meaningful charts/galleries where they earn their place, kept fast:
  - *Home:* snapshot stat tiles (deposit progress %, saved-to-date, # shortlisted areas), a savings
    sparkline, recently-viewed areas, a small map preview.
  - *Finances:* savings-progress line chart + cost-breakdown chart (Chart.js).
  - *Areas:* directory cards each with a photo; detail pages with an image gallery + key-facts tiles.
  - *House Types:* image-gallery cards.
  - *Map:* full Leaflet map with area markers + drawn search zones.
- **Polish:** one reusable card component, accessible (keyboard + contrast), mobile-first responsive.

## Tech stack (research-backed, all CDN, zero build)

| Concern | Choice | Notes |
|---|---|---|
| Page structure | Plain multi-page HTML + **fetch-and-inject partials** | Shared header/nav/footer loaded by `components.js`; each page stays plain HTML. No build step. |
| Styling | **Pico CSS** (CDN) + custom design tokens | ~10KB, semantic, dark-mode, fully themeable via CSS custom properties. |
| Charts | **Chart.js** (CDN) | Savings progress lines/bars; lightweight, well-documented. |
| Maps | **Leaflet + Leaflet-Geoman (free)** (CDN) | Geoman is actively maintained (Leaflet.draw is not); polygon draw/edit; **OpenStreetMap** tiles (respect usage policy). |
| Data | **JSON files in repo + `localStorage`**, behind a `storage.js` abstraction | Git-tracked content as JSON; user edits persist client-side; future backend swaps one module. |
| Validation/Tests | **`tests.html`** harness + a tiny assertion helper + JSON **schema checks** | No npm/build. Schema drift, broken-link, and calculator-correctness benchmarks. |

---

## Repository structure (created in Phase 0 / Phase 1)

```
/
├── index.html                     # Dashboard home (snapshot: savings, shortlist, recent areas)
├── pages/
│   ├── profile.html               # About us / how we want to live
│   ├── criteria.html              # Search criteria: must-haves vs nice-to-haves
│   ├── areas.html                 # Areas directory (search/filter, cards)
│   ├── area-detail.html           # Single area profile (rendered by ?id=)
│   ├── house-types.html           # House-type gallery
│   ├── finances.html              # Savings tracker + calculators + charts
│   └── map.html                   # Interactive map (markers + drawn zones)
├── components/
│   ├── header.html                # Shared top bar
│   ├── nav.html                   # Shared navigation
│   └── footer.html                # Shared footer
├── assets/
│   ├── css/
│   │   ├── tokens.css             # Design tokens (colors, spacing, type) via CSS custom props
│   │   ├── base.css               # Pico overrides + global layout
│   │   └── dashboard.css          # Dashboard grid / component styles
│   ├── js/
│   │   ├── components.js          # Fetch + mount shared partials, highlight active nav
│   │   ├── storage.js             # Storage abstraction (localStorage now → backend later)
│   │   ├── data-loader.js         # Loads /data/*.json with caching + error handling
│   │   ├── charts.js              # Chart.js setup helpers
│   │   ├── finances.js            # SDLT / LISA / cost calculators (pure, testable fns)
│   │   ├── areas.js               # Areas directory + detail rendering
│   │   └── map.js                 # Leaflet + Geoman setup, save/load drawn zones
│   └── img/
│       ├── areas/                 # Area photos (per chosen imagery strategy)
│       └── house-types/           # House-type photos
├── data/
│   ├── profile.json               # User profile (template → your details)
│   ├── criteria.json              # Search criteria
│   ├── areas.json                 # Master area list + profiles
│   ├── house-types.json           # House-type definitions per region
│   └── finances.json              # Deposit goal, contributions history, settings
├── tests/
│   ├── tests.html                 # Browser test runner
│   ├── assert.js                  # Tiny assertion + reporting helper
│   └── schemas.js                 # JSON shape validators for each data file
├── tools/
│   └── insert-content.mjs         # Script to splice large content blocks into files (see rules)
├── docs/
│   ├── PLAN.md                    # Full development plan (mirror of this, repo-resident)
│   ├── CONTEXT.md                 # Research context: UK buying, tech, region (the "context file")
│   ├── CHECKLIST.md               # Granular progress checklist (ticked + committed continuously)
│   ├── AREAS.md                   # Human-readable master area list (the "area list file")
│   └── USER_PROFILE.md            # Narrative user profile (the "user profile file")
├── .github/workflows/pages.yml    # GitHub Pages deploy from main
├── .nojekyll                      # Serve files as-is (no Jekyll processing)
├── CLAUDE.md                      # Operating rules for Claude (governance)
├── .gitignore
└── README.md                      # What this is + how to run/preview
```

> **GitHub Pages:** the workflow deploys the site root on every push to `main`. This needs a **one-time
> toggle** by you in the repo: *Settings → Pages → Source: GitHub Actions*. I'll flag this in Phase 1 and
> in the README. Live URL will be `https://lukeclifforduk.github.io/rec/`.

---

## The governance files (created first, in Phase 0)

### `CLAUDE.md` — operating rules (your stated rules, codified)
1. **Branch discipline** — work and commit **directly to `main`**; do not spin up sub-feature branches.
   **Commit + push after every major step.**
2. **Large content writes** — when adding a large block of content to an already-large file, **write the
   block to a separate temp file first**, then run `tools/insert-content.mjs` to splice it in. Never paste
   huge inline edits into big files.
3. **Reading large files** — read in **chunks of ≤200 lines**.
4. **Start-of-cycle scan** — at the start of any work session, dispatch **Haiku-model Explore scans** to
   summarise current repo/file state before editing (cheap, fast context-gathering).
5. **Checklist discipline** — keep `docs/CHECKLIST.md` in lockstep with `docs/PLAN.md`; tick items and
   commit after major work so any new chat can resume cleanly.
6. **Testing** — keep `tests/` current; run the test harness after changes and before committing to catch
   regressions (benchmark comparisons for calculators + data schemas).
7. **Content accuracy** — when writing area/house content, perform **detailed, area-specific web searches**
   (exact place + exact property type); cite sources; use only **licence-safe images** with attribution
   recorded (per decision #4).
8. **Resume protocol** — to pick up work: read `docs/CHECKLIST.md`, then `docs/PLAN.md`, then
   `docs/CONTEXT.md`, run a Haiku scan, run tests, continue at the first unchecked item.

### `docs/CONTEXT.md` — the research context file
Distilled, sourced research from this planning session, in three parts:
- **UK first-time buyer**: end-to-end process; deposit/LTV; mortgage types & MIP; **SDLT 2025/26**
  (FTB relief £0 to £300k, 5% £300k–£500k, threshold dropped to £500k from Apr 2025); **LISA** (£4k/yr,
  25% bonus, ≤£450k cap); conveyancing/survey/valuation/removal cost ranges; must-have vs nice-to-have
  criteria; **free data sources** (Land Registry price-paid, EPC register, police.uk, GOV.UK flood,
  Ofcom broadband, Ofsted).
- **Tech**: the stack table above with CDN snippets and the storage-abstraction rationale.
- **Region**: Hampshire & Wiltshire sub-regions, characteristic house types, the 9-category area-profile
  framework, and reputable content/imagery sources.

### `docs/CHECKLIST.md` — granular progress tracker
Every step from the phase plan below as a checkbox, grouped by phase, ticked as completed and committed.

### `docs/AREAS.md` — master area list
Human-readable master list of towns/villages by county → sub-region (seed below), each with a `status`
(profile not-started / drafted / complete). Mirrors `data/areas.json`.

### `docs/USER_PROFILE.md` — narrative profile
Your story in prose: who's buying, lifestyle, priorities, deal-breakers — the human version of
`data/profile.json`.

---

## Data model (shapes of the JSON files)

- **`profile.json`** — `{ buyers, household, lifestyle, priorities, dealBreakers, locationFocus, notes }`.
- **`criteria.json`** — `{ mustHaves[], niceToHaves[], propertyTypes[], size:{minBeds,minBaths,minSqm},
  budget:{min,max,targetDeposit}, tenurePref, outsideSpace, parking, epcMin, ... }`.
- **`areas.json`** — array of `{ id, name, county, subRegion, coords:{lat,lng}, overview, character,
  amenities, schools, transport:{commutes[]}, prices:{...}, thingsToDo[], placesToEat[], pros[], cons[],
  whoItSuits[], houseTypeIds[], images:[{src,credit,licence}], sources[] }`.
- **`house-types.json`** — array of `{ id, name, era, description, regionsCommon[], features[],
  images:[{src,credit,licence}] }` (e.g., thatched cob, flint-and-brick, Georgian townhouse, 1930s semi,
  Victorian terrace, New Forest cottage, garrison/SFA housing, new-build estate).
- **`finances.json`** — `{ goal:{targetDeposit,targetPrice,depositPct,targetDate},
  contributions:[{date,amount,source}], lisa:{contribYTD,bonusYTD}, settings }`.

Calculators in `finances.js` (pure functions, unit-tested): SDLT (FTB rules), LISA bonus, LTV, deposit
progress %, projected completion date, total purchase-cost estimate.

---

## Phased, granular build plan (becomes `docs/CHECKLIST.md`)

> Each phase ends with: run tests → tick checklist → **commit + push**. Phases are ordered for safe,
> resumable progress; content phases (3,4) are produced in **small committed batches**.

### Phase 0 — Foundation & governance
- [ ] Create `CLAUDE.md` (rules above), `.gitignore`, expand `README.md`.
- [ ] Create `docs/PLAN.md`, `docs/CONTEXT.md`, `docs/CHECKLIST.md`, `docs/AREAS.md`, `docs/USER_PROFILE.md`.
- [ ] Add `tools/insert-content.mjs` (large-content splice helper).
- [ ] Commit + push.

### Phase 1 — App skeleton & shared shell
- [ ] Folder structure; `assets/css/{tokens,base,dashboard}.css` (Pico CDN + tokens).
- [ ] `components/{header,nav,footer}.html` + `assets/js/components.js` (fetch-inject, active-nav).
- [ ] `assets/js/storage.js` (abstraction) + `assets/js/data-loader.js`.
- [ ] `index.html` dashboard shell (top-nav, empty cards/sections wired to data-loader).
- [ ] Light/dark **theme toggle** (system default + manual override persisted in `localStorage`).
- [ ] `tests/{tests.html,assert.js,schemas.js}` with first smoke tests (pages 200, partials mount).
- [ ] `.github/workflows/pages.yml` + `.nojekyll`; README documents local preview **and** the one-time
      *Settings → Pages → GitHub Actions* toggle.
- [ ] Commit + push, then confirm the live Pages URL renders the shell.
- [ ] **Design review checkpoint** — review the live shell with you; adjust tokens / layout / accent before
      any content goes in.

### Phase 2 — Profile & criteria *(first priority pillar)*
- [ ] **Request from you** your profile details + search criteria (who's buying, lifestyle, budget,
      must-haves vs nice-to-haves) and any resources you've gathered; incorporate them.
- [ ] `data/profile.json` + `data/criteria.json` (templates, pre-filled from what you provide).
- [ ] `pages/profile.html`, `pages/criteria.html` with editable forms persisting via `storage.js`.
- [ ] `docs/USER_PROFILE.md` narrative.
- [ ] Tests: schema valid + persistence round-trip. Commit + push.

### Phase 3 — Areas directory & profiles (batched) *(first priority pillar)*
- [ ] **Request from you** your comprehensive area lists + resource information; merge with the seed list
      below (your areas take priority, researched areas supplement).
- [ ] Seed `data/areas.json` + `docs/AREAS.md` master list (county → sub-region; seed below).
- [ ] `pages/areas.html` directory (search/filter/sort, county tabs, cards).
- [ ] `pages/area-detail.html` template (renders by `?id=`, 9-category framework).
- [ ] For each batch of areas: detailed area-specific searches → write profile content via temp file +
      `insert-content.mjs` → add licence-safe images → tests → **commit + push per batch**.

### Phase 4 — House-types gallery (batched)
- [ ] Seed `data/house-types.json` from regional research.
- [ ] `pages/house-types.html` gallery; cross-link types ↔ areas.
- [ ] Per type: specific imagery + accurate description (temp file + splice) → tests → commit + push.

### Phase 5 — Finances & savings tracker
- [ ] `data/finances.json` template; `assets/js/finances.js` calculators (pure, tested).
- [ ] `pages/finances.html`: savings progress chart (Chart.js), deposit goal, SDLT/LISA/cost tools.
- [ ] Tests: calculator benchmarks (known inputs → known outputs). Commit + push.

### Phase 6 — Interactive map
- [ ] `pages/map.html` + `assets/js/map.js`: Leaflet + Geoman, OSM tiles, area markers from `areas.json`,
      draw/save/load search zones (GeoJSON in `localStorage`).
- [ ] Tests: markers render, draw round-trips. Commit + push.

### Phase 7 — Dashboard polish & future-proofing
- [ ] `index.html` aggregates: savings snapshot, shortlist, recently viewed areas, map preview.
- [ ] Responsive, accessibility, dark mode pass; document the storage→backend/login migration path.
- [ ] Full regression run of `tests.html`. Commit + push.

---

## Seed area list (expanded during Phase 3)

**Hampshire** — *Winchester & Downs*: Winchester, Alresford, Cheriton, Colden Common · *Test Valley*:
Andover, Romsey, Stockbridge, Whitchurch · *East Hants*: Petersfield, Alton, Chawton · *New Forest*:
Lyndhurst, Brockenhurst, Lymington, Beaulieu, Sway, Milford-on-Sea · *South Coast*: Fareham, Emsworth ·
*North/urban*: Basingstoke, Eastleigh, Chandler's Ford.

**Wiltshire** — *Salisbury & south*: Salisbury, Wilton, Tisbury, Mere, Broad Chalke · *Plain/centre*:
Amesbury, Tidworth, Bulford, Ludgershall, Larkhill · *Marlborough Downs/Pewsey*: Marlborough, Pewsey,
Aldbourne, Avebury · *West/NW*: Chippenham, Trowbridge, Westbury, Melksham, Calne, Corsham · *North*:
Cricklade, Royal Wootton Bassett.

**Border belt** — Andover ↔ Tidworth ↔ Amesbury triangle (dual-county commuter zone).

**Characteristic house types** — thatched cob & flint-and-brick (rural chalkland), Georgian townhouses
(Salisbury, Marlborough, Winchester), Victorian/Edwardian terraces, 1930s semis, post-war & new-build
estates, New Forest cottages, garrison/Service Family Accommodation (Tidworth/Bulford/Ludgershall).

---

## Testing & regression strategy
- `tests/tests.html` run in the browser shows pass/fail; run after each change, before each commit.
- **Schema tests** (`schemas.js`): every `data/*.json` matches its expected shape (catches content drift).
- **Calculator benchmarks**: SDLT/LISA/LTV/progress functions checked against known fixed cases.
- **Smoke/link tests**: each page returns 200 and shared partials mount.
- Tests are extended as each phase adds features, so regressions surface immediately.

## Content & imagery rules (accuracy first)
- Area & house content is written only after **detailed, place-specific and type-specific web searches**;
  sources cited in each record's `sources[]`.
- Images: **download only openly-licensed images** (Wikimedia Commons, Geograph CC, Unsplash, official
  tourism) into `assets/img/{areas,house-types}/`, recording `credit` + `licence` per image in the JSON.
  No unattributed hotlinking of copyrighted search-engine results.

## Verification (how we'll know it works)
- **Preview**: serve over HTTP (GitHub Pages URL or `python3 -m http.server`) and click through every page;
  shared shell loads, nav highlights, data renders.
- **Tests**: open `tests/tests.html` — all green; calculators match benchmark fixtures.
- **Persistence**: edit profile/criteria/finances → reload → values persist (localStorage).
- **Charts/Map**: savings chart renders from `finances.json`; map shows markers and a drawn zone survives
  reload.
- **Resumability**: a fresh chat can read `docs/CHECKLIST.md` + `docs/PLAN.md` + `docs/CONTEXT.md` and
  continue at the first unticked item.

---

## Phase 9 — Finalisation (May 2026 →)

Confirmed via 25-question scope review with the user. Move-in target **<6 months**, single buyer,
ship straight to `main`, do everything possible without external help. Network policy of the current
managed sandbox **blocks** every research / imagery / tile source we'd need (Nominatim, postcodes.io,
Wikimedia, Geograph, Ofcom, OS, Fontsource). Phase 9 is therefore split into **on-sandbox** front-end /
IA work (do now) and **needs-network** content / geocoding work (queued behind one-command tools so a
host session with outbound HTTPS finishes it in minutes).

Each milestone is one commit + push. Anchor named in commit (Stripe-docs / Linear-dense).

### 9A · Information architecture (on-sandbox)
- [ ] **Merge Profile + Criteria → `pages/about-search.html`** (anchor: Stripe-docs). Single editorial
      "About my search" page: Buyer / Lifestyle / Priorities & Deal-breakers / Search criteria
      (budget, types, must-haves, nice-to-haves). Old `profile.html` and `criteria.html` redirect via
      `<meta http-equiv="refresh" content="0;url=about-search.html#…">` so existing bookmarks survive.
      Nav `Profile · Criteria` → single `About`.
- [ ] **Dashboard reorganisation** (anchor: Linear-dense, hybrid magazine + bento). Lead-in editorial
      banner (Fraunces, current criteria summary + moving window) + bento below that aggregates from
      every page: deposit ring, savings projection, shortlist top 6, journey progress, next-step nudge
      derived from checklist state, mini-map preview with shortlisted markers.
- [ ] **Finances kept as one page**, but rearranged into "Now vs Later" sections (current savings /
      one-time costs / post-move bills) for clearer scan.
- [ ] **Journey checklists stay global** (per user). Add per-section "what unlocks next" hint.

### 9B · Areas page improvements (on-sandbox)
- [ ] **URL-driven filter state** on `pages/areas.html` (A6): query params for
      `q` `county` `sub` `sort` `starred`; `history.replaceState` on change; restore on load.
      Result: every filter combination has a shareable URL.
- [ ] **`<dialog>` full-filter sheet on mobile** with backdrop-blur, sticky apply/clear.
- [ ] **Sticky anchored TOC on `area-detail.html`** (A4): left rail ≥1024 px, sticky chip row
      <1024 px (scroll-snap-x). Jump to Overview / Amenities / Schools / Transport / Prices / Things to
      do / Places to eat / Pros & Cons / Who it suits.
- [ ] **Animated active-link nav indicator** (A5): CSS underline that morphs via View Transition on
      cross-document navigation.

### 9C · Schema additions (on-sandbox; values populated by 9F)
- [ ] Extend `areas.json` schema with `councilTaxBand`, `broadbandMedianMbps`, `nearestStation`,
      `primarySupermarket` (string + miles). Schema validator updated in `tests/schemas.js`. UI on
      `area-detail.html` renders only when populated (no empty rows).
- [ ] **House types expanded 8 → 15** (per user): add modern eco-build, Grade II listed cottage, barn
      conversion, chalk-cob, Edwardian villa, post-war semi, mid-century bungalow. Names + eras only;
      `description: ""` with `status: "draft-no-sources"` so CLAUDE.md §7 isn't violated. Filled in
      by 9F on a connected host.

### 9D · CSS component split & polish (on-sandbox)
- [ ] Extract `base.css` + `dashboard.css` into `assets/css/components/{card,tile,sheet,chip,segmented,table,field,dialog}.css`.
- [ ] Container queries (`container-type: inline-size`) on `.card` and the map sidebar so they reflow
      at component-width, not page-width.

### 9E · On-sandbox housekeeping
- [ ] Update `tests/schemas.js` for the new village fields.
- [ ] Update `README.md` localStorage section with `rec:areas-filter` (URL-driven state cache).
- [ ] Run `tests/tests.html` (open in browser) — all green before push of each milestone.

### 9F · Needs-network (queued; run from a connected host) — ⚠ blocked here
- [ ] `tools/geocode-areas.mjs` — already shipped. Run once on a connected host:
      `node tools/geocode-areas.mjs --provider nominatim`. Caches to
      `data/source/geocode-cache.json`; writes precise coords back to `data/areas.json`. 191/191.
- [ ] `tools/research-areas.mjs` — **needs writing** (sketched in 9F.notes below). For each village:
      fetch Wikipedia summary (CC BY-SA 3.0 with attribution), Geograph featured image (CC BY-SA 2.0),
      Land Registry price-paid median, Ofcom broadband median, nearest station from National Rail
      open data. Writes `overview`, `character`, `amenities`, `prices`, `transport.commutes`,
      `images[]`, `sources[]` per village. **3 sources minimum for "directory" tier; 5 for top-N
      (user supplies top-N list at run time).**
- [ ] `tools/fetch-images.mjs` — **needs writing**. CSV input (`data/source/images.csv` with
      `area-id,url,credit,licence`) → downloads to `assets/img/areas/<id>/<n>.{webp,jpg}`, writes
      back `images[]` entries with `credit` + `licence`. 2–3 per village (per user).
- [ ] `tools/research-house-types.mjs` — **needs writing**. For each of the 15 house types: era,
      materials, regional incidence, what-to-look-out-for, indicative price range. Cited.
- [ ] `npm install && npx playwright install chromium` then `npm run verify` for the 36-shot
      baseline grid + axe-core CLI + lighthouse-ci (looser thresholds per user: warn-only).

### 9F.notes — research tool design (for the host session)
- One file per source so the orchestrator can resume if any one fails.
- Polite-rate (1 req/sec per host), retry with backoff, cache every fetch under
  `data/source/cache/<source>/<key>.json`.
- Outputs always include `sources[]` with `{title,url,licence,retrievedAt}` — non-negotiable.
- Never overwrites a human-edited field: respects `_locked: true` per record.

### 9G · Out of scope (decided in 25Q review)
- `examples/properties.json` for Rightmove/Zoopla shortlist — **no**.
- School-catchment data — **no**.
- Commute-time matrix — **no**.
- Newsreader display-font trial — **no** (stay on Fraunces).
- MapLibre engine swap (Bucket A2) — **deferred** beyond Phase 9.
- Accent hue change — **no** (keep emerald).

### Acceptance gate for Phase 9
- 390 px viewport screenshot review on each shipped page (manual where Playwright is unavailable).
- No fabricated content, no unattributed imagery — CLAUDE.md §7 strictly held.
- `tests/tests.html` all green at every push.
- Every commit names its anchor (Stripe-docs / Linear-dense) in the message.
