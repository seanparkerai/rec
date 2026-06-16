// savings-edit.js — pure helpers for the "Edit savings" feature.
//
// The deposit total shown across the app is DERIVED, never stored:
//   totalSavings = cash savings (finances.savings.current)
//                + earmarked portion of the Trading 212 ISA (investments).
// (See finance-derive.js#computeDepositSavings — the single definition.)
//
// So the editor lets the user set the two RAW inputs that feed that total — cash
// and the ISA value — and these helpers patch them onto the existing records
// without disturbing anything else. No DOM, no storage: trivially testable.
import { computeDepositSavings } from './finance-derive.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Patch cash savings (savings.current) into a raw finances record, preserving
 * every other field (income, expenses, goal, the savings._note / monthlyAverage…).
 * @param {object} rawFinances raw finances record (no derived fields required).
 * @param {number|string} newCash the new cash-savings figure.
 * @returns {object} a new finances object with savings.current updated.
 */
export function applyCashSavings(rawFinances, newCash) {
  const base = rawFinances && typeof rawFinances === 'object' ? rawFinances : {};
  return { ...base, savings: { ...(base.savings || {}), current: num(newCash) } };
}

/**
 * Patch the ISA value (and, optionally, the earmark %) into an investments record,
 * MERGING onto the existing trading212ISA blob so holdings / strategyEpochs /
 * snapshot / accountOpened all survive the edit.
 * @param {object} investments investments record ({ trading212ISA: {…} }).
 * @param {number|string} newValue new currentPortfolioValue.
 * @param {number|string} [newEarmarkPct] optional new earmark percentage.
 * @returns {object} a new investments object with trading212ISA updated.
 */
export function applyIsaValue(investments, newValue, newEarmarkPct) {
  const base = investments && typeof investments === 'object' ? investments : {};
  const isa = base.trading212ISA && typeof base.trading212ISA === 'object' ? base.trading212ISA : {};
  const next = { ...isa, currentPortfolioValue: num(newValue) };
  if (newEarmarkPct !== undefined && newEarmarkPct !== null && newEarmarkPct !== '') {
    next.earmarkPct = num(newEarmarkPct);
  }
  return { ...base, trading212ISA: next };
}

/**
 * Live preview of the deposit total for (possibly edited) finances + investments.
 * Delegates to the single source of truth so the preview can never drift from the
 * figure the rest of the app shows.
 * @param {object} rawFinances raw finances record.
 * @param {object} [investments] investments record.
 * @returns {number} deposit total, rounded to 2dp.
 */
export function previewDepositTotal(rawFinances, investments) {
  return computeDepositSavings(rawFinances, investments);
}

/**
 * Whether an investments/ISA record exists to edit. A household with no ISA
 * (getInvestments() returns null) only edits cash.
 * @param {object} investments investments record.
 * @returns {boolean}
 */
export function hasIsa(investments) {
  return !!(investments && investments.trading212ISA && typeof investments.trading212ISA === 'object');
}
