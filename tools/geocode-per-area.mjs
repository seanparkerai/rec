#!/usr/bin/env node
// geocode-per-area.mjs — update coords in every data/areas/<id>.json
// using Nominatim (OpenStreetMap). Respects the 1 req/sec usage policy.
//
// Usage:
//   node tools/geocode-per-area.mjs               # geocode all postcode-approx areas
//   node tools/geocode-per-area.mjs --force        # re-geocode everything
//   node tools/geocode-per-area.mjs --only beech-gu34,crawley-so21
//   node tools/geocode-per-area.mjs --limit 10     # smoke run
//
// Writes to data/areas/<id>.json directly.
// Cache at data/source/geocode-cache.json to survive restarts.
//
// After running, call: node tools/build-areas.mjs && node tools/sync-content-to-supabase.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const AREAS_DIR = `${ROOT}data/areas`;
const CACHE_PATH = `${ROOT}data/source/geocode-cache.json`;
const UA = 'rec-app/1.0 (relocation planner; contact: lukeclifford.lsc@gmail.com)';
const DELAY_MS = 1200;

const args = parseArgs(process.argv.slice(2));
const force = !!args.force;
const limit = args.limit ? Number(args.limit) : Infinity;
const only = args.only ? new Set(args.only.split(',').map(s => s.trim())) : null;

const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {};

const files = readdirSync(AREAS_DIR)
  .filter(f => f.endsWith('.json'))
  .sort();

const todo = files
  .map(f => ({ file: f, id: f.replace(/\.json$/, '') }))
  .filter(({ id }) => !only || only.has(id))
  .map(({ file, id }) => {
    const area = JSON.parse(readFileSync(`${AREAS_DIR}/${file}`, 'utf8'));
    return { id, file, area };
  })
  .filter(({ area }) => force || !area.coordsSource || area.coordsSource === 'postcode-outward-approx')
  .slice(0, limit);

if (todo.length === 0) {
  console.log('Nothing to do — all areas already have accurate coords.');
  process.exit(0);
}

console.log(`Geocoding ${todo.length} area(s) via Nominatim…\n`);

let ok = 0;
const failed = [];

for (const [i, { id, file, area }] of todo.entries()) {
  const village = area.village || area.name;
  const { town, county, postcode } = area;
  const prefix = `[${i + 1}/${todo.length}] ${id}`;

  const cacheKey = `nominatim2:${id}`;
  let result = !force && cache[cacheKey] ? cache[cacheKey] : null;

  if (!result) {
    // Three progressively-less-specific queries
    const queries = [
      `${village}, ${town}, ${county}, United Kingdom`,
      `${village}, ${county}, United Kingdom`,
      `${village}, ${postcode}, United Kingdom`,
    ];

    for (const q of queries) {
      process.stdout.write(`${prefix} — querying "${q}"… `);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&addressdetails=1&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
        if (!res.ok) { console.log(`HTTP ${res.status}`); await sleep(DELAY_MS); continue; }
        const json = await res.json();
        if (json[0]) {
          const lat = Math.round(parseFloat(json[0].lat) * 1e6) / 1e6;
          const lng = Math.round(parseFloat(json[0].lon) * 1e6) / 1e6;
          const osmType = json[0].type;
          const precision = q.includes(town) ? 'place-town' : q.includes(postcode) ? 'place-postcode' : 'place-county';
          result = { lat, lng, source: `nominatim:${precision}`, osmType, query: q };
          console.log(`OK [${osmType}] → ${lat}, ${lng}`);
          break;
        } else {
          console.log('no result');
        }
      } catch (err) {
        console.log(`ERR: ${err.message}`);
      }
      await sleep(DELAY_MS);
    }
    if (!result) await sleep(DELAY_MS); // extra gap on full miss
  } else {
    console.log(`${prefix} — cached → ${result.lat}, ${result.lng}`);
  }

  if (result) {
    cache[cacheKey] = result;
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');

    const oldCoords = area.coords;
    area.coords = { lat: result.lat, lng: result.lng };
    area.coordsSource = result.source;
    writeFileSync(`${AREAS_DIR}/${file}`, JSON.stringify(area, null, 2) + '\n');

    const dLat = oldCoords ? Math.abs(oldCoords.lat - result.lat).toFixed(4) : 'n/a';
    const dLng = oldCoords ? Math.abs(oldCoords.lng - result.lng).toFixed(4) : 'n/a';
    if (oldCoords) console.log(`   moved Δlat=${dLat} Δlng=${dLng}`);
    ok++;
  } else {
    failed.push(id);
    console.log(`${prefix} — FAILED (no match from any query)`);
  }

  if (i < todo.length - 1) await sleep(DELAY_MS);
}

console.log(`\n=== Done ===`);
console.log(`Geocoded: ${ok}/${todo.length}`);
if (failed.length) {
  console.log(`Failed (${failed.length}): ${failed.join(', ')}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
