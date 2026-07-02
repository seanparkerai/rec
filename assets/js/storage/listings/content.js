// storage/listings/content.js — area catalog (read-only, repo-owned content) and
// per-household area SELECTION (household_areas join). Split from storage/listings.js.
import {
  readLocal, writeLocal, removeLocal, _initSb, _getHid, _toast,
} from '../core.js';
import { loadJSON } from '../../data-loader.js';
import { slugifyArea } from '../../areas/area-match.js';

// Re-exported on the storage surface so callers (e.g. the onboarding wizard) can
// derive a stub id without reaching into areas/area-match.js directly.
export { slugifyArea };

// ── Area CATALOG (read-only, repo-owned content) ───────────────────────────
// The full global catalog of area records, served from data/areas.json in the
// repo. This is the canonical area directory + map/list source for admin views,
// by-id lookups (area-detail), and as the resolution table for getHouseholdAreas
// below. Per-household SELECTION lives in the household_areas table (getHouseholdAreas).
export async function getAreaCatalog()  { return await loadJSON('areas'); }
export async function getAreaDetail(id) { return await loadJSON(`data/areas/${id}.json`); }
export async function getHouseTypes()   { return await loadJSON('house-types'); }

// ── Per-household area SELECTION (household_areas join) ─────────────────────
// Composes the array of area RECORDS a household has selected, in the SAME shape
// the catalog returns, so every consumer (listings, map, property, areas page,
// shortlist tile…) keeps working unchanged. Resolution per linked area_id:
//   1. repo catalog (curated areas — the common case), else
//   2. the Supabase areas.data row (a household-onboarding stub not yet in the repo).
// Curated repo areas carry no verified/source key (they are not re-materialised),
// so they default to verified:true / source:'curated'; stubs carry their own
// verified:false / source:'household-onboarding'. Pipeline-owned fields
// (id, coords, coordsSource, active, geofence/searchRadiusMi, houseTypeIds) are
// never altered. Offline / pre-auth / no-household → falls back to the full catalog
// so local dev + tests still render.
const _HA_KEY = 'household-areas';            // active-only (the default — listings/map/property rely on it)
const _HA_ALL_KEY = 'household-areas:all';    // active + inactive (the management views only)
const _withProvenance = (rec, addedVia, status = 'active', isOrigin = false) => ({
  ...rec,
  verified: rec.verified ?? true,
  source: rec.source ?? 'curated',
  _addedVia: addedVia,
  _status: status,
  _isOrigin: !!isOrigin,
});

// Compose the household's area records. Default = active links only (every
// consumer's existing contract). With includeInactive, paused ('inactive') links
// are included too and each record carries its link `_status` so a management
// view can distinguish active from paused and offer a reactivate control.
async function _composeHouseholdAreas(includeInactive = false) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null; // no household context — caller falls back to catalog
  let query = sb
    .from('household_areas')
    .select('area_id, added_via, status, is_origin')
    .eq('household_id', hid);
  query = includeInactive
    ? query.in('status', ['active', 'inactive'])
    : query.eq('status', 'active');
  const { data, error } = await query;
  if (error) throw error;
  const links = data ?? [];
  if (links.length === 0) return [];
  const catalog = await getAreaCatalog();
  const byId = new Map((catalog || []).map((a) => [a.id, a]));
  const missing = links.filter((l) => !byId.has(l.area_id)).map((l) => l.area_id);
  const stubById = new Map();
  if (missing.length) {
    const { data: stubs } = await sb.from('areas').select('id, data').in('id', missing);
    for (const r of stubs ?? []) stubById.set(r.id, { ...(r.data || {}), id: r.id });
  }
  const out = [];
  for (const l of links) {
    const rec = byId.get(l.area_id) ?? stubById.get(l.area_id);
    if (rec) out.push(_withProvenance(rec, l.added_via, l.status, l.is_origin));
  }
  return out;
}

export async function getHouseholdAreas({ onUpdate, includeInactive = false } = {}) {
  const key = includeInactive ? _HA_ALL_KEY : _HA_KEY;
  const cached = readLocal(key);
  if (cached !== null) {
    _composeHouseholdAreas(includeInactive).then((fresh) => {
      if (fresh === null) return;
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        writeLocal(key, fresh);
        if (onUpdate) onUpdate(fresh);
      }
    }).catch(() => {});
    return cached;
  }
  let fresh = null;
  try { fresh = await _composeHouseholdAreas(includeInactive); }
  catch (e) { console.error('storage: read household_areas', e.message); }
  if (fresh === null) return await getAreaCatalog(); // offline / pre-auth fallback
  writeLocal(key, fresh);
  return fresh;
}

// Both cache keys must clear together: any selection/status change can move a row
// between the active-only and active+inactive views.
const _invalidateHouseholdAreas = () => { removeLocal(_HA_KEY); removeLocal(_HA_ALL_KEY); };

// Link an EXISTING catalog area (curated or an already-created stub) to the
// current household. Idempotent (upsert on the composite PK).
export async function addHouseholdAreaByCatalog(area_id, added_via = 'catalog-match') {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid || !area_id) return false;
  try {
    const { error } = await sb.from('household_areas').upsert(
      { household_id: hid, area_id, added_via, status: 'active' },
      { onConflict: 'household_id,area_id' }
    );
    if (error) throw error;
    _invalidateHouseholdAreas();
    return true;
  } catch (e) {
    console.error('storage: addHouseholdAreaByCatalog', e.message);
    _toast(`Sync error (areas): ${e.message}`, true);
    return false;
  }
}

// Pause or resume an area for the current household (reversible). Flips
// household_areas.status between 'active' and 'inactive'. An inactive link is
// excluded from the active-only read path (listings feed, map, the default areas
// list) and from the fetcher's demand set, but stays visible via
// getHouseholdAreas({ includeInactive }) so the user can reactivate it. The global
// catalog row is untouched; full removal is removeHouseholdArea (hard delete).
export async function setHouseholdAreaStatus(area_id, status) {
  if (status !== 'active' && status !== 'inactive') {
    console.error('storage: setHouseholdAreaStatus — invalid status', status);
    return false;
  }
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid || !area_id) return false;
  try {
    const { error } = await sb.from('household_areas')
      .update({ status }).eq('household_id', hid).eq('area_id', area_id);
    if (error) throw error;
    _invalidateHouseholdAreas();
    return true;
  } catch (e) {
    console.error('storage: setHouseholdAreaStatus', e.message);
    _toast(`Sync error (areas): ${e.message}`, true);
    return false;
  }
}

// Mark an area as the household's ORIGIN (home / commute anchor) or back to a
// target. An origin contributes to commute math but is EXCLUDED from the listing
// feed (household_feed RPC) and the fetcher demand set — its catchment is where
// the household LIVES, not where they want to buy (step 2.19: this replaces the
// one-off SQL seed as the way is_origin is set). Reversible, per-household; the
// global catalog row is untouched.
export async function setHouseholdAreaOrigin(area_id, isOrigin) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid || !area_id) return false;
  try {
    const { error } = await sb.from('household_areas')
      .update({ is_origin: !!isOrigin }).eq('household_id', hid).eq('area_id', area_id);
    if (error) throw error;
    _invalidateHouseholdAreas();
    return true;
  } catch (e) {
    console.error('storage: setHouseholdAreaOrigin', e.message);
    _toast(`Sync error (areas): ${e.message}`, true);
    return false;
  }
}

// De-select an area for the current household (hard delete of the link — the global
// catalog row is untouched). Used by the onboarding wizard's Areas step.
export async function removeHouseholdArea(area_id) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid || !area_id) return false;
  try {
    const { error } = await sb.from('household_areas')
      .delete().eq('household_id', hid).eq('area_id', area_id);
    if (error) throw error;
    _invalidateHouseholdAreas();
    return true;
  } catch (e) {
    console.error('storage: removeHouseholdArea', e.message);
    _toast(`Sync error (areas): ${e.message}`, true);
    return false;
  }
}

// Create a provisional, inactive household-onboarding stub on the global catalog
// and link it to the current household. The gated areas INSERT policy only admits
// rows with source='household-onboarding' AND active=false, so this is the only
// shape a member can add — the curated catalog stays read-only. If a stub with the
// same id already exists (another household added it first), we link to it rather
// than fail. Returns the stub record (or null on error).
// The optional enrichment fields (town, postcode, coords, coordsSource, geofence/
// searchRadiusMi) are merged additively (P: household-area enrichment) — when the
// caller has located the place via postcodes.io they make the stub instantly
// fetch-eligible; when absent the stub falls back to the original coords-only,
// provisional shape so the flow still works offline. The DB write shape (gated INSERT)
// is unchanged.
export async function createAreaStubAndLink({
  name, county = null, lat = null, lng = null,
  town = null, postcode = null, coords = null, coordsSource = null,
  geofenceRadiusMi = null, searchRadiusMi = null,
}) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid || !name) return null;
  const id = slugifyArea(name, county);
  if (!id) return null;
  const resolvedCoords = coords || ((lat != null && lng != null) ? { lat: Number(lat), lng: Number(lng) } : null);
  const data = {
    id, name, town: town || county, county, postcode: postcode || null,
    coords: resolvedCoords, coordsSource: coordsSource || 'postcodes-io-provisional',
    houseTypeIds: [], status: 'stub', active: false,
    verified: false, source: 'household-onboarding',
  };
  if (geofenceRadiusMi != null) data.geofenceRadiusMi = geofenceRadiusMi;
  if (searchRadiusMi != null) data.searchRadiusMi = searchRadiusMi;
  try {
    const { error: aErr } = await sb.from('areas').insert({ id, data });
    // A duplicate id means the stub (or a curated area) already exists — link to it.
    if (aErr && !/duplicate|already exists|23505/i.test(aErr.message || '')) throw aErr;
    const { error: lErr } = await sb.from('household_areas').upsert(
      { household_id: hid, area_id: id, added_via: 'place-lookup', status: 'active' },
      { onConflict: 'household_id,area_id' }
    );
    if (lErr) throw lErr;
    _invalidateHouseholdAreas();
    return { ...data };
  } catch (e) {
    console.error('storage: createAreaStubAndLink', e.message);
    _toast(`Sync error (area stub): ${e.message}`, true);
    return null;
  }
}
