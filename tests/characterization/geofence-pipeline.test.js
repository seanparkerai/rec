// Characterization: withinGeofence() contracts the Phase-2 pipeline rework must
// preserve (step 2.1). Complements tests/unit/listings-normalise.test.js — these
// pin the SUBTLE contracts (ordering, boundary inclusivity, exact conversion,
// sectoral membership, primary-position independence, determinism) that the
// shared-loader (2.4–2.8) and derived-primary (2.9–2.11) steps lean on.
import {
  withinGeofence, haversineKm, MILES_PER_KM, GEOFENCE_RADIUS_KM,
} from '../../tools/listings-normalise.mjs';

export async function register({ test, assert, assertEqual }) {
  // Exact-geometry fixtures: same longitude → distance is pure latitude arc.
  const V = (id, name, lat, lng, extra = {}) => ({ id, name, outcode: 'SP11', lat, lng, ...extra });

  test('geofence: membership rows are km-sorted nearest-first', () => {
    const villages = [
      V('far', 'Farville', 51.03, -1.4),   // ~3.3 km from listing
      V('near', 'Nearville', 51.01, -1.4), // ~1.1 km
      V('mid', 'Midville', 51.02, -1.4),   // ~2.2 km
    ];
    const r = withinGeofence({ lat: 51.0, lng: -1.4 }, { villages });
    assertEqual(JSON.stringify(r.areas.map((a) => a.area_id)), JSON.stringify(['near', 'mid', 'far']));
    const dists = r.areas.map((a) => a.distance_mi);
    assert(dists.every((d, i) => i === 0 || d >= dists[i - 1]), 'distances ascend');
  });

  test('geofence: the named-tiebreak primary keeps its km-sorted position (primary ≠ first row)', () => {
    const villages = [
      V('near', 'Nearville', 51.01, -1.4),           // nearest, NOT named
      V('named', 'Namedville', 51.02, -1.4),         // further, named in the address
    ];
    const r = withinGeofence(
      { lat: 51.0, lng: -1.4, address: '3 The Street, Namedville' }, { villages },
    );
    assertEqual(r.area_id, 'named', 'address-named in-buffer village wins the primary');
    assertEqual(r.areas.map((a) => a.area_id).join(','), 'near,named', 'ordering stays km-sorted');
    assertEqual(r.areas[1].is_primary, true, 'primary is the SECOND row here');
    assertEqual(r.areas[0].is_primary, false);
    assertEqual(r.areas.filter((a) => a.is_primary).length, 1, 'exactly one primary');
  });

  test('geofence: buffer boundary is INCLUSIVE (km === radius passes)', () => {
    const village = V('edge', 'Edgeville', 51.0, -1.4);
    const listing = { lat: 51.02, lng: -1.4 };
    const exactKm = haversineKm({ lat: 51.02, lng: -1.4 }, village);
    const r = withinGeofence(listing, { villages: [{ ...village, geofenceRadiusKm: exactKm }] });
    assert(r.pass, 'a listing exactly ON the buffer edge is IN');
    const rOut = withinGeofence(listing, { villages: [{ ...village, geofenceRadiusKm: exactKm - 1e-9 }] });
    assert(!rOut.pass, 'a hair inside the radius line means out');
  });

  test('geofence: distance_mi is exactly km × MILES_PER_KM (0.621371)', () => {
    const village = V('v', 'Ville', 51.0, -1.4);
    const listing = { lat: 51.01, lng: -1.4 };
    const km = haversineKm(listing, village);
    const r = withinGeofence(listing, { villages: [village] });
    assertEqual(r.distance_mi, km * MILES_PER_KM);
    assertEqual(r.areas[0].distance_mi, km * MILES_PER_KM, 'membership rows use the same conversion');
    assertEqual(MILES_PER_KM, 0.621371);
    assertEqual(GEOFENCE_RADIUS_KM, 4.8);
  });

  test('geofence: petal villages contribute to MEMBERSHIP by their sectoral radius', () => {
    // Petal village: wide to the north (sector 0), tight everywhere else.
    const petal = V('petal', 'Petalville', 51.0, -1.4, { geofenceRadiiKm: [5, 1, 1, 1, 1, 1, 1, 1] });
    const scalar = V('scalar', 'Scalarville', 51.035, -1.4, { geofenceRadiusKm: 4.8 });
    const north = { lat: 51.02, lng: -1.4 };  // ~2.2 km due north of petal, ~1.7 km south of scalar
    const r = withinGeofence(north, { villages: [petal, scalar] });
    assertEqual(JSON.stringify(r.areas.map((a) => a.area_id).sort()), JSON.stringify(['petal', 'scalar']),
      'member of the petal village via its wide north sector AND the scalar village');
    // Same distances due EAST of the petal village: the tight 1 km east sector cuts it.
    const east = { lat: 51.0, lng: -1.368 }; // ~2.2 km due east
    const rEast = withinGeofence(east, { villages: [petal] });
    assert(!rEast.pass, 'east of the petal village at the same distance is OUT (sector radius 1 km)');
  });

  test('geofence: mixed scalar/petal/default universes resolve per-village (shared-loader contract)', () => {
    const villages = [
      V('def', 'Defville', 51.0, -1.4),                                    // global default 4.8
      V('tight', 'Tightville', 51.06, -1.4, { geofenceRadiusKm: 1.0 }),    // scalar override
      V('petal', 'Petalville', 51.12, -1.4, { geofenceRadiiKm: [3, 3, 3, 3, 1, 3, 3, 3] }),
    ];
    // ~2.2 km from def (in, default), ~4.4 km from tight (out, 1 km), ~11 km from petal (out).
    const r = withinGeofence({ lat: 51.02, lng: -1.4 }, { villages });
    assertEqual(JSON.stringify(r.areas.map((a) => a.area_id)), JSON.stringify(['def']));
  });

  test('geofence: deterministic — identical input, identical full result', () => {
    const villages = [
      V('a', 'Aville', 51.01, -1.4),
      V('b', 'Bville', 51.02, -1.41, { geofenceRadiiKm: [4, 4, 4, 4, 4, 4, 4, 4] }),
    ];
    const listing = { lat: 51.0, lng: -1.4, address: 'Bville Road', postcode: 'SP11 1AA' };
    const one = JSON.stringify(withinGeofence(listing, { villages }));
    const two = JSON.stringify(withinGeofence(listing, { villages }));
    assertEqual(one, two);
  });
}
