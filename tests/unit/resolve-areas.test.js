// tests/resolve-areas.test.js — L7.3 pure-logic tests for the per-village Rightmove
// resolver. No network: locks the namesake distance guard, the identifier-quality
// classification, and the typeahead-match parser. The live typeahead/postcodes.io
// round-trip is exercised by running the tool in CI.
import {
  withinDisambiguation,
  classifyIdentifier,
  parseTypeaheadMatch,
  DISAMBIGUATION_KM,
} from '../../tools/resolve-areas.mjs';

export async function register({ test, assert, assertEqual }) {
  test('resolve/withinDisambiguation: accepts a 1km candidate, rejects a 50km namesake', () => {
    const coords = { lat: 51.00, lng: -1.86 };                  // Newtown, SP5
    assert(withinDisambiguation(coords, { lat: 51.003, lng: -1.861 }), '~0.3km → same place');
    assert(!withinDisambiguation(coords, { lat: 52.51, lng: -1.10 }), 'a Midlands Newtown → rejected');
  });

  test('resolve/classifyIdentifier: POSTCODE/STATION tight, OUTCODE coarse, REGION conditional', () => {
    assertEqual(classifyIdentifier('POSTCODE'), 'tight');
    assertEqual(classifyIdentifier('STATION'), 'tight');
    assertEqual(classifyIdentifier('OUTCODE'), 'coarse');
    assertEqual(classifyIdentifier('REGION', { nameConfirmed: true, distanceOk: true }), 'tight');
    assertEqual(classifyIdentifier('REGION', { nameConfirmed: true, distanceOk: false }), 'coarse');
    assertEqual(classifyIdentifier('REGION', { nameConfirmed: false, distanceOk: true }), 'coarse');
  });

  test('resolve/parseTypeaheadMatch: normalises id/type/label and synthesises id^', () => {
    const a = parseTypeaheadMatch({ locationIdentifier: 'POSTCODE^1603691', displayName: 'SP11 7JX' });
    assertEqual(a.id, 'POSTCODE^1603691'); assertEqual(a.type, 'POSTCODE');
    const b = parseTypeaheadMatch({ id: '12345', type: 'REGION', name: 'Wherwell' });
    assertEqual(b.id, 'REGION^12345'); assertEqual(b.type, 'REGION'); assertEqual(b.label, 'Wherwell');
  });

  test('resolve/DISAMBIGUATION_KM is a sane default', () => {
    assert(DISAMBIGUATION_KM >= 5 && DISAMBIGUATION_KM <= 15, 'guard radius in a sensible band');
  });
}
