// tests/unit/price-summary-bake.test.js — ONE priceSummary derivation (Phase 6.2).
// Pins the bake grid (which prices trigger a summary, null-filling, asOf carriage),
// the stale-proof contract (sync's canonicalRecord IGNORES the stored DB value and
// re-derives), a repo-wide derived-state consistency check (every committed per-area
// file's priceSummary ≡ bake(file.prices) — the offline form of the sync→build
// idempotence invariant), and a source rail so the inline bake can't reappear.
import { readFileSync, readdirSync } from 'node:fs';
import { bakePriceSummary } from '../../tools/area-fields.mjs';
import { canonicalRecord } from '../../tools/sync-areas-from-supabase.mjs';

export async function register({ test, assert, assertEqual }) {
  const eq = (actual, expected) => assertEqual(JSON.stringify(actual), JSON.stringify(expected));

  // ── derivation grid ─────────────────────────────────────────────────────────
  test('price-summary: full prices bake to the four avg keys + asOf', () => {
    eq(bakePriceSummary({
      avgDetached: 550000, avgSemi: 320000, avgTerraced: 280000, avgFlat: 190000,
      avgSold12Mo: 400000, avgBungalow: 450000, asOf: '2026-05', source: 'x',
    }), {
      avgDetached: 550000, avgSemi: 320000, avgTerraced: 280000, avgFlat: 190000,
      asOf: '2026-05',
    });
  });

  test('price-summary: partial prices bake with nulls filled in', () => {
    eq(bakePriceSummary({ avgSemi: 300000 }), {
      avgDetached: null, avgSemi: 300000, avgTerraced: null, avgFlat: null, asOf: null,
    });
  });

  test('price-summary: non-summary keys alone (avgSold12Mo/avgBungalow) do NOT trigger a bake', () => {
    assertEqual(bakePriceSummary({ avgSold12Mo: 400000, avgBungalow: 450000, asOf: '2026-05' }), null);
  });

  test('price-summary: empty / null / undefined prices bake to null', () => {
    assertEqual(bakePriceSummary({}), null);
    assertEqual(bakePriceSummary(null), null);
    assertEqual(bakePriceSummary(undefined), null);
    assertEqual(bakePriceSummary({ avgDetached: null, avgSemi: null }), null);
  });

  // ── stale-proofing: materialisation ignores the stored DB value ─────────────
  test('price-summary: canonicalRecord derives from prices, ignoring a stale stored summary', () => {
    const rec = canonicalRecord({
      id: 'x-so21', name: 'X', village: 'X', town: 'T', county: 'Hampshire', postcode: 'SO21',
      prices: { avgSemi: 310000, asOf: '2026-06' },
      priceSummary: { avgSemi: 250000, asOf: '2025-01' }, // stale DB value — must lose
    });
    eq(rec.priceSummary, {
      avgDetached: null, avgSemi: 310000, avgTerraced: null, avgFlat: null, asOf: '2026-06',
    });
  });

  test('price-summary: canonicalRecord bakes null when prices are empty, whatever the DB stored', () => {
    const rec = canonicalRecord({
      id: 'y-sp5', name: 'Y', village: 'Y', town: 'T', county: 'Wiltshire', postcode: 'SP5',
      prices: {}, priceSummary: { avgSemi: 999999 },
    });
    assertEqual(rec.priceSummary, null);
  });

  // ── repo-wide derived-state consistency (offline idempotence invariant) ─────
  test('price-summary: every committed per-area file carries priceSummary ≡ bake(prices)', () => {
    const dir = new URL('../../data/areas/', import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    assert(files.length > 100, `implausibly few per-area files (${files.length})`);
    const drift = [];
    for (const f of files) {
      const a = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
      const expected = JSON.stringify(bakePriceSummary(a.prices) ?? null);
      const actual = JSON.stringify(a.priceSummary ?? null);
      if (actual !== expected) drift.push(f);
    }
    assertEqual(drift.join(', '), '', `stale priceSummary in: ${drift.join(', ')}`);
  });

  // ── source rail: the one home stays the one home ────────────────────────────
  test('price-summary: build-areas + sync both use the shared bake; no inline copy returns', () => {
    const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
    for (const p of ['tools/build-areas.mjs', 'tools/sync-areas-from-supabase.mjs']) {
      const src = read(p);
      assert(/bakePriceSummary/.test(src), `${p} does not use the shared bakePriceSummary`);
      assert(!/hasAnyPrice/.test(src), `${p} still carries an inline priceSummary bake`);
    }
    assert(!/p\.priceSummary/.test(read('tools/sync-areas-from-supabase.mjs')),
      'sync canonicalRecord still passes the stored DB priceSummary through');
  });
}
