#!/usr/bin/env node
// tools/test-postcodes-accuracy.mjs — DIAGNOSTIC (not part of the product build).
// Live-tests postcodes.io the way assets/js/areas/place-lookup.js does, and measures
// how far its answer for "Whiteley" lands from the curated, web-researched ground
// truth (data/areas/whiteley-po15.json). Prints the miss in miles and whether it
// falls inside the area's 3-mile geofence.
//
//   Run where the network is open:  node tools/test-postcodes-accuracy.mjs
//   (This repo's remote session blocks outbound to postcodes.io, so run it locally.)

const TRUTH = { name: 'Whiteley', lat: 50.8809, lng: -1.2524, outcode: 'PO15', geofenceMi: 3 };
const API = 'https://api.postcodes.io';
const MI_PER_KM = 0.621371;

function haversineMi(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * MI_PER_KM;
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const line = (mi) => {
  const inside = mi <= TRUTH.geofenceMi;
  return `${mi.toFixed(2)} mi off  →  ${inside ? 'INSIDE' : 'OUTSIDE'} the ${TRUTH.geofenceMi}-mile geofence`;
};

console.log(`GROUND TRUTH  Whiteley (web-research): ${TRUTH.lat}, ${TRUTH.lng}  ·  geofence ${TRUTH.geofenceMi} mi\n`);

// 1) /places?q=whiteley — the OS Open Names gazetteer point (the wizard's first try).
//    This is the one that should be accurate to within a few hundred metres — BUT
//    watch for a same-named decoy (there is a "Whiteley Village" in Surrey).
try {
  const d = await getJSON(`${API}/places?q=whiteley&limit=8`);
  const rows = d.result || [];
  console.log(`/places?q=whiteley  → ${rows.length} candidate(s):`);
  for (const p of rows) {
    const county = p.county_unitary || p.district_borough || p.region || '—';
    if (p.latitude == null) { console.log(`  ${p.name_1}  (${county})  no coords`); continue; }
    const mi = haversineMi(TRUTH, { lat: p.latitude, lng: p.longitude });
    console.log(`  ${p.name_1}  (${county})  ${p.latitude}, ${p.longitude}  →  ${line(mi)}`);
  }
} catch (e) { console.log(`/places failed: ${e.message}`); }

// 2) /outcodes/PO15 — the outcode CENTROID (the coarse fallback if only a postcode is
//    known). Expect this to be noticeably further off than the named place point,
//    because PO15 also covers Segensworth/Sarisbury, not just Whiteley village.
try {
  const d = await getJSON(`${API}/outcodes/${TRUTH.outcode}`);
  const r = d.result;
  const mi = haversineMi(TRUTH, { lat: r.latitude, lng: r.longitude });
  console.log(`\n/outcodes/${TRUTH.outcode} centroid  ${r.latitude}, ${r.longitude}  →  ${line(mi)}`);
} catch (e) { console.log(`\n/outcodes failed: ${e.message}`); }
