// tests/unit/matched-price.test.js — the ONE matched-price lookup (Phase 6.1).
// Pins the preference walk, the Bungalow→avgDetached mapping, the cheapest-available
// fallback order, the priceSummary→prices source union, and null/no-data handling —
// plus a source rail asserting the page-level copies are gone for good (no PROP_TO_KEY
// or matched-price walk outside assets/js/areas/matched-price.js).
import { readFileSync } from 'node:fs';
import { matchedPrice } from '../../assets/js/areas/matched-price.js';

export async function register({ test, assert, assertEqual }) {
  const ps = { avgDetached: 550000, avgSemi: 320000, avgTerraced: 280000, avgFlat: 190000 };
  const crit = (...preferred) => ({ propertyTypePrefs: { preferred } });
  // assertEqual is strict (===); the result is a {price,label} pair — compare serialized.
  const eq = (actual, expected) => assertEqual(JSON.stringify(actual), JSON.stringify(expected));

  // ── preference walk ─────────────────────────────────────────────────────────
  test('matched-price: first preferred type with a price wins, label = the preference', () => {
    eq(matchedPrice({ priceSummary: ps }, crit('Detached', 'Semi-detached')),
      { price: 550000, label: 'Detached' });
  });

  test('matched-price: a preferred type with a null price is skipped for the next', () => {
    const gappy = { ...ps, avgDetached: null };
    eq(matchedPrice({ priceSummary: gappy }, crit('Detached', 'Semi-detached')),
      { price: 320000, label: 'Semi-detached' });
  });

  test('matched-price: Bungalow maps to avgDetached (priced like detacheds)', () => {
    eq(matchedPrice({ priceSummary: ps }, crit('Bungalow')),
      { price: 550000, label: 'Bungalow' });
  });

  test('matched-price: an unknown preference type (e.g. Cottage) is skipped, not fatal', () => {
    eq(matchedPrice({ priceSummary: ps }, crit('Cottage', 'Terraced')),
      { price: 280000, label: 'Terraced' });
  });

  // ── cheapest-available fallback (recorded §3.10b decision: bias stays) ──────
  test('matched-price: no preferences → fallback order Semi, Terraced, Detached, Flat', () => {
    eq(matchedPrice({ priceSummary: ps }, {}), { price: 320000, label: 'Semi' });
    eq(matchedPrice({ priceSummary: { avgDetached: 500000, avgFlat: 150000 } }, {}),
      { price: 500000, label: 'Detached' });
    eq(matchedPrice({ priceSummary: { avgFlat: 150000 } }, {}),
      { price: 150000, label: 'Flat' });
  });

  test('matched-price: all preferences priceless → same fallback chain', () => {
    const only = { avgTerraced: 275000 };
    eq(matchedPrice({ priceSummary: only }, crit('Detached', 'Flat / Apartment')),
      { price: 275000, label: 'Terraced' });
  });

  // ── source union: priceSummary beats prices; prices serves detail-shaped areas ──
  test('matched-price: priceSummary wins over prices when both exist', () => {
    const area = { priceSummary: { avgSemi: 300000 }, prices: { avgSemi: 999999 } };
    eq(matchedPrice(area, {}), { price: 300000, label: 'Semi' });
  });

  test('matched-price: detail-shaped area (prices only) still resolves', () => {
    eq(matchedPrice({ prices: ps }, crit('Flat / Apartment')),
      { price: 190000, label: 'Flat / Apartment' });
  });

  // ── null / no-data handling ─────────────────────────────────────────────────
  test('matched-price: no price data at all → {null, null}', () => {
    eq(matchedPrice({}, crit('Detached')), { price: null, label: null });
    eq(matchedPrice(null, {}), { price: null, label: null });
    eq(matchedPrice({ priceSummary: { avgSemi: null } }, {}), { price: null, label: null });
    eq(matchedPrice({ priceSummary: ps }, null).price, 320000);
  });

  // ── source rail: the triplication can never return ──────────────────────────
  test('matched-price: no PROP_TO_KEY / matched-price walk outside the one home', () => {
    const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
    const pages = [
      'assets/js/page-areas.js',
      'assets/js/page-area-detail/sections.js',
      'assets/js/page-map.js',
    ];
    for (const p of pages) {
      const src = read(p);
      assert(!/PROP_TO_KEY/.test(src), `${p} still carries a PROP_TO_KEY copy`);
      assert(/matched-price\.js/.test(src),
        `${p} does not import the shared matched-price module`);
    }
    // sections.js legitimately names avg* keys in its prices-section RENDER (labels);
    // the other two have no business touching price keys at all.
    for (const p of ['assets/js/page-areas.js', 'assets/js/page-map.js']) {
      assert(!/avgDetached|avgSemi|avgTerraced|avgFlat/.test(read(p)),
        `${p} still walks price keys locally`);
    }
  });
}
