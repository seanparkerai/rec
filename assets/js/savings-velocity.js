// savings-velocity.js — scenario-based ETA to the deposit goal.
// Pure module — composes projectSavings + calcMonthsToTarget from finances.js.

import { projectSavings, calcMonthsToTarget } from './finances.js';
import { dateFromMonths } from './format.js';

/** LISA scheme purchase-price cap (statutory). */
const LISA_CAP_GBP = 450_000;

/** Default scenario set. Each scenario adjusts deltaMonthly OR adds a one-off lumpSum. */
const DEFAULT_SCENARIOS = [
  { label: '−£500/mo',        deltaMonthly: -500 },
  { label: '−£200/mo',        deltaMonthly: -200 },
  { label: '−£100/mo',        deltaMonthly: -100 },
  { label: '+£100/mo',        deltaMonthly:  100 },
  { label: '+£200/mo',        deltaMonthly:  200 },
  { label: '+£500/mo',        deltaMonthly:  500 },
  { label: '+£5k windfall',   lumpSum:  5000 },
  { label: '+£10k windfall',  lumpSum: 10000 },
  { label: 'target +£20k',    targetDelta: 20000 },
];

/**
 * Projected savings ETA at the current pace + a set of "what if" scenarios.
 *
 * @param {object} finances                contents of data/finances.json
 * @param {Array<object>} [scenarios]      override the default scenario set
 * @param {Date} [now]                     base date for ETA projection (defaults to today)
 * @returns {{
 *   baseline: { etaMonths:number, etaDate:Date|null, projection:Array<{month:number,balance:number}> },
 *   scenarios: Array<{
 *     label:string, etaMonths:number, etaDate:Date|null,
 *     deltaMonths:number, projection:Array<{month:number,balance:number}>
 *   }>,
 *   cliffs: { lisaMax:number }
 * }}
 */
export function getSavingsVelocity(finances, scenarios = DEFAULT_SCENARIOS, now = new Date()) {
  const startingBalance = num(finances?.savings?.totalSavings ?? finances?.savings?.current);
  const monthlyContribution = num(finances?.savings?.monthlyContribution);
  const target = num(finances?.goal?.targetDeposit);

  const baselineEta = calcMonthsToTarget(startingBalance, target, monthlyContribution);
  const baselineProjection = safeProjection(startingBalance, monthlyContribution, baselineEta);
  const baseline = {
    etaMonths: baselineEta,
    etaDate: monthsToDate(baselineEta, now),
    projection: baselineProjection,
  };

  const out = scenarios.map((s) => {
    const start = num(startingBalance) + num(s.lumpSum);
    const monthly = num(monthlyContribution) + num(s.deltaMonthly);
    const adjustedTarget = num(target) + num(s.targetDelta);
    const eta = calcMonthsToTarget(start, adjustedTarget, monthly);
    return {
      label: s.label,
      etaMonths: eta,
      etaDate: monthsToDate(eta, now),
      deltaMonths: Number.isFinite(eta) && Number.isFinite(baselineEta)
        ? Math.round((baselineEta - eta) * 10) / 10
        : null,
      projection: safeProjection(start, monthly, eta),
    };
  });

  return {
    baseline,
    scenarios: out,
    cliffs: { lisaMax: LISA_CAP_GBP },
  };
}

function safeProjection(start, monthly, etaMonths) {
  if (!Number.isFinite(etaMonths) || etaMonths <= 0) {
    return projectSavings(start, monthly, 0);
  }
  // Cap projection at 240 months (20y) to keep return shape bounded.
  const months = Math.min(240, Math.ceil(etaMonths));
  return projectSavings(start, monthly, months);
}

function monthsToDate(etaMonths, from) {
  if (!Number.isFinite(etaMonths)) return null;
  return dateFromMonths(etaMonths, from);
}

/**
 * Velocity derived from a real contribution history (Phase 3 import data).
 * Falls back gracefully if history is empty or the stub placeholder.
 *
 * @param {object} historyJson    contents of data/imports/trading212-history.json
 * @param {number} [windowMonths] rolling average window in months (default 3)
 * @param {number} [currentValue] current portfolio value to project from
 * @param {number} [targetDeposit] target to hit
 * @param {Date}   [now]          base date for projections
 * @returns {{
 *   windowMonths: number,
 *   avgMonthlyContribution: number | null,
 *   avgGrowthRate: number | null,
 *   projections: Array<{ horizonMonths: number, projectedValue: number }>
 * }}
 */
export function getVelocityFromHistory(historyJson, windowMonths = 3, currentValue = 0, targetDeposit = 0, now = new Date()) {
  const monthly = historyJson?.monthlySummary ?? [];
  if (monthly.length === 0 || historyJson?._status === 'awaiting Phase 3 import') {
    return { windowMonths, avgMonthlyContribution: null, avgGrowthRate: null, projections: [] };
  }

  // Sort descending by month string (YYYY-MM sorts correctly lexicographically).
  const sorted = [...monthly].sort((a, b) => b.month.localeCompare(a.month));
  const window = sorted.slice(0, windowMonths);

  const totalNet = window.reduce((s, m) => s + num(m.net), 0);
  const avgMonthlyContribution = window.length > 0 ? totalNet / window.length : null;

  // Growth rate: average of (dividends + realisedPnL) / deposits per month.
  const growthRates = window
    .filter((m) => num(m.deposits) > 0)
    .map((m) => (num(m.dividends) + num(m.realisedPnL)) / num(m.deposits));
  const avgGrowthRate = growthRates.length > 0
    ? growthRates.reduce((s, r) => s + r, 0) / growthRates.length
    : null;

  const horizons = [1, 3, 6, 12];
  const projections = horizons.map((h) => {
    const added = avgMonthlyContribution != null ? avgMonthlyContribution * h : 0;
    const growth = avgGrowthRate != null ? currentValue * (avgGrowthRate / 12) * h : 0;
    return { horizonMonths: h, projectedValue: Math.round(currentValue + added + growth) };
  });

  return { windowMonths, avgMonthlyContribution, avgGrowthRate, projections };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
