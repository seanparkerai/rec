// tests/listings-picker-state.test.js — the pure reaction-picker draft reducer
// (assets/js/listings/picker-state.js, P11a). The draft is the picker's un-saved
// in-progress state, preserved across feed repaints; these tests pin the reducer
// semantics the UI relies on: hydration round-trips, verb-switch clearing,
// primary/sub toggling, and the dirty check that decides whether a rebuilt card
// renders as "Saved ✓" or stays editable.
import {
  emptyDraft, draftFromDecision, applyVerb, togglePrimary, toggleSub,
  reasonsArray, isDirty,
} from '../../assets/js/listings/picker-state.js';

export async function register({ test, assert, assertEqual }) {
  const saved = {
    reaction: 'reject',
    reasons: [
      { key: 'too_small', detail: 'beds', note: null },
      { key: 'too_small', detail: 'plot', note: null },
      { key: 'wrong_area', detail: null, note: null },
    ],
  };

  test('picker-state: draftFromDecision round-trips through reasonsArray', () => {
    const draft = draftFromDecision(saved);
    assertEqual(draft.verb, 'reject');
    assertEqual(JSON.stringify(reasonsArray(draft)), JSON.stringify(saved.reasons),
      'hydrate → serialise reproduces the saved reasons (order + details)');
  });

  test('picker-state: null/empty decision hydrates to an empty draft', () => {
    assertEqual(JSON.stringify(draftFromDecision(null)), JSON.stringify(emptyDraft()));
    assertEqual(reasonsArray(draftFromDecision(null)).length, 0);
  });

  test('picker-state: switching verb clears reasons; re-tapping the same verb keeps them', () => {
    const draft = draftFromDecision(saved);
    const switched = applyVerb(draft, 'like');
    assertEqual(switched.verb, 'like');
    assertEqual(reasonsArray(switched).length, 0, 'reject reasons are meaningless for a like');
    const same = applyVerb(draft, 'reject');
    assertEqual(JSON.stringify(reasonsArray(same)), JSON.stringify(saved.reasons), 'same verb is a no-op on reasons');
  });

  test('picker-state: togglePrimary off drops that key\'s sub-reasons; on appends', () => {
    const draft = draftFromDecision(saved);
    const off = togglePrimary(draft, 'too_small');
    assert(!off.primary.includes('too_small'), 'primary removed');
    assertEqual(off.subs.too_small, undefined, 'its sub-details went with it');
    assertEqual(JSON.stringify(reasonsArray(off)), JSON.stringify([{ key: 'wrong_area', detail: null, note: null }]));
    const on = togglePrimary(off, 'busy_road');
    assert(on.primary.includes('busy_road'), 'new primary appended');
    assertEqual(reasonsArray(on).length, 2);
  });

  test('picker-state: toggleSub adds and removes a detail; empty set collapses to the bare primary', () => {
    let draft = applyVerb(emptyDraft(), 'reject');
    draft = togglePrimary(draft, 'needs_work');
    draft = toggleSub(draft, 'needs_work', 'structural');
    assertEqual(JSON.stringify(reasonsArray(draft)), JSON.stringify([{ key: 'needs_work', detail: 'structural', note: null }]));
    draft = toggleSub(draft, 'needs_work', 'structural');
    assertEqual(JSON.stringify(reasonsArray(draft)), JSON.stringify([{ key: 'needs_work', detail: null, note: null }]),
      'last detail off → one bare-primary entry, not zero entries');
  });

  test('picker-state: reducer calls never mutate their input draft', () => {
    const draft = draftFromDecision(saved);
    const before = JSON.stringify(draft);
    applyVerb(draft, 'like');
    togglePrimary(draft, 'too_small');
    toggleSub(draft, 'too_small', 'beds');
    assertEqual(JSON.stringify(draft), before, 'input untouched by all three reducers');
  });

  test('picker-state: isDirty is false for an untouched hydration, true after any tap', () => {
    const draft = draftFromDecision(saved);
    assertEqual(isDirty(draft, saved), false, 'clean hydration is not dirty');
    assertEqual(isDirty(toggleSub(draft, 'too_small', 'storage'), saved), true, 'a sub tap dirties');
    assertEqual(isDirty(applyVerb(draft, 'like'), saved), true, 'a verb switch dirties');
    assertEqual(isDirty(emptyDraft(), null), false, 'no decision + no input = clean');
    assertEqual(isDirty(applyVerb(emptyDraft(), 'reject'), null), true, 'first verb tap on a fresh card is dirty');
  });

  test('picker-state: isDirty ignores chip-tap ordering', () => {
    let a = applyVerb(emptyDraft(), 'reject');
    a = togglePrimary(a, 'wrong_area');
    a = togglePrimary(a, 'too_small');
    const decision = { reaction: 'reject', reasons: [{ key: 'too_small', detail: null }, { key: 'wrong_area', detail: null }] };
    assertEqual(isDirty(a, decision), false, 'same set in a different order is not a divergence');
  });
}
