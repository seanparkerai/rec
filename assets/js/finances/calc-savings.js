// finances/calc-savings.js (REFACTOR P9): deposit progress, months-to-target, savings projection.
// Pure, no deps. Split verbatim from finances.js.

/**
 * Deposit progress as a percentage of target.
 * @param {number} saved
 * @param {number} target
 * @returns {number} 0–100 (rounded to nearest integer), capped at 100.
 */
export function calcDepositProgress(saved, target) {
  if (!target || target <= 0) return 0;
  return Math.min(100, Math.round((saved / target) * 100));
}

/**
 * Months remaining to reach target at the current contribution pace.
 * @param {number} saved
 * @param {number} target
 * @param {number} monthlyContribution
 * @returns {number} months (1dp); 0 if already at/past target; Infinity if no progress possible.
 */
export function calcMonthsToTarget(saved, target, monthlyContribution) {
  if (saved >= target) return 0;
  if (!monthlyContribution || monthlyContribution <= 0) return Infinity;
  return Math.round(((target - saved) / monthlyContribution) * 10) / 10;
}

/**
 * Project savings forward from a starting balance + monthly contribution.
 * Returns an array of {month, balance} starting at month 0.
 * @param {number} startingBalance
 * @param {number} monthlyContribution
 * @param {number} months
 * @returns {Array<{month:number, balance:number}>}
 */
export function projectSavings(startingBalance, monthlyContribution, months) {
  const out = [];
  let bal = startingBalance;
  for (let m = 0; m <= months; m++) {
    out.push({ month: m, balance: Math.round(bal) });
    bal += monthlyContribution;
  }
  return out;
}
