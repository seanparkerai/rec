# Flagship exit review — Phase 2 listings-pipeline rework (2026-07-01, step 2.20)

> Reviewed against the §3 contract of [`2026-07-01-listings-m2m.md`](2026-07-01-listings-m2m.md):
> *every household sees a true, complete, de-duplicated reflection of all properties inside any
> area they hold — nothing missing, nothing doubled, nothing leaked, nothing from where they
> already live.* Authored by Fable (claude-fable-5), session of steps 2.11a–2.20.

## The four collapses (04-program.md §3) — status

1. **One geofence universe — DONE (2.4–2.7).** `tools/lib/geofence-universe.mjs` is the only
   universe builder; fetcher, both backfills, importer and radius-tune consume it (purge needs no
   universe — baseline/reaction/staleness only). The three divergent loaders are deleted; the
   REST sweep edge reads the DB universe (stubs + tuning) since 2.15.
2. **One matching predicate — DONE (2.8).** `withinGeofence()` is the only decisive matcher in
   ingestion; `matchListingToArea` and `assignArea` are deleted and the `one-matcher` contract
   rail scans them out of ever returning.
3. **One membership truth — DONE (2.9–2.11a).** `listing_areas` is the single source;
   `listings.area_id` is DERIVED by the `replace_listing_areas` RPC in-transaction; multi-primary
   is structurally impossible (partial unique index); the raw SQL write path is deleted. The 3
   repairable feed-invisible listings were restored through the canonical machinery.
4. **One visibility predicate — DONE (2.12–2.14).** `household_feed(p_household_id, …)` owns
   membership ∩ non-origin active areas ∩ curated-disable ∩ geofence ∩ baseline in ONE place,
   member-guarded, text-pinned against `classify.js`, consumed by `storage/listings/feed.js`;
   the id-list `.in()` scale wall and the double gate are retired and railed out of returning.

## Contract verification (live, 2026-07-01)

- **Nothing missing:** RPC ≡ reference predicate, exact set parity (392=392, 0 missing);
  Shedfield `90328152` visible via waltham-chase membership despite its wickham primary stamp.
- **Nothing doubled:** 0 doubled live; DISTINCT membership pinned by contract test; both-live
  relist collapse + decided-relist suppression pinned (2.17).
- **Nothing leaked:** paused links, curated disables and never-membered listings excluded
  (contract + integration tests); RPC forbidden to anon/non-members (verified live).
- **Nothing from home:** Whiteley (sole origin) — 224 origin-only listings hidden, 0 leaking;
  origin is now user-manageable in the picker (2.19).

## Weakness list (m2m log §5) — disposition

| # | Weakness | Disposition |
|---|---|---|
| 1 | Three village-index loaders | Collapsed (2.4–2.7) |
| 2 | Two matchers in ingestion | Collapsed (2.8) |
| 3 | Dual primary truth | Derived + structural (2.9–2.10) |
| 4 | Two visibility gates | One RPC (2.12–2.14) |
| 5 | No re-membership trigger | `remembership.yml` (2.15) — activates at ⚙ 2.16 |
| 6 | Feed id-list scale wall | Retired (2.13) |
| 7 | Dedupe end-to-end | Audited + importer clobber fixed (2.17) |
| 8 | Hand-chunked bulk writes | CI-only path built (2.15); MCP+checksum remains the documented fallback until ⚙ 2.16 |
| 9 | Origin seeded by SQL | First-class UI (2.19) |

Bonus finds fixed en route: purge `'new-build'` landmine (crashing, undocumented, smuggled by
fc5574a) deleted; purge junction hygiene added; importer image/price clobber fixed; four stale
sync-state high-water marks reconciled.

## What Phase 2 still owes (all owner-gated)

- **⚙ 2.16** — repo secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`).
  Until they exist: `remembership.yml` + `refinement-run.yml` no-op with a warning, and CI
  backfills can't run.
- **2.11b** — the full membership + geofence-field sweep in CI (unblocked the moment 2.16
  lands: run the `remembership` workflow once, manually). Includes the known field refresh for
  `174197870` (stale `geofence_pass=true`, correctly out of buffer under tuned radii).

## Leanness re-verify (§2.7)

Deleted this session: `excludeCuratedDisabled` (+ its tests; production-dead since 2.13),
`sqlLiteral` in the membership backfill (its `emitSql` consumer died in 2.10), the purge
`'new-build'` branch. Verified alive-with-callers: `loadActiveVillages` (repo-edge fallback),
`groupByListing`, `_attachAreaMemberships` (unscoped path + dossier), `_LISTING_COLS`.
Docs reconciled: DATA_MODEL, SUPABASE_SYNC, FETCH_SCHEDULE, REPO_MAP (added `plan/`),
tools/README (universe lib + both backfills). INTELLIGENCE_RULES checked — no stale feed claims.
