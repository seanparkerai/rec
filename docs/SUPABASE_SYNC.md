# SUPABASE_SYNC.md — Bidirectional sync contract

This document is the operational detail behind **CLAUDE.md §18**. It explains how Claude (via the
Supabase MCP connector) and the user (via the deployed portal) keep the database, the repo, and
local caches in perfect lockstep.

Read this once at the start of any session that involves data, schema, or storage changes. Treat
the table in §1 as authoritative — every data type in the app belongs to exactly one class.

---

## 0. Canonical table inventory (single source of truth)

**Live schema = 33 tables in `public`** (verified via `list_tables` 2026-06-15; `area_search_tuning`
added 2026-06-21; `household_review_stats` added 2026-06-22, **all RLS-enabled**).
**23 are "tracked"** for the sync contract — **21 user-state + 2 content mirrors** — and appear in
`data/snapshots/sync-state.json` (the snapshot also carries a high-water entry for the untracked
`listings` table). The enforced list lives in `tests/supabase-sync.test.js`; any other
doc, test, or rule that states a different count is wrong and must be reconciled to this section.
The snapshot holds **current high-water marks + one-line caveats only** (9.4/R5 split, 2026-07-03);
write **history** appends to `docs/archive/sync-changelog.md`, never back into the snapshot notes.
Underscore-prefixed snapshot keys (e.g. the top-level `_note`) are metadata, not tables.

- **21 user-state** (per household_id, source of truth = Supabase): `profile`, `criteria`,
  `finances`, `goals`, `shortlist`, `zones`, `journey_checks`, `journey_progress`, `contacts`,
  `outreach`, `readiness_checklist`, `investments_accounts`, `investments_history`,
  `debts_credit_cards`, `debts_student_loans`, `debts_other`, `listing_reactions` (**append-only**:
  every like/pass/reject + optional reason + `listing_snapshot` is a new row; RLS read+insert only),
  `learned_preferences` (one row/household: `derived` Layer-2 weights recomputed from the reaction
  log + `overrides` Layer-3 intent + dismissals), `area_confirmations` (blob of user-confirmed area
  locations), `household_areas` (**relational**, PK `(household_id, area_id)` — the per-household
  area *selection* layer over the global `areas` catalog; composed by `storage.js#getHouseholdAreas`;
  `status` ∈ {`active`, `inactive`, `removed`} — `active` is searched + shown, `inactive` is a
  reversible per-household pause (hidden from the listings feed + excluded from the fetcher's demand
  set, still listed for reactivation via `getHouseholdAreas({ includeInactive })`); its migration also
  added a gated `areas` INSERT policy for `source='household-onboarding'` provisional stubs only), `ask_conversations` (Ask feature — natural-language assistant chat
  threads; one row/conversation: `title` + `messages` jsonb of the final user/assistant text turns;
  RLS via `is_household_member()`, FOR ALL. Browser-owned persistence via `storage/ask.js`; the Edge
  Function `ask` only *reads* user state).
- **2 content mirrors**: `areas` (**DB-canonical** since the 2026-06-04 §18.5 relaxation —
  `data/areas/<id>.json` is a materialised view) and `house_types` (repo-JSON-canonical, mirrored).
- **3 system** (Supabase-managed, never synced by Claude): `households`, `household_members`, `sync_log`.
- **7 untracked** (never git-synced): `listings` (live content, see below), `listing_areas`
  (the listing↔area **m2m membership** junction — live content of the SAME class as `listings`:
  service-role write, public-SELECT RLS, never git-synced; one row per area whose geofence
  contains a listing, `is_primary` mirroring `listings.area_id`; written by BOTH listings writers
  via the `replace_listing_areas` SECURITY DEFINER RPC and recomputed one-off by
  `tools/backfill-listing-areas.mjs`; the feed reads it to surface a listing inside ANY held
  area, not just its single primary — see below), and the engine-managed tables
  `refinement_suggestions`, `refinement_runs`, `scrape_probation`,
  `area_search_tuning` (the per-area learned search radius — AREA-GLOBAL, public-SELECT
  RLS like the content mirrors but service-role-only writes; written by
  `tools/radius-tune.mjs`, read live by `tools/fetch-listings.mjs`; see
  `docs/REFINEMENT_README.md`) and `household_review_stats` (a **derived per-household cache**:
  the listings-page "to review" count — the visible Browse pool after the full intelligence
  pipeline — written by the browser via `storage/listings/feed.js#saveListingsReviewCount` and
  read by the `/live-feed` kiosk RPC `live_feed_stats`; recomputable, never git-synced; RLS via
  `is_household_member()`).

**SECURITY DEFINER RPCs (service-role/engine writes):** `live_feed_stats` (admin kiosk
aggregate), `request_rightmove_fetch` (portal→fetcher dispatch), and `replace_listing_areas`
(`p_rightmove_id`, `p_rows jsonb`) — atomically deletes then re-inserts one listing's
`listing_areas` set in a single transaction (the membership set can SHRINK on re-geocode or
radius tuning, so a plain upsert would leave stale rows).

**SECURITY DEFINER RPC (per-household read):** `household_feed(p_household_id, …)` — the ONE
visibility predicate (2026-07-01, migration `household_feed_rpc`): membership ∩ non-origin
active areas ∩ curated-disable rule ∩ `geofence_pass IS DISTINCT FROM false` ∩ the
`passesBaseline` rule (constants + type regexes mirrored from
`assets/js/listings/classify.js`, pinned by `tests/contract/household-feed.test.js` against
`supabase/archive/schema-household-feed.sql`), ordered `first_seen DESC` and paged. Callers:
household members only (plus service contexts); anon/non-members get `forbidden`. Returns
listing columns + an `areas` jsonb membership array. The storage feed read
(`storage/listings/feed.js`) is repointed at it in step 2.13.

**`household_areas.is_origin`** (boolean, default false): marks a home/commute-anchor area.
An origin area contributes to commute math but is **excluded from listing-feed membership**
(the `household_feed` RPC drops it from the household scope) AND from the **fetcher demand
set** (it is not scraped) — its catchment is where the household LIVES, not where they want
to buy. User-editable via the area picker's "Home" toggle
(`storage#setHouseholdAreaOrigin`, step 2.19).

Note: `checklists` and `outreach_templates` have **no** mirror table — those catalogues are
repo-JSON-only. **`data/journey.json` is the same class by decision (2026-07-03, step 8.3):**
it stays repo-only content with no mirror table — it is single-editor curated content whose
changes are code-reviewed, and the only stateful part (which tasks are ticked) already lives in
Supabase `journey_progress`. A `journey_phases` table would add sync surface for zero owner
benefit. Revisit trigger: a real need for portal/multi-editor journey edits.

**`listings` — the live-content class (v3, see §1).** Written exclusively by
`tools/fetch-listings.mjs` (service role) and changing hourly, it has no review/cite value the way
`areas` does, so it is not mirrored to/from repo JSON. Both writers (`fetch-listings.mjs` and the
backfill `import-apify-runs.mjs`) apply the `passesBaseline` gate
(`assets/js/listings/classify.js`), and rows are also **purged — not only appended** — by
`tools/purge-listings.mjs` (baseline-violating / rejected-and-old / stale; **never a liked row**) and
by user-approved one-off MCP cleanups. The reject SIGNAL that drives feed suppression lives in the
append-only `listing_reactions` log, NOT in `listings`, so purging a heavy listings row never loses
suppression.

**`listing_areas` — the m2m membership junction (2026-07).** `listings.area_id` stays the
listing's single PRIMARY area (named/nearest village, still consumed by `page-property.js` /
`page-listings.js`). But village geofences OVERLAP, so a listing physically inside an area you
hold could be invisible when its primary is a *different* area you don't hold. `listing_areas`
records the FULL membership set — one row per area whose geofence contains the listing, with
exactly one `is_primary=true` row equal to `listings.area_id`. The feed resolves the household's
(non-origin) areas → the member listing ids via `listing_areas` → filters listings by
`rightmove_id` (not `area_id`). Both writers emit membership from `withinGeofence().areas` via
`replace_listing_areas`; `tools/backfill-listing-areas.mjs` seeded the existing rows (a pure £0
recompute over the same DB area universe + tuning). Do **not** drop `area_id` or the junction —
they are complementary (primary vs. full membership). See `docs/DATA_MODEL.md` / `docs/AREAS.md`.

*History (collapsed):* `listings` / `listing_reactions` landed v3 L1/L3 (2026-05-30),
`learned_preferences` L4 and `area_confirmations` Step 5 (2026-05-31), `household_areas` +
the gated stub-INSERT policy in Phase 2 (2026-06-08, migration
`household_areas_and_gated_stub_insert`); `journey_progress` joined the tracked set alongside it.
The owner household was seeded with all curated areas (`added_via='curated-seed'`); new households
start empty until onboarding.

---

## 1. Source-of-truth matrix

| Class | Tables / files | Canonical store | Writer | Reader |
|-------|----------------|-----------------|--------|--------|
| **User state** | `profile`, `criteria`, `finances`, `shortlist`, `zones`, `journey_checks`, `contacts`, `outreach` — **no repo JSON file** | Supabase row (one per household_id) | Portal via `storage.js`, OR Claude via MCP `execute_sql` | `storage.js` reads with localStorage write-through cache |
| **Test fixtures** | `data/fixtures/*.sample.json` | Repo file (git-versioned, redacted) | Claude only | Test harness (`tools/run-all-tests.mjs`) and fresh-install fallback in `storage.js` |
| **Content (per-area)** | Supabase `areas` table + materialised `data/areas/<id>.json` | **Supabase `areas`** (DB-canonical, §18.5 relaxation 2026-06-04) | Claude via MCP UPSERT, then `tools/sync-areas-from-supabase.mjs` re-materialises the files | App fetches the JSON; `tests/contract/areas-db-repo-parity.test.js` guards file↔DB parity |
| **Content (catalogues)** | `data/house-types.json`, `data/checklists.json`, `data/outreach-templates.json` | Repo file | Claude only | App fetches the JSON; only `house_types` has a Supabase mirror table — `checklists` / `outreach_templates` are repo-JSON-only (no mirror) |
| **Index** | `data/areas.json` | Derived from `data/source/villages.csv` + the materialised per-area files via `tools/build-areas.mjs` | Build tool | App fetches the JSON |
| **Live content (v3)** | `listings` (Supabase only — no repo file) | Supabase (fetcher-written) | `tools/fetch-listings.mjs` via service-role REST UPSERT (`on_conflict=rightmove_id`) | `storage.js#getListings` → listings page. NOT git-versioned; not a tracked table |
| **User state (append-only, v3 L3)** | `listing_reactions` (Supabase only — no repo file) | Supabase (per household_id) | Portal via `storage.js#saveListingReaction` (INSERT — append-only); Claude via MCP `execute_sql` INSERT | `storage.js#getListingReactions` reduces the log to the latest reaction per listing. Tracked table #18 |
| **User state (recomputed, v3 L4)** | `learned_preferences` (Supabase only — no repo file) | Supabase (per household_id) | Portal via `storage.js#saveLearnedPreferences` / `recomputeLearnedPreferences` (UPSERT); Claude via MCP `execute_sql` UPSERT | `storage.js#getLearnedPreferences` → `{ derived, overrides }`; `derived` recomputed from the reaction log, `overrides` preserved. Tracked table #19 |
| **Schema** | `supabase/schema.sql` | Migration history applied via MCP | Claude only, via `mcp__supabase__apply_migration` | Supabase project state |

Anything not in this table is either ephemeral UI state (URL params, in-memory only) or a bug —
flag it to the user, do not invent a new class.

---

## 2. Session lifecycle

### 2.1 Session start (mandatory, before any edit)

```
┌─────────────────────────────────────────────────────────┐
│ 1. mcp__supabase__list_tables      → schema sanity check │
│ 2. tools/check-supabase-freshness  → MAX(updated_at) per │
│                                      table               │
│ 3. compare to data/snapshots/sync-state.json             │
│ 4a. user-state fresher? pull row, surface diff           │
│ 4b. content mirror behind? re-push from repo             │
│ 5. proceed to §8 step 1 of CLAUDE.md                     │
└─────────────────────────────────────────────────────────┘
```

If any of steps 1–4 fails or surfaces an unexpected change, **stop and check with the user**. Do not
"proceed and clean up later" — that's how silent drift starts.

### 2.2 Mid-session writes

| Trigger | What Claude does |
|---------|------------------|
| User says "update my finances with X" | `mcp__supabase__execute_sql` UPSERT to `finances` row · re-SELECT to verify · update local snapshot |
| User says "research area X" | Write the record to the Supabase `areas` row via MCP UPSERT · `node tools/sync-areas-from-supabase.mjs` to materialise the file · `node tools/build-areas.mjs` · update snapshot (§18.5 DB-first path) |
| User says "add a new house type" | Edit `data/house-types.json` · UPSERT into `house_types` mirror · update snapshot |
| Claude refactors a calculator | No Supabase write — code only |
| Claude touches `supabase/schema.sql` | NOT allowed via direct edit — open a phase, draft the migration, apply via `mcp__supabase__apply_migration` |

### 2.3 Session end (mandatory, before commit)

```
┌─────────────────────────────────────────────────────────┐
│ 1. Verify every Claude-side write landed (re-SELECT)     │
│ 2. tests/supabase-sync.test.js must pass                 │
│ 3. tools/run-all-tests.mjs must pass            │
│ 4. Update data/snapshots/sync-state.json                 │
│ 5. git add + git commit + git push                       │
│ 6. Commit message footer: "Supabase: N areas, M rows"    │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Why this design

**Why content is git-materialised even where the DB is canonical**

Areas are reviewable, diff-able, cite-able content. Since the 2026-06-04 §18.5 relaxation the
Supabase `areas` table is the canonical store (one write path, queryable, joinable with user state),
but every change is immediately materialised back into `data/areas/<id>.json` so git history keeps
recording "what changed, when, by whom, with what sources" — the parity test makes drift impossible
to commit. The other catalogues (`house_types`, `checklists`, `outreach-templates`) remain
repo-canonical: they change rarely and review-by-diff is their natural workflow.

**Why user state lives in Supabase, not repo JSON**

User state changes hundreds of times per session and is per-household. Persisting that in git would
be absurd, and persisting it only in localStorage (the pre-Supabase architecture) lost data when the
user cleared their browser. Supabase + RLS gives durability + multi-device + multi-household.

**Why MCP is mandatory, not "preferred"**

Two writers (portal + Claude) without coordination = drift. The MCP connector is the *one*
coordination point Claude has into Supabase. Skipping it for "speed" means Claude is working from a
stale repo snapshot while the user has been editing in the portal — every guidance Claude gives
becomes wrong without warning. Mandatory MCP-first ensures Claude always works from the same
universe as the user.

---

## 4. Failure modes and recovery

| Symptom | Cause | Recovery |
|---------|-------|----------|
| `tests/contract/areas-db-repo-parity.test.js` fails (area file ≠ DB) | A per-area file was edited by hand, or a DB write wasn't materialised | The DB wins (§18.5): re-run `node tools/sync-areas-from-supabase.mjs` + `build-areas`; do not commit until green |
| `tests/supabase-sync.test.js` fails: "count mismatch on house_types" | A content file edit didn't mirror | Re-run the UPSERT for the missing rows; do not commit until green |
| `tests/supabase-sync.test.js` fails: "user-state row missing" | Brand-new household never saved the relevant page | Acceptable if the page hasn't been visited; mark the row optional in the test fixture |
| Session-start freshness check shows user-state newer than expected | User edited in the portal since last session | Pull + surface; never overwrite without explicit confirm |
| MCP `execute_sql` returns `permission denied` | RLS rejected the write — household_id mismatch | Re-fetch the user's household_id via the auth path; do not bypass RLS |
| Schema drift between `supabase/schema.sql` and live | Someone applied DDL outside MCP | Reapply the canonical schema via `mcp__supabase__apply_migration`; record the incident in `docs/CHECKLIST.md` |

---

## 5. What this does NOT cover

- **Auth flow** — sign-in / sign-up / password reset live in `pages/login.html` and
  use Supabase Auth directly. Not Claude's concern unless changing the flow.
- **Storage buckets** — not currently used. If we add image hosting via Supabase Storage, that gets
  its own §6 in this document and its own sync test.
- **Edge functions** — one: `ask` (the assistant; see `docs/ASK.md`). It only READS user state,
  RLS-scoped via the caller's forwarded JWT — its key handling is covered in §7 below; its
  deploy/versioning is Ask-surface concern, not sync-contract concern.
- **Realtime subscriptions** — out of scope; the app polls on navigation.

---

## 6. Quick reference — the only commands you should reach for

```bash
# Read what's in Supabase right now (via MCP, not psql)
mcp__supabase__list_tables                     # schema sanity check
mcp__supabase__execute_sql "SELECT ..."        # any read
mcp__supabase__execute_sql "INSERT/UPDATE ..." # any user-state or content-mirror write
mcp__supabase__apply_migration                 # any DDL

# Local sync tooling
node tools/check-supabase-freshness.mjs        # MAX(updated_at) per table vs local snapshot
node tools/sync-content-to-supabase.mjs        # push repo JSON to mirror tables (Phase 10)
node tools/run-all-tests.mjs          # full test harness incl. sync test
```

If you're reaching for `curl`, `psql`, or pasting SQL into the Supabase web dashboard — stop. You're
outside the MCP-first contract. Either use the MCP connector or open a new phase in `CHECKLIST.md`
to explain why an exception is needed.

---

### 2026-07-01 — ONE membership truth (migration `derived_primary_from_listing_areas`)

`listings.area_id` is **derived**: the `replace_listing_areas` RPC validates exactly-one-primary
per non-empty membership set and updates `listings.area_id` from the `is_primary` row in the same
transaction; `uniq_listing_areas_primary` (partial unique index) makes multi-primary structurally
impossible. **§18.3 online parity check (run at data-session end):**

```sql
SELECT count(*) FROM listings l
JOIN listing_areas la ON la.rightmove_id = l.rightmove_id AND la.is_primary
WHERE la.area_id IS DISTINCT FROM l.area_id;   -- must be 0
```

Known repair queue (found 2026-07-01, fixed by the 2.11 canonical re-backfill): 4 live
geofence-passing listings with zero membership rows (invisible to every feed) —
90359223, 173588246, 90374985, 174197870 — plus 1 near-miss (87986133, geofence_pass=false,
correctly membership-less).

---

## 7. Key model (E1) + RLS sweep (E2) — verified 2026-07-03 (overhaul 9.6)

**Client key: modern.** `assets/js/supabase-client.js` ships the `sb_publishable_*` key
(`get_publishable_keys` confirms it live + enabled; the repo copy matches). Publishable keys are
client-safe **iff RLS is enforced everywhere** — which the E2 sweep verifies mechanically.

**E2 RLS sweep** (now step 1 of the §18.2 ceremony, `.claude/skills/sync-check/SKILL.md`):

```sql
SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;  -- must be []
```

Baseline 2026-07-03: **clean** (zero rows — every public table has RLS). Any future row is a
stop-everything security finding, not a note.

**Legacy anon JWT key: still ENABLED** (`get_publishable_keys`, `type:"legacy"`,
`disabled:false`). Nothing in the repo uses it, but the platform still injects it as the
`SUPABASE_ANON_KEY` env that `supabase/functions/ask/index.ts` reads for its RLS-scoped client.
⚙ **Owner action to finish E1** (dashboard-only — no MCP tool can disable keys), in this order:
1. Point the `ask` function at the publishable key (set a function secret, e.g.
   `SB_PUBLISHABLE_KEY=sb_publishable_…`, and switch `index.ts` to prefer it over
   `SUPABASE_ANON_KEY`), redeploy, re-run the ASK.md smoke test.
2. Only then disable the legacy JWT keys in Dashboard → Settings → API. Disabling first breaks Ask.

**Secret keys:** never committed anywhere. The only `service_role` consumer is
`tools/backfill-content-direct.mjs`, which reads it from the environment (its header says so);
the `ask` function uses the anon-key + forwarded caller JWT pattern (belt-and-braces
`household_id` filters in its executors) and holds no secret key.
