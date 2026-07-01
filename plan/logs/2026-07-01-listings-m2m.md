# Session log 2026-07-01 — Listing↔Area m2m + origin exclusion (flagship briefing)

> Split from `fable_refactor.md` (2026-07-01, content unchanged). Directory: [`plan/README.md`](../README.md).

## Appendix — Session log: Listing↔Area m2m membership + origin-area exclusion (2026-07-01)

> **Read this first if you are the Fable session picking up the listings pipeline.** It is both a
> record of the 2026-07-01 change *and* the current-state briefing + known-weakness list for the
> flagship segment named in the TOP PRIORITY DIRECTIVE at the head of this file. Authored by Opus
> 4.8. Landed **directly on `main`** (owner instruction) — commit `feat(listings): m2m listing↔area
> membership + origin-area exclusion`. Test harness green (**781/781** pure + Supabase-sync
> **16 pass / 0 fail / 3 online-skips**). Live acceptance verified against project
> `qxmyrahqsopmaeokxdub`.

### 0. One-paragraph summary

A listing was tied to areas by a **single** `listings.area_id` (nearest/named village), but village
geofences **overlap**, so a property physically inside an area a household holds was invisible whenever
its one stamped area happened to be a *different* area they don't hold. Simultaneously, one household's
**home/commute origin** area (Whiteley for the owner) dragged an entire suburban catchment into the
feed. This session introduced a **many-to-many membership** (`listing_areas`) so a listing belongs to
*every* area whose geofence contains it, and an **origin flag** (`household_areas.is_origin`) so
home/commute anchors are excluded from both the feed and the scrape. `listings.area_id` was kept as the
*primary* (additive, no display rewrite). This is a **down-payment on**, not a completion of, the
flagship listings-pipeline overhaul — §5 below is the real work still owed.

### 1. Why — the two defects (both verified live before touching code)

- **Problem A — hidden-by-single-area_id (a true correctness bug).** `withinGeofence()` computed the
  full set of in-buffer villages internally (`inBuffer`) and **threw it away**, keeping one. The feed
  read `listings.area_id IN (household areas)`. With overlapping 3-mile disks, a home inside your
  area but *stamped* with a neighbour's area was silently absent. Canonical case: "SHEDFIELD – COMING
  SOON" (`90328152`), inside Waltham Chase's geofence but stamped `wickham-and-knowle-hampshire` —
  visible to a household holding Wickham, invisible to the owner who holds Waltham Chase.
- **Problem B — the origin flood (relevance).** Fixing A alone would have ~5×'d the owner's raw pool,
  and **~80% of that was noise from a single area**: `whiteley-po15`, the owner's *home* (a
  `curated-seed` commute anchor, not a search target), which sits in the PO14/PO15/SO31
  Fareham–Titchfield–Warsash built-up belt. Its blanket disk legitimately covers that suburbia, so
  m2m would have surfaced hundreds of modern Fareham semis the owner never wants. Verified live:
  **227 listings are members of Whiteley but of no other area the owner holds** — precisely the flood.

### 2. What was built

**Schema (applied via `apply_migration`; mirrored into `supabase/archive/schema-listings.sql`):**
- `listing_areas(rightmove_id, area_id, distance_mi, is_primary, created_at)` — the m2m junction.
  **Live-content class**, identical to `listings`: service-role write, `RLS` enabled, public-SELECT
  policy, **never git-synced**. It is the **7th untracked table** (docs/SUPABASE_SYNC.md §0 +
  `tests/supabase-sync.test.js` updated 6→7). Indexed on `area_id` and `rightmove_id`; PK
  `(rightmove_id, area_id)`.
- `replace_listing_areas(p_rightmove_id text, p_rows jsonb)` — `SECURITY DEFINER`, pinned
  `search_path`. Deletes then re-inserts one listing's whole membership set in a single transaction,
  because a set can **shrink** (re-geocode, radius tuning) and a plain upsert would leave stale rows.
- `household_areas.is_origin boolean NOT NULL DEFAULT false`, with a COMMENT documenting the
  "contributes to commute math, excluded from feed + fetch" semantics. Seeded true for the owner
  household `9628b44f-…` × `whiteley-po15` only (a separate, generic-DDL-preserving data migration).

**Pure logic (`tools/listings-normalise.mjs`):** `withinGeofence()` now returns an additional
`areas: [{area_id, distance_mi, is_primary}]` — the full km-sorted in-buffer set, exactly one
`is_primary` equal to the existing `area_id`, `[]` iff `pass` is false. **Every previously-asserted
field is unchanged**, so the locked tests still hold; the change is purely additive.

**Writers (parity is a hard requirement — SUPABASE_SYNC contract):**
- New shared helper `tools/listing-areas-writer.mjs` — `membershipRowsFor(geoResults)`,
  `groupByListing()`, `replaceListingAreas(rows, {SUPABASE_URL, SERVICE_KEY})` (calls the RPC
  per listing).
- `tools/fetch-listings.mjs` — builds `memberRows` from the same `geo` verdicts, scoped to the rows
  that survive on-spec + dedupe, and writes them via the RPC **after** the listings upsert. Also:
  reads `is_origin` and **drops origin areas from the demand set** (cost corollary — never scrape a
  household's home catchment).
- `tools/import-apify-runs.mjs` — the backfill importer now runs the **same** `withinGeofence` over
  the same village index, aligns `area_id`/geofence fields to the verdict for in-buffer rows, and
  writes identical memberships.

**One-off backfill (`tools/backfill-listing-areas.mjs`, new):** a pure £0 recompute over the ~1,056
already-paid-for listings, mirroring `backfill-geofence.mjs`. Emits/ writes `listing_areas` from
`withinGeofence().areas`; aligns `is_primary` to the **stored** `area_id`, and where the stored area
is no longer in-buffer (**drift**) emits a `primaryFix` to correct `listings.area_id` + geofence
fields so the junction and the primary column never disagree. Result: **4,005 membership rows across
1,056 listings, avg 3.79 areas each; 130 drift corrections.** Verified **byte-perfect** — an md5 of
the canonical `(rightmove_id|area_id|is_primary)` set computed in JS matched the same md5 computed in
Postgres exactly; `is_primary` count = 1,056 with zero `is_primary≠1` groups and zero
`is_primary.area_id ≠ listings.area_id` rows.

**Feed read (`assets/js/storage/listings/feed.js`):** resolves the household's **non-origin** active
areas, then resolves the **member listing ids** from `listing_areas` (paged `.in('area_id', …)`), then
filters listings by `rightmove_id` — replacing the old `.in('area_id', …)`. The `geofence_pass IS NOT
false` defence-in-depth, ordering, pagination, and signed-out fallback are unchanged.

**Tests + docs:** `withinGeofence().areas` assertions; new `tests/listing-areas.test.js` (writer
helper, backfill `is_primary` alignment + drift/`primaryFix`, and pure **feed contract** tests for
Problem A and Problem B); `tests/supabase-sync.test.js` (7 untracked, writer-parity, feed/origin,
`listing_areas` not-tracked). `docs/SUPABASE_SYNC.md`, `docs/DATA_MODEL.md`, `CLAUDE.md` updated.

### 3. Intended outcome (the contract this segment must ultimately meet)

> Every household sees a **true, complete, de-duplicated** reflection of **all** properties whose
> geofence falls inside **any** area they hold — never hidden by an arbitrary single stamp, never
> leaked from an area they don't hold, and never polluted by the catchment of the place they already
> live. The primary area stays meaningful for display; membership drives visibility.

Live acceptance confirmed the direction: Whiteley is out of owner scope; Shedfield (`90328152`) is now
visible to the owner via Waltham Chase membership; **395 held-area candidates + 227 origin-only hidden
= 622**, which independently reproduces the pre-session diagnostic's "m2m-only = 622" raw figure, with
origin exclusion correctly carving it back to 395.

### 4. Why this design is optimal *for a contained change*

- **Fixes the bug at the root, not the symptom.** Membership is the correct model for overlapping
  geofences; tightening radii would only have masked it and would have cut genuine rural stock.
- **Removes the *cause* of the flood** (origin area) rather than trimming its symptom, and does so
  per-household (Whiteley is *this* owner's origin, not a global property of the area).
- **Additive.** `area_id` keeps its meaning, so `page-property.js` / `page-listings.js` need no
  rewrite; the learned per-area radius tuner keeps working for free (membership reads tuned radii).
- **Verifiable.** The whole data write was checksum-gated end to end.

### 5. How it could be better — KNOWN WEAKNESSES & THE REAL REWORK (do this)

This session was deliberately tight. The flagship overhaul is still owed. Concrete targets:

1. **Collapse the three village-index loaders into ONE canonical geofence universe.** Today
   `fetch-listings.loadOutcodeMap` (repo areas, scalar radius), `backfill-geofence.loadActiveVillages`
   (repo areas, scalar), and `backfill-listing-areas.restLoadVillages` (DB areas active-OR-linked +
   tuning) all build *different* village sets. The correct universe is **areas-table-canonical
   (§18.5): every geofence-eligible area (active OR household-linked, incl. onboarding stubs), with
   `area_search_tuning` applied**. Extract one shared loader and delete the divergent ones. The
   drift found during backfill (130 rows whose stored `area_id` was no longer in-buffer, and 421
   listings that had *no* in-buffer area under the naive repo-only index) is direct evidence these
   indexes disagree in production.
2. **One geofence definition across the whole ingestion path.** `import-apify-runs` still uses
   `matchListingToArea` (20 km nearest) *and then* `withinGeofence` (3 mi) — two matchers in one tool.
   Ingestion should apply **one** decisive geofence everywhere (fetch, import, backfill, purge).
3. **Kill the dual source of truth for the primary.** `listings.area_id` and
   `listing_areas.is_primary` are two truths kept in sync by convention + the backfill's alignment.
   Prefer making `listing_areas` the single source and deriving the primary (e.g. a generated column
   or a view) so it can never drift again.
4. **Reconcile the two visibility gates.** The feed filters *both* membership *and*
   `geofence_pass IS NOT false`. If those ever disagree, a listing can be a member yet hidden. Define
   one "in scope for household H" predicate (ideally a `SECURITY DEFINER` RPC or a per-household view)
   and use it everywhere; retire the belt-and-braces.
5. **Automate re-membership.** Adding/disabling an area, or tuning a radius, silently staleifies
   existing listings' memberships until they happen to be re-fetched. Add a scheduled
   re-membership/geofence sweep (mirror `.github/workflows/refinement-run.yml`) so membership is
   always current. There is currently **no trigger** for this.
6. **Feed scale.** `feed.js` resolves member ids client-side and passes them to `.in('rightmove_id',…)`.
   Fine for hundreds; a household with tens of thousands of members would exceed the URL. Move to a
   household-scoped RPC or a materialised per-household feed.
7. **Duplicates — audit end to end (owner explicitly flagged this).** Dedupe is only by
   `rightmove_id` at fetch/import. Review: cross-run/cross-source dupes, the same physical home
   relisted under a new id, `price_history` merge correctness, and whether the feed can ever show the
   same home twice via two area memberships (it must not — membership is keyed per listing, but verify
   after the RPC/ view rework).
8. **The bulk-write path is a hazard.** Supabase egress is blocked from the sandbox, so this backfill
   had to be hand-chunked through `execute_sql` with md5 gating — slow and human-error-prone. **All
   backfills/writers must run in CI (REST with the service key)**, never by hand. Make that the only
   supported path.
9. **Origin as a first-class concept.** `is_origin` is seeded by SQL for one household. The onboarding
   / areas UI (`assets/js/areas/area-picker.js`, profile) should let a household **mark an area as
   "where I live / commute from" vs. "where I want to buy"**, feeding commute math *and* this flag.

### 6. The mandate for Fable (restating the TOP PRIORITY DIRECTIVE in context)

This pipeline — **find → pull → store → filter → organise → per-household area management** — is the
**core of the entire product** and must be raised to a new standard **before anything else**. Review
it heavily, rework it, **strip it back**, and make it optimal; leave **no dead code and no bad
mechanics**. Use §5 above as the backlog and §10.4 / §10.5 / §10.9 as the segment homes. Only once
this is genuinely world-class does the **second priority** begin: a **from-scratch, mobile-first
UI/UX overhaul** (§10.1, DESIGN.md §6) — a true rewrite, not a polish pass. Everything else ranks
below these two.
