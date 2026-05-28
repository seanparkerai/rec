// savings-series.js — build the canonical savings-over-time series for the dashboard
// sparkline and the finances page line chart. Pure module — no DOM, no storage, no fetch.
//
// Combines monthly net deposits from data/imports/trading212-history.json (cumulative
// running sum, anchored to accountOpened) with the engine baseline projection from
// savings-velocity.getSavingsVelocity(). Stub-safe: returns { isStub: true } when the
// import has not been run.

import { getSavingsVelocity } from './savings-velocity.js';

/**
 * @param {object} args
 * @param {object} args.history       contents of data/imports/trading212-history.json
 * @param {object} args.finances      finances payload (already deriveFinances'd)
 * @param {number} args.goal          target deposit (£)
 * @param {string} [args.openedAt]    ISO date for the account-opened anchor (YYYY-MM-DD)
 * @param {number} [args.currentValue] current portfolio value (anchor for baseline projection)
 * @param {Date}   [args.now]         base date for projection (defaults to today)
 * @returns {{
 *   isStub: boolean,
 *   points: Array<{ month: string, cumulative: number, delta: number, epoch?: string }>,
 *   targetLine: { target: number, etaMonth: string | null },
 *   baselineProjection: Array<{ month: string, projected: number }>,
 *   annotations: Array<{ month: string, label: string }>
 * }}
 */
export function buildSavingsSeries({ history, finances, goal, openedAt, currentValue, now = new Date() } = {}) {
  const target = num(goal);
  const isStub = !history
    || history._status === 'awaiting Phase 3 import'
    || !Array.isArray(history.monthlySummary)
    || history.monthlySummary.length === 0;

  if (isStub) {
    return {
      isStub: true,
      points: [],
      targetLine: { target, etaMonth: null },
      baselineProjection: [],
      annotations: [],
    };
  }

  // Sort ascending by month string (YYYY-MM sorts lexicographically).
  const monthly = [...history.monthlySummary].sort((a, b) => a.month.localeCompare(b.month));

  // Cumulative running net deposit balance, anchored to zero at accountOpened.
  let running = 0;
  const points = monthly.map((m) => {
    const delta = num(m.net);
    running += delta;
    return {
      month: m.month,
      cumulative: round2(running),
      delta: round2(delta),
      epoch: m.epoch ?? undefined,
    };
  });

  // Engine baseline projection — uses current value as start, projects forward at
  // the goal monthly contribution rate. Returns months 1..eta as YYYY-MM labels.
  const baseline = getSavingsVelocity(finances, undefined, now)?.baseline;
  const baselineProjection = projectionToMonthLabels(baseline?.projection ?? [], now);

  // ETA month label from baseline (when the line crosses the target).
  const etaMonth = baseline?.etaDate ? toMonthLabel(baseline.etaDate) : null;

  // Epoch boundary annotations.
  const annotations = [];
  const epochDefs = history.epochs ?? {};
  for (const [id, def] of Object.entries(epochDefs)) {
    if (def?.start) {
      annotations.push({ month: def.start.slice(0, 7), label: def.label ?? id });
    }
  }
  // If account-opened anchor is supplied and earlier than the first point, surface it.
  if (openedAt && (!points.length || openedAt.slice(0, 7) < points[0].month)) {
    annotations.unshift({ month: openedAt.slice(0, 7), label: 'Account opened' });
  }

  return {
    isStub: false,
    points,
    targetLine: { target, etaMonth },
    baselineProjection,
    annotations,
  };
}

// --- Helpers -----------------------------------------------------------------

function projectionToMonthLabels(projection, from) {
  if (!Array.isArray(projection) || projection.length === 0) return [];
  return projection.map((p) => {
    const d = new Date(from.getFullYear(), from.getMonth() + num(p.month), 1);
    return { month: toMonthLabel(d), projected: round2(num(p.balance)) };
  });
}

function toMonthLabel(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function round2(v) {
  return Math.round(num(v) * 100) / 100;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
