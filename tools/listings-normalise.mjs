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

/**
 * Backfill/import variant of in-outcode validation: the per-listing target
 * outcode is UNKNOWN (the source run was an ad-hoc search, not our per-outcode
 * query), so match the listing to the nearest known area across ALL areas
 * (coordinate-first), with an address-token fallback. Resolves the outcode +
 * area_id from whichever area it landed in. Used by tools/import-apify-runs.mjs.
 * @param {object} listing  a normalised row (needs lat/lng and/or postcode).
 * @param {object} opts { areas: [{id,outcode,lat,lng}], knownOutcodes: Set<string>, radiusKm }
 * @returns {{ accepted: boolean, outcode: string|null, area_id: string|null, km: number }}
 */
export function matchListingToArea(listing, { areas = [], knownOutcodes = new Set(), radiusKm = IN_OUTCODE_RADIUS_KM } = {}) {
  let best = null, bestKm = Infinity;
  if (listing?.lat != null && listing?.lng != null) {
    const here = { lat: Number(listing.lat), lng: Number(listing.lng) };
    for (const a of areas) {
      const km = haversineKm(here, a);
      if (km < bestKm) { bestKm = km; best = a; }
    }
  }
  const coordOk = best && bestKm <= radiusKm;

  // Address-token fallback: the listing's own outcode token is one we cover.
  const token = listing?.postcode ? String(listing.postcode).toUpperCase() : null;
  const tokenOutcode = token ? (token.match(/^[A-Z]{1,2}\d{1,2}[A-Z]?/)?.[0] ?? null) : null;
  const tokenOk = tokenOutcode != null && knownOutcodes.has(tokenOutcode);

  if (!coordOk && !tokenOk) return { accepted: false, outcode: null, area_id: null, km: bestKm };
  const outcode = coordOk ? best.outcode : tokenOutcode;
  return { accepted: true, outcode: String(outcode).toUpperCase(), area_id: best ? best.id : null, km: bestKm };
}

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
