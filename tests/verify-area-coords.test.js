// tests/verify-area-coords.test.js — L7.0a pure-logic tests for the coord/name
// verifier. No network: these lock the normaliser, the tolerant name matcher, the
// namesake-distance guard, the centroid-leak detector, and the outcode-agreement
// flag. The postcodes.io round-trip itself is exercised by running the tool with
// --online (in CI); here we prove the logic it gates on.
import {
  levenshtein,
  tokenOverlap,
  nameMatches,
  samepoint,
  nearestCentroid,
  verifyArea,
  flagNamesakes,
  flagDuplicatePoints,
} from '../tools/verify-area-coords.mjs';
import { normaliseName } from '../tools/listings-normalise.mjs';

export async function register({ test, assert, assertEqual }) {
  test('verify/normaliseName: collapses Saint / St. / punctuation', () => {
    assertEqual(normaliseName('Newton St. Loe'), normaliseName('Newton Saint Loe'));
    assertEqual(normaliseName('Newton St Loe'), 'newton loe');
    assertEqual(normaliseName("Hinton Ampner, Hampshire"), 'hinton ampner');
  });

  test('verify/levenshtein: basic edit distances', () => {
    assertEqual(levenshtein('wherwell', 'wherwell'), 0);
    assertEqual(levenshtein('wherwell', 'wherwel'), 1);
    assert(levenshtein('andover', 'wherwell') > 2, 'unrelated names are far apart');
  });

  test('verify/nameMatches: exact, contained, typo, and token overlap', () => {
    assert(nameMatches('Wherwell', 'wherwell'), 'exact (normalised)');
    assert(nameMatches('Over Wallop', 'Over Wallop, Hampshire'), 'containment');
    assert(nameMatches('Wherwell', 'Wherwel'), 'Levenshtein ≤ 2 typo');
    assert(nameMatches('Kings Somborne', 'Somborne Kings'), 'token overlap');
    assert(!nameMatches('Wherwell', 'Andover'), 'distinct places do not match');
  });

  test('verify/samepoint: identifies a reused (stamped) coordinate', () => {
    assert(samepoint({ lat: 51.1900, lng: -1.5000 }, { lat: 51.1902, lng: -1.4999 }), 'same point');
    assert(!samepoint({ lat: 51.145, lng: -1.468 }, { lat: 51.19, lng: -1.50 }), 'Wherwell ≠ SP11 centroid');
  });

  test('verify/nearestCentroid: picks the closest district', () => {
    const centroids = new Map([['SP11', { lat: 51.19, lng: -1.50 }], ['SO20', { lat: 51.118, lng: -1.491 }]]);
    assertEqual(nearestCentroid({ lat: 51.145, lng: -1.468 }, centroids).outcode, 'SO20');
  });

  test('verify/Check2: coords off the patch entirely are a hard flag; near coords are not', () => {
    const villages = [{ village: 'Wherwell', outcode: 'SP11' }];
    const centroids = new Map([['SP11', { lat: 51.19, lng: -1.50 }]]);
    const london = { id: 'x-sp11', name: 'Wherwell', postcode: 'SP11',
      coords: { lat: 51.5072, lng: -0.1276 }, coordsSource: 'os-opendata:place-centre' };
    assert(verifyArea(london, { villages, centroids }).flags.some((f) => f.startsWith('off_patch')), 'London → off_patch');
    const real = { id: 'wherwell-sp11', name: 'Wherwell', postcode: 'SP11',
      coords: { lat: 51.145, lng: -1.468 }, coordsSource: 'os-opendata:place-centre' };
    assertEqual(verifyArea(real, { villages, centroids }).flags.length, 0, 'a real village centre is clean');
  });

  test('verify/Check4: a name absent from the list is name_unconfirmed (soft, not hard)', () => {
    const villages = [{ village: 'Wherwell', outcode: 'SP11' }];
    const centroids = new Map([['SP11', { lat: 51.19, lng: -1.50 }]]);
    const area = { id: 'mystery-sp11', name: 'Nowhereville', postcode: 'SP11',
      coords: { lat: 51.16, lng: -1.46 }, coordsSource: 'os-opendata:place-centre' };
    const r = verifyArea(area, { villages, centroids });
    assert(r.notes.includes('name_unconfirmed'), 'unknown name → soft note');
    assertEqual(r.flags.length, 0, 'not a hard flag on its own');
  });

  test('verify/Check3: two villages stamped on the same point are flagged as duplicate', () => {
    const recs = [
      { id: 'a', name: 'A', coords: { lat: 51.19, lng: -1.50 }, flags: [], notes: [] },
      { id: 'b', name: 'B', coords: { lat: 51.1902, lng: -1.4999 }, flags: [], notes: [] },
      { id: 'c', name: 'C', coords: { lat: 51.00, lng: -1.86 }, flags: [], notes: [] },
    ];
    flagDuplicatePoints(recs, new Map());
    assert(recs[0].flags.some((f) => f.startsWith('duplicate_coords')), 'a duplicates b');
    assert(recs[1].flags.some((f) => f.startsWith('duplicate_coords')), 'b duplicates a');
    assertEqual(recs[2].flags.length, 0, 'distinct point is clean');
  });

  test('verify/Check3: SAME village stamped twice is a soft note, not a hard flag', () => {
    const recs = [
      { id: 'colemore-gu34', name: 'Colemore', coords: { lat: 51.0547, lng: -1.0506 }, flags: [], notes: [] },
      { id: 'colemore-gu32', name: 'Colemore', coords: { lat: 51.0547, lng: -1.0506 }, flags: [], notes: [] },
    ];
    flagDuplicatePoints(recs, new Map());
    assertEqual(recs[0].flags.length, 0, 'same village → no hard flag');
    assert(recs[0].notes.some((n) => n.startsWith('duplicate_village_record')), 'recorded as a dedup note');
  });

  test('verify/Check3: adjacent hamlets ~150m apart do NOT trip the exact-copy detector', () => {
    const recs = [
      { id: 'middle-winterslow-sp5', name: 'Middle Winterslow', coords: { lat: 51.0139, lng: -1.682 }, flags: [], notes: [] },
      { id: 'west-winterslow-sp5', name: 'West Winterslow', coords: { lat: 51.0126, lng: -1.6831 }, flags: [], notes: [] },
    ];
    flagDuplicatePoints(recs, new Map());
    assertEqual(recs[0].flags.length, 0, 'distinct nearby villages are clean');
    assertEqual(recs[1].flags.length, 0, 'distinct nearby villages are clean');
  });

  test('verify/Check3: coords stamped on a district centroid are flagged', () => {
    const recs = [{ id: 'leak', name: 'X', coords: { lat: 51.1900, lng: -1.5000 }, flags: [], notes: [] }];
    flagDuplicatePoints(recs, new Map([['SP11', { lat: 51.19, lng: -1.50 }]]));
    assert(recs[0].flags.some((f) => f.startsWith('on_district_centroid')), 'on-centroid → flagged');
  });

  test('verify/Check6 namesake: same name >8km apart is flagged, 1km is not', () => {
    const mk = (id, lat, lng) => ({ id, name: 'Newtown', coords: { lat, lng }, flags: [], notes: [] });
    const far = [mk('newtown-sp5', 51.00, -1.86), mk('newtown-elsewhere', 51.50, -1.10)];
    flagNamesakes(far);
    assert(far[0].flags.some((f) => f.startsWith('possible_namesake_mismatch')), '50km apart → flagged');

    const near = [mk('a', 51.000, -1.860), mk('b', 51.005, -1.862)];
    flagNamesakes(near);
    assertEqual(near[0].flags.length, 0, '<1km apart → not flagged');
  });

  test('verify/tokenOverlap: directional fraction', () => {
    assertEqual(tokenOverlap('kings somborne', 'somborne'), 0.5);
    assertEqual(tokenOverlap('somborne', 'kings somborne'), 1);
  });
}
