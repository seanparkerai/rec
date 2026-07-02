// afford-golden-grid.test.js — step 5.2: the golden-master GRID over the
// affordability VERDICT ENGINE, the fold-back from the finance mutation
// baseline (assets/js/affordability.js measured 42.59% — 182 survivors —
// while the 5.1-covered pure calculators sat at 79–100%). Where the 5.1 grid
// pins the arithmetic, this grid pins the JUDGEMENT: banding thresholds,
// worst-of verdict composition, headline copy, whyVerdict lines, LTV tiers,
// deposit-gap-to-tier, and the three-scenario modeller.
//
// Three profiles ISOLATE each verdict driver (worst-of masking would
// otherwise let a mutated threshold hide behind a worse sibling band):
//   A — LTI-driven ladder (income 60k, deposit 40k): prices straddle the
//       4.5×/5.5×/6.0× LTI edges exactly (310000/370000/400000 ±) and sweep
//       the LISA £450k cap, the FTB £500k relief cliff (both regimes) and
//       every LTV tier on the way.
//   B — payment%-driven ladder (gross 240k so LTI never binds, take-home
//       £2,000, no outgoings, £0 deposit): the price ladder sweeps payment%
//       across the 40/52/60 band edges.
//   C — spare-cash-driven (gross 400k, PI fixed via a £240k loan): outgoings
//       variants walk spare across the £400/£100 edges and below zero.
// Plus input-edge rows (0/missing/string price) and the scenarios modeller.
//
// REGENERATED from the live module on every run and diffed line-by-line
// against tests/characterization/golden/afford-grid.golden.txt. A legitimate
// §3.10b change regenerates the fixture DELIBERATELY in the same commit.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assessAffordability, assessAffordabilityScenarios } from '../../assets/js/affordability.js';

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), 'golden/afford-grid.golden.txt');

const S = (v) => (v === Infinity ? 'Infinity' : JSON.stringify(v));

function finA({ ftb = true } = {}) {
  return {
    firstTimeBuyer: ftb,
    income: { annualBaseSalary: 60000, annualBonus: 0, takeHomeMonthly: 3600, totalMonthly: 3600 },
    goal: { targetDeposit: 40000 },
    savings: { totalSavings: 30000, monthlyContribution: 1500 },
    mortgage: { ratePctAssumed: 5, termYears: 25 },
    ongoingBillsTotal: { monthly: 800 },
    expensesTotal: { monthly: 700 },
  };
}
function finB() {
  return {
    firstTimeBuyer: true,
    income: { annualBaseSalary: 240000, annualBonus: 0, takeHomeMonthly: 2000, totalMonthly: 2000 },
    goal: { targetDeposit: 0 },
    savings: { totalSavings: 0, monthlyContribution: 0 },
    mortgage: { ratePctAssumed: 5, termYears: 25 },
  };
}
function finC(billsMonthly) {
  return {
    firstTimeBuyer: true,
    income: { annualBaseSalary: 400000, annualBonus: 0, takeHomeMonthly: 3600, totalMonthly: 3600 },
    goal: { targetDeposit: 40000 },
    savings: { totalSavings: 40000, monthlyContribution: 2000 },
    mortgage: { ratePctAssumed: 5, termYears: 25 },
    ongoingBillsTotal: { monthly: billsMonthly },
    expensesTotal: { monthly: 0 },
  };
}

export function buildGrid() {
  const rows = [];
  // Profile A — LTI edges (loan = price − 40000; LTI edge×60000: 4.5→310000, 5.5→370000, 6.0→400000)
  const pricesA = [200000, 309999, 310000, 310600, 340000, 369999, 370000, 370600,
    399999, 400000, 400600, 449999, 450000, 450001, 500000, 500001, 600000];
  for (const p of pricesA) rows.push(`A.ftb(${p})=${S(assessAffordability({ price: p, finances: finA(), criteria: {} }))}`);
  rows.push(`A.std(500001)=${S(assessAffordability({ price: 500001, finances: finA({ ftb: false }), criteria: {} }))}`);
  // Profile B — payment% edges (PI/2000 sweeps ~38→61% across this ladder)
  for (const p of [130000, 135000, 137000, 140000, 150000, 170000, 175000, 180000, 200000, 205000, 210000]) {
    rows.push(`B(${p})=${S(assessAffordability({ price: p, finances: finB(), criteria: {} }))}`);
  }
  // Profile C — spare edges (PI fixed by the £240k loan; spare = 3600 − bills − PI)
  for (const bills of [1790, 1800, 2090, 2110, 3600]) {
    rows.push(`C(bills=${bills})=${S(assessAffordability({ price: 280000, finances: finC(bills), criteria: {} }))}`);
  }
  // Input edges
  rows.push(`edge.zero=${S(assessAffordability({ price: 0, finances: finA(), criteria: {} }))}`);
  rows.push(`edge.string=${S(assessAffordability({ price: '310000', finances: finA(), criteria: {} }))}`);
  rows.push(`edge.emptyFin=${S(assessAffordability({ price: 300000, finances: {}, criteria: {} }))}`);
  rows.push(`edge.noArgs=${S(assessAffordability())}`);
  // Scenarios modeller (fixed 340k/400k internals + months-to-ready arithmetic)
  const goals = { deposit: { hopedFor: 50000 }, target: { currentSystemCentre: 375000 } };
  rows.push(`scenarios=${S(assessAffordabilityScenarios({ finances: finA(), criteria: {}, goals }))}`);
  rows.push(`scenarios.noPace=${S(assessAffordabilityScenarios({
    finances: { ...finA(), savings: { totalSavings: 30000, monthlyContribution: 0 } }, criteria: {}, goals,
  }))}`);
  rows.push(`scenarios.empty=${S(assessAffordabilityScenarios({}))}`);
  return rows;
}

export async function register({ test, assert, assertEqual }) {
  test('afford golden grid (5.2): the verdict engine matches the committed fixture exactly', () => {
    const want = readFileSync(GOLDEN, 'utf8').trim().split('\n');
    const have = buildGrid();
    assertEqual(have.length, want.length,
      `grid size ${have.length} vs fixture ${want.length} — generator and fixture must move together`);
    for (let i = 0; i < want.length; i++) {
      assertEqual(have[i], want[i], `grid line ${i + 1} diverged from the golden fixture`);
    }
  });

  test('afford golden grid (5.2): band-edge anchors hold, independent of the fixture', () => {
    // Hand-derived anchors so a corrupted fixture can't bless a regression.
    const at = (price) => assessAffordability({ price, finances: finA(), criteria: {} });
    // The final verdict at these prices is payment%-masked (worst-of), so the
    // LTI 4.5 edge is anchored on its whyVerdict explanation line instead.
    assert(!at(310000).whyVerdict.some((s) => /Loan-to-income/.test(s)),
      'LTI 4.50 exactly stays un-flagged (≤, not <)');
    assert(at(310600).whyVerdict.some((s) => /Loan-to-income 4\.51× \(stretch/.test(s)),
      'LTI 4.51 tips out of comfortable and is explained');
    assertEqual(at(400000).verdict, 'tight', 'LTI 6.00 exactly is still tight');
    assertEqual(at(400600).verdict, 'out-of-reach', 'LTI 6.01 is out of reach');
    assert(at(450000).bandSignals.lisaEligible === true, 'LISA holds at exactly £450k');
    assert(at(450001).bandSignals.lisaEligible === false, 'LISA lost at £450,001');
    assert(at(450001).whyVerdict.some((s) => /LISA cap/.test(s)), 'the LISA loss is explained');
    assert(at(500001).whyVerdict.some((s) => /FTB SDLT relief lost/.test(s)), 'the FTB cliff is explained');
    const spare = (bills) => assessAffordability({ price: 280000, finances: finC(bills), criteria: {} });
    assert(spare(1790).monthlySpareAfter > 400 && spare(1790).verdict === 'comfortable',
      'spare > £400 with both other bands comfortable = comfortable');
    assertEqual(spare(2110).verdict, 'tight', 'spare < £100 drives tight');
    assert(spare(3600).whyVerdict.some((s) => /negative/.test(s)), 'negative spare is explained');
  });
}
