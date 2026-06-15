# CHECKLIST — live progress tracker

Tick items as completed and **commit**. To resume in a fresh chat: read this file, then
`docs/CONTEXT.md`, run `node tools/area-status.mjs`, run tests, continue at the first unchecked box.
Completed phases are archived verbatim at `docs/archive/CHECKLIST-archive-2026-06.md`; shipped
plans live in `docs/archive/` (index: `docs/README.md`).

**Status:** the app is feature-complete through v3 live listings and the Model Refinement Engine
(Stages 1–9 shipped 2026-06-05 — operate it via `docs/REFINEMENT_README.md`). Supabase is the live
backend (auth + the tracked tables per `docs/SUPABASE_SYNC.md` §0, all RLS-enabled). Pages: Home,
About/Search, Areas (+ detail), Journey, Finances, House types, Map, Listings, Saved, Property
dossier, Outreach, Refinement, Data-sync.

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
- [ ] Area research batches — queue via `node tools/area-status.mjs --missing`; write each area to
      Supabase via MCP, then materialise (`sync-areas-from-supabase` → `build-areas`, §18.5).
      Complete one fully evidenced batch before committing records.
- [ ] House-type content + imagery batches (15 types, several still `draft-no-sources`):
      research → splice → licence-safe images → sources → tests → commit per batch.

### Needs-network (queued — run from a connected host; the sandbox blocks these hosts)
- [ ] `node tools/geocode-areas.mjs` → precise per-village coords (currently outward-centroid
      approximations, flagged "(approx.)" on the map).
- [ ] `tools/research-areas.mjs` (to write): 9-category content, 3-source minimum / 5 for top-N.
- [ ] `tools/fetch-images.mjs` (to write): 2–3 licensed images per village + credit/licence
      write-back.
- [ ] `tools/research-house-types.mjs` (to write): 15 house types fully described + cited.

### Refinement engine — deferred (documented, non-blocking)
- [ ] §4.1 "Why?" reaction-rate sparkline + sample rejected listings (needs extra
      `listing_reactions` time-series reads beyond the counts-only `metrics`).
- [ ] "Reconsider?" auto-badge from re-probe reject rates (portal already renders the status).
- [ ] CI scheduling of `refinement-run.mjs` + `refinement-scope-check.mjs`, and a monotonic
      `SCRAPER_RUN_INDEX` for `fetch-listings.mjs` — all `.github/workflows` changes
      (§16-guarded, its own named phase). Scraper enforcement not yet live-run against Apify.

### UI / platform (each its own named phase)
- [ ] Design review checkpoint with user (appearance/tokens/layout) — view via Pages or
      `python3 -m http.server`.
- [ ] Split `base.css` into the component partials + container queries on cards/sidebar
      (8A leftover; `sheet`/`segmented`/`table` scaffolds exist under `assets/css/components/`).
- [ ] Map upgrade (8B): swap Leaflet + Geoman → MapLibre GL JS v5 + maplibre-gl-draw;
      Hampshire/Wiltshire PMTiles slice at `assets/maps/uk-south.pmtiles`; token-driven light/dark
      style; mobile bottom-sheet detents; port `page-map.js` (markers, shortlist, zones —
      storage API unchanged).
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
