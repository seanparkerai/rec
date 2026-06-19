// tests/refinement-persistence.test.js — Stage 3 persistence/planning layer
// (docs/archive/REFINEMENT_PLAN.md §3). Proves the three acceptance points deterministically:
//   • running the job twice advances runs_qualified correctly (read-back loop);
//   • a dismissed value stays dismissed (no re-nag);
//   • nothing in the plan mutates listings / criteria / zones (notify-only).
// Plus tracked-set selection, status resolution, first_detected_at preservation,
// run-audit counts, and the idempotent-upsert SQL shape.
import { runRefinementEngine } from '../assets/js/refinement/engine.js';
import {
  priorRunsFromRows, isTracked, resolveStatus, metricsOf, paramsOf, planRun, renderPlanSql,
} from '../assets/js/refinement/persistence.js';
import { resolveConfig } from '../assets/js/refinement/config.js';

export async function register({ test, assert, assertEqual }) {
  const cfg = resolveConfig();
  const HH = '9628b44f-447e-4c5b-bbbc-b2ce51efbbbe';
  const BASE = Date.parse('2026-06-05T00:00:00Z');
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  let seq = 0;
  const react = (reaction, type, createdMs) => ({
    listing_id: `L${seq++}`,
    reaction,
    created_at: new Date(createdMs).toISOString(),
    listing_snapshot: { property_type: type },
  });
  const batch = (type, rej, like = 0, createdMs = BASE - DAY) => {
    const out = [];
    for (let i = 0; i < rej; i++) out.push(react('reject', type, createdMs));
    for (let i = 0; i < like; i++) out.push(react('like', type, createdMs));
    return out;
  };
  // Strong, disproportionate signal: park home rejected wholesale, the rest mostly kept.
  const strongSignal = () => [
    ...batch('park home', 60),
    ...batch('detached', 30, 170),
    ...batch('semi-detached', 20, 180),
  ];
  const dim = 'property_type';

  // ── priorRunsFromRows ────────────────────────────────────────────────────────
  test('persistence: priorRunsFromRows keys by dimension:value', () => {
    const map = priorRunsFromRows([
      { dimension: 'property_type', value: 'park home', runs_qualified: 3 },
      { dimension: 'area', value: 'chillworth-so16', runs_qualified: 0 },
    ]);
    assertEqual(map['property_type:park home'], 3);
    assertEqual(map['area:chillworth-so16'], 0);
    assertEqual(priorRunsFromRows()['anything'], undefined);
  });

  // ── isTracked ────────────────────────────────────────────────────────────────
  test('persistence: isTracked requires forming+, a real sample, and lift > 1', () => {
    const base = { tier: 'confident', gates: { sample: true }, lift: 1.5 };
    assert(isTracked(base), 'confident, sampled, lift>1 → tracked');
    assert(!isTracked({ ...base, tier: 'none' }), 'below forming floor → not tracked');
    assert(!isTracked({ ...base, gates: { sample: false } }), 'too small a sample → not tracked');
    assert(!isTracked({ ...base, lift: 1.0 }), 'lift ≤ 1 (artefact-leaning) → not tracked');
    assert(!isTracked({ ...base, lift: 0.8 }), 'below baseline → not tracked');
  });

  // ── resolveStatus ────────────────────────────────────────────────────────────
  test('persistence: resolveStatus keeps user-owned statuses sticky, else follows the engine', () => {
    const now = new Date(BASE);
    const cand = (over = {}) => ({ dimension: dim, value: 'park home', actionable: false, ...over });
    // engine-owned
    assertEqual(resolveStatus(cand({ actionable: true }), null, { now }), 'actionable');
    assertEqual(resolveStatus(cand(), null, { now }), 'forming');
    // dismissed: both via prior row and via the dismissals set
    assertEqual(resolveStatus(cand({ actionable: true }), { status: 'dismissed' }, { now }), 'dismissed');
    assertEqual(resolveStatus(cand({ actionable: true }), null,
      { now, dismissedKeys: new Set(['property_type:park home']) }), 'dismissed');
    // confirmed actions are owned by Stage 5/6
    assertEqual(resolveStatus(cand({ actionable: true }), { status: 'confirmed_hide' }, { now }), 'confirmed_hide');
    // snoozed until expiry, then falls through
    assertEqual(resolveStatus(cand({ actionable: true }),
      { status: 'snoozed', snoozed_until: new Date(BASE + DAY).toISOString() }, { now }), 'snoozed');
    assertEqual(resolveStatus(cand({ actionable: true }),
      { status: 'snoozed', snoozed_until: new Date(BASE - DAY).toISOString() }, { now }), 'actionable');
  });

  // ── metrics / params shape ───────────────────────────────────────────────────
  test('persistence: metricsOf carries metrics not id lists; paramsOf snapshots the config', () => {
    const run = runRefinementEngine(strongSignal(), { now: new Date(BASE), config: cfg, dimensions: [dim] });
    const ph = run.dimensions.property_type.candidates.find((c) => c.value === 'park home');
    const m = metricsOf(ph, run.baseline.property_type);
    assert('wilson_lower' in m && 'lift' in m && 'volume_artefact' in m && 'gates' in m, 'rich metrics present');
    assert(!('reaction_ids' in m) && !('listings' in m), 'no id lists stored');
    const p = paramsOf(cfg);
    assertEqual(p.preset, 'cautious');
    assertEqual(p.WILSON_FLOOR, 0.88);
    assertEqual(p.MIN_LIFT, 1.20); // rebased 2026-06-19 (was 1.6) — see refinement/config.js
  });

  // ── planRun: tracked selection + run-audit counts ────────────────────────────
  test('persistence: planRun tracks only the disproportionate value and counts the run', () => {
    const run = runRefinementEngine(strongSignal(), { now: new Date(BASE), config: cfg, dimensions: [dim] });
    const plan = planRun(run, { householdId: HH, existingRows: [], now: new Date(BASE) });
    assertEqual(plan.trackedCount, 1, 'only park home is tracked (detached/semi sit at/below baseline)');
    assertEqual(plan.upserts[0].value, 'park home');
    assertEqual(plan.runRow.candidates_evaluated, run.candidates.length, 'audits all evaluated candidates');
    assertEqual(plan.runRow.actionable_count, 0, 'not actionable on run 1 (persistence unmet)');
    assertEqual(plan.upserts[0].status, 'forming');
    // run row carries the feedback summary for the Stage-4 confidence meter (§4.6)
    const fb = plan.runRow.params.feedback;
    assert(fb && typeof fb.system_decayed === 'number', 'feedback.system_decayed recorded');
    assertEqual(fb.global_min, cfg.GLOBAL_MIN_FEEDBACK);
    assertEqual(fb.global_gate_open, fb.system_decayed >= cfg.GLOBAL_MIN_FEEDBACK);
    assert('property_type' in fb.dims, 'per-dimension decayed feedback recorded');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ACCEPTANCE 1 — running the job twice (×5) advances runs_qualified, then actionable
  // ════════════════════════════════════════════════════════════════════════════
  test('persistence: the read-back loop advances runs_qualified one per run, to actionable at 5', () => {
    const reactions = strongSignal();
    let existing = [];
    let firstDetected = null;
    let plan;
    for (let i = 1; i <= cfg.PERSISTENCE_RUNS; i++) {
      const now = new Date(BASE + i * HOUR);
      const run = runRefinementEngine(reactions, {
        now, config: cfg, dimensions: [dim], priorRunsQualified: priorRunsFromRows(existing),
      });
      plan = planRun(run, { householdId: HH, existingRows: existing, now });
      const ph = plan.upserts.find((u) => u.value === 'park home');
      assertEqual(ph.runs_qualified, i, `run ${i} → runs_qualified ${i}`);
      if (i === 1) firstDetected = ph.first_detected_at;
      assertEqual(ph.first_detected_at, firstDetected, 'first_detected_at is preserved across runs');
      // simulate the DB after the upsert
      existing = plan.upserts.map((u) => ({
        dimension: u.dimension, value: u.value, runs_qualified: u.runs_qualified,
        status: u.status, first_detected_at: u.first_detected_at, snoozed_until: u.snoozed_until,
      }));
    }
    const ph = plan.upserts.find((u) => u.value === 'park home');
    assertEqual(ph.runs_qualified, cfg.PERSISTENCE_RUNS);
    assertEqual(ph.status, 'actionable', 'persistence met → actionable');
    assertEqual(plan.actionableCount, 1);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ACCEPTANCE 2 — a dismissed value stays dismissed even when it would be actionable
  // ════════════════════════════════════════════════════════════════════════════
  test('persistence: a dismissed value is never re-raised, even when fully qualified', () => {
    const reactions = strongSignal();
    const existing = [{
      dimension: dim, value: 'park home', status: 'dismissed',
      runs_qualified: cfg.PERSISTENCE_RUNS + 4, // already long-qualified
      first_detected_at: new Date(BASE - DAY).toISOString(), snoozed_until: null,
    }];
    const run = runRefinementEngine(reactions, {
      now: new Date(BASE), config: cfg, dimensions: [dim], priorRunsQualified: priorRunsFromRows(existing),
    });
    const plan = planRun(run, { householdId: HH, existingRows: existing, now: new Date(BASE) });
    const ph = plan.upserts.find((u) => u.value === 'park home');
    assertEqual(ph.status, 'dismissed', 'stays dismissed');
    assertEqual(plan.actionableCount, 0, 'dismissed values never count as actionable');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // STAGE 5 — a confirmed_hide is sticky against an engine re-run (display lever)
  // ════════════════════════════════════════════════════════════════════════════
  test('persistence: a confirmed_hide value stays hidden against an engine re-run', () => {
    const reactions = strongSignal();
    const existing = [{
      dimension: dim, value: 'park home', status: 'confirmed_hide',
      runs_qualified: cfg.PERSISTENCE_RUNS + 2, // long-qualified — would be actionable
      first_detected_at: new Date(BASE - DAY).toISOString(), snoozed_until: null,
    }];
    const run = runRefinementEngine(reactions, {
      now: new Date(BASE), config: cfg, dimensions: [dim], priorRunsQualified: priorRunsFromRows(existing),
    });
    const plan = planRun(run, { householdId: HH, existingRows: existing, now: new Date(BASE) });
    const ph = plan.upserts.find((u) => u.value === 'park home');
    assertEqual(ph.status, 'confirmed_hide', 'engine never downgrades a user-applied hide');
    assertEqual(plan.actionableCount, 0, 'a confirmed hide is not re-counted as actionable');
    // Even on a race (the job upserts before reading the new status), the rendered
    // ON CONFLICT CASE guard only overwrites forming/actionable, so confirmed_hide holds.
    const sql = renderPlanSql(plan);
    assert(sql.includes("status IN ('forming','actionable')"), 'ON CONFLICT guard preserves user-owned statuses');
  });

  test('persistence: a confirmed_scrape value stays paused against an engine re-run', () => {
    // Stage 6 scrape lever: the same guard protects a user-applied "stop searching".
    const reactions = strongSignal();
    const existing = [{
      dimension: dim, value: 'park home', status: 'confirmed_scrape',
      runs_qualified: cfg.PERSISTENCE_RUNS + 2,
      first_detected_at: new Date(BASE - DAY).toISOString(), snoozed_until: null,
    }];
    const run = runRefinementEngine(reactions, {
      now: new Date(BASE), config: cfg, dimensions: [dim], priorRunsQualified: priorRunsFromRows(existing),
    });
    const plan = planRun(run, { householdId: HH, existingRows: existing, now: new Date(BASE) });
    const ph = plan.upserts.find((u) => u.value === 'park home');
    assertEqual(ph.status, 'confirmed_scrape', 'engine never reverts a user-applied scrape pause');
    assertEqual(plan.actionableCount, 0, 'a confirmed scrape pause is not re-counted as actionable');
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ACCEPTANCE 3 — the rendered SQL is notify-only: only the three engine tables
  // ════════════════════════════════════════════════════════════════════════════
  test('persistence: renderPlanSql is an idempotent upsert touching only engine tables', () => {
    const run = runRefinementEngine(strongSignal(), { now: new Date(BASE), config: cfg, dimensions: [dim] });
    const plan = planRun(run, { householdId: HH, existingRows: [], now: new Date(BASE) });
    const sql = renderPlanSql(plan);
    // touches exactly the three engine/audit tables
    assert(sql.includes('INSERT INTO refinement_suggestions'), 'suggestions upsert present');
    assert(sql.includes('ON CONFLICT (household_id, dimension, value) DO UPDATE'), 'idempotent upsert');
    assert(sql.includes("status IN ('forming','actionable')"), 'never overwrites a user-owned status');
    assert(sql.includes('INSERT INTO refinement_runs'), 'run-audit row present');
    assert(sql.includes("'system'") && sql.includes('INSERT INTO sync_log'), 'logged as actor=system');
    assert(sql.includes('::jsonb'), 'metrics/params serialised as jsonb');
    assert(sql.startsWith('BEGIN;') && sql.trim().endsWith('COMMIT;'), 'wrapped in a transaction');
    // notify-only: NOTHING here mutates the scrape/listing/user-search surface.
    // (substring 'listings' legitimately appears inside the metric key
    // distinct_rejected_listings, so assert on actual DML statement patterns.)
    for (const banned of [
      'INTO listings', 'UPDATE listings', 'INTO criteria', 'UPDATE criteria',
      'INTO zones', 'UPDATE zones', 'INTO areas', 'UPDATE areas', 'DELETE FROM',
    ]) {
      assert(!sql.includes(banned), `plan SQL must not reference ${banned}`);
    }
  });
}
