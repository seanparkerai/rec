// listings-normalise.mjs — pure, side-effect-free helpers for the L1 listing
// engine. No network, no DB, no DOM. Imported by tools/fetch-listings.mjs (the
// orchestrator) and by tests/listings-normalise.test.js so the normalise /
// validate / dedup logic is unit-tested independently of any live fetch.
//
// Field mapping is LOCKED from the L0 probe raw sample (actor
// dhrumil~rightmove-scraper). A raw item looks like:
//   { id, url, title, displayAddress, addedOn:"DD/MM/YYYY", bathrooms, bedrooms,
//     propertyType, price:Number, listingUpdateReason, listingUpdateDate,
//     firstVisibleDate, displayStatus, coordinates:{latitude,longitude},
//     type:"sale", description, images:[...] }

// A UK outcode token: 1-2 letters, 1-2 digits, optional trailing letter (SO20, GU34, SP11).
export const OUTCODE_RE = /\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/g;

// Reject anything more than this far (km) from the nearest known area centre in
// the requested outcode. Tuned to catch the gross wrong-REGION failure (London
// served for a Hampshire outcode is ~90km away) while keeping genuine in-outcode
// rural listings (an outcode spans a few km). Coordinates are the primary signal;
// the address postcode token is a secondary confirmation.
export const IN_OUTCODE_RADIUS_KM = 20;

/** Great-circle distance in km between two {lat,lng} points. */
export function haversineKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return Infinity;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Initial great-circle bearing a→b in degrees (0=N, 90=E, 180=S, 270=W). Returns null
 * for missing coords. Used by the directional geofence + the radius learner to place a
 * listing in a compass sector around its town centre.
 */
export function bearingDeg(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Sector index (0..n-1) for a bearing; sector 0 is centred on North (default 8 = 45°). */
export function bearingSector(bearing, n = 8) {
  if (bearing == null || !Number.isFinite(bearing)) return null;
  const span = 360 / n;
  return Math.round((((bearing % 360) + 360) % 360) / span) % n;
}

/**
 * Shared place-name normaliser (L7). Lowercase, strip punctuation, drop the
 * "saint/st"/"cum" joiners and county suffixes, collapse whitespace. Used by the
 * geofence's second signal (nameAgrees) AND by tools/verify-area-coords.mjs so
 * the resolve/verify tooling and the live failsafe normalise names identically.
 */
export function normaliseName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[.,'’`]/g, ' ')
    .replace(/\b(saint|st)\b/g, ' ')
    .replace(/\bcum\b/g, ' ')
    .replace(/\b(hampshire|wiltshire|hants|wilts|dorset|somerset|berkshire|berks|surrey)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Geofence (L7): the DECISIVE precision test ───────────────────────────────
// Distinct from the 20km IN_OUTCODE_RADIUS_KM wrong-REGION guard above — this is
// the per-village buffer that decides whether a listing is actually in one of the
// ~190 target villages, not merely somewhere in the right postal district. The
// verdict is driven by COORDINATES (nearest active village centroid); a second,
// independent signal — the listing's own town/postcode text vs the matched
// village — CORROBORATES it. Disagreements are RECORDED (corroborated=false) so
// they can be flagged for audit — never silently dropped, never silently trusted.
export const GEOFENCE_RADIUS_KM = 4.8;          // ≈3 miles; per-village overridable
export const MILES_PER_KM = 0.621371;

/**
 * The geofence buffer (km) for a village given a candidate listing point. When the
 * village carries a learned per-sector buffer (geofenceRadiiKm — the directional
 * "petal" coverage, one radius per compass sector), the sector is chosen by the bearing
 * from the village CENTRE to the listing, so coverage can reach further toward rural
 * sectors and pull in toward urban ones. Falls back to the scalar geofenceRadiusKm (then
 * the global default) when no directional data is present — so this is fully
 * backward-compatible with villages that have only a single radius.
 */
export function villageBufferKm(v, here, fallbackKm = GEOFENCE_RADIUS_KM) {
  const radii = v?.geofenceRadiiKm;
  if (Array.isArray(radii) && radii.length) {
    const s = bearingSector(bearingDeg(v, here), radii.length);
    const r = s != null ? Number(radii[s]) : NaN;
    if (Number.isFinite(r)) return r;
  }
  return v?.geofenceRadiusKm ?? fallbackKm;
}

/**
 * Nearest active village to a listing, by coordinates only (no address-token
 * shortcut — the token branch is exactly what let in-outcode-but-wrong-village
 * listings through). @returns {{ area_id, km, village }}.
 */
export function nearestVillage(listing, villages = []) {
  if (listing?.lat == null || listing?.lng == null) return { area_id: null, km: Infinity, village: null };
  let best = null, bestKm = Infinity;
  const here = { lat: Number(listing.lat), lng: Number(listing.lng) };
  for (const v of villages) {
    const km = haversineKm(here, v);
    if (km < bestKm) { bestKm = km; best = v; }
  }
  return { area_id: best?.id ?? null, km: bestKm, village: best };
}

/**
 * Second signal. Compares the listing's own town/displayAddress/postcode text to
 * the matched village's name + outcode. Returns true (agrees), false (contradicts
 * — e.g. coords say Wherwell but the text says "Andover"), or null (no usable text
 * — fall back to coordinates alone, but mark it). Pure.
 */
export function nameAgrees(listing, village) {
  if (!village) return null;
  const hay = normaliseName([listing?.town, listing?.displayAddress, listing?.address]
    .filter(Boolean).join(' '));
  const oc = String(listing?.postcode ?? listing?.outcode ?? '').toUpperCase().match(/^[A-Z]{1,2}\d[A-Z\d]?/)?.[0] ?? null;
  if (!hay && !oc) return null;
  const wantName = normaliseName(village.name);
  const wantOc = String(village.outcode ?? '').toUpperCase() || null;
  const nameHit = wantName && hay ? hay.includes(wantName) : null;
  const ocHit = wantOc && oc ? oc === wantOc : null;
  // Contradiction only when we have a signal AND it disagrees on BOTH available axes.
  if (nameHit === false && (ocHit === false || ocHit === null)) return false;
  if (ocHit === false && nameHit === null) return false;
  if (nameHit || ocHit) return true;
  return null;
}

/**
 * Address-name match for the overlap tiebreak (L7.6). Does the listing's own text
 * name THIS village specifically? Distinct from nameAgrees() — which also accepts an
 * OUTCODE match — because villages in one cluster share an outcode, so to tell them
 * apart the village NAME is the only usable signal. Pure.
 */
export function addressNamesVillage(listing, village) {
  if (!village) return false;
  const hay = normaliseName([listing?.town, listing?.displayAddress, listing?.address].filter(Boolean).join(' '));
  const want = normaliseName(village.name);
  return !!(hay && want && hay.includes(want));
}

/**
 * Decisive accept test: within the (per-village or default) buffer of the nearest
 * ACTIVE village. Listings without coordinates are REJECTED. The name signal
 * corroborates but never overrides the coordinate verdict; a contradiction is
 * recorded via corroborated=false for downstream flagging.
 * @param {object} listing  needs .lat/.lng; optionally .town/.address/.postcode.
 * @param {object} opts     { villages:[{id,name,outcode,lat,lng,geofenceRadiusKm?}], radiusKm }
 * @returns {{ pass, km, distance_mi, area_id, name_match, corroborated, areas }}
 *   `areas` is the FULL m2m membership set: every in-buffer village, km-sorted,
 *   as { area_id, distance_mi, is_primary } (exactly one is_primary, === area_id).
 *   It is `[]` precisely when `pass` is false. The single `area_id` stays the
 *   primary (named/nearest) area for backward compatibility — the junction is additive.
 */
export function withinGeofence(listing, { villages = [], radiusKm = GEOFENCE_RADIUS_KM } = {}) {
  if (listing?.lat == null || listing?.lng == null || !villages.length) {
    return { pass: false, km: null, distance_mi: null, area_id: null, name_match: null, corroborated: false, areas: [] };
  }
  const here = { lat: Number(listing.lat), lng: Number(listing.lng) };
  // Distance to every active village + that village's own buffer (L7.3 override).
  const scored = villages
    .map((v) => ({ v, km: haversineKm(here, v), r: villageBufferKm(v, here, radiusKm) }))
    .sort((a, b) => a.km - b.km);
  const nearest = scored[0];
  if (!nearest || !Number.isFinite(nearest.km)) {
    return { pass: false, km: null, distance_mi: null, area_id: null, name_match: null, corroborated: false, areas: [] };
  }
  // Overlap tiebreak (L7.6): among villages whose buffer actually CONTAINS the
  // listing, prefer the NEAREST one the address explicitly NAMES. A home sitting
  // inside several overlapping village disks then lands on the village it is
  // addressed in — not merely the nearest centroid, which a mis-placed pin can make
  // the wrong one. Coordinates stay decisive: only in-buffer villages are eligible,
  // so this can never reintroduce a wrong-village (out-of-buffer) match.
  const inBuffer = scored.filter((s) => s.km <= s.r);      // already km-sorted
  const named = inBuffer.filter((s) => addressNamesVillage(listing, s.v));
  const chosen = named[0] || inBuffer[0] || nearest;
  const pass = chosen.km <= chosen.r;
  const name_match = nameAgrees(listing, chosen.v);         // true | false | null (no text)
  // corroborated = within buffer AND the name signal does not contradict. A null
  // name_match (no text) is treated as "not contradicted" so coordinate-only
  // listings still pass — but the absence is recorded via name_match=null.
  const corroborated = pass && name_match !== false;
  // Full m2m membership: every in-buffer village (already km-sorted). is_primary
  // marks the chosen primary — the same village the single area_id keeps pointing
  // at — so the junction is purely additive (one of these rows IS the primary).
  const areas = pass
    ? inBuffer.map((s) => ({
        area_id: s.v.id,
        distance_mi: s.km * MILES_PER_KM,
        is_primary: s.v.id === chosen.v.id,
      }))
    : [];
  return { pass, km: chosen.km, distance_mi: chosen.km * MILES_PER_KM, area_id: chosen.v.id, name_match, corroborated, areas };
}

/** Pull a full postcode (outcode + incode) or bare outcode token from an address. */
export function extractOutcodeFromAddress(address) {
  if (!address) return null;
  const upper = String(address).toUpperCase();
  const matches = upper.match(OUTCODE_RE);
  if (!matches) return null;
  // The last postcode-looking token in a UK address is the real one.
  return matches[matches.length - 1];
}

/** Parse the source "addedOn" (DD/MM/YYYY) or an ISO date into YYYY-MM-DD. */
export function parseAddedDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** Map the source's free-text status to our listing-lifecycle enum. */
export function mapStatus(raw) {
  const s = String(raw?.displayStatus || raw?.status || '').toLowerCase();
  if (/sold stc|sstc|sold subject/.test(s)) return 'sstc';
  if (/under offer/.test(s)) return 'under_offer';
  if (/withdrawn|removed/.test(s)) return 'withdrawn';
  return 'live';
}

/**
 * First floor-plan image URL from a raw source item, or null. Floor plans only
 * appear on detail-page payloads (`floorplans: [{ url }]` / `floorplan`); the
 * search-summary payload carries none, so this returns null for those. Pure.
 */
export function extractFloorplanUrl(raw) {
  const fps = raw?.floorplans ?? raw?.floorplan ?? null;
  if (Array.isArray(fps)) {
    for (const f of fps) {
      const u = typeof f === 'string' ? f : (f?.url ?? f?.src);
      if (u) return String(u);
    }
    return null;
  }
  if (typeof fps === 'string') return fps;
  if (fps && (fps.url || fps.src)) return String(fps.url ?? fps.src);
  return null;
}

/**
 * Normalise one raw source item into our `listings` row shape.
 * @param {object} raw    a single dataset item from the Apify actor.
 * @param {object} ctx    { outcode, source, now }
 * @returns {object|null} normalised row, or null if it has no usable id.
 */
export function normaliseRawListing(raw, { outcode, source = 'rightmove-apify', now = new Date() } = {}) {
  if (!raw) return null;
  const rightmove_id = raw.id != null ? String(raw.id) : null;
  if (!rightmove_id) return null;

  const lat = raw.coordinates?.latitude ?? raw.latitude ?? null;
  const lng = raw.coordinates?.longitude ?? raw.longitude ?? null;
  const price = Number(raw.price?.amount ?? raw.price ?? raw.priceValue) || null;
  const nowIso = now instanceof Date ? now.toISOString() : String(now);

  return {
    rightmove_id,
    source,
    url: raw.url ?? null,
    title: raw.title ?? null,
    address: raw.displayAddress ?? raw.address ?? null,
    postcode: extractOutcodeFromAddress(raw.displayAddress ?? raw.address) ?? null,
    outcode: String(outcode || '').toUpperCase(),
    area_id: null, // assigned later by the orchestrator (nearest area in outcode)
    price,
    beds: raw.bedrooms ?? raw.beds ?? null,
    baths: raw.bathrooms ?? raw.baths ?? null,
    property_type: raw.propertyType ?? raw.propertySubType ?? null,
    tenure: raw.tenure ?? null,            // not in list payload — null until enriched
    epc: raw.epc ?? null,                  // not in list payload
    council_tax: raw.councilTaxBand ?? null,
    status: mapStatus(raw),
    lat: lat != null ? Number(lat) : null,
    lng: lng != null ? Number(lng) : null,
    image_url: Array.isArray(raw.images) ? (raw.images[0] ?? null) : (raw.image ?? null),
    floorplan_url: extractFloorplanUrl(raw), // null on summary payloads; set on detail scrapes
    description: raw.description ?? null,
    first_seen: nowIso,
    last_seen: nowIso,
    added_date: parseAddedDate(raw.addedOn ?? raw.firstVisibleDate ?? raw.listingUpdateDate),
    update_reason: raw.listingUpdateReason ?? null,
    price_history: price != null ? [{ price, seen_at: nowIso }] : [],
    raw_json: raw,
  };
}

/**
 * Coordinate-first in-outcode validation. A listing is accepted if its address
 * carries the requested outcode token, OR its coordinates are within
 * IN_OUTCODE_RADIUS_KM of the nearest known area centre in that outcode.
 * Listings with neither a matching token nor usable coordinates are REJECTED —
 * this is the guard against the silent wrong-region trap.
 * @param {object} listing      a normalised row (needs .lat/.lng/.postcode).
 * @param {object} opts         { outcode, areaCoords: [{lat,lng}], radiusKm }
 */
export function isInOutcode(listing, { outcode, areaCoords = [], radiusKm = IN_OUTCODE_RADIUS_KM } = {}) {
  const oc = String(outcode || '').toUpperCase();
  if (!oc) return false;

  // (a) explicit address token match (full postcode startsWith outcode counts).
  const token = listing?.postcode ? String(listing.postcode).toUpperCase() : null;
  if (token && (token === oc || token.startsWith(oc))) return true;

  // (b) coordinate proximity to a known area centre in this outcode.
  if (listing?.lat != null && listing?.lng != null && areaCoords.length) {
    const here = { lat: Number(listing.lat), lng: Number(listing.lng) };
    const nearestKm = Math.min(...areaCoords.map((c) => haversineKm(here, c)));
    if (nearestKm <= radiusKm) return true;
  }

  return false;
}

// matchListingToArea deleted (step 2.8): the 20 km nearest+token matcher let
// wrong-village rows in with a coarse area_id. withinGeofence is the ONE
// decisive matcher; IN_OUTCODE_RADIUS_KM survives only as the importer's
// stored-but-hidden wrong-region bound.

/** Dedupe a list of normalised rows by rightmove_id, keeping the first seen. */
export function dedupeByRightmoveId(rows) {
  const seen = new Map();
  for (const r of rows) {
    if (!r?.rightmove_id) continue;
    if (!seen.has(r.rightmove_id)) seen.set(r.rightmove_id, r);
  }
  return [...seen.values()];
}

/**
 * Build the price_history for an upsert: carry the existing history forward and
 * append a new point only when the price actually changed.
 * @param {object|null} existing  the row already in the DB (or null on first sight).
 * @param {object} incoming       the freshly-normalised row.
 * @param {Date|string} now
 * @returns {{ price_history: Array, priceChanged: boolean }}
 */
export function mergePriceHistory(existing, incoming, now = new Date()) {
  const nowIso = now instanceof Date ? now.toISOString() : String(now);
  const history = Array.isArray(existing?.price_history) ? [...existing.price_history] : [];
  const lastPrice = history.length ? history[history.length - 1].price : existing?.price ?? null;
  const newPrice = incoming?.price ?? null;
  let priceChanged = false;
  if (newPrice != null && newPrice !== lastPrice) {
    history.push({ price: newPrice, seen_at: nowIso });
    priceChanged = true;
  }
  if (!history.length && newPrice != null) history.push({ price: newPrice, seen_at: nowIso });
  return { price_history: history, priceChanged };
}
