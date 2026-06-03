// data-sync-diff.test.js — pure helpers extracted from page-data-sync.js (REFACTOR P7a).
import { sortJson, jsonEq, diffData, formatTs, flattenToRows } from '../assets/js/data-sync/diff.js';

export async function register({ test, assert, assertEqual }) {
  const j = (v) => JSON.stringify(v);

  // ── sortJson ──────────────────────────────────────────────────────
  test('data-sync/diff: sortJson orders object keys (recursively)', () => {
    assertEqual(j(sortJson({ b: 1, a: 2 })), '{"a":2,"b":1}');
    assertEqual(j(sortJson({ z: { y: 1, x: 2 } })), '{"z":{"x":2,"y":1}}');
  });
  test('data-sync/diff: sortJson preserves array order, sorts element keys', () => {
    assertEqual(j(sortJson([{ b: 1, a: 2 }])), '[{"a":2,"b":1}]');
  });
  test('data-sync/diff: sortJson passes primitives through', () => {
    assertEqual(sortJson(5), 5);
    assertEqual(sortJson(null), null);
  });

  // ── jsonEq ────────────────────────────────────────────────────────
  test('data-sync/diff: jsonEq is key-order-insensitive', () => {
    assert(jsonEq({ a: 1, b: 2 }, { b: 2, a: 1 }) === true);
    assert(jsonEq({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } }) === true);
  });
  test('data-sync/diff: jsonEq distinguishes different values + array order', () => {
    assert(jsonEq({ a: 1 }, { a: 2 }) === false);
    assert(jsonEq([1, 2], [2, 1]) === false);
  });

  // ── diffData ──────────────────────────────────────────────────────
  test('data-sync/diff: diffData returns [] for equal payloads', () => {
    assertEqual(j(diffData({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })), '[]');
  });
  test('data-sync/diff: diffData flags a changed leaf', () => {
    assertEqual(j(diffData({ a: 1 }, { a: 2 })),
      j([{ path: 'a', local: '1', sb: '2', type: 'change' }]));
  });
  test('data-sync/diff: a key only in local is a "remove"; only in sb is an "add"', () => {
    assertEqual(j(diffData({ a: 1, b: 2 }, { a: 1 })),
      j([{ path: 'b', local: '2', sb: '(missing)', type: 'remove' }]));
    assertEqual(j(diffData({ a: 1 }, { a: 1, c: 3 })),
      j([{ path: 'c', local: '(missing)', sb: '3', type: 'add' }]));
  });
  test('data-sync/diff: diffData recurses into nested objects (dotted path)', () => {
    assertEqual(j(diffData({ o: { x: 1 } }, { o: { x: 2 } })),
      j([{ path: 'o.x', local: '1', sb: '2', type: 'change' }]));
  });
  test('data-sync/diff: arrays are compared whole (not descended)', () => {
    assertEqual(j(diffData({ arr: [1, 2] }, { arr: [1, 3] })),
      j([{ path: 'arr', local: '[2 items]', sb: '[2 items]', type: 'change' }]));
  });

  // ── formatTs ──────────────────────────────────────────────────────
  test('data-sync/diff: formatTs is empty for falsy input', () => {
    assertEqual(formatTs(''), '');
    assertEqual(formatTs(null), '');
    assertEqual(formatTs(undefined), '');
  });
  test('data-sync/diff: formatTs returns a non-empty string for a valid ISO date', () => {
    const out = formatTs('2026-06-03T11:32:26Z');
    assert(typeof out === 'string' && out.length > 0, `expected formatted string, got ${j(out)}`);
  });

  // ── flattenToRows ─────────────────────────────────────────────────
  test('data-sync/diff: flattenToRows flattens primitives to {key,val}', () => {
    assertEqual(j(flattenToRows({ a: 1, b: 'x' })),
      j([{ key: 'a', val: '1', isNull: false }, { key: 'b', val: 'x', isNull: false }]));
  });
  test('data-sync/diff: flattenToRows marks null with isNull', () => {
    assertEqual(j(flattenToRows(null)),
      j([{ key: '(root)', val: null, isNull: true }]));
  });
  test('data-sync/diff: flattenToRows inlines a small nested object (dotted key)', () => {
    assertEqual(j(flattenToRows({ o: { x: 1 } })),
      j([{ key: 'o.x', val: '1', isNull: false }]));
  });
  test('data-sync/diff: flattenToRows inlines a short primitive array as JSON', () => {
    assertEqual(j(flattenToRows({ tags: [1, 2, 3] })),
      j([{ key: 'tags', val: '[1,2,3]' }]));
  });
  test('data-sync/diff: flattenToRows stringifies a large object with isObj', () => {
    const big = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9 }; // 9 keys > 8 → not inlined
    const rows = flattenToRows({ big });
    assertEqual(rows.length, 1);
    assertEqual(rows[0].key, 'big');
    assert(rows[0].isObj === true, 'large nested object should carry isObj:true');
  });
}
