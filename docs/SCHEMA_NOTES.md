# SCHEMA_NOTES.md — live schema discovery for the Model Refinement Engine

> **Stage 1 deliverable** (see `docs/REFINEMENT_PLAN.md`). Captured **2026-06-05**
> by reading the live Supabase project `qxmyrahqsopmaeokxdub` (`rec`) via MCP —
> not assumed. Re-verify with `mcp__supabase__list_tables` if shapes look stale.
> Household in use: `9628b44f-447e-4c5b-bbbc-b2ce51efbbbe` (single household, 1 member).

## 1. `listing_reactions` (3582 rows) — the engine's primary input
- Columns: `id uuid`, `household_id uuid`, `user_id uuid?`, `listing_id text`,
  `reaction text CHECK in ('like','pass','reject')`, `reason text?` (scalar,
  legacy/dual-write), `reasons jsonb DEFAULT '[]'` (**source of truth** going
  forward — array of `{ key, detail, note }`), `listing_snapshot jsonb?`,
  `created_at timestamptz`.
- **Reaction distribution (raw):** `reject 3536` · `like 31` · `pass 15`.
  → **Raw baseline reject rate ≈ 98.7%.** This is the single most important
  modelling fact: `p0` (pool reject rate, §2.4) is extremely high, so **lift over
  baseline is near 1.0 for almost every value**. The disproportionality/lift gate
  (`MIN_LIFT`) will be the binding constraint, and Wilson lower bound alone would
  pass almost everything — exactly why §2.4–2.6 layer lift + FDR on top. The
  engine must rank on **lift vs this ~0.987 baseline**, not on absolute rate.
- `listing_snapshot` keys present: `distance_mi, beds, title, url, outcode,
  address, rightmove_id, property_type, baths, has_parking, outdoor_space, price,
  image_url, area_id, status`. **Both `property_type` and `area_id` live in the
  snapshot** (3344/3536 rejects have them) → read snapshot first, fall back to the
  joined `listings` row for the ~192 without (§2.1).
- `reasons[]` element keys: `key, detail, note` (matches the column comment).
- **Append-only** (per CLAUDE.md §18.1) — the engine MUST NOT delete these; reset
  training never touches this table (plan §4.6).

## 2. Dimension value formats & normalisation
- Distinct `area_id` in snapshots: **128 raw == 128 normalised**
  (`lower(trim())`). Distinct `property_type`: **40 raw == 40 normalised**.
- In `listings`: `area_id` **78 raw == 78 norm**; `property_type` **14 raw == 14
  norm**.
- **Finding:** at the current snapshot/listings level, case/whitespace duplication
  does **not** collapse anything today — the data is already clean. The plan's
  `bemerton-sp2`-variants warning is not reproducible in the live aggregates now,
  but normalisation (`LOWER(TRIM())`) is kept as cheap defensive insurance and
  because the snapshot-vs-`listings` fallback join can still mix casings. **Do
  normalise** (§2.1) — just don't expect it to change current counts.
- Top reject `property_type` (volume, *not* lift): `detached 778 · semi-detached
  523 · terraced 419 · flat 381 · apartment 249 · end of terrace 183 · detached
  bungalow 105 · bungalow 96 · park home 81`. Confirms plan §1.6: detached/semi
  top the **raw** counts purely by stock volume → must be flagged
  `volume_artefact` unless lift clears `MIN_LIFT`.

## 3. `learned_preferences` (1 row) — REUSE, do not duplicate
- Columns: `household_id uuid UNIQUE`, `derived jsonb '{}'`, `overrides jsonb
  '{}'`, `dismissals jsonb '{}'`, `updated_at`.
- `overrides` = **EMPTY** today → clean slate for the Stage 5 display-hide rules.
- `dismissals` = **EMPTY** today → clean slate for dismiss/snooze memory (plan §3).
- `derived` already holds a per-signal map keyed like `type:flat`, `area:chillworth-so16`,
  `outcode:so16`, `beds:2`, `price-band:300-350k`. Each value is a rich object:
  `{ n, n_liked, n_rejected, n_pass, weight, confidence, discrimination,
  reaction_ids[] }`. **This is the EXISTING `learned-preferences` engine's output**
  (`assets/js/learned-preferences/*`), distinct from the refinement engine. The
  refinement engine writes its own `refinement_suggestions` rows and only *reuses*
  `overrides` (display-hide rules) and `dismissals` (don't-renag memory). Do **not**
  repurpose or overwrite `derived`.
- Note `derived` stores full `reaction_ids[]` arrays per key (can be large) — the
  refinement engine should store **counts/metrics**, not id lists, in
  `refinement_suggestions.metrics`.

## 4. `listings` (671 rows) + `listings.status` — the display lever target
- `status` values currently in use: **`live` only** (670; 1 row other/none).
  `'hidden'` is **not yet used** anywhere.
- **GAP for Stage 5 (Stage-1 checklist answer):** `getListings()` in
  `assets/js/storage/listings.js:58` filters by status **only when a `status` arg
  is explicitly passed** (`if (status) q = q.eq('status', status)`); the default
  call passes `status=null` → **no status filter → `'hidden'` rows would still be
  returned by default.** So `status='hidden'` is **NOT** honoured by the default
  read path today. **Stage 5 must:** (a) change the default listings read to
  exclude `hidden` (e.g. `status='live'` or `status != 'hidden'`), and (b) add a
  global **Show hidden** toggle that passes the opposite. This is a §16-guarded
  file (`storage.js` shim → `storage/listings.js`) — **extend, do not rewrite**,
  and it is its own named change within Stage 5.
- Relevant columns for the engine: `area_id text?`, `property_type text?`,
  `status text DEFAULT 'live'`, `rightmove_id`, `outcode`.

## 5. `areas` (196 rows) — scrape-scope semantics (Stage 6/8)
- `data.active` **boolean** is the **scrape-scope flag**: **175 active=true /
  21 active=false / 0 null**. Active areas = the set the scraper pulls.
- `data.status` is the **research** state (`directory | partial | researched`) —
  **NOT** scrape state. Do not conflate the two.
- Therefore the Stage 8 invariant "active scrape scope = **active areas** minus
  `scrape_probation`" derives from `areas.data.active = true` minus probation rows.
- Other `data` keys present: `searchRadiusMi`, `geofenceRadiusMi`, `rightmove`,
  `houseTypeIds`, `coords`, `postcode`, `town`, `county`, `prices`, … (full area
  record per `data/schema/area.schema.json`).

## 6. `criteria` (1 row) & `zones` (1 row) — user search definition
- `criteria.data` keys: `size, budget, epcMin, tenure, parking, features,
  keywords, location, mortgage, condition, mustHaves, tenurePref, niceToHaves,
  outsideSpace, propertyTypes, propertyStatus, listingFreshness, propertyTypePrefs`.
  → `propertyTypes` / `propertyTypePrefs` and `location` are the user-facing
  scope/preference fields; the **scrape** scope itself is driven by `areas.active`
  (§5), not by `criteria` directly.
- `zones.data` is a **jsonb object** (drawn map zones; non-null for this household).

## 7. RLS & conventions (for the migration)
- Helper: `is_household_member(p_household_id uuid)` exists and is used by every
  household table. Policy pattern per table = three policies:
  `FOR SELECT USING (is_household_member(household_id))`,
  `FOR INSERT WITH CHECK (...)`, `FOR UPDATE USING (...)`. New engine tables
  additionally get a `FOR DELETE USING (...)` policy (reset-training needs it).
- `households.id` is `uuid`; FKs use `REFERENCES households(id) ON DELETE CASCADE`.
- `updated_at` auto-maintained by the `touch_updated_at()` trigger + a loop in
  `supabase/schema.sql`; new tables with `updated_at` attach their own
  `trg_touch_*` trigger.
- FK columns are covered by `idx_<table>_household` indexes (perf advisor).
- Migration naming convention (snake_case, see `list_migrations`): e.g.
  `listings_l1`, `area_confirmations_step5` → this one is **`refinement_engine_stage1`**.
- `sync_log` (5097 rows) is the audit table: `actor CHECK in ('claude','portal',
  'system')`, `action CHECK in ('insert','update','delete','backfill')`,
  `table_name`, `row_id`, `at`. Engine evaluation runs log `actor='system'`;
  user-applied refinements log `actor='portal'` (plan §3).

## 8. Tracking / sync-state decision
- `data/snapshots/sync-state.json` tracks 21 tables (20 tracked + `listings`).
  The 3 engine tables (`refinement_suggestions`, `refinement_runs`,
  `scrape_probation`) are **NOT** added to sync-state — they are engine-managed.
  `refinement_runs` is audit-class (like `sync_log`, never tracked).
- **Stage 3 RESOLUTION (2026-06-05):** `refinement_suggestions` and `scrape_probation`
  **remain untracked** even now that `refinement_suggestions` carries data (51 live
  rows). Rationale: they are *engine-derived* state, regenerated each run from the
  append-only `listing_reactions` log (the real source of truth) — there is no
  portal↔repo freshness contract to enforce, so they behave like `sync_log`/`reports`
  (also untracked). User-owned overlays on these rows (a `dismissed`/`snoozed`/
  `confirmed_*` status the user sets in Stage 5+) are protected at write time by the
  upsert's `status = CASE WHEN status IN ('forming','actionable')` guard, not by the
  sync snapshot. Keeping them untracked preserves the offline sync test's 20-tracked-
  tables assertion (green) and avoids a meaningless freshness check on regenerated data.

## 9. Config constants — status
- Section 5 of `docs/REFINEMENT_PLAN.md` holds the agreed defaults (Cautious
  preset shipped). These are **Luke's documented choices**; treated as confirmed
  for the Stage 1 migration (the constants live in a Stage 2 config module, not in
  the schema, so the migration does not depend on them). Flagged in the session
  summary for any final objection before Stage 2 wires them into code.
