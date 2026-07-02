#!/usr/bin/env node
// backfill-listing-areas.mjs — one-off recompute of the listing↔area membership
// junction (`listing_areas`, m2m) over the listings rows we have ALREADY PAID FOR.
// Pure recompute, no Apify call (£0), mirroring tools/backfill-geofence.mjs.
//
// For every live listing it runs the SAME withinGeofence() the live fetcher uses,
// over the SAME village universe the fetcher stamps area_id with — the `areas`
// table (DB-canonical, §18.5: active OR household-linked, so household-onboarding
// STUB areas that never materialise to repo files are included) with
// area_search_tuning applied (the per-sector "petal" radii). It emits one
// membership row per CONTAINING area (g.areas). is_primary is aligned to the
// listing's EXISTING listings.area_id so the junction stays consistent with the
// single primary column (acceptance: exactly one is_primary per listing, equal to
// listings.area_id). When the stored area_id is no longer in-buffer under this
// index (drift), it falls back to the geofence-chosen primary and reports the count.
//
// Why the DB universe and not repo data/areas/*.json: the live fetcher's geofence
// runs over repo-active areas + DB household stubs (titchfield, stubbington,
// wickham-and-knowle…) + tuning. Using only repo files would drop every stub-area
// listing from the feed — a regression. The areas table is the union, so we read it.
//
// Two modes, same as backfill-geofence.mjs (withinGeofence is canonical JS, never SQL):
//
//   REST mode (CI / a machine with the service key):
//     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set → read the areas table + tuning +
//     listings, compute, write each listing's set via the replace_listing_areas RPC.
//       node tools/backfill-listing-areas.mjs            (writes)
//       DRY_RUN=1 node tools/backfill-listing-areas.mjs  (read + report, no write)
//
//   File mode (this sandbox) — REPORT-ONLY since step 2.10 (the deriving
//   replace_listing_areas RPC is the ONLY membership writer; --emit-sql deleted):
//     --from-file    <listings.json>  rows dumped via MCP (rightmove_id,lat,lng,address,postcode,area_id)
//     --villages-file <villages.json> the village index dumped via MCP, tuning ALREADY baked in
//       node tools/backfill-listing-areas.mjs --from-file L.json --villages-file V.json

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withinGeofence, MILES_PER_KM } from './listings-normalise.mjs';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

// toVillage + the DB universe now come from THE canonical loader (step 2.6):
// tools/lib/geofence-universe.mjs. Re-exported for the --villages file path + tests.
export { toVillage } from './lib/geofence-universe.mjs';
import { toVillage, loadUniverseFromDb } from './lib/geofence-universe.mjs';

/**
 * Membership rows for one listing — VERDICT-DRIVEN (step 2.10). The geofence
 * verdict's own is_primary is carried as-is; since migration
 * derived_primary_from_listing_areas (step 2.9) the replace_listing_areas RPC
 * derives listings.area_id from the junction in the same transaction, so no
 * caller aligns or fixes the column any more. `primaryDrift` is kept as
 * OBSERVABILITY ONLY: true when the stored area_id disagrees with the verdict
 * primary — a signal that the listing's geofence FIELDS (distance_mi,
 * name_match, corroborated, match_source) are stale and backfill-geofence.mjs
 * should run alongside (the 2.11 sweep runs both, fields first).
 * Pure. @returns {{ rows, primaryDrift }}
 */
export function membershipFor(row, villages) {
  const g = withinGeofence(row, { villages });
  if (!g.pass || !g.areas.length) return { rows: [], primaryDrift: false };
  const rows = g.areas.map((a) => ({
    rightmove_id: row.rightmove_id,
    area_id: a.area_id,
    distance_mi: a.distance_mi == null ? null : Number(a.distance_mi.toFixed(3)),
    is_primary: a.is_primary,
  }));
  return { rows, primaryDrift: g.area_id !== row.area_id };
}

export function summarise(perListing) {
  const withMembership = perListing.filter((p) => p.rows.length);
  const totalRows = perListing.reduce((n, p) => n + p.rows.length, 0);
  const drift = perListing.filter((p) => p.primaryDrift).length;
  const empty = perListing.length - withMembership.length;
  return { listings: perListing.length, withMembership: withMembership.length, empty, totalRows, drift };
}

// emitSql + its sqlLiteral helper deleted (steps 2.10/2.20): a raw TRUNCATE+INSERT
// write path would bypass the deriving replace_listing_areas RPC (step 2.9). The
// RPC (restReplace below) is the ONLY membership writer; --from-file runs are
// report-only.

// ── REST (CI) ─────────────────────────────────────────────────────────────────
const REST_HEADERS = () => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` });

async function restGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: REST_HEADERS() });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// The complete geofence village universe — THE canonical definition (areas
// active OR household-linked, coords required, tuning applied), via the shared
// loader's DB edge (step 2.6). The divergent local reader is deleted.
async function restLoadVillages() {
  const { villages } = await loadUniverseFromDb({ url: SUPABASE_URL, key: SERVICE_KEY });
  return villages;
}

async function restGetAllListings() {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/listings?select=rightmove_id,lat,lng,address,postcode,outcode,area_id`, {
      headers: { ...REST_HEADERS(), Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`GET listings failed: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function restReplace(perListing) {
  const { replaceListingAreas } = await import('./listing-areas-writer.mjs');
  const memberRows = perListing.flatMap((p) => p.rows);
  // The RPC derives listings.area_id from each membership set (step 2.9) — no
  // per-writer primary fixing. Drift now only means stale geofence FIELDS;
  // run tools/backfill-geofence.mjs when the report shows drift.
  const written = await replaceListingAreas(memberRows, { SUPABASE_URL, SERVICE_KEY });
  return { written };
}

function printReport(perListing, villageCount) {
  const s = summarise(perListing);
  console.log(`\n=== listing_areas backfill report ===`);
  console.log(`villages ${villageCount} · listings ${s.listings} · with membership ${s.withMembership} · no in-buffer area ${s.empty} · membership rows ${s.totalRows} · primary-drift ${s.drift}`);
  console.log(`avg areas per in-buffer listing: ${(s.totalRows / Math.max(1, s.withMembership)).toFixed(2)}`);
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const fromFile = arg('--from-file');
  const villagesFile = arg('--villages-file');

  let villages, rows;
  if (fromFile) {
    if (!villagesFile) throw new Error('--from-file requires --villages-file (dump the areas universe via MCP)');
    villages = JSON.parse(await readFile(resolve(villagesFile), 'utf8')).map(toVillage);
    rows = JSON.parse(await readFile(resolve(fromFile), 'utf8'));
    console.log(`villages from file: ${villages.length} · listings from file: ${rows.length}`);
  } else {
    if (!SERVICE_KEY) throw new Error('no service key — use --from-file <json> --villages-file <json> for the sandbox path');
    villages = await restLoadVillages();
    rows = await restGetAllListings();
    console.log(`villages from DB: ${villages.length} · listings from DB: ${rows.length}`);
  }

  const perListing = rows.map((r) => membershipFor(r, villages));
  printReport(perListing, villages.length);

  if (DRY_RUN) { console.log('\nDRY_RUN — no write.'); return; }
  if (fromFile) { console.log('\n--from-file is report-only (the RPC is the only writer).'); return; }

  const { written } = await restReplace(perListing);
  console.log(`\nreplaced membership for ${written} listing(s) — primaries derived by the RPC (2.9).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('BACKFILL CRASHED:', e); process.exit(1); });
}
