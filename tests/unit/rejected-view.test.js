// tests/rejected-view.test.js — the pure read model behind the dedicated Rejected
// page (assets/js/listings/rejected-view.js). Pins: only pass/reject survive (likes
// and un-reacted excluded), most-recently-actioned first, re-listed duplicates
// collapse to the latest decision, rows render from the durable snapshot, search
// matches property type + area name, and pagination yields 50/page with clamped bounds.
import { buildRejectedRows, searchRejected, paginate } from '../../assets/js/listings/rejected-view.js';

export async function register({ test, assert, assertEqual }) {
  const snap = (id, address, beds, property_type, over = {}) => ({
    rightmove_id: id, address, beds, property_type, area_id: over.area_id ?? 'fordingbridge-sp6',
    price: over.price ?? 300000, title: over.title ?? null, image_url: over.image_url ?? null, ...over,
  });
  const row = (id, reaction, created_at, snapshot, reasons = []) => ({
    listing_id: id, reaction, created_at, reasons, listing_snapshot: snapshot,
  });
  const areaNameOf = (l) => (l.area_id === 'fordingbridge-sp6' ? 'Fordingbridge' : '');

  test('rejected-view: keeps only pass/reject, drops likes and un-reacted', () => {
    const log = [
      row('1', 'reject', '2026-06-01T09:00:00Z', snap('1', 'Augustus Avenue, Fordingbridge, SP6', 2, 'Terraced')),
      row('2', 'pass',   '2026-06-02T09:00:00Z', snap('2', 'Whitsbury Road, Fordingbridge, SP6', 3, 'Detached')),
      row('3', 'like',   '2026-06-03T09:00:00Z', snap('3', 'Burgate, Fordingbridge, SP6', 4, 'Detached')),
    ];
    const rows = buildRejectedRows(log, { areaNameOf });
    assertEqual(rows.length, 2, 'only the reject + pass survive');
    assert(!rows.some((r) => r.reaction === 'like'), 'no likes on the Rejected page');
  });

  test('rejected-view: current reaction wins (a like → reject reads as rejected)', () => {
    const log = [
      row('9', 'like',   '2026-06-01T09:00:00Z', snap('9', 'Tinkers Cross, Fordingbridge, SP6', 3, 'Semi-Detached')),
      row('9', 'reject', '2026-06-05T09:00:00Z', snap('9', 'Tinkers Cross, Fordingbridge, SP6', 3, 'Semi-Detached')),
    ];
    const rows = buildRejectedRows(log, { areaNameOf });
    assertEqual(rows.length, 1, 'one current row');
    assertEqual(rows[0].reaction, 'reject', 'latest reaction (reject) wins over the earlier like');
  });

  test('rejected-view: most-recently-actioned first', () => {
    const log = [
      row('1', 'reject', '2026-06-01T09:00:00Z', snap('1', 'A Road, Fordingbridge, SP6', 2, 'Flat')),
      row('2', 'pass',   '2026-06-09T09:00:00Z', snap('2', 'B Road, Fordingbridge, SP6', 3, 'Detached')),
      row('3', 'reject', '2026-06-05T09:00:00Z', snap('3', 'C Road, Fordingbridge, SP6', 4, 'Detached')),
    ];
    const rows = buildRejectedRows(log, { areaNameOf });
    assertEqual(rows.map((r) => r.listing.rightmove_id).join(','), '2,3,1', 'newest action first');
  });

  test('rejected-view: a re-listed property collapses to the latest decision', () => {
    const log = [
      row('a', 'reject', '2026-06-01T09:00:00Z', snap('a', 'Burgate, Fordingbridge, SP6', 2, 'Semi-Detached', { price: 300000 })),
      row('b', 'pass',   '2026-06-08T09:00:00Z', snap('b', 'Burgate, Fordingbridge, SP6', 2, 'Semi-Detached House', { price: 290000 })),
    ];
    const rows = buildRejectedRows(log, { areaNameOf });
    assertEqual(rows.length, 1, 'the Burgate re-list collapses to one');
    assertEqual(rows[0].listing.rightmove_id, 'b', 'the most-recently-actioned id is the representative');
    assertEqual(rows[0].reaction, 'pass', 'and it carries the latest reaction');
  });

  test('rejected-view: renders from the snapshot (no live row needed)', () => {
    const log = [row('77', 'reject', '2026-06-02T09:00:00Z',
      snap('77', 'Sandleheath Road, Fordingbridge, SP6', 3, 'Detached', { image_url: 'https://x/y.jpg', price: 425000 }))];
    const rows = buildRejectedRows(log, { areaNameOf });
    assertEqual(rows[0].listing.image_url, 'https://x/y.jpg', 'cover photo comes from the snapshot');
    assertEqual(rows[0].areaName, 'Fordingbridge', 'area name resolved for the Area column / search');
  });

  test('rejected-view: a row without a snapshot is skipped', () => {
    const log = [
      { listing_id: 'z', reaction: 'reject', created_at: '2026-06-02T09:00:00Z', reasons: [], listing_snapshot: null },
      row('1', 'pass', '2026-06-02T09:00:00Z', snap('1', 'A Road, Fordingbridge, SP6', 2, 'Flat')),
    ];
    assertEqual(buildRejectedRows(log, { areaNameOf }).length, 1, 'unsnapshot-able row dropped');
  });

  test('rejected-view: search matches property type and area name', () => {
    const log = [
      row('1', 'reject', '2026-06-01T09:00:00Z', snap('1', 'A Road, Fordingbridge, SP6', 2, 'Flat', { area_id: 'fordingbridge-sp6' })),
      row('2', 'pass',   '2026-06-02T09:00:00Z', snap('2', 'B Road, Romsey, SO51', 3, 'Detached', { area_id: 'romsey-so51' })),
    ];
    const rows = buildRejectedRows(log, { areaNameOf });
    assertEqual(searchRejected(rows, 'flat').length, 1, 'matches by property type');
    assertEqual(searchRejected(rows, 'fordingbridge')[0].listing.rightmove_id, '1', 'matches by area name');
    assertEqual(searchRejected(rows, '').length, 2, 'empty query returns all');
    assertEqual(searchRejected(rows, 'nope').length, 0, 'no false matches');
  });

  test('rejected-view: paginate yields 50/page with clamped bounds', () => {
    const rows = Array.from({ length: 122 }, (_, i) => ({ listing: { rightmove_id: String(i) }, created_at: '2026-06-01T00:00:00Z' }));
    const p1 = paginate(rows, 1, 50);
    assertEqual(p1.slice.length, 50);
    assertEqual(p1.pageCount, 3);
    assertEqual(paginate(rows, 3, 50).slice.length, 22, 'last page holds the remainder');
    assertEqual(paginate(rows, 9, 50).page, 3, 'over-range page clamps to the last');
    assertEqual(paginate(rows, 0, 50).page, 1, 'under-range page clamps to the first');
    assertEqual(paginate([], 1, 50).pageCount, 1, 'an empty set is still one page');
  });
}
