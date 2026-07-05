// tests/unit/refinement-live.test.js — the LIVE client-side evaluation + merge layer
// (refinement/live.js, 2026-07-05 overhaul). Proves:
//   • time-based persistence: actionable iff gates clear in BOTH the now-snapshot and
//     the (now − PERSISTENCE_DAYS) snapshot — new patterns start as forming;
//   • sweeps/admin rejects are stripped before evaluation (provenance);
//   • dismissal/snooze suppression keys (permanent `dim:value` + timed `sug:dim:value`);
//   • the merge precedence matrix: user decisions win, live wins metrics, stale
//     engine-owned server rows drop, area_radius rows always pass through;
//   • an empty/unavailable log returns null and the merge falls back to server rows.
import { computeLiveRows, mergeSuggestionRows, liveSuppressKey, isLiveSuppressed, USER_DECISION_STATUSES } from '../../assets/js/refinement/live.js';
import { resolveConfig } from '../../assets/js/refinement/config.js';

export async function register({ test, assert, assertEqual }) {
  const NOW = new Date('2026-07-05T12:00:00Z');
  const DAY = 86_400_000;
  const cfg = resolveConfig({ preset: 'balanced' }); // PERSISTENCE_DAYS 7

  let seq = 0;
  // One reaction per minute so nothing trips the bulk-sweep (≥6/min) heuristic.
  const react = (reaction, { type = 'detached', area = 'a-1', daysAgo = 1 } = {}) => ({
    listing_id: `L${seq++}`,
    reaction,
    created_at: new Date(NOW.getTime() - daysAgo * DAY - (seq % 500) * 60_000).toISOString(),
    listing_snapshot: { property_type: type, area_id: area },
  });
  const many = (n, fn) => Array.from({ length: n }, fn);

  // A log where 'terraced' is overwhelmingly rejected vs a liked control type, spread
  // across MANY areas so no area pattern forms, with enough volume to open the gates
  // both now and at the 7-day cutoff.
  const strongTypeLog = (daysAgo) => [
    ...many(180, (v, i) => react('reject', { type: 'terraced', area: `a-${seq % 40}`, daysAgo })),
    ...many(90, () => react('like', { type: 'detached', area: `a-${seq % 40}`, daysAgo })),
    ...many(90, () => react('reject', { type: 'detached', area: `a-${seq % 40}`, daysAgo })),
  ];

  test('live: a pattern present in BOTH snapshots is actionable; a new one only forms', () => {
    seq = 0;
    const oldLog = strongTypeLog(30);                       // well before the cutoff
    const rows = computeLiveRows(oldLog, { now: NOW, config: cfg });
    const terr = rows.find((r) => r.dimension === 'property_type' && r.value === 'terraced');
    assert(terr, 'terraced pattern tracked');
    assertEqual(terr.status, 'actionable', 'persistent across both snapshots → actionable');
    assertEqual(terr.origin, 'live');
    assert(terr.metrics.wilson_lower > 0, 'metrics in refinement_suggestions shape');

    seq = 0;
    const freshLog = strongTypeLog(1);                      // entirely inside the window
    const rows2 = computeLiveRows(freshLog, { now: NOW, config: cfg });
    const terr2 = rows2.find((r) => r.dimension === 'property_type' && r.value === 'terraced');
    assert(terr2, 'fresh pattern tracked');
    assertEqual(terr2.status, 'forming', 'not yet present at the cutoff → forming only');
  });

  test('live: bulk sweeps and admin removals are stripped before evaluation', () => {
    seq = 0;
    const genuine = strongTypeLog(30);
    // A same-minute burst of 40 rejects of the LIKED type — a classic area sweep.
    const burstAt = new Date(NOW.getTime() - 2 * DAY).toISOString();
    const sweep = many(40, (v, i) => ({
      listing_id: `S${i}`, reaction: 'reject', created_at: burstAt,
      listing_snapshot: { property_type: 'detached', area_id: 'a-3' },
    }));
    const withSweep = computeLiveRows([...genuine, ...sweep], { now: NOW, config: cfg });
    seq = 0;
    const withOut = computeLiveRows(strongTypeLog(30), { now: NOW, config: cfg });
    const det = (rows) => rows.find((r) => r.value === 'detached' && r.dimension === 'property_type');
    const a = det(withSweep); const b = det(withOut);
    assertEqual(a?.metrics.k_raw ?? null, b?.metrics.k_raw ?? null,
      'sweep rejects do not inflate the detached reject count');
  });

  test('live: empty or missing log returns null; merge then keeps server rows untouched', () => {
    assertEqual(computeLiveRows([], { now: NOW, config: cfg }), null);
    assertEqual(computeLiveRows(null, { now: NOW, config: cfg }), null);
    const server = [{ dimension: 'area', value: 'a-1', status: 'actionable', metrics: {} }];
    assertEqual(mergeSuggestionRows(server, null), server, 'null live → server rows as-is');
  });

  test('live: suppression — permanent dismiss memory and timed sug: snooze keys', () => {
    const dismissals = {
      'property_type:terraced': { at: '2026-07-01T00:00:00Z' },       // engine dismiss memory
      [liveSuppressKey('area', 'a-9')]: { kind: 'snooze', until: '2026-08-01T00:00:00Z' },
      [liveSuppressKey('area', 'a-8')]: { kind: 'snooze', until: '2026-07-01T00:00:00Z' }, // expired
    };
    assertEqual(isLiveSuppressed(dismissals, 'property_type', 'Terraced', NOW), true, 'dismiss memory, normalised');
    assertEqual(isLiveSuppressed(dismissals, 'area', 'a-9', NOW), true, 'unexpired snooze');
    assertEqual(isLiveSuppressed(dismissals, 'area', 'a-8', NOW), false, 'expired snooze re-surfaces');
    assertEqual(isLiveSuppressed({}, 'area', 'a-9', NOW), false);

    seq = 0;
    const rows = computeLiveRows(strongTypeLog(30), { now: NOW, config: cfg, dismissals });
    assert(!rows.some((r) => r.dimension === 'property_type' && r.value === 'terraced'),
      'dismissed value emits no live row');
  });

  test('live merge: precedence matrix', () => {
    const live = [
      { dimension: 'area', value: 'a-1', status: 'actionable', metrics: { lift: 2 }, tier: 'probable', first_detected_at: '2026-06-28T00:00:00Z', origin: 'live' },
      { dimension: 'area', value: 'a-2', status: 'forming', metrics: { lift: 1.2 }, tier: 'forming', first_detected_at: '2026-07-05T00:00:00Z', origin: 'live' },
      { dimension: 'property_type', value: 'flat', status: 'actionable', metrics: { lift: 1.5 }, tier: 'confident', first_detected_at: '2026-06-28T00:00:00Z', origin: 'live' },
    ];
    const server = [
      // user decision + live counterpart → server status, live metrics, min first_detected_at
      { dimension: 'area', value: 'a-1', status: 'confirmed_scrape', metrics: { lift: 1.1 }, tier: 'strong', first_detected_at: '2026-06-01T00:00:00Z', snoozed_until: null },
      // engine-owned + live counterpart → live wins wholesale
      { dimension: 'area', value: 'a-2', status: 'actionable', metrics: { lift: 9 }, tier: 'strong', first_detected_at: '2026-06-02T00:00:00Z' },
      // engine-owned, NO live counterpart → stale, dropped
      { dimension: 'area', value: 'a-gone', status: 'forming', metrics: {}, first_detected_at: '2026-06-01T00:00:00Z' },
      // user decision, no live counterpart → passes through
      { dimension: 'property_type', value: 'bungalow', status: 'dismissed', metrics: {} },
      // snoozed + live counterpart → keeps snoozed status AND snoozed_until
      { dimension: 'property_type', value: 'flat', status: 'snoozed', snoozed_until: '2026-08-01T00:00:00Z', metrics: { lift: 1 }, first_detected_at: '2026-06-20T00:00:00Z' },
      // area_radius always passes through
      { dimension: 'area_radius', value: 'a-1', status: 'actionable', metrics: { recommended_mi: 1.5 } },
    ];
    const out = mergeSuggestionRows(server, live);
    const by = (d, v) => out.find((r) => r.dimension === d && r.value === v);

    const a1 = by('area', 'a-1');
    assertEqual(a1.status, 'confirmed_scrape', 'user decision wins');
    assertEqual(a1.metrics.lift, 2, 'live metrics under the user status');
    assertEqual(a1.first_detected_at, '2026-06-01T00:00:00Z', 'earliest detection kept');
    assertEqual(a1.origin, 'both');

    const a2 = by('area', 'a-2');
    assertEqual(a2.status, 'forming', 'live status replaces stale server actionable');
    assertEqual(a2.metrics.lift, 1.2, 'live metrics win');

    assertEqual(by('area', 'a-gone'), undefined, 'unsupported engine-owned server row drops');
    assertEqual(by('property_type', 'bungalow').status, 'dismissed', 'user decision passes through');

    const flat = by('property_type', 'flat');
    assertEqual(flat.status, 'snoozed', 'snooze survives');
    assertEqual(flat.snoozed_until, '2026-08-01T00:00:00Z', 'snoozed_until carried from server');

    assert(by('area_radius', 'a-1'), 'radius lane untouched');
    assertEqual(out.length, 5, 'no duplicates, one row per key (a-gone dropped)');
    assert([...USER_DECISION_STATUSES].length === 4, 'contract: four user-decision statuses');
  });
}
