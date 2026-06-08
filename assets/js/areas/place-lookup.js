// areas/place-lookup.js — free, keyless UK place lookup over postcodes.io, with the
// match-or-create flow that links a chosen village to an existing catalog area or
// creates a household-onboarding stub. Browser-only (network); the pure match/slug/
// haversine logic it relies on lives in ./area-match.js and is unit-tested in the
// Node harness. Consumed by the onboarding wizard (Phase 3) and any "add an area" UI.
import { matchCatalogArea, postcodeDistrict } from './area-match.js';
import { getAreaCatalog, addHouseholdAreaByCatalog, createAreaStubAndLink } from '../storage.js';

const API = 'https://api.postcodes.io';
const _cache = new Map(); // url → parsed JSON (in-memory, per page load)

async function _getJSON(url) {
  if (_cache.has(url)) return _cache.get(url);
  try {
    const res = await fetch(url);
    if (!res.ok) { _cache.set(url, null); return null; }
    const json = await res.json();
    _cache.set(url, json);
    return json;
  } catch {
    return null; // offline / blocked — caller shows "no matches"
  }
}

// Look up a free-text query against OS Open Names places AND (when it looks like a
// postcode) the postcode autocomplete. Returns a small, de-duplicated array of
// normalised candidates: { name, county, lat, lng, postcodeDistrict, kind, postcode? }.
export async function lookupPlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const out = [];

  const places = await _getJSON(`${API}/places?q=${encodeURIComponent(q)}&limit=8`);
  for (const p of places?.result ?? []) {
    if (!p?.name_1) continue;
    out.push({
      name: p.name_1,
      county: p.county_unitary ?? p.district_borough ?? p.region ?? null,
      lat: p.latitude ?? null,
      lng: p.longitude ?? null,
      postcodeDistrict: '',
      kind: 'place',
    });
  }

  // Postcode-shaped queries also resolve via the postcode autocomplete so a user can
  // type "SO24" or a full postcode and pin the exact location.
  if (/[a-z]{1,2}\d/i.test(q)) {
    const pc = await _getJSON(`${API}/postcodes?q=${encodeURIComponent(q)}&limit=5`);
    for (const r of pc?.result ?? []) {
      if (!r?.postcode) continue;
      out.push({
        name: r.parish ?? r.admin_ward ?? r.postcode,
        county: r.admin_county ?? r.region ?? null,
        lat: r.latitude ?? null,
        lng: r.longitude ?? null,
        postcodeDistrict: postcodeDistrict(r.postcode),
        postcode: r.postcode,
        kind: 'postcode',
      });
    }
  }

  // De-dup on name+district so the place and postcode rows for the same village merge.
  const seen = new Set();
  return out.filter((r) => {
    const k = `${(r.name || '').toLowerCase()}|${r.postcodeDistrict}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Debounced lookup: returns a function you call with the current query string; it
// invokes `cb(candidates)` ~`ms` after typing stops, ignoring stale responses so an
// earlier in-flight request can never overwrite a later one.
export function debouncedLookup(cb, ms = 300) {
  let timer = null;
  let seq = 0;
  return (query) => {
    clearTimeout(timer);
    const mine = ++seq;
    timer = setTimeout(async () => {
      const candidates = await lookupPlaces(query);
      if (mine === seq) cb(candidates);
    }, ms);
  };
}

// Match-or-create: link the chosen place to an EXISTING catalog area when it is
// clearly the same village (name+county align AND within ~1.5km OR same postcode
// district), otherwise create a provisional household-onboarding stub. The optional
// `confirm(area)` hook lets the UI ask "Same as <village>?" before linking; returning
// false from it falls through to stub creation. Resolves to
// { action: 'linked'|'created'|'failed', area }.
export async function selectPlace(place, { confirm } = {}) {
  const catalog = await getAreaCatalog();
  const match = matchCatalogArea(place, catalog);
  if (match) {
    const ok = confirm ? await confirm(match) : true;
    if (ok) {
      const linked = await addHouseholdAreaByCatalog(match.id, 'catalog-match');
      return { action: linked ? 'linked' : 'failed', area: match };
    }
  }
  const stub = await createAreaStubAndLink(place);
  return { action: stub ? 'created' : 'failed', area: stub };
}
