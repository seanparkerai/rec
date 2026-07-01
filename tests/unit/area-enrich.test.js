// tests/area-enrich.test.js — pure-logic tests for household-area enrichment
// (assets/js/areas/area-enrich.js). Covers the candidate + postcodes.io record →
// field patch transform (place-kind reverse, postcode-kind short-circuit, town/
// county/postcode/outcode fill, the conservative county-mismatch flag, soft-fail),
// and the shared isFetchEligible() predicate. Node-only; no network. Wired into
// run-intelligence-tests.mjs.
import { enrichPatch, isFetchEligible, deriveOutcode } from '../../assets/js/areas/area-enrich.js';

export async function register({ test, assert, assertEqual }) {
  // A place-kind candidate (from /places): accurate pin, county, no postcode.
  const placeCandidate = {
    name: 'Alresford', county: 'Hampshire', lat: 51.0903, lng: -1.1612,
    postcodeDistrict: '', kind: 'place',
  };
  // A reverse-geocode record for that pin (postcodes.io shape).
  const reverseRec = {
    postcode: 'SO24 9AB', outcode: 'SO24', latitude: 51.0905, longitude: -1.161,
    admin_district: 'Winchester', admin_county: null, region: 'South East', parish: 'New Alresford',
  };

  // ── place-kind → reverse patch ───────────────────────────────────────────────
  test('area-enrich: place-kind candidate + reverse record → located patch', () => {
    const p = enrichPatch(placeCandidate, reverseRec);
    assertEqual(p.postcode, 'SO24 9AB', 'full postcode from reverse record');
    assertEqual(deriveOutcode(p.postcode), 'SO24', 'outcode derivable');
    assertEqual(p.town, 'Winchester', 'town from admin_district (fixes county-as-town bug)');
    assertEqual(p.county, 'Hampshire', 'candidate county preserved (stable id + display)');
    assertEqual(p.coordsSource, 'postcodes-io:places+reverse', 'place+reverse source');
    assertEqual(p.coords.lat, 51.0903, 'coords use the accurate /places pin, not the postcode centroid');
    assertEqual(p.geofenceRadiusMi, 3, 'default geofence radius set');
    assertEqual(p.searchRadiusMi, 3, 'default search radius set');
    assert(isFetchEligible({ ...p }), 'located place stub is fetch-eligible');
  });

  // ── postcode-kind → forward short-circuit ────────────────────────────────────
  test('area-enrich: postcode-kind candidate keeps its full postcode + derives outcode', () => {
    const pcCandidate = {
      name: 'New Alresford', county: 'Hampshire', lat: 51.0905, lng: -1.161,
      postcodeDistrict: 'SO24', postcode: 'SO24 9RX', kind: 'postcode',
    };
    const fwdRec = { postcode: 'SO24 9RX', outcode: 'SO24', admin_district: 'Winchester', admin_county: null, region: 'South East' };
    const p = enrichPatch(pcCandidate, fwdRec);
    assertEqual(p.postcode, 'SO24 9RX', 'candidate full postcode kept');
    assertEqual(deriveOutcode(p.postcode), 'SO24');
    assertEqual(p.coordsSource, 'postcodes-io:postcode', 'postcode source');
    assert(isFetchEligible({ ...p }), 'located postcode stub is fetch-eligible');
  });

  // ── county-mismatch (conservative) ───────────────────────────────────────────
  test('area-enrich: a populated admin_county that disagrees flags county-mismatch', () => {
    // Charlwood decoy: candidate says Hampshire, the pin is actually in Surrey.
    const rec = { postcode: 'RH6 0AA', outcode: 'RH6', admin_district: 'Mole Valley', admin_county: 'Surrey', region: 'South East' };
    const p = enrichPatch({ name: 'Charlwood', county: 'Hampshire', lat: 51.15, lng: -0.22, kind: 'place' }, rec);
    assertEqual(p.coordsSource, 'postcodes-io:county-mismatch', 'contradiction flagged');
    assertEqual(isFetchEligible({ ...p }), false, 'county-flagged stub is NOT fetch-eligible');
  });

  test('area-enrich: a null admin_county (unitary England) is trusted, not flagged', () => {
    const p = enrichPatch(placeCandidate, reverseRec); // admin_county null, region South East
    assert(!String(p.coordsSource).includes('county-mismatch'), 'no false flag when admin_county absent');
    assert(isFetchEligible({ ...p }), 'trusted → eligible');
  });

  test('area-enrich: an agreeing admin_county is not flagged', () => {
    const rec = { postcode: 'GU34 1AA', outcode: 'GU34', admin_district: 'East Hampshire', admin_county: 'Hampshire', region: 'South East' };
    const p = enrichPatch({ name: 'Alton', county: 'Hampshire', lat: 51.15, lng: -0.97, kind: 'place' }, rec);
    assertEqual(p.coordsSource, 'postcodes-io:places+reverse', 'agreement → normal source');
  });

  // ── soft-fail ────────────────────────────────────────────────────────────────
  test('area-enrich: a null record (postcodes.io down) soft-fails to coords-only', () => {
    const p = enrichPatch(placeCandidate, null);
    assertEqual(p.coordsSource, 'postcodes-io-provisional', 'flagged provisional');
    assertEqual(p.postcode, undefined, 'no postcode persisted');
    assertEqual(p.coords.lat, 51.0903, 'pin still kept so it is re-enrichable later');
    assertEqual(isFetchEligible({ ...p }), false, 'coords-only stub is NOT yet fetch-eligible');
  });

  // ── isFetchEligible predicate ────────────────────────────────────────────────
  test('area-enrich: isFetchEligible requires coords AND a derivable outcode', () => {
    assertEqual(isFetchEligible(null), false);
    assertEqual(isFetchEligible({ postcode: 'SO24 9AB' }), false, 'no coords → not eligible');
    assertEqual(isFetchEligible({ coords: { lat: 51, lng: -1 } }), false, 'no postcode → not eligible');
    assertEqual(isFetchEligible({ coords: { lat: 51, lng: -1 }, postcode: 'not-a-postcode' }), false, 'no derivable outcode → not eligible');
    assert(isFetchEligible({ coords: { lat: 51, lng: -1 }, postcode: 'SO24 9AB', coordsSource: 'postcodes-io:places+reverse' }), 'located → eligible');
  });
}
