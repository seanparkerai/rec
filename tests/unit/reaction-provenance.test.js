// tests/reaction-provenance.test.js — provenance classification: genuine, one-at-a-time
// judgements vs en-masse sweeps vs administrative removals. Pure module, no IO.
import {
  classifyProvenance, genuineReactions, provenanceSummary, REACTION_CADENCE,
} from '../../assets/js/listings/reaction-provenance.js';

export async function register({ test, assert, assertEqual }) {
  // N reactions in the SAME minute (a burst). i*1000ms keeps them inside one minute.
  const burst = (n, reaction, minuteIso, reason = null) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${reaction}-${minuteIso}-${i}`, listing_id: `l-${minuteIso}-${i}`,
      reaction, reason, reasons: reason ? [{ key: reason, detail: null, note: null }] : [],
      created_at: new Date(new Date(minuteIso).getTime() + i * 1000).toISOString(),
    }));
  const one = (reaction, iso, reason = null) => burst(1, reaction, iso, reason)[0];
  const MIN = '2026-06-01T12:00:00Z';

  test('provenance: a like is always individual, even inside a burst', () => {
    const log = [...burst(9, 'reject', MIN), one('like', MIN)];
    const cls = classifyProvenance(log);
    assertEqual(cls.find((r) => r.reaction === 'like').provenance, 'individual', 'like never bulk');
    assert(cls.filter((r) => r.reaction === 'reject').every((r) => r.provenance === 'bulk'), 'same-minute rejects are bulk');
  });

  test('provenance: rejects below the per-minute threshold are individual', () => {
    const log = [
      one('reject', '2026-06-01T09:00:00Z'),
      one('reject', '2026-06-01T09:02:00Z'),
      one('reject', '2026-06-01T09:05:00Z'),
    ];
    assert(classifyProvenance(log).every((r) => r.provenance === 'individual'), 'sparse rejects individual');
  });

  test('provenance: removed_area is admin (wins over a burst)', () => {
    const log = burst(8, 'reject', MIN, 'removed_area');
    assert(classifyProvenance(log).every((r) => r.provenance === 'admin'), 'removed_area always admin');
  });

  test('provenance: genuineReactions drops bulk + admin, keeps individual (provenance stripped)', () => {
    const log = [
      ...burst(8, 'reject', MIN),                                     // bulk
      ...burst(8, 'reject', '2026-06-02T00:00:00Z', 'removed_area'),  // admin
      one('like', '2026-06-03T00:00:00Z'),                           // individual
      one('reject', '2026-06-03T00:05:00Z', 'too_small'),            // individual
    ];
    const g = genuineReactions(log);
    assertEqual(g.length, 2, 'only the 2 individual reactions survive');
    assert(g.every((r) => !('provenance' in r)), 'provenance stripped from the filtered output');
  });

  test('provenance: summary counts individual / bulk / admin honestly', () => {
    const log = [
      ...burst(8, 'reject', MIN),                                     // 8 bulk
      ...burst(7, 'reject', '2026-06-02T00:00:00Z', 'removed_area'),  // 7 admin
      one('like', '2026-06-03T00:00:00Z'),                           // individual like
      one('reject', '2026-06-03T00:05:00Z', 'too_small'),            // individual reject
      one('pass', '2026-06-03T00:09:00Z'),                           // individual pass
    ];
    const s = provenanceSummary(log);
    assertEqual(s.bulk, 8, 'bulk count');
    assertEqual(s.admin, 7, 'admin count');
    assertEqual(s.individual.total, 3, 'individual total');
    assertEqual(s.individual.likes, 1, 'individual likes');
    assertEqual(s.individual.rejects, 1, 'individual rejects');
    assertEqual(s.individual.passes, 1, 'individual passes');
    assertEqual(s.genuineGraded, 2, 'genuineGraded = individual likes + rejects');
    assertEqual(s.total, 18, 'total preserved');
  });

  test('provenance: BULK_PER_MIN threshold is honoured exactly', () => {
    const k = REACTION_CADENCE.BULK_PER_MIN;
    assert(classifyProvenance(burst(k - 1, 'reject', MIN)).every((r) => r.provenance === 'individual'), 'k-1 per minute is individual');
    assert(classifyProvenance(burst(k, 'reject', MIN)).every((r) => r.provenance === 'bulk'), 'k per minute is bulk');
  });

  test('provenance (ADR 0009): a durable source wins verbatim over the heuristic', () => {
    // A slow sweep (< BULK_PER_MIN) the heuristic would call individual is bulk when
    // the writer declared it; a durable 'manual' inside a burst stays individual.
    const slowSweep = { ...one('reject', '2026-06-05T10:00:00Z', 'too_expensive'), source: 'bulk' };
    const inBurst = burst(8, 'reject', MIN).map((r, i) => (i === 0 ? { ...r, source: 'manual' } : r));
    const cls = classifyProvenance([slowSweep, ...inBurst]);
    assertEqual(cls[0].provenance, 'bulk', 'declared bulk wins even at slow cadence');
    assertEqual(cls[1].provenance, 'individual', 'declared manual wins even inside a burst');
    assert(cls.slice(2).every((r) => r.provenance === 'bulk'), 'undeclared burst rows fall back to heuristic');
  });

  test('provenance (ADR 0009): source admin/import map to admin/bulk; unknown falls back', () => {
    const cls = classifyProvenance([
      { ...one('reject', '2026-06-05T11:00:00Z'), source: 'admin' },
      { ...one('like', '2026-06-05T11:01:00Z'), source: 'import' },
      { ...one('reject', '2026-06-05T11:02:00Z', 'too_small'), source: 'someday-new-value' },
    ]);
    assertEqual(cls[0].provenance, 'admin', "source 'admin' verbatim");
    assertEqual(cls[1].provenance, 'bulk', "'import' is en-masse, never an individual judgement");
    assertEqual(cls[2].provenance, 'individual', 'unrecognised source → heuristic fallback');
  });

  test('provenance (ADR 0009): genuineReactions honours durable sources', () => {
    const g = genuineReactions([
      { ...one('reject', '2026-06-06T09:00:00Z', 'too_expensive'), source: 'bulk' },
      { ...one('reject', '2026-06-06T09:10:00Z', 'too_small'), source: 'manual' },
    ]);
    assertEqual(g.length, 1, 'declared-bulk slow sweep is dropped from the genuine signal');
    assertEqual(g[0].reason, 'too_small');
  });

  test('provenance: tolerates empty / undated input', () => {
    assertEqual(genuineReactions([]).length, 0, 'empty log');
    assertEqual(provenanceSummary(null).total, 0, 'null log');
    // undated rows never count toward a burst (own bucket); a lone undated reject is individual.
    assertEqual(classifyProvenance([{ reaction: 'reject', created_at: null }])[0].provenance, 'individual', 'undated reject individual');
  });
}
