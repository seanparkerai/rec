// characterization-finances-calc.test.js — pins the EXACT outputs of the pure
// calculators in finances.js (SDLT, mortgage, LTV, LISA, deposit progress, …).
// Regression baseline for the Phase 9 split (finances.js → finances/calc-*.js
// behind a re-export shim). These are pure, deterministic functions, so the golden
// values are exact. Distinct from characterization-finances.test.js, which covers
// the money-flow / finance-derive chain rendered by page-finances.js.

import {
  calcSDLT, calcMonthlyMortgage, calcLTV, calcLISABonus, lisaEligible,
  calcDepositProgress, calcMonthsToTarget, projectSavings,
  totalInitialOutlay, computeOutlayBreakdown,
} from '../../assets/js/finances.js';

export async function register({ test, assert, assertEqual }) {
  const eqJSON = (a, b, msg) => assertEqual(JSON.stringify(a), JSON.stringify(b), msg);

  // ── SDLT (Apr 2025+ bands) ──────────────────────────────────────────────────
  await test('characterization/finances-calc SDLT standard £300k = £5,000', () => {
    assertEqual(calcSDLT(300_000), 5000);
  });
  await test('characterization/finances-calc SDLT standard £250k = £2,500', () => {
    assertEqual(calcSDLT(250_000), 2500);
  });
  await test('characterization/finances-calc SDLT FTB relief £400k = £5,000', () => {
    assertEqual(calcSDLT(400_000, { firstTimeBuyer: true }), 5000);
  });
  await test('characterization/finances-calc SDLT FTB ≤£300k = £0', () => {
    assertEqual(calcSDLT(280_000, { firstTimeBuyer: true }), 0);
  });
  await test('characterization/finances-calc SDLT FTB relief lost above £500k (£600k = £20,000)', () => {
    assertEqual(calcSDLT(600_000, { firstTimeBuyer: true }), 20000);
  });
  await test('characterization/finances-calc SDLT zero/negative price = £0', () => {
    assertEqual(calcSDLT(0), 0);
    assertEqual(calcSDLT(-5), 0);
  });

  // ── Mortgage ────────────────────────────────────────────────────────────────
  await test('characterization/finances-calc monthly mortgage £200k @5% /25y = £1,169.18', () => {
    assertEqual(calcMonthlyMortgage(200_000, 5, 25), 1169.18);
  });
  await test('characterization/finances-calc zero-rate mortgage is straight-line (£120k/0%/10y = £1,000)', () => {
    assertEqual(calcMonthlyMortgage(120_000, 0, 10), 1000);
  });
  await test('characterization/finances-calc zero principal mortgage = 0', () => {
    assertEqual(calcMonthlyMortgage(0, 5, 25), 0);
  });

  // ── LTV ─────────────────────────────────────────────────────────────────────
  await test('characterization/finances-calc LTV 360k/400k = 90; zero property value = 0', () => {
    assertEqual(calcLTV(360_000, 400_000), 90);
    assertEqual(calcLTV(100, 0), 0);
  });

  // ── LISA ────────────────────────────────────────────────────────────────────
  await test('characterization/finances-calc LISA bonus caps eligible at £4k / bonus at £1k', () => {
    eqJSON(calcLISABonus(5000), { eligible: 4000, bonus: 1000 });
    eqJSON(calcLISABonus(2000), { eligible: 2000, bonus: 500 });
  });
  await test('characterization/finances-calc LISA property eligibility cap is £450k', () => {
    assertEqual(lisaEligible(450_000), true);
    assertEqual(lisaEligible(450_001), false);
  });

  // ── Deposit progress / months-to-target ─────────────────────────────────────
  await test('characterization/finances-calc deposit progress is capped 0–100%', () => {
    assertEqual(calcDepositProgress(50_000, 100_000), 50);
    assertEqual(calcDepositProgress(120_000, 100_000), 100);
  });
  await test('characterization/finances-calc months-to-target: paced + edge cases', () => {
    assertEqual(calcMonthsToTarget(50_000, 100_000, 5000), 10);
    assertEqual(calcMonthsToTarget(100_000, 100_000, 5000), 0);
    assertEqual(calcMonthsToTarget(0, 1000, 0), Infinity);
  });

  // ── Projections / outlay ────────────────────────────────────────────────────
  await test('characterization/finances-calc projectSavings yields month/balance points', () => {
    eqJSON(projectSavings(1000, 500, 3), [
      { month: 0, balance: 1000 }, { month: 1, balance: 1500 },
      { month: 2, balance: 2000 }, { month: 3, balance: 2500 },
    ]);
  });
  await test('characterization/finances-calc totalInitialOutlay sums deposit + sdlt + costs', () => {
    eqJSON(
      totalInitialOutlay({ deposit: 40_000, sdlt: 5000, oneTimeCosts: [{ cost: 1000 }, { cost: 500 }] }),
      { deposit: 40_000, sdlt: 5000, otherCosts: 1500, total: 46_500 },
    );
  });
  await test('characterization/finances-calc computeOutlayBreakdown groups core/furnishing/major', () => {
    eqJSON(
      computeOutlayBreakdown({
        targetDeposit: 40_000, offerTarget: 400_000, firstTimeBuyer: true,
        oneTimeCosts: [{ category: 'legal', cost: 1500 }, { category: 'transport', cost: 8000 }],
        shoppingList: [{ cost: 2000 }, { cost: 500 }],
      }),
      { sdlt: 5000, legalCosts: 1500, corePurchase: 46_500, furnishing: 2500, majorPurchases: 8000, grandTotal: 57_000 },
    );
  });
}
