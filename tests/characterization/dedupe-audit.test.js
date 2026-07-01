// Characterization (step 2.17): the end-to-end DEDUPE story, pinned in one
// place. The feed-level collapses are already pinned elsewhere (partition dup
// stage, decided-by-fingerprint relist suppression, saved newest-wins:
// tests/unit/listings-{suppress,feed-suppression,feed-partition}.test.js; the
// two-memberships single-row guarantee: tests/contract/household-feed.test.js
// + the RPC's DISTINCT, live-verified 0 doubled). This suite pins the
// INGESTION-side pieces the audit found untested, plus the writer-parity rail
// for the defect it found (the importer blanking held photos/prices).
//
// Audit findings recorded (2026-07-01):
//   * cross-run same-id dedupe is structural — UPSERT on_conflict=rightmove_id
//     (both writers), pinned by source-scan below;
//   * within-run dedupeByRightmoveId keeps the FIRST row (deterministic by
//     target order) — pinned;
//   * price_history does NOT carry across a relist under a NEW rightmove_id —
//     fingerprints link relists only client-side (suppression/dedupe), never in
//     the DB. Known, accepted: history restarts with the new id;
//   * two live listings of the same coarse-address property can both render
//     (fingerprint is conservatively null — "never falsely merge" is pinned in
//     listings-suppress); accepted over false merges.
import { mergePriceHistory, dedupeByRightmoveId } from '../../tools/listings-normalise.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export async function register({ test, assert, assertEqual }) {
  test('merge: an unchanged price appends nothing and reports no change', () => {
    const existing = { price: 400000, price_history: [{ price: 400000, seen_at: '2026-06-01T00:00:00Z' }] };
    const { price_history, priceChanged } = mergePriceHistory(existing, { price: 400000 }, '2026-06-10T00:00:00Z');
    assertEqual(price_history.length, 1, 'no duplicate point for an unchanged price');
    assertEqual(priceChanged, false);
  });

  test('merge: first sight seeds a single point and counts as a change', () => {
    const { price_history, priceChanged } = mergePriceHistory(null, { price: 350000 }, '2026-06-10T00:00:00Z');
    assertEqual(price_history.length, 1);
    assertEqual(price_history[0].price, 350000);
    assertEqual(priceChanged, true);
  });

  test('merge: a legacy row without history diffs against its scalar price', () => {
    // Pre-history rows carry price but an empty history array — the last known
    // price falls back to existing.price so a real change is still detected.
    const existing = { price: 400000, price_history: [] };
    const { price_history, priceChanged } = mergePriceHistory(existing, { price: 380000 }, '2026-06-10T00:00:00Z');
    assertEqual(priceChanged, true);
    assertEqual(price_history.length, 1);
    assertEqual(price_history[0].price, 380000);
  });

  test('merge: a null incoming price never touches the history (summary re-fetch)', () => {
    const existing = { price: 400000, price_history: [{ price: 400000, seen_at: '2026-06-01T00:00:00Z' }] };
    const { price_history, priceChanged } = mergePriceHistory(existing, { price: null }, '2026-06-10T00:00:00Z');
    assertEqual(price_history.length, 1);
    assertEqual(priceChanged, false);
  });

  test('merge: a price that returns to an earlier value is a real new point', () => {
    const existing = { price_history: [{ price: 400000, seen_at: 'a' }, { price: 380000, seen_at: 'b' }] };
    const { price_history } = mergePriceHistory(existing, { price: 400000 }, 'c');
    assertEqual(price_history.map((p) => p.price).join(','), '400000,380000,400000');
  });

  test('within-run dedupe: first row wins per rightmove_id; id-less rows drop', () => {
    const rows = [
      { rightmove_id: 'A', tag: 'first' },
      { rightmove_id: 'A', tag: 'second' },
      { rightmove_id: null, tag: 'no-id' },
      { rightmove_id: 'B', tag: 'only' },
    ];
    const out = dedupeByRightmoveId(rows);
    assertEqual(out.length, 2);
    assertEqual(out.find((r) => r.rightmove_id === 'A').tag, 'first',
      'the FIRST occurrence is kept (target order is the deterministic tiebreak)');
  });

  test('writer parity: both writers upsert on rightmove_id and never blank held data', () => {
    // Cross-run/cross-source dedupe is the DB unique key: both writers must
    // UPSERT on_conflict=rightmove_id, read the existing row first, and apply
    // the never-blank preservation (a summary payload with a null image/price
    // must not erase good data). The importer clobbering held photos/prices is
    // the defect this audit found and fixed — this scan keeps it fixed.
    for (const f of ['tools/fetch-listings.mjs', 'tools/import-apify-runs.mjs']) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      assert(src.includes('on_conflict=rightmove_id'), `${f} must UPSERT on rightmove_id`);
      assert(src.includes('mergePriceHistory'), `${f} must merge price history against the existing row`);
      assert(/image_url: l\.image_url \?\? prev\?\.image_url/.test(src), `${f} must preserve a held image_url`);
      assert(/price: l\.price \?\? prev\?\.price/.test(src), `${f} must preserve a held price`);
      assert(/first_seen: prev\?\.first_seen \?\? l\.first_seen/.test(src), `${f} must never reset first_seen`);
      assert(/select=rightmove_id,[^'`]*image_url/.test(src), `${f} must SELECT image_url on the existing-row read (or the fallback reads undefined)`);
    }
  });
}
