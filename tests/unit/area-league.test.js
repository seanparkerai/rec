// tests/unit/area-league.test.js — the ranked per-area decision surface
// (refinement/area-league.js, 2026-07-05 overhaul). Worst-first ordering on the
// Wilson reject lower bound, reason aggregation, trend windows, evidence tiers,
// pause/radius annotation, sweep exclusion, and the headline.
import { buildAreaLeague, leagueHeadline } from '../../assets/js/refinement/area-league.js';

export async function register({ test, assert, assertEqual }) {
  const NOW = new Date('2026-07-05T12:00:00Z');
  const DAY = 86_400_000;
  let seq = 0;
  const react = (reaction, area, { daysAgo = 10, reason = null, reasons = null } = {}) => ({
    listing_id: `L${seq++}`,
    reaction,
    reason,
    reasons,
    created_at: new Date(NOW.getTime() - daysAgo * DAY - seq * 60_000).toISOString(),
    listing_snapshot: { area_id: area },
  });
  const many = (n, fn) => Array.from({ length: n }, fn);

  test('league: worst-first — the Wilson reject lower bound ranks by EVIDENCE, not raw rate', () => {
    seq = 0;
    const log = [
      ...many(20, () => react('reject', 'bad-sp1')),                                        // 20/20 rejected
      ...many(50, () => react('reject', 'big-sp2')), ...many(10, () => react('like', 'big-sp2')), // 50/60
      ...many(10, () => react('reject', 'small-sp0')),                                      // 10/10 — thinner
      ...many(5, () => react('like', 'good-sp3')), ...many(2, () => react('reject', 'good-sp3')),
    ];
    const rows = buildAreaLeague({ reactionLog: log, now: NOW });
    assertEqual(rows.map((r) => r.areaId).join(','), 'bad-sp1,big-sp2,small-sp0,good-sp3');
    assertEqual(rows[0].likes, 0);
    assertEqual(rows[0].judged, 20);
    assertEqual(rows[0].evidence, 'strong');
    // 50/60 rejected (0.72 lower bound) legitimately outranks 10/10 (0.66) — more
    // evidence of a high reject rate beats a perfect-but-thin record.
    assert(rows[1].rejectLower > rows[2].rejectLower, 'evidence-weighted ordering');
    assertEqual(rows[3].evidence, 'some');
  });

  test('league: top reason aggregates scalar reason + reasons[] and reports a share', () => {
    seq = 0;
    const log = [
      ...many(6, () => react('reject', 'dear-sp4', { reason: 'too_expensive' })),
      ...many(2, () => react('reject', 'dear-sp4', { reasons: [{ key: 'busy_road' }] })),
      react('like', 'dear-sp4'),
    ];
    const rows = buildAreaLeague({ reactionLog: log, now: NOW });
    const r = rows.find((x) => x.areaId === 'dear-sp4');
    assertEqual(r.topReason.key, 'too_expensive');
    assertEqual(r.topReason.label, 'Too expensive');
    assertEqual(r.topReason.pct, 75, '6 of 8 rejects');
  });

  test('league: trend compares the last 90 days to the prior window (min 4 each)', () => {
    seq = 0;
    const worsening = [
      // prior window: 2/6 rejected; recent: 6/6 rejected.
      ...many(4, () => react('like', 'turn-sp5', { daysAgo: 150 })),
      ...many(2, () => react('reject', 'turn-sp5', { daysAgo: 150 })),
      ...many(6, () => react('reject', 'turn-sp5', { daysAgo: 10 })),
    ];
    const rows = buildAreaLeague({ reactionLog: worsening, now: NOW });
    assertEqual(rows.find((r) => r.areaId === 'turn-sp5').trend, 'worsening');

    seq = 0;
    const thin = many(3, () => react('reject', 'thin-sp6', { daysAgo: 10 }));
    const rows2 = buildAreaLeague({ reactionLog: thin, now: NOW });
    assertEqual(rows2.find((r) => r.areaId === 'thin-sp6').trend, null, 'insufficient windows → null');
  });

  test('league: bulk sweeps and admin removals never count as judgement', () => {
    seq = 0;
    const genuine = [...many(3, () => react('reject', 'swept-sp7')), react('like', 'swept-sp7')];
    const burstAt = new Date(NOW.getTime() - 5 * DAY).toISOString();
    const sweep = many(30, (v, i) => ({
      listing_id: `S${i}`, reaction: 'reject', created_at: burstAt,
      listing_snapshot: { area_id: 'swept-sp7' },
    }));
    const admin = many(5, () => ({ ...react('reject', 'swept-sp7'), reason: 'removed_area' }));
    const rows = buildAreaLeague({ reactionLog: [...genuine, ...sweep, ...admin], now: NOW });
    assertEqual(rows.find((r) => r.areaId === 'swept-sp7').judged, 4, 'only genuine graded count');
  });

  test('league: annotates radius (tuning + household override), pause state and name', () => {
    seq = 0;
    const log = many(6, () => react('reject', 'wherwell-sp11'));
    const rows = buildAreaLeague({
      reactionLog: log,
      now: NOW,
      areasMeta: { 'wherwell-sp11': { name: 'Wherwell', geofenceRadiusMi: 3 } },
      tuning: [{ area_id: 'wherwell-sp11', search_radius_mi: 2.5, recommended_radius_mi: 1.2 }],
      radiusOverrides: { 'wherwell-sp11': 1.5 },
      probation: [{ dimension: 'area', value: 'wherwell-sp11', status: 'active' }],
    });
    const r = rows[0];
    assertEqual(r.name, 'Wherwell');
    assertEqual(r.radiusMi, 2.5, 'tuning radius wins over the catalog geofence');
    assertEqual(r.overrideMi, 1.5);
    assertEqual(r.recommendedMi, 1.2);
    assertEqual(r.paused, true);
    assertEqual(r.pausedStatus, 'active');
  });

  test('league: headline counts the zero-like strong-evidence areas', () => {
    seq = 0;
    const log = [
      ...many(10, () => react('reject', 'z1-sp1')),
      ...many(12, () => react('reject', 'z2-sp2')),
      ...many(10, () => react('reject', 'ok-sp3')), ...many(2, () => react('like', 'ok-sp3')),
    ];
    const rows = buildAreaLeague({ reactionLog: log, now: NOW });
    assertEqual(leagueHeadline(rows), '2 areas have 10+ judgements and not one like.');
    assertEqual(leagueHeadline([]), '');
  });
}
