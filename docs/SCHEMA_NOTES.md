# SCHEMA_NOTES.md — live schema discovery for the Model Refinement Engine

> **Stage 1 deliverable** (see `docs/archive/REFINEMENT_PLAN.md`). Captured **2026-06-05**
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

## 4. `listings` (671 rows) + `listings.status` — display lever (Approach B)
- `status` values currently in use: **`live` only** (670; 1 row other/none).
  `'hidden'` is **not used** anywhere — and, under the Stage-5 decision below, it
  is **never written by the portal**.
- **STAGE 5 RESOLUTION (2026-06-05, owner-approved — "client-side via overrides"):**
  the originally-planned status flip (`listings.status='hidden'`) is **blocked and
  abandoned**. Two hard facts make it impossible from the portal:
  1. `listings` has **no `household_id`** (shared, fetcher-written content) and a
     **SELECT-only** RLS policy (`"listings public read"` — verified 2026-06-05:
     the only policy on the table is `FOR SELECT`). The browser/publishable key
     therefore **cannot UPDATE `listings`** — only the service-role fetcher can.
     A portal status-flip would require widening RLS (rejected — security cost,
     and it would let any client mutate shared content).
  2. `sync_log` has **no INSERT policy** for the portal → the browser cannot write
     audit rows either.
  - **Approach B (shipped):** the hide lever is **purely client-side via a rule in
    `learned_preferences.overrides`**, under a reserved key `__refinement_hidden`
    (`{ "property_type:terraced": { dimension, value, count, at }, … }`). This is
    safe because `effectiveWeights()` (`learned-preferences/weights.js:247`) only
    consumes entries with a numeric `.weight`, so it **skips** the reserved object,
    and `recomputeLearnedPreferences()` preserves `overrides` wholesale → a hide
    rule **survives a retrain**. The feed filters matching listings client-side
    (`listingHiddenByRefinement()` in `refinement/view.js`), revealed by the
    existing `[data-show-hidden]` toggle — the **same** mechanism the junk
    classifier already uses (`page-listings.js` `paint()`), not a second one.
  - **No `listings` mutation, no `sync_log` write from the browser.** The
    durable/reversible record is: the override rule **+** the suggestion status flip
    (`refinement_suggestions` → `confirmed_hide`; portal **does** have an UPDATE RLS
    policy here, verified) **+** `learned_preferences.updated_at`. Undo reverts the
    status to `actionable` and drops the rule.
  - **The earlier "GAP" (default `getListings()` does not filter `status='hidden'`)
    is therefore MOOT** — Approach B never sets `status='hidden'`, so `getListings`
    is left unchanged and the §16-guarded `storage/listings.js` read path is **not**
    touched. (If a future audit trail is wanted, it needs a separate, named
    migration adding a `sync_log` INSERT policy — out of scope for Stage 5.)
- Matching is **case-insensitive**: `listings.property_type` is stored Title-Case
  (`Terraced`, `Semi-Detached`) while engine/rule values are lowercase (`terraced`)
  — the client filter normalises both with `lower(trim())`; the modal's
  `countMatchingListings()` uses `ilike` + the feed's geofence rule
  (`geofence_pass IS NOT FALSE`).
- Relevant columns for the engine: `area_id text?`, `property_type text?`,
  `status text DEFAULT 'live'`, `rightmove_id`, `outcode`.

## 5. `areas` (196 rows) — scrape-scope semantics (Stage 6/8)
- `data.active` **boolean** is the **scrape-scope flag**: **175 active=true /
  21 active=false / 0 null**. Active areas = the set the scraper pulls.
- `data.status` is the **research** state (`directory | partial | researched`) —
  **NOT** scrape state. Do not conflate the two.
- Therefore the Stage 8 invariant "active scrape scope = **active areas** minus
  `scrape_probation`" derives from `areas.data.active = true` minus probation rows.
- **STAGE 6 (2026-06-05): `areas` is SELECT-only from the portal** (`"areas public
  read"` is the only policy; no `household_id`) — exactly like `listings`. So the
  portal **cannot** flip `areas.active` directly. The "Stop searching this area"
  lever therefore writes the **household-scoped `scrape_probation`** table (full
  INSERT/UPDATE/DELETE RLS for household members — verified) + flips the suggestion
  to `confirmed_scrape`; the **scraper** (`tools/fetch-listings.mjs`, service role)
  subtracts probationed areas from its active set in a **separate, named change**
  (the §8 enforcement step — not yet wired). `scrape_probation` has a unique
  `(household_id, dimension, value)` index (upsertable) and `status ∈
  {active, reconsider, restored}`. Bring-back = DELETE the probation row + revert the
  suggestion to `actionable`.
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
  portal↔repo freshness contract to enforce, so they behave like `sync_log`
  (also untracked). User-owned overlays on these rows (a `dismissed`/`snoozed`/
  `confirmed_*` status the user sets in Stage 5+) are protected at write time by the
  upsert's `status = CASE WHEN status IN ('forming','actionable')` guard, not by the
  sync snapshot. Keeping them untracked preserves the offline sync test's 20-tracked-
  tables assertion (green) and avoids a meaningless freshness check on regenerated data.

## 10. `ask_conversations` (0 rows at creation) — Ask feature chat threads
- Added 2026-06-15 via migration `create_ask_conversations` (Ask plan Phase 1).
  Columns: `id uuid PK`, `household_id uuid NOT NULL → households(id) ON DELETE
  CASCADE`, `title text DEFAULT 'New chat'`, `messages jsonb DEFAULT '[]'`
  (array of `{ role, content, ts }` — only the final user/assistant TEXT turns;
  intermediate tool blocks are never persisted), `created_at`, `updated_at`
  (touch trigger `trg_touch_ask_conversations`).
- **RLS:** one `FOR ALL` policy `"household members manage ask_conversations"`
  `USING/ WITH CHECK is_household_member(household_id)` — read+write scoped to the
  household, same pattern as `area_confirmations`. Covering index
  `idx_ask_conversations_household`.
- **Class:** user-state (tracked, 21st). Browser owns persistence via
  `assets/js/storage/ask.js` (write-through cache → Supabase); the Edge Function
  `ask` only *reads* user state, never writes here. See `docs/ASK.md`.

## 9. Config constants — status
- Section 5 of `docs/archive/REFINEMENT_PLAN.md` holds the agreed defaults (Cautious
  preset shipped). These are **Luke's documented choices**; treated as confirmed
  for the Stage 1 migration (the constants live in a Stage 2 config module, not in
  the schema, so the migration does not depend on them). Flagged in the session
  summary for any final objection before Stage 2 wires them into code.
