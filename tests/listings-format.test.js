// listings-format.test.js — pure formatters in ./listings/format.js: fmtPrice/fmtAgo/
// lastPriceDrop (extracted from page-listings.js, P7b) + fmtDate (page-property.js, P7f).
import { fmtPrice, fmtAgo, lastPriceDrop, fmtDate, fmtAreaMembershipItem, fmtAreaMembership } from '../assets/js/listings/format.js';

export async function register({ test, assert, assertEqual }) {
  // ── fmtPrice ──────────────────────────────────────────────────────
  test('listings/format: fmtPrice renders grouped GBP, em dash for null', () => {
    assertEqual(fmtPrice(1234000), '£1,234,000');
    assertEqual(fmtPrice(0), '£0');
    assertEqual(fmtPrice(null), '—');
    assertEqual(fmtPrice(undefined), '—');
  });
  test('listings/format: fmtPrice rounds to whole pounds', () => {
    assertEqual(fmtPrice(999.6), '£1,000');
  });

  // ── fmtAgo (relative to Date.now) ─────────────────────────────────
  test('listings/format: fmtAgo is empty for falsy / invalid input', () => {
    assertEqual(fmtAgo(''), '');
    assertEqual(fmtAgo(null), '');
    assertEqual(fmtAgo('not-a-date'), '');
  });
  test('listings/format: fmtAgo bins today / yesterday / Nd ago', () => {
    assertEqual(fmtAgo(new Date().toISOString()), 'today');
    assertEqual(fmtAgo(new Date(Date.now() - 26 * 3600000).toISOString()), 'yesterday'); // 26h → 1 day
    assertEqual(fmtAgo(new Date(Date.now() - 5 * 86400000).toISOString()), '5d ago');
  });
  test('listings/format: fmtAgo falls back to a date label past 30 days', () => {
    const out = fmtAgo(new Date(Date.now() - 60 * 86400000).toISOString());
    assert(out.length > 0 && !out.includes('ago') && out !== 'today' && out !== 'yesterday',
      `expected a date label, got ${JSON.stringify(out)}`);
  });

  // ── lastPriceDrop ─────────────────────────────────────────────────
  test('listings/format: lastPriceDrop returns the last reduction amount', () => {
    assertEqual(lastPriceDrop({ price_history: [{ price: 300000 }, { price: 280000 }] }), 20000);
  });
  test('listings/format: lastPriceDrop is null when the last move was not a drop', () => {
    assertEqual(lastPriceDrop({ price_history: [{ price: 280000 }, { price: 300000 }] }), null); // rise
    assertEqual(lastPriceDrop({ price_history: [{ price: 300000 }, { price: 300000 }] }), null); // flat
  });
  test('listings/format: lastPriceDrop is null without ≥2 priced points', () => {
    assertEqual(lastPriceDrop({}), null);
    assertEqual(lastPriceDrop({ price_history: [{ price: 100 }] }), null);
    assertEqual(lastPriceDrop({ price_history: [{ price: null }, { price: 100 }] }), null);
  });

  // ── fmtDate (absolute en-GB; TZ-robust via local-time Date construction) ──
  test('listings/format: fmtDate is empty for falsy / invalid input', () => {
    assertEqual(fmtDate(''), '');
    assertEqual(fmtDate(null), '');
    assertEqual(fmtDate(undefined), '');
    assertEqual(fmtDate('not-a-date'), '');
  });
  test('listings/format: fmtDate renders "D Mon YYYY" en-GB', () => {
    assertEqual(fmtDate(new Date(2026, 5, 5)), '5 Jun 2026');   // local June 5
    assertEqual(fmtDate(new Date(2026, 0, 1)), '1 Jan 2026');   // local Jan 1
    assertEqual(fmtDate('2026-06-05T12:00:00'), '5 Jun 2026');  // local-time string, midday
  });

  // ── fmtAreaMembership (the m2m "within range of" explanation) ─────
  test('listings/format: fmtAreaMembershipItem renders name — distance (primary)', () => {
    assertEqual(fmtAreaMembershipItem({ name: 'Waltham Chase', distance_mi: 0.277, is_primary: true }), 'Waltham Chase — 0.3 mi (primary)');
    assertEqual(fmtAreaMembershipItem({ name: 'Dundridge', distance_mi: 0.603, is_primary: false }), 'Dundridge — 0.6 mi');
    assertEqual(fmtAreaMembershipItem({ area_id: 'x-so32', distance_mi: null }), 'x-so32'); // no distance, id fallback
    assertEqual(fmtAreaMembershipItem(null), '');
  });
  test('listings/format: fmtAreaMembership joins nearest-first, empty for none', () => {
    const areas = [
      { name: 'Dundridge', distance_mi: 0.6, is_primary: false },
      { name: 'Waltham Chase', distance_mi: 0.3, is_primary: true },
    ];
    assertEqual(fmtAreaMembership(areas), 'Waltham Chase — 0.3 mi (primary) · Dundridge — 0.6 mi'); // re-sorted nearest first
    assertEqual(fmtAreaMembership([]), '');
    assertEqual(fmtAreaMembership(null), '');
  });
}
