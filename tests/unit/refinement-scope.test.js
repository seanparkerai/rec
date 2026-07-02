// tests/refinement-scope.test.js — Stage 6 enforcement + Stage 8 invariant
// (docs/archive/REFINEMENT_PLAN.md §6/§8). PURE scope maths: active-area derivation, probation
// subtraction, the exploration re-probe cadence, the drift invariant, and the
// reconsider detection (step 4.6b: post-probation reject rate < RECONSIDER_RATE
// flips the paused row's status hint — notify-only, the area STAYS paused).
import {
  activeAreaIds, probationAreaSet, reprobeThisRun, probationDropIds, scopeInvariant,
  reconsiderUpdates,
} from '../../assets/js/refinement/scope.js';
import { resolveConfig } from '../../assets/js/refinement/config.js';

export async function register({ test, assert, assertEqual }) {
  const cfg = resolveConfig();
  const areas = [
    { id: 'chillworth-so16', active: false },
    { id: 'hambledon-po7', active: true },
    { id: 'whiteley-po15' }, // active defaults to true (undefined !== false)
    { id: 'swanmore-so32', active: true },
  ];
  const prob = (over = {}) => ({ dimension: 'area', value: 'hambledon-po7', status: 'active', reprobe_every_runs: 6, last_reprobe_run: 0, ...over });

  test('scope: activeAreaIds keeps everything except active===false', () => {
    const a = activeAreaIds(areas);
    assert(a.has('hambledon-po7') && a.has('whiteley-po15') && a.has('swanmore-so32'), 'active + default-active kept');
    assert(!a.has('chillworth-so16'), 'active:false dropped');
  });

  test('scope: probationAreaSet pauses active+reconsider, ignores restored and non-area', () => {
    const s = probationAreaSet([
      prob({ value: 'hambledon-po7', status: 'active' }),
      prob({ value: 'swanmore-so32', status: 'reconsider' }),
      prob({ value: 'whiteley-po15', status: 'restored' }),
      { dimension: 'property_type', value: 'terraced', status: 'active' },
    ]);
    assert(s.has('hambledon-po7') && s.has('swanmore-so32'), 'active + reconsider pause');
    assert(!s.has('whiteley-po15'), 'restored does not pause');
    assert(!s.has('terraced'), 'property-type probation is not a scrape pause');
  });

  test('scope: with no run index nothing is re-probed (probation fully enforced)', () => {
    const rows = [prob()];
    assertEqual(reprobeThisRun(rows, null, cfg).size, 0, 'no re-probe without a run index');
    assertEqual(probationDropIds(rows, null, cfg).has('hambledon-po7'), true, 'paused area is dropped');
  });

  test('scope: re-probe fires once runIndex - last_reprobe_run reaches the cadence', () => {
    const rows = [prob({ reprobe_every_runs: 6, last_reprobe_run: 0 })];
    assertEqual(reprobeThisRun(rows, 5, cfg).has('hambledon-po7'), false, 'run 5 < cadence 6 → still paused');
    assertEqual(reprobeThisRun(rows, 6, cfg).has('hambledon-po7'), true, 'run 6 → re-probe');
    // a re-probed area is NOT dropped this run (it gets re-included for exploration)
    assertEqual(probationDropIds(rows, 6, cfg).has('hambledon-po7'), false, 're-probe re-includes the area');
    assertEqual(probationDropIds(rows, 6, cfg).size, 0);
  });

  test('scope: re-probe cadence advances from last_reprobe_run, not from zero', () => {
    const rows = [prob({ reprobe_every_runs: 6, last_reprobe_run: 6 })];
    assertEqual(reprobeThisRun(rows, 11, cfg).size, 0, 'only 5 runs since last re-probe');
    assertEqual(reprobeThisRun(rows, 12, cfg).has('hambledon-po7'), true, '6 runs later → re-probe again');
  });

  test('scope: scopeInvariant flags paused-but-active and stale (paused-but-inactive)', () => {
    const inv = scopeInvariant(areas, [
      prob({ value: 'hambledon-po7', status: 'active' }),   // active in areas → must be dropped
      prob({ value: 'chillworth-so16', status: 'active' }), // already active:false → stale
    ]);
    assertEqual(inv.probationedButActive.join(','), 'hambledon-po7');
    assertEqual(inv.probationedNotActive.join(','), 'chillworth-so16');
  });

  // ── reconsider detection (step 4.6b) ─────────────────────────────────────────
  const APPROVED = '2026-06-01T00:00:00Z';
  const pRow = (over = {}) => prob({ approved_at: APPROVED, ...over });
  let rSeq = 0;
  const react = (reaction, over = {}) => ({
    listing_id: `R${rSeq++}`,
    reaction,
    created_at: '2026-06-20T00:00:00Z', // after APPROVED
    listing_snapshot: { area_id: 'hambledon-po7' },
    ...over,
  });
  const many = (reaction, count, over = {}) =>
    Array.from({ length: count }, () => react(reaction, over));

  test('reconsider: flips active→reconsider when post-probation reject rate < RECONSIDER_RATE', () => {
    const ups = reconsiderUpdates([pRow()], [...many('like', 4), ...many('reject', 2)], cfg);
    assertEqual(ups.length, 1, 'one flip');
    assertEqual(ups[0].value, 'hambledon-po7');
    assertEqual(ups[0].from, 'active');
    assertEqual(ups[0].to, 'reconsider');
    assertEqual(ups[0].n, 6, 'six post-probation trials');
    assert(Math.abs(ups[0].rate - 2 / 6) < 1e-9, 'rate = rejects/trials');
  });

  test('reconsider: holds below RECONSIDER_MIN_REACTIONS (no flip on thin evidence)', () => {
    const ups = reconsiderUpdates([pRow()], [...many('like', 3), ...many('reject', 1)], cfg);
    assertEqual(ups.length, 0, `n=4 < min ${cfg.RECONSIDER_MIN_REACTIONS} → no flip`);
  });

  test('reconsider: pre-probation reactions are not evidence', () => {
    const before = { created_at: '2026-05-20T00:00:00Z' }; // before approved_at
    const ups = reconsiderUpdates([pRow()], many('like', 8, before), cfg);
    assertEqual(ups.length, 0, 'old likes prove nothing about the pause');
  });

  test('reconsider: high reject rate keeps active paused AND walks a reconsider hint back', () => {
    const rows = [
      pRow({ value: 'hambledon-po7', status: 'active' }),
      pRow({ value: 'swanmore-so32', status: 'reconsider' }),
    ];
    const stillBad = (area) => [
      ...many('reject', 5, { listing_snapshot: { area_id: area } }),
      ...many('like', 1, { listing_snapshot: { area_id: area } }),
    ];
    const ups = reconsiderUpdates(rows, [...stillBad('hambledon-po7'), ...stillBad('swanmore-so32')], cfg);
    assertEqual(ups.length, 1, 'active row with rate ≥ RECONSIDER_RATE is untouched');
    assertEqual(ups[0].value, 'swanmore-so32');
    assertEqual(ups[0].from, 'reconsider');
    assertEqual(ups[0].to, 'active', 'evidence no longer supports the hint → walked back');
  });

  test('reconsider: restored rows, non-area rows and other-area reactions are ignored', () => {
    const rows = [
      pRow({ value: 'whiteley-po15', status: 'restored' }),
      { dimension: 'property_type', value: 'terraced', status: 'active', approved_at: APPROVED },
      pRow({ value: 'hambledon-po7', status: 'active' }),
    ];
    const noise = [
      ...many('like', 8, { listing_snapshot: { area_id: 'whiteley-po15' } }),
      ...many('like', 8, { listing_snapshot: {} }), // no area on the snapshot
    ];
    assertEqual(reconsiderUpdates(rows, noise, cfg).length, 0,
      'restored/non-area rows never flip; area-less reactions are not evidence');
  });

  test('reconsider: a pass counts as a non-reject trial (EXCLUDE_PASSES mirror)', () => {
    const ups = reconsiderUpdates([pRow()], [...many('pass', 3), ...many('reject', 2)], cfg);
    assertEqual(ups.length, 1, 'n=5 trials with rate 0.4 < 0.6 → flip');
    assertEqual(ups[0].n, 5);
    const strict = reconsiderUpdates(
      [pRow()], [...many('pass', 3), ...many('reject', 2)], { ...cfg, EXCLUDE_PASSES: true });
    assertEqual(strict.length, 0, 'with EXCLUDE_PASSES only 2 trials remain → below min');
  });
}
