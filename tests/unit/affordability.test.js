// affordability.test.js — hand-computed verdict cases against default finances.
// Registered into tests/tests.html by passing { test, assert, assertEqual, fixtures }.
// Fixtures = { finances: data/finances.json, criteria: data/criteria.json }.

import { assessAffordability } from '../../assets/js/affordability.js';
import {
  calcSDLT, calcMonthlyMortgage, calcLTV, lisaEligible, computeOutlayBreakdown,
  missingTransactionCosts, TRANSACTION_COST_CHECKLIST,
} from '../../assets/js/finances.js';

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

  await test('affordability: £451k → LISA NOT eligible; A4 mismatch band explained', () => {
    const r = at(451_000);
    assertEqual(r.bandSignals.lisaEligible, false);
    // 5.6 (A4): in the £450k–£500k band the sharper cap-mismatch line renders —
    // SDLT FTB relief kept, LISA bonus lost, 25% charge to use LISA funds.
    assert(
      r.whyVerdict.some((s) => /mismatch:.*25% withdrawal charge/.test(s)),
      'expected the £450k–£500k mismatch line; got: ' + r.whyVerdict.join(' | '),
    );
  });

  await test('affordability: above £500k the generic LISA-cap line returns (A4 band only)', () => {
    const r = at(600_000);
    assert(
      r.whyVerdict.some((s) => /LISA cap — bonus forfeited/.test(s)),
      'expected the generic cap line above £500k; got: ' + r.whyVerdict.join(' | '),
    );
    assert(
      !r.whyVerdict.some((s) => /mismatch/.test(s)),
      'the mismatch line must not render above £500k',
    );
  });

  // --- Rate-rise sensitivity warning --------------------------------------------

  await test('affordability: high rate-rise sensitivity flagged in whyVerdict', () => {
    // £380k at 5.35% contract → sensitivity rate max(5.35+1, 7.5) = 7.5%;
    // payment still > 60% of take-home on the sample finances.
    const r = at(380_000);
    assertEqual(r.rateRiseRatePct, 7.5, 'sensitivity rate = the 7.5% floor at a 5.35% contract rate');
    assert(
      r.bandSignals.stressedPaymentToIncome > 60,
      `expected sensitivity ratio > 60%, got ${r.bandSignals.stressedPaymentToIncome}`,
    );
    assert(
      r.whyVerdict.some((s) => /Rate-rise sensitivity:/.test(s)),
      'expected whyVerdict to mention rate-rise sensitivity; got: ' + r.whyVerdict.join(' | '),
    );
  });

  // --- MGS high-LTV enabler (5.7/A7) ---------------------------------------------

  await test('affordability: 91–95% LTV ≤£600k flags the Mortgage Guarantee Scheme', () => {
    const fin = {
      firstTimeBuyer: true,
      income: { annualBaseSalary: 90000, annualBonus: 0, takeHomeMonthly: 5000, totalMonthly: 5000 },
      goal: { targetDeposit: 24000 }, // £300k → LTV 92.0%
      savings: { totalSavings: 24000, monthlyContribution: 0 },
      mortgage: { ratePctAssumed: 5, termYears: 25 },
    };
    const inWindow = assessAffordability({ price: 300000, finances: fin, criteria: {} });
    assertEqual(inWindow.bandSignals.mgsEligible, true);
    assert(
      inWindow.whyVerdict.some((s) => /Mortgage Guarantee Scheme/.test(s)),
      'expected the MGS high-LTV route line; got: ' + inWindow.whyVerdict.join(' | '),
    );
    // 96% LTV — above the window: no scheme, no line.
    const above = assessAffordability({
      price: 300000, finances: { ...fin, goal: { targetDeposit: 12000 } }, criteria: {},
    });
    assertEqual(above.bandSignals.mgsEligible, false);
    assert(!above.whyVerdict.some((s) => /Guarantee Scheme/.test(s)), 'no MGS line above 95% LTV');
    // 92% LTV but £650k — over the price cap.
    const overCap = assessAffordability({
      price: 650000, finances: { ...fin, goal: { targetDeposit: 52000 } }, criteria: {},
    });
    assertEqual(overCap.bandSignals.mgsEligible, false);
  });

  await test('affordability: MGS window boundaries are inclusive at 91 / 95 / £600k exactly', () => {
    const finAt = (price, deposit) => ({
      firstTimeBuyer: true,
      income: { annualBaseSalary: 200000, annualBonus: 0, takeHomeMonthly: 9000, totalMonthly: 9000 },
      goal: { targetDeposit: deposit },
      savings: { totalSavings: deposit, monthlyContribution: 0 },
      mortgage: { ratePctAssumed: 5, termYears: 25 },
    });
    const mgs = (price, deposit) =>
      assessAffordability({ price, finances: finAt(price, deposit), criteria: {} }).bandSignals.mgsEligible;
    assertEqual(mgs(100000, 9000), true, 'LTV exactly 91.0% is IN (>=, not >)');
    assertEqual(mgs(100000, 9100), false, 'LTV 90.9% is below the window');
    assertEqual(mgs(100000, 5000), true, 'LTV exactly 95.0% is IN (<=, not <)');
    assertEqual(mgs(100000, 4900), false, 'LTV 95.1% is above the window');
    assertEqual(mgs(600000, 54000), true, 'price exactly £600k is IN (<=, not <)');
    assertEqual(mgs(600001, 54001), false, 'price £600,001 is out');
  });

  await test('affordability: A4 band boundary — £500,000 exactly still gets the mismatch line', () => {
    const r = at(500_000);
    assert(
      r.whyVerdict.some((s) => /mismatch:/.test(s)),
      '£500k exactly keeps FTB relief, so the mismatch line applies; got: ' + r.whyVerdict.join(' | '),
    );
  });

  // --- Transaction-cost checklist (5.7/A7) -----------------------------------------

  await test('outlay: the named transaction-cost checklist flags what is not itemised', () => {
    const missing = missingTransactionCosts(finances.oneTimeCosts);
    assert(missing.includes('Mortgage broker fee'),
      'the sample list has no broker row — must be flagged; got: ' + missing.join(', '));
    for (const covered of [
      'Legal / conveyancing', 'Local authority searches', 'Survey (RICS Level 2/3)',
      'Lender valuation', 'Mortgage product / arrangement fee', 'Removals',
    ]) {
      assert(!missing.includes(covered), `${covered} is itemised in the sample list (item or notes)`);
    }
    assertEqual(missingTransactionCosts([]).length, TRANSACTION_COST_CHECKLIST.length,
      'an empty list is missing every named cost');
    assertEqual(missingTransactionCosts(undefined).length, TRANSACTION_COST_CHECKLIST.length);
  });

  await test('outlay: every checklist keyword alternative recognises its cost on its own', () => {
    // One row per keyword — each must satisfy exactly its own checklist entry,
    // so no regex alternative can be silently dropped.
    const cases = [
      ['Legal / conveyancing', ['Solicitor quote', 'Conveyancing pack', 'LEGAL fees']],
      ['Local authority searches', ['Searches bundle']],
      ['Survey (RICS Level 2/3)', ['Survey booking']],
      ['Lender valuation', ['Valuation fee']],
      ['Mortgage product / arrangement fee', ['Arrangement fee', 'Product fee']],
      ['Mortgage broker fee', ['Broker invoice']],
      ['Removals', ['removal van']],
    ];
    for (const [name, rows] of cases) {
      for (const item of rows) {
        const missing = missingTransactionCosts([{ item, cost: 1 }]);
        assert(!missing.includes(name), `"${item}" alone must satisfy "${name}"`);
      }
    }
    // notes participate in matching too (the sample list holds searches in notes).
    const viaNotes = missingTransactionCosts([{ item: 'Fees', notes: 'including searches', cost: 1 }]);
    assert(!viaNotes.includes('Local authority searches'), 'notes text satisfies a checklist entry');
  });

  await test('outlay: the checklist gaps render on the finances page (source rail)', async () => {
    const { readFileSync } = await import('node:fs');
    const section = readFileSync(new URL('../../assets/js/finances/section-breakdowns.js', import.meta.url), 'utf8');
    assert(/missingTransactionCosts\(/.test(section), 'section-breakdowns consults the checklist');
    assert(/onetime-gaps/.test(section), 'gaps write into #onetime-gaps');
    const html = readFileSync(new URL('../../pages/finances.html', import.meta.url), 'utf8');
    assert(/id="onetime-gaps"/.test(html), 'the gaps element exists under the one-time table');
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

  await test('affordability: deposit gap when LTV is above every tier (idx -1)', () => {
    // Deposit < 5% ⇒ LTV > 95% ⇒ above all LTV_TIERS (findIndex returns -1). The gap
    // must target the top 95% tier (5% = £20,000), not wrongly report £0.
    const r = assessAffordability({
      price: 400_000,
      finances: {
        income: { annualBaseSalary: 50_000, takeHomeMonthly: 3_000, totalMonthly: 3_000 },
        goal: { targetDeposit: 10_000 },
        savings: { totalSavings: 10_000 },
        mortgage: { ratePctAssumed: 5, termYears: 30 },
      },
      criteria: {},
    });
    assertEqual(r.depositGapToTier, 10_000); // £20,000 (5%) − £10,000 held
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
