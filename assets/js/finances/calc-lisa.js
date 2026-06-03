// finances/calc-lisa.js (REFACTOR P9): Lifetime ISA bonus + property-price eligibility.
// Pure, no deps. Split verbatim from finances.js.

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
