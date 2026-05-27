// investment-performance.js — analyse Trading 212 import history.
// Pure module. No DOM, no storage, no fetch.

/**
 * Analyse full performance from a Trading 212 history import.
 * Returns zeros/nulls gracefully when the history is the stub placeholder.
 *
 * @param {object} historyJson  contents of data/imports/trading212-history.json
 * @returns {{
 *   totalDeposited: number,
 *   totalWithdrawn: number,
 *   netContributed: number,
 *   dividendsReceived: number,
 *   interestEarned: number,
 *   realisedPnL: number,
 *   currentValue: number,
 *   unrealisedGain: number,
 *   totalReturnPct: number | null,
 *   isStub: boolean,
 *   epochs: Array<{
 *     id: string,
 *     label: string,
 *     start: string,
 *     end: string | null,
 *     contributedDuringEpoch: number,
 *     dividendsDuringEpoch: number,
 *     tickersHeld: string[]
 *   }>
 * }}
 */
export function analysePerformance(historyJson) {
  const isStub = historyJson?._status === 'awaiting Phase 3 import'
    || !Array.isArray(historyJson?.monthlySummary)
    || historyJson.monthlySummary.length === 0;

  if (isStub) {
    return emptyResult(historyJson, true);
  }

  const summary = historyJson.summary ?? {};
  const monthly = historyJson.monthlySummary ?? [];
  const epochDefs = historyJson.epochs ?? {};

  const totalDeposited = num(summary.totalDeposited) || monthly.reduce((s, m) => s + num(m.deposits), 0);
  const totalWithdrawn = num(summary.totalWithdrawn) || monthly.reduce((s, m) => s + num(m.withdrawals), 0);
  const netContributed = num(summary.netContributed) || (totalDeposited - totalWithdrawn);
  const dividendsReceived = num(summary.totalDividends) || monthly.reduce((s, m) => s + num(m.dividends), 0);
  const interestEarned = num(summary.totalInterest) || monthly.reduce((s, m) => s + num(m.interest), 0);
  const realisedPnL = num(summary.realisedPnL) || monthly.reduce((s, m) => s + num(m.realisedPnL), 0);
  const currentValue = num(summary.currentValueDeclared);
  const unrealisedGain = currentValue - netContributed - dividendsReceived - interestEarned - realisedPnL;
  const totalReturnPct = netContributed > 0
    ? Math.round(((currentValue - netContributed) / netContributed) * 10000) / 100
    : null;

  const epochs = buildEpochs(epochDefs, monthly);

  return {
    totalDeposited,
    totalWithdrawn,
    netContributed,
    dividendsReceived,
    interestEarned,
    realisedPnL,
    currentValue,
    unrealisedGain,
    totalReturnPct,
    isStub: false,
    epochs,
  };
}

/**
 * Cumulative running net-deposit balance across the import's monthlySummary, sorted
 * ascending. Returns [] for stub history.
 *
 * @param {object} historyJson
 * @returns {Array<{ month: string, cumulative: number, delta: number, epoch?: string }>}
 */
export function getMonthlyCumulativeDeposits(historyJson) {
  const monthly = historyJson?.monthlySummary;
  if (!Array.isArray(monthly) || monthly.length === 0) return [];
  const sorted = [...monthly].sort((a, b) => a.month.localeCompare(b.month));
  let running = 0;
  return sorted.map((m) => {
    const delta = num(m.net);
    running += delta;
    return {
      month: m.month,
      cumulative: Math.round(running * 100) / 100,
      delta: Math.round(delta * 100) / 100,
      epoch: m.epoch ?? undefined,
    };
  });
}

/**
 * Per-epoch attribution: contribution + dividends during the epoch, plus a
 * contribution-weighted estimated annualised return %. NOTE: this is an estimate,
 * not a true TWRR/MWRR — the import does not include month-end portfolio valuations.
 *
 * @param {object} historyJson
 * @returns {Array<{ id: string, label: string, start: string|null, end: string|null,
 *   contributedDuringEpoch: number, dividendsDuringEpoch: number,
 *   monthsHeld: number, returnPct: number | null }>}
 */
export function getEpochAttribution(historyJson) {
  const epochDefs = historyJson?.epochs ?? {};
  const monthly = historyJson?.monthlySummary;
  if (!Array.isArray(monthly) || monthly.length === 0) return [];

  return Object.entries(epochDefs).map(([id, def]) => {
    const monthsInEpoch = monthly.filter((m) => {
      const mo = m.month;
      const afterStart = !def.start || mo >= def.start.slice(0, 7);
      const beforeEnd = !def.end || mo <= def.end.slice(0, 7);
      return afterStart && beforeEnd;
    });
    const contributed = monthsInEpoch.reduce((s, m) => s + num(m.net), 0);
    const dividends = monthsInEpoch.reduce((s, m) => s + num(m.dividends), 0);
    const realised = monthsInEpoch.reduce((s, m) => s + num(m.realisedPnL), 0);
    const monthsHeld = monthsInEpoch.length;

    // Contribution-weighted estimated annualised return.
    // Income (dividends + realised) over contributed × (12 / monthsHeld).
    let returnPct = null;
    if (contributed > 0 && monthsHeld > 0) {
      const pct = ((dividends + realised) / contributed) * (12 / monthsHeld) * 100;
      returnPct = Math.round(pct * 100) / 100;
    }

    return {
      id,
      label: def.label ?? id,
      start: def.start ?? null,
      end: def.end ?? null,
      contributedDuringEpoch: Math.round(contributed * 100) / 100,
      dividendsDuringEpoch: Math.round(dividends * 100) / 100,
      monthsHeld,
      returnPct,
    };
  });
}

// --- Helpers -------------------------------------------------------------------

function emptyResult(historyJson, isStub) {
  return {
    totalDeposited: 0,
    totalWithdrawn: 0,
    netContributed: 0,
    dividendsReceived: 0,
    interestEarned: 0,
    realisedPnL: 0,
    currentValue: 0,
    unrealisedGain: 0,
    totalReturnPct: null,
    isStub,
    epochs: [],
  };
}

function buildEpochs(epochDefs, monthly) {
  return Object.entries(epochDefs).map(([id, def]) => {
    const monthsInEpoch = monthly.filter((m) => {
      const mo = m.month;
      const afterStart = !def.start || mo >= def.start.slice(0, 7);
      const beforeEnd = !def.end || mo <= def.end.slice(0, 7);
      return afterStart && beforeEnd;
    });
    const contributed = monthsInEpoch.reduce((s, m) => s + num(m.net), 0);
    const dividends = monthsInEpoch.reduce((s, m) => s + num(m.dividends), 0);
    const tickers = Array.isArray(def.tickersHeld) ? def.tickersHeld : [];
    return {
      id,
      label: def.label ?? id,
      start: def.start ?? null,
      end: def.end ?? null,
      contributedDuringEpoch: contributed,
      dividendsDuringEpoch: dividends,
      tickersHeld: tickers,
    };
  });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
