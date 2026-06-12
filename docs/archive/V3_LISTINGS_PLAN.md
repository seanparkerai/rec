# v3 — Live Listings architecture & build plan

> Status as of 2026-06-04: **L0–L6 done** + **Convergence pass (P1–P6) done** — baseline gate,
> physical-property identity, fingerprint suppression/dedup, render perf, and a maintenance purge
> (see "Convergence" below). L6 = dossier only; outreach join deferred by request.
> Checklist mirror: `docs/CHECKLIST.md` (v3 section). Rule constants:
> `docs/INTELLIGENCE_RULES.md` §"Listing fit" + §"Listing identity, suppression & purge".
> Sync class: `docs/SUPABASE_SYNC.md` §1.

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

## L4 — Learning + cold start (built)
- Implemented 2026-05-31: pure `assets/js/learned-preferences.js`, `learned_preferences` table
  (migration `learned_preferences_l4`), `storage.js` get/save/recompute, listings re-ranking +
  Browse/Review triage deck + cold-start diversification, and the `USE_LEARNED=1` optimised fetch.
  Algorithm + constants documented in `INTELLIGENCE_RULES.md §"Learned preferences"`.
- `learned_preferences` (one row/household): `derived` (Layer 2) + `overrides` (Layer 3),
  each override storing `derived_weight_at_set` so "reactions since the override" is
  computable. Re-derivation rebuilds `derived` without touching `overrides`.
- Re-derivation: **base-rate calibrated** (weight only for signals that discriminate
  within the shown set — else it just re-learns `criteria`), **recency-decayed**,
  **traceable** (each weight records the `reaction_ids` that produced it).
- The scoring engine already reads `learnedPrefs` (the L4 seam in `listing-fit.js`).

## L5 / L6
- L5 (built 2026-05-31): meta-observations + conflict prompts (3-condition trigger, 14-day
  dismissal) + an NBA strip above the dashboard tiles. Pure core `assets/js/meta-observations.js`;
  dismissals on `learned_preferences.dismissals`; documented in `INTELLIGENCE_RULES.md
  §"Recommendation loop"`.
- L6: `pages/property.html` dossier (built 2026-05-31 — gallery, fit "why", price history, area
  context, reaction/status). The `property_outreach` join is **deferred by request** (outreach left
  out entirely for now). Per user priority, L6 (bookings/outreach) is lower priority than the
  listings/learning core (L1–L4).

## Convergence — baseline gate · identity · suppression · purge (P1–P6, 2026-06-04)
The feed converges on "a handful that fit" by **intelligence, never a cap**. There is no
cap on Apify pulls or on listings shown (`RESULTS_PER_OUTCODE=50` stays a cost guard); the
small daily review count *emerges* from filtering, dedup, suppression and fit-ranking.

- **P1 — baseline gate (single source of truth).** `assets/js/listings/classify.js`: the
  one houses+bungalows allow-list + price/beds band — `passesBaseline`, `BASELINE_PRICE_MIN`
  £100k / `BASELINE_PRICE_MAX` £450k / `BASELINE_MIN_BEDS` 2. Applied post-normalise by BOTH
  writers (`tools/fetch-listings.mjs`, `tools/import-apify-runs.mjs`) — the importer's missing
  gate was the original pollution. `flags.js` also HIDES an excluded type in the feed.
- **Physical-property fingerprint.** `propertyFingerprint(l)` = price-insensitive
  `type|beds|street|town` (null when the address is too coarse — never false-merge).
  `rightmove_id` is NOT stable (a re-list gets a new id), so the fingerprint is the identity
  that survives re-lists and collapses duplicates.
- **P2 — suppression + dedup in the feed.** `assets/js/listings/suppress.js`
  (`decidedSets` / `isDecided` / `dedupeByFingerprint` / `dedupeNewestByFingerprint`), wired
  into `page-listings.js` + `page-saved-listings.js`: a property whose LATEST reaction is
  like/reject is "decided" and never returns as a fresh card (matched by id AND fingerprint);
  duplicates collapse to one; `pass` stays resurfaceable. Feed and Saved both derive from the
  live append-only log (`latestPerListing`) — no more cached-map disagreement.
- **P3 — render perf (never a cap).** Reviewed groups build their cards on first expand; fit
  scores memoise per `rightmove_id` (cache cleared on retrain). Every listing stays available.
- **P4 — maintenance purge.** `tools/purge-listings.mjs` deletes heavy `listings` rows that
  are baseline-violating, rejected-and-old (half-life ~14d, by id AND fingerprint), or stale
  (~30d) — never a liked row. The reject SIGNAL persists in the append-only `listing_reactions`
  log, so suppression survives a purge. Reuses `passesBaseline` + `propertyFingerprint` (no
  drift). DRY RUN unless `APPLY=1`.
- **P5 — one-off cleanup (2026-06-04).** Purged 1,671 not-liked baseline-violators via MCP
  (listings 3,086→1,415; feed-visible 2,539→1,252; 0 violators remain; 20 liked rows + the
  3,244-row reaction log preserved).
- **P7 — removed-area purge (2026-06-04, user-approved).** Deleted 551 not-liked `listings` across
  the 9 inactive (`active:false`) areas tagged `reject/removed_area` (listings 1,415→864; feed-visible
  1,252→737). The 3 once-liked homes in those areas were KEPT (ever-liked is never purged) plus 1
  active-area straggler; the 3,244-row reaction log is untouched; all 551 deletes logged to `sync_log`.
- **Learned auto-narrowing stays OFF** (`USE_LEARNED` unset; `.github/workflows/*` untouched).

## Failure modes to keep in view
Apify abandonment → our-schema indirection swaps source in one file. Silent wrong-region
→ coordinate validation on every row (done). `ignored`-as-negative → treated as
unlabelled (L3). Passive `viewed` training → held out (L3). Conflict prompts too eager →
3-condition trigger (L5).
