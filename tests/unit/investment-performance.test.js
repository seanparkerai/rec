// investment-performance.test.js — analysePerformance() + getVelocityFromHistory()

import { analysePerformance, getMonthlyCumulativeDeposits, getEpochAttribution, buildGainsCurve } from '../../assets/js/investment-performance.js';
import { getVelocityFromHistory } from '../../assets/js/savings-velocity.js';

// Stub history — should return zeros gracefully.
const STUB_HISTORY = {
  _status: 'awaiting Phase 3 import',
  monthlySummary: [],
  tickerExposure: {},
  realisedPnL: null,
};

// Synthetic history — hand-computed values.
const SYNTHETIC_HISTORY = {
  _status: 'imported',
  source: 'test',
  importedAt: '2026-05-26T00:00:00Z',
  dateRange: { from: '2025-06-01', to: '2025-10-31' },
  summary: {
    totalDeposited: 14000,
    totalWithdrawn: 0,
    netContributed: 14000,
    totalDividends: 280,
    totalInterest: 42,
    realisedPnL: 0,
    currentValueDeclared: 15200,
    impliedGainUnrealised: 878,
  },
  monthlySummary: [
    { month: '2025-06', deposits: 2000, withdrawals: 0, net: 2000, dividends: 0,  interest: 0,  realisedPnL: 0, epoch: 'stockpicker' },
    { month: '2025-07', deposits: 3000, withdrawals: 0, net: 3000, dividends: 40, interest: 10, realisedPnL: 0, epoch: 'stockpicker' },
    { month: '2025-08', deposits: 3000, withdrawals: 0, net: 3000, dividends: 80, interest: 12, realisedPnL: 0, epoch: 'stockpicker' },
    { month: '2025-09', deposits: 3000, withdrawals: 0, net: 3000, dividends: 80, interest: 10, realisedPnL: 0, epoch: 'stockpicker' },
    { month: '2025-10', deposits: 3000, withdrawals: 0, net: 3000, dividends: 80, interest: 10, realisedPnL: 0, epoch: 'stockpicker' },
  ],
  epochs: {
    stockpicker: { start: '2025-05-26', end: '2026-01-01', totalContributedDuring: 14000, tickersHeld: ['BATS', 'LLOY', 'VOD'] },
    etfCore:     { start: '2026-01-02', end: null,         totalContributedDuring: 0,     tickersHeld: [] },
  },
};

export async function register({ test, assert, assertEqual }) {

  // --- Stub graceful handling --------------------------------------------------

  await test('investment-performance: stub returns isStub=true + zero values', () => {
    const r = analysePerformance(STUB_HISTORY);
    assert(r.isStub === true, 'expected isStub true');
    assertEqual(r.totalDeposited, 0);
    assertEqual(r.currentValue, 0);
    assertEqual(r.totalReturnPct, null);
  });

  // --- Synthetic history -------------------------------------------------------

  await test('investment-performance: totalDeposited = 14,000', () => {
    assertEqual(analysePerformance(SYNTHETIC_HISTORY).totalDeposited, 14000);
  });

  await test('investment-performance: dividendsReceived = 280', () => {
    assertEqual(analysePerformance(SYNTHETIC_HISTORY).dividendsReceived, 280);
  });

  await test('investment-performance: interestEarned = 42', () => {
    assertEqual(analysePerformance(SYNTHETIC_HISTORY).interestEarned, 42);
  });

  await test('investment-performance: currentValue = 15,200', () => {
    assertEqual(analysePerformance(SYNTHETIC_HISTORY).currentValue, 15200);
  });

  await test('investment-performance: totalReturnPct = 8.57%  (878/14000×100 rounded 2dp)', () => {
    // (15200 - 14000) / 14000 * 100 = 1200/14000*100 = 8.57
    const r = analysePerformance(SYNTHETIC_HISTORY);
    assertEqual(r.totalReturnPct, 8.57);
  });

  await test('investment-performance: epochs contains stockpicker + etfCore', () => {
    const r = analysePerformance(SYNTHETIC_HISTORY);
    const ids = r.epochs.map((e) => e.id);
    assert(ids.includes('stockpicker'), 'missing stockpicker epoch');
    assert(ids.includes('etfCore'), 'missing etfCore epoch');
  });

  await test('investment-performance: stockpicker epoch contributedDuringEpoch = 14,000', () => {
    const r = analysePerformance(SYNTHETIC_HISTORY);
    const sp = r.epochs.find((e) => e.id === 'stockpicker');
    assertEqual(sp.contributedDuringEpoch, 14000);
  });

  // --- Velocity from history ---------------------------------------------------

  await test('velocity-from-history: stub returns null avgMonthlyContribution', () => {
    const r = getVelocityFromHistory(STUB_HISTORY);
    assertEqual(r.avgMonthlyContribution, null);
    assert(r.projections.length === 0, 'expected empty projections for stub');
  });

  await test('velocity-from-history: 3-month window avg = £3,000 (last 3 months of synthetic)', () => {
    // Last 3 months: 2025-10 (net=3000), 2025-09 (net=3000), 2025-08 (net=3000) → avg = 3000
    const r = getVelocityFromHistory(SYNTHETIC_HISTORY, 3, 15200, 50000);
    assertEqual(r.avgMonthlyContribution, 3000);
  });

  await test('velocity-from-history: projections cover 1/3/6/12 month horizons', () => {
    const r = getVelocityFromHistory(SYNTHETIC_HISTORY, 3, 15200, 50000);
    const horizons = r.projections.map((p) => p.horizonMonths);
    assert(horizons.includes(1), 'missing 1mo horizon');
    assert(horizons.includes(12), 'missing 12mo horizon');
  });

  // --- Monthly cumulative deposits --------------------------------------------

  await test('getMonthlyCumulativeDeposits: stub history returns []', () => {
    assertEqual(getMonthlyCumulativeDeposits(STUB_HISTORY).length, 0);
  });

  await test('getMonthlyCumulativeDeposits: running sum across synthetic history', () => {
    const r = getMonthlyCumulativeDeposits(SYNTHETIC_HISTORY);
    assertEqual(r.length, 5);
    assertEqual(r[0].cumulative, 2000);   // 2000
    assertEqual(r[1].cumulative, 5000);   // 2000 + 3000
    assertEqual(r[4].cumulative, 14000);  // 2 + 3 + 3 + 3 + 3 = 14k
  });

  // --- Epoch attribution -------------------------------------------------------

  await test('getEpochAttribution: stub returns []', () => {
    assertEqual(getEpochAttribution(STUB_HISTORY).length, 0);
  });

  await test('getEpochAttribution: two-epoch decomposition (stockpicker contributed £14k)', () => {
    const r = getEpochAttribution(SYNTHETIC_HISTORY);
    const sp = r.find((e) => e.id === 'stockpicker');
    const etf = r.find((e) => e.id === 'etfCore');
    assert(sp, 'missing stockpicker');
    assert(etf, 'missing etfCore');
    assertEqual(sp.contributedDuringEpoch, 14000);
    assertEqual(etf.contributedDuringEpoch, 0);
    assertEqual(sp.monthsHeld, 5);
    assert(sp.returnPct !== null, 'expected stockpicker returnPct estimate');
  });

  // --- Gains curve -------------------------------------------------------------

  await test('buildGainsCurve: empty / zero-gain inputs stay safe', () => {
    assertEqual(buildGainsCurve([], 500).length, 0);
    assertEqual(buildGainsCurve(null, 500).length, 0);
    assertEqual(JSON.stringify(buildGainsCurve(SYNTHETIC_HISTORY.monthlySummary, 0)), '[0,0,0,0,0]');
  });

  await test('buildGainsCurve: ends exactly at the total so the stack reconciles', () => {
    const curve = buildGainsCurve(SYNTHETIC_HISTORY.monthlySummary, 878);
    assertEqual(curve.length, 5);
    assertEqual(curve[curve.length - 1], 878);
  });

  await test('buildGainsCurve: monotonically increasing', () => {
    const curve = buildGainsCurve(SYNTHETIC_HISTORY.monthlySummary, 878);
    for (let i = 1; i < curve.length; i++) {
      assert(curve[i] >= curve[i - 1], `curve dipped at ${i}: ${curve[i - 1]} → ${curve[i]}`);
    }
  });

  await test('buildGainsCurve: back-loads gains toward the months holding the capital', () => {
    // The regression this guards: a flat spread credited 1/5th of all growth to
    // month 1, when month 1 held £2,000 of a pot that ended at £14,000.
    const curve = buildGainsCurve(SYNTHETIC_HISTORY.monthlySummary, 1000);
    const flatFirst = 1000 / 5;
    assert(curve[0] < flatFirst, `first month should carry less than a flat 1/5 (${curve[0]} vs ${flatFirst})`);
    // Capital at risk runs 2000, 5050, 8142, 11232, 14322; cumulated as weights
    // that is 2000 … 40746, so month 1 carries 2000/40746 of the total.
    assertEqual(curve[0], 49.08);
  });

  await test('buildGainsCurve: sorts by month rather than trusting input order', () => {
    const shuffled = [...SYNTHETIC_HISTORY.monthlySummary].reverse();
    assertEqual(JSON.stringify(buildGainsCurve(shuffled, 878)),
      JSON.stringify(buildGainsCurve(SYNTHETIC_HISTORY.monthlySummary, 878)));
  });

  await test('buildGainsCurve: an all-negative account falls back to a flat spread', () => {
    const draining = [
      { month: '2025-06', net: -100, dividends: 0, interest: 0, realisedPnL: 0 },
      { month: '2025-07', net: -100, dividends: 0, interest: 0, realisedPnL: 0 },
    ];
    assertEqual(JSON.stringify(buildGainsCurve(draining, 50)), '[25,50]');
  });
}
