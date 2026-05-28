// characterization-home.test.js — pins the computation output that page-home.js
// renders into the dashboard tiles. Provides a regression baseline for Phase 3+
// refactoring. No DOM access — uses pure modules only.
//
// Strategy: run the full computation chain with real fixture data; assert the
// formatted values that would be written to the DOM. If a refactor accidentally
// changes a computation path, these fail first.

import { assessAffordability } from '../assets/js/affordability.js';
import { getMoneyFlow } from '../assets/js/money-flow.js';
import { assessDepositRisk } from '../assets/js/deposit-risk.js';
import { assessAffordabilityScenarios } from '../assets/js/affordability.js';
import { gbp, pct, monthsAsDuration } from '../assets/js/format.js';

export async function register({ test, assert, assertEqual, fixtures }) {
  const { finances, criteria } = fixtures;

  // ── Tile: Lede ──────────────────────────────────────────────────────────────
  await test('characterization/home lede: budget offerTarget formats to £380,000', () => {
    assertEqual(gbp(criteria.budget.offerTarget), '£380,000');
  });

  await test('characterization/home lede: budget max formats to £400,000', () => {
    assertEqual(gbp(criteria.budget.max), '£400,000');
  });

  await test('characterization/home lede: deposit goal target is numeric', () => {
    assert(typeof finances.goal?.targetDeposit === 'number',
      `expected goal.targetDeposit to be a number, got ${typeof finances.goal?.targetDeposit}`);
  });

  await test('characterization/home lede: take-home monthly is 3623.52', () => {
    assertEqual(finances.income?.takeHomeMonthly, 3623.52);
  });

  // ── Tile: Affordability ─────────────────────────────────────────────────────
  await test('characterization/home affordability: £380k is tight on default finances', () => {
    const r = assessAffordability({ price: 380_000, finances, criteria });
    assertEqual(r.verdict, 'tight', `got "${r.verdict}"`);
  });

  await test('characterization/home affordability: £300k is comfortable', () => {
    const r = assessAffordability({ price: 300_000, finances, criteria });
    assertEqual(r.verdict, 'comfortable', `got "${r.verdict}"`);
  });

  await test('characterization/home affordability: £450k is out-of-reach', () => {
    const r = assessAffordability({ price: 450_000, finances, criteria });
    assert(
      r.verdict === 'out-of-reach' || r.verdict === 'tight',
      `expected out-of-reach or tight at £450k, got "${r.verdict}"`
    );
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

  await test('characterization/home money-flow: Bills bucket is 612.50', () => {
    const flow = getMoneyFlow(finances, criteria);
    const bills = flow.buckets.find(b => b.kind === 'bills');
    assert(bills, 'bills bucket not found');
    assertEqual(bills.amount, 612.5, `expected 612.5, got ${bills.amount}`);
  });

  await test('characterization/home money-flow: Expenses bucket is 1120', () => {
    const flow = getMoneyFlow(finances, criteria);
    const exp = flow.buckets.find(b => b.kind === 'expenses');
    assert(exp, 'expenses bucket not found');
    assertEqual(exp.amount, 1120, `expected 1120, got ${exp.amount}`);
  });

  await test('characterization/home money-flow: Savings bucket is 2000', () => {
    const flow = getMoneyFlow(finances, criteria);
    const sav = flow.buckets.find(b => b.kind === 'savings');
    assert(sav, 'savings bucket not found');
    assertEqual(sav.amount, 2000, `expected 2000, got ${sav.amount}`);
  });

  await test('characterization/home money-flow: spare is -108.98', () => {
    const flow = getMoneyFlow(finances, criteria);
    assertEqual(flow.spare, -108.98, `expected -108.98, got ${flow.spare}`);
  });

  await test('characterization/home money-flow: income total is 3623.52', () => {
    const flow = getMoneyFlow(finances, criteria);
    assertEqual(flow.income.total, 3623.52, `expected 3623.52, got ${flow.income.total}`);
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

  await test('characterization/home format: gbp(40000) is £40,000', () => {
    assertEqual(gbp(40_000), '£40,000');
  });

  await test('characterization/home format: gbp(380000) is £380,000', () => {
    assertEqual(gbp(380_000), '£380,000');
  });

  await test('characterization/home format: monthsAsDuration(12) contains year', () => {
    const d = monthsAsDuration(12);
    assert(typeof d === 'string' && d.length > 0, `expected non-empty string, got ${JSON.stringify(d)}`);
  });
}
