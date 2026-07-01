// savings-edit.test.js — exercises the pure helpers behind the "Edit savings"
// feature: patching cash + ISA inputs and previewing the derived deposit total.
// All inputs are synthetic round numbers (not real user data).

import {
  applyCashSavings, applyIsaValue, previewDepositTotal, hasIsa,
} from '../../assets/js/savings-edit.js';

const RAW = {
  currency: 'GBP',
  income: { annualGrossBase: 60000 },
  goal: { targetDeposit: 40000 },
  savings: { current: 2500, monthlyContribution: 1700, _note: 'keep me', monthlyAverage: { net: 1721 } },
};
const INV = { trading212ISA: { currentPortfolioValue: 50000, earmarkPct: 100, holdings: [{ symbol: 'X' }] } };

export async function register({ test, assert, assertEqual }) {

  // --- applyCashSavings -----------------------------------------------------
  await test('applyCashSavings sets savings.current and coerces to number', () => {
    const next = applyCashSavings(RAW, '3200');
    assertEqual(next.savings.current, 3200);
  });

  await test('applyCashSavings preserves other savings fields and the rest of finances', () => {
    const next = applyCashSavings(RAW, 3200);
    assertEqual(next.savings._note, 'keep me');
    assertEqual(next.savings.monthlyContribution, 1700);
    assertEqual(next.savings.monthlyAverage.net, 1721);
    assertEqual(next.goal.targetDeposit, 40000);
    assertEqual(next.income.annualGrossBase, 60000);
  });

  await test('applyCashSavings does not mutate the input', () => {
    const before = RAW.savings.current;
    applyCashSavings(RAW, 99999);
    assertEqual(RAW.savings.current, before);
  });

  await test('applyCashSavings handles a non-numeric value as 0', () => {
    assertEqual(applyCashSavings(RAW, 'abc').savings.current, 0);
  });

  await test('applyCashSavings tolerates a missing finances record', () => {
    assertEqual(applyCashSavings(null, 500).savings.current, 500);
  });

  // --- applyIsaValue --------------------------------------------------------
  await test('applyIsaValue sets currentPortfolioValue, preserving the rich blob', () => {
    const next = applyIsaValue(INV, '52000');
    assertEqual(next.trading212ISA.currentPortfolioValue, 52000);
    assertEqual(next.trading212ISA.earmarkPct, 100);
    assertEqual(next.trading212ISA.holdings[0].symbol, 'X');
  });

  await test('applyIsaValue can also update earmarkPct when provided', () => {
    const next = applyIsaValue(INV, 52000, 50);
    assertEqual(next.trading212ISA.earmarkPct, 50);
  });

  await test('applyIsaValue leaves earmarkPct untouched when omitted/blank', () => {
    assertEqual(applyIsaValue(INV, 52000, '').trading212ISA.earmarkPct, 100);
    assertEqual(applyIsaValue(INV, 52000).trading212ISA.earmarkPct, 100);
  });

  await test('applyIsaValue does not mutate the input', () => {
    applyIsaValue(INV, 1);
    assertEqual(INV.trading212ISA.currentPortfolioValue, 50000);
  });

  // --- hasIsa ---------------------------------------------------------------
  await test('hasIsa is true only when a trading212ISA record exists', () => {
    assert(hasIsa(INV) === true, 'expected hasIsa true for ISA record');
    assert(hasIsa(null) === false, 'expected hasIsa false for null');
    assert(hasIsa({}) === false, 'expected hasIsa false for empty investments');
  });

  // --- previewDepositTotal (single source of truth: computeDepositSavings) ---
  await test('previewDepositTotal = cash + fully-earmarked ISA', () => {
    // 2500 cash + 100% of 50000 ISA = 52500
    assertEqual(previewDepositTotal(RAW, INV), 52500);
  });

  await test('previewDepositTotal reflects an edited cash figure', () => {
    const edited = applyCashSavings(RAW, 4000);
    assertEqual(previewDepositTotal(edited, INV), 54000);
  });

  await test('previewDepositTotal reflects an edited ISA figure', () => {
    const edited = applyIsaValue(INV, 60000);
    assertEqual(previewDepositTotal(RAW, edited), 62500);
  });

  await test('previewDepositTotal honours a partial earmark', () => {
    const edited = applyIsaValue(INV, 50000, 50); // 50% of 50000 = 25000
    assertEqual(previewDepositTotal(RAW, edited), 27500);
  });

  await test('previewDepositTotal with no investments = cash only', () => {
    assertEqual(previewDepositTotal(RAW, null), 2500);
  });
}
