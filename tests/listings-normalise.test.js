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
}
