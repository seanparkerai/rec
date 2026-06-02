// money-flow.test.js — pre/post move money-flow shape + sums.
// Registered into tests/tests.html.

import { getMoneyFlow, getMoneyFlowPostMove } from '../assets/js/money-flow.js';

export async function register({ test, assert, assertEqual, fixtures }) {
  const { finances } = fixtures;

  await test('money-flow: pre-move buckets sum to total monthly income', () => {
    const f = getMoneyFlow(finances);
    const sum = f.buckets.reduce((s, b) => s + b.amount, 0);
    // 2dp tolerance for floating-point.
    assert(
      Math.abs(sum - f.income.total) < 0.01,
      `buckets ${sum} ≠ income.total ${f.income.total}`,
    );
  });

  await test('money-flow: pre-move includes Bills, Expenses, Savings, Spare', () => {
    const f = getMoneyFlow(finances);
    const names = f.buckets.map((b) => b.name);
    for (const n of ['Bills', 'Expenses', 'Savings', 'Spare']) {
      assert(names.includes(n), `missing bucket: ${n}; got ${names.join(', ')}`);
    }
  });

  await test('money-flow: post-move spare = total − bills − expenses − mortgage', () => {
    const mortgage = 1900;
    const f = getMoneyFlowPostMove(finances, mortgage);
    const bills = Number(finances.ongoingBillsTotal.monthly);
    const expenses = Number(finances.expensesTotal.monthly);
    const total = Number(finances.income.totalMonthly);
    const expected = Math.round((total - bills - expenses - mortgage) * 100) / 100;
    assertEqual(f.spare, expected);
  });

  await test('money-flow: post-move replaces Savings with Mortgage', () => {
    const f = getMoneyFlowPostMove(finances, 1900);
    const names = f.buckets.map((b) => b.name);
    assert(names.includes('Mortgage'), `expected Mortgage bucket; got ${names.join(', ')}`);
    assert(!names.includes('Savings'), `post-move flow must not include Savings; got ${names.join(', ')}`);
  });

  await test('money-flow: post-move spare matches finances.spare.monthly at the estimated mortgage', () => {
    const mortgage = Number(finances.mortgage.estimatedMonthlyPayment);
    const f = getMoneyFlowPostMove(finances, mortgage);
    assertEqual(f.spare, Number(finances.spare.monthly));
  });
}
