// tests/backfill-geofence.test.js — L7.0 pure-logic tests for the geofence
// backfill recompute (tools/backfill-geofence.mjs). No network/DB: locks the
// per-row field derivation, the summary counts, and the emitted SQL escaping.
import { geofenceFields, summarise, emitSql } from '../tools/backfill-geofence.mjs';

const VILLAGES = [
  { id: 'wherwell-sp11', name: 'wherwell', outcode: 'SP11', lat: 51.1624, lng: -1.4756 },
  { id: 'newton-stacey-sp11', name: 'newton stacey', outcode: 'SP11', lat: 51.177, lng: -1.4537 },
];

export async function register({ test, assert, assertEqual }) {
  test('backfill/geofenceFields: in-buffer corroborated row', () => {
    const f = geofenceFields({ rightmove_id: '1', lat: 51.1624, lng: -1.4756, address: 'Wherwell, SP11', postcode: 'SP11' }, VILLAGES);
    assertEqual(f.area_id, 'wherwell-sp11');
    assertEqual(f.geofence_pass, true);
    assertEqual(f.corroborated, true);
    assertEqual(f.match_source, 'coordinates+name');
  });

  test('backfill/geofenceFields: out-of-buffer row flips geofence_pass=false', () => {
    const f = geofenceFields({ rightmove_id: '2', lat: 51.247, lng: -1.514, address: 'Hatherden', postcode: 'SP10' }, VILLAGES);
    assertEqual(f.geofence_pass, false);
    assert(f.distance_mi > 3, 'far from every village');
  });

  test('backfill/geofenceFields: no-coords row is rejected with null fields', () => {
    const f = geofenceFields({ rightmove_id: '3', lat: null, lng: null }, VILLAGES);
    assertEqual(f.geofence_pass, false);
    assertEqual(f.area_id, null);
    assertEqual(f.distance_mi, null);
    assertEqual(f.match_source, 'coordinates');
  });

  test('backfill/summarise: counts kept / flips / flagged', () => {
    const computed = [
      { geofence_pass: true, corroborated: true },
      { geofence_pass: true, corroborated: false },
      { geofence_pass: false, corroborated: false },
    ];
    const s = summarise(computed);
    assertEqual(s.total, 3); assertEqual(s.kept, 2); assertEqual(s.flips, 1); assertEqual(s.flagged, 1);
  });

  test('backfill/emitSql: escapes ids and renders typed literals', () => {
    const sql = emitSql([{ rightmove_id: "a'b", area_id: 'x-sp11', distance_mi: 1.23, geofence_pass: true, name_match: null, corroborated: false, match_source: 'coordinates' }]);
    assert(sql.includes("'a''b'"), 'single quote doubled');
    assert(sql.includes('NULL'), 'null name_match → NULL');
    assert(sql.includes('true'), 'boolean rendered unquoted');
    assert(sql.includes('UPDATE listings'), 'is an UPDATE statement');
  });
}
