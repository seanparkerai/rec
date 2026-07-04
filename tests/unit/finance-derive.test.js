// finance-derive.test.js — exercises deriveFinances() against hand-computed values.
// All inputs are synthetic round numbers (not real user data).

import { deriveFinances, stripDerived, computeDepositSavings } from '../../assets/js/finance-derive.js';

const RAW = {
  currency: 'GBP',
  income: {
    annualGrossBase: 60000,
    monthlyNetTakeHome: 3000,
    annualBonus: 2400,
  },
  outgoings: {},
  goal: { targetDeposit: 40000 },
  savings: { current: 20000, monthlyContribution: 2000 },
  mortgage: { estimatedMonthlyPayment: 1900 },
  oneTimeCosts: [{ item: 'a', cost: 100 }, { item: 'b', cost: 200 }],
  ongoingBills: [{ item: 'phone', monthly: 70 }, { item: 'water', monthly: 30 }],
  expenses: [{ item: 'food', monthly: 300 }, { item: 'fuel', monthly: 100 }],
  shoppingList: [{ category: 'kitchen', cost: 200 }, { category: 'appliances', cost: 1000 }],
  giftCards: [{ source: 'Retailer A', amount: 50 }, { source: 'Retailer B', amount: 200 }],
};

const INVESTMENTS = {
  trading212ISA: { currentPortfolioValue: 20000, earmarkPct: 100 },
};

export async function register({ test, assert, assertEqual }) {

  // --- Income aliases -------------------------------------------------------
  await test('derive: income.takeHomeMonthly aliases monthlyNetTakeHome', () => {
    const d = deriveFinances(RAW, { investments: null });
    assertEqual(d.income.takeHomeMonthly, 3000);
  });

  await test('derive: income.totalMonthly equals takeHomeMonthly (bonus excluded)', () => {
    const d = deriveFinances(RAW, { investments: null });
    assertEqual(d.income.totalMonthly, 3000);
  });

  await test('derive: income.annualBaseSalary aliases annualGrossBase', () => {
    const d = deriveFinances(RAW, { investments: null });
    assertEqual(d.income.annualBaseSalary, 60000);
  });

  await test('derive: income.monthlyGross = annualGrossBase / 12', () => {
    const d = deriveFinances(RAW, { investments: null });
    assertEqual(d.income.monthlyGross, 5000);
  });

  await test('derive: income.bonusMonthly = annualBonus / 12, NOT added to totalMonthly', () => {
    const d = deriveFinances(RAW, { investments: null });
    assertEqual(d.income.bonusMonthly, 200);
    assertEqual(d.income.totalMonthly, 3000);
  });

  // --- Line-item totals -----------------------------------------------------
  await test('derive: oneTimeCostsTotal sums oneTimeCosts[].cost', () => {
    assertEqual(deriveFinances(RAW, { investments: null }).oneTimeCostsTotal, 300);
  });

  await test('derive: ongoingBillsTotal.monthly + .annual', () => {
    const d = deriveFinances(RAW, { investments: null });
    assertEqual(d.ongoingBillsTotal.monthly, 100);
    assertEqual(d.ongoingBillsTotal.annual, 1200);
  });

  await test('derive: expensesTotal.monthly + .annual', () => {
    const d = deriveFinances(RAW, { investments: null });
    assertEqual(d.expensesTotal.monthly, 400);
    assertEqual(d.expensesTotal.annual, 4800);
  });

  await test('derive: giftCardsTotal sums giftCards[].amount', () => {
    assertEqual(deriveFinances(RAW, { investments: null }).giftCardsTotal, 250);
  });

  await test('derive: shoppingTotal sums shoppingList[].cost', () => {
    assertEqual(deriveFinances(RAW, { investments: null }).shoppingTotal, 1200);
  });

  // --- computeDepositSavings (shared single-definition helper) ---------------
  await test('computeDepositSavings: cash only when no investments', () => {
    assertEqual(computeDepositSavings({ savings: { current: 53000 } }, null), 53000);
    assertEqual(computeDepositSavings({ savings: {} }, null), 0);
  });

  await test('computeDepositSavings: cash + earmarked ISA portion', () => {
    assertEqual(computeDepositSavings({ savings: { current: 0 } }, { trading212ISA: { currentPortfolioValue: 32994.45, earmarkPct: 100 } }), 32994.45);
    assertEqual(computeDepositSavings({ savings: { current: 2500 } }, { trading212ISA: { currentPortfolioValue: 50000, earmarkPct: 50 } }), 27500);
  });

  await test('computeDepositSavings: ISA with no earmark counts in full', () => {
    assertEqual(computeDepositSavings({ savings: { current: 1000 } }, { trading212ISA: { currentPortfolioValue: 12000 } }), 13000);
  });

  await test('computeDepositSavings: drives deriveFinances totalSavings (same value)', () => {
    const fin = { savings: { current: 2500 } };
    const inv = { trading212ISA: { currentPortfolioValue: 50000, earmarkPct: 50 } };
    assertEqual(deriveFinances(fin, { investments: inv }).savings.totalSavings, computeDepositSavings(fin, inv));
  });

  // --- Savings cross-resource ----------------------------------------------
  // Gift cards are NOT counted in totalSavings — they aren't deposit-eligible.
  await test('derive: totalSavings = cash only when no investments', () => {
    const d = deriveFinances(RAW, { investments: null });
    assertEqual(d.savings.totalSavings, 20000);
  });

  await test('derive: totalSavings includes ISA earmark when investments provided', () => {
    const d = deriveFinances(RAW, { investments: INVESTMENTS });
    // 20000 + (20000 * 100%) = 40000 — gift cards excluded
    assertEqual(d.savings.totalSavings, 40000);
  });

  await test('derive: ISA earmark pct is respected', () => {
    const halfEarmark = { trading212ISA: { currentPortfolioValue: 20000, earmarkPct: 50 } };
    const d = deriveFinances(RAW, { investments: halfEarmark });
    // 20000 + (20000 * 50%) = 30000
    assertEqual(d.savings.totalSavings, 30000);
  });

  await test('derive: savingsGap = max(0, target - totalSavings)', () => {
    const d = deriveFinances(RAW, { investments: null });
    // target 40000 - totalSavings 20000 = 20000
    assertEqual(d.savings.savingsGap, 20000);
  });

  await test('derive: savingsGap clamps to 0 when surplus', () => {
    const d = deriveFinances(RAW, { investments: INVESTMENTS });
    // 40000 >= 40000 → gap is 0
    assertEqual(d.savings.savingsGap, 0);
  });

  await test('derive: monthsToSave = gap / monthlyContribution, 0 when at target', () => {
    const d = deriveFinances(RAW, { investments: null });
    // 20000 / 2000 = 10
    assertEqual(d.savings.monthsToSave, 10);

    const surplus = deriveFinances(RAW, { investments: INVESTMENTS });
    assertEqual(surplus.savings.monthsToSave, 0);
  });

  await test('derive: avgMonthlyDepositEstimate reads pre-computed net from raw.savings.monthlyAverage.net', () => {
    const withHistory = { ...RAW, savings: {
      ...RAW.savings,
      monthlyAverage: { net: 2100, gross: 2600 },
    }};
    const inv = { trading212ISA: { currentPortfolioValue: 24000, earmarkPct: 100, accountOpened: '2025-01-01' } };
    const d = deriveFinances(withHistory, { investments: inv });
    assertEqual(d.savings.avgMonthlyDepositEstimate, 2100);
    assertEqual(d.savings.avgMonthlyDepositGross, 2600);
  });

  await test('derive: LIVE history average outranks the stored monthlyAverage snapshot', () => {
    // Stored snapshot says 2100/2600; live history says 3000 net — history wins.
    const withHistory = { ...RAW, savings: { ...RAW.savings, monthlyAverage: { net: 2100, gross: 2600 } } };
    const inv = { trading212ISA: { currentPortfolioValue: 24000, earmarkPct: 100 } };
    const hist = { monthlySummary: [
      { month: '2020-01', deposits: 3000, withdrawals: 0, net: 3000 },
      { month: '2020-02', deposits: 3000, withdrawals: 0, net: 3000 },
    ] };
    const d = deriveFinances(withHistory, { investments: inv, history: hist });
    assertEqual(d.savings.avgMonthlyDepositEstimate, 3000, 'live history overrides the snapshot');
    assertEqual(d.savings.avgMonthlyDepositGross, 3000);
  });

  await test('derive: falls back to the stored snapshot when history has no rows', () => {
    const withHistory = { ...RAW, savings: { ...RAW.savings, monthlyAverage: { net: 2100, gross: 2600 } } };
    const inv = { trading212ISA: { currentPortfolioValue: 24000, earmarkPct: 100 } };
    const d = deriveFinances(withHistory, { investments: inv, history: { monthlySummary: [] } });
    assertEqual(d.savings.avgMonthlyDepositEstimate, 2100, 'empty history → snapshot fallback');
  });

  await test('derive: avgMonthlyDepositEstimate falls back to portfolio÷months when monthlyAverage absent', () => {
    // Build an investments fixture opened exactly 12 months ago.
    const opened = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const inv = { trading212ISA: { currentPortfolioValue: 24000, earmarkPct: 100, accountOpened: opened.toISOString().slice(0, 10) } };
    const d = deriveFinances(RAW, { investments: inv });
    // Should NOT use a pre-computed value (RAW has no monthlyAverage); fallback ≈ 24000/12 ≈ 2000.
    assert(d.savings.avgMonthlyDepositEstimate !== 2100, 'should use fallback, not pre-computed');
    assert(Math.abs(d.savings.avgMonthlyDepositEstimate - 2000) < 50,
      `expected ~2000 from fallback, got ${d.savings.avgMonthlyDepositEstimate}`);
  });

  await test('derive: avgMonthlyDepositEstimate is null without investments and no monthlyAverage', () => {
    const d = deriveFinances(RAW, { investments: null });
    assertEqual(d.savings.avgMonthlyDepositEstimate, null);
  });

  await test('derive: gift cards tracked separately, NOT in totalSavings', () => {
    const d = deriveFinances(RAW, { investments: null });
    assertEqual(d.giftCardsTotal, 250);
    // totalSavings is purely cash — gift cards excluded
    assertEqual(d.savings.totalSavings, 20000);
  });

  // --- Post-move outgoings + spare -----------------------------------------
  await test('derive: monthlyOutgoingsPostMove = bills + expenses + mortgage', () => {
    const d = deriveFinances(RAW, { investments: null });
    // 100 + 400 + 1900 = 2400
    assertEqual(d.monthlyOutgoingsPostMove.total, 2400);
  });

  await test('derive: spare.monthly = takeHome - post-move outgoings', () => {
    const d = deriveFinances(RAW, { investments: null });
    // 3000 - 2400 = 600
    assertEqual(d.spare.monthly, 600);
  });

  // --- Pass-through fields --------------------------------------------------
  await test('derive: raw inputs are passed through untouched', () => {
    const d = deriveFinances(RAW, { investments: null });
    assertEqual(d.income.annualGrossBase, 60000);
    assertEqual(d.income.monthlyNetTakeHome, 3000);
    assertEqual(d.goal.targetDeposit, 40000);
    assertEqual(d.savings.current, 20000);
    assertEqual(d.savings.monthlyContribution, 2000);
  });

  // --- Defensive null handling ---------------------------------------------
  await test('derive: returns null for null input', () => {
    assertEqual(deriveFinances(null), null);
  });

  await test('derive: handles missing arrays without throwing', () => {
    const bare = { income: { monthlyNetTakeHome: 1000 } };
    const d = deriveFinances(bare, { investments: null });
    assertEqual(d.oneTimeCostsTotal, 0);
    assertEqual(d.ongoingBillsTotal.monthly, 0);
    assertEqual(d.expensesTotal.monthly, 0);
    assertEqual(d.giftCardsTotal, 0);
  });

  // --- C1 (5.11): investments-optional must be deliberate --------------------
  await test('derive: omitting the investments option warns; explicit null / a record is silent', () => {
    const seen = [];
    const orig = console.warn;
    console.warn = (msg) => seen.push(String(msg));
    try {
      deriveFinances(RAW);                              // bare — forgot investments
      deriveFinances(RAW, { investments: null });       // deliberate cash-only
      deriveFinances(RAW, { investments: INVESTMENTS }); // supplied
      deriveFinances(null);                             // early return — no warn
    } finally { console.warn = orig; }
    assertEqual(
      seen.filter((m) => m.includes('finance-derive: no investments')).length, 1,
      'exactly the bare call warns; got: ' + JSON.stringify(seen),
    );
  });

  // --- stripDerived round-trips --------------------------------------------
  await test('stripDerived: deriving then stripping returns shape equivalent to raw', () => {
    const d = deriveFinances(RAW, { investments: null });
    const stripped = stripDerived(d);
    assert(!('oneTimeCostsTotal' in stripped), 'oneTimeCostsTotal should be stripped');
    assert(!('ongoingBillsTotal' in stripped), 'ongoingBillsTotal should be stripped');
    assert(!('expensesTotal' in stripped), 'expensesTotal should be stripped');
    assert(!('shoppingTotal' in stripped), 'shoppingTotal should be stripped');
    assert(!('giftCardsTotal' in stripped), 'giftCardsTotal should be stripped');
    assert(!('monthlyOutgoingsPostMove' in stripped), 'monthlyOutgoingsPostMove should be stripped');
    assert(!('takeHomeMonthly' in stripped.income), 'income.takeHomeMonthly should be stripped');
    assert(!('totalMonthly' in stripped.income), 'income.totalMonthly should be stripped');
    assert(!('annualBaseSalary' in stripped.income), 'income.annualBaseSalary should be stripped');
    assert(!('totalSavings' in stripped.savings), 'savings.totalSavings should be stripped');
    assert(!('savingsGap' in stripped.savings), 'savings.savingsGap should be stripped');
    // Raw inputs preserved
    assertEqual(stripped.income.annualGrossBase, 60000);
    assertEqual(stripped.income.monthlyNetTakeHome, 3000);
    assertEqual(stripped.savings.current, 20000);
  });
}
