// report/format.js — pure formatters + badge builders for the value-analysis report
// (REFACTOR P7d). Extracted from page-report.js so they're unit-testable. No DOM/IO
// (esc is a pure HTML-entity string escaper).
import { esc } from '../dom.js';

export const gbp = (n) => n == null
  ? '—'
  : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);

export const fmtDate = (s) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return String(s); }
};

export const fmtPct = (n) => n == null ? '—' : `${Number(n).toFixed(1)}%`;

export function feasBadge(f) {
  const map = {
    realistic:    ['report-badge--realistic', 'Realistic'],
    stretch:      ['report-badge--stretch',   'Stretch'],
    out_of_reach: ['report-badge--outofreach','Out of reach'],
  };
  const [cls, label] = map[f] ?? ['', esc(f ?? '—')];
  return `<span class="report-badge ${cls}">${label}</span>`;
}

export function confBadge(c) {
  const map = {
    high:   'report-badge--conf-high',
    medium: 'report-badge--conf-med',
    low:    'report-badge--conf-low',
  };
  const cls   = map[c] ?? '';
  const label = c ? String(c).charAt(0).toUpperCase() + String(c).slice(1) : '—';
  return `<span class="report-badge ${cls}">${label}</span>`;
}
