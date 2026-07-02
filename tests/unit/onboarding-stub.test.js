// tests/unit/onboarding-stub.test.js — ONE onboarding-stub predicate (Phase 6.3).
// Pins the shared `isOnboardingStub` (tools/area-fields.mjs) behaviour grid and a
// source rail: the materialiser (sync-areas-from-supabase) and the parity gate
// (areas-db-repo-parity) must both import the shared predicate — the duplicated
// `source === 'household-onboarding'` literal comparison can never return to either.
import { readFileSync } from 'node:fs';
import { isOnboardingStub } from '../../tools/area-fields.mjs';

export async function register({ test, assert, assertEqual }) {
  // ── predicate grid ───────────────────────────────────────────────────────────
  test('onboarding-stub: a household-onboarding record is a stub', () => {
    assertEqual(isOnboardingStub({ id: 'x-so21', source: 'household-onboarding', active: false }), true);
    // active does not matter — source is the discriminator (promotion flips source, not active)
    assertEqual(isOnboardingStub({ id: 'x-so21', source: 'household-onboarding', active: true }), true);
  });

  test('onboarding-stub: curated records are NOT stubs (source absent or "curated")', () => {
    assertEqual(isOnboardingStub({ id: 'wickham-po17', name: 'Wickham' }), false);
    assertEqual(isOnboardingStub({ id: 'wickham-po17', source: 'curated' }), false);
  });

  test('onboarding-stub: null / undefined / non-record inputs are safely not stubs', () => {
    assertEqual(isOnboardingStub(null), false);
    assertEqual(isOnboardingStub(undefined), false);
    assertEqual(isOnboardingStub({}), false);
  });

  test('onboarding-stub: the predicate takes the RECORD — a DB row must pass row.data', () => {
    const row = { id: 'x-so21', data: { id: 'x-so21', source: 'household-onboarding' } };
    assertEqual(isOnboardingStub(row), false);      // whole row: source lives one level down
    assertEqual(isOnboardingStub(row.data), true);  // callers unwrap, as sync does
  });

  // ── source rail: the one predicate stays the one predicate ──────────────────
  test('onboarding-stub: materialiser + parity gate import the shared predicate; no inline literal returns', () => {
    const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
    for (const p of ['tools/sync-areas-from-supabase.mjs', 'tests/contract/areas-db-repo-parity.test.js']) {
      const src = read(p);
      assert(/isOnboardingStub/.test(src), `${p} does not use the shared isOnboardingStub`);
      assert(!/source\s*[!=]==?\s*['"]household-onboarding['"]/.test(src),
        `${p} still carries an inline household-onboarding comparison`);
      assert(!/const\s+isOnboardingStub\s*=/.test(src),
        `${p} redefines isOnboardingStub locally instead of importing it`);
    }
  });
}
