// tests/unit/type-priority.test.js — the property-type feed-order primitive
// (refinement/type-priority.js, 2026-07-05 overhaul). Wilson-ranked keep rates,
// thin-evidence tail, the graded fit delta, rank lookup, and order comparison.
import { computeTypePriority, priorityRank, typePriorityDelta, ordersDiffer } from '../../assets/js/refinement/type-priority.js';

export async function register({ test, assert, assertEqual }) {
  const NOW = Date.parse('2026-07-05T12:00:00Z');
  let seq = 0;
  // One reaction per minute so nothing trips the bulk-sweep heuristic.
  const react = (reaction, type) => ({
    listing_id: `L${seq++}`,
    reaction,
    created_at: new Date(NOW - seq * 60_000).toISOString(),
    listing_snapshot: { property_type: type },
  });
  const many = (n, fn) => Array.from({ length: n }, fn);

  test('type-priority: ranks by Wilson keep-lower — Cottage 7/10 outranks Detached 25/94', () => {
    seq = 0;
    const log = [
      ...many(7, () => react('like', 'Cottage')), ...many(3, () => react('reject', 'Cottage')),
      ...many(25, () => react('like', 'Detached')), ...many(69, () => react('reject', 'Detached')),
      ...many(2, () => react('like', 'Terraced')), ...many(201, () => react('reject', 'Terraced')),
    ];
    const rows = computeTypePriority(log);
    assertEqual(rows.map((r) => r.type).join(','), 'cottage,detached,terraced');
    const cottage = rows[0];
    assertEqual(cottage.likes, 7);
    assertEqual(cottage.judged, 10);
    assert(cottage.keepLower > rows[1].keepLower, 'cottage keep-lower above detached');
    assert(!cottage.thin, '10 judged is not thin');
    assertEqual(cottage.label, 'Cottage', 'display label keeps original casing');
  });

  test('type-priority: thin-evidence types append AFTER evidenced ones, whatever their rate', () => {
    seq = 0;
    const log = [
      // 1/1 liked — 100% rate but thin.
      react('like', 'Chalet'),
      ...many(10, () => react('like', 'Semi-Detached')), ...many(40, () => react('reject', 'Semi-Detached')),
      ...many(1, () => react('like', 'Flat')), ...many(30, () => react('reject', 'Flat')),
    ];
    const rows = computeTypePriority(log, { minJudged: 5 });
    assertEqual(rows.map((r) => r.type).join(','), 'semi-detached,flat,chalet',
      'chalet (1 judged) trails despite the 100% rate');
    assertEqual(rows[2].thin, true);
  });

  test('type-priority: passes and sweeps are excluded from grading', () => {
    seq = 0;
    const genuine = [
      ...many(6, () => react('like', 'Detached')), ...many(6, () => react('reject', 'Detached')),
    ];
    const burstAt = new Date(NOW - 3_600_000).toISOString();
    const sweep = many(20, (v, i) => ({
      listing_id: `S${i}`, reaction: 'reject', created_at: burstAt,
      listing_snapshot: { property_type: 'Detached' },
    }));
    const passes = many(5, () => react('pass', 'Detached'));
    const rows = computeTypePriority([...genuine, ...sweep, ...passes]);
    assertEqual(rows[0].judged, 12, 'sweep rejects and passes do not count');
    assertEqual(rows[0].keepRate, 0.5);
  });

  test('type-priority: priorityRank is normalised and null-safe', () => {
    const order = ['cottage', 'detached', 'semi-detached'];
    assertEqual(priorityRank(order, 'Detached'), 1);
    assertEqual(priorityRank(order, '  SEMI-DETACHED '), 2);
    assertEqual(priorityRank(order, 'flat'), null);
    assertEqual(priorityRank([], 'cottage'), null);
    assertEqual(priorityRank(null, 'cottage'), null);
    assertEqual(priorityRank(order, ''), null);
  });

  test('type-priority: typePriorityDelta grades +max → −max linearly; endpoints exact', () => {
    assertEqual(typePriorityDelta(0, 5, 0.25), 0.25, 'rank 1 → +max');
    assertEqual(typePriorityDelta(4, 5, 0.25), -0.25, 'last rank → −max');
    assertEqual(typePriorityDelta(2, 5, 0.25), 0, 'middle rank → 0');
    assertEqual(typePriorityDelta(null, 5, 0.25), 0, 'unranked → 0');
    assertEqual(typePriorityDelta(0, 1, 0.25), 0, 'single-entry order is degenerate → 0');
    assertEqual(typePriorityDelta(1, 3, 0), 0, 'zero weight → 0');
  });

  test('type-priority: ordersDiffer compares normalised sequences', () => {
    assertEqual(ordersDiffer(['Cottage', 'Detached'], ['cottage', 'detached']), false);
    assertEqual(ordersDiffer(['cottage', 'detached'], ['detached', 'cottage']), true);
    assertEqual(ordersDiffer(['cottage'], ['cottage', 'flat']), true);
    assertEqual(ordersDiffer([], []), false);
    assertEqual(ordersDiffer(null, []), false);
  });
}
