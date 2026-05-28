// affordability-scenarios.test.js — assessAffordabilityScenarios() for Luke's actual numbers.
// £32,994.45 saved (T212 ISA), £2,000/mo contribution goal, £65,971 salary, take-home £3,623.52.

import { assessAffordabilityScenarios } from '../assets/js/affordability.js';

export async function register({ test, assert, assertEqual, fixtures }) {
  const { finances, criteria } = fixtures;

  const goals = {
    timeline: { horizon: '3-6 months' },
    target: { currentSystemCentre: 375000 },
    deposit: { hopedFor: 40000, currentSavings: 32994.45 },
  };

  const scenarios = assessAffordabilityScenarios({ finances, criteria, goals });

  // --- Structure ---------------------------------------------------------------

  await test('affordability-scenarios: returns three named scenarios', () => {
    assert('buyNowLowerTarget' in scenarios, 'missing buyNowLowerTarget');
    assert('buyOnTargetDeposit' in scenarios, 'missing buyOnTargetDeposit');
    assert('buyAtHigherTarget' in scenarios, 'missing buyAtHigherTarget');
  });

  // --- buyNowLowerTarget (£340k, deposit = current savings £32,994.45) ----------

  await test('affordability-scenarios: buyNowLowerTarget price is £340k', () => {
    assertEqual(scenarios.buyNowLowerTarget.price, 340_000);
  });

  await test('affordability-scenarios: buyNowLowerTarget deposit is current savings', () => {
    // currentSavings derived from finances.savings.totalSavings (£32,994.45)
    assertEqual(scenarios.buyNowLowerTarget.deposit, 32994.45);
  });

  await test('affordability-scenarios: buyNowLowerTarget monthsToReady is 0', () => {
    assertEqual(scenarios.buyNowLowerTarget.monthsToReady, 0);
  });

  await test('affordability-scenarios: buyNowLowerTarget has a verdict', () => {
    const valid = ['comfortable', 'stretch', 'tight', 'out-of-reach'];
    assert(valid.includes(scenarios.buyNowLowerTarget.verdict), `unexpected verdict: ${scenarios.buyNowLowerTarget.verdict}`);
  });

  // --- buyOnTargetDeposit (£375k, deposit = canonical target £40k) ---------------------

  await test('affordability-scenarios: buyOnTargetDeposit price is £375k', () => {
    assertEqual(scenarios.buyOnTargetDeposit.price, 375_000);
  });

  await test('affordability-scenarios: buyOnTargetDeposit deposit is £40k (canonical target)', () => {
    assertEqual(scenarios.buyOnTargetDeposit.deposit, 40_000);
  });

  await test('affordability-scenarios: buyOnTargetDeposit monthsToReady is ~4 (£7,005.55 gap at £2k/mo)', () => {
    // gap = 40000 - 32994.45 = 7005.55; ceil(7005.55/2000) = 4
    assertEqual(scenarios.buyOnTargetDeposit.monthsToReady, 4);
  });

  // --- buyAtHigherTarget (£400k, deposit = 12.5% = £50k) -------------------

  await test('affordability-scenarios: buyAtHigherTarget price is £400k', () => {
    assertEqual(scenarios.buyAtHigherTarget.price, 400_000);
  });

  await test('affordability-scenarios: buyAtHigherTarget deposit is £50k (87.5% LTV)', () => {
    // ceil(400000 * 0.125) = 50000 — computed from price, independent of hopedFor
    assertEqual(scenarios.buyAtHigherTarget.deposit, 50_000);
  });

  await test('affordability-scenarios: all scenarios have ltvPct between 80 and 97', () => {
    for (const [key, sc] of Object.entries(scenarios)) {
      assert(sc.ltvPct >= 80 && sc.ltvPct <= 97, `${key}: ltvPct ${sc.ltvPct} outside expected range`);
    }
  });
}
