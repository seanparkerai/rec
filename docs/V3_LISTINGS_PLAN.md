# v3 — Live Listings architecture & build plan

> Status as of 2026-05-30: **L0 done, L1 + L2 built.** L3→L6 pending.
> Checklist mirror: `docs/CHECKLIST.md` (v3 section). Rule constants:
> `docs/INTELLIGENCE_RULES.md` §"Listing fit". Sync class: `docs/SUPABASE_SYNC.md` §1.

## What we're building
A buyer-assistant layer whose defining property is a **feedback loop**: every
reaction to a listing sharpens the next fetch, so the system gets quieter and more
accurate over time. Success = "three listings on Sunday that all fit", not "200/day".

Four committed decisions (do not relitigate without new evidence):
1. **Source** — external Apify pay-per-result actor behind our own normalised
   `listings` schema (the actor is a swappable source, never the schema).
2. **Fetch trigger** — runtime-agnostic Node script (`tools/fetch-listings.mjs`),
   on-demand / scheduled via GitHub Actions; no Supabase Edge Function (preserves the
   two-writer sync invariant — the fetcher writes via the existing service-role path).
3. **Learned preferences** — three layers: immutable reaction log → derived rules →
   manual/AI overrides. Conflicts surface as recommendations, never resolved silently.
4. **Cold start** — active diversification to generate contrastive signal.

## L0 — validated facts (probe deleted)
- Actor **`dhrumil~rightmove-scraper`** via Apify `run-sync-get-dataset-items`.
- ~23 distinct outcodes across the area set (`data/areas/*.json` `postcode` field);
  every area has `coords.{lat,lng}`. Daily cadence is ample.
- **Locked raw field mapping**: `id, url, title, displayAddress, addedOn (DD/MM/YYYY),
  bathrooms, bedrooms, propertyType, price (number), listingUpdateReason,
  firstVisibleDate, displayStatus, coordinates.{latitude,longitude}, type, description,
  images[]`. No tenure/EPC/council-tax in the list payload (null until enriched).
- **The #1 risk** is the silent wrong-region: a stale location id returns the wrong
  area (London for a Hampshire outcode) with no error. L1 validates **in-outcode via
  coordinates** (nearest known area centre within 20 km) or the address postcode token —
  never loose address regex.

## L1 — Listing engine (built)
- `supabase/schema-listings.sql` → `listings` table (typed columns + `raw_json` +
  `price_history`; `rightmove_id` unique dedup key). Migration `listings_l1` applied.
  RLS public-read; writes via service role only. **New sync class: live content.**
- `tools/listings-normalise.mjs` — pure: `normaliseRawListing`, `isInOutcode`
  (coordinate-first), `dedupeByRightmoveId`, `mergePriceHistory`. 11 unit tests.
- `tools/fetch-listings.mjs` — orchestrator: areas→outcodes → resolve
  locationIdentifier (typeahead) → Apify → normalise → validate → dedupe → nearest-area
  match → merge price_history vs existing → service-role REST UPSERT (`on_conflict=
  rightmove_id`, preserves `first_seen`) → `sync_log`. `DRY_RUN=1` supported.
- `.github/workflows/fetch-listings.yml` — `workflow_dispatch` + daily cron.
- Portal: `storage.js#getListings`, `pages/listings.html`, `assets/js/page-listings.js`,
  `assets/css/pages/listings.css`. Nav "soon" chip removed.
- **External prerequisite to see data:** run the workflow (needs `APIFY_TOKEN`,
  `APIFY_ACTOR_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` repo secrets). The page
  shows a clear empty state until then.

## L2 — Fit score (built)
- `assets/js/listing-fit.js` — `scoreListingFit` → 5-band verdict
  (`strong/possible/stretch/weak/reject`) + `contributions[]`. **Affordability is a hard
  gate** (`out-of-reach` ⇒ gated reject, filtered from the default feed), then a soft
  signal blended with beds/type/price/LISA/EPC and (L4 seam) learned weights.
  Imports `assessAffordability` — zero duplicated constants. 7 unit tests.
- `FIT_BANDS` / `FIT_WEIGHTS` / `LISTING_VERDICTS` in `intelligence-constants.js`,
  documented in `INTELLIGENCE_RULES.md`.
- The page renders 5-band fit dots, verdict labels, status/price-drop tags, and a
  per-row **"Why this verdict"** expander (the explainability contract, visible from L2).

## L3 — Reaction log + Layer 1 (next)
- `listing_reactions` table (append-only; `user_id`, `listing_id`, `reaction`, `reason`,
  **`listing_snapshot`** = signals at time of reaction, `created_at`). Migration via MCP.
- Reaction vocabulary in three buckets — **only graded preference signals train Layer 2**;
  workflow events and *absence* (`ignored`/passive `viewed`) must NOT train (the single
  most important guardrail — busy weeks would otherwise teach suppression).
- Reaction UI on each row with one-tap **reason chips** on reject (a reason-tagged
  rejection is ~5× the training value of a bare one).
- Personal lifecycle (new→saved→viewed→offered→rejected) = a small status map on the
  existing `shortlist` row, NOT a parallel state machine.

## L4 — Learning + cold start
- `learned_preferences` (one row/household): `derived` (Layer 2) + `overrides` (Layer 3),
  each override storing `derived_weight_at_set` so "reactions since the override" is
  computable. Re-derivation rebuilds `derived` without touching `overrides`.
- Re-derivation: **base-rate calibrated** (weight only for signals that discriminate
  within the shown set — else it just re-learns `criteria`), **recency-decayed**,
  **traceable** (each weight records the `reaction_ids` that produced it).
- The scoring engine already reads `learnedPrefs` (the L4 seam in `listing-fit.js`).

## L5 / L6
- L5: meta-observations + conflict prompts (3-condition trigger, 14-day dismissal) + an
  NBA strip above the existing dashboard tiles (computed on load from timestamps).
- L6: `pages/property.html` dossier + `property_outreach` join (extends the outreach
  renderer; dual lifecycle timelines never merged). Per user priority, L6 (bookings/
  outreach) is lower priority than the listings/learning core (L1–L4).

## Failure modes to keep in view
Apify abandonment → our-schema indirection swaps source in one file. Silent wrong-region
→ coordinate validation on every row (done). `ignored`-as-negative → treated as
unlabelled (L3). Passive `viewed` training → held out (L3). Conflict prompts too eager →
3-condition trigger (L5).
