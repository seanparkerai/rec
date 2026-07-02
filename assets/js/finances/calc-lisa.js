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

/**
 * GOV.UK LISA first-home 12-month rule (added 5.5/A3, extend-only): funds are
 * usable for a first-home purchase once the account is ≥ 12 months old, counted
 * from the FIRST contribution into it (an opening deposit starts the clock).
 * Pure. Dates are treated as local calendar days ('YYYY-MM-DD').
 * @param {{firstContributionDate?:string, accountOpened?:string}|null|undefined} lisa
 * @param {Date} [today]
 * @returns {{start:Date, usableFrom:Date, met:boolean, daysRemaining:number, pct:number}|null}
 *   null when no first-contribution (or opening) date is known.
 */
export function lisaUsableWindow(lisa, today = new Date()) {
  const raw = lisa?.firstContributionDate ?? lisa?.accountOpened ?? null;
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
  const start = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(raw);
  if (Number.isNaN(start.getTime())) return null;
  const usableFrom = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
  const met = today >= usableFrom;
  const pct = Math.min(100, Math.max(0, ((today - start) / (usableFrom - start)) * 100));
  const daysRemaining = met ? 0 : Math.ceil((usableFrom - today) / 86400000);
  return { start, usableFrom, met, daysRemaining, pct };
}
