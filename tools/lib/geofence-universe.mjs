// tools/lib/geofence-universe.mjs — THE canonical geofence village universe
// (flagship step 2.4; plan/04-program.md §3 collapse #1).
//
// Universe definition (areas-table-canonical, CLAUDE.md §18.5):
//   every area that HAS coordinates and is (active !== false) OR household-linked
//   (onboarding stubs included), with area_search_tuning applied on top
//   (learned scalar radius, directional petals, exploration windows, overrides).
//
// One pure core builds it; two thin IO edges feed it:
//   buildUniverse(records, { links, tuning, now })   — pure, unit-tested
//   loadUniverseFromDb({ fetchFn, url, key })        — Supabase REST (authoritative)
//   loadUniverseFromRepo({ root })                   — data/areas/*.json materialised
//                                                      view (offline; sees NO stubs and
//                                                      NO links — repo-active only)
//
// Consumers (migrated in steps 2.5–2.8): tools/fetch-listings.mjs,
// tools/backfill-listing-areas.mjs, tools/backfill-geofence.mjs,
// tools/import-apify-runs.mjs, tools/radius-tune.mjs, tools/purge-listings.mjs.
// The three divergent per-tool loaders die with those migrations.

import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MILES_PER_KM } from '../listings-normalise.mjs';
import { resolveConfig } from '../../assets/js/refinement/config.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { RADIUS_CEIL_MI } = resolveConfig();

/**
 * Map a raw area record (DB row data or repo file) to a withinGeofence village.
 * Accepts either { geofenceRadiusMi } (raw miles) or { geofenceRadiusKm }
 * (pre-baked). Pure. (Lifted verbatim from backfill-listing-areas.toVillage.)
 */
export function toVillage(a) {
  const v = {
    id: a.id, name: a.name ?? null, outcode: String(a.outcode || '').toUpperCase(),
    lat: Number(a.lat), lng: Number(a.lng),
  };
  if (a.geofenceRadiusKm != null) v.geofenceRadiusKm = Number(a.geofenceRadiusKm);
  else if (a.geofenceRadiusMi != null && a.geofenceRadiusMi !== '') v.geofenceRadiusKm = Number(a.geofenceRadiusMi) / MILES_PER_KM;
  if (Array.isArray(a.geofenceRadiiKm)) v.geofenceRadiiKm = a.geofenceRadiiKm.map(Number);
  if (a.searchRadiusMi != null && a.searchRadiusMi !== '') v.searchRadiusMi = Number(a.searchRadiusMi);
  if (a.rightmove) v.rightmove = a.rightmove;
  return v;
}

/**
 * Apply learned per-area radii (area_search_tuning rows) onto village objects,
 * in place. Exploration windows widen to RADIUS_CEIL_MI and clear petals (the
 * full disk must be measured); otherwise override > learned search radius, with
 * the geofence scalar/petals following the tuning row. (Moved verbatim from
 * tools/fetch-listings.mjs so every consumer applies tuning identically.)
 */
export function applyRadiusTuning(villages, tuning, now = new Date()) {
  let tuned = 0;
  let exploring = 0;
  for (const v of villages) {
    const t = tuning.get(v.id);
    if (!t) continue;
    const isExploring = t.explore_until != null && new Date(t.explore_until) > now;
    if (isExploring) {
      v.searchRadiusMi = RADIUS_CEIL_MI;
      v.geofenceRadiusKm = RADIUS_CEIL_MI / MILES_PER_KM;
      v.geofenceRadiiKm = null;            // measure the full disk while exploring
      tuned += 1; exploring += 1;
      continue;
    }
    const searchMi = t.override_radius_mi != null ? Number(t.override_radius_mi)
      : t.search_radius_mi != null ? Number(t.search_radius_mi) : null;
    if (searchMi == null || !Number.isFinite(searchMi)) continue;
    v.searchRadiusMi = searchMi;
    const keepScalar = t.override_radius_mi != null ? Number(t.override_radius_mi)
      : t.geofence_radius_mi != null ? Number(t.geofence_radius_mi) : searchMi;
    v.geofenceRadiusKm = keepScalar / MILES_PER_KM;
    v.geofenceRadiiKm = Array.isArray(t.geofence_radii) && t.geofence_radii.length
      ? t.geofence_radii.map((mi) => Number(mi) / MILES_PER_KM)
      : null;
    tuned += 1;
  }
  return { tuned, exploring };
}

/**
 * The pure universe builder. @param records — [{ id, data }] area records (the DB
 * row shape; repo files are adapted by loadUniverseFromRepo). @param links — Set
 * of household-linked area ids (inclusion for disabled/stub areas). @param tuning
 * — Map area_id → area_search_tuning row. Returns { villages, outcodeMap, stats }.
 * Inclusion: coords required; (active !== false) OR linked. Villages without an
 * outcode stay in `villages` (geofence matching is coordinate-driven) but cannot
 * join `outcodeMap` (target building needs an outcode).
 */
export function buildUniverse(records, { links = new Set(), tuning = new Map(), now = new Date() } = {}) {
  const villages = [];
  let skippedNoCoords = 0;
  let skippedDisabled = 0;
  for (const r of records || []) {
    const d = r.data || {};
    const lat = d.coords?.lat, lng = d.coords?.lng;
    if (lat == null || lng == null) { skippedNoCoords += 1; continue; }
    const active = d.active !== false;
    if (!active && !links.has(r.id)) { skippedDisabled += 1; continue; }
    villages.push(toVillage({
      id: r.id, name: d.name, outcode: d.postcode, lat, lng,
      geofenceRadiusMi: d.geofenceRadiusMi, searchRadiusMi: d.searchRadiusMi,
      rightmove: d.rightmove,
    }));
  }
  const { tuned, exploring } = applyRadiusTuning(villages, tuning, now);
  const outcodeMap = new Map();
  for (const v of villages) {
    if (!v.outcode) continue;
    if (!outcodeMap.has(v.outcode)) outcodeMap.set(v.outcode, []);
    outcodeMap.get(v.outcode).push(v);
  }
  return { villages, outcodeMap, stats: { total: villages.length, tuned, exploring, skippedNoCoords, skippedDisabled } };
}

/** DB edge (authoritative): areas + household_areas + area_search_tuning via REST. */
export async function loadUniverseFromDb({
  url = (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  key = process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  fetchFn = fetch,
  now = new Date(),
} = {}) {
  if (!url || !key) throw new Error('geofence-universe: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required for db mode');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (path) => {
    const res = await fetchFn(`${url}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`geofence-universe: GET ${path} failed: ${res.status} ${await res.text()}`);
    return res.json();
  };
  const [areaRows, linkRows, tuningRows] = await Promise.all([
    get('areas?select=id,data'),
    get('household_areas?select=area_id'),
    get('area_search_tuning?select=area_id,search_radius_mi,geofence_radius_mi,override_radius_mi,geofence_radii,explore_until'),
  ]);
  const links = new Set(linkRows.map((l) => l.area_id));
  const tuning = new Map(tuningRows.map((t) => [t.area_id, t]));
  return buildUniverse(areaRows, { links, tuning, now });
}

/**
 * Repo edge (offline fallback): data/areas/*.json — the DB-materialised view.
 * Sees no household links and no stubs (never materialised) and no tuning table,
 * so it is the repo-active subset only; callers that need stubs/tuning pass them
 * in via { links, tuning } after fetching separately (the fetcher does).
 */
export async function loadUniverseFromRepo({ root = REPO_ROOT, links, tuning, now } = {}) {
  const dir = resolve(root, 'data/areas');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const records = [];
  for (const f of files) {
    const a = JSON.parse(await readFile(resolve(dir, f), 'utf8'));
    records.push({ id: a.id, data: { ...a, postcode: a.postcode } });
  }
  return buildUniverse(records, { links, tuning, now });
}
