// areas/area-enrich.js — pure, dependency-light enrichment for a household-added
// area stub. No DOM, no network — so it is unit-testable in the Node harness and
// importable from both the browser (areas/place-lookup.js builds the stub; areas/
// area-ref.js classifies it) AND the Node fetcher (tools/fetch-listings.mjs decides
// which household areas are fetch-eligible at run-time). This module is the SINGLE
// source of truth for (a) turning a postcodes.io lookup + reverse/forward record into
// the additive field patch a stub needs to be accurately located, and (b) the
// isFetchEligible() predicate every surface keys off.
//
// Accuracy contract (see the postcodes.io probe, CLAUDE.md task §2):
//   • /places lat/lng is an accurate area PIN → trust it as coords.
//   • the outcode is only a SEARCH key (never coords) → derived from the postcode.
//   • same-name decoys are disambiguated by the user's pick; we add a conservative
//     county-contradiction safety net (only when postcodes.io's admin_county is
//     present AND clearly disagrees) so unitary-authority areas (admin_county null)
//     are trusted, not false-flagged — keeping the add flow hands-off.
import { postcodeDistrict } from './area-match.js';

// Derive the Rightmove search outcode from a (full or partial) postcode.
export { postcodeDistrict as deriveOutcode };

const _norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

// Conservative county-contradiction test. Fires ONLY when the chosen candidate
// states a county AND postcodes.io returns a populated admin_county that clearly
// disagrees (neither is a substring of the other). When admin_county is absent —
// the common case in unitary-authority England — we CANNOT confirm a contradiction,
// so we trust the user's selection and do not flag (region/district are NOT used as
// county proxies, which would false-flag e.g. "Hampshire" vs region "South East").
function countyContradicts(candidateCounty, pcRecord) {
  const cand = _norm(candidateCounty);
  const adminCounty = _norm(pcRecord?.admin_county);
  if (!cand || !adminCounty) return false;
  return !(cand === adminCounty || cand.includes(adminCounty) || adminCounty.includes(cand));
}

function pickCoords(candidate, pcRecord) {
  if (candidate?.lat != null && candidate?.lng != null) {
    return { lat: Number(candidate.lat), lng: Number(candidate.lng) };
  }
  const lat = pcRecord?.latitude, lng = pcRecord?.longitude;
  if (lat != null && lng != null) return { lat: Number(lat), lng: Number(lng) };
  return null;
}

/**
 * Build the additive field patch for a household stub from a lookup candidate and a
 * postcodes.io postcode record (reverse-geocoded for a place candidate, or the
 * forward record for a postcode candidate). `pcRecord === null` means postcodes.io
 * was unreachable/empty → SOFT-FAIL to coords-only (still creates the stub, flagged
 * provisional, re-enrichable later). Pure.
 * @param {object} candidate  a lookupPlaces() result.
 * @param {object|null} pcRecord  a postcodes.io postcode object, or null.
 * @returns {object} patch merged into the stub `data` by createAreaStubAndLink.
 */
export function enrichPatch(candidate, pcRecord) {
  const c = candidate || {};
  const coords = pickCoords(c, pcRecord);

  // Soft-fail: no postcodes.io record — keep the accurate /places pin, mark it
  // provisional, leave postcode/radius unset so it is NOT yet fetch-eligible.
  if (!pcRecord) {
    return { coords, coordsSource: 'postcodes-io-provisional' };
  }

  const postcode = c.postcode || pcRecord.postcode || null;
  // Keep the candidate's county as the primary label (stable id + correct display);
  // fall back to the record only when the candidate had none.
  const county = c.county || pcRecord.admin_county || pcRecord.region || null;
  const contradicts = countyContradicts(c.county, pcRecord);
  const base = c.kind === 'postcode' ? 'postcodes-io:postcode' : 'postcodes-io:places+reverse';

  const patch = {
    coords,
    postcode,
    county,
    coordsSource: contradicts ? 'postcodes-io:county-mismatch' : base,
    // Default per-village geofence + search radius (miles) so the fetcher geofence
    // has a radius; a county-flagged stub still records them so a later confirm makes
    // it eligible without re-enriching.
    geofenceRadiusMi: 3,
    searchRadiusMi: 3,
  };
  // admin_district is the local-authority district — the best "town" proxy, and the
  // fix for the previous county-as-town bug. Only set when present.
  if (pcRecord.admin_district) patch.town = pcRecord.admin_district;
  return patch;
}

/**
 * Is this household area accurately located enough to feed the next Rightmove run?
 * The single eligibility predicate, shared by the dashboard classifier (Live vs
 * Researching) and the fetcher's target assembly. Requires usable coords AND a
 * derivable outcode AND no county-mismatch flag. Pure.
 */
export function isFetchEligible(area) {
  if (!area) return false;
  const lat = area.coords?.lat, lng = area.coords?.lng;
  if (lat == null || lng == null) return false;
  if (!postcodeDistrict(area.postcode)) return false;
  if (String(area.coordsSource || '').includes('county-mismatch')) return false;
  return true;
}
