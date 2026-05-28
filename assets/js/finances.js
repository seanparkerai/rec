// finances.js — pure financial calculators (UK FTB context).
// No DOM, no side effects. All functions return plain numbers/objects so they're trivially testable.
// Rules sourced from: GOV.UK SDLT (Apr 2025+), LISA scheme, standard mortgage repayment formula.

/**
 * UK Stamp Duty Land Tax for a residential purchase.
 * @param {number} price - purchase price in GBP.
 * @param {object} [opts]
 * @param {boolean} [opts.firstTimeBuyer=false] - apply FTB relief.
 * @returns {number} SDLT payable in GBP (rounded to nearest pound).
 *
 * FTB relief (Apr 2025+): 0% on first £300k, 5% on £300k–£500k. Relief is LOST entirely if price > £500k.
 * Standard rates (Apr 2025+): 0% to £125k, 2% £125k–£250k, 5% £250k–£925k, 10% £925k–£1.5m, 12% above.
 */
export function calcSDLT(price, opts = {}) {
  if (!price || price <= 0) return 0;
  const ftb = opts.firstTimeBuyer === true;

  if (ftb && price <= 500_000) {
    if (price <= 300_000) return 0;
    return Math.round((price - 300_000) * 0.05);
  }

  // Standard banded calculation
  const bands = [
    [125_000,   0],
    [250_000,   0.02],
    [925_000,   0.05],
    [1_500_000, 0.10],
    [Infinity,  0.12],
  ];
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of bands) {
    if (price <= lower) break;
    const slice = Math.min(price, upper) - lower;
    tax += slice * rate;
    lower = upper;
  }
  return Math.round(tax);
}

/**
 * Monthly repayment for a P&I mortgage.
 * @param {number} principal - loan amount in GBP.
 * @param {number} annualRatePct - annual interest rate as a percentage (e.g. 5.35).
 * @param {number} termYears - term in years.
 * @returns {number} monthly payment in GBP (2dp).
 */
export function calcMonthlyMortgage(principal, annualRatePct, termYears) {
  if (!principal || principal <= 0) return 0;
  if (!termYears || termYears <= 0) return 0;
  const n = Math.round(termYears * 12);
  const r = (annualRatePct / 100) / 12;
  if (r === 0) return Math.round((principal / n) * 100) / 100;
  const m = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return Math.round(m * 100) / 100;
}

/**
 * Loan-to-value ratio.
 * @param {number} loan - mortgage amount.
 * @param {number} propertyValue - property value.
 * @returns {number} LTV as a percentage (1dp). Returns 0 if propertyValue is 0/null.
 */
export function calcLTV(loan, propertyValue) {
  if (!propertyValue || propertyValue <= 0) return 0;
  return Math.round((loan / propertyValue) * 1000) / 10;
}

/**
 * LISA government bonus on contributions in a given year.
 * @param {number} contributionThisYear - amount paid in this tax year (GBP).
 * @returns {{eligible:number, bonus:number}}
 *   eligible = capped at £4,000; bonus = 25% of eligible (max £1,000).
 */
export function calcLISABonus(contributionThisYear) {
  const eligible = Math.max(0, Math.min(4000, contributionThisYear || 0));
  const bonus = Math.round(eligible * 0.25);
  return { eligible, bonus };
}

/**
 * Is the property eligible for the LISA scheme? Cap is £450,000.
 * @param {number} price
 * @returns {boolean}
 */
export function lisaEligible(price) {
  return Number(price) > 0 && Number(price) <= 450_000;
}

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

/**
 * Estimate total cash outlay at purchase: deposit + SDLT + one-time costs.
 * @param {object} args
 * @param {number} args.deposit
 * @param {number} args.sdlt
 * @param {Array<{cost:number}>} [args.oneTimeCosts]
 * @returns {{deposit:number, sdlt:number, otherCosts:number, total:number}}
 */
export function totalInitialOutlay({ deposit = 0, sdlt = 0, oneTimeCosts = [] }) {
  const otherCosts = oneTimeCosts.reduce((sum, c) => sum + (Number(c.cost) || 0), 0);
  // SDLT may already be in oneTimeCosts — caller's responsibility to avoid double-counting.
  return {
    deposit,
    sdlt,
    otherCosts,
    total: deposit + sdlt + otherCosts,
  };
}

/**
 * Three-group outlay breakdown derived from itemised oneTimeCosts (each item
 * requires a `category` field) and the shoppingList.
 *
 * Groups:
 *   corePurchase   = targetDeposit + SDLT + legalCosts (removal + contingency included)
 *   furnishing     = shoppingList total
 *   majorPurchases = transport category items (e.g. car)
 *
 * @returns {{ sdlt, legalCosts, corePurchase, furnishing, majorPurchases, grandTotal }}
 */
export function computeOutlayBreakdown({
  targetDeposit = 0, offerTarget = 0, firstTimeBuyer = true,
  oneTimeCosts = [], shoppingList = [],
} = {}) {
  const sdlt = calcSDLT(offerTarget, { firstTimeBuyer });
  const byCat = (cat) =>
    (oneTimeCosts || []).filter((c) => c.category === cat)
      .reduce((s, c) => s + (Number(c.cost) || 0), 0);
  const legalCosts     = byCat('legal') + byCat('removal') + byCat('contingency');
  const majorPurchases = byCat('transport');
  const furnishing     = (shoppingList || []).reduce((s, c) => s + (Number(c.cost) || 0), 0);
  const corePurchase   = targetDeposit + sdlt + legalCosts;
  const grandTotal     = corePurchase + furnishing + majorPurchases;
  return { sdlt, legalCosts, corePurchase, furnishing, majorPurchases, grandTotal };
}
