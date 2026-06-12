// tests/fetch-listings.test.js — v3 L4 optimised-fetch helpers + Step2 baseline.
// Only the PURE pieces are exercised (no network): the learned search-spec is
// threaded into the Rightmove URL, the post-filter drops excluded types and
// stale listings, learned-favourite outcodes are processed first, and the
// always-on baseline (price cap, min beds, dontShow) is verified.
import { buildSearchUrl, filterListingsBySpec, orderOutcodesByFocus, clusterVillages, buildSearchTargets, householdRowsToVillages, priceBandForAreas, BASELINE_PRICE_MIN, BASELINE_PRICE_MAX, BASELINE_MIN_BEDS, BASELINE_DONT_SHOW, BASELINE_PROPERTY_TYPES } from '../tools/fetch-listings.mjs';

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

  // ── household-added areas merged at run-time (Part B) ──
  test('fetch-listings: householdRowsToVillages includes only located, non-repo stubs', () => {
    const rows = [
      // eligible: coords + full postcode (→ outcode) + located source
      { id: 'alresford-hampshire', data: { name: 'Alresford', postcode: 'SO24 9AB', coords: { lat: 51.09, lng: -1.16 }, coordsSource: 'postcodes-io:places+reverse', geofenceRadiusMi: 3, searchRadiusMi: 3, source: 'household-onboarding', active: false } },
      // un-enriched: coords-only soft-fail (no postcode) → skipped, stays Researching
      { id: 'foo-surrey', data: { name: 'Foo', postcode: null, coords: { lat: 51.2, lng: -0.5 }, coordsSource: 'postcodes-io-provisional', source: 'household-onboarding', active: false } },
      // county-flagged → skipped
      { id: 'charlwood-hampshire', data: { name: 'Charlwood', postcode: 'RH6 0AA', coords: { lat: 51.15, lng: -0.22 }, coordsSource: 'postcodes-io:county-mismatch', source: 'household-onboarding', active: false } },
      // missing coords → skipped
      { id: 'bar-kent', data: { name: 'Bar', postcode: 'ME1 1AA', coords: null, coordsSource: 'postcodes-io:places+reverse', source: 'household-onboarding', active: false } },
      // already in the repo (curated catalog-match link) → skipped (covered by loadOutcodeMap)
      { id: 'oakley-rg23', data: { name: 'Oakley', postcode: 'RG23 7AA', coords: { lat: 51.27, lng: -1.17 }, coordsSource: 'postcodes-io:places+reverse' } },
    ];
    const repoIds = new Set(['oakley-rg23']);
    const out = householdRowsToVillages(rows, repoIds);
    assertEqual(out.length, 1, 'only the located, non-repo stub is merged');
    const v = out[0];
    assertEqual(v.id, 'alresford-hampshire');
    assertEqual(v.outcode, 'SO24', 'outcode derived from the full postcode (not stored)');
    assertEqual(v.lat, 51.09); assertEqual(v.lng, -1.16);
    assert(v.geofenceRadiusKm > 4 && v.geofenceRadiusKm < 5, '3mi geofence → ~4.8km');
    assertEqual(v.searchRadiusMi, 3, 'search radius carried for clustering');
  });

  test('fetch-listings: householdRowsToVillages is safe on empty / dup input', () => {
    assertEqual(householdRowsToVillages([], new Set()).length, 0);
    assertEqual(householdRowsToVillages(null, new Set()).length, 0);
    const dup = [
      { id: 'x-hants', data: { name: 'X', postcode: 'SO24 9AB', coords: { lat: 51, lng: -1 }, coordsSource: 'postcodes-io:postcode' } },
      { id: 'x-hants', data: { name: 'X', postcode: 'SO24 9AB', coords: { lat: 51, lng: -1 }, coordsSource: 'postcodes-io:postcode' } },
    ];
    assertEqual(householdRowsToVillages(dup, new Set()).length, 1, 'deduped by id');
  });

  test('fetch-listings: buildSearchUrl is plain L1 without a spec', () => {
    const url = buildSearchUrl('OUTCODE^123');
    assert(url.includes('locationIdentifier=OUTCODE^123'), 'carries the location id with literal ^ (not %5E)');
    assert(url.includes('maxDaysSinceAdded=3'), 'default 3-day cron overlap');
    assert(url.includes(`minPrice=${BASELINE_PRICE_MIN}`), 'baseline price floor always present');
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
    assertEqual(BASELINE_PRICE_MAX, 425000, 'baseline is £425k hard cap');
  });

  test('fetch-listings: baseline min beds always applied', () => {
    const url = buildSearchUrl('OUTCODE^1');
    assert(url.includes(`minBedrooms=${BASELINE_MIN_BEDS}`), 'baseline 2-bed minimum always in URL');
    assertEqual(BASELINE_MIN_BEDS, 2, 'baseline min beds is 2');
  });

  test('fetch-listings: a learned spec narrows the Apify query', () => {
    const spec = { recencyDays: 14, priceMin: 300000, priceMax: 400000, minBeds: 3, excludeTypes: [], focusOutcodes: [] };
    const url = buildSearchUrl('OUTCODE^123', spec);
    assert(url.includes('maxDaysSinceAdded=14'), 'recency window from spec');
    assert(url.includes('minPrice=300000'), 'price floor tightened above baseline');
    assert(url.includes('maxPrice=400000'), 'price ceiling tightened below baseline');
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

  test('fetch-listings: propertyTypes allow-list excludes the flat family at source', () => {
    // Houses + bungalows only — flat/apartment/maisonette (Rightmove `flat`), land and
    // park-home are all absent from the allow-list, so Apify never returns or bills them.
    assert(BASELINE_PROPERTY_TYPES.includes('detached'), 'detached allowed');
    assert(BASELINE_PROPERTY_TYPES.includes('semi-detached'), 'semi-detached allowed');
    assert(BASELINE_PROPERTY_TYPES.includes('terraced'), 'terraced allowed');
    assert(BASELINE_PROPERTY_TYPES.includes('bungalow'), 'bungalow allowed');
    assert(!BASELINE_PROPERTY_TYPES.includes('flat'), 'flat NOT allowed (covers apartment/maisonette/studio/penthouse)');
    assert(!BASELINE_PROPERTY_TYPES.includes('land'), 'land NOT allowed');
    assert(!BASELINE_PROPERTY_TYPES.includes('park-home'), 'park-home NOT allowed');
  });

  test('fetch-listings: propertyTypes param emitted on every call form', () => {
    const plain = buildSearchUrl('OUTCODE^1');
    const withSpec = buildSearchUrl('OUTCODE^1', { recencyDays: 7, priceMax: 400000, minBeds: 3 });
    const withRadius = buildSearchUrl('POSTCODE^9', null, { radiusMiles: 3 });
    for (const url of [plain, withSpec, withRadius]) {
      assert(/[?&]propertyTypes=/.test(url), 'propertyTypes present in all call forms');
      // The comma list is URL-encoded (%2C); each allowed slug appears, no flat/land/park-home.
      for (const slug of BASELINE_PROPERTY_TYPES) assert(url.includes(slug), `${slug} in allow-list`);
      assert(!/propertyTypes=[^&]*\bflat\b/.test(decodeURIComponent(url)), 'flat never admitted at source');
    }
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

  // ── per-household budget bands (union per search target) ──
  test('fetch-listings: buildSearchUrl honours a per-target price band', () => {
    const url = buildSearchUrl('OUTCODE^1', null, { priceMin: 330000, priceMax: 400000 });
    assert(url.includes('minPrice=330000'), 'band floor applied');
    assert(url.includes('maxPrice=400000'), 'band ceiling applied');
    // A household band may sit OUTSIDE the fallback band — it must still win.
    const wide = buildSearchUrl('OUTCODE^1', null, { priceMin: 200000, priceMax: 500000 });
    assert(wide.includes('minPrice=200000'), 'band may go below the fallback floor');
    assert(wide.includes('maxPrice=500000'), 'band may exceed the fallback ceiling');
    // No band → fallback baseline, exactly as before.
    const plain = buildSearchUrl('OUTCODE^1');
    assert(plain.includes(`minPrice=${BASELINE_PRICE_MIN}`) && plain.includes(`maxPrice=${BASELINE_PRICE_MAX}`), 'fallback band without opts');
  });

  test('fetch-listings: learned spec tightens within the band, never loosens it', () => {
    const band = { priceMin: 330000, priceMax: 400000 };
    const tighter = buildSearchUrl('OUTCODE^1', { priceMin: 350000, priceMax: 390000 }, band);
    assert(tighter.includes('minPrice=350000') && tighter.includes('maxPrice=390000'), 'spec narrows inside the band');
    const looser = buildSearchUrl('OUTCODE^1', { priceMin: 100000, priceMax: 999999 }, band);
    assert(looser.includes('minPrice=330000') && looser.includes('maxPrice=400000'), 'spec cannot widen past the band');
  });

  test('fetch-listings: priceBandForAreas unions every linked household budget', () => {
    const areaHouseholds = new Map([
      ['solo-a', new Set(['h1'])],
      ['solo-b', new Set(['h2'])],
      ['shared', new Set(['h1', 'h2'])],
      ['nobudget', new Set(['h3'])],          // linked household with no stored budget
    ]);
    const budgets = new Map([
      ['h1', { min: 250000, max: 425000 }],
      ['h2', { min: 330000, max: 400000 }],
    ]);
    const one = priceBandForAreas(['solo-b'], areaHouseholds, budgets);
    assertEqual(one.min, 330000); assertEqual(one.max, 400000);
    const both = priceBandForAreas(['solo-a', 'solo-b'], areaHouseholds, budgets);
    assertEqual(both.min, 250000, 'lowest minimum across households');
    assertEqual(both.max, 425000, 'highest maximum across households');
    const shared = priceBandForAreas(['shared'], areaHouseholds, budgets);
    assertEqual(shared.min, 250000); assertEqual(shared.max, 425000);
    // Unlinked area → fallback band unchanged.
    const unlinked = priceBandForAreas(['nowhere'], areaHouseholds, budgets);
    assertEqual(unlinked.min, BASELINE_PRICE_MIN); assertEqual(unlinked.max, BASELINE_PRICE_MAX);
    // A linked-but-unbudgeted household folds the fallback in (coverage never shrinks).
    const folded = priceBandForAreas(['solo-b', 'nobudget'], areaHouseholds, budgets);
    assertEqual(folded.min, Math.min(330000, BASELINE_PRICE_MIN));
    assertEqual(folded.max, Math.max(400000, BASELINE_PRICE_MAX));
    // Empty / missing inputs degrade to the fallback band.
    const empty = priceBandForAreas([], new Map(), new Map());
    assertEqual(empty.min, BASELINE_PRICE_MIN); assertEqual(empty.max, BASELINE_PRICE_MAX);
  });

  test('fetch-listings: focus outcodes are processed first, none dropped', () => {
    const ordered = orderOutcodesByFocus(['GU34', 'GU35', 'SO21', 'SP5'], { focusOutcodes: ['gu35', 'sp5'] });
    assertEqual(ordered.length, 4, 'lossless');
    assertEqual(ordered[0], 'GU35');
    assertEqual(ordered[1], 'SP5');
    assert(ordered.includes('GU34') && ordered.includes('SO21'), 'non-focus retained');
  });
}
