# 0009. Remove the origin-area (`is_origin`) mechanic — every active area is a target

Date: 2026-07-09

## Status

Accepted (owner directive, 2026-07-09: "is_origin is wholeheartedly an incorrectly added
mechanic — fix this immediately").

## State / rail

`household_feed` RPC (`supabase/archive/schema-household-feed.sql` mirror), the fetcher
demand set (`tools/fetch-listings.mjs`), the storage selection layer
(`assets/js/storage/listings/content.js`), the area-picker UI, and the rails that pinned
the old behaviour: `tests/contract/household-feed.test.js`,
`tests/contract/fetch-spend.test.js`, `tests/supabase-sync.test.js`,
`tests/integration/feed-scope.test.js`, `tests/unit/listing-areas.test.js`.

## Context

The 2026-07-01 listings-m2m work introduced `household_areas.is_origin`: a "home/commute
anchor" flag that excluded an area from the listing feed **and** the fetcher demand set,
on the theory that a household doesn't want to buy where it already lives. Whiteley was
seeded as the household's origin. The effect in production: Whiteley's 67 primary /
223-member catchment listings silently vanished from the feed, and the owner reported
"I'm not seeing many listings for Whiteley at all". The owner ruled the concept was never
an intended feature: the feed must show **every area in the household's list that isn't
paused**, with the normal listing filters — nothing else may hide an area.

## Decision

Remove the mechanic end to end rather than defaulting the flag off:

- **DB** — migration `remove_is_origin_from_household_feed` drops the
  `ha.is_origin = false` predicate from `household_feed` (target set = active links minus
  curated disables, nothing else) and zeroes the flag; migration
  `drop_is_origin_from_household_areas` drops the column so the retired semantics cannot
  silently return.
- **Fetcher** — the demand-set builder no longer reads or skips on `is_origin`; every
  active household link is demand.
- **Client** — `setHouseholdAreaOrigin` and the `_isOrigin` provenance field are deleted
  from the storage layer (a §16 guard-railed file — this ADR is that change's named
  approval); the area picker loses its "Home" toggle and origin chip styling.
- **Rails** — the tests that pinned origin exclusion now pin its **absence** (regexes
  assert `is_origin` does not reappear in the SQL mirror or the fetcher source).

The only per-area visibility switch that remains is the reversible pause
(`household_areas.status: active|inactive`).

## Consequences

Whiteley (and any future "home" area) surfaces in the feed and is scraped like any other
active area — the owner sees every listing their area list implies, at the cost of no
longer having a commute-anchor concept (commute math, if ever built, will need its own
non-filtering representation). `types/supabase.d.ts` was hand-trimmed to mirror the
column drop (generator unavailable in-session); regenerate at the next schema migration.
Reintroducing any feed-hiding flag requires a new ADR and new rail pins.
