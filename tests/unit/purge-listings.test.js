// tests/purge-listings.test.js — the pure purge-decision logic of
// tools/purge-listings.mjs. Verifies the order (liked → baseline → rejected-stale →
// stale), that a liked property is never purged, and that a rejected re-list under a
// NEW id is caught by physical-property fingerprint. The REST I/O in main() is not
// exercised here (no network) — only the drift-free, reusable decision is tested.
import { purgeDecision, buildPurgeContext, ageInDays, PURGE_REASONS } from '../../tools/purge-listings.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export async function register({ test, assert, assertEqual }) {
  const NOW = new Date('2026-06-04T00:00:00Z');
  const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
  // A baseline-passing, recently-seen, fingerprintable row by default.
  const row = (o) => ({
    rightmove_id: 'x', property_type: 'Terraced', price: 300000, beds: 2,
    address: 'Augustus Avenue, Fordingbridge, SP6', last_seen: daysAgo(1), ...o,
  });

  const emptyCtx = buildPurgeContext([], new Map(), NOW);

  test('purge: a baseline-violating row with no reaction is purged', () => {
    assertEqual(purgeDecision(row({ rightmove_id: '1', property_type: 'Flat' }), emptyCtx), 'baseline', 'excluded type');
    assertEqual(purgeDecision(row({ rightmove_id: '2', price: 999000 }), emptyCtx), 'baseline', 'over ceiling');
    assertEqual(purgeDecision(row({ rightmove_id: '3', beds: 1 }), emptyCtx), 'baseline', 'below min beds');
  });

  test('purge: an in-baseline, recently-seen, undecided row is kept', () => {
    assertEqual(purgeDecision(row({ rightmove_id: '4' }), emptyCtx), null);
  });

  test('purge: a liked row is NEVER purged, even when baseline-violating + stale', () => {
    const ctx = buildPurgeContext([{ listing_id: '5', reaction: 'like', created_at: daysAgo(2) }], new Map(), NOW);
    assertEqual(purgeDecision(row({ rightmove_id: '5', property_type: 'Flat', last_seen: daysAgo(400) }), ctx), null);
  });

  test('purge: a rejected row older than the half-life is purged; a fresh one is kept', () => {
    const snap = { address: 'Augustus Avenue, Fordingbridge, SP6', beds: 2, property_type: 'Terraced' };
    const ctx = buildPurgeContext([{ listing_id: '6', reaction: 'reject', created_at: daysAgo(20), listing_snapshot: snap }], new Map(), NOW);
    assertEqual(purgeDecision(row({ rightmove_id: '6', last_seen: daysAgo(20) }), ctx), 'rejected-stale', 'rejected + old');
    assertEqual(purgeDecision(row({ rightmove_id: '6', last_seen: daysAgo(2) }), ctx), null, 'rejected but fresh → kept');
  });

  test('purge: a rejected re-list under a NEW id is matched by fingerprint', () => {
    const snap = { address: 'Augustus Avenue, Fordingbridge, SP6', beds: 2, property_type: 'Terraced' };
    const ctx = buildPurgeContext([{ listing_id: '7', reaction: 'reject', created_at: daysAgo(20), listing_snapshot: snap }], new Map(), NOW);
    const twin = row({ rightmove_id: '999', property_type: 'Terraced House', last_seen: daysAgo(20) });
    assertEqual(purgeDecision(twin, ctx), 'rejected-stale', 'fingerprint catches the re-list');
  });

  test('purge: an undecided in-baseline row goes stale only past the stale window', () => {
    assertEqual(purgeDecision(row({ rightmove_id: '8', last_seen: daysAgo(40) }), emptyCtx), 'stale', 'unseen 40d');
    assertEqual(purgeDecision(row({ rightmove_id: '9', last_seen: daysAgo(20) }), emptyCtx), null, 'unseen 20d → kept');
  });

  test('purge: ageInDays falls back to first_seen and is 0 when unknown', () => {
    assert(ageInDays({ last_seen: null, first_seen: daysAgo(10) }, NOW) > 9, 'uses first_seen when last_seen missing');
    assertEqual(ageInDays({ last_seen: null, first_seen: null }, NOW), 0, 'unknown dates → 0 (never stale)');
  });

  test('purge (2.18): PURGE_REASONS is the COMPLETE reason set — nothing undocumented', () => {
    // Guards against the fc5574a landmine: an undocumented 'new-build' reason with
    // no report bucket crashed main(). Every decision must be a documented reason
    // or null — and a fresh, in-baseline new-build row follows the normal rules.
    const grid = [
      row({ rightmove_id: 'g1' }),
      row({ rightmove_id: 'g2', title: 'Stunning NEW BUILD home', description: 'NHBC warranty' }),
      row({ rightmove_id: 'g3', property_type: 'Flat' }),
      row({ rightmove_id: 'g4', last_seen: daysAgo(40) }),
      row({ rightmove_id: 'g5', price: 999000, last_seen: daysAgo(400) }),
    ];
    for (const r of grid) {
      const d = purgeDecision(r, emptyCtx);
      assert(d === null || PURGE_REASONS.includes(d), `undocumented purge reason "${d}" for ${r.rightmove_id}`);
    }
    assertEqual(purgeDecision(grid[1], emptyCtx), null,
      'a fresh, in-baseline new-build is KEPT (new-build is a flag, never junk)');
  });

  test('purge (2.18): the tool cleans listing_areas junction rows alongside listings', () => {
    // No FK ties listing_areas to listings (loose by design) — a purge that only
    // deletes listings rows strands orphan membership rows (the remembership
    // sweep surfaces them as info). Pin the junction delete in the source.
    const src = readFileSync(join(ROOT, 'tools/purge-listings.mjs'), 'utf8');
    assert(/listing_areas\?rightmove_id=in\./.test(src),
      'purge must DELETE the purged ids from listing_areas too');
  });
}
