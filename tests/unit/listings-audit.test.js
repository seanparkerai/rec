// tests/unit/listings-audit.test.js — pure aggregation helpers of tools/listings-audit.mjs.
// No network: the REST I/O in collect()/main() is not exercised — only the
// bucket/mix/orphan maths the health report is built from.
import {
  freshnessBand, lifecycleBuckets, provenanceMix, orphanStats,
  fingerprintDupes, junctionOrphans, FRESHNESS_BANDS,
} from '../../tools/listings-audit.mjs';

export async function register({ test, assert, assertEqual }) {
  const NOW = new Date('2026-07-06T00:00:00Z');
  const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

  test('audit: freshnessBand buckets last_seen with first_seen fallback', () => {
    assertEqual(freshnessBand({ last_seen: daysAgo(2) }, NOW), '<=7d');
    assertEqual(freshnessBand({ last_seen: daysAgo(20) }, NOW), '8-30d');
    assertEqual(freshnessBand({ last_seen: daysAgo(45) }, NOW), '31-90d');
    assertEqual(freshnessBand({ last_seen: daysAgo(120) }, NOW), '>90d');
    assertEqual(freshnessBand({ first_seen: daysAgo(45) }, NOW), '31-90d', 'falls back to first_seen');
    assertEqual(freshnessBand({}, NOW), 'unknown');
  });

  test('audit: lifecycleBuckets splits archived from live and bands only live rows', () => {
    const lc = lifecycleBuckets([
      { rightmove_id: '1', status: 'live', last_seen: daysAgo(1) },
      { rightmove_id: '2', status: 'live', last_seen: daysAgo(20) },
      { rightmove_id: '3', status: 'live', last_seen: daysAgo(200), archived_at: daysAgo(5), archive_reason: 'stale' },
      { rightmove_id: '4', status: 'sstc', last_seen: daysAgo(40) },
    ], NOW);
    assertEqual(lc.total, 4);
    assertEqual(lc.archived, 1);
    assertEqual(lc.live, 3);
    assertEqual(lc.byStatus.live, 3, 'market status counted independently of archive');
    assertEqual(lc.archiveReasons.stale, 1);
    assertEqual(lc.freshness['<=7d'], 1);
    assertEqual(lc.freshness['8-30d'], 1);
    assertEqual(lc.freshness['31-90d'], 1);
    assertEqual(lc.freshness['>90d'], 0, 'archived row excluded from freshness');
    assert(FRESHNESS_BANDS.every((b) => b in lc.freshness), 'every band present');
  });

  test('audit: provenanceMix — heuristic-only log reports no durable sources', () => {
    const t = daysAgo(1);
    const mix = provenanceMix([
      { reaction: 'like', created_at: t },
      { reaction: 'reject', reason: 'too_expensive', created_at: t },
    ]);
    assertEqual(mix.summary.total, 2);
    assertEqual(Object.keys(mix.bySource).length, 0, 'no source column → no by-source counts');
    assertEqual(mix.drift.checked, 0);
    assertEqual(mix.byReaction.like, 1);
  });

  test('audit: provenanceMix — durable source counted and drift-checked vs heuristic', () => {
    // Six rejects in the same minute → the heuristic says bulk; sources agree for
    // five, and one mislabeled 'manual' row is the single drift mismatch.
    const t = '2026-06-04T12:00:05Z';
    const burst = Array.from({ length: 6 }, (_, i) => ({
      reaction: 'reject', reason: 'too_expensive', created_at: t,
      source: i === 0 ? 'manual' : 'bulk', listing_id: String(i),
    }));
    const mix = provenanceMix([...burst, { reaction: 'like', created_at: daysAgo(1), source: 'import' }]);
    assertEqual(mix.bySource.bulk, 5);
    assertEqual(mix.bySource.manual, 1);
    assertEqual(mix.bySource.import, 1);
    assertEqual(mix.drift.checked, 6, "'import' has no heuristic twin — excluded");
    assertEqual(mix.drift.mismatches, 1);
  });

  test('audit: orphanStats — orphaned, snapshotless and multi-reaction counts', () => {
    const live = new Set(['a']);
    const snap = { address: 'x' };
    const st = orphanStats([
      { listing_id: 'a', reaction: 'like', listing_snapshot: snap },
      { listing_id: 'a', reaction: 'reject', listing_snapshot: snap },
      { listing_id: 'gone1', reaction: 'reject', listing_snapshot: snap },
      { listing_id: 'gone2', reaction: 'reject', listing_snapshot: null },
    ], live);
    assertEqual(st.total, 4);
    assertEqual(st.orphaned, 2);
    assertEqual(st.orphanedDistinct, 2);
    assertEqual(st.snapshotless, 1);
    assertEqual(st.snapshotlessOrphans, 1);
    assertEqual(st.multiReactionListings, 1, "only 'a' has >1 reaction");
  });

  test('audit: fingerprintDupes counts physical re-lists among current rows', () => {
    const twin = { property_type: 'Terraced', beds: 2, address: 'Augustus Avenue, Fordingbridge, SP6' };
    const d = fingerprintDupes([
      { rightmove_id: '1', ...twin },
      { rightmove_id: '2', ...twin },
      { rightmove_id: '3', property_type: 'Detached', beds: 4, address: 'Other Road, Ringwood, BH24' },
    ]);
    assertEqual(d.groups, 1);
    assertEqual(d.rows, 2);
  });

  test('audit: junctionOrphans counts membership rows whose listing is gone', () => {
    assertEqual(junctionOrphans(['a', 'a', 'gone'], new Set(['a'])), 1);
    assertEqual(junctionOrphans([], new Set()), 0);
  });
}
