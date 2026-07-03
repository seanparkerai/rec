// tests/unit/persistence-hardening.test.js — mutation-hardening anchors for the Stage-3
// planning layer (step 4.10b). Kills the 2026-07-03 survivors: the FULL resolveStatus
// matrix (incl. the snooze-expiry boundary), metricsOf/paramsOf exact shapes (the jsonb
// audit trail that later calibration reads), planRun's feedback block at the gate
// boundary, and isTracked's lift edge. The rendered-SQL goldens live in
// radius-hardening.test.js alongside the radius ones.
import {
  priorRunsFromRows, isTracked, resolveStatus, metricsOf, paramsOf, planRun,
} from '../../assets/js/refinement/persistence.js';
import { resolveConfig } from '../../assets/js/refinement/config.js';

export async function register({ test, assert, assertEqual }) {
  const NOW = new Date('2026-07-03T00:00:00.000Z');
  const deepEq = (a, b, msg) => assertEqual(JSON.stringify(a), JSON.stringify(b), msg);

  const cand = (over = {}) => ({
    dimension: 'area', value: 'x', n_eff: 14.25, k_eff: 13.5, n_raw: 15, k_raw: 14,
    p_hat: 0.947368421, wilson_lower: 0.891234567891, lift: 1.23456789, p_value: 0.0123456789,
    fdr_significant: true, distinct_rejected_listings: 9, volume_artefact: false,
    qualifies_this_run: true, runs_qualified: 5, actionable: true, tier: 'probable',
    gates: { global: true, sample: true, confidence: true, disproportionality: true, persistence: true },
    reason: 'Rejected 93% of 15 (14 of 15) — 1.23× your 76% baseline reject rate.',
    ...over,
  });

  // ── resolveStatus: the full status matrix ────────────────────────────────────
  test('hardening: resolveStatus matrix — sticky user statuses, snooze expiry boundary, engine fallthrough', () => {
    const c = cand();
    const ctx = { now: NOW, dismissedKeys: new Set() };
    assertEqual(resolveStatus(c, null, ctx), 'actionable', 'no prior + actionable');
    assertEqual(resolveStatus(cand({ actionable: false }), null, ctx), 'forming', 'no prior + tracked');
    assertEqual(resolveStatus(c, { status: 'dismissed' }, ctx), 'dismissed', 'prior dismissal sticky');
    assertEqual(resolveStatus(c, { status: 'confirmed_hide' }, ctx), 'confirmed_hide', 'hide sticky');
    assertEqual(resolveStatus(c, { status: 'confirmed_scrape' }, ctx), 'confirmed_scrape', 'scrape sticky');
    assertEqual(resolveStatus(c, null, { now: NOW, dismissedKeys: new Set(['area:x']) }), 'dismissed',
      'live dismissal set wins over everything');
    const future = new Date(NOW.getTime() + 1).toISOString();
    assertEqual(resolveStatus(c, { status: 'snoozed', snoozed_until: future }, ctx), 'snoozed',
      'still inside the snooze window');
    assertEqual(resolveStatus(c, { status: 'snoozed', snoozed_until: NOW.toISOString() }, ctx), 'actionable',
      'snooze expires AT the boundary (until > now is strict)');
    assertEqual(resolveStatus(c, { status: 'snoozed', snoozed_until: null }, ctx), 'actionable',
      'snoozed with no until falls through to the engine');
    assertEqual(resolveStatus(c, { status: 'forming' }, ctx), 'actionable',
      'engine-owned prior follows the engine');
  });

  // ── isTracked edges ──────────────────────────────────────────────────────────
  test('hardening: isTracked — tier none, missing gates, lift exactly 1 all excluded', () => {
    assertEqual(isTracked(cand()), true, 'baseline tracked');
    assertEqual(isTracked(cand({ tier: 'none' })), false, 'tier none out');
    assert(!isTracked(cand({ gates: undefined })), 'no gates out (defensive, falsy)');
    assert(!isTracked(cand({ gates: { sample: false } })), 'failed sample out (falsy)');
    assertEqual(isTracked(cand({ lift: 1 })), false, 'lift EXACTLY 1 out (strict >)');
    assertEqual(isTracked(cand({ lift: 1.0000001 })), true, 'lift just above 1 in');
  });

  // ── metricsOf / paramsOf exact shapes ────────────────────────────────────────
  test('hardening: metricsOf exact shape — 6dp default, 4dp masses, booleans coerced, no id lists', () => {
    deepEq(metricsOf(cand(), 0.7654321049), {
      n_eff: 14.25, k_eff: 13.5, n_raw: 15, k_raw: 14,
      p_hat: 0.947368, wilson_lower: 0.891235, lift: 1.234568, p_value: 0.012346,
      fdr_significant: true, distinct_rejected_listings: 9, volume_artefact: false,
      qualifies_this_run: true,
      gates: { global: true, sample: true, confidence: true, disproportionality: true, persistence: true },
      baseline: 0.765432,
      reason: 'Rejected 93% of 15 (14 of 15) — 1.23× your 76% baseline reject rate.',
    }, 'metrics jsonb byte-shape');
    const m = metricsOf(cand({ fdr_significant: 0, volume_artefact: 1, baseline: null }), Infinity);
    assertEqual(m.fdr_significant, false, 'falsy coerced to real boolean');
    assertEqual(m.volume_artefact, true, 'truthy coerced to real boolean');
    assertEqual(m.baseline, Infinity, 'non-finite passes through un-rounded (lit() nulls it later)');
  });

  test('hardening: paramsOf snapshots exactly the audit key set', () => {
    const config = resolveConfig();
    const p = paramsOf(config);
    deepEq(Object.keys(p), [
      'preset', 'WILSON_FLOOR', 'MIN_LIFT', 'PERSISTENCE_RUNS', 'FDR_Q', 'HALF_LIFE_DAYS',
      'GLOBAL_MIN_FEEDBACK', 'DIM_MIN_FEEDBACK', 'MIN_EFFECTIVE_SAMPLE', 'MIN_DISTINCT',
      'FORMING_FLOOR', 'FDR_PER_DIMENSION', 'EXCLUDE_PASSES',
    ], 'audit key list is deliberate');
    assertEqual(p.preset, config.preset, 'values copied verbatim');
    assertEqual(p.WILSON_FLOOR, config.WILSON_FLOOR, 'values copied verbatim');
  });

  // ── priorRunsFromRows ────────────────────────────────────────────────────────
  test('hardening: priorRunsFromRows keys dimension:value and defaults missing counts to 0', () => {
    deepEq(priorRunsFromRows([
      { dimension: 'area', value: 'x', runs_qualified: 3 },
      { dimension: 'property_type', value: 'flat' },
    ]), { 'area:x': 3, 'property_type:flat': 0 }, 'shape + default');
    deepEq(priorRunsFromRows(), {}, 'no rows → empty map');
  });

  // ── planRun: feedback block boundary + carried fields ────────────────────────
  test('hardening: planRun feedback — global gate inclusive at the minimum, dims mapped', () => {
    const config = resolveConfig();
    const run = (systemDecayed) => ({
      config, system_decayed: systemDecayed,
      baseline: { area: 0.8 },
      dimensions: { area: { dimDecayed: 42.5 }, property_type: {} },
      candidates: [cand()],
      gate_stats: { area: { total: 1 } },
    });
    const at = planRun(run(config.GLOBAL_MIN_FEEDBACK), { householdId: 'hh-1', now: NOW });
    assertEqual(at.runRow.params.feedback.global_gate_open, true, '== minimum opens');
    assertEqual(at.runRow.params.feedback.system_decayed, config.GLOBAL_MIN_FEEDBACK, 'value recorded');
    deepEq(at.runRow.params.feedback.dims, { area: 42.5, property_type: 0 },
      'per-dimension decayed mass, missing → 0');
    const under = planRun(run(config.GLOBAL_MIN_FEEDBACK - 1e-9), { householdId: 'hh-1', now: NOW });
    assertEqual(under.runRow.params.feedback.global_gate_open, false, 'below stays shut');
    assertEqual(at.runRow.params.gate_stats.area.total, 1, 'gate_stats carried onto the audit row');
  });

  test('hardening: planRun carries prior first_detected_at/snoozed_until and metrics ≡ metricsOf', () => {
    const config = resolveConfig();
    const engineRun = {
      config, system_decayed: 500, baseline: { area: 0.7654321049 },
      dimensions: { area: { dimDecayed: 200 } }, candidates: [cand()], gate_stats: {},
    };
    const prior = {
      dimension: 'area', value: 'x', status: 'forming',
      first_detected_at: '2026-06-01T00:00:00.000Z', snoozed_until: '2026-08-01T00:00:00.000Z',
    };
    const plan = planRun(engineRun, { householdId: 'hh-1', now: NOW, existingRows: [prior] });
    const u = plan.upserts[0];
    assertEqual(u.first_detected_at, '2026-06-01T00:00:00.000Z', 'first sighting preserved');
    assertEqual(u.snoozed_until, '2026-08-01T00:00:00.000Z', 'snooze timestamp preserved');
    assertEqual(u.runs_qualified, 5, 'engine count written back');
    deepEq(u.metrics, metricsOf(cand(), 0.7654321049), 'metrics is exactly metricsOf');
    assertEqual(plan.actionableCount, 1, 'actionable counted');
    assertEqual(plan.trackedCount, 1, 'tracked counted');
    // No ctx defaults: dismissedKeys omitted must behave as empty.
    assertEqual(plan.upserts[0].status, 'actionable', 'no dismissals by default');
  });
}
