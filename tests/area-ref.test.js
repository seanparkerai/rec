// tests/area-ref.test.js — pure-logic tests for the household-scoped area-reference
// resolver (assets/js/areas/area-ref.js). Covers the live/pending classification, the
// canonical display object, the household-array-driven name lookup, and graceful
// fallback for an id the household hasn't selected. Node-only; wired into
// run-intelligence-tests.mjs.
import {
  isPendingArea, isLiveArea, resolveAreaRef, buildAreaIndex, resolveAreaById,
} from '../assets/js/areas/area-ref.js';

export async function register({ test, assert, assertEqual }) {
  // A curated, fetchable catalog area (the common case).
  const curated = {
    id: 'oakley-rg23', name: 'Oakley', town: 'Basingstoke', county: 'Hampshire',
    status: 'researched', active: true, source: 'curated', verified: true,
  };
  // A household-onboarding stub: provisional, not yet in the fetch catchment.
  const stub = {
    id: 'west-meon-hampshire', name: 'West Meon', town: 'Hampshire', county: 'Hampshire',
    status: 'stub', active: false, source: 'household-onboarding', verified: false,
  };

  // ── classification ──────────────────────────────────────────────────────────
  test('area-ref: a curated catalog area is Live, not pending', () => {
    assertEqual(isPendingArea(curated), false);
    assertEqual(isLiveArea(curated), true);
  });

  test('area-ref: a household-onboarding stub is Pending, not live', () => {
    assertEqual(isPendingArea(stub), true);
    assertEqual(isLiveArea(stub), false);
  });

  test('area-ref: active===false alone marks pending even without the onboarding source', () => {
    assert(isPendingArea({ id: 'x', active: false, source: 'curated' }), 'pruned area is pending');
  });

  test('area-ref: an early research status marks pending when active is unknown', () => {
    assert(isPendingArea({ id: 'x', status: 'drafted' }), 'drafted + no active → pending');
    // …but a curated area stays live at partial status when it is active/fetchable
    assert(isLiveArea({ id: 'y', status: 'partial', active: true }), 'active partial → live');
  });

  // ── display object ──────────────────────────────────────────────────────────
  test('area-ref: resolveAreaRef returns the canonical display shape', () => {
    const ref = resolveAreaRef(curated);
    assertEqual(ref.id, 'oakley-rg23');
    assertEqual(ref.name, 'Oakley');
    assertEqual(ref.town, 'Basingstoke');
    assertEqual(ref.county, 'Hampshire');
    assertEqual(ref.isLive, true);
    assertEqual(ref.isPending, false);
  });

  test('area-ref: town falls back through subRegion → county when absent', () => {
    assertEqual(resolveAreaRef({ id: 'a', name: 'A', subRegion: 'Test Valley' }).town, 'Test Valley');
    assertEqual(resolveAreaRef({ id: 'b', name: 'B', county: 'Hampshire' }).town, 'Hampshire');
    assertEqual(resolveAreaRef(null), null);
  });

  // ── household-array-driven name lookup ───────────────────────────────────────
  test('area-ref: resolveAreaById resolves a name from the household array', () => {
    const household = [curated, stub];
    assertEqual(resolveAreaById('west-meon-hampshire', household).name, 'West Meon');
    assertEqual(resolveAreaById('west-meon-hampshire', household).isPending, true);
    // accepts a prebuilt index too
    const idx = buildAreaIndex(household);
    assertEqual(resolveAreaById('oakley-rg23', idx).name, 'Oakley');
    assertEqual(resolveAreaById('oakley-rg23', idx).isLive, true);
  });

  test('area-ref: an id not in the household selection degrades gracefully (no raw-id leak)', () => {
    const ref = resolveAreaById('some-unselected-id', [curated]);
    assertEqual(ref.isUnknown, true);
    assertEqual(ref.name, null); // caller falls back to its own copy, never shows the id
    assertEqual(resolveAreaById(null, [curated]), null);
  });

  test('area-ref: buildAreaIndex skips null/idless rows', () => {
    const idx = buildAreaIndex([curated, null, { name: 'no id' }]);
    assertEqual(idx.size, 1);
    assert(idx.has('oakley-rg23'), 'curated row indexed');
  });
}
