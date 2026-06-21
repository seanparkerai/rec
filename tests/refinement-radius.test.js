// tests/refinement-radius.test.js — per-area learned search radius (radius.js +
// radius-persistence.js + the fetch-listings overlay). Pure fixtures, no Supabase.
// Proves: distance distribution → radius, the like-count confidence gate, floor/ceil
// clamp, union-by-max across households, the suggestion threshold + direction, override
// precedence, exploration-window scheduling, and the fetcher overlay.

import { learnRadii, weightedQuantile } from '../assets/js/refinement/radius.js';
import { planRadii, renderRadiusSql } from '../assets/js/refinement/radius-persistence.js';
import { applyRadiusTuning } from '../tools/fetch-listings.mjs';
import { resolveConfig } from '../assets/js/refinement/config.js';
import { MILES_PER_KM } from '../tools/listings-normalise.mjs';

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
    assert(/COALESCE\(area_search_tuning\.override_radius_mi, EXCLUDED\.recommended_radius_mi\)/.test(sql),
      'applied radius re-derived with the override-wins guard');
    assert(/INSERT INTO refinement_suggestions/.test(sql) && /area_radius/.test(sql), 'writes the area_radius suggestion');
    assert(/INSERT INTO sync_log/.test(sql), 'logs to sync_log');
  });

  // ── fetcher overlay (applyRadiusTuning) ────────────────────────────────────────────
  test('fetch overlay: learned radius / override / exploration ceil / no-row passthrough', () => {
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
    assertEqual(villages[0].searchRadiusMi, 0.7);
    assertEqual(villages[1].searchRadiusMi, 1.2);            // override wins
    assertEqual(villages[2].searchRadiusMi, cfg.RADIUS_CEIL_MI); // exploration ceil
    assertEqual(villages[3].searchRadiusMi, 3);              // untuned unchanged
    assert(Math.abs(villages[0].geofenceRadiusKm - 0.7 / MILES_PER_KM) < 1e-9, 'geofence km tracks the applied radius');
  });
}
