// tests/unit/radius-hardening.test.js — mutation-hardening anchors for the radius
// learner + its persistence layer (step 4.10b). Kills the 2026-07-03 survivors: the
// weighted-quantile boundary, every like/reject/sector gate at exact equality, the
// distant-reject-waste edges, deterministic ordering, and — because the rendered SQL is
// EXECUTED against the live DB — byte-exact golden pins of renderPlanSql /
// renderProbationSql / renderRadiusSql. A golden diff here means the write path changed:
// regenerate DELIBERATELY in the same commit as the change, never to silence the test.
import { learnRadii, weightedQuantile } from '../../assets/js/refinement/radius.js';
import { planRadii, renderRadiusSql } from '../../assets/js/refinement/radius-persistence.js';
import { renderPlanSql, renderProbationSql } from '../../assets/js/refinement/persistence.js';
import { resolveConfig } from '../../assets/js/refinement/config.js';

export async function register({ test, assert, assertEqual }) {
  const cfg = resolveConfig();
  const NOW = '2026-07-03T00:00:00.000Z';
  let seq = 0;
  const like = (area, dist, { hh = 'hh-1', bearing, at = NOW } = {}) => ({
    household_id: hh, reaction: 'like', created_at: at,
    ...(bearing !== undefined ? { bearing } : {}),
    listing_snapshot: { area_id: area, ...(dist !== undefined ? { distance_mi: dist } : {}) },
    listing_id: `L${seq++}`,
  });
  const reject = (area, dist, { hh = 'hh-1', bearing, at = NOW } = {}) => ({
    ...like(area, dist, { hh, bearing, at }), reaction: 'reject',
  });
  const likes = (area, dist, n, o) => Array.from({ length: n }, () => like(area, dist, o));

  // ── weightedQuantile edges ───────────────────────────────────────────────────
  test('hardening: weightedQuantile boundary — cumulative weight EXACTLY at target picks that point', () => {
    assertEqual(weightedQuantile([{ value: 1, weight: 1 }, { value: 2, weight: 1 }], 0.5), 1,
      'cum == q·total is inclusive');
    assertEqual(weightedQuantile([{ value: 1, weight: 0 }, { value: 2, weight: 1 }], 0), 2,
      'zero-weight samples are filtered before the walk');
    assertEqual(weightedQuantile([{ value: NaN, weight: 1 }, { value: 5, weight: 1 }], 1), 5,
      'non-finite values are filtered');
    assertEqual(weightedQuantile([{ value: 1, weight: 1 }, { value: 2, weight: 1 }], 1), 2,
      'q=1 walks to the last point');
    assertEqual(weightedQuantile([], 0.9), null, 'empty → null');
    assertEqual(weightedQuantile([{ value: 3, weight: 0 }], 0.9), null, 'all zero-weight → null');
  });

  // ── learnRadii gates at exact equality ───────────────────────────────────────
  test('hardening: the like gate is inclusive — EXACTLY RADIUS_MIN_LIKES fresh likes emit a row', () => {
    const at = learnRadii(likes('a-1', 1.0, cfg.RADIUS_MIN_LIKES), { now: NOW });
    assertEqual(at.areas.length, 1, 'row at the gate');
    const under = learnRadii(likes('a-1', 1.0, cfg.RADIUS_MIN_LIKES - 1), { now: NOW });
    assertEqual(under.areas.length, 0, 'one under stays gated');
  });

  test('hardening: a like at distance 0 counts toward the gate (d >= 0, not d > 0)', () => {
    const out = learnRadii(likes('a-1', 0, cfg.RADIUS_MIN_LIKES), { now: NOW });
    assertEqual(out.areas.length, 1, 'zero-distance likes are real samples');
    assertEqual(out.areas[0].recommendedMi, cfg.RADIUS_FLOOR_MI, 'clamped up to the floor');
  });

  test('hardening: empty-string area_id is excluded; distance-less likes count sample but not gate', () => {
    const rows = [
      ...likes('', 1.0, cfg.RADIUS_MIN_LIKES),
      ...Array.from({ length: cfg.RADIUS_MIN_LIKES }, () => like('b-1', undefined)),
    ];
    assertEqual(learnRadii(rows, { now: NOW }).areas.length, 0,
      'no row for blank area, no row for distance-less likes');
  });

  test('hardening: decay is applied per reaction age — half-life-old likes weigh exactly 0.5', () => {
    const halfLifeAgo = new Date(Date.parse(NOW) - cfg.HALF_LIFE_DAYS * 86_400_000).toISOString();
    const out = learnRadii(likes('a-1', 1.0, 2 * cfg.RADIUS_MIN_LIKES, { at: halfLifeAgo }), { now: NOW });
    assertEqual(out.areas.length, 1, 'decayed weight still clears the gate');
    assertEqual(out.areas[0].likeCount, cfg.RADIUS_MIN_LIKES, '2·MIN at weight 0.5 = exactly MIN');
    assertEqual(out.areas[0].sampleSize, cfg.RADIUS_MIN_LIKES, 'sample weight decayed identically');
  });

  // ── distant-reject waste edges ───────────────────────────────────────────────
  test('hardening: a reject EXACTLY at the recommendation is not "beyond" (strict >)', () => {
    const base = likes('a-1', 1.0, cfg.RADIUS_MIN_LIKES);
    const rec = learnRadii(base, { now: NOW }).areas[0].recommendedMi;
    const atEdge = learnRadii([...base, reject('a-1', rec)], { now: NOW });
    assertEqual(atEdge.areas[0].distantRejectWaste, 0, 'edge reject is inside');
    const beyond = learnRadii([...base, reject('a-1', rec + 0.01)], { now: NOW });
    assertEqual(beyond.areas[0].distantRejectWaste, 1, 'sole reject beyond → waste 1');
  });

  test('hardening: no distance-bearing rejects → waste exactly 0, never NaN', () => {
    const out = learnRadii(likes('a-1', 1.0, cfg.RADIUS_MIN_LIKES), { now: NOW });
    assertEqual(out.areas[0].distantRejectWaste, 0, '0/0 guarded');
  });

  // ── direction + suggestion copy edges ────────────────────────────────────────
  test('hardening: current == recommended → direction hold and no suggestion', () => {
    const base = likes('a-1', 1.0, cfg.RADIUS_MIN_LIKES);
    const rec = learnRadii(base, { now: NOW }).areas[0].recommendedMi;
    const out = learnRadii(base, { now: NOW, currentRadii: { 'a-1': rec } });
    assertEqual(out.areas[0].direction, 'hold', 'exact match holds');
    assertEqual(out.suggestions.length, 0, 'hold never suggests');
  });

  test('hardening: suggestion copy — singular like, verb by direction, waste clause strictly > 5%', () => {
    // Override the gate to 1 so a single like is expressible.
    const config = resolveConfig({ overrides: { RADIUS_MIN_LIKES: 1 } });
    const one = learnRadii([like('a-1', 0.5)], { now: NOW, config, currentRadii: { 'a-1': 3 } });
    const s = one.suggestions[0];
    assert(s.reason.startsWith('Tighten the search from 3mi to 0.8mi'), `verb+values: ${s.reason}`);
    assert(s.reason.includes('your 1 liked home here'), 'singular "home" at likeCount 1');
    assert(!s.reason.includes('% of rejects'), 'no waste clause at waste 0');
    // Exactly 1 of 20 rejects beyond = 5% — the clause requires STRICTLY more.
    const rows = [like('a-1', 0.5), ...Array.from({ length: 19 }, () => reject('a-1', 0.1)), reject('a-1', 2)];
    const atFive = learnRadii(rows, { now: NOW, config, currentRadii: { 'a-1': 3 } });
    assert(!atFive.suggestions[0].reason.includes('% of rejects'), 'clause absent at exactly 5%');
    // Widen direction reads "Widen".
    const widen = learnRadii([like('a-1', 2.0)], { now: NOW, config, currentRadii: { 'a-1': 1 } });
    assertEqual(widen.suggestions[0].direction, 'widen');
    assert(widen.suggestions[0].reason.startsWith('Widen'), 'widen verb');
  });

  // ── sector ("petal") gates + bearing normalisation ───────────────────────────
  test('hardening: sector like gate is inclusive; negative bearings normalise onto the compass', () => {
    // Exactly RADIUS_SECTOR_MIN_LIKES fresh likes due North at 0.5mi, area radius from
    // farther unsectored likes → the N petal fits its own likes, others hold R.
    const base = likes('a-1', 2.0, cfg.RADIUS_MIN_LIKES); // no bearings → scalar R = 2.3
    const north = likes('a-1', 0.5, cfg.RADIUS_SECTOR_MIN_LIKES, { bearing: 0 });
    const out = learnRadii([...base, ...north], { now: NOW });
    const a = out.areas[0];
    assertEqual(a.geofenceRadiiMi[0], 0.8, 'N petal fit to its likes (q90 + margin) at the exact gate');
    assertEqual(a.directional, true, 'petal differs from scalar');
    // One under the gate: petal holds R.
    const under = learnRadii([...base, ...north.slice(1)], { now: NOW }).areas[0];
    assertEqual(under.geofenceRadiiMi[0], under.recommendedMi, 'below the gate the sector holds R');
    // Bearing -90 ≡ 270 (West = sector 6 of 8).
    const west = learnRadii([...base, ...likes('a-1', 0.5, cfg.RADIUS_SECTOR_MIN_LIKES, { bearing: -90 })], { now: NOW }).areas[0];
    assertEqual(west.geofenceRadiiMi[6], 0.8, 'negative bearing lands in the West sector');
  });

  test('hardening: a like-less sector cuts at EXACTLY RADIUS_SECTOR_MIN_REJECTS decayed rejects', () => {
    const base = likes('a-1', 2.0, cfg.RADIUS_MIN_LIKES);
    const rejects = Array.from({ length: cfg.RADIUS_SECTOR_MIN_REJECTS }, () => reject('a-1', 1.0, { bearing: 90 }));
    const cut = learnRadii([...base, ...rejects], { now: NOW }).areas[0];
    assertEqual(cut.geofenceRadiiMi[2], 1.0, 'E sector pulled in to the reject keep-quantile');
    const under = learnRadii([...base, ...rejects.slice(1)], { now: NOW }).areas[0];
    assertEqual(under.geofenceRadiiMi[2], under.recommendedMi, 'one under the gate holds R');
  });

  // ── deterministic ordering ───────────────────────────────────────────────────
  test('hardening: areas sort by areaId asc; suggestions by areaId then householdId asc', () => {
    const rows = [
      ...likes('zz-9', 0.5, cfg.RADIUS_MIN_LIKES, { hh: 'hh-9' }),
      ...likes('aa-1', 0.5, cfg.RADIUS_MIN_LIKES, { hh: 'hh-9' }),
      ...likes('aa-1', 0.5, cfg.RADIUS_MIN_LIKES, { hh: 'hh-1' }),
    ];
    const out = learnRadii(rows, { now: NOW, currentRadii: { 'zz-9': 3, 'aa-1': 3 } });
    assertEqual(out.areas.map((a) => a.areaId).join(','), 'aa-1,zz-9', 'areas asc');
    assertEqual(out.suggestions.map((s) => `${s.areaId}|${s.householdId}`).join(','),
      'aa-1|hh-1,aa-1|hh-9,zz-9|hh-9', 'suggestions area then household asc');
  });

  // ── SQL golden pins (the rendered batch is EXECUTED — byte drift is a write-path change) ──
  test('hardening: renderPlanSql golden — exact batch incl. quote escaping and jsonb literals', () => {
    const plan = {
      upserts: [{
        household_id: 'hh-1', dimension: 'area', value: "o'brien-town",
        metrics: { n_eff: 12.5, lift: 2, ok: true, missing: null },
        tier: 'strong', status: 'actionable',
        first_detected_at: '2026-07-01T00:00:00.000Z', last_evaluated_at: NOW,
        runs_qualified: 5, snoozed_until: null, updated_at: NOW,
      }],
      runRow: {
        household_id: 'hh-1', run_at: NOW,
        params: { preset: 'cautious' }, candidates_evaluated: 3, actionable_count: 1,
        weights_snapshot: { 'type:flat': -0.2 },
      },
    };
    const expected = `BEGIN;

INSERT INTO refinement_suggestions (household_id, dimension, value, metrics, tier, status, first_detected_at, last_evaluated_at, runs_qualified, snoozed_until, updated_at)
VALUES
  ('hh-1', 'area', 'o''brien-town', '{"n_eff":12.5,"lift":2,"ok":true,"missing":null}'::jsonb, 'strong', 'actionable', '2026-07-01T00:00:00.000Z', '2026-07-03T00:00:00.000Z', 5, NULL, '2026-07-03T00:00:00.000Z')
ON CONFLICT (household_id, dimension, value) DO UPDATE SET
  metrics = EXCLUDED.metrics,
  tier = EXCLUDED.tier,
  status = CASE WHEN refinement_suggestions.status IN ('forming','actionable')
             THEN EXCLUDED.status ELSE refinement_suggestions.status END,
  runs_qualified = EXCLUDED.runs_qualified,
  last_evaluated_at = EXCLUDED.last_evaluated_at,
  updated_at = EXCLUDED.updated_at;

WITH new_run AS (
  INSERT INTO refinement_runs (household_id, run_at, params, candidates_evaluated, actionable_count, weights_snapshot)
  VALUES ('hh-1', '2026-07-03T00:00:00.000Z', '{"preset":"cautious"}'::jsonb, 3, 1, '{"type:flat":-0.2}'::jsonb)
  RETURNING id
)
INSERT INTO sync_log (actor, action, table_name, row_id, at)
SELECT 'system', 'update', 'refinement_suggestions', id, '2026-07-03T00:00:00.000Z' FROM new_run;

COMMIT;`;
    assertEqual(renderPlanSql(plan), expected, 'renderPlanSql byte-exact');
  });

  test('hardening: renderProbationSql golden — guarded, scoped, escaped', () => {
    const sql = renderProbationSql(
      [{ value: "x'ford", from: 'active', to: 'reconsider' }],
      { householdId: 'hh-1', now: NOW },
    );
    const expected = `BEGIN;

UPDATE scrape_probation SET status = 'reconsider', updated_at = '2026-07-03T00:00:00.000Z'
WHERE household_id = 'hh-1' AND dimension = 'area' AND value = 'x''ford'
  AND status = 'active';

COMMIT;`;
    assertEqual(sql, expected, 'renderProbationSql byte-exact');
  });

  test('hardening: planRadii + renderRadiusSql golden — tuning + suggestion + sync_log batch', () => {
    const learned = {
      config: { RADIUS_EXPLORE_EVERY_DAYS: 7, RADIUS_EXPLORE_WINDOW_H: 12, RADIUS_SECTORS: 4, RADIUS_MIN_LIKES: 5 },
      areas: [{
        areaId: 'alpha-ab1', recommendedMi: 1.2, searchMi: 1.5, geofenceRadiiMi: [1.2, 1.5, 1.2, 1.2],
        sampleSize: 9.4, likeCount: 6.1, method: 'like-quantile-0.9+0.3mi', confidence: 'high',
      }],
      suggestions: [{
        householdId: 'hh-1', areaId: 'alpha-ab1', recommendedMi: 1.2, currentMi: 3, direction: 'tighten',
        likeCount: 6.1, sampleSize: 9.4, distantRejectWaste: 0.4, method: 'like-quantile-0.9+0.3mi',
        reason: 'Tighten the search from 3mi to 1.2mi — your 6 liked homes here cluster within 1.2mi.',
      }],
    };
    const plan = planRadii(learned, {
      now: NOW,
      // 2 days since last exploration (< 7-day cadence) → schedule carried, no new window.
      tuningRows: [{ area_id: 'alpha-ab1', last_explored_at: '2026-07-01T00:00:00.000Z', explore_until: null }],
    });
    assertEqual(plan.exploringCount, 0, 'inside the cadence → no window opened');
    assertEqual(plan.tuningUpserts[0].sample_size, 9, 'sample_size rounds to an integer');
    assertEqual(plan.suggestionUpserts[0].tier, 'confident', '6.1 likes < 2·MIN_LIKES → confident');
    const expected = `BEGIN;

INSERT INTO area_search_tuning (area_id, geofence_radius_mi, search_radius_mi, recommended_radius_mi, override_radius_mi, geofence_radii, sample_size, like_count, method, confidence, explore_until, last_explored_at, computed_at, updated_at)
VALUES
  ('alpha-ab1', 3, 3, 1.2, NULL, '[3,3,3,3]'::jsonb, 9, 6.1, 'like-quantile-0.9+0.3mi', 'high', NULL, '2026-07-01T00:00:00.000Z', '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z')
ON CONFLICT (area_id) DO UPDATE SET
  recommended_radius_mi = EXCLUDED.recommended_radius_mi,
  override_radius_mi = EXCLUDED.override_radius_mi,
  search_radius_mi   = EXCLUDED.search_radius_mi,
  geofence_radius_mi = EXCLUDED.geofence_radius_mi,
  geofence_radii     = EXCLUDED.geofence_radii,
  sample_size = EXCLUDED.sample_size,
  like_count = EXCLUDED.like_count,
  method = EXCLUDED.method,
  confidence = EXCLUDED.confidence,
  explore_until = EXCLUDED.explore_until,
  last_explored_at = EXCLUDED.last_explored_at,
  computed_at = EXCLUDED.computed_at,
  updated_at = EXCLUDED.updated_at;

INSERT INTO refinement_suggestions (household_id, dimension, value, metrics, tier, status, first_detected_at, last_evaluated_at, runs_qualified, snoozed_until, updated_at)
VALUES
  ('hh-1', 'area_radius', 'alpha-ab1', '{"recommended_mi":1.2,"current_mi":3,"direction":"tighten","like_count":6.1,"sample_size":9.4,"distant_reject_waste":0.4,"method":"like-quantile-0.9+0.3mi","reason":"Tighten the search from 3mi to 1.2mi — your 6 liked homes here cluster within 1.2mi."}'::jsonb, 'confident', 'actionable', '2026-07-03T00:00:00.000Z', '2026-07-03T00:00:00.000Z', 1, NULL, '2026-07-03T00:00:00.000Z')
ON CONFLICT (household_id, dimension, value) DO UPDATE SET
  metrics = EXCLUDED.metrics,
  tier = EXCLUDED.tier,
  status = CASE WHEN refinement_suggestions.status IN ('forming','actionable')
             THEN EXCLUDED.status ELSE refinement_suggestions.status END,
  runs_qualified = EXCLUDED.runs_qualified,
  last_evaluated_at = EXCLUDED.last_evaluated_at,
  updated_at = EXCLUDED.updated_at;

INSERT INTO sync_log (actor, action, table_name, at)
VALUES ('system', 'update', 'area_search_tuning', '2026-07-03T00:00:00.000Z');

COMMIT;`;
    assertEqual(renderRadiusSql(plan), expected, 'renderRadiusSql byte-exact');
  });
}
