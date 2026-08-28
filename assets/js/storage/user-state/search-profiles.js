// search-profiles.js — the storage layer for search profiles (Phase 1b).
//
// A household holds SEVERAL profiles, so this is the first user-state table that
// is a ROW LIST rather than the one-blob-per-household singleton every other
// module here uses. That is why it cannot go through core.js's `_get`/`_save`,
// which are hard-wired to `select('data').eq('household_id', hid).limit(1)` and
// an upsert keyed on a unique household_id. It borrows the same client bootstrap
// and household resolution instead, and keeps its own localStorage cache.
//
// Read path mirrors the rest of the layer: serve the cache instantly, revalidate
// from Supabase in the background, fire `onUpdate` only when the two differ.
//
// Extend, don't rewrite (CLAUDE.md §16).

import { _initSb, _getHid, readLocal, writeLocal, _toast } from '../core.js';
import { validateSpec } from '../../search/profile-spec.js';

const LS_KEY = 'search-profiles';
const TABLE = 'search_profiles';

/** Columns worth reading. `plan_cache` is deliberately excluded — it is planner
 *  scratch space that can be large, and no UI needs it. */
const COLS = 'id,household_id,name,enabled,admin_paused,trigger_mode,sort_order,spec,last_run_at,created_at,updated_at';

const byOrder = (a, b) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
  String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));

/**
 * Every profile for the signed-in household, cheapest-first.
 *
 * Returns `[]` rather than null when there are none: "this household has no
 * profiles" is a real, expected state (it is what every household looks like
 * before one is created), and it must not be confused with "the read failed".
 * A failed read returns the cache, or `[]` if there is none.
 *
 * @param {{onUpdate?: (rows: object[]) => void}} [opts]
 * @returns {Promise<object[]>}
 */
export async function getSearchProfiles({ onUpdate = null } = {}) {
  const cached = readLocal(LS_KEY);
  const fresh = (async () => {
    const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
    if (!sb || !hid) return null;
    try {
      const { data, error } = await sb.from(TABLE).select(COLS).eq('household_id', hid);
      if (error) throw error;
      const rows = (data || []).slice().sort(byOrder);
      writeLocal(LS_KEY, rows);
      return rows;
    } catch (e) {
      console.error(`storage: read ${TABLE}`, e.message);
      return null;
    }
  })();

  if (Array.isArray(cached)) {
    // Revalidate behind the instant render, and only disturb the UI on a real diff.
    fresh.then((rows) => {
      if (rows && onUpdate && JSON.stringify(rows) !== JSON.stringify(cached)) onUpdate(rows);
    });
    return cached;
  }
  return (await fresh) ?? [];
}

/**
 * Create or update one profile. The spec is validated here so an invalid one can
 * never reach the fetcher — a bad spec is a spend risk, not just a UI problem.
 *
 * Legacy range profiles are permitted on UPDATE only: the migrated
 * "Original search (legacy)" rows carry `priceMode: 'range'`, and editing one
 * (renaming it, switching it off) must not be blocked by a rule aimed at new
 * profiles. Creating a range profile is still refused.
 *
 * @param {object} profile
 * @returns {Promise<{ok: boolean, errors: string[], profile: object|null}>}
 */
export async function saveSearchProfile(profile) {
  const isUpdate = Boolean(profile?.id);
  const { spec, errors } = validateSpec(profile?.spec, { allowLegacyRange: isUpdate });
  if (!String(profile?.name || '').trim()) errors.push('a profile needs a name');
  if (errors.length) return { ok: false, errors, profile: null };

  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return { ok: false, errors: ['not signed in'], profile: null };

  const row = {
    household_id: hid,
    name: String(profile.name).trim(),
    enabled: profile.enabled === true,
    trigger_mode: profile.trigger_mode === 'schedule' ? 'schedule' : 'manual',
    sort_order: Number(profile.sort_order) || 0,
    spec,
    updated_at: new Date().toISOString(),
  };
  // admin_paused is never written from here — it belongs to the admin RPC, and a
  // member must not be able to un-pause what the admin paused.
  if (isUpdate) row.id = profile.id;

  try {
    const { data, error } = await sb.from(TABLE).upsert(row, { onConflict: 'id' }).select(COLS);
    if (error) throw error;
    await refreshSearchProfilesCache();
    return { ok: true, errors: [], profile: data?.[0] ?? null };
  } catch (e) {
    console.error(`storage: write ${TABLE}`, e.message);
    _toast(`Could not save search profile: ${e.message}`, true);
    return { ok: false, errors: [e.message], profile: null };
  }
}

/**
 * Flip one profile's own switch. Separated from saveSearchProfile because it is
 * the single most-used action in the UI and must not require a full valid spec —
 * a user has to be able to switch OFF a profile whose spec has since become
 * invalid, which is exactly when they most want to.
 * @param {string} id @param {boolean} on
 * @returns {Promise<boolean>} whether the write landed
 */
export async function setSearchProfileEnabled(id, on) {
  const sb = await _initSb();
  if (!sb || !id) return false;
  try {
    const { error } = await sb.from(TABLE)
      .update({ enabled: on === true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    await refreshSearchProfilesCache();
    return true;
  } catch (e) {
    console.error(`storage: toggle ${TABLE}`, e.message);
    _toast(`Could not change that search: ${e.message}`, true);
    return false;
  }
}

/**
 * Delete a profile outright. Hard delete, matching removeHouseholdArea: a profile
 * is a user's own configuration, not an audit record, and a soft-deleted one would
 * still have to be filtered out of every planner query.
 * @param {string} id @returns {Promise<boolean>}
 */
export async function deleteSearchProfile(id) {
  const sb = await _initSb();
  if (!sb || !id) return false;
  try {
    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if (error) throw error;
    await refreshSearchProfilesCache();
    return true;
  } catch (e) {
    console.error(`storage: delete ${TABLE}`, e.message);
    _toast(`Could not delete that search: ${e.message}`, true);
    return false;
  }
}

/** Re-read from Supabase and overwrite the cache. Called after every write so a
 *  subsequent instant render shows what was just saved rather than the stale set. */
export async function refreshSearchProfilesCache() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    const { data, error } = await sb.from(TABLE).select(COLS).eq('household_id', hid);
    if (error) throw error;
    const rows = (data || []).slice().sort(byOrder);
    writeLocal(LS_KEY, rows);
    return rows;
  } catch {
    return null;
  }
}

/**
 * The global spend gate, read-only for the portal so the UI can say "searching is
 * paused" instead of leaving a Run button that silently does nothing.
 * Absent or unreadable reads as PAUSED — the same fail-closed stance the fetcher
 * takes, so the UI can never claim searching is live when it is not.
 * @returns {Promise<{fetch_enabled: boolean, paused_reason: string|null}>}
 */
export async function getFetchControl() {
  const sb = await _initSb();
  if (!sb) return { fetch_enabled: false, paused_reason: 'no backend configured' };
  try {
    const { data, error } = await sb.from('fetch_control').select('fetch_enabled,paused_reason').limit(1);
    if (error) throw error;
    const row = data?.[0];
    if (!row) return { fetch_enabled: false, paused_reason: 'no fetch_control row' };
    return { fetch_enabled: row.fetch_enabled === true, paused_reason: row.paused_reason ?? null };
  } catch (e) {
    return { fetch_enabled: false, paused_reason: `unreadable (${e.message})` };
  }
}
