// characterization-finances.test.js — pins the computation output that
// page-finances.js renders. Regression baseline for Phase 4 refactoring.
// No DOM access — pure modules only. Assertions are structural / consistency
// checks against the (synthetic) fixtures — not hard-coded personal figures.

import { getMoneyFlow, getMoneyFlowPostMove } from '../../assets/js/money-flow.js';
import { buildSavingsSeries } from '../../assets/js/savings-series.js';
import { deriveFinances } from '../../assets/js/finance-derive.js';
import { gbp } from '../../assets/js/format.js';

export async function register({ test, assert, assertEqual, fixtures }) {
  const { finances, rawFinances, criteria, investments } = fixtures;

  // ── Money flow (Now) ────────────────────────────────────────────────────────
  await test('characterization/finances money-flow-now: buckets are Bills/Expenses/Savings/Spare', () => {
    const flow = getMoneyFlow(finances, criteria);
    const kinds = flow.buckets.map(b => b.kind);
    assert(kinds.includes('bills'),    'missing bills bucket');
    assert(kinds.includes('expenses'), 'missing expenses bucket');
    assert(kinds.includes('savings'),  'missing savings bucket');
    assert(kinds.includes('spare'),    'missing spare bucket');
  });

  await test('characterization/finances money-flow-now: income.takeHome matches the fixture take-home', () => {
    const flow = getMoneyFlow(finances, criteria);
    assertEqual(flow.income.takeHome, finances.income.takeHomeMonthly);
  });

  await test('characterization/finances money-flow-now: total equals income.total', () => {
    const flow = getMoneyFlow(finances, criteria);
    assertEqual(flow.total, flow.income.total,
      `total ${flow.total} !== income.total ${flow.income.total}`);
  });

  // ── Money flow (Later — post-move) ──────────────────────────────────────────
  await test('characterization/finances money-flow-later: returns object without throwing', () => {
    const flow = getMoneyFlowPostMove(finances, criteria);
    assert(flow !== null && typeof flow === 'object',
      `expected object from getMoneyFlowPostMove, got ${typeof flow}`);
  });

  await test('characterization/finances money-flow-later: has buckets array', () => {
    const flow = getMoneyFlowPostMove(finances, criteria);
    assert(Array.isArray(flow.buckets), 'expected buckets array');
  });

  // ── Finance derivation ──────────────────────────────────────────────────────
  await test('characterization/finances derive: income.takeHomeMonthly survives re-derive', () => {
    const rederived = deriveFinances(rawFinances, { investments });
    assertEqual(rederived.income?.takeHomeMonthly, rawFinances.income?.monthlyNetTakeHome);
  });

  await test('characterization/finances derive: goal.targetDeposit survives re-derive', () => {
    const rederived = deriveFinances(rawFinances, { investments });
    assertEqual(rederived.goal?.targetDeposit, rawFinances.goal?.targetDeposit);
  });

  await test('characterization/finances derive: ongoingBills total is positive', () => {
    const rederived = deriveFinances(rawFinances, { investments });
    const flow = getMoneyFlow(rederived, criteria);
    const bills = flow.buckets.find(b => b.kind === 'bills');
    assert(bills && bills.amount > 0, `expected positive bills amount, got ${bills?.amount}`);
  });

  // ── Savings series ──────────────────────────────────────────────────────────
  await test('characterization/finances savings-series: returns object without throwing', () => {
    const series = buildSavingsSeries(finances, criteria);
    assert(series !== null && typeof series === 'object',
      `expected object from buildSavingsSeries, got ${typeof series}`);
  });

  await test('characterization/finances savings-series: has points property', () => {
    const series = buildSavingsSeries(finances, criteria);
    assert('points' in series || 'isStub' in series,
      `expected points or isStub field, got keys: ${Object.keys(series).join(', ')}`);
  });

  // ── Format helpers ──────────────────────────────────────────────────────────
  await test('characterization/finances format: gbp(1234.56) rounds to £1,235', () => {
    assertEqual(gbp(1234.56), '£1,235');
  });

  await test('characterization/finances format: gbp(1500) is £1,500', () => {
    assertEqual(gbp(1500), '£1,500');
  });
}
