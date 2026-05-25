// money-flow.js — pure shape for the dashboard money-flow visualisation.
// No DOM, no storage. Consumers turn the returned buckets into stacked bars.

/**
 * Pre-move money flow: where each month's income lands today (bills, expenses,
 * savings, leftover).
 *
 * @param {object} finances  contents of data/finances.json
 * @returns {{
 *   income: { takeHome:number, bonus:number, total:number },
 *   buckets: Array<{ name:string, amount:number, kind:string }>,
 *   spare: number,
 *   total: number
 * }}
 */
export function getMoneyFlow(finances) {
  const takeHome = num(finances?.income?.takeHomeMonthly);
  const bonus = num(finances?.income?.bonusMonthly);
  const total = num(finances?.income?.totalMonthly) || (takeHome + bonus);

  const bills = num(finances?.ongoingBillsTotal?.monthly);
  const expenses = num(finances?.expensesTotal?.monthly);
  const savings = num(finances?.savings?.monthlyContribution);

  // Spare = whatever's left after the three known buckets. May be negative.
  const spare = round2(total - bills - expenses - savings);

  const buckets = [
    { name: 'Bills', amount: round2(bills), kind: 'bills' },
    { name: 'Expenses', amount: round2(expenses), kind: 'expenses' },
    { name: 'Savings', amount: round2(savings), kind: 'savings' },
    { name: 'Spare', amount: spare, kind: 'spare' },
  ];

  return {
    income: { takeHome, bonus, total },
    buckets,
    spare,
    total: round2(buckets.reduce((s, b) => s + b.amount, 0)),
  };
}

/**
 * Post-move money flow: replaces the savings bucket with a mortgage bucket
 * and recomputes spare. Spare may be negative if the mortgage outweighs the
 * previous savings allocation.
 *
 * @param {object} finances           contents of data/finances.json
 * @param {number} monthlyMortgage    new monthly mortgage payment (P&I)
 * @returns {{
 *   income: { takeHome:number, bonus:number, total:number },
 *   buckets: Array<{ name:string, amount:number, kind:string }>,
 *   spare: number,
 *   total: number
 * }}
 */
export function getMoneyFlowPostMove(finances, monthlyMortgage) {
  const takeHome = num(finances?.income?.takeHomeMonthly);
  const bonus = num(finances?.income?.bonusMonthly);
  const total = num(finances?.income?.totalMonthly) || (takeHome + bonus);

  const bills = num(finances?.ongoingBillsTotal?.monthly);
  const expenses = num(finances?.expensesTotal?.monthly);
  const mortgage = num(monthlyMortgage);

  const spare = round2(total - bills - expenses - mortgage);

  const buckets = [
    { name: 'Bills', amount: round2(bills), kind: 'bills' },
    { name: 'Expenses', amount: round2(expenses), kind: 'expenses' },
    { name: 'Mortgage', amount: round2(mortgage), kind: 'mortgage' },
    { name: 'Spare', amount: spare, kind: 'spare' },
  ];

  return {
    income: { takeHome, bonus, total },
    buckets,
    spare,
    total: round2(buckets.reduce((s, b) => s + b.amount, 0)),
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
