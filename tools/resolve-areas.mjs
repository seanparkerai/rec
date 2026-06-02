#!/usr/bin/env node
// resolve-areas.mjs — L7.3: give every active area its TIGHTEST Rightmove
// locationIdentifier (+ default radii) so an address, a town, a village name OR a
// postcode all resolve to the right area — and so the L7.4 clustered fetch can
// search small disks around villages instead of whole districts.
//
// Resolution per area (tightest wins):
//   1 postcodes.io reverse-geocode the village `coords` → nearest full postcode →
//     Rightmove typeahead(postcode) → a POSTCODE^ identifier (quality "tight").
//   2 else typeahead("<name>, <county>") → a REGION^ whose label matches the
//     village AND whose location is within the disambiguation radius of `coords`
//     (kills "Newtown"-class namesakes — there IS a Newtown, SP5) → "tight".
//   3 else fall back to the area's outcode identifier → quality "coarse".
//
// Consumes data/source/area-coord-verification.json (L7.0a): any area hard-flagged
// or possible_namesake_mismatch there is resolved with extra scrutiny and never
// auto-accepted as "tight" without clearing the distance guard.
//
// Writes the `rightmove` block + default geofenceRadiusMi/searchRadiusMi/active
// into each data/areas/<id>.json and (with a service key) mirrors to the Supabase
// `areas` content table per CLAUDE.md §18.3. Emits a resolution report listing the
// `coarse` villages that lean entirely on the geofence.
//
// NETWORK: needs los.rightmove.co.uk + api.postcodes.io. Runs in CI / any host
// where those are allowlisted. Re-runnable and idempotent; DRY_RUN by default.
//
// Usage:
//   node tools/resolve-areas.mjs --write            (resolve + write area JSONs)
//   DRY_RUN=1 node tools/resolve-areas.mjs          (resolve + report, no write)

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { haversineKm, normaliseName } from './listings-normalise.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A typeahead hit implying a location farther than this from the stored coords is
// a different place with the same name — reject it (the namesake guard).
export const DISAMBIGUATION_KM = 8;
export const DEFAULT_GEOFENCE_MI = 3;
export const DEFAULT_SEARCH_MI = 3;

const BROWSER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-GB,en;q=0.9',
  Referer: 'https://www.rightmove.co.uk/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

// ── pure decision helpers (unit-tested) ──────────────────────────────────────

/** Is a candidate location close enough to the stored coords to be the same place? */
export function withinDisambiguation(coords, candidate, km = DISAMBIGUATION_KM) {
  if (!coords || !candidate || candidate.lat == null) return false;
  return haversineKm(coords, candidate) <= km;
}

/** Classify a resolved identifier's quality from its type. POSTCODE/STATION are
 *  point-tight; a name-matched REGION within the guard is tight; an OUTCODE is coarse. */
export function classifyIdentifier(type, { nameConfirmed = false, distanceOk = false } = {}) {
  const t = String(type || '').toUpperCase();
  if (t === 'OUTCODE') return 'coarse';
  if (t === 'POSTCODE' || t === 'STATION') return 'tight';
  if (t === 'REGION') return nameConfirmed && distanceOk ? 'tight' : 'coarse';
  return 'coarse';
}

/** Parse a typeahead match into { id, type, label }. Mirrors fetch-listings. */
export function parseTypeaheadMatch(m) {
  const id = String(m?.locationIdentifier || m?.identifier || m?.id || m?.locationId || m?.value || '');
  const type = String(m?.type || m?.locationType || (id.split('^')[0] || '')).toUpperCase();
  const label = String(m?.displayName || m?.displayText || m?.name || m?.label || m?.text || '');
  return { id: id.includes('^') ? id : (type && /^\d+$/.test(id) ? `${type}^${id}` : id), type, label };
}

// ── network ───────────────────────────────────────────────────────────────────
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET JSON with small exponential backoff on transient failures (429/5xx/network). */
async function getJson(url, { headers = {}, tries = 3 } = {}) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return res.json();
      if (res.status !== 429 && res.status < 500) return null;   // hard miss, don't retry
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) { lastErr = e; }
    await wait(300 * (i + 1));
  }
  throw lastErr || new Error('getJson failed');
}

/**
 * Nearest full postcode to a coordinate. Rural village centres often have no
 * postcode within the default search radius, so fall back to wideSearch=true
 * (postcodes.io expands the radius up to ~20km) — this is what lets the sparse
 * Hampshire/Wiltshire villages resolve to a tight POSTCODE rather than an outcode.
 */
async function reverseGeocode(lat, lng) {
  const base = `https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&limit=1`;
  const headers = { Accept: 'application/json' };
  const near = await getJson(base, { headers });
  const hit = near?.result?.[0]?.postcode;
  if (hit) return hit;
  const wide = await getJson(`${base}&wideSearch=true`, { headers });
  return wide?.result?.[0]?.postcode ?? null;
}

async function geocodePlace(name) {
  const j = await getJson(`https://api.postcodes.io/places?q=${encodeURIComponent(name)}&limit=5`, { headers: { Accept: 'application/json' } }).catch(() => null);
  return (j?.result || []).map((p) => ({ lat: p.latitude, lng: p.longitude, name: p.name_1 }));
}

async function typeahead(query) {
  const j = await getJson(`https://los.rightmove.co.uk/typeahead?query=${encodeURIComponent(query)}&limit=10`, { headers: BROWSER_HEADERS });
  const matches = j?.matches || j?.typeAheadLocations || j?.locations || j?.suggestions || [];
  return matches.map(parseTypeaheadMatch).filter((m) => m.id);
}

// ── per-area resolution ─────────────────────────────────────────────────────
async function resolveArea(area, flaggedIds) {
  const coords = area.coords && area.coords.lat != null ? { lat: Number(area.coords.lat), lng: Number(area.coords.lng) } : null;
  const outcode = String(area.postcode || '').toUpperCase();
  const flagged = flaggedIds.has(area.id);

  // 1 — postcode path (point-tight, safe by construction).
  if (coords) {
    try {
      const pc = await reverseGeocode(coords.lat, coords.lng);
      if (pc) {
        const hits = await typeahead(pc);
        const hit = hits.find((h) => h.type === 'POSTCODE') || hits[0];
        if (hit && hit.type === 'POSTCODE') {
          return { locationIdentifier: hit.id, identifierType: 'POSTCODE', identifierQuality: 'tight', resolvedAt: new Date().toISOString() };
        }
      }
    } catch { /* fall through to name path */ }
  }

  // 2 — name path (REGION), guarded by the namesake distance check.
  try {
    const hits = await typeahead(`${area.name}, ${area.county || ''}`.trim());
    const region = hits.find((h) => h.type === 'REGION' && normaliseName(h.label).includes(normaliseName(area.name)));
    if (region && coords) {
      const places = await geocodePlace(area.name);
      const distanceOk = places.some((p) => withinDisambiguation(coords, p));
      const quality = classifyIdentifier('REGION', { nameConfirmed: true, distanceOk });
      // A flagged area must clear the distance guard before being trusted as tight.
      if (quality === 'tight' && !(flagged && !distanceOk)) {
        return { locationIdentifier: region.id, identifierType: 'REGION', identifierQuality: 'tight', resolvedAt: new Date().toISOString() };
      }
    }
  } catch { /* fall through to outcode */ }

  // 3 — coarse fallback: the outcode identifier (leans entirely on the geofence).
  try {
    const hits = await typeahead(outcode);
    const oc = hits.find((h) => h.type === 'OUTCODE') || hits[0];
    if (oc) return { locationIdentifier: oc.id, identifierType: 'OUTCODE', identifierQuality: 'coarse', resolvedAt: new Date().toISOString() };
  } catch { /* network unavailable */ }

  return null;
}

// ── area-JSON write + Supabase mirror ────────────────────────────────────────
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function mirrorArea(area) {
  if (!SERVICE_KEY) return false;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/areas?on_conflict=id`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id: area.id, data: area }]),
  });
  return res.ok;
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  const write = process.argv.includes('--write');
  const dir = resolve(root, 'data/areas');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));

  let flaggedIds = new Set();
  try {
    const rep = JSON.parse(await readFile(resolve(root, 'data/source/area-coord-verification.json'), 'utf8'));
    flaggedIds = new Set([...(rep.hardFlagged || []), ...(rep.nameUnconfirmed || [])].map((r) => r.id));
  } catch { console.warn('no L7.0a report found — proceeding without extra-scrutiny set'); }

  const report = { generatedAt: new Date().toISOString(), tight: 0, coarse: 0, unresolved: 0, coarseList: [] };
  let mirrored = 0;
  // Be polite to Rightmove's typeahead across ~195 areas (avoid rate-limiting).
  const throttleMs = Number(process.env.RESOLVE_THROTTLE_MS) || 150;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const f of files) {
    const path = resolve(dir, f);
    const area = JSON.parse(await readFile(path, 'utf8'));
    if (area.active === false) continue;
    const rm = await resolveArea(area, flaggedIds);
    if (throttleMs) await sleep(throttleMs);
    if (!rm) { report.unresolved += 1; console.log(`  ? ${area.id}: unresolved (network?)`); continue; }
    if (rm.identifierQuality === 'tight') report.tight += 1; else { report.coarse += 1; report.coarseList.push(area.id); }
    console.log(`  ${rm.identifierQuality === 'tight' ? '✓' : '·'} ${area.id}: ${rm.identifierType}^… (${rm.identifierQuality})`);
    if (write) {
      area.rightmove = rm;
      if (area.geofenceRadiusMi == null) area.geofenceRadiusMi = DEFAULT_GEOFENCE_MI;
      if (area.searchRadiusMi == null) area.searchRadiusMi = DEFAULT_SEARCH_MI;
      if (area.active == null) area.active = true;
      await writeFile(path, JSON.stringify(area, null, 2) + '\n');
      if (await mirrorArea(area)) mirrored += 1;
    }
  }

  await writeFile(resolve(root, 'data/source/area-resolution.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`\n${report.tight} tight · ${report.coarse} coarse · ${report.unresolved} unresolved · mirrored ${mirrored}`);
  if (report.coarseList.length) console.log(`coarse (geofence-only): ${report.coarseList.join(', ')}`);
  if (!write) console.log('(dry run — pass --write to persist + mirror)');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('RESOLVE CRASHED:', e); process.exit(1); });
}

export { resolveArea, reverseGeocode };
