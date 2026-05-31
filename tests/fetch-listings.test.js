// tests/fetch-listings.test.js — v3 L4 optimised-fetch helpers + Step2 baseline.
// Only the PURE pieces are exercised (no network): the learned search-spec is
// threaded into the Rightmove URL, the post-filter drops excluded types and
// stale listings, learned-favourite outcodes are processed first, and the
// always-on baseline (price cap, min beds, dontShow) is verified.
import { buildSearchUrl, filterListingsBySpec, orderOutcodesByFocus, clusterVillages, buildSearchTargets, BASELINE_PRICE_MAX, BASELINE_MIN_BEDS, BASELINE_DONT_SHOW } from '../tools/fetch-listings.mjs';

export async function register({ test, assert, assertEqual }) {
  const NOW = new Date('2026-05-31T00:00:00Z');

  // ── L7.4: radius + clustered search targets ──
  test('fetch-listings: buildSearchUrl adds a radius when given one', () => {
    const url = buildSearchUrl('POSTCODE^123', null, { radiusMiles: 3 });
    assert(url.includes('radius=3'), 'radius disk applied');
    const plain = buildSearchUrl('OUTCODE^1');
    assert(!plain.includes('radius='), 'no radius without one (outcode mode)');
  });

  test('fetch-listings: clusterVillages merges nearby villages, separates far ones', () => {
    const villages = [
      { id: 'a', lat: 51.10, lng: -1.50 },
      { id: 'b', lat: 51.105, lng: -1.50 },   // ~0.35mi from a → same cluster
      { id: 'z', lat: 51.40, lng: -1.10 },    // ~25mi away → its own cluster
    ];
    const clusters = clusterVillages(villages, { capMiles: 5 });
    assertEqual(clusters.length, 2, 'a+b cluster, z alone');
    const big = clusters.find((c) => c.members.length === 2);
    assert(big && big.radiusMiles <= 5, 'cluster radius capped');
  });

  test('fetch-listings: buildSearchTargets modes produce the right shapes', () => {
    const map = new Map([
      ['SP11', [
        { id: 'wherwell-sp11', name: 'Wherwell', outcode: 'SP11', lat: 51.162, lng: -1.476, searchRadiusMi: 3, rightmove: { locationIdentifier: 'POSTCODE^1', identifierQuality: 'tight' } },
        { id: 'newton-stacey-sp11', name: 'Newton Stacey', outcode: 'SP11', lat: 51.177, lng: -1.454 },  // unresolved
      ]],
    ]);
    const oc = buildSearchTargets(map, 'outcode');
    assertEqual(oc.length, 1); assertEqual(oc[0].radiusMiles, null);

    const village = buildSearchTargets(map, 'village');
    assertEqual(village.length, 2);
    const resolved = village.find((t) => t.label === 'wherwell-sp11');
    assertEqual(resolved.locationIdentifier, 'POSTCODE^1'); assertEqual(resolved.radiusMiles, 3);
    const unresolved = village.find((t) => t.label === 'newton-stacey-sp11');
    assertEqual(unresolved.locationIdentifier, null);   // falls back to outcode resolve at fetch time

    // Mixed outcode (one tight + one coarse) → ONE whole-outcode search (cost-safe).
    const cluster = buildSearchTargets(map, 'cluster');
    assertEqual(cluster.length, 1, 'a coarse village forces a single outcode search');
    assertEqual(cluster[0].locationIdentifier, null);
    assertEqual(cluster[0].radiusMiles, null);
    assertEqual(cluster[0].areas.length, 2, 'the outcode search still covers both villages');
  });

  test('fetch-listings: a FULLY-tight outcode clusters into tight disk searches', () => {
    const map = new Map([
      ['SO32', [
        { id: 'a-so32', name: 'A', outcode: 'SO32', lat: 50.96, lng: -1.18, searchRadiusMi: 3, rightmove: { locationIdentifier: 'POSTCODE^1', identifierQuality: 'tight' } },
        { id: 'b-so32', name: 'B', outcode: 'SO32', lat: 50.965, lng: -1.182, searchRadiusMi: 3, rightmove: { locationIdentifier: 'POSTCODE^2', identifierQuality: 'tight' } },
      ]],
    ]);
    const cluster = buildSearchTargets(map, 'cluster');
    assert(cluster.every((t) => t.locationIdentifier && t.radiusMiles != null), 'fully-tight → disk searches with a radius');
    assert(cluster.length <= 2, 'never more searches than villages');
  });

  test('fetch-listings: buildSearchUrl is plain L1 without a spec', () => {
    const url = buildSearchUrl('OUTCODE^123');
    assert(url.includes('locationIdentifier=OUTCODE^123'), 'carries the location id with literal ^ (not %5E)');
    assert(url.includes('maxDaysSinceAdded=3'), 'default 3-day cron overlap');
    assert(!url.includes('minPrice'), 'no learned price floor without a spec');
    // Baseline params are always present even without a spec.
    assert(url.includes(`maxPrice=${BASELINE_PRICE_MAX}`), 'baseline price cap always present');
    assert(url.includes(`minBedrooms=${BASELINE_MIN_BEDS}`), 'baseline min beds always present');
    assert(url.includes('dontShow='), 'dontShow always present');
    assert(url.includes('retirement'), 'retirement excluded');
    assert(url.includes('sharedOwnership'), 'sharedOwnership excluded (camelCase)');
  });

  test('fetch-listings: dontShow param emitted on every call', () => {
    const plain = buildSearchUrl('OUTCODE^1');
    const withSpec = buildSearchUrl('OUTCODE^1', { recencyDays: 7, priceMax: 400000, minBeds: 3 });
    const withRadius = buildSearchUrl('POSTCODE^9', null, { radiusMiles: 3 });
    for (const url of [plain, withSpec, withRadius]) {
      assert(url.includes('dontShow='), `dontShow present in all call forms`);
      assert(url.includes('retirement'), 'retirement always excluded');
      assert(url.includes('sharedOwnership'), 'sharedOwnership always excluded (camelCase)');
    }
  });

  test('fetch-listings: baseline price cap always applied', () => {
    const url = buildSearchUrl('OUTCODE^1');
    assert(url.includes(`maxPrice=${BASELINE_PRICE_MAX}`), `£${BASELINE_PRICE_MAX} cap always in URL`);
    assertEqual(BASELINE_PRICE_MAX, 500000, 'baseline is £500k hard cap');
  });

  test('fetch-listings: baseline min beds always applied', () => {
    const url = buildSearchUrl('OUTCODE^1');
    assert(url.includes(`minBedrooms=${BASELINE_MIN_BEDS}`), 'baseline 2-bed minimum always in URL');
    assertEqual(BASELINE_MIN_BEDS, 2, 'baseline min beds is 2');
  });

  test('fetch-listings: a learned spec narrows the Apify query', () => {
    const spec = { recencyDays: 14, priceMin: 250000, priceMax: 450000, minBeds: 3, excludeTypes: [], focusOutcodes: [] };
    const url = buildSearchUrl('OUTCODE^123', spec);
    assert(url.includes('maxDaysSinceAdded=14'), 'recency window from spec');
    assert(url.includes('minPrice=250000'), 'price floor');
    assert(url.includes('maxPrice=450000'), 'price ceiling tightened below baseline');
    assert(url.includes('minBedrooms=3'), 'bed minimum tightened above baseline');
    // Baseline exclusions still present alongside the spec.
    assert(url.includes('dontShow='), 'dontShow still present with spec');
  });

  test('fetch-listings: spec at baseline price does not double-set maxPrice', () => {
    // priceMax equal to baseline → baseline wins (no change in behaviour).
    const spec = { priceMax: BASELINE_PRICE_MAX, minBeds: 2 };
    const url = buildSearchUrl('OUTCODE^1', spec);
    assert(url.includes(`maxPrice=${BASELINE_PRICE_MAX}`), 'maxPrice still the baseline value');
  });

  test('fetch-listings: env recency override passes through via opts.days', () => {
    // opts.days simulates a MAX_DAYS_SINCE_ADDED env override without reloading the module.
    const url7 = buildSearchUrl('OUTCODE^123', null, { days: 7 });
    assert(url7.includes('maxDaysSinceAdded=7'), '7-day env override reflected');
    const url14 = buildSearchUrl('OUTCODE^123', null, { days: 14 });
    assert(url14.includes('maxDaysSinceAdded=14'), '14-day foundation window reflected');
  });

  test('fetch-listings: baseline dont-show constant is well-formed', () => {
    assert(BASELINE_DONT_SHOW.includes('retirement'), 'retirement in BASELINE_DONT_SHOW');
    assert(BASELINE_DONT_SHOW.includes('sharedOwnership'), 'sharedOwnership in BASELINE_DONT_SHOW (camelCase)');
  });

  test('fetch-listings: post-filter drops excluded types but keeps undated listings', () => {
    const spec = { recencyDays: 14, excludeTypes: ['flat'] };
    const rows = [
      { rightmove_id: 'a', property_type: 'Detached', added_date: '2026-05-25' },  // recent, kept
      { rightmove_id: 'b', property_type: 'Flat', added_date: '2026-05-25' },       // excluded type
      { rightmove_id: 'c', property_type: 'Detached', added_date: '2026-01-01' },   // stale, dropped
      { rightmove_id: 'd', property_type: 'Detached', added_date: null },           // undated, kept
    ];
    const out = filterListingsBySpec(rows, spec, NOW).map((r) => r.rightmove_id);
    assert(out.includes('a'), 'recent in-type kept');
    assert(!out.includes('b'), 'excluded type dropped');
    assert(!out.includes('c'), 'stale dropped');
    assert(out.includes('d'), 'undated kept (cannot prove stale)');
  });

  test('fetch-listings: no spec is a pass-through filter', () => {
    const rows = [{ rightmove_id: 'a' }, { rightmove_id: 'b' }];
    assertEqual(filterListingsBySpec(rows, null, NOW).length, 2);
  });

  test('fetch-listings: focus outcodes are processed first, none dropped', () => {
    const ordered = orderOutcodesByFocus(['GU34', 'GU35', 'SO21', 'SP5'], { focusOutcodes: ['gu35', 'sp5'] });
    assertEqual(ordered.length, 4, 'lossless');
    assertEqual(ordered[0], 'GU35');
    assertEqual(ordered[1], 'SP5');
    assert(ordered.includes('GU34') && ordered.includes('SO21'), 'non-focus retained');
  });
}
