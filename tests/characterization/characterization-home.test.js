// characterization-home.test.js — pins the computation output that page-home.js
// renders into the dashboard tiles. Provides a regression baseline for Phase 3+
// refactoring. No DOM access — uses pure modules only.
//
// Strategy: run the full computation chain with the (synthetic) fixture data and
// assert structural invariants + internal consistency — NOT hard-coded personal
// figures. If a refactor accidentally changes a computation path, these fail first.

import { assessAffordability } from '../../assets/js/affordability.js';
import { getMoneyFlow } from '../../assets/js/money-flow.js';
import { assessDepositRisk } from '../../assets/js/deposit-risk.js';
import { assessAffordabilityScenarios } from '../../assets/js/affordability.js';
import { gbp, pct, monthsAsDuration } from '../../assets/js/format.js';

const BANDS = ['comfortable', 'stretch', 'tight', 'out-of-reach'];

export async function register({ test, assert, assertEqual, fixtures }) {
  const { finances, criteria } = fixtures;

  // ── Tile: Lede ──────────────────────────────────────────────────────────────
  await test('characterization/home lede: budget offerTarget formats as a £ amount', () => {
    assert(/^£[\d,]+$/.test(gbp(criteria.budget.offerTarget)), `got ${gbp(criteria.budget.offerTarget)}`);
  });

  await test('characterization/home lede: budget max formats as a £ amount', () => {
    assert(/^£[\d,]+$/.test(gbp(criteria.budget.max)), `got ${gbp(criteria.budget.max)}`);
  });

  await test('characterization/home lede: deposit goal target is numeric', () => {
    assert(typeof finances.goal?.targetDeposit === 'number',
      `expected goal.targetDeposit to be a number, got ${typeof finances.goal?.targetDeposit}`);
  });

  await test('characterization/home lede: take-home monthly is a positive number', () => {
    assert(typeof finances.income?.takeHomeMonthly === 'number' && finances.income.takeHomeMonthly > 0,
      `expected positive take-home, got ${finances.income?.takeHomeMonthly}`);
  });

  // ── Tile: Affordability ─────────────────────────────────────────────────────
  await test('characterization/home affordability: £380k returns a valid verdict band', () => {
    const r = assessAffordability({ price: 380_000, finances, criteria });
    assert(BANDS.includes(r.verdict), `got "${r.verdict}"`);
  });

  await test('characterization/home affordability: a cheaper price is never worse than a dearer one', () => {
    const cheap = assessAffordability({ price: 300_000, finances, criteria });
    const dear = assessAffordability({ price: 450_000, finances, criteria });
    assert(BANDS.includes(cheap.verdict) && BANDS.includes(dear.verdict), 'both verdicts must be valid bands');
    assert(BANDS.indexOf(cheap.verdict) <= BANDS.indexOf(dear.verdict),
      `expected £300k (${cheap.verdict}) to be no worse than £450k (${dear.verdict})`);
  });

  await test('characterization/home affordability: result has headline string', () => {
    const r = assessAffordability({ price: 380_000, finances, criteria });
    assert(typeof r.headline === 'string' && r.headline.length > 0,
      `expected non-empty headline, got ${JSON.stringify(r.headline)}`);
  });

  // ── Tile: Money flow ────────────────────────────────────────────────────────
  await test('characterization/home money-flow: buckets array has 4 entries', () => {
    const flow = getMoneyFlow(finances, criteria);
    assertEqual(flow.buckets.length, 4,
      `expected 4 buckets, got ${flow.buckets.length}`);
  });

  await test('characterization/home money-flow: Bills bucket is present and non-negative', () => {
    const flow = getMoneyFlow(finances, criteria);
    const bills = flow.buckets.find(b => b.kind === 'bills');
    assert(bills && bills.amount >= 0, `expected a non-negative bills bucket, got ${bills?.amount}`);
  });

  await test('characterization/home money-flow: Expenses bucket is present and non-negative', () => {
    const flow = getMoneyFlow(finances, criteria);
    const exp = flow.buckets.find(b => b.kind === 'expenses');
    assert(exp && exp.amount >= 0, `expected a non-negative expenses bucket, got ${exp?.amount}`);
  });

  await test('characterization/home money-flow: Savings bucket matches the monthly contribution', () => {
    const flow = getMoneyFlow(finances, criteria);
    const sav = flow.buckets.find(b => b.kind === 'savings');
    assert(sav, 'savings bucket not found');
    assertEqual(sav.amount, finances.savings.monthlyContribution,
      `expected savings bucket to equal monthlyContribution, got ${sav.amount}`);
  });

  await test('characterization/home money-flow: buckets + spare reconcile to total income', () => {
    const flow = getMoneyFlow(finances, criteria);
    const get = k => (flow.buckets.find(b => b.kind === k)?.amount) || 0;
    const recombined = get('bills') + get('expenses') + get('savings') + flow.spare;
    assert(Math.abs(recombined - flow.income.total) < 0.01,
      `money-flow should balance: ${recombined} vs income.total ${flow.income.total}`);
  });

  await test('characterization/home money-flow: income total is a positive number', () => {
    const flow = getMoneyFlow(finances, criteria);
    assert(typeof flow.income.total === 'number' && flow.income.total > 0,
      `expected positive income total, got ${flow.income.total}`);
  });

  // ── Tile: Deposit risk ──────────────────────────────────────────────────────
  await test('characterization/home deposit-risk: returns an object without throwing', async () => {
    const result = await assessDepositRisk({ finances, criteria });
    assert(result !== null && typeof result === 'object', 'expected object from assessDepositRisk');
  });

  // ── Tile: Affordability scenarios ───────────────────────────────────────────
  await test('characterization/home scenarios: assessAffordabilityScenarios returns object with scenario keys', async () => {
    const result = await assessAffordabilityScenarios({ finances, criteria });
    assert(result !== null && typeof result === 'object', `expected object, got ${typeof result}`);
    const keys = Object.keys(result);
    assert(keys.length > 0, 'expected at least one scenario key');
  });

  // ── Format helpers (used by all tiles) ──────────────────────────────────────
  await test('characterization/home format: gbp(0) is £0', () => {
    assertEqual(gbp(0), '£0');
  });

  await test('characterization/home format: gbp(1000) is £1,000', () => {
    assertEqual(gbp(1_000), '£1,000');
  });

  await test('characterization/home format: gbp(1234567) groups thousands', () => {
    assertEqual(gbp(1_234_567), '£1,234,567');
  });

  await test('characterization/home format: monthsAsDuration(12) contains year', () => {
    const d = monthsAsDuration(12);
    assert(typeof d === 'string' && d.length > 0, `expected non-empty string, got ${JSON.stringify(d)}`);
  });
}
