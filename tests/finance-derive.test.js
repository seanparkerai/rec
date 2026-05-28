// finance-derive.test.js — exercises deriveFinances() against hand-computed values.

import { deriveFinances, stripDerived } from '../assets/js/finance-derive.js';

const RAW = {
  currency: 'GBP',
  income: {
    annualGrossBase: 64000,
    monthlyNetTakeHome: 3543.54,
    annualBonus: 3000,
  },
  outgoings: {},
  goal: { targetDeposit: 40000 },
  savings: { current: 24500, monthlyContribution: 2000 },
  mortgage: { estimatedMonthlyPayment: 1900 },
  oneTimeCosts: [{ item: 'a', cost: 100 }, { item: 'b', cost: 200 }],
  ongoingBills: [{ item: 'phone', monthly: 75 }, { item: 'water', monthly: 33.33 }],
  expenses: [{ item: 'food', monthly: 300 }, { item: 'fuel', monthly: 160 }],
  shoppingList: [{ category: 'kitchen', cost: 230 }, { category: 'appliances', cost: 1150 }],
  giftCards: [{ source: 'Currys', amount: 50 }, { source: 'M&D', amount: 500 }],
};

const INVESTMENTS = {
  trading212ISA: { currentPortfolioValue: 31193, earmarkPct: 100 },
};

export async function register({ test, assert, assertEqual }) {

  // --- Income aliases -------------------------------------------------------
  await test('derive: income.takeHomeMonthly aliases monthlyNetTakeHome', () => {
    const d = deriveFinances(RAW);
    assertEqual(d.income.takeHomeMonthly, 3543.54);
  });

  await test('derive: income.totalMonthly equals takeHomeMonthly (bonus excluded)', () => {
    const d = deriveFinances(RAW);
    assertEqual(d.income.totalMonthly, 3543.54);
  });

  await test('derive: income.annualBaseSalary aliases annualGrossBase', () => {
    const d = deriveFinances(RAW);
    assertEqual(d.income.annualBaseSalary, 64000);
  });

  await test('derive: income.monthlyGross = annualGrossBase / 12', () => {
    const d = deriveFinances(RAW);
    assertEqual(d.income.monthlyGross, 5333.33);
  });

  await test('derive: income.bonusMonthly = annualBonus / 12, NOT added to totalMonthly', () => {
    const d = deriveFinances(RAW);
    assertEqual(d.income.bonusMonthly, 250);
    assertEqual(d.income.totalMonthly, 3543.54);
  });

  // --- Line-item totals -----------------------------------------------------
  await test('derive: oneTimeCostsTotal sums oneTimeCosts[].cost', () => {
    assertEqual(deriveFinances(RAW).oneTimeCostsTotal, 300);
  });

  await test('derive: ongoingBillsTotal.monthly + .annual', () => {
    const d = deriveFinances(RAW);
    assertEqual(d.ongoingBillsTotal.monthly, 108.33);
    assertEqual(d.ongoingBillsTotal.annual, 1299.96);
  });

  await test('derive: expensesTotal.monthly + .annual + .weekly', () => {
    const d = deriveFinances(RAW);
    assertEqual(d.expensesTotal.monthly, 460);
    assertEqual(d.expensesTotal.annual, 5520);
  });

  await test('derive: giftCardsTotal sums giftCards[].amount', () => {
    assertEqual(deriveFinances(RAW).giftCardsTotal, 550);
  });

  await test('derive: shoppingTotal sums shoppingList[].cost', () => {
    assertEqual(deriveFinances(RAW).shoppingTotal, 1380);
  });

  // --- Savings cross-resource ----------------------------------------------
  // Gift cards are NOT counted in totalSavings — they aren't deposit-eligible.
  await test('derive: totalSavings = cash only when no investments', () => {
    const d = deriveFinances(RAW);
    assertEqual(d.savings.totalSavings, 24500);
  });

  await test('derive: totalSavings includes ISA earmark when investments provided', () => {
    const d = deriveFinances(RAW, { investments: INVESTMENTS });
    // 24500 + (31193 * 100%) = 55693 — gift cards excluded
    assertEqual(d.savings.totalSavings, 55693);
  });

  await test('derive: ISA earmark pct is respected', () => {
    const halfEarmark = { trading212ISA: { currentPortfolioValue: 31193, earmarkPct: 50 } };
    const d = deriveFinances(RAW, { investments: halfEarmark });
    // 24500 + (31193 * 50%) = 40096.5
    assertEqual(d.savings.totalSavings, 40096.5);
  });

  await test('derive: savingsGap = max(0, target - totalSavings)', () => {
    const d = deriveFinances(RAW);
    // target 40000 - totalSavings 24500 = 15500
    assertEqual(d.savings.savingsGap, 15500);
  });

  await test('derive: savingsGap clamps to 0 when surplus', () => {
    const d = deriveFinances(RAW, { investments: INVESTMENTS });
    // 55693 > 40000 → gap is 0
    assertEqual(d.savings.savingsGap, 0);
  });

  await test('derive: monthsToSave = gap / monthlyContribution, 0 when at target', () => {
    const d = deriveFinances(RAW);
    // 15500 / 2000 = 7.75
    assertEqual(d.savings.monthsToSave, 7.75);

    const surplus = deriveFinances(RAW, { investments: INVESTMENTS });
    assertEqual(surplus.savings.monthsToSave, 0);
  });

  await test('derive: avgMonthlyDepositEstimate reads pre-computed net from raw.savings.monthlyAverage.net', () => {
    const withHistory = { ...RAW, savings: {
      ...RAW.savings,
      monthlyAverage: { net: 2043.28, gross: 2587.82 },
    }};
    const inv = { trading212ISA: { currentPortfolioValue: 24000, earmarkPct: 100, accountOpened: '2025-05-26' } };
    const d = deriveFinances(withHistory, { investments: inv });
    assertEqual(d.savings.avgMonthlyDepositEstimate, 2043.28);
    assertEqual(d.savings.avgMonthlyDepositGross, 2587.82);
  });

  await test('derive: avgMonthlyDepositEstimate falls back to portfolio÷months when monthlyAverage absent', () => {
    // Build an investments fixture opened exactly 12 months ago.
    const opened = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const inv = { trading212ISA: { currentPortfolioValue: 24000, earmarkPct: 100, accountOpened: opened.toISOString().slice(0, 10) } };
    const d = deriveFinances(RAW, { investments: inv });
    // Should NOT use a pre-computed value (RAW has no monthlyAverage); fallback ≈ 24000/12 ≈ 2000.
    assert(d.savings.avgMonthlyDepositEstimate !== 2043.28, 'should use fallback, not pre-computed');
    assert(Math.abs(d.savings.avgMonthlyDepositEstimate - 2000) < 50,
      `expected ~2000 from fallback, got ${d.savings.avgMonthlyDepositEstimate}`);
  });

  await test('derive: avgMonthlyDepositEstimate is null without investments and no monthlyAverage', () => {
    const d = deriveFinances(RAW);
    assertEqual(d.savings.avgMonthlyDepositEstimate, null);
  });

  await test('derive: gift cards tracked separately, NOT in totalSavings', () => {
    const d = deriveFinances(RAW);
    assertEqual(d.giftCardsTotal, 550);
    // totalSavings is purely cash — gift cards excluded
    assertEqual(d.savings.totalSavings, 24500);
  });

  // --- Post-move outgoings + spare -----------------------------------------
  await test('derive: monthlyOutgoingsPostMove = bills + expenses + mortgage', () => {
    const d = deriveFinances(RAW);
    // 108.33 + 460 + 1900 = 2468.33
    assertEqual(d.monthlyOutgoingsPostMove.total, 2468.33);
  });

  await test('derive: spare.monthly = takeHome - post-move outgoings', () => {
    const d = deriveFinances(RAW);
    // 3543.54 - 2468.33 = 1075.21
    assertEqual(d.spare.monthly, 1075.21);
  });

  // --- Pass-through fields --------------------------------------------------
  await test('derive: raw inputs are passed through untouched', () => {
    const d = deriveFinances(RAW);
    assertEqual(d.income.annualGrossBase, 64000);
    assertEqual(d.income.monthlyNetTakeHome, 3543.54);
    assertEqual(d.goal.targetDeposit, 40000);
    assertEqual(d.savings.current, 24500);
    assertEqual(d.savings.monthlyContribution, 2000);
  });

  // --- Defensive null handling ---------------------------------------------
  await test('derive: returns null for null input', () => {
    assertEqual(deriveFinances(null), null);
  });

  await test('derive: handles missing arrays without throwing', () => {
    const bare = { income: { monthlyNetTakeHome: 1000 } };
    const d = deriveFinances(bare);
    assertEqual(d.oneTimeCostsTotal, 0);
    assertEqual(d.ongoingBillsTotal.monthly, 0);
    assertEqual(d.expensesTotal.monthly, 0);
    assertEqual(d.giftCardsTotal, 0);
  });

  // --- stripDerived round-trips --------------------------------------------
  await test('stripDerived: deriving then stripping returns shape equivalent to raw', () => {
    const d = deriveFinances(RAW);
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
    assertEqual(stripped.income.annualGrossBase, 64000);
    assertEqual(stripped.income.monthlyNetTakeHome, 3543.54);
    assertEqual(stripped.savings.current, 24500);
  });
}
