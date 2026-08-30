# CHECKLIST — live progress tracker

Tick items as completed and **commit**. To resume in a fresh chat: read this file, then
`docs/CONTEXT.md`, run `node tools/area-status.mjs`, run tests, continue at the first unchecked box.
Completed phases are archived verbatim at `docs/archive/CHECKLIST-archive-2026-06.md`; shipped
plans live in `docs/archive/` (index: `docs/README.md`).

**Status:** the app is feature-complete through v3 live listings and the Model Refinement Engine
(Stages 1–9 shipped 2026-06-05 — operate it via `docs/REFINEMENT_README.md`). Supabase is the live
backend (auth + the tracked tables per `docs/SUPABASE_SYNC.md` §0, all RLS-enabled). Pages
(re-baselined 2026-07-03, 10.6): Home (`index.html`) + Profile, Areas (+ detail incl. the map),
Journey, Finances, Listings, Saved, Rejected, Property dossier, Refinement, Ask, Login — the old
Map / Outreach / House-types / Data-sync / Setup pages were folded into these surfaces or retired
during the 2026-06/07 overhaul (outreach now lives in Ask Compose; setup in the profile).

**Area research:** the live queue and per-status counts come from `node tools/area-status.mjs`
(`--missing` to filter, `--id <area-id>` to inspect one) — counts are never hardcoded here.
Remaining content work is researching the outstanding areas per CLAUDE.md §7 — web-cited,
place-specific content + licence-safe imagery. **Do not auto-generate** this content.

**Design baseline:** CLAUDE.md §9–§13 + `DESIGN.md` are in force — tokens
(`--space-*` / `--text-*` / `--focus-ring`), global `prefers-reduced-motion` + `:focus-visible`,
≥44 px touch targets, skip-link + `id="main"`, safe-area insets, no-horizontal-scroll smoke tests.

---

## Open items

### Content (needs web research per CLAUDE.md §7)
- [x] Area research batches **COMPLETE (2026-07-02, fable-overhaul 6.5/6.6)** — all 196 areas are
      `researched` with zero missing content fields (`area-status --missing` is empty). Written
      DB-first per §18.5, web-cited per §7. Area **imagery** (`images[]`) remains queued below with
      the house-type imagery work.
- [ ] House-type content + imagery batches (15 types, several still `draft-no-sources`):
      research → splice → licence-safe images → sources → tests → commit per batch.

### Needs-network (queued — run from a connected host; the sandbox blocks these hosts)
- [ ] `node tools/geocode-areas.mjs` → precise per-village coords (currently outward-centroid
      approximations, flagged "(approx.)" on the map).
- [ ] `tools/research-areas.mjs` (to write): 9-category content, 3-source minimum / 5 for top-N.
- [ ] `tools/fetch-images.mjs` (to write): 2–3 licensed images per village + credit/licence
      write-back.
- [ ] `tools/research-house-types.mjs` (to write): 15 house types fully described + cited.

### Refinement engine
- [x] **Overhaul: calibration + expansion + cadence (2026-06-19)** — rebased `MIN_LIFT` to the
      genuine-baseline headroom (Cautious 1.20 / Balanced 1.10 / Aggressive 1.05) so suggestions can
      actually become actionable; added the sensitivity nudge; expanded the engine to
      `price_band/beds/outdoor/parking/outcode` (migration `refinement_expand_dimensions`); added the
      notify-only Trends & nudges lane; added `.github/workflows/refinement-run.yml`. See
      `docs/REFINEMENT_README.md` + the `docs/archive/plan-2026-07-overhaul/logs/2026-06-19-refinement.md` session log.
- [ ] **Enable the scheduled run** — add repo secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
      `SUPABASE_DB_URL`; optional `REFINEMENT_HOUSEHOLD_ID`) so `refinement-run.yml` runs daily.
- [ ] §4.1 "Why?" reaction-rate sparkline + sample rejected listings (needs extra
      `listing_reactions` time-series reads beyond the counts-only `metrics`).
- [ ] "Reconsider?" auto-badge from re-probe reject rates (portal already renders the status).
- [ ] Monotonic `SCRAPER_RUN_INDEX` for `fetch-listings.mjs`; scraper-side probation enforcement not
      yet live-run against Apify (§16-guarded, its own named phase).

### UI / platform (each its own named phase)
- [x] **Dispatch-token permanence + sentinel (2026-07-15, owner-directed)** — the expiring 30-day
      GitHub PAT behind the punctual pg_cron fetch trigger was replaced with a **no-expiration
      classic PAT** rotated into Vault (`github_fetch_dispatch_token`, verified live: forced
      dispatch → HTTP 204 → run started). Added `.github/workflows/dispatch-sentinel.yml`
      (named §16 workflow phase): nightly red-run + owner email if no punctual dispatch landed in
      26 h, so the trigger can never die silently again. Zero credentials in the system now carry
      an expiry date. Docs: `docs/FETCH_SCHEDULE.md` §1 (rotation recipe) + §3 (sentinel).
- [x] **Remove the Report (Value Report) feature (2026-06-18)** — unused/redundant. Deleted
      `pages/report.html`, `assets/js/page-report.js`, `assets/js/page-report/`, `assets/js/report/`,
      `assets/css/pages/report.css`, `tests/report-format.test.js`; pruned the nav link, the
      `pages/report.css` `@import` (dashboard.css, §16), the dead `getReport()` (storage feed, §16),
      the test-runner registration, and `tests.html`. Dropped the backing Supabase `reports` table via
      `apply_migration` (single row backed up first). Docs reconciled (DESIGN/CLAUDE/SUPABASE_SYNC/SCHEMA_NOTES).
- [x] **Active/inactive areas** — per-household reversible pause + hard remove on the areas +
      area-detail pages. `household_areas.status` ∈ {active, inactive, removed} (migration
      `household_areas_status_inactive`); `setHouseholdAreaStatus` + `getHouseholdAreas({includeInactive})`
      in `storage/listings.js`; paused areas hidden from the listings feed/map and excluded from the
      fetcher's demand set. `tools/fetch-listings.mjs` now demand-gates the whole scrape
      (`demandFilterOutcodeMap`): an area is fetched only if ≥1 active household links it (error-only
      fallback to all-curated). Unit + sync tests added; verified end-to-end via MCP.
- [ ] Design review checkpoint with user (appearance/tokens/layout) — view via Pages or
      `python3 -m http.server`.
- [ ] Split `base.css` into the component partials + container queries on cards/sidebar
      (8A leftover; `sheet`/`segmented`/`table` scaffolds exist under `assets/css/components/`).
- [x] Map upgrade (8B) — **DECLINED 2026-07-02** (overhaul step 3.7c): keep Leaflet 1.9.4 +
      Geoman. Metric geofence circles are native Leaflet (no GL equivalent), zone drawing has
      no free MapLibre parity, and the CDN-dependency/weight ledger worsens on a zero-build
      page. Rationale + revisit trigger recorded in `docs/archive/plan-2026-07-overhaul/04-program.md` §5b.
- [ ] Compare drawer on the Areas page: multi-select 2–4 areas → bottom drawer with side-by-side
      mono columns (Phase 6 follow-up).
- [ ] **B4 — Shortlist single source:** make `getShortlist()` Supabase-first — touches
      `storage.js` (§16 guard → separate named phase).
- [x] Ask page (LLM interface) — shipped. Supabase Edge Function (`supabase/functions/ask/`) +
      client modules (`assets/js/ask/*`, `page-ask.js`) + `ask_conversations` table; see
      `docs/ASK.md`. **Admin handoff remaining:** create the Anthropic API key, set the
      `ANTHROPIC_API_KEY` Supabase secret, deploy the `ask` function, then smoke-test on the live site.

### Future organisation (optional, owner-deferred)
- [ ] Folderize `outreach-renderer.js` / `outreach-store.js` / `learned-preferences.js` into their
      feature folders.

## Search profiles + spend control (2026-08-27 → 08-30)

- [x] **Phase 0** — probes H/P against the live actor. `maxItems` and `maxBudget` are not
      fields on it and were silently ignored; `maxProperties` + the `maxTotalChargeUsd`
      run option are the real levers. Findings: `docs/PHASE0-PROBE-FINDINGS.md`.
- [x] **Phase 1a** — real spend caps, `fetch_control` global kill switch (fails closed on a
      disabled/unreadable gate, open on a missing table), Apify error bodies surfaced.
- [x] **Phase 1b** — `search_profiles` table, `assets/js/search/profile-spec.js` (exact-price
      validation, `signatureKey`, hard `keywordGate`), storage layer.
- [x] **Phase 2a** — profile lane runs ALONGSIDE the legacy criteria lane. Nothing deleted;
      `fetch_control.legacy_enabled` switches lane A independently.
- [x] **Phase 4** — `pages/search-profiles.html`: on/off, Run now, keyword control, lane banner.
- [x] **Phase 5** — `live-feed/search-control.html`: every profile across every household,
      all five switches. Fixed a guard trigger that could never have permitted the admin.
- [x] **Phase 6** — Luke's two searches seeded (£375k/24h, £400k/all-time + keywords), both
      manual-trigger. Verified live via `PLAN_ONLY`: 50 profile + 105 legacy targets.
- [ ] **Blocked on Apify spend being re-enabled** — paid probes `J,I,K,A` (~$0.30 total):
      does `monitoringMode` bill only new listings; does an empty search cost anything;
      does `fullPropertyDetails:false` return enough text for the keyword gate; does an
      exact `minPrice==maxPrice` band work.
- [ ] **Phase 2b** — query planner: buffered outcode cover from committed polygons, and the
      typeahead outcode-id cache (§0.12) so lane B makes no direct Rightmove calls.
- [ ] `dispatch-sentinel.yml` asserts a dispatch RAN, not that it SUCCEEDED — the specific
      gap that let three weeks of total fetch failure look healthy.
- [ ] Retire the legacy lane — owner decision only, its own named phase, never a side effect.
