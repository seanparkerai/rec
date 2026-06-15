// tests/suggestions-apply.test.js — the action router (storage injected, no Supabase).
import {
  applySuggestion, snoozeSuggestionUnified, dismissSuggestionUnified, SNOOZE_DAYS, DISMISS_SENTINEL,
} from '../assets/js/suggestions/apply.js';

export async function register({ test, assert, assertEqual }) {
  // A recording stub for every writer the router can call.
  function makeDeps() {
    const calls = [];
    const rec = (name) => (...args) => { calls.push({ name, args }); return Promise.resolve(true); };
    return {
      calls,
      setAreaRadiusOverride: rec('setAreaRadiusOverride'),
      raiseBudgetMax: rec('raiseBudgetMax'),
      lowerMinBeds: rec('lowerMinBeds'),
      acceptPropertyType: rec('acceptPropertyType'),
      excludePropertyType: rec('excludePropertyType'),
      stopSearchingArea: rec('stopSearchingArea'),
      hideSuggestion: rec('hideSuggestion'),
      snoozeSuggestion: rec('snoozeSuggestion'),
      dismissSuggestion: rec('dismissSuggestion'),
      setConflictState: rec('setConflictState'),
    };
  }

  test('apply: setAreaRadius forwards areaId + miles', async () => {
    const deps = makeDeps();
    await applySuggestion({ apply: { fn: 'setAreaRadius', args: { areaId: 'wherwell-sp11', miles: 2 } } }, deps);
    assertEqual(deps.calls[0].name, 'setAreaRadiusOverride');
    assertEqual(deps.calls[0].args[0], 'wherwell-sp11');
    assertEqual(deps.calls[0].args[1], 2);
  });

  test('apply: stopArea forwards the area value', async () => {
    const deps = makeDeps();
    await applySuggestion({ apply: { fn: 'stopArea', args: { value: 'foo-sp1' } } }, deps);
    assertEqual(deps.calls[0].name, 'stopSearchingArea');
    assertEqual(deps.calls[0].args[0].value, 'foo-sp1');
  });

  test('apply: raiseBudget / lowerMinBeds forward the proposed value', async () => {
    const deps = makeDeps();
    await applySuggestion({ apply: { fn: 'raiseBudget', args: { value: 465000 } } }, deps);
    await applySuggestion({ apply: { fn: 'lowerMinBeds', args: { value: 2 } } }, deps);
    assertEqual(deps.calls[0].name, 'raiseBudgetMax');
    assertEqual(deps.calls[0].args[0], 465000);
    assertEqual(deps.calls[1].name, 'lowerMinBeds');
    assertEqual(deps.calls[1].args[0], 2);
  });

  test('apply: acceptType re-accepts every matched type', async () => {
    const deps = makeDeps();
    await applySuggestion({ apply: { fn: 'acceptType', args: { values: ['Flat / Apartment', 'Park / Mobile Home'] } } }, deps);
    assertEqual(deps.calls.length, 2);
    assert(deps.calls.every((c) => c.name === 'acceptPropertyType'), 'all acceptPropertyType');
  });

  test('apply: engine excludeType also hides matching listings; live does not', async () => {
    const eng = makeDeps();
    await applySuggestion({ source: 'engine', apply: { fn: 'excludeType', args: { value: 'terraced' } } }, eng);
    assert(eng.calls.some((c) => c.name === 'excludePropertyType'), 'excluded');
    assert(eng.calls.some((c) => c.name === 'hideSuggestion'), 'engine also hides');

    const live = makeDeps();
    await applySuggestion({ source: 'live', apply: { fn: 'excludeType', args: { value: 'terraced' } } }, live);
    assert(!live.calls.some((c) => c.name === 'hideSuggestion'), 'live does not hide');
  });

  test('apply: a suggestion with no apply descriptor is a no-op', async () => {
    const deps = makeDeps();
    const ok = await applySuggestion({ apply: null }, deps);
    assertEqual(ok, false);
    assertEqual(deps.calls.length, 0);
  });

  test('apply: snooze routes engine→row status, live→dismissals object', async () => {
    const eng = makeDeps();
    await snoozeSuggestionUnified({ source: 'engine', dimension: 'area', value: 'foo-sp1' }, eng);
    assertEqual(eng.calls[0].name, 'snoozeSuggestion');
    assertEqual(eng.calls[0].args[0].days, SNOOZE_DAYS);

    const live = makeDeps();
    await snoozeSuggestionUnified({ source: 'live', id: 'tighten:foo' }, live);
    assertEqual(live.calls[0].name, 'setConflictState');
    assertEqual(live.calls[0].args[0], 'tighten:foo');
    assertEqual(live.calls[0].args[1].kind, 'snooze');
  });

  test('apply: dismiss routes engine→row status, live→far-future dismissals', async () => {
    const eng = makeDeps();
    await dismissSuggestionUnified({ source: 'engine', dimension: 'property_type', value: 'terraced' }, eng);
    assertEqual(eng.calls[0].name, 'dismissSuggestion');

    const live = makeDeps();
    await dismissSuggestionUnified({ source: 'live', id: 'conflict:over-budget' }, live);
    assertEqual(live.calls[0].name, 'setConflictState');
    assertEqual(live.calls[0].args[1].until, DISMISS_SENTINEL);
  });
}
