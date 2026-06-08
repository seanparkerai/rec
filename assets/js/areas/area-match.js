// areas/area-match.js — pure, dependency-free helpers for the per-household area
// lookup (Phase 2). No Supabase, no DOM, no network — so it is unit-testable in the
// Node harness and importable from both storage/listings.js (slug for stub ids) and
// areas/place-lookup.js (the postcodes.io match-or-create flow).

// Stub area id: name + county, slugified. A user-added village therefore never
// collides with a CURATED catalog id (which uses the postcode district, e.g.
// `oakley-rg23`). Matches the area.schema.json id pattern ^[a-z0-9-]+$.
export function slugifyArea(name, county) {
  return [name, county].filter(Boolean).join('-')
    .toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Great-circle distance in km between two {lat,lng} points. Returns Infinity when
// either point is missing a coordinate, so a coordinate-less area never "matches"
// on distance.
export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || a.lng == null || b.lat == null || b.lng == null) return Infinity;
  const R = 6371; // km
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const _norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
// Postcode outward district, e.g. "SO24 9RX" → "SO24", "RG23" → "RG23".
export function postcodeDistrict(pc) {
  const m = String(pc || '').toUpperCase().match(/^[A-Z]{1,2}\d[A-Z\d]?/);
  return m ? m[0] : '';
}

// Match-or-create decision: given a postcodes.io place ({name, county, lat, lng,
// postcodeDistrict}) and the catalog (array of area records), return the catalog area
// it is the SAME place as, or null (→ caller creates a stub). A match requires the
// village NAME to align AND the county to align (when both are known) AND either the
// points are within `maxKm` (~1.5km) OR the postcode districts match. The closest
// qualifying candidate wins so two like-named villages can't cross-link.
export function matchCatalogArea(place, catalog, { maxKm = 1.5 } = {}) {
  if (!place || !Array.isArray(catalog)) return null;
  const pName = _norm(place.name);
  if (!pName) return null;
  const pCounty = _norm(place.county);
  const pDistrict = (place.postcodeDistrict || '').toUpperCase();
  const pCoords = (place.lat != null && place.lng != null) ? { lat: place.lat, lng: place.lng } : null;
  let best = null;
  let bestKm = Infinity;
  for (const a of catalog) {
    const aName = _norm(a.name || a.village);
    if (!aName || aName !== pName) continue;
    const aCounty = _norm(a.county);
    if (pCounty && aCounty && aCounty !== pCounty) continue; // county conflict → not the same place
    const km = pCoords ? haversineKm(pCoords, a.coords) : Infinity;
    const districtMatch = !!pDistrict && postcodeDistrict(a.postcode) === pDistrict;
    if (km <= maxKm || districtMatch) {
      // Closest qualifying candidate wins; seed the first one even when it qualified
      // on the postcode district alone (km === Infinity because coords were absent).
      if (best === null || km < bestKm) { best = a; bestKm = km; }
    }
  }
  return best;
}
