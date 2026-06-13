// tests/refinement-scope.test.js — Stage 6 enforcement + Stage 8 invariant
// (docs/archive/REFINEMENT_PLAN.md §6/§8). PURE scope maths: active-area derivation, probation
// subtraction, the exploration re-probe cadence, and the drift invariant.
import {
  activeAreaIds, probationAreaSet, reprobeThisRun, probationDropIds, scopeInvariant,
} from '../assets/js/refinement/scope.js';
import { resolveConfig } from '../assets/js/refinement/config.js';

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
}
