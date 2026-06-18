# tools/ — build, sync & data scripts

Node ES-module scripts (`.mjs`) that build content, sync with Supabase, fetch market data,
and run the test harness. This is the **index**; each script's own header comment is the
detailed spec. Retired one-shots live in [`archive/`](archive/README.md).

> Run from the repo root, e.g. `node tools/area-status.mjs`. The three most-used have npm
> aliases: `npm test` (harness), `npm run build` (areas), `npm run fonts`. See `package.json`.

## Test & verification
| Script | What it does | When to run |
|--------|--------------|-------------|
| `run-intelligence-tests.mjs` | The single test harness — runs every `tests/*.test.js` in Node plus the Supabase sync suite. `npm test`. | Before every commit (CLAUDE.md §6). |
| `lint-responsive.mjs` | Responsive-doctrine lint (DESIGN.md §6); exported into the harness. | With any CSS/layout change. |
| `check-supabase-freshness.mjs` | Session-start freshness check — local snapshot vs `MAX(updated_at)` per table (CLAUDE.md §8 Step 0). | Start of a data session. |
| `test-postcodes-accuracy.mjs` | Diagnostic: live postcodes.io accuracy vs curated ground truth. Not part of the build. | Ad-hoc, when geocoding looks off. |

## Areas — build & content
| Script | What it does | When to run |
|--------|--------------|-------------|
| `build-areas.mjs` | Regenerates `data/areas.json` (index) + per-area files from `data/source/villages.csv` + content. `npm run build`. | After an area id/postcode migration or content change. |
| `sync-areas-from-supabase.mjs` | DB → repo materialiser: pulls the `areas` mirror into `data/areas/*.json` (the anti-drift path, CLAUDE.md §2/§18.5). `npm run sync-areas`. | After writing area content to Supabase. |
| `sync-content-to-supabase.mjs` | Generates UPSERT SQL to push repo content JSON (`house_types`, areas) into Supabase. | When a repo-canonical content mirror drifts. |
| `backfill-content-direct.mjs` | Direct service-role backfill of `areas` + `house_types` into Supabase. | One-off content backfills. |
| `area-status.mjs` | Progress report — which areas are researched/partial/stub and which fields are missing. `npm run area-status`. | Start of a content session / to find the next task. |
| `area-fields.mjs` | Single source of truth for which fields live in the index vs detail vs content. Imported by other area tools. | Library — not run directly. |
| `geocode-areas.mjs` | Populates `coords` on every area via Nominatim; resumable, cached. | When areas lack coordinates. |
| `verify-area-coords.mjs` | Proves each active area's coords actually point at the named village before the geofence trusts them (L7.0a). | Before trusting geofencing. |
| `resolve-areas.mjs` | Assigns each active area its tightest Rightmove `locationIdentifier` + default radii (L7.3). | When the active-area set changes. |

## Listings (market data, v3 L1)
| Script | What it does | When to run |
|--------|--------------|-------------|
| `fetch-listings.mjs` | The primary scheduled fetcher — runs the Apify actor, normalises, validates, upserts to Supabase. | Scheduled (GitHub Actions); see `docs/FETCH_SCHEDULE.md`. |
| `listings-normalise.mjs` | Pure normalisation/validation/dedup helpers; consumed by `fetch-listings.mjs` and tests. | Library — not run directly. |
| `import-apify-runs.mjs` | Backfills `listings` from existing Apify dataset items (no new actor run). | One-off backfill. |
| `backfill-geofence.mjs` | Recomputes the geofence verdict over existing `listings` rows (pure recompute, no Apify). | After geofence-logic changes. |
| `purge-listings.mjs` | Maintenance purge of the heavy `listings` table. | Periodic maintenance. |

## Refinement engine (v3 L4)
| Script | What it does | When to run |
|--------|--------------|-------------|
| `refinement-run.mjs` | Stage 3 scheduled driver — snapshots reactions, runs the engine, emits SQL. | Scheduled; see `docs/REFINEMENT_README.md`. |
| `refinement-scope-check.mjs` | Stage 8 invariant check for the scrape-scope lever (drift in probation state). | After refinement changes. |

## Misc / dev
| Script | What it does | When to run |
|--------|--------------|-------------|
| `import-trading212.mjs` | One-shot Trading 212 CSV → JSON aggregator (into a fixture). | When refreshing the investment fixture. |
| `insert-content.mjs` | Splices a content block into a (possibly large) file at a marker (CLAUDE.md §2). | For large content writes. |
| `fetch-fonts.mjs` | One-shot self-hosted woff2 subset downloader. `npm run fonts`. | When the font set changes. |

See [`docs/REPO_MAP.md`](../docs/REPO_MAP.md) for the whole-repo map.
