// tests/trends-glance.test.js — pure aggregation helpers for the "Trends at a glance"
// band on the Trends page. No DOM / no Chart.js: only the data shaping is exercised here.
import {
  reactionMix, topDrivers, reasonCounts, coverage, shortLabel,
} from '../../assets/js/refinement/trends-glance.js';

export async function register({ test, assert, assertEqual }) {
  const at = (iso, reaction, reasons = []) => ({
    listing_id: `l-${iso}-${reaction}`, reaction, reasons,
    created_at: new Date(iso).getTime() ? iso : '2026-06-01T09:00:00Z',
  });

  test('reactionMix counts individual likes/passes/rejects, sweeps stripped', () => {
    // 6 rejects in the same minute = a bulk sweep (excluded from the honest mix).
    const sweep = Array.from({ length: 6 }, (_, i) => ({
      listing_id: `s${i}`, reaction: 'reject', reasons: [],
      created_at: new Date('2026-06-01T12:00:00Z').getTime() + i * 1000,
    })).map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
    const log = [
      at('2026-06-01T09:00:00Z', 'like'),
      at('2026-06-01T09:30:00Z', 'reject'),
      at('2026-06-01T10:00:00Z', 'pass'),
      ...sweep,
    ];
    const m = reactionMix(log);
    assertEqual(m.liked, 1, 'one genuine like');
    assertEqual(m.rejected, 1, 'one individual reject (sweep excluded)');
    assertEqual(m.passed, 1, 'one pass');
    assertEqual(m.total, 3, 'sweep of 6 not counted in total');
  });

  test('reactionMix is safe on empty / nullish input', () => {
    assertEqual(reactionMix(null).total, 0);
    assertEqual(reactionMix([]).liked, 0);
  });

  test('shortLabel formats each signal kind compactly', () => {
    assertEqual(shortLabel('type:semi-detached'), 'Semi Detached');
    assertEqual(shortLabel('beds:3'), '3 beds');
    assertEqual(shortLabel('beds:1'), '1 bed');
    assertEqual(shortLabel('outcode:so21'), 'SO21');
    assertEqual(shortLabel('price-band:300-350k'), '£300-350k');
    assertEqual(shortLabel('parking:no'), 'No parking');
  });

  test('topDrivers sorts by absolute weight and keeps the sign', () => {
    const derived = {
      'type:detached': { weight: 0.4, n_liked: 8, n_rejected: 1 },
      'type:flat': { weight: -0.9, n_liked: 0, n_rejected: 12 },
      'beds:3': { weight: 0.1, n_liked: 5, n_rejected: 4 },
      'beds:1': { weight: 0, n_liked: 0, n_rejected: 0 },
      // step 4.7: recompute persists reason counts under a reserved derived key —
      // no numeric .weight, so the chart helpers must treat it as inert.
      __reason_counts: { reject: [{ key: 'too_expensive', count: 7 }], like: [] },
    };
    const rows = topDrivers(derived, 6);
    assertEqual(rows.length, 3, 'zero-weight signal dropped');
    assert(!rows.some((r) => r.signal === '__reason_counts'), 'reserved counts key dropped');
    assertEqual(rows[0].signal, 'type:flat', 'largest magnitude first');
    assert(rows[0].weight < 0, 'reject-leaning sign preserved');
    assertEqual(rows[1].label, 'Detached');
    assert(topDrivers(null).length === 0, 'nullish derived → empty');
  });

  test('reasonCounts ranks reject and like reasons, ignoring unknown keys', () => {
    const log = [
      { reaction: 'reject', reasons: [{ key: 'too_expensive' }, { key: 'wrong_area' }] },
      { reaction: 'reject', reasons: [{ key: 'too_expensive' }] },
      { reaction: 'reject', reasons: [{ key: 'removed_area' }] }, // system key → ignored
      { reaction: 'like', reasons: ['great_area'] },              // bare-string form
      { reaction: 'like', reasons: [{ key: 'great_area' }, { key: 'good_value' }] },
    ];
    const { reject, like } = reasonCounts(log, 5);
    assertEqual(reject[0].key, 'too_expensive');
    assertEqual(reject[0].count, 2);
    assertEqual(reject[0].label, 'Too expensive');
    assert(!reject.some((r) => r.key === 'removed_area'), 'system reject key excluded');
    assertEqual(like[0].key, 'great_area');
    assertEqual(like[0].count, 2);
  });

  test('coverage marks searched types liked vs never picked', () => {
    const criteria = { propertyTypes: ['Detached', 'Terraced', 'Bungalow'] };
    const derived = {
      'type:detached': { n_liked: 3 },
      'type:bungalow': { n_liked: 0 },
    };
    const rows = coverage(criteria, derived);
    assertEqual(rows.length, 3);
    assertEqual(rows.find((r) => r.type === 'Detached').liked, true);
    assertEqual(rows.find((r) => r.type === 'Terraced').liked, false, 'no signal → never');
    assertEqual(rows.find((r) => r.type === 'Bungalow').liked, false, 'n_liked 0 → never');
    assertEqual(coverage({}, {}).length, 0, 'no criteria → empty');
  });
}
