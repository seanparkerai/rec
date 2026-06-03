// finances/calc-purchase.js (REFACTOR P9): purchase + mortgage math - SDLT, monthly repayment, LTV.
// Pure, no deps. Split verbatim from finances.js. Rules: GOV.UK SDLT (Apr 2025+), repayment formula.

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
