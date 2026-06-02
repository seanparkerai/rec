// affordability.test.js — hand-computed verdict cases against default finances.
// Registered into tests/tests.html by passing { test, assert, assertEqual, fixtures }.
// Fixtures = { finances: data/finances.json, criteria: data/criteria.json }.

import { assessAffordability } from '../assets/js/affordability.js';
import { calcSDLT, calcMonthlyMortgage, calcLTV, lisaEligible, computeOutlayBreakdown } from '../assets/js/finances.js';

export async function register({ test, assert, assertEqual, fixtures }) {
  const { finances, criteria } = fixtures;
  const at = (price) => assessAffordability({ price, finances, criteria });

  // --- Verdict bands -----------------------------------------------------------

  await test('affordability: £300k → stretch on the sample finances', () => {
    const r = at(300_000);
    assertEqual(r.verdict, 'stretch', `got ${r.verdict} — ${r.headline}`);
  });

  await test('affordability: £380k → out-of-reach on the sample finances', () => {
    const r = at(380_000);
    assertEqual(r.verdict, 'out-of-reach', `got ${r.verdict} — ${r.headline}`);
  });

  await test('affordability: £420k → out-of-reach on the sample finances', () => {
    const r = at(420_000);
    assertEqual(r.verdict, 'out-of-reach', `got ${r.verdict} — ${r.headline}`);
  });

  await test('affordability: £500k → out-of-reach', () => {
    const r = at(500_000);
    assertEqual(r.verdict, 'out-of-reach', `got ${r.verdict} — ${r.headline}`);
  });

  // --- LISA cliff --------------------------------------------------------------

  await test('affordability: £449k → LISA eligible', () => {
    const r = at(449_000);
    assertEqual(r.bandSignals.lisaEligible, true);
  });

  await test('affordability: £451k → LISA NOT eligible', () => {
    const r = at(451_000);
    assertEqual(r.bandSignals.lisaEligible, false);
    assert(
      r.whyVerdict.some((s) => /LISA cap/.test(s)),
      'expected whyVerdict to mention LISA cap; got: ' + r.whyVerdict.join(' | '),
    );
  });

  // --- Stress-test warning -----------------------------------------------------

  await test('affordability: high stressed rate flagged in whyVerdict', () => {
    // £380k at 5.35% contract → 8.35% stressed payment ≈ £2,508 = 69.9% of take-home.
    const r = at(380_000);
    assert(
      r.bandSignals.stressedPaymentToIncome > 60,
      `expected stressed ratio > 60%, got ${r.bandSignals.stressedPaymentToIncome}`,
    );
    assert(
      r.whyVerdict.some((s) => /Stress test:/.test(s)),
      'expected whyVerdict to mention the stress test; got: ' + r.whyVerdict.join(' | '),
    );
  });

  // --- Shape contract ----------------------------------------------------------

  await test('affordability: return shape includes every PLAN.md field', () => {
    const r = at(380_000);
    for (const key of [
      'verdict', 'headline',
      'maxBorrowEstimate', 'maxPropertyAtCurrentDeposit', 'maxPropertyAtTargetDeposit',
      'loanRequired', 'ltvPct', 'ltvTier', 'depositGapToTier',
      'monthlyPI', 'monthlyPIStressed', 'monthlyTotal',
      'monthlySpareAfter', 'monthlySpareNow', 'spareDelta',
      'bandSignals', 'whyVerdict',
    ]) {
      assert(key in r, `missing key: ${key}`);
    }
    for (const key of ['incomeMultiple', 'paymentToIncome', 'stressedPaymentToIncome', 'lisaEligible']) {
      assert(key in r.bandSignals, `missing bandSignals.${key}`);
    }
    assert(Array.isArray(r.whyVerdict), 'whyVerdict must be an array');
  });

  // --- LTV deposit gap ---------------------------------------------------------

  await test('affordability: deposit gap to next tier is computed', () => {
    // £380k with £40k target deposit → LTV 89.5% → already at the 90 tier.
    // Gap to next tier (85) = ceil(380k × 0.15) − 40k = 57000 − 40000 = 17000.
    const r = at(380_000);
    assertEqual(r.ltvTier, 90);
    assertEqual(r.depositGapToTier, 17_000);
  });

  // --- Parity with the old siloed calculators (Phase 4a acceptance) -----------

  await test('affordability: SDLT / monthlyPI / LTV / lisaEligible match underlying calcs at offer target', () => {
    const price = 380_000;
    const r = at(price);
    const deposit = Number(finances.goal.targetDeposit);
    const loan = price - deposit;
    const ftb = finances.firstTimeBuyer !== false;
    const rate = finances.mortgage.ratePctAssumed;
    const term = finances.mortgage.termYears;
    assertEqual(r.sdlt, calcSDLT(price, { firstTimeBuyer: ftb }), 'SDLT mismatch');
    assertEqual(r.monthlyPI, calcMonthlyMortgage(loan, rate, term), 'monthlyPI mismatch');
    assertEqual(r.ltvPct, calcLTV(loan, price), 'LTV mismatch');
    assertEqual(r.bandSignals.lisaEligible, lisaEligible(price), 'lisaEligible mismatch');
  });

  // --- SDLT regression ---------------------------------------------------------

  await test('calcSDLT: £380k FTB = £4,000', () => {
    assertEqual(calcSDLT(380_000, { firstTimeBuyer: true }), 4_000);
  });

  await test('calcSDLT: £300k FTB = £0 (at threshold)', () => {
    assertEqual(calcSDLT(300_000, { firstTimeBuyer: true }), 0);
  });

  await test('calcSDLT: £500,001 FTB loses full relief, SDLT > £4,000', () => {
    assert(calcSDLT(500_001, { firstTimeBuyer: true }) > 4_000,
      'above £500k cliff: FTB relief lost, SDLT should jump above £4k');
  });

  // --- computeOutlayBreakdown --------------------------------------------------

  await test('computeOutlayBreakdown: three-group grand total = £57,000', () => {
    const breakdown = computeOutlayBreakdown({
      targetDeposit: 40_000,
      offerTarget: 380_000,
      firstTimeBuyer: true,
      oneTimeCosts: [
        { category: 'sdlt',        cost: 0    },  // SDLT is computed from offerTarget — this item ignored
        { category: 'legal',       cost: 1150 },
        { category: 'legal',       cost: 500  },
        { category: 'removal',     cost: 0    },
        { category: 'contingency', cost: 0    },
        { category: 'legal',       cost: 0    },
        { category: 'transport',   cost: 6000 },
      ],
      shoppingList: [{ cost: 5350 }],
    });
    assertEqual(breakdown.sdlt, 4_000);
    assertEqual(breakdown.legalCosts, 1_650);   // 1150 + 500 + 0
    assertEqual(breakdown.corePurchase, 45_650); // 40000 + 4000 + 1650
    assertEqual(breakdown.furnishing, 5_350);
    assertEqual(breakdown.majorPurchases, 6_000);
    assertEqual(breakdown.grandTotal, 57_000);
  });
}
