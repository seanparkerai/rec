// tests/unit/refinement-health.test.js — engine-health view-model (refinement/health.js).
// The daily server job can skip silently (secrets guard) while reporting green, so the
// Trends page derives an honest fresh/stale/never state from the latest run row's age.
import { buildEngineHealth, ageLabel, STALE_AFTER_HOURS, OWNER_ACTION } from '../../assets/js/refinement/health.js';

export async function register({ test, assert, assertEqual }) {
  const now = new Date('2026-07-05T12:00:00Z');
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600000).toISOString();

  test('health: a run within the stale window is fresh, with no owner action', () => {
    const h = buildEngineHealth({ meta: { run_at: hoursAgo(20) }, now });
    assertEqual(h.state, 'fresh');
    assertEqual(h.ownerAction, '');
    assertEqual(h.detail, '');
    assert(h.headline.includes('today'), `fresh headline says today: ${h.headline}`);
  });

  test('health: exactly at the boundary flips to stale', () => {
    const h = buildEngineHealth({ meta: { run_at: hoursAgo(STALE_AFTER_HOURS) }, now });
    assertEqual(h.state, 'stale');
  });

  test('health: a month-old run is stale, points at the run log, and never asks for new secrets', () => {
    const h = buildEngineHealth({ meta: { run_at: '2026-06-07T12:00:00Z' }, now });
    assertEqual(h.state, 'stale');
    assertEqual(h.ageDays, 28);
    assert(h.headline.includes('28 days ago'), h.headline);
    assert(h.detail.includes('run log'), 'detail points at the workflow run log');
    assertEqual(h.ownerAction, OWNER_ACTION);
    // The 2026-07-05 no-psql redesign: the job runs on the two secrets that already
    // exist; the fix must NEVER tell the owner to mint a new credential.
    assert(!OWNER_ACTION.includes('SUPABASE_DB_URL'), 'no dead-secret mention');
    assert(!/new repository secret|connection string|password/i.test(OWNER_ACTION), 'no credential-minting ask');
    assert(OWNER_ACTION.includes('Run workflow'), 'fix is a retry, not a setup task');
  });

  test('health: no run row at all → never, still reassures live computation', () => {
    for (const meta of [null, {}, { run_at: 'not-a-date' }]) {
      const h = buildEngineHealth({ meta, now });
      assertEqual(h.state, 'never');
      assertEqual(h.ageDays, null);
      assert(h.detail.includes('computed live'), 'never-state explains live trends still work');
      assert(h.ownerAction.length > 0, 'never-state carries the fix');
    }
  });

  test('health: ageLabel humanises 0/1/N days', () => {
    assertEqual(ageLabel(0), 'today');
    assertEqual(ageLabel(1), 'yesterday');
    assertEqual(ageLabel(9), '9 days ago');
  });
}
