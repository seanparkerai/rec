// savings-average.js — live trailing savings-rate average from investments_history.
// Pure module. No DOM, no storage, no fetch.
//
// Replaces the drift-prone stored snapshot (finances.savings.monthlyAverage) as
// the DISPLAY source for "avg /mo": computed on demand from the real monthly
// history rows so it always reflects the latest data — add a month and the
// average moves on the next render, no manual recompute. Complete months only:
// the still-filling current month is excluded so it never drags the average
// down mid-month.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Trailing monthly savings average over the most recent COMPLETE months.
 *
 * @param {object} history  investments history ({ monthlySummary:[{month,deposits,withdrawals,net,...}] }).
 * @param {object} [opts]
 * @param {number} [opts.windowMonths=12]  how many trailing complete months to average.
 * @param {Date}   [opts.now]              base date (defaults to today) — sets the current partial month.
 * @returns {null | {
 *   net:number, gross:number, monthsCounted:number,
 *   windowStart:string, windowEnd:string,
 *   grossDepositsTotal:number, withdrawalsTotal:number, netContributionsTotal:number
 * }} null when there is no usable history.
 */
export function trailingMonthlyAverage(history, { windowMonths = 12, now = new Date() } = {}) {
  const monthly = history?.monthlySummary;
  if (!Array.isArray(monthly) || monthly.length === 0) return null;

  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const withMonth = monthly.filter((m) => typeof m.month === 'string' && m.month.length >= 7);
  if (withMonth.length === 0) return null;

  // Prefer complete months; if every row is the current month, fall back to all
  // rows so a brand-new account still shows something rather than nothing.
  const complete = withMonth.filter((m) => m.month < thisMonth);
  const src = complete.length > 0 ? complete : withMonth;
  const sorted = [...src].sort((a, b) => a.month.localeCompare(b.month));
  const window = sorted.slice(-Math.max(1, windowMonths));
  const n = window.length;
  if (n === 0) return null;

  const grossDeposits = window.reduce((s, m) => s + num(m.deposits), 0);
  const withdrawals = window.reduce((s, m) => s + num(m.withdrawals), 0);
  const net = window.reduce((s, m) => s + num(m.net), 0);

  return {
    net: round2(net / n),
    gross: round2(grossDeposits / n),
    monthsCounted: n,
    windowStart: window[0].month,
    windowEnd: window[n - 1].month,
    grossDepositsTotal: round2(grossDeposits),
    withdrawalsTotal: round2(withdrawals),
    netContributionsTotal: round2(net),
  };
}
