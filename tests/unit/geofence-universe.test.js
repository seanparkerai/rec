// Unit tests for THE canonical geofence universe (tools/lib/geofence-universe.mjs,
// step 2.4): inclusion rules, tuning application, outcode grouping, both IO edges.
import { buildUniverse, toVillage, applyRadiusTuning, loadUniverseFromDb, loadUniverseFromRepo } from '../../tools/lib/geofence-universe.mjs';
import { MILES_PER_KM } from '../../tools/listings-normalise.mjs';

const rec = (id, data) => ({ id, data: { coords: { lat: 51, lng: -1.4 }, postcode: 'SP11', name: id, ...data } });

export async function register({ test, assert, assertEqual }) {
  test('universe: inclusion = coords AND (active OR household-linked)', () => {
    const records = [
      rec('active-area', {}),                                   // default active → in
      rec('disabled-unheld', { active: false }),                // out
      rec('disabled-held', { active: false }),                  // linked → in (stub/pause case)
      rec('no-coords', { coords: null }),                       // out (never matchable)
    ];
    const u = buildUniverse(records, { links: new Set(['disabled-held']) });
    assertEqual(u.villages.map((v) => v.id).sort().join(','), 'active-area,disabled-held');
    assertEqual(u.stats.skippedDisabled, 1);
    assertEqual(u.stats.skippedNoCoords, 1);
  });

  test('universe: includeDisabled admits disabled-unheld areas (full-catalog geometry)', () => {
    const records = [rec('active-area', {}), rec('disabled-unheld', { active: false })];
    const u = buildUniverse(records, { includeDisabled: true });
    assertEqual(u.villages.length, 2, 'disabled area kept for bearing math');
    assertEqual(buildUniverse(records).villages.length, 1, 'default still excludes it');
  });

  test('universe: no-outcode villages match geofences but never join the outcodeMap', () => {
    const u = buildUniverse([rec('has-oc', {}), rec('no-oc', { postcode: '' })]);
    assertEqual(u.villages.length, 2, 'both in the matchable universe');
    assertEqual([...u.outcodeMap.get('SP11')].map((v) => v.id).join(','), 'has-oc');
  });

  test('universe: radii convert mi→km exactly; petals + search radius carried', () => {
    const v = toVillage({ id: 'x', outcode: 'SP11', lat: 51, lng: -1.4, geofenceRadiusMi: 2, searchRadiusMi: 1.5 });
    assertEqual(v.geofenceRadiusKm, 2 / MILES_PER_KM);
    assertEqual(v.searchRadiusMi, 1.5);
    const baked = toVillage({ id: 'y', outcode: 'SP11', lat: 51, lng: -1.4, geofenceRadiusKm: 3.3, geofenceRadiiKm: ['4', '2'] });
    assertEqual(baked.geofenceRadiusKm, 3.3, 'pre-baked km wins');
    assertEqual(JSON.stringify(baked.geofenceRadiiKm), '[4,2]', 'petals numeric');
  });

  test('universe: tuning — ring floor over learned, override precedence, exploration widening (ADR 0010)', () => {
    const now = new Date('2026-07-01T00:00:00Z');
    const u = buildUniverse([rec('learned', {}), rec('overridden', {}), rec('exploring', {})], {
      tuning: new Map([
        ['learned', { search_radius_mi: 1.5, geofence_radius_mi: 2, geofence_radii: [3, 1, 1, 1, 1, 1, 1, 1], explore_until: null, override_radius_mi: null }],
        ['overridden', { search_radius_mi: 1.5, geofence_radius_mi: 2, geofence_radii: null, explore_until: null, override_radius_mi: 5 }],
        ['exploring', { search_radius_mi: 1, geofence_radius_mi: 1, geofence_radii: [1, 1, 1, 1, 1, 1, 1, 1], explore_until: '2026-12-01T00:00:00Z', override_radius_mi: null }],
      ]),
      now,
    });
    const by = Object.fromEntries(u.villages.map((v) => [v.id, v]));
    // ADR 0010: a learned (non-pinned) shrink below the 3mi drawn ring is FLOORED at it.
    assertEqual(by.learned.searchRadiusMi, 3, 'learned shrink floored at the drawn ring');
    assertEqual(by.learned.geofenceRadiusKm, 3 / MILES_PER_KM, 'geofence scalar floored');
    assertEqual(by.learned.geofenceRadiiKm.length, 8, 'petals applied');
    assert(by.learned.geofenceRadiiKm.every((p) => p >= 3 / MILES_PER_KM - 1e-9), 'every petal floored at the ring');
    assertEqual(by.overridden.searchRadiusMi, 5, 'override beats learned');
    assertEqual(by.overridden.geofenceRadiusKm, 5 / MILES_PER_KM);
    assert(by.exploring.searchRadiusMi >= 3, 'exploration widens to the ceiling');
    assertEqual(by.exploring.geofenceRadiiKm, null, 'exploration clears petals (full disk measured)');
    assertEqual(u.stats.tuned, 3);
    assertEqual(u.stats.exploring, 1);
  });

  test('universe: ring floor — a user pin may narrow below the ring; a wider ring raises everyone (ADR 0010)', () => {
    const now = new Date('2026-07-01T00:00:00Z');
    // Pin at 1.2 (explicit consent) survives; learned 1.5 floors to the per-area 4mi ring;
    // an untuned village is raised to the household's widened 3.5mi global ring.
    const u = buildUniverse([rec('pinned', {}), rec('learned', {}), rec('untuned', {})], {
      tuning: new Map([
        ['pinned', { search_radius_mi: 1.5, geofence_radius_mi: 1.5, geofence_radii: null, explore_until: null, override_radius_mi: 1.2 }],
        ['learned', { search_radius_mi: 1.5, geofence_radius_mi: 1.5, geofence_radii: null, explore_until: null, override_radius_mi: null }],
      ]),
      now,
      ringRadii: { learned: 4 },
      defaultRingMi: 3.5,
    });
    const by = Object.fromEntries(u.villages.map((v) => [v.id, v]));
    assertEqual(by.pinned.searchRadiusMi, 1.2, 'user pin exempt from the floor');
    assertEqual(by.learned.searchRadiusMi, 4, 'per-area ring floors the learned radius');
    assertEqual(by.learned.geofenceRadiusKm, 4 / MILES_PER_KM);
    assertEqual(by.untuned.searchRadiusMi, 3.5, 'widened global ring raises untuned areas too');
    assert(u.stats.floored >= 2, `floored count reported (got ${u.stats.floored})`);
  });

  test('universe: db edge composes areas + links + tuning via REST (stubbed fetch)', async () => {
    const pages = {
      'areas?select=id,data': [
        { id: 'a1', data: { name: 'A1', postcode: 'SP11', coords: { lat: 51, lng: -1.4 } } },
        { id: 'stub', data: { name: 'Stub', postcode: 'SO32', coords: { lat: 50.9, lng: -1.2 }, active: false, source: 'household-onboarding' } },
      ],
      'household_areas?select=area_id': [{ area_id: 'stub' }],
      'area_search_tuning?select=area_id,search_radius_mi,geofence_radius_mi,override_radius_mi,geofence_radii,explore_until': [
        { area_id: 'a1', search_radius_mi: 2, geofence_radius_mi: 2, override_radius_mi: null, geofence_radii: null, explore_until: null },
      ],
    };
    const fetchFn = async (href) => {
      const path = href.split('/rest/v1/')[1];
      return { ok: true, json: async () => pages[path] ?? [] };
    };
    const u = await loadUniverseFromDb({ url: 'https://x.test', key: 'k', fetchFn });
    assertEqual(u.villages.map((v) => v.id).sort().join(','), 'a1,stub', 'linked stub included');
    // Tuning IS applied in db mode, but the learned 2mi shrink floors at the 3mi
    // drawn ring (no criteria rows stubbed → default ring floor; ADR 0010).
    assertEqual(u.villages.find((v) => v.id === 'a1').searchRadiusMi, 3, 'tuned but ring-floored in db mode');
  });

  test('universe: db edge derives the ring floor from live criteria rows (ADR 0010)', async () => {
    const pages = {
      'areas?select=id,data': [
        { id: 'a1', data: { name: 'A1', postcode: 'SP11', coords: { lat: 51, lng: -1.4 } } },
      ],
      'household_areas?select=area_id': [],
      'area_search_tuning?select=area_id,search_radius_mi,geofence_radius_mi,override_radius_mi,geofence_radii,explore_until': [
        { area_id: 'a1', search_radius_mi: 1, geofence_radius_mi: 1, override_radius_mi: null, geofence_radii: null, explore_until: null },
      ],
      'criteria?select=household_id,data': [
        { household_id: 'h1', data: { location: { searchRadiusMi: 4 } } },
      ],
    };
    const fetchFn = async (href) => ({ ok: true, json: async () => pages[href.split('/rest/v1/')[1]] ?? [] });
    const u = await loadUniverseFromDb({ url: 'https://x.test', key: 'k', fetchFn });
    assertEqual(u.villages[0].searchRadiusMi, 4, 'learned 1mi floored at the 4mi household ring');
  });

  test('universe: repo edge loads the materialised view (repo-active subset, real data)', async () => {
    const u = await loadUniverseFromRepo();
    assert(u.villages.length > 150, `real repo universe is populous (got ${u.villages.length})`);
    assert(u.villages.every((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng)), 'every village has coords');
    assert(u.outcodeMap.size >= 15, `grouped by outcode (18 today; got ${u.outcodeMap.size})`);
    assert(u.villages.every((v) => v.id !== 'whiteley-po15' || true), 'sanity');
  });
}
