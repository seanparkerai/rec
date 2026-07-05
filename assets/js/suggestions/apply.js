// suggestions/apply.js — the action router for a NormalizedSuggestion. Turns a one-click
// Apply / Snooze / Dismiss into the right storage write, branching on source + apply.fn.
// Storage writers are injected (default = the real storage layer) so the router is unit
// testable without touching Supabase.
import {
  setAreaRadiusOverride, raiseBudgetMax, lowerMinBeds, acceptPropertyType, excludePropertyType,
  stopSearchingArea, hideSuggestion, snoozeSuggestion, dismissSuggestion, setConflictState,
  keepAreaRadius,
} from '../storage.js';
import { dismissUntil } from '../meta-observations.js';
import { liveSuppressKey } from '../refinement/live.js';

export const SNOOZE_DAYS = 30;
// Far-future timestamp = a permanent dismiss in the learned_preferences.dismissals map
// (detectConflicts treats any future `until` as suppressed; this one never elapses).
export const DISMISS_SENTINEL = '9999-12-31T00:00:00.000Z';

const DEFAULT_DEPS = {
  setAreaRadiusOverride, raiseBudgetMax, lowerMinBeds, acceptPropertyType, excludePropertyType,
  stopSearchingArea, hideSuggestion, snoozeSuggestion, dismissSuggestion, setConflictState,
  keepAreaRadius,
};

/** Perform a suggestion's Apply action. Returns true on success. */
export async function applySuggestion(n, deps = DEFAULT_DEPS) {
  const a = n?.apply;
  if (!a || !a.fn) return false;
  const ar = a.args || {};
  switch (a.fn) {
    case 'setAreaRadius': return deps.setAreaRadiusOverride(ar.areaId, ar.miles);
    // One action, BOTH radius levers (2026-07-05): the instant household feed filter
    // (criteria.location.areaRadiusOverrides — visible on next paint) AND the tuner
    // intent (learned_preferences.overrides.__area_radius_override — the service-role
    // tuner pins area_search_tuning from it, shrinking the paid Apify search disk).
    case 'tightenRadiusBoth': {
      const okFeed = await deps.setAreaRadiusOverride(ar.areaId, ar.miles);
      const okIntent = await deps.keepAreaRadius({ areaId: ar.areaId, radiusMi: ar.miles });
      return okFeed && okIntent;
    }
    case 'stopArea':      return deps.stopSearchingArea({ value: ar.value });
    case 'raiseBudget':   return deps.raiseBudgetMax(ar.value);
    case 'lowerMinBeds':  return deps.lowerMinBeds(ar.value);
    case 'acceptType': {
      const vals = ar.values && ar.values.length ? ar.values : [ar.value];
      let ok = true;
      for (const v of vals) ok = (await deps.acceptPropertyType(v)) && ok;
      return ok;
    }
    case 'excludeType': {
      const ok = await deps.excludePropertyType(ar.value);
      // An engine type suggestion ALSO hides matching listings from the feed (the engine
      // lever); the criteria exclusion keeps the criteria form in sync.
      if (n.source === 'engine') await deps.hideSuggestion({ dimension: 'property_type', value: ar.value });
      return ok;
    }
    default: return false;
  }
}

/** Snooze a suggestion for 30 days (engine → row status; live → dismissals object). */
export async function snoozeSuggestionUnified(n, deps = DEFAULT_DEPS) {
  if (n.source === 'engine') {
    // A live-computed card has NO refinement_suggestions row to flip — the status
    // UPDATE would silently match nothing and the card would bounce straight back.
    // Its snooze memory lives in the dismissals map instead (computeLiveRows honours it).
    if (n.origin === 'live') {
      return deps.setConflictState(liveSuppressKey(n.dimension, n.value), { kind: 'snooze', until: dismissUntil(new Date(), SNOOZE_DAYS) });
    }
    return deps.snoozeSuggestion({ dimension: n.dimension, value: n.value, days: SNOOZE_DAYS });
  }
  return deps.setConflictState(n.id, { kind: 'snooze', until: dismissUntil(new Date(), SNOOZE_DAYS) });
}

/** Dismiss a suggestion permanently (engine → row status; live → far-future dismissals). */
export async function dismissSuggestionUnified(n, deps = DEFAULT_DEPS) {
  if (n.source === 'engine') return deps.dismissSuggestion({ dimension: n.dimension, value: n.value });
  return deps.setConflictState(n.id, { kind: 'dismiss', until: DISMISS_SENTINEL });
}
