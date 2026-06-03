// report-format.test.js — pure formatters/badges extracted from page-report.js (REFACTOR P7d).
import { gbp, fmtDate, fmtPct, feasBadge, confBadge } from '../assets/js/report/format.js';

export async function register({ test, assert, assertEqual }) {
  test('report/format: gbp formats whole GBP, em dash for null', () => {
    assertEqual(gbp(350000), '£350,000');
    assertEqual(gbp(null), '—');
    assertEqual(gbp(undefined), '—');
  });
  test('report/format: fmtDate is em dash for empty, long en-GB otherwise', () => {
    assertEqual(fmtDate(''), '—');
    assertEqual(fmtDate(null), '—');
    const d = fmtDate('2026-06-03');
    assert(d.includes('June') && d.includes('2026'), `expected a long date, got ${JSON.stringify(d)}`);
  });
  test('report/format: fmtPct fixes to 1dp, em dash for null', () => {
    assertEqual(fmtPct(5.25), '5.3%');
    assertEqual(fmtPct(0), '0.0%');
    assertEqual(fmtPct(null), '—');
  });
  test('report/format: feasBadge maps known feasibility to label + class', () => {
    assertEqual(feasBadge('realistic'), '<span class="report-badge report-badge--realistic">Realistic</span>');
    assertEqual(feasBadge('out_of_reach'), '<span class="report-badge report-badge--outofreach">Out of reach</span>');
  });
  test('report/format: feasBadge escapes an unknown value (no class)', () => {
    assertEqual(feasBadge(null), '<span class="report-badge ">—</span>');
    assertEqual(feasBadge('weird'), '<span class="report-badge ">weird</span>');
  });
  test('report/format: confBadge capitalises known confidence + class, em dash for null', () => {
    assertEqual(confBadge('high'), '<span class="report-badge report-badge--conf-high">High</span>');
    assertEqual(confBadge('medium'), '<span class="report-badge report-badge--conf-med">Medium</span>');
    assertEqual(confBadge(null), '<span class="report-badge ">—</span>');
  });
}
