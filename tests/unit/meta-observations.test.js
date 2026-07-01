// tests/meta-observations.test.js — v3 L5 recommendation-loop core.
// Covers the 3-condition conflict trigger (and that it stays off noise), the
// 14-day dismissal, and each conflict kind.
import {
  detectConflicts, dismissUntil,
} from '../../assets/js/meta-observations.js';
import { META_OBS } from '../../assets/js/intelligence-constants.js';

export async function register({ test, assert, assertEqual }) {
  const DAY = 86_400_000;
  const NOW = new Date('2026-05-31T00:00:00Z');
  const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();

  const criteria = {
    budget: { max: 400_000 },
    size: { minBeds: 3 },
    propertyTypePrefs: { excluded: ['Flat / Apartment', 'Park / Mobile Home'] },
  };

  const like = (over = {}, days = 1, id = Math.random().toString(36).slice(2)) => ({
    id, listing_id: id, reaction: 'like', created_at: ago(days),
    listing_snapshot: { price: 350_000, beds: 4, property_type: 'Detached', ...over },
  });
  const many = (n, over = {}, days = 1) =>
    Array.from({ length: n }, (_, i) => like(over, days, `l-${JSON.stringify(over)}-${i}`));

  // ── 3-condition trigger ─────────────────────────────────────────────────
  test('meta-obs: an over-budget pattern fires when all 3 conditions hold', () => {
    // 4 over-budget likes + 1 in-budget → count 4 ≥ 3, share 0.8 ≥ 0.6, recent.
    const reactions = [...many(4, { price: 460_000 }), like({ price: 380_000 })];
    const conflicts = detectConflicts(reactions, criteria, { now: NOW });
    const c = conflicts.find((x) => x.kind === 'over-budget');
    assert(c, 'over-budget conflict raised');
    assertEqual(c.count, 4);
    assert(c.share >= 0.6, `share ${c.share}`);
  });

  test('meta-obs: a single outlier does NOT fire (share + count guards)', () => {
    const reactions = [like({ price: 460_000 }), ...many(6, { price: 360_000 })];
    const conflicts = detectConflicts(reactions, criteria, { now: NOW });
    assert(!conflicts.some((c) => c.kind === 'over-budget'), 'one outlier is noise, not a conflict');
  });

  test('meta-obs: a stale-only pattern does NOT fire (recency condition)', () => {
    const reactions = many(5, { price: 460_000 }, 120); // all 120 days old
    const conflicts = detectConflicts(reactions, criteria, { now: NOW });
    assert(!conflicts.some((c) => c.kind === 'over-budget'), 'stale pattern suppressed');
  });

  test('meta-obs: pass/reject are never counted as a like conflict', () => {
    const reactions = many(5, { price: 460_000 }).map((r) => ({ ...r, reaction: 'pass' }));
    assertEqual(detectConflicts(reactions, criteria, { now: NOW }).length, 0);
  });

  // ── kinds ───────────────────────────────────────────────────────────────
  test('meta-obs: excluded-type conflict fires on repeated liked exclusions', () => {
    const reactions = many(3, { property_type: 'Flat / Apartment' });
    const c = detectConflicts(reactions, criteria, { now: NOW }).find((x) => x.kind === 'excluded-type');
    assert(c, 'excluded-type conflict raised');
    assert(/flat/i.test(c.message), 'names the type');
  });

  test('meta-obs: below-min-beds conflict fires under the bed minimum', () => {
    const reactions = many(3, { beds: 2 });
    const c = detectConflicts(reactions, criteria, { now: NOW }).find((x) => x.kind === 'below-min-beds');
    assert(c, 'below-min-beds conflict raised');
    assert(c.threshold === 3, 'carries the minimum');
  });

  // ── dismissal ───────────────────────────────────────────────────────────
  test('meta-obs: a dismissed conflict stays quiet, then returns after the window', () => {
    const reactions = many(4, { price: 460_000 });
    const dismissals = { 'conflict:over-budget': dismissUntil(NOW, META_OBS.DISMISS_DAYS) };
    const quiet = detectConflicts(reactions, criteria, { now: NOW, dismissals });
    assert(!quiet.some((c) => c.kind === 'over-budget'), 'dismissed within window');
    const later = new Date(NOW.getTime() + (META_OBS.DISMISS_DAYS + 1) * DAY);
    const back = detectConflicts(reactions, criteria, { now: later, dismissals });
    assert(back.some((c) => c.kind === 'over-budget'), 'returns after the dismissal window');
  });

  // ── L7.5 geofence tuning (surfaced, never silent) ─────────────────────────
  const likeAt = (areaId, mi, days = 1, id = Math.random().toString(36).slice(2)) => ({
    id, listing_id: id, reaction: 'like', created_at: ago(days),
    listing_snapshot: { price: 350_000, beds: 4, property_type: 'Detached', area_id: areaId, distance_mi: mi },
  });
  const rejectIn = (areaId, oc, days = 1, id = Math.random().toString(36).slice(2)) => ({
    id, listing_id: id, reaction: 'reject', created_at: ago(days),
    listing_snapshot: { price: 350_000, beds: 4, property_type: 'Detached', area_id: areaId, outcode: oc },
  });

  test('meta-obs: tighten-buffer fires when every like sits well inside a wide buffer', () => {
    const reactions = [likeAt('wherwell-sp11', 0.8), likeAt('wherwell-sp11', 1.1), likeAt('wherwell-sp11', 0.9)];
    const areas = { 'wherwell-sp11': { name: 'Wherwell', geofenceRadiusMi: 5 } };
    const c = detectConflicts(reactions, criteria, { now: NOW, areas }).find((x) => x.kind === 'tighten-buffer');
    assert(c, 'tighten suggestion raised'); assert(/Tighten Wherwell to ~2 mi/.test(c.suggestion), c && c.suggestion);
    // The Apply action needs the proposed radius + which area to apply it to.
    assertEqual(c.proposed, 2, 'exposes the proposed radius');
    assertEqual(c.areaId, 'wherwell-sp11', 'exposes the area id');
    assertEqual(c.threshold, 5, 'carries the current radius');
  });

  test('meta-obs: tighten-buffer stays quiet when likes already use the buffer', () => {
    const reactions = [likeAt('wherwell-sp11', 2.8), likeAt('wherwell-sp11', 2.9), likeAt('wherwell-sp11', 2.7)];
    const areas = { 'wherwell-sp11': { name: 'Wherwell', geofenceRadiusMi: 3 } };
    assert(!detectConflicts(reactions, criteria, { now: NOW, areas }).some((x) => x.kind === 'tighten-buffer'), 'no churny nudge');
  });

  test('meta-obs: stop-searching fires for a prune-candidate area with rejects and no likes', () => {
    const reactions = [rejectIn('hatherden-sp11', 'SP11'), rejectIn('hatherden-sp11', 'SP11'), rejectIn('hatherden-sp11', 'SP11')];
    const opts = { now: NOW, areas: { 'hatherden-sp11': { name: 'Hatherden' } }, pruneCandidates: { areas: ['hatherden-sp11'], outcodes: [] } };
    const c = detectConflicts(reactions, criteria, opts).find((x) => x.kind === 'stop-searching');
    assert(c, 'prune suggestion raised'); assert(/Stop searching Hatherden/.test(c.suggestion), c && c.suggestion);
    assertEqual(c.areaId, 'hatherden-sp11', 'exposes the area id for Apply');
  });

  test('meta-obs: stop-searching NEVER fires where you have also liked', () => {
    const reactions = [rejectIn('hatherden-sp11', 'SP11'), rejectIn('hatherden-sp11', 'SP11'), rejectIn('hatherden-sp11', 'SP11'), likeAt('hatherden-sp11', 1.2)];
    const opts = { now: NOW, pruneCandidates: { areas: ['hatherden-sp11'], outcodes: [] } };
    assert(!detectConflicts(reactions, criteria, opts).some((x) => x.kind === 'stop-searching'), 'a single like protects the area');
  });

  test('meta-obs: L7.5 prompts honour the dismissal window like every other conflict', () => {
    const reactions = [rejectIn('hatherden-sp11', 'SP11'), rejectIn('hatherden-sp11', 'SP11'), rejectIn('hatherden-sp11', 'SP11')];
    const opts = { now: NOW, pruneCandidates: { areas: ['hatherden-sp11'], outcodes: [] } };
    const dismissals = { 'prune-area:hatherden-sp11': dismissUntil(NOW) };
    assert(!detectConflicts(reactions, criteria, { ...opts, dismissals }).some((x) => x.kind === 'stop-searching'), 'dismissed stays quiet');
  });

  // ── unified Snooze/Dismiss: the new object dismissal form ──────────────────
  test('meta-obs: an object-form { until } dismissal suppresses like a legacy ISO string', () => {
    // Likes are recent relative to both NOW and the +6-day check (inside CONFLICT_RECENCY_DAYS).
    const reactions = many(4, { price: 460_000 }, 0);
    // 5-day snooze stored as an object, not a bare ISO string.
    const snooze = { 'conflict:over-budget': { kind: 'snooze', until: dismissUntil(NOW, 5) } };
    assert(!detectConflicts(reactions, criteria, { now: NOW, dismissals: snooze }).some((c) => c.kind === 'over-budget'), 'object snooze suppresses within window');
    const later = new Date(NOW.getTime() + 6 * DAY);
    assert(detectConflicts(reactions, criteria, { now: later, dismissals: snooze }).some((c) => c.kind === 'over-budget'), 'returns after the object snooze elapses');
  });

  test('meta-obs: a far-future object dismissal stays quiet indefinitely', () => {
    const reactions = many(4, { price: 460_000 });
    const dismiss = { 'conflict:over-budget': { kind: 'dismiss', until: '9999-12-31T00:00:00Z' } };
    const farLater = new Date('2030-01-01T00:00:00Z');
    assert(!detectConflicts(reactions, criteria, { now: farLater, dismissals: dismiss }).some((c) => c.kind === 'over-budget'), 'permanent dismiss stays quiet');
  });
}
