// tests/refinement-radius.test.js — per-area learned search radius (radius.js +
// radius-persistence.js + the fetch-listings overlay). Pure fixtures, no Supabase.
// Proves: distance distribution → radius, the like-count confidence gate, floor/ceil
// clamp, union-by-max across households, the suggestion threshold + direction, override
// precedence, exploration-window scheduling, and the fetcher overlay.

import { learnRadii, weightedQuantile } from '../../assets/js/refinement/radius.js';
import { planRadii, renderRadiusSql } from '../../assets/js/refinement/radius-persistence.js';
import { applyRadiusTuning } from '../../tools/fetch-listings.mjs';
import { resolveConfig } from '../../assets/js/refinement/config.js';
import { toRadiusCard, classifySuggestions, radiusOverridesFromOverrides, REFINEMENT_RADIUS_OVERRIDE_KEY } from '../../assets/js/refinement/view.js';
import { MILES_PER_KM } from '../../tools/listings-normalise.mjs';

export async function register({ test, assert, assertEqual }) {
  const cfg = resolveConfig();
  const NOW = '2026-06-21T00:00:00.000Z'; // canonical ISO so it round-trips through toISOString()
  const DAY = 86_400_000;
  const HH_A = 'aaaaaaaa-0000-0000-0000-000000000001';
  const HH_B = 'bbbbbbbb-0000-0000-0000-000000000002';

  // Build like/reject reactions at `now` (age 0 → decay weight 1) so counts are exact.
  const like = (areaId, dist, hh = HH_A, createdMs = Date.parse(NOW)) => ({
    household_id: hh, reaction: 'like', created_at: new Date(createdMs).toISOString(),
    listing_snapshot: { area_id: areaId, distance_mi: dist },
  });
  const reject = (areaId, dist, hh = HH_A) => ({
    household_id: hh, reaction: 'reject', created_at: NOW,
    listing_snapshot: { area_id: areaId, distance_mi: dist },
  });
  const likes = (areaId, dists, hh = HH_A) => dists.map((d) => like(areaId, d, hh));

  // ── weightedQuantile ───────────────────────────────────────────────────────────
  test('radius: weightedQuantile picks the value at the cumulative-weight fraction', () => {
    const s = [0.1, 0.2, 0.3, 0.4, 0.5].map((value) => ({ value, weight: 1 }));
    assertEqual(weightedQuantile(s, 0.9), 0.5);
    assertEqual(weightedQuantile(s, 0.5), 0.3);
    assertEqual(weightedQuantile([], 0.9), null);
    assertEqual(weightedQuantile([{ value: NaN, weight: 1 }], 0.9), null);
  });

  // ── distribution → radius + p90 + margin + clamp ────────────────────────────────
  test('radius: tight suburban likes → tightened radius (p90 + margin, clamped)', () => {
    const r = learnRadii(likes('suburb', [0.2, 0.25, 0.3, 0.35, 0.4, 0.42]), { config: cfg, now: NOW });
    assertEqual(r.areas.length, 1);
    const a = r.areas[0];
    // p90 of the 6 distances = 0.42; + 0.3 margin = 0.72.
    assertEqual(a.recommendedMi, 0.72);
    assertEqual(a.direction, 'tighten');
    assertEqual(a.confidence, 'high');
  });

  test('radius: floor clamp — extremely tight likes never go below RADIUS_FLOOR_MI', () => {
    const r = learnRadii(likes('core', [0.02, 0.03, 0.05, 0.04, 0.06, 0.05]), { config: cfg, now: NOW });
    assertEqual(r.areas[0].recommendedMi, cfg.RADIUS_FLOOR_MI); // 0.05 + 0.3 = 0.35 → clamped to 0.5
  });

  test('radius: ceil clamp — far-flung rural likes never exceed RADIUS_CEIL_MI', () => {
    const r = learnRadii(likes('rural', [2.6, 2.7, 2.8, 2.85, 2.9, 2.95]), { config: cfg, now: NOW });
    assertEqual(r.areas[0].recommendedMi, cfg.RADIUS_CEIL_MI); // 2.95 + 0.3 → clamped to 3.0
  });

  // ── confidence gate ──────────────────────────────────────────────────────────────
  test('radius: below RADIUS_MIN_LIKES decayed likes → no row (keep the default)', () => {
    const r = learnRadii(likes('thin', [0.3, 0.4, 0.5, 0.45]), { config: cfg, now: NOW }); // 4 < 5
    assertEqual(r.areas.length, 0);
    assertEqual(r.suggestions.length, 0);
  });

  test('radius: likes without a stored distance_mi do not count toward the gate', () => {
    const withNull = likes('mix', [0.3, 0.4, 0.5, 0.45]).concat([
      like('mix', null), like('mix', undefined),
    ]);
    const r = learnRadii(withNull, { config: cfg, now: NOW });
    assertEqual(r.areas.length, 0); // still only 4 distance-bearing likes
  });

  // ── union across households (max) ─────────────────────────────────────────────────
  test('radius: applied radius is the MAX across households (union, never starves the wider)', () => {
    const reactions = [
      ...likes('shared', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42], HH_A), // tight → ~0.8
      ...likes('shared', [2.3, 2.4, 2.5, 2.45, 2.5, 2.4], HH_B),   // wide → ~2.8
    ];
    const r = learnRadii(reactions, { config: cfg, now: NOW });
    assertEqual(r.areas.length, 1);
    assertEqual(r.areas[0].recommendedMi, 2.8); // max(0.8, 2.8)
    assertEqual(r.areas[0].contributingHouseholds, 2);
  });

  // ── suggestion threshold + direction ───────────────────────────────────────────────
  test('radius: a suggestion is raised per household only past RADIUS_MIN_CHANGE_MI', () => {
    const reactions = [
      ...likes('shared', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42], HH_A), // 0.8 vs 3 → tighten (Δ2.2)
      ...likes('shared', [2.6, 2.7, 2.8, 2.75, 2.9, 2.8], HH_B),   // 3.0 vs 3 → Δ0 → no suggestion
    ];
    const r = learnRadii(reactions, { config: cfg, now: NOW });
    assertEqual(r.suggestions.length, 1);
    assertEqual(r.suggestions[0].householdId, HH_A);
    assertEqual(r.suggestions[0].direction, 'tighten');
    assert(/Tighten the search from 3mi to 0.8mi/.test(r.suggestions[0].reason), 'reason text reads naturally');
  });

  test('radius: widen direction when current is below the learned radius', () => {
    const r = learnRadii(likes('rural', [2.0, 2.1, 2.2, 2.15, 2.3, 2.25]), {
      config: cfg, now: NOW, currentRadii: { rural: 1.0 },
    });
    assertEqual(r.areas[0].direction, 'widen');
    assertEqual(r.suggestions[0].direction, 'widen'); // 2.6 vs 1.0
  });

  // ── distant-reject waste ───────────────────────────────────────────────────────────
  test('radius: distant-reject waste = decayed share of rejects beyond the recommendation', () => {
    const reactions = [
      ...likes('w', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42]), // rec ~0.8
      reject('w', 0.4), reject('w', 0.5), reject('w', 2.5), reject('w', 2.8), // 2 of 4 beyond 0.8
    ];
    const r = learnRadii(reactions, { config: cfg, now: NOW });
    assertEqual(r.areas[0].distantRejectWaste, 0.5);
  });

  // ── persistence: override precedence ───────────────────────────────────────────────
  test('radius-persistence: a user override wins and is preserved on the row', () => {
    const learned = learnRadii(likes('suburb', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42]), { config: cfg, now: NOW });
    const plan = planRadii(learned, {
      now: NOW,
      tuningRows: [{ area_id: 'suburb', search_radius_mi: 0.8, override_radius_mi: 1.5, last_explored_at: NOW }],
    });
    const row = plan.tuningUpserts[0];
    assertEqual(row.override_radius_mi, 1.5);
    assertEqual(row.search_radius_mi, 1.5);   // applied = override
    assertEqual(row.geofence_radius_mi, 1.5);
    assertEqual(row.recommended_radius_mi, 0.8); // learner still records its recommendation (p90 0.5 + 0.3)
  });

  // ── persistence: ring floor (ADR 0010) ─────────────────────────────────────────────
  test('radius-persistence: a non-pinned learned shrink is floored at the drawn ring', () => {
    // likes cluster ~0.5mi → recommendation ~0.8mi, but the auto-APPLIED radius may
    // never fall under the ring (default 3mi). The recommendation + suggestion stay
    // honest — Apply is the consent path that moves ring + pin together.
    const learned = learnRadii(likes('suburb', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42]), { config: cfg, now: NOW });
    const plan = planRadii(learned, { now: NOW, tuningRows: [] });
    const row = plan.tuningUpserts[0];
    assertEqual(row.recommended_radius_mi, 0.8, 'the honest recommendation survives');
    assertEqual(row.search_radius_mi, 3, 'applied search disk floored at the default ring');
    assertEqual(row.geofence_radius_mi, 3, 'applied geofence floored at the default ring');
    assertEqual(plan.suggestionUpserts.length, 1, 'the tighten suggestion still surfaces');
    // A per-area ring (e.g. a household widened this area to 4mi) raises the floor.
    const wide = planRadii(learned, { now: NOW, tuningRows: [], ringRadii: { suburb: 4 } }).tuningUpserts[0];
    assertEqual(wide.search_radius_mi, 4, 'per-area ring raises the floor');
    // A user pin (override) is exempt — explicit consent moved the ring with it.
    const pinned = planRadii(learned, { now: NOW, tuningRows: [], overrides: { suburb: 1.0 } }).tuningUpserts[0];
    assertEqual(pinned.search_radius_mi, 1, 'pin narrows below the ring');
  });

  // ── persistence: exploration scheduling ────────────────────────────────────────────
  test('radius-persistence: first-time area gets a staggered last_explored_at, no window yet', () => {
    const learned = learnRadii(likes('fresh', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42]), { config: cfg, now: NOW });
    const plan = planRadii(learned, { now: NOW, tuningRows: [] });
    const row = plan.tuningUpserts[0];
    assertEqual(row.explore_until, null);
    const ageDays = (Date.parse(NOW) - Date.parse(row.last_explored_at)) / DAY;
    assert(ageDays >= 0 && ageDays < cfg.RADIUS_EXPLORE_EVERY_DAYS, 'stagger lands inside the cadence window');
    assertEqual(plan.exploringCount, 0);
  });

  test('radius-persistence: an area due for re-exploration opens a window to now + WINDOW_H', () => {
    const learned = learnRadii(likes('due', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42]), { config: cfg, now: NOW });
    const stale = new Date(Date.parse(NOW) - (cfg.RADIUS_EXPLORE_EVERY_DAYS + 1) * DAY).toISOString();
    const plan = planRadii(learned, { now: NOW, tuningRows: [{ area_id: 'due', search_radius_mi: 0.8, last_explored_at: stale }] });
    const row = plan.tuningUpserts[0];
    assertEqual(row.last_explored_at, NOW);
    assertEqual(plan.exploringCount, 1);
    const winH = (Date.parse(row.explore_until) - Date.parse(NOW)) / 3_600_000;
    assertEqual(winH, cfg.RADIUS_EXPLORE_WINDOW_H);
  });

  test('radius-persistence: an area not yet due keeps its prior schedule', () => {
    const learned = learnRadii(likes('recent', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42]), { config: cfg, now: NOW });
    const fresh = new Date(Date.parse(NOW) - 2 * DAY).toISOString();
    const plan = planRadii(learned, { now: NOW, tuningRows: [{ area_id: 'recent', search_radius_mi: 0.8, last_explored_at: fresh, explore_until: null }] });
    assertEqual(plan.tuningUpserts[0].last_explored_at, fresh);
    assertEqual(plan.exploringCount, 0);
  });

  // ── persistence: sticky suggestion status (no re-nag) ───────────────────────────────
  test('radius-persistence: a confirmed/dismissed radius suggestion is never re-raised', () => {
    const learned = learnRadii(likes('s', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42]), { config: cfg, now: NOW });
    const plan = planRadii(learned, {
      now: NOW, tuningRows: [],
      suggestionRows: [{ household_id: HH_A, dimension: 'area_radius', value: 's', status: 'confirmed_scrape', runs_qualified: 2 }],
    });
    assertEqual(plan.suggestionUpserts[0].status, 'confirmed_scrape'); // sticky
    assertEqual(plan.suggestionUpserts[0].runs_qualified, 3);
  });

  // ── SQL render ──────────────────────────────────────────────────────────────────────
  test('radius-persistence: renderRadiusSql is an idempotent batch with the override guard', () => {
    const learned = learnRadii(likes('s', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42]), { config: cfg, now: NOW });
    const sql = renderRadiusSql(planRadii(learned, { now: NOW, tuningRows: [] }));
    assert(sql.startsWith('BEGIN;') && sql.trim().endsWith('COMMIT;'), 'wrapped in a transaction');
    assert(/INSERT INTO area_search_tuning/.test(sql), 'writes area_search_tuning');
    assert(/ON CONFLICT \(area_id\) DO UPDATE/.test(sql), 'upsert on area_id');
    assert(/override_radius_mi = EXCLUDED\.override_radius_mi/.test(sql),
      'override mirrors the learned_preferences intent the driver resolved');
    assert(/search_radius_mi\s+= EXCLUDED\.search_radius_mi/.test(sql) && /geofence_radii\s+= EXCLUDED\.geofence_radii/.test(sql),
      'search disk + directional petals written from the authoritative plan');
    assert(/INSERT INTO refinement_suggestions/.test(sql) && /area_radius/.test(sql), 'writes the area_radius suggestion');
    assert(/INSERT INTO sync_log/.test(sql), 'logs to sync_log');
  });

  // ── fetcher overlay (applyRadiusTuning) ────────────────────────────────────────────
  test('fetch overlay: ring floor over learned / pin exempt / exploration ceil / no-row passthrough (ADR 0010)', () => {
    const villages = [
      { id: 'learned', searchRadiusMi: 3, geofenceRadiusKm: 3 / MILES_PER_KM },
      { id: 'override', searchRadiusMi: 3, geofenceRadiusKm: 3 / MILES_PER_KM },
      { id: 'exploring', searchRadiusMi: 3, geofenceRadiusKm: 3 / MILES_PER_KM },
      { id: 'untuned', searchRadiusMi: 3, geofenceRadiusKm: 3 / MILES_PER_KM },
    ];
    const future = new Date(Date.parse(NOW) + 3_600_000).toISOString();
    const tuning = new Map([
      ['learned', { search_radius_mi: 0.7, override_radius_mi: null, explore_until: null }],
      ['override', { search_radius_mi: 0.7, override_radius_mi: 1.2, explore_until: null }],
      ['exploring', { search_radius_mi: 0.7, override_radius_mi: null, explore_until: future }],
    ]);
    const { tuned, exploring } = applyRadiusTuning(villages, tuning, new Date(NOW));
    assertEqual(tuned, 3);
    assertEqual(exploring, 1);
    // ADR 0010: the learned 0.7mi shrink is FLOORED at the 3mi drawn ring; only the
    // explicit user pin (override_radius_mi) may narrow below it.
    assertEqual(villages[0].searchRadiusMi, 3);
    assertEqual(villages[1].searchRadiusMi, 1.2);            // user pin exempt from the floor
    assertEqual(villages[2].searchRadiusMi, cfg.RADIUS_CEIL_MI); // exploration ceil
    assertEqual(villages[3].searchRadiusMi, 3);              // untuned unchanged
    assert(Math.abs(villages[0].geofenceRadiusKm - 3 / MILES_PER_KM) < 1e-9, 'geofence km floored at the ring too');
  });

  // ── Directional ("petal") learning ──────────────────────────────────────────────────
  const likeBearing = (areaId, dist, bearing, hh = HH_A) => ({
    household_id: hh, reaction: 'like', created_at: NOW,
    listing_snapshot: { area_id: areaId, distance_mi: dist }, bearing,
  });
  const rejectBearing = (areaId, dist, bearing, hh = HH_A) => ({
    household_id: hh, reaction: 'reject', created_at: NOW,
    listing_snapshot: { area_id: areaId, distance_mi: dist }, bearing,
  });

  test('radius: no bearing data → uniform petals = the scalar radius (back-compat)', () => {
    const r = learnRadii(likes('flat', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42]), { config: cfg, now: NOW });
    const a = r.areas[0];
    assertEqual(a.geofenceRadiiMi.length, cfg.RADIUS_SECTORS);
    assert(a.geofenceRadiiMi.every((p) => p === a.recommendedMi), 'every petal equals the scalar radius');
    assertEqual(a.searchMi, a.recommendedMi);
    assert(!a.directional, 'not directional without sector evidence');
  });

  test('radius: petals reach toward rural likes (N) and pull in toward urban likes (E)', () => {
    const north = [2.0, 2.1, 2.2, 2.15, 2.3, 2.25].map((d) => likeBearing('town', d, 0));   // sector 0
    const east = [0.3, 0.35, 0.4, 0.45, 0.5, 0.42].map((d) => likeBearing('town', d, 90));  // sector 2
    const a = learnRadii([...north, ...east], { config: cfg, now: NOW }).areas[0];
    assert(a.directional, 'directional flag set');
    assert(a.geofenceRadiiMi[0] >= 2.0, `north (rural) petal stays wide, got ${a.geofenceRadiiMi[0]}`);
    assertEqual(a.geofenceRadiiMi[2], 0.8); // q90 0.5 + 0.3 margin
    assertEqual(a.searchMi, Math.max(...a.geofenceRadiiMi)); // disk = widest petal
  });

  test('radius: a like-less, reject-dominated sector inside R is pulled in (urban cut)', () => {
    const likesSouth = [2.0, 2.1, 2.2, 2.15, 2.25].map((d) => likeBearing('town', d, 180)); // sector 4 → R≈2.55
    const rejWest = [0.5, 0.6, 0.7, 0.55, 0.65, 0.8, 0.75, 0.9, 0.85, 0.95]
      .map((d) => rejectBearing('town', d, 270)); // sector 6, no likes, ≥8 rejects, all inside R
    const a = learnRadii([...likesSouth, ...rejWest], { config: cfg, now: NOW }).areas[0];
    assert(a.geofenceRadiiMi[6] < a.recommendedMi, `west urban sector cut below the scalar radius, got ${a.geofenceRadiiMi[6]} vs ${a.recommendedMi}`);
    assert(a.geofenceRadiiMi[6] >= cfg.RADIUS_FLOOR_MI, 'never below the floor');
  });

  test('radius-persistence: directional petals are written to geofence_radii', () => {
    const north = [2.0, 2.1, 2.2, 2.15, 2.3, 2.25].map((d) => likeBearing('town', d, 0));
    const east = [0.3, 0.35, 0.4, 0.45, 0.5, 0.42].map((d) => likeBearing('town', d, 90));
    const plan = planRadii(learnRadii([...north, ...east], { config: cfg, now: NOW }), { now: NOW, tuningRows: [] });
    const row = plan.tuningUpserts[0];
    assertEqual(row.geofence_radii.length, cfg.RADIUS_SECTORS);
    assertEqual(row.search_radius_mi, Math.max(...row.geofence_radii));
    // an override pins uniform petals
    const pinned = planRadii(learnRadii([...north, ...east], { config: cfg, now: NOW }), { now: NOW, tuningRows: [], overrides: { town: 1.0 } }).tuningUpserts[0];
    assert(pinned.geofence_radii.every((p) => p === 1.0), 'override → uniform petals');
    assertEqual(pinned.search_radius_mi, 1.0);
  });

  // ── Phase 5: portal surfacing (view-model + override routing) ───────────────────────
  test('view: toRadiusCard maps a row to a radius card', () => {
    const c = toRadiusCard({
      dimension: 'area_radius', value: 'titchfield-hampshire', tier: 'confident', status: 'actionable',
      metrics: { recommended_mi: 1.62, current_mi: 3, direction: 'tighten', like_count: 7.8, distant_reject_waste: 0.35, reason: 'Tighten…' },
    });
    assertEqual(c.dimension, 'area_radius');
    assertEqual(c.areaId, 'titchfield-hampshire');
    assertEqual(c.direction, 'tighten');
    assertEqual(c.directionLabel, 'Tighten');
    assertEqual(c.recommendedLabel, '1.6 mi');
    assertEqual(c.currentLabel, '3.0 mi');
    assertEqual(c.likeCount, 8);
    assertEqual(c.distantRejectPct, 35);
  });

  test('view: classifySuggestions splits area_radius into its own lane, never the inbox', () => {
    const rows = [
      { dimension: 'area_radius', value: 'titchfield-hampshire', status: 'actionable', tier: 'confident', metrics: { recommended_mi: 1.6, current_mi: 3, direction: 'tighten' } },
      { dimension: 'area_radius', value: 'stubbington-hampshire', status: 'confirmed_scrape', tier: 'confident', metrics: { recommended_mi: 0.7, current_mi: 3, direction: 'tighten' } },
      { dimension: 'property_type', value: 'flat', status: 'actionable', tier: 'confident', metrics: { wilson_lower: 0.9, lift: 1.2 } },
    ];
    const g = classifySuggestions(rows);
    assertEqual(g.radius.inbox.length, 1);
    assertEqual(g.radius.applied.length, 1);
    assertEqual(g.counts.radius, 1);
    // the statistical inbox must NOT contain the area_radius rows
    assert(g.inbox.every((c) => c.dimension !== 'area_radius'), 'no radius rows leak into the statistical inbox');
    assertEqual(g.inbox.length, 1); // only the flat suggestion
  });

  test('view: radiusOverridesFromOverrides reads the reserved overrides key', () => {
    const overrides = { [REFINEMENT_RADIUS_OVERRIDE_KEY]: { 'whiteley-po15': { mi: 2.5, at: NOW }, 'bad-area': { mi: 0 } } };
    const ov = radiusOverridesFromOverrides(overrides);
    assertEqual(ov['whiteley-po15'], 2.5);
    assert(!('bad-area' in ov), 'non-positive radius is ignored');
    assertEqual(Object.keys(radiusOverridesFromOverrides({})).length, 0);
  });

  test('radius-persistence: a portal override (map) wins and pins the applied radius', () => {
    const learned = learnRadii(likes('suburb', [0.3, 0.35, 0.4, 0.45, 0.5, 0.42]), { config: cfg, now: NOW });
    const plan = planRadii(learned, { now: NOW, tuningRows: [], overrides: { suburb: 1.5 } });
    const row = plan.tuningUpserts[0];
    assertEqual(row.override_radius_mi, 1.5);
    assertEqual(row.search_radius_mi, 1.5);
    assertEqual(row.recommended_radius_mi, 0.8);
    assertEqual(row.explore_until, null); // a pinned area is never widened for exploration
  });

  test('radius-persistence: an override-only area (no current recommendation) still gets a row', () => {
    const learned = learnRadii([], { config: cfg, now: NOW }); // no likes → no recommendation
    const plan = planRadii(learned, { now: NOW, tuningRows: [], overrides: { 'pinned-area': 2.0 } });
    assertEqual(plan.tuningUpserts.length, 1);
    const row = plan.tuningUpserts[0];
    assertEqual(row.area_id, 'pinned-area');
    assertEqual(row.search_radius_mi, 2.0);
    assertEqual(row.recommended_radius_mi, null);
    assertEqual(row.method, 'override-only');
  });
}
