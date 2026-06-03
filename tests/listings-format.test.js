// listings-format.test.js — pure formatters extracted from page-listings.js (REFACTOR P7b).
import { fmtPrice, fmtAgo, lastPriceDrop } from '../assets/js/listings/format.js';

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
}
