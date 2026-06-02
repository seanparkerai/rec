// savings-series.test.js — buildSavingsSeries()

import { buildSavingsSeries } from '../assets/js/savings-series.js';

const STUB_HISTORY = {
  _status: 'awaiting Phase 3 import',
  monthlySummary: [],
  tickerExposure: {},
  realisedPnL: null,
};

const TWO_MONTH_HISTORY = {
  _status: 'imported',
  monthlySummary: [
    { month: '2025-06', deposits: 2000, withdrawals: 0, net: 2000, dividends: 0, interest: 0, realisedPnL: 0, epoch: 'stockpicker' },
    { month: '2025-07', deposits: 1000, withdrawals: 0, net: 1000, dividends: 0, interest: 0, realisedPnL: 0, epoch: 'stockpicker' },
  ],
  epochs: {
    stockpicker: { start: '2025-05-26', end: null, label: 'Stock picker' },
  },
};

const EPOCH_BOUNDARY_HISTORY = {
  _status: 'imported',
  monthlySummary: [
    { month: '2025-12', deposits: 1000, withdrawals: 0, net: 1000, dividends: 0, interest: 0, realisedPnL: 0, epoch: 'stockpicker' },
    { month: '2026-01', deposits: 1000, withdrawals: 0, net: 1000, dividends: 0, interest: 0, realisedPnL: 0, epoch: 'etfCore' },
  ],
  epochs: {
    stockpicker: { start: '2025-05-26', end: '2026-01-01', label: 'Stock picker' },
    etfCore:     { start: '2026-01-02', end: null,         label: 'ETF core' },
  },
};

export async function register({ test, assert, assertEqual, fixtures }) {
  const { finances } = fixtures;

  await test('savings-series: stub history returns isStub=true and empty arrays', () => {
    const r = buildSavingsSeries({ history: STUB_HISTORY, finances, goal: 40000 });
    assert(r.isStub === true, 'expected isStub true');
    assertEqual(r.points.length, 0);
    assertEqual(r.baselineProjection.length, 0);
    assertEqual(r.annotations.length, 0);
    assertEqual(r.targetLine.target, 40000);
    assertEqual(r.targetLine.etaMonth, null);
  });

  await test('savings-series: two-month history → cumulatives 2000 then 3000', () => {
    const r = buildSavingsSeries({ history: TWO_MONTH_HISTORY, finances, goal: 40000 });
    assertEqual(r.isStub, false);
    assertEqual(r.points.length, 2);
    assertEqual(r.points[0].cumulative, 2000);
    assertEqual(r.points[1].cumulative, 3000);
    assertEqual(r.points[0].delta, 2000);
    assertEqual(r.points[1].delta, 1000);
  });

  await test('savings-series: epoch boundary surfaces as an annotation', () => {
    const r = buildSavingsSeries({ history: EPOCH_BOUNDARY_HISTORY, finances, goal: 40000 });
    // Two epochs → two annotations (one per epoch start).
    assertEqual(r.annotations.length, 2);
    const labels = r.annotations.map((a) => a.label);
    assert(labels.includes('ETF core'), `missing ETF core annotation; got ${labels.join(', ')}`);
  });
}
