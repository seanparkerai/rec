// deposit-risk.test.js — verdict cases for assessDepositRisk().

import { assessDepositRisk } from '../assets/js/deposit-risk.js';

const LOW_RISK_INVESTMENTS = {
  trading212ISA: {
    currentPortfolioValue: 40000,
    earmarkPct: 40,
    strategyEpochs: [{ id: 'cashIsa', label: 'Cash ISA', start: '2024-01-01', end: null }],
  },
};

const MODERATE_INVESTMENTS = {
  trading212ISA: {
    currentPortfolioValue: 30000,
    earmarkPct: 100,
    strategyEpochs: [{ id: 'etfCore', label: 'ETF core', start: '2025-01-01', end: null }],
  },
};

const HIGH_RISK_INVESTMENTS = {
  trading212ISA: {
    currentPortfolioValue: 25000,
    earmarkPct: 100,
    strategyEpochs: [
      { id: 'stockpicker', label: 'Phase 1 (sample)', start: '2025-01-01', end: '2025-12-31' },
      { id: 'etfCore', label: 'Phase 2 — diversified ETF core (sample)', start: '2026-01-01', end: null },
    ],
  },
};

const GOALS_3_6MO = { timeline: { horizon: '3-6 months' }, deposit: { hopedFor: 50000 } };
const GOALS_6_12MO = { timeline: { horizon: '6-12 months' }, deposit: { hopedFor: 50000 } };
const GOALS_13MO = { timeline: { horizon: '13-18 months' }, deposit: { hopedFor: 50000 } };

export async function register({ test, assert, assertEqual }) {

  // --- Verdict cases -----------------------------------------------------------

  await test('deposit-risk: low-risk when timeline > 12 months', () => {
    const r = assessDepositRisk(MODERATE_INVESTMENTS, GOALS_13MO);
    assertEqual(r.verdict, 'low-risk', `got ${r.verdict}`);
    assertEqual(r.recommendation.urgency, 'low');
  });

  await test('deposit-risk: moderate-risk — 100% equity + 6-12 month timeline', () => {
    const r = assessDepositRisk(MODERATE_INVESTMENTS, GOALS_6_12MO);
    assertEqual(r.verdict, 'moderate-risk', `got ${r.verdict}`);
    assertEqual(r.recommendation.urgency, 'medium');
  });

  await test('deposit-risk: high-risk — 100% equity, 3-6mo timeline', () => {
    const r = assessDepositRisk(HIGH_RISK_INVESTMENTS, GOALS_3_6MO);
    assertEqual(r.verdict, 'high-risk', `got ${r.verdict}`);
    assertEqual(r.recommendation.urgency, 'high');
    assert(r.currentValue === 25000, `expected £25,000 current value, got ${r.currentValue}`);
  });

  // --- Scenario shape ----------------------------------------------------------

  await test('deposit-risk: scenarios include 5/10/15/20% drops', () => {
    const r = assessDepositRisk(HIGH_RISK_INVESTMENTS, GOALS_3_6MO);
    const pcts = r.scenarios.map((s) => s.pctDrop);
    assert(pcts.includes(5), 'missing 5% drop');
    assert(pcts.includes(10), 'missing 10% drop');
    assert(pcts.includes(20), 'missing 20% drop');
  });

  await test('deposit-risk: 10% drop on £25,000 → £22,500', () => {
    const r = assessDepositRisk(HIGH_RISK_INVESTMENTS, GOALS_3_6MO);
    const s10 = r.scenarios.find((s) => s.pctDrop === 10);
    assert(s10 != null, 'no 10% scenario');
    assertEqual(s10.newValue, 22500);
    assertEqual(s10.gapImpact, -2500);
  });
}
