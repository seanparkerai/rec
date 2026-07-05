// tests/listings-controls.test.js — pure tests for the shared listings
// search/sort/filter core (no DOM). Mirrors the harness register(...) shape.
import { filterListings, sortListings, LISTING_SORTS } from '../../assets/js/listings/controls.js';

export async function register({ test, assert, assertEqual }) {
  const L = (over = {}) => ({
    rightmove_id: 'x', title: '3-bed semi', address: '1 High St, Wimbledon',
    postcode: 'SW19 1AA', outcode: 'SW19', property_type: 'Semi-detached',
    status: 'live', price: 500000, beds: 3, first_seen: '2026-05-01T00:00:00Z', ...over,
  });

  const sample = [
    L({ rightmove_id: 'a', property_type: 'Detached',      price: 800000, beds: 4, status: 'live' }),
    L({ rightmove_id: 'b', property_type: 'Semi-detached', price: 500000, beds: 3, status: 'under_offer' }),
    L({ rightmove_id: 'c', property_type: 'Flat',          price: 300000, beds: 2, status: 'live', address: '5 River Road, Kingston', postcode: 'KT1 2BB', outcode: 'KT1' }),
  ];

  // ── search ──────────────────────────────────────────────────────────────
  test('controls: search matches postcode', () => {
    const out = filterListings(sample, { search: 'KT1' });
    assertEqual(out.length, 1);
    assertEqual(out[0].rightmove_id, 'c');
  });

  test('controls: search matches title and is case-insensitive', () => {
    const out = filterListings(sample, { search: 'SEMI' });
    assert(out.every((l) => /semi/i.test(l.title) || /semi/i.test(l.property_type)), 'all results semi');
    assert(out.length >= 1, 'at least one semi');
  });

  test('controls: search matches the area/town name via accessor', () => {
    const areaNameOf = (l) => (l.rightmove_id === 'a' ? 'Cobham' : 'Wimbledon');
    const out = filterListings(sample, { search: 'cobham' }, { areaNameOf });
    assertEqual(out.length, 1);
    assertEqual(out[0].rightmove_id, 'a');
  });

  test('controls: multi-token search is AND', () => {
    const out = filterListings(sample, { search: 'river kingston' });
    assertEqual(out.length, 1);
    assertEqual(out[0].rightmove_id, 'c');
  });

  test('controls: empty search returns everything', () => {
    assertEqual(filterListings(sample, { search: '' }).length, 3);
  });

  // ── facet filters ───────────────────────────────────────────────────────
  test('controls: type filter is exact', () => {
    const out = filterListings(sample, { type: 'Flat' });
    assertEqual(out.length, 1);
    assertEqual(out[0].rightmove_id, 'c');
  });

  test('controls: beds filter is a minimum', () => {
    const out = filterListings(sample, { beds: '3' });
    assertEqual(out.length, 2); // 4-bed and 3-bed, not the 2-bed flat
    assert(out.every((l) => l.beds >= 3), 'all >= 3 beds');
  });

  test('controls: status filter is exact', () => {
    const out = filterListings(sample, { status: 'under_offer' });
    assertEqual(out.length, 1);
    assertEqual(out[0].rightmove_id, 'b');
  });

  // ── sorting ─────────────────────────────────────────────────────────────
  test('controls: price-asc orders cheapest first', () => {
    const out = sortListings(sample, { sort: 'price-asc' });
    assertEqual(out[0].rightmove_id, 'c'); // 300k
    assertEqual(out[2].rightmove_id, 'a'); // 800k
  });

  test('controls: price-desc orders dearest first', () => {
    const out = sortListings(sample, { sort: 'price-desc' });
    assertEqual(out[0].rightmove_id, 'a');
  });

  test('controls: beds sort is descending', () => {
    const out = sortListings(sample, { sort: 'beds' });
    assertEqual(out[0].rightmove_id, 'a'); // 4 beds
  });

  test('controls: fit sort uses the scoreOf accessor', () => {
    const scoreOf = (l) => ({ a: 0.2, b: 0.9, c: 0.5 }[l.rightmove_id]);
    const out = sortListings(sample, { sort: 'fit' }, { scoreOf });
    assertEqual(out[0].rightmove_id, 'b');
  });

  test('controls: fit sort reorders listings that differ only by type rank (2026-07-05)', () => {
    // The type-priority contribution flows through scoreOf: same listing, different
    // property_type rank → different fit score → different default feed position.
    const scoreListingFitStub = (l) => 0.5 + ({ Cottage: 0.25, Detached: 0, Terraced: -0.25 }[l.property_type] || 0);
    const listings = [
      { rightmove_id: 't1', property_type: 'Terraced', first_seen: '2026-07-03' },
      { rightmove_id: 'c1', property_type: 'Cottage', first_seen: '2026-07-01' },
      { rightmove_id: 'd1', property_type: 'Detached', first_seen: '2026-07-02' },
    ];
    const out = sortListings(listings, { sort: 'fit' }, { scoreOf: scoreListingFitStub });
    assertEqual(out.map((l) => l.rightmove_id).join(','), 'c1,d1,t1',
      'feed leads with the top-ranked type despite recency favouring the others');
  });

  test('controls: rating sort uses the ratingOf accessor', () => {
    const ratingOf = (l) => ({ a: 2, b: 10, c: 5 }[l.rightmove_id]);
    const out = sortListings(sample, { sort: 'rating' }, { ratingOf });
    assertEqual(out[0].rightmove_id, 'b');
  });

  test('controls: sortListings does not mutate the input array', () => {
    const before = sample.map((l) => l.rightmove_id);
    sortListings(sample, { sort: 'price-asc' });
    assertEqual(sample.map((l) => l.rightmove_id).join(','), before.join(','));
  });

  test('controls: LISTING_SORTS exposes the documented keys', () => {
    const keys = LISTING_SORTS.map((s) => s.key);
    for (const k of ['fit', 'recent', 'price-asc', 'price-desc', 'beds', 'type', 'rating']) {
      assert(keys.includes(k), `missing sort key ${k}`);
    }
  });
}
