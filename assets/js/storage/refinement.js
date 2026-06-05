// storage/refinement.js — access to engine-derived refinement state
// (docs/REFINEMENT_PLAN.md §4). The scheduled job (tools/refinement-run.mjs) WRITES
// refinement_suggestions / refinement_runs; the portal READS them here, plus the
// Stage 5 display-hide lever (hide / undo) defined below.
//
// Stage 5 = Approach B (owner-approved 2026-06-05): the hide lever is CLIENT-SIDE via
// learned_preferences.overrides — NO migration, NO RLS change, NO listings or sync_log
// writes from the browser. The browser/publishable key can only SELECT the shared,
// household-less `listings` table (RLS "listings public read") and cannot INSERT
// sync_log, so a listings.status flip / audit row is impossible without widening RLS.
// Instead a hide writes a rule into overrides[REFINEMENT_HIDE_KEY] (skipped by
// effectiveWeights, preserved by recomputeLearnedPreferences) and flips the suggestion
// status → confirmed_hide (the portal HAS update RLS on refinement_suggestions). The
// durable/reversible record is the rule + the status flip + learned_preferences.updated_at.
import { _initSb, _getHid } from './core.js';
import { getLearnedPreferences, saveLearnedPreferences } from './listings.js';
import { REFINEMENT_HIDE_KEY, hideRuleKey } from '../refinement/view.js';

/** All refinement suggestions for the current household (engine-derived, read-only). */
export async function getRefinementSuggestions() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return [];
  try {
    const { data, error } = await sb
      .from('refinement_suggestions')
      .select('dimension, value, metrics, tier, status, first_detected_at, last_evaluated_at, runs_qualified, snoozed_until')
      .eq('household_id', hid);
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.error('storage: read refinement_suggestions', e.message);
    return [];
  }
}

/** The most recent evaluation run (backs the model-confidence meter, §4.6). */
export async function getRefinementMeta() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    const { data, error } = await sb
      .from('refinement_runs')
      .select('run_at, params, candidates_evaluated, actionable_count')
      .eq('household_id', hid)
      .order('run_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  } catch (e) {
    console.error('storage: read refinement_runs', e.message);
    return null;
  }
}

// ── Stage 5: display-hide lever (Approach B — overrides rule + status flip) ───

/** Flip one suggestion's status (portal HAS update RLS on refinement_suggestions). */
async function _setSuggestionStatus(dimension, value, status) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const { error } = await sb
      .from('refinement_suggestions')
      .update({ status })
      .eq('household_id', hid)
      .eq('dimension', dimension)
      .eq('value', value);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('storage: update refinement_suggestions status', e.message);
    return false;
  }
}

/**
 * Hide a suggested value from the listings feed (the reversible display lever, §4.1).
 * Writes the rule into learned_preferences.overrides under the reserved key, then flips
 * the suggestion → confirmed_hide. `value` is normalised (lower(trim())) to match both
 * the engine and the client-side feed filter.
 */
export async function hideSuggestion({ dimension, value, count = 0 } = {}) {
  if (!dimension || !value) return false;
  const norm = String(value).trim().toLowerCase();
  // 1) persist the display-hide rule (pass only { overrides } — saveLearnedPreferences
  //    merges derived/dismissals from the cache, so we never clobber them).
  const prefs = await getLearnedPreferences();
  const overrides = { ...(prefs.overrides || {}) };
  const blob = { ...(overrides[REFINEMENT_HIDE_KEY] || {}) };
  blob[hideRuleKey(dimension, norm)] = { dimension, value: norm, count: Number(count) || 0, at: new Date().toISOString() };
  overrides[REFINEMENT_HIDE_KEY] = blob;
  const okPrefs = await saveLearnedPreferences({ overrides });
  // 2) flip the suggestion → confirmed_hide so it leaves the inbox and joins Active.
  const okStatus = await _setSuggestionStatus(dimension, norm, 'confirmed_hide');
  return okPrefs && okStatus;
}

/**
 * Undo a hide (§4.2): remove the override rule and revert the suggestion to actionable
 * so it returns to the inbox. One-tap, two-way door — listings reappear on next paint.
 */
export async function unhideSuggestion({ dimension, value } = {}) {
  if (!dimension || !value) return false;
  const norm = String(value).trim().toLowerCase();
  const prefs = await getLearnedPreferences();
  const overrides = { ...(prefs.overrides || {}) };
  const blob = { ...(overrides[REFINEMENT_HIDE_KEY] || {}) };
  delete blob[hideRuleKey(dimension, norm)];
  if (Object.keys(blob).length) overrides[REFINEMENT_HIDE_KEY] = blob;
  else delete overrides[REFINEMENT_HIDE_KEY];
  const okPrefs = await saveLearnedPreferences({ overrides });
  const okStatus = await _setSuggestionStatus(dimension, norm, 'actionable');
  return okPrefs && okStatus;
}

/**
 * Count the live, feed-visible listings a hide rule would remove (for the confirm
 * modal's "removes X listings" copy). Matches case-insensitively because listings store
 * Title-Case property_type ('Terraced') while the engine value is lowercase; mirrors the
 * feed's geofence rule (exclude geofence_pass = false; a null verdict counts as pass).
 */
export async function countMatchingListings({ dimension, value } = {}) {
  const sb = await _initSb();
  if (!sb || !dimension || !value) return 0;
  const col = dimension === 'area' ? 'area_id' : 'property_type';
  const norm = String(value).trim().toLowerCase();
  try {
    const { count, error } = await sb
      .from('listings')
      .select('rightmove_id', { count: 'exact', head: true })
      .ilike(col, norm)
      .not('geofence_pass', 'is', false);
    if (error) throw error;
    return count || 0;
  } catch (e) {
    console.error('storage: count matching listings', e.message);
    return 0;
  }
}
