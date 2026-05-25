// savings-velocity.test.js — baseline ETA + scenario deltas.
// Registered into tests/tests.html.

import { getSavingsVelocity } from '../assets/js/savings-velocity.js';
import { calcMonthsToTarget } from '../assets/js/finances.js';

export async function register({ test, assert, assertEqual, fixtures }) {
  const { finances } = fixtures;

  await test('savings-velocity: baseline ETA matches calcMonthsToTarget', () => {
    const v = getSavingsVelocity(finances);
    const expected = calcMonthsToTarget(
      finances.savings.totalSavings,
      finances.goal.targetDeposit,
      finances.savings.monthlyContribution,
    );
    assertEqual(v.baseline.etaMonths, expected);
  });

  await test('savings-velocity: +£500/mo shortens ETA by expected delta', () => {
    const v = getSavingsVelocity(finances);
    const plus500 = v.scenarios.find((s) => s.label === '+£500/mo');
    assert(plus500, 'scenario "+£500/mo" missing');
    // Gap = £40,000 − £25,660 = £14,340. At £2,000/mo → 7.2; at £2,500/mo → 5.7. Delta ≈ 1.5.
    assert(
      Math.abs(plus500.deltaMonths - 1.5) < 0.1,
      `expected ≈1.5 months sooner, got ${plus500.deltaMonths}`,
    );
  });

  await test('savings-velocity: default scenario set covers all PLAN.md labels', () => {
    const v = getSavingsVelocity(finances);
    const labels = v.scenarios.map((s) => s.label);
    for (const expected of [
      '−£100/mo', '−£200/mo', '−£500/mo',
      '+£100/mo', '+£200/mo', '+£500/mo',
      '+£5k windfall', '+£10k windfall',
      'target +£20k',
    ]) {
      assert(labels.includes(expected), `missing scenario: ${expected}; got ${labels.join(', ')}`);
    }
  });

  await test('savings-velocity: baseline etaDate is a Date in the near future', () => {
    const v = getSavingsVelocity(finances);
    assert(v.baseline.etaDate instanceof Date, 'baseline.etaDate must be a Date');
    assert(!isNaN(v.baseline.etaDate.getTime()), 'baseline.etaDate must be a valid Date');
    assert(v.baseline.etaDate.getTime() > Date.now() - 1000, 'baseline.etaDate must be ≥ now');
  });

  await test('savings-velocity: +£10k windfall lands sooner than +£5k', () => {
    const v = getSavingsVelocity(finances);
    const w5 = v.scenarios.find((s) => s.label === '+£5k windfall');
    const w10 = v.scenarios.find((s) => s.label === '+£10k windfall');
    assert(w10.etaMonths < w5.etaMonths, `+£10k ETA ${w10.etaMonths} should be < +£5k ETA ${w5.etaMonths}`);
  });

  await test('savings-velocity: cliffs include the LISA cap', () => {
    const v = getSavingsVelocity(finances);
    assertEqual(v.cliffs.lisaMax, 450_000);
  });
}
