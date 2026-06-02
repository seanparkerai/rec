#!/usr/bin/env node
// geocode-areas.mjs — populate `coords` on every record in data/areas.json.
//
// Default provider is Nominatim (OpenStreetMap). Per the Nominatim usage policy
// (https://operations.osmfoundation.org/policies/nominatim/) we:
//   - send a descriptive User-Agent that identifies the app + a contact email,
//   - never exceed 1 request/second (we wait 1100 ms between calls),
//   - cache every response on disk so re-runs are free (and resumable).
//
// Usage:
//   node tools/geocode-areas.mjs                 # geocode every area still missing coords
//   node tools/geocode-areas.mjs --force         # re-geocode every area (overwrite cache)
//   node tools/geocode-areas.mjs --only beech-gu34,froxfield-gu32
//   node tools/geocode-areas.mjs --limit 20      # process at most 20 (useful for smoke runs)
//   node tools/geocode-areas.mjs --provider postcodesio   # use api.postcodes.io as a fallback
//                                                          (postcode-centroid only; less precise
//                                                          than place-name geocoding but free
//                                                          + no rate limit)
//
// Cache lives at data/source/geocode-cache.json. Safe to commit; it makes future
// runs deterministic and avoids hammering the provider.
//
// Exit status: non-zero if any record could not be geocoded after retries.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AREAS_PATH = `${ROOT}data/areas.json`;
const CACHE_PATH = `${ROOT}data/source/geocode-cache.json`;
const UA = 'rec-app/1.0 (relocation planner; contact: lukeclifford.uk@gmail.com)';
const NOMINATIM_DELAY_MS = 1100;

const args = parseArgs(process.argv.slice(2));
const provider = args.provider || 'nominatim';
const force = !!args.force;
const limit = args.limit ? Number(args.limit) : Infinity;
const only = args.only ? new Set(args.only.split(',').map((s) => s.trim())) : null;

const areas = JSON.parse(readFileSync(AREAS_PATH, 'utf8'));
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};

const todo = areas.filter((a) => {
  if (only && !only.has(a.id)) return false;
  if (!force && a.coords && typeof a.coords.lat === 'number') return false;
  return true;
}).slice(0, limit);

if (todo.length === 0) { console.log('Nothing to do — every area already has coords.'); process.exit(0); }

console.log(`Geocoding ${todo.length} area(s) via ${provider} …`);

let ok = 0;
let failed = [];
for (const [i, area] of todo.entries()) {
  const cacheKey = `${provider}:${area.id}`;
  let result = cache[cacheKey];
  if (!result || force) {
    try {
      result = provider === 'postcodesio'
        ? await geocodePostcodesIO(area)
        : await geocodeNominatim(area);
      cache[cacheKey] = result;
      // Persist cache after every successful call so a crash never costs more than one request.
      writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
    } catch (err) {
      console.warn(`  [${i + 1}/${todo.length}] ${area.id} — ${err.message}`);
      failed.push(area.id);
      if (provider === 'nominatim') await sleep(NOMINATIM_DELAY_MS);
      continue;
    }
    if (provider === 'nominatim') await sleep(NOMINATIM_DELAY_MS);
  }
  if (result && typeof result.lat === 'number' && typeof result.lng === 'number') {
    area.coords = { lat: result.lat, lng: result.lng };
    area.coordsSource = result.source;
    ok++;
    console.log(`  [${i + 1}/${todo.length}] ${area.id} → ${result.lat}, ${result.lng} (${result.source})`);
  } else {
    failed.push(area.id);
    console.warn(`  [${i + 1}/${todo.length}] ${area.id} — no match`);
  }
}

writeFileSync(AREAS_PATH, `${JSON.stringify(areas, null, 2)}\n`);
console.log(`\nDone. ${ok} geocoded, ${failed.length} failed.`);
if (failed.length) {
  console.log('Failed ids:', failed.join(', '));
  process.exit(1);
}

// ---------- providers ----------

async function geocodeNominatim(area) {
  // Try most-specific query first, then progressively less specific so rural
  // villages with no OSM entry still resolve to a postcode centroid.
  const attempts = [
    `${area.village}, ${area.town}, ${area.county}, UK`,
    `${area.village}, ${area.county}, UK`,
    `${area.postcode}, UK`,
  ];
  for (const q of attempts) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error(`Nominatim ${res.status} for "${q}"`);
    const json = await res.json();
    if (json[0]) {
      return { lat: Number(json[0].lat), lng: Number(json[0].lon), source: `nominatim:${q === attempts[2] ? 'postcode' : 'place'}` };
    }
    await sleep(NOMINATIM_DELAY_MS);
  }
  throw new Error('no Nominatim match');
}

async function geocodePostcodesIO(area) {
  // postcodes.io accepts outward codes via /outcodes/{outcode}. Less precise
  // (one centroid per ~3000 addresses) but free and rate-limit-free.
  const url = `https://api.postcodes.io/outcodes/${encodeURIComponent(area.postcode)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`postcodes.io ${res.status}`);
  const { result } = await res.json();
  if (!result) throw new Error('no result');
  return { lat: result.latitude, lng: result.longitude, source: 'postcodesio:outcode' };
}

// ---------- helpers ----------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; }
    else { out[key] = true; }
  }
  return out;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
