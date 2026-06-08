#!/usr/bin/env node
// tools/test-postcodes-accuracy.mjs — DIAGNOSTIC (not part of the product build).
// Live-tests postcodes.io the way assets/js/areas/place-lookup.js + areas/area-match.js
// would during a stub→curated AUTO-PROMOTION, and measures how far its pin lands from
// each area's curated, web-verified ground truth (data/areas/<id>.json).
//
// For every area it:
//   1. queries /places?q=<name>  (the OS Open Names gazetteer the wizard tries first),
//   2. replicates the disambiguation guard: pick the candidate whose COUNTY matches
//      (this is what separates the right village from same-named decoys),
//   3. reports the county-matched pin's miss in miles + whether it sits inside the
//      area's own geofence radius, AND the naive first-result miss (to expose decoys),
//   4. falls back to the /outcodes/<district> centroid and measures that too.
// Read-only: hits postcodes.io, writes nothing.
//
//   Run where the network is open (a GitHub runner, or your machine):
//     node tools/test-postcodes-accuracy.mjs
//     node tools/test-postcodes-accuracy.mjs froxfield-green-gu34 privett-gu34   # custom ids
//   (The sandboxed Claude session is blocked from postcodes.io by the egress allowlist.)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Default sample: 5 accurately geo-located, non-Whiteley areas (coordsSource web-verified).
const DEFAULT_IDS = [
  'froxfield-green-gu34', 'privett-gu34', 'brown-candover-so24', 'charlwood-gu34', 'whitsbury-sp6',
];
const ids = (process.argv.slice(2).join(' ').match(/[a-z0-9-]+/g)) || DEFAULT_IDS;

const API = 'https://api.postcodes.io';
const MI_PER_KM = 0.621371;

function haversineMi(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * MI_PER_KM;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const outcodeOf = (pc) => (String(pc || '').toUpperCase().match(/^[A-Z]{1,2}\d[A-Z\d]?/) || [''])[0];

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return { result: null };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function loadArea(id) {
  const d = JSON.parse(readFileSync(resolve(process.cwd(), `data/areas/${id}.json`), 'utf8'));
  const c = d.coords || {};
  return { id, name: d.name, county: d.county, postcode: d.postcode,
           geofenceMi: d.geofenceRadiusMi ?? 3, lat: c.lat, lng: c.lng };
}

const verdict = (mi, gf) => `${mi.toFixed(2)} mi → ${mi <= gf ? 'INSIDE' : 'OUTSIDE'} ${gf}mi geofence`;

console.log(`postcodes.io accuracy probe — ${ids.length} area(s)\n${'='.repeat(64)}`);
const summary = [];

for (const id of ids) {
  let a;
  try { a = loadArea(id); } catch (e) { console.log(`\n${id}: cannot read repo record (${e.message})`); continue; }
  const truth = { lat: a.lat, lng: a.lng };
  console.log(`\n■ ${a.name} (${a.county}, ${a.postcode})  truth ${a.lat}, ${a.lng}  geofence ${a.geofenceMi}mi`);

  // 1) named-place lookup + county disambiguation
  let countyPick = null, firstMi = null, nCand = 0, nCountyMatches = 0;
  try {
    const d = await getJSON(`${API}/places?q=${encodeURIComponent(a.name)}&limit=10`);
    const rows = (d.result || []).filter((p) => p.latitude != null);
    nCand = rows.length;
    if (rows.length) {
      firstMi = haversineMi(truth, { lat: rows[0].latitude, lng: rows[0].longitude });
      const matches = rows.filter((p) => {
        const county = norm(p.county_unitary || p.district_borough || p.region);
        return county && (county.includes(norm(a.county)) || norm(a.county).includes(county));
      });
      nCountyMatches = matches.length;
      const best = (matches.length ? matches : rows)
        .map((p) => ({ p, mi: haversineMi(truth, { lat: p.latitude, lng: p.longitude }) }))
        .sort((x, y) => x.mi - y.mi)[0];
      countyPick = { mi: best.mi, viaCounty: matches.length > 0,
        county: best.p.county_unitary || best.p.district_borough || best.p.region };
    }
  } catch (e) { console.log(`  /places failed: ${e.message}`); }

  if (countyPick) {
    const decoy = nCand > 1;
    console.log(`  place lookup: ${nCand} candidate(s)${decoy ? ` (${nCountyMatches} match county "${a.county}")` : ''}`);
    console.log(`    county-matched pin: ${verdict(countyPick.mi, a.geofenceMi)}` +
      (countyPick.viaCounty ? '' : '  ⚠ NO county match — would FLAG for manual confirm'));
    if (firstMi != null && Math.abs(firstMi - countyPick.mi) > 0.01) {
      console.log(`    naive first-result: ${firstMi.toFixed(2)} mi  ⚠ decoy risk without county filter`);
    }
  } else {
    console.log('  place lookup: no usable candidate');
  }

  // 2) outcode-centroid fallback
  let ocMi = null;
  const oc = outcodeOf(a.postcode);
  try {
    const d = await getJSON(`${API}/outcodes/${oc}`);
    if (d.result) { ocMi = haversineMi(truth, { lat: d.result.latitude, lng: d.result.longitude });
      console.log(`  outcode ${oc} centroid: ${verdict(ocMi, a.geofenceMi)}`); }
    else console.log(`  outcode ${oc}: no result`);
  } catch (e) { console.log(`  outcode ${oc} failed: ${e.message}`); }

  summary.push({ id: a.name, gf: a.geofenceMi, place: countyPick?.mi ?? null,
    viaCounty: countyPick?.viaCounty ?? false, oc: ocMi });
}

// ── verdict ──────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(64)}\nSUMMARY`);
const placeHits = summary.filter((s) => s.place != null);
const inside = placeHits.filter((s) => s.place <= s.gf).length;
const flagged = summary.filter((s) => s.place != null && !s.viaCounty).length;
const worst = placeHits.reduce((m, s) => Math.max(m, s.place), 0);
const avg = placeHits.length ? placeHits.reduce((t, s) => t + s.place, 0) / placeHits.length : 0;
for (const s of summary) {
  const oc = s.oc != null ? `${s.oc.toFixed(2)}mi` : '—';
  console.log(`  ${s.id.padEnd(20)} place ${(s.place != null ? s.place.toFixed(2) + 'mi' : '—').padEnd(8)} ` +
    `${s.place != null && s.place <= s.gf ? 'IN ' : 'OUT'}  outcode ${oc}` +
    `${s.place != null && !s.viaCounty ? '   ⚠ no-county-match' : ''}`);
}
console.log(`\n  named-place pins inside geofence: ${inside}/${placeHits.length}` +
  `  ·  avg miss ${avg.toFixed(2)}mi  ·  worst ${worst.toFixed(2)}mi` +
  `  ·  flagged-for-manual: ${flagged}`);
