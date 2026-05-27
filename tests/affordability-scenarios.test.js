// affordability-scenarios.test.js — assessAffordabilityScenarios() for Luke's actual numbers.
// £31,193 saved, £2,000/mo contribution, £64k salary, take-home £3,543.54.

import { assessAffordabilityScenarios } from '../assets/js/affordability.js';

export async function register({ test, assert, assertEqual, fixtures }) {
  const { finances, criteria } = fixtures;

  const goals = {
    timeline: { horizon: '3-6 months' },
    target: { currentSystemCentre: 375000 },
    deposit: { hopedFor: 50000, currentSavings: 31193 },
  };

  const scenarios = assessAffordabilityScenarios({ finances, criteria, goals });

  // --- Structure ---------------------------------------------------------------

  await test('affordability-scenarios: returns three named scenarios', () => {
    assert('buyNowLowerTarget' in scenarios, 'missing buyNowLowerTarget');
    assert('buyOnTargetDeposit' in scenarios, 'missing buyOnTargetDeposit');
    assert('buyAtHigherTarget' in scenarios, 'missing buyAtHigherTarget');
  });

  // --- buyNowLowerTarget (£340k, deposit = current savings £31,193) ----------

  await test('affordability-scenarios: buyNowLowerTarget price is £340k', () => {
    assertEqual(scenarios.buyNowLowerTarget.price, 340_000);
  });

  await test('affordability-scenarios: buyNowLowerTarget deposit is current savings', () => {
    assertEqual(scenarios.buyNowLowerTarget.deposit, 31193);
  });

  await test('affordability-scenarios: buyNowLowerTarget monthsToReady is 0', () => {
    assertEqual(scenarios.buyNowLowerTarget.monthsToReady, 0);
  });

  await test('affordability-scenarios: buyNowLowerTarget has a verdict', () => {
    const valid = ['comfortable', 'stretch', 'tight', 'out-of-reach'];
    assert(valid.includes(scenarios.buyNowLowerTarget.verdict), `unexpected verdict: ${scenarios.buyNowLowerTarget.verdict}`);
  });

  // --- buyOnTargetDeposit (£375k, deposit = hoped £50k) ---------------------

  await test('affordability-scenarios: buyOnTargetDeposit price is £375k', () => {
    assertEqual(scenarios.buyOnTargetDeposit.price, 375_000);
  });

  await test('affordability-scenarios: buyOnTargetDeposit deposit is £50k', () => {
    assertEqual(scenarios.buyOnTargetDeposit.deposit, 50_000);
  });

  await test('affordability-scenarios: buyOnTargetDeposit monthsToReady is ~10 (£18,807 gap at £2k/mo)', () => {
    // gap = 50000 - 31193 = 18807; ceil(18807/2000) = 10
    assertEqual(scenarios.buyOnTargetDeposit.monthsToReady, 10);
  });

  // --- buyAtHigherTarget (£400k, deposit = 12.5% = £50k) -------------------

  await test('affordability-scenarios: buyAtHigherTarget price is £400k', () => {
    assertEqual(scenarios.buyAtHigherTarget.price, 400_000);
  });

  await test('affordability-scenarios: buyAtHigherTarget deposit is £50k (87.5% LTV)', () => {
    // ceil(400000 * 0.125) = 50000
    assertEqual(scenarios.buyAtHigherTarget.deposit, 50_000);
  });

  await test('affordability-scenarios: all scenarios have ltvPct between 80 and 97', () => {
    for (const [key, sc] of Object.entries(scenarios)) {
      assert(sc.ltvPct >= 80 && sc.ltvPct <= 97, `${key}: ltvPct ${sc.ltvPct} outside expected range`);
    }
  });
}
