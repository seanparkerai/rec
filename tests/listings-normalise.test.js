// tests/listings-normalise.test.js — v3 L1 fetcher pure-logic tests.
// Verifies the normalise / in-outcode validation / dedup / price-history logic
// against the LOCKED L0 raw sample, with no network or DB.
import {
  normaliseRawListing,
  isInOutcode,
  matchListingToArea,
  dedupeByRightmoveId,
  mergePriceHistory,
  parseAddedDate,
  extractOutcodeFromAddress,
  extractFloorplanUrl,
  withinGeofence,
  nearestVillage,
  nameAgrees,
  bearingDeg,
  bearingSector,
  villageBufferKm,
} from '../tools/listings-normalise.mjs';

// The exact raw shape captured by the L0 probe (actor dhrumil~rightmove-scraper).
const RAW = {
  id: '88856913',
  url: 'https://www.rightmove.co.uk/properties/88856913#/?channel=RES_BUY',
  title: '2 bedroom terraced house for sale',
  displayAddress: 'Salisbury Lane, Over Wallop, Hampshire, SO20',
  addedOn: '22/05/2026',
  bathrooms: 1,
  bedrooms: 2,
  propertyType: 'Terraced',
  price: 395000,
  listingUpdateReason: 'new',
  firstVisibleDate: '2026-05-22T19:40:05Z',
  coordinates: { latitude: 51.142995, longitude: -1.597807 },
  type: 'sale',
  description: 'A charming Grade II listed cottage…',
  images: ['https://media.rightmove.co.uk/a.jpeg', 'https://media.rightmove.co.uk/b.jpeg'],
};

const SO20_AREAS = [{ id: 'over-wallop-so20', lat: 51.1426, lng: -1.5969 }];

export async function register({ test, assert, assertEqual }) {
  test('listings/normalise: maps the locked field shape', () => {
    const l = normaliseRawListing(RAW, { outcode: 'SO20' });
    assertEqual(l.rightmove_id, '88856913');
    assertEqual(l.address, 'Salisbury Lane, Over Wallop, Hampshire, SO20');
    assertEqual(l.postcode, 'SO20');
    assertEqual(l.outcode, 'SO20');
    assertEqual(l.price, 395000);
    assertEqual(l.beds, 2);
    assertEqual(l.baths, 1);
    assertEqual(l.property_type, 'Terraced');
    assertEqual(l.added_date, '2026-05-22');
    assertEqual(l.update_reason, 'new');
    assertEqual(l.status, 'live');
    assertEqual(l.image_url, 'https://media.rightmove.co.uk/a.jpeg');
    assert(Math.abs(l.lat - 51.142995) < 1e-6, 'lat preserved');
    assert(Math.abs(l.lng - -1.597807) < 1e-6, 'lng preserved');
    assertEqual(l.price_history.length, 1);
    assertEqual(l.price_history[0].price, 395000);
    assert(l.raw_json === RAW, 'raw_json kept for source-swap safety');
    assertEqual(l.floorplan_url, null, 'summary payload has no floor plan → null');
  });

  test('listings/normalise: extractFloorplanUrl pulls the first plan from detail payloads', () => {
    assertEqual(extractFloorplanUrl({ floorplans: [{ url: 'https://x/fp1.gif' }, { url: 'https://x/fp2.gif' }] }), 'https://x/fp1.gif');
    assertEqual(extractFloorplanUrl({ floorplans: ['https://x/bare.gif'] }), 'https://x/bare.gif');
    assertEqual(extractFloorplanUrl({ floorplan: { src: 'https://x/single.png' } }), 'https://x/single.png');
    assertEqual(extractFloorplanUrl({ floorplan: 'https://x/str.gif' }), 'https://x/str.gif');
    assertEqual(extractFloorplanUrl(RAW), null, 'no floor plan in the locked summary shape');
    assertEqual(extractFloorplanUrl({}), null);
  });

  test('listings/normalise: a detail payload populates floorplan_url', () => {
    const l = normaliseRawListing({ ...RAW, floorplans: [{ url: 'https://x/fp.gif' }] }, { outcode: 'SO20' });
    assertEqual(l.floorplan_url, 'https://x/fp.gif');
  });

  test('listings/normalise: returns null without an id', () => {
    assertEqual(normaliseRawListing({ price: 100 }, { outcode: 'SO20' }), null);
  });

  test('listings/normalise: parseAddedDate handles DD/MM/YYYY and ISO', () => {
    assertEqual(parseAddedDate('22/05/2026'), '2026-05-22');
    assertEqual(parseAddedDate('2026-05-22T19:40:05Z'), '2026-05-22');
    assertEqual(parseAddedDate(''), null);
  });

  test('listings/normalise: extractOutcodeFromAddress takes the last token', () => {
    assertEqual(extractOutcodeFromAddress('Foo Road, Bar, Hampshire, SO20'), 'SO20');
    assertEqual(extractOutcodeFromAddress('No postcode here'), null);
  });

  test('listings/validate: accepts an in-outcode address token', () => {
    const l = normaliseRawListing(RAW, { outcode: 'SO20' });
    assert(isInOutcode(l, { outcode: 'SO20', areaCoords: SO20_AREAS }), 'token match accepted');
  });

  test('listings/validate: accepts by coordinates when token is absent', () => {
    const l = { postcode: null, lat: 51.143, lng: -1.598 };
    assert(isInOutcode(l, { outcode: 'SO20', areaCoords: SO20_AREAS }), 'near-area coords accepted');
  });

  test('listings/validate: REJECTS a wrong-region (London) listing', () => {
    // The exact L0 failure mode: London served for a Hampshire outcode.
    const london = { postcode: null, lat: 51.5072, lng: -0.1276 };
    assert(!isInOutcode(london, { outcode: 'SO20', areaCoords: SO20_AREAS }), 'London rejected');
  });

  test('listings/validate: REJECTS when neither token nor coords resolve', () => {
    assert(!isInOutcode({ postcode: null, lat: null, lng: null }, { outcode: 'SO20', areaCoords: SO20_AREAS }));
  });

  test('listings/dedupe: collapses duplicate rightmove_ids', () => {
    const a = normaliseRawListing(RAW, { outcode: 'SO20' });
    const b = normaliseRawListing(RAW, { outcode: 'SO20' });
    assertEqual(dedupeByRightmoveId([a, b]).length, 1);
  });

  test('listings/price-history: no append when price is unchanged', () => {
    const existing = { price: 395000, price_history: [{ price: 395000, seen_at: 't0' }] };
    const { price_history, priceChanged } = mergePriceHistory(existing, { price: 395000 });
    assertEqual(priceChanged, false);
    assertEqual(price_history.length, 1);
  });

  test('listings/price-history: appends a point on a price drop', () => {
    const existing = { price: 395000, price_history: [{ price: 395000, seen_at: 't0' }] };
    const { price_history, priceChanged } = mergePriceHistory(existing, { price: 380000 });
    assertEqual(priceChanged, true);
    assertEqual(price_history.length, 2);
    assertEqual(price_history[1].price, 380000);
  });

  // ── import/backfill match (tools/import-apify-runs.mjs) ──────────────────────
  const ALL_AREAS = [
    { id: 'over-wallop-so20', outcode: 'SO20', lat: 51.1426, lng: -1.5969 },
    { id: 'romsey-so51',      outcode: 'SO51', lat: 50.9890, lng: -1.4980 },
  ];
  const KNOWN = new Set(['SO20', 'SO51']);

  test('listings/import-match: assigns nearest area + its outcode by coordinates', () => {
    const l = normaliseRawListing(RAW, { outcode: '' }); // unknown target outcode
    const m = matchListingToArea(l, { areas: ALL_AREAS, knownOutcodes: KNOWN });
    assert(m.accepted, 'near a known area → accepted');
    assertEqual(m.outcode, 'SO20');
    assertEqual(m.area_id, 'over-wallop-so20');
  });

  test('listings/import-match: address-token fallback when coords missing', () => {
    const l = { postcode: 'SO51 8AB', lat: null, lng: null };
    const m = matchListingToArea(l, { areas: ALL_AREAS, knownOutcodes: KNOWN });
    assert(m.accepted, 'token in a covered outcode → accepted');
    assertEqual(m.outcode, 'SO51');
  });

  test('listings/import-match: REJECTS a wrong-region listing', () => {
    const london = { postcode: null, lat: 51.5072, lng: -0.1276 };
    const m = matchListingToArea(london, { areas: ALL_AREAS, knownOutcodes: KNOWN });
    assert(!m.accepted, 'far from every area and no covered token → rejected');
  });

  // ── L7 geofence: the decisive precision test (regression guard for the bug) ──
  const SP11_VILLAGES = [
    { id: 'wherwell-sp11', name: 'Wherwell', outcode: 'SP11', lat: 51.145, lng: -1.468 },
    { id: 'newton-stacey-sp11', name: 'Newton Stacey', outcode: 'SP11', lat: 51.156, lng: -1.420 },
  ];

  test('geofence: ACCEPTS a listing at a target village centre', () => {
    const r = withinGeofence({ lat: 51.145, lng: -1.468 }, { villages: SP11_VILLAGES });
    assert(r.pass, 'Wherwell-centre accepted');
    assert(r.distance_mi < 0.2, 'distance ≈ 0');
    assertEqual(r.area_id, 'wherwell-sp11');
  });

  test('geofence: REJECTS a town north of Andover (the original leak)', () => {
    const hatherden = { lat: 51.247, lng: -1.514 };   // SP11, ~7mi N of Wherwell
    const r = withinGeofence(hatherden, { villages: SP11_VILLAGES });
    assert(!r.pass, 'Andover-fringe SP11 listing rejected');
    assert(r.distance_mi > 3, 'comfortably outside the 3mi buffer');
  });

  test('geofence: REJECTS a listing with no coordinates (no token shortcut)', () => {
    const r = withinGeofence({ lat: null, lng: null, postcode: 'SP11 7AA' }, { villages: SP11_VILLAGES });
    assert(!r.pass, 'no coords → rejected even with a matching outcode token');
    assertEqual(r.area_id, null);
  });

  test('geofence: nearestVillage picks the closer of two targets', () => {
    const near = nearestVillage({ lat: 51.156, lng: -1.421 }, SP11_VILLAGES);
    assertEqual(near.area_id, 'newton-stacey-sp11');
  });

  test('geofence: per-village override tightens the buffer', () => {
    const v = [{ id: 'x', name: 'X', outcode: 'SP11', lat: 51.145, lng: -1.468, geofenceRadiusKm: 1.61 }]; // 1mi
    const twoMiNorth = { lat: 51.145 + 0.029, lng: -1.468 };
    assert(!withinGeofence(twoMiNorth, { villages: v }).pass, '2mi rejected under a 1mi override');
    assert(withinGeofence({ lat: 51.145, lng: -1.468 }, { villages: v }).pass, 'centre still accepted');
  });

  // ── Directional ("petal") geofence: reach toward rural sectors, pull in toward urban ──
  test('bearingDeg + bearingSector place a point in the right compass sector', () => {
    const c = { lat: 51.145, lng: -1.468 };
    assertEqual(bearingSector(bearingDeg(c, { lat: 51.20, lng: -1.468 }), 8), 0); // due north → sector 0
    assertEqual(bearingSector(bearingDeg(c, { lat: 51.145, lng: -1.40 }), 8), 2); // due east  → sector 2
    assertEqual(bearingSector(0, 8), 0);
    assertEqual(bearingSector(90, 8), 2);
    assertEqual(bearingSector(180, 8), 4);
    assertEqual(bearingSector(null, 8), null);
  });

  test('geofence directional: a wide rural sector keeps a far home; a tight urban sector cuts one', () => {
    // North petal wide (≈3mi/4.8km), East petal tight (≈0.5mi/0.8km); others wide.
    const radii = [4.8, 4.8, 0.8, 4.8, 4.8, 4.8, 4.8, 4.8];
    const v = [{ id: 'x', name: 'X', outcode: 'SP11', lat: 51.145, lng: -1.468, geofenceRadiusKm: 4.8, geofenceRadiiKm: radii }];
    const twoMiNorth = { lat: 51.145 + 0.029, lng: -1.468 }; // ~2mi N → sector 0 (wide) → KEEP
    const twoMiEast = { lat: 51.145, lng: -1.468 + 0.0461 }; // ~2mi E → sector 2 (tight) → CUT
    assert(withinGeofence(twoMiNorth, { villages: v }).pass, 'rural-direction home kept by the wide north petal');
    assert(!withinGeofence(twoMiEast, { villages: v }).pass, 'urban-direction home cut by the tight east petal');
  });

  test('villageBufferKm falls back to the scalar radius when no petals are present', () => {
    const v = { lat: 51.145, lng: -1.468, geofenceRadiusKm: 2.0 };
    assertEqual(villageBufferKm(v, { lat: 51.20, lng: -1.468 }), 2.0);
    assertEqual(villageBufferKm({ lat: 51.145, lng: -1.468 }, { lat: 51.2, lng: -1.468 }, 4.8), 4.8);
  });

  // ── L7.6 overlap tiebreak: a home inside several village disks lands on the one it is ADDRESSED in ──
  test('geofence tiebreak: a home in two overlapping disks lands on the village it is ADDRESSED in', () => {
    // The Waltham Chase pin is (deliberately) mis-placed ~2mi north, so by coordinates
    // alone the home is nearest to Dundridge — the exact real-world bug. The address
    // names Waltham Chase, and WC's buffer still contains the home, so the tiebreak fixes it.
    const villages = [
      { id: 'dundridge-so32', name: 'Dundridge', outcode: 'SO32', lat: 50.9413, lng: -1.1952 },
      { id: 'waltham-chase-so32', name: 'Waltham Chase', outcode: 'SO32', lat: 50.9675, lng: -1.2077 },
    ];
    const home = { lat: 50.9386, lng: -1.2031, address: 'Forest Road, Waltham Chase, SO32', postcode: 'SO32' };
    assertEqual(nearestVillage(home, villages).area_id, 'dundridge-so32');     // coords alone → Dundridge
    const r = withinGeofence(home, { villages });
    assertEqual(r.area_id, 'waltham-chase-so32');                              // name tiebreak corrects it
    assert(r.pass && r.name_match === true && r.corroborated === true, 'in-buffer, named, corroborated');
  });

  test('geofence tiebreak: the named village must still be IN buffer (coordinates stay decisive)', () => {
    const villages = [
      { id: 'dundridge-so32', name: 'Dundridge', outcode: 'SO32', lat: 50.9413, lng: -1.1952 },
      { id: 'waltham-chase-far', name: 'Waltham Chase', outcode: 'SO32', lat: 51.10, lng: -1.20 }, // ~11mi N, out of buffer
    ];
    const home = { lat: 50.9386, lng: -1.2031, address: 'Forest Road, Waltham Chase, SO32' };
    assertEqual(withinGeofence(home, { villages }).area_id, 'dundridge-so32'); // WC out of buffer → no tiebreak, coords win
  });

  // ── Second-signal (failsafe) corroboration ──
  test('corroboration: in-buffer AND name agrees → corroborated=true', () => {
    const r = withinGeofence({ lat: 51.145, lng: -1.468, town: 'Wherwell', postcode: 'SP11 7JX' }, { villages: SP11_VILLAGES });
    assert(r.pass && r.name_match === true && r.corroborated === true);
  });

  test('corroboration: in-buffer but text says Andover → pass holds, corroborated=false (FLAG, not drop)', () => {
    // coords still inside Wherwell's buffer, but the address text contradicts it.
    const r = withinGeofence({ lat: 51.16, lng: -1.47, town: 'Andover', postcode: 'SP10 2AB' }, { villages: SP11_VILLAGES });
    assert(r.name_match === false, 'text contradicts the matched village');
    assert(r.corroborated === false, 'disagreement recorded for audit');
    assert(r.pass === true, 'pass is coordinate-driven — row is flagged, never silently dropped');
  });

  test('corroboration: coordinate-only listing (no text) → name_match=null, still usable', () => {
    const r = withinGeofence({ lat: 51.145, lng: -1.468 }, { villages: SP11_VILLAGES });
    assert(r.pass === true && r.name_match === null && r.corroborated === true,
      'no text is treated as not-contradicted, but the absence is recorded via name_match=null');
  });

  test('corroboration: nameAgrees returns null when there is nothing to check', () => {
    assertEqual(nameAgrees({}, SP11_VILLAGES[0]), null);
  });

  // ── m2m membership: withinGeofence().areas = every in-buffer village ──
  test('geofence areas: a home in two overlapping disks is a member of BOTH, one is_primary', () => {
    const villages = [
      { id: 'dundridge-so32', name: 'Dundridge', outcode: 'SO32', lat: 50.9413, lng: -1.1952 },
      { id: 'waltham-chase-so32', name: 'Waltham Chase', outcode: 'SO32', lat: 50.9675, lng: -1.2077 },
    ];
    const home = { lat: 50.9386, lng: -1.2031, address: 'Forest Road, Waltham Chase, SO32', postcode: 'SO32' };
    const r = withinGeofence(home, { villages });
    const ids = r.areas.map((a) => a.area_id).sort();
    assertEqual(JSON.stringify(ids), JSON.stringify(['dundridge-so32', 'waltham-chase-so32']));
    const primaries = r.areas.filter((a) => a.is_primary);
    assertEqual(primaries.length, 1);                          // exactly one primary
    assertEqual(primaries[0].area_id, r.area_id);              // and it equals the single area_id
    assertEqual(primaries[0].area_id, 'waltham-chase-so32');   // the address-named tiebreak winner
    assert(r.areas.every((a) => Number.isFinite(a.distance_mi)), 'every membership row carries a distance');
  });

  test('geofence areas: membership is [] exactly when pass is false', () => {
    // A point far from every village → no in-buffer area → not a member of anything.
    const r = withinGeofence({ lat: 52.5, lng: -1.9 }, { villages: SP11_VILLAGES });
    assertEqual(r.pass, false);
    assertEqual(JSON.stringify(r.areas), '[]');
    // No villages at all → also [].
    assertEqual(JSON.stringify(withinGeofence({ lat: 51.1, lng: -1.4 }, { villages: [] }).areas), '[]');
  });

  test('geofence areas: a single-village match yields one primary member', () => {
    const r = withinGeofence({ lat: 51.145, lng: -1.468, town: 'Wherwell', postcode: 'SP11 7JX' }, { villages: SP11_VILLAGES });
    assert(r.pass, 'in buffer');
    assert(r.areas.length >= 1, 'at least the matched village');
    assertEqual(r.areas.filter((a) => a.is_primary).length, 1);
    assertEqual(r.areas.find((a) => a.is_primary).area_id, r.area_id);
  });
}
