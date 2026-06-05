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
import { REFINEMENT_HIDE_KEY, REFINEMENT_SETTINGS_KEY, hideRuleKey, presetFromOverrides } from '../refinement/view.js';

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

/** Patch one suggestion row (portal HAS update RLS on refinement_suggestions). */
async function _updateSuggestion(dimension, value, patch) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const { error } = await sb
      .from('refinement_suggestions')
      .update(patch)
      .eq('household_id', hid)
      .eq('dimension', dimension)
      .eq('value', value);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('storage: update refinement_suggestions', e.message);
    return false;
  }
}

/** Flip one suggestion's status. */
const _setSuggestionStatus = (dimension, value, status) => _updateSuggestion(dimension, value, { status });

// ── Dismiss / Snooze (§4.1/§4.5) — the "don't re-nag" memory ──────────────────
// Setting the status is enough for stickiness (the engine's ON CONFLICT CASE guard
// only ever overwrites forming/actionable). We ALSO record dismissals in
// learned_preferences.dismissals (keyed `dim:value`) so the engine job's dismissedKeys
// set excludes the value even if the suggestion row were later rebuilt from scratch.

async function _patchDismissals(mutate) {
  const prefs = await getLearnedPreferences();
  const dismissals = { ...(prefs.dismissals || {}) };
  mutate(dismissals);
  return saveLearnedPreferences({ dismissals });
}

/** Dismiss a suggestion: never suggest this value again (until un-dismissed). */
export async function dismissSuggestion({ dimension, value } = {}) {
  if (!dimension || !value) return false;
  const norm = String(value).trim().toLowerCase();
  const okMem = await _patchDismissals((d) => { d[`${dimension}:${norm}`] = { at: new Date().toISOString() }; });
  const okStatus = await _setSuggestionStatus(dimension, norm, 'dismissed');
  return okMem && okStatus;
}

/** Un-dismiss: drop the memory and return the suggestion to the inbox. */
export async function undismissSuggestion({ dimension, value } = {}) {
  if (!dimension || !value) return false;
  const norm = String(value).trim().toLowerCase();
  const okMem = await _patchDismissals((d) => { delete d[`${dimension}:${norm}`]; });
  const okStatus = await _setSuggestionStatus(dimension, norm, 'actionable');
  return okMem && okStatus;
}

/** Snooze: hide the suggestion for N days, then it re-surfaces (expiry handled in view). */
export async function snoozeSuggestion({ dimension, value, days = 30 } = {}) {
  if (!dimension || !value) return false;
  const norm = String(value).trim().toLowerCase();
  const until = new Date(Date.now() + Number(days) * 86_400_000).toISOString();
  return _updateSuggestion(dimension, norm, { status: 'snoozed', snoozed_until: until });
}

/** Un-snooze (one-tap): clear the snooze and return to the inbox. */
export async function unsnoozeSuggestion({ dimension, value } = {}) {
  if (!dimension || !value) return false;
  const norm = String(value).trim().toLowerCase();
  return _updateSuggestion(dimension, norm, { status: 'actionable', snoozed_until: null });
}

// ── Stage 7: training controls (sensitivity preset + reset) ───────────────────

/** The household's chosen sensitivity preset (persisted in overrides; default cautious). */
export async function getRefinementPreset() {
  const prefs = await getLearnedPreferences();
  return presetFromOverrides(prefs.overrides || {});
}

/**
 * Persist the sensitivity preset. The engine job (tools/refinement-run.mjs) reads it
 * from `overrides.__refinement_settings.preset` on its next run — the portal can't
 * re-run the server-side engine itself, so a preset change applies on the next evaluation.
 */
export async function setRefinementPreset(preset) {
  const valid = ['cautious', 'balanced', 'aggressive'];
  if (!valid.includes(preset)) return false;
  const prefs = await getLearnedPreferences();
  const overrides = { ...(prefs.overrides || {}) };
  overrides[REFINEMENT_SETTINGS_KEY] = { ...(overrides[REFINEMENT_SETTINGS_KEY] || {}), preset, at: new Date().toISOString() };
  return saveLearnedPreferences({ overrides });
}

/**
 * Reset training (§4.6): clear the refinement engine's DERIVED state — suggestions,
 * scrape-probation rows, hide rules and dismiss memory — so the engine starts fresh on
 * its next run. NEVER touches raw `listing_reactions` (the evidence) or the separate
 * learned-preferences `derived` weights (the fit engine). Scope: 'all' | 'dimension'
 * (areas or types) | 'value' (one suggestion). Returns true on success.
 */
export async function resetTraining({ scope = 'all', dimension = null, value = null } = {}) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  const norm = value != null ? String(value).trim().toLowerCase() : null;
  try {
    // 1) delete the matching refinement_suggestions rows.
    let q = sb.from('refinement_suggestions').delete().eq('household_id', hid);
    if (scope === 'dimension' && dimension) q = q.eq('dimension', dimension);
    if (scope === 'value' && dimension && norm) q = q.eq('dimension', dimension).eq('value', norm);
    const { error: e1 } = await q;
    if (e1) throw e1;
    // 2) delete the matching scrape_probation rows (area scope only).
    if (scope === 'all' || (scope === 'dimension' && dimension === 'area') || (scope === 'value' && dimension === 'area')) {
      let pq = sb.from('scrape_probation').delete().eq('household_id', hid);
      if (scope === 'value' && norm) pq = pq.eq('value', norm);
      const { error: e2 } = await pq;
      if (e2) throw e2;
    }
  } catch (e) {
    console.error('storage: reset training', e.message);
    return false;
  }
  // 3) clear the matching hide rules + dismiss memory from overrides/dismissals.
  const prefs = await getLearnedPreferences();
  const overrides = { ...(prefs.overrides || {}) };
  const dismissals = { ...(prefs.dismissals || {}) };
  const hideBlob = { ...(overrides[REFINEMENT_HIDE_KEY] || {}) };
  const matches = (key) => {
    if (scope === 'all') return true;
    const [dim, val] = key.split(/:(.+)/);
    if (scope === 'dimension') return dim === dimension;
    return dim === dimension && val === norm;
  };
  for (const k of Object.keys(hideBlob)) if (matches(k)) delete hideBlob[k];
  for (const k of Object.keys(dismissals)) if (k.includes(':') && matches(k)) delete dismissals[k];
  if (Object.keys(hideBlob).length) overrides[REFINEMENT_HIDE_KEY] = hideBlob;
  else delete overrides[REFINEMENT_HIDE_KEY];
  return saveLearnedPreferences({ overrides, dismissals });
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

// ── Stage 6: scrape-scope lever (probation) — PORTAL side only ───────────────
// The "Stop searching this area" lever is the higher-stakes scrape lever. Like the
// Stage-5 hide lever, the portal CANNOT mutate the scrape source directly: `areas`
// has a SELECT-only RLS policy ("areas public read") and no household_id, so the
// publishable key cannot flip `areas.active`. Instead the household-scoped
// `scrape_probation` table (full CRUD RLS for household members) records the user's
// intent; the scraper (tools/fetch-listings.mjs, service role) subtracts probationed
// values from its active set in a SEPARATE, named change (the §8 enforcement step).
// These functions only write the portal-owned intent + flip the suggestion status.

/** All scrape-probation rows for the current household (the authoritative paused set). */
export async function getScrapeProbation() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return [];
  try {
    const { data, error } = await sb
      .from('scrape_probation')
      .select('dimension, value, approved_at, reprobe_every_runs, last_reprobe_run, status')
      .eq('household_id', hid);
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.error('storage: read scrape_probation', e.message);
    return [];
  }
}

/**
 * Stop searching an area (the scrape lever, §4.1): upsert a scrape_probation row
 * (status='active', re-probe cadence) and flip the suggestion → confirmed_scrape. Area
 * dimension only — the scraper searches by area/outcode, so a property-type probation
 * has no scrape meaning. `value` is normalised to match the engine and the scraper.
 */
export async function stopSearchingArea({ value, reprobeEveryRuns = 6 } = {}) {
  if (!value) return false;
  const norm = String(value).trim().toLowerCase();
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const now = new Date().toISOString();
    const { error } = await sb.from('scrape_probation').upsert(
      { household_id: hid, dimension: 'area', value: norm, approved_at: now, reprobe_every_runs: Number(reprobeEveryRuns) || 6, status: 'active', updated_at: now },
      { onConflict: 'household_id,dimension,value' },
    );
    if (error) throw error;
  } catch (e) {
    console.error('storage: upsert scrape_probation', e.message);
    return false;
  }
  return await _setSuggestionStatus('area', norm, 'confirmed_scrape');
}

/**
 * Bring an area back into active search (§4.3): delete its scrape_probation row and
 * revert the suggestion to actionable. One-tap, reversible — the area returns to the
 * scraper's active set on the next run (once §8 enforcement reads probation).
 */
export async function bringBackArea({ value } = {}) {
  if (!value) return false;
  const norm = String(value).trim().toLowerCase();
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const { error } = await sb
      .from('scrape_probation')
      .delete()
      .eq('household_id', hid).eq('dimension', 'area').eq('value', norm);
    if (error) throw error;
  } catch (e) {
    console.error('storage: delete scrape_probation', e.message);
    return false;
  }
  return await _setSuggestionStatus('area', norm, 'actionable');
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
