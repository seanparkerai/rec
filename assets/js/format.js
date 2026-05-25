// format.js — shared pure formatters. No DOM, no side effects.
// Consumed by every page-* module and by the intelligence engine.

const GBP_INT = new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
});

const GBP_PENCE = new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const DATE_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  month: 'long', year: 'numeric',
});

/**
 * GBP integer formatter — rounds to whole pounds. Null / undefined / NaN render as £0
 * (matches the inline formatters this replaced; preserves existing UI behaviour).
 * @param {number|string} n
 * @returns {string} e.g. "£1,808"
 */
export const gbp = (n) => GBP_INT.format(Number(n) || 0);

/**
 * GBP formatter with pence — always shows 2dp. Same null-fallback as gbp().
 * @param {number|string} n
 * @returns {string} e.g. "£1,807.55"
 */
export const gbpPence = (n) => GBP_PENCE.format(Number(n) || 0);

/**
 * Percentage formatter.
 * @param {number} n  value already in percent units (e.g. 50.4 → "50%")
 * @param {number} [decimals=0]
 * @returns {string}
 */
export function pct(n, decimals = 0) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—%';
  return `${Number(n).toFixed(decimals)}%`;
}

/**
 * Format a month count as a short "Yy Mm" duration.
 * Negative or invalid inputs return "—". Zero returns "0m".
 * @param {number} n  number of months (may be fractional; rounded to nearest integer).
 * @returns {string} e.g. 15 → "1y 3m"; 12 → "1y"; 5 → "5m"
 */
export function monthsAsDuration(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const total = Math.max(0, Math.round(Number(n)));
  const y = Math.floor(total / 12);
  const m = total % 12;
  if (y === 0) return `${m}m`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}m`;
}

/**
 * Project a date forward by N months from a base date.
 * @param {number} n  number of months to add (rounded to nearest integer).
 * @param {Date}   [from=new Date()]  base date.
 * @returns {Date|null}  null on invalid input.
 */
export function dateFromMonths(n, from = new Date()) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return null;
  const d = new Date(from);
  d.setMonth(d.getMonth() + Math.round(Number(n)));
  return d;
}

/**
 * Long-form month + year ("March 2027").
 * @param {Date} d
 * @returns {string}
 */
export const monthYear = (d) => (d instanceof Date && !isNaN(d) ? DATE_MONTH_YEAR.format(d) : '—');
