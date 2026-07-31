// fetch-radius.test.js — the RADIUS LADDER rail (2026-07-31 coverage audit).
//
// The bug this pins: Rightmove's `radius` search parameter is an ENUM, not a free
// number. An off-ladder value (radius=6.9) is rejected and the search returns ZERO
// results — silently, with an HTTP 200 and an empty page, exactly like an
// off-ladder maxDaysSinceAdded. Cluster mode computes a geometric disk radius
// (max member distance + that member's search radius), which almost never lands on
// a ladder value, so 36 of the 56 production search targets emitted an invalid
// radius and were blank on every run for weeks. Only the lone-village disks — which
// sit at exactly 3.0mi, a ladder value — were ever really searched. Measured
// effect: just 22% of the household's 180 active areas (Dorset 71%, Hampshire 26%,
// Wiltshire 13%) sat inside a disk that Rightmove would actually honour.
//
// The rail: every radius the fetcher puts on the wire is a ladder value, and the
// snap is always UPWARD. Rounding DOWN would shrink the searched disk below the
// geometry the cluster was built to cover and silently drop listings — the failure
// class tools/audit-listing-coverage.mjs exists to prevent. Rounding up only widens
// the paid search; the coordinate geofence still decides membership.
//
// WAVE 2 (same audit): the snap alone still left ZERO slack. A disk is centred on
// the seed's Rightmove POSTCODE^ point — a postcode centroid reverse-geocoded from
// the stored village coords — while the geofence ring is centred on those coords.
// Cluster geometry gives each member exactly zero margin, so offset centres of equal
// radius leave a crescent of every ring unsearched. A ring-point probe over the live
// universe found 22 areas with uncovered ring points, worst containment 0.00mi.
// SEARCH_MARGIN_MI is added BEFORE the snap so every ring is strictly contained.
import { buildSearchUrl, snapRadiusUp, wireRadiusFor, RIGHTMOVE_RADII, SEARCH_MARGIN_MI, CLUSTER_CAP_MI, clusterVillages } from '../../tools/fetch-listings.mjs';

const radiusOf = (url) => {
  const m = /[?&]radius=([^&]+)/.exec(url);
  return m ? Number(decodeURIComponent(m[1])) : null;
};

export async function register({ test, assert, assertEqual }) {
  test('fetch-radius: the ladder is exactly Rightmove\'s accepted set', () => {
    assertEqual(RIGHTMOVE_RADII.join(','), '0,0.25,0.5,1,3,5,10,15,20,30,40',
      'Rightmove radius enum changed — verify against the live search form before editing');
  });

  test('fetch-radius: snap never shrinks the disk (coverage is never lost)', () => {
    for (let mi = 0; mi <= 45; mi += 0.1) {
      const snapped = snapRadiusUp(mi);
      assert(snapped >= Math.min(mi, 40) - 1e-9,
        `snapRadiusUp(${mi.toFixed(1)}) = ${snapped} shrank the disk — that silently drops listings`);
      assert(RIGHTMOVE_RADII.includes(snapped), `snapRadiusUp(${mi.toFixed(1)}) = ${snapped} is off-ladder`);
    }
  });

  test('fetch-radius: ladder values are returned unchanged (no needless widening)', () => {
    for (const r of RIGHTMOVE_RADII) assertEqual(snapRadiusUp(r), r, `${r} is already valid`);
  });

  test('fetch-radius: non-numeric / negative / absent radius stays absent', () => {
    for (const bad of [null, undefined, '', 'abc', NaN, -1]) assertEqual(snapRadiusUp(bad), null, `${String(bad)} → null`);
    assertEqual(radiusOf(buildSearchUrl('OUTCODE^123')), null, 'no radius opt → no radius param (whole-outcode search)');
  });

  test('fetch-radius: every emitted search URL carries a ladder radius', () => {
    // The exact geometric radii the 2026-07-31 production run emitted — every one
    // of these was silently returning zero results before the snap.
    const observed = [3.4, 4.3, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3, 5.4, 5.7, 6.0, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.9, 7.0];
    for (const mi of observed) {
      const emitted = radiusOf(buildSearchUrl('POSTCODE^1', null, { radiusMiles: mi }));
      assert(RIGHTMOVE_RADII.includes(emitted), `radius=${mi} emitted ${emitted}, which Rightmove rejects (0 results)`);
      assert(emitted >= mi, `radius=${mi} emitted ${emitted} — narrower than the cluster geometry`);
    }
  });

  test('fetch-radius: a learned spec radius is snapped too', () => {
    const emitted = radiusOf(buildSearchUrl('POSTCODE^1', { radiusMiles: 6.9 }));
    assertEqual(emitted, 10, 'spec.radiusMiles must go through the same snap');
  });

  test('fetch-radius: the wire radius STRICTLY contains the geometric disk', () => {
    // The load-bearing property: searched radius > geometry, by at least the
    // centre-offset margin. Equality is a FAILURE — that is the zero-slack state
    // wave 2 found, where a postcode-centroid offset silently clips every ring.
    assert(SEARCH_MARGIN_MI >= 1, `SEARCH_MARGIN_MI=${SEARCH_MARGIN_MI} is below the 1mi reverse-geocode allowance`);
    for (let mi = 0.5; mi <= 12; mi += 0.1) {
      const wire = wireRadiusFor(mi);
      assert(RIGHTMOVE_RADII.includes(wire), `wireRadiusFor(${mi.toFixed(1)}) = ${wire} is off-ladder`);
      assert(wire >= mi + SEARCH_MARGIN_MI - 1e-9,
        `wireRadiusFor(${mi.toFixed(1)}) = ${wire} does not clear the ${SEARCH_MARGIN_MI}mi centre-offset margin`);
    }
    assertEqual(wireRadiusFor(null), null, 'no radius stays no radius');
    assertEqual(wireRadiusFor(3), 5, 'a lone 3mi village must be searched at 5mi, not 3mi (the zero-slack bug)');
  });

  test('fetch-radius: every emitted URL clears the margin, not just the ladder', () => {
    for (const mi of [3, 3.4, 4.3, 5, 6.9, 7]) {
      const emitted = radiusOf(buildSearchUrl('POSTCODE^1', null, { radiusMiles: mi }));
      assert(emitted >= mi + SEARCH_MARGIN_MI - 1e-9,
        `radius=${mi} emitted ${emitted} — ring edge is not strictly inside the searched disk`);
    }
  });

  test('fetch-radius: cluster cap is a ladder value, so full clusters snap exactly', () => {
    assert(RIGHTMOVE_RADII.includes(CLUSTER_CAP_MI),
      `CLUSTER_CAP_MI=${CLUSTER_CAP_MI} is off-ladder — a full cluster would widen to the next rung`);
    // A cluster built at the cap must emit the cap, not the rung above it.
    const at = [{ id: 'a', lat: 51.0, lng: -1.5, searchRadiusMi: 3 }, { id: 'b', lat: 51.02, lng: -1.5, searchRadiusMi: 3 }];
    for (const c of clusterVillages(at)) {
      assert(c.radiusMiles <= CLUSTER_CAP_MI, 'cluster radius never exceeds the cap');
      assertEqual(snapRadiusUp(c.radiusMiles), CLUSTER_CAP_MI, 'a real cluster snaps to the cap, not beyond');
    }
  });
}
