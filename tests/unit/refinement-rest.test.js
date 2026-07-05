// tests/unit/refinement-rest.test.js — the PostgREST apply path (persistence.js REST
// builders, 2026-07-05 owner-directed redesign). The scheduled job now writes its plan
// with the service-role key over PostgREST — no psql, no SUPABASE_DB_URL secret. These
// pin the request shapes: upsert conflict target + merge preference, run-row
// return=representation, sync_log linkage, and the FROM-status-guarded probation PATCH.
import { runRefinementEngine } from '../../assets/js/refinement/engine.js';
import {
  planRun, restSuggestionsUpsert, restRunInsert, restSyncLogInsert, restProbationPatches,
} from '../../assets/js/refinement/persistence.js';
import { resolveConfig } from '../../assets/js/refinement/config.js';

export async function register({ test, assert, assertEqual }) {
  const HH = '9628b44f-447e-4c5b-bbbc-b2ce51efbbbe';
  const NOW = new Date('2026-07-05T12:00:00Z');
  let seq = 0;
  const react = (reaction, type, daysAgo = 30) => ({
    listing_id: `L${seq++}`,
    reaction,
    created_at: new Date(NOW.getTime() - daysAgo * 86_400_000 - seq * 60_000).toISOString(),
    listing_snapshot: { property_type: type },
  });
  const many = (n, fn) => Array.from({ length: n }, fn);

  // A plan with real content: park home heavily rejected vs a liked control type.
  const run = runRefinementEngine(
    [...many(60, () => react('reject', 'park home')), ...many(40, () => react('like', 'detached')), ...many(250, () => react('reject', 'detached'))],
    { now: NOW, config: resolveConfig({ preset: 'balanced' }), dimensions: ['property_type'] },
  );
  const plan = planRun(run, { householdId: HH, existingRows: [], dismissedKeys: new Set(), now: NOW });

  test('rest: suggestion upsert targets the natural key with merge-duplicates', () => {
    const req = restSuggestionsUpsert(plan);
    assert(req, 'plan with upserts yields a request');
    assertEqual(req.method, 'POST');
    assertEqual(req.path, 'refinement_suggestions?on_conflict=household_id,dimension,value');
    assertEqual(req.headers.Prefer, 'resolution=merge-duplicates');
    assert(Array.isArray(req.body) && req.body.length === plan.upserts.length, 'body carries every upsert');
    assertEqual(req.body[0].household_id, HH);
    assert('metrics' in req.body[0] && 'status' in req.body[0], 'row shape intact');
    assertEqual(restSuggestionsUpsert({ upserts: [] }), null, 'no upserts → no request');
  });

  test('rest: run insert asks for the new row back; sync_log links to it', () => {
    const req = restRunInsert(plan);
    assertEqual(req.method, 'POST');
    assertEqual(req.path, 'refinement_runs');
    assertEqual(req.headers.Prefer, 'return=representation');
    assertEqual(req.body[0].household_id, HH);
    assertEqual(req.body[0].run_at, NOW.toISOString());

    const log = restSyncLogInsert(42, plan);
    assertEqual(log.path, 'sync_log');
    assertEqual(log.body[0].actor, 'system');
    assertEqual(log.body[0].table_name, 'refinement_suggestions');
    assertEqual(log.body[0].row_id, 42);
    assertEqual(log.body[0].at, plan.runRow.run_at);
  });

  test('rest: probation PATCH carries the same FROM-status guard as the SQL', () => {
    const patches = restProbationPatches(
      [{ value: 'foo-sp1', from: 'active', to: 'reconsider' }],
      { householdId: HH, now: NOW },
    );
    assertEqual(patches.length, 1);
    assertEqual(patches[0].method, 'PATCH');
    assert(patches[0].path.includes(`household_id=eq.${HH}`), 'household-scoped');
    assert(patches[0].path.includes('dimension=eq.area'), 'area-scoped');
    assert(patches[0].path.includes('value=eq.foo-sp1'), 'value-scoped');
    assert(patches[0].path.includes('status=eq.active'), 'FROM-status guard present');
    assertEqual(patches[0].body.status, 'reconsider');
    assertEqual(patches[0].body.updated_at, NOW.toISOString());
    assertEqual(restProbationPatches([], { householdId: HH }).length, 0);
  });
}
