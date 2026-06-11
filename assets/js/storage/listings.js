// storage/listings.js (REFACTOR P8): content + listings + learned-prefs split from storage.js -
// areas/house-types, reviewed marker, reports, live listings, reaction log, learned weights.
import {
  readLocal, writeLocal, removeLocal, _initSb, _getHid, _toast, _normShortlist,
} from './core.js';
import { loadJSON } from '../data-loader.js';
import { normaliseReaction, latestPerListing } from '../listings/reactions.js';
import { deriveWeights } from '../learned-preferences.js';
import { slugifyArea } from '../areas/area-match.js';

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
const _HA_KEY = 'household-areas';
const _withProvenance = (rec, addedVia) => ({
  ...rec,
  verified: rec.verified ?? true,
  source: rec.source ?? 'curated',
  _addedVia: addedVia,
});

async function _composeHouseholdAreas() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null; // no household context — caller falls back to catalog
  const { data, error } = await sb
    .from('household_areas')
    .select('area_id, added_via, status')
    .eq('household_id', hid)
    .eq('status', 'active');
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
    if (rec) out.push(_withProvenance(rec, l.added_via));
  }
  return out;
}

export async function getHouseholdAreas({ onUpdate } = {}) {
  const cached = readLocal(_HA_KEY);
  if (cached !== null) {
    _composeHouseholdAreas().then((fresh) => {
      if (fresh === null) return;
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        writeLocal(_HA_KEY, fresh);
        if (onUpdate) onUpdate(fresh);
      }
    }).catch(() => {});
    return cached;
  }
  let fresh = null;
  try { fresh = await _composeHouseholdAreas(); }
  catch (e) { console.error('storage: read household_areas', e.message); }
  if (fresh === null) return await getAreaCatalog(); // offline / pre-auth fallback
  writeLocal(_HA_KEY, fresh);
  return fresh;
}

const _invalidateHouseholdAreas = () => removeLocal(_HA_KEY);

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

// ── Reviewed-listings marker (Browse collapse UX, v3 L4) ───────────────────
// Which listings the user has SAVED/rounded-off in Browse, so reviewed cards can
// collapse to the bottom "Reviewed (N)" section. Intentionally a LOCAL-ONLY
// affordance (no Supabase table): it is a per-device UI convenience layered over
// the append-only reaction log, not authoritative user state. "Reviewed" stays
// derivable from a Saved consolidated reaction; this just remembers which ids
// were saved without re-reading the whole log.
export function getReviewedListings() { return readLocal('reviewed-listings') || []; }
export function addReviewedListing(id) {
  if (!id) return getReviewedListings();
  const set = new Set(getReviewedListings());
  set.add(String(id));
  const arr = [...set];
  writeLocal('reviewed-listings', arr);
  return arr;
}

// ── Reports (read-only; no localStorage cache needed) ─────────────────────
// Returns the full row (id, slug, title, data, created_at…) or null.
// Throws on Supabase error so the caller can show a retry affordance.
export async function getReport() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  const { data, error } = await sb
    .from('reports')
    .select('*')
    .eq('household_id', hid)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

// ── Live listings (v3 L1 — fetcher-written content; public read) ──────────
// Read-only from the portal: rows are written by tools/fetch-listings.mjs via
// the service role. listings is the one fetcher-written table (live-content
// class — see docs/SUPABASE_SYNC.md), so there is no save path here.
const _LISTING_COLS = 'rightmove_id, url, title, address, postcode, outcode, area_id, price, beds, baths, property_type, tenure, epc, council_tax, status, lat, lng, image_url, description, first_seen, last_seen, added_date, update_reason, price_history, distance_mi, geofence_pass, name_match, corroborated, match_source';

// Read the live listings. Pass `limit: null` to fetch EVERYTHING (no arbitrary
// cap) — the rows are paginated so nothing "ages out" of view as the table
// grows past a single page. A numeric `limit` keeps the legacy capped behaviour
// for callers (e.g. the next-best-action tile) that only want a recent sample.
//
// `scopeToHousehold` (default true): the `listings` table is shared, public-read
// content keyed by `area_id` (one fetcher writes it for every household). A
// listing therefore "belongs" to a household only when its `area_id` is one the
// household has selected. Without this scope every household reads the whole
// table — a brand-new user who has only just picked their areas (and whose areas
// the fetcher hasn't run for yet) would otherwise see every other household's
// listings instead of an empty feed. The saved view opts out (`false`) so a
// deliberately-saved home still resolves its live row even after its area is
// deselected.
export async function getListings({ limit = 200, status = null, includeOutOfArea = false, scopeToHousehold = true } = {}) {
  const sb = await _initSb();
  if (!sb) return [];
  // Resolve the household's selected area_ids. A logged-in household with no
  // selection yet owns no listings → return []. With no household context
  // (offline / pre-auth / local dev) we leave the scope open so tests and the
  // signed-out shell still render, mirroring getHouseholdAreas()'s fallback.
  let areaIds = null;
  if (scopeToHousehold) {
    const hid = await _getHid();
    if (hid) {
      const { data: links, error: laErr } = await sb
        .from('household_areas')
        .select('area_id')
        .eq('household_id', hid)
        .eq('status', 'active');
      if (laErr) { console.error('storage: read household_areas (scope)', laErr.message); return []; }
      areaIds = (links ?? []).map((l) => l.area_id);
      if (areaIds.length === 0) return []; // no areas chosen → no listings belong here yet
    }
  }
  // Each query starts from the same base; we rebuild it per page so the filters
  // and ordering are applied consistently across the .range() window.
  const buildQuery = () => {
    let q = sb.from('listings').select(_LISTING_COLS).order('first_seen', { ascending: false });
    if (status) q = q.eq('status', status);
    // Scope to the household's selected areas (see the doc comment above).
    if (areaIds) q = q.in('area_id', areaIds);
    // L7: only show listings inside a target-village geofence. Exclude
    // geofence_pass === false; a null verdict (a not-yet-backfilled row) is
    // treated as pass so nothing vanishes before the backfill lands.
    if (!includeOutOfArea) q = q.not('geofence_pass', 'is', false);
    return q;
  };
  try {
    // Capped path: a single bounded read (unchanged behaviour).
    if (limit != null) {
      const { data, error } = await buildQuery().limit(limit);
      if (error) throw error;
      return data ?? [];
    }
    // Uncapped path: page through every row so the full kept history is returned
    // (Supabase caps a single response at ~1000 rows, so we must paginate).
    const PAGE = 1000;
    const all = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await buildQuery().range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = data ?? [];
      all.push(...batch);
      if (batch.length < PAGE) break; // last (short) page reached
    }
    return all;
  } catch (e) {
    console.error('storage: read listings', e.message);
    return [];
  }
}

// A single listing by rightmove_id (all columns incl. raw_json + price_history)
// for the v3 L6 dossier. Returns null if not found.
export async function getListing(rightmoveId) {
  const sb = await _initSb();
  if (!sb || !rightmoveId) return null;
  try {
    const { data, error } = await sb
      .from('listings')
      .select('*')
      .eq('rightmove_id', String(rightmoveId))
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  } catch (e) {
    console.error('storage: read listing', e.message);
    return null;
  }
}

// ── Listing reactions (v3 L3 — append-only graded preference signal) ───────
// User-state, household-scoped. Every reaction is a new row (append-only); the
// latest row per listing is the current reaction. getListingReactions returns a
// { [listing_id]: { reaction, reason, created_at } } map of the *current*
// reaction per listing, cached + revalidated like the readiness checklist.

// The reaction log is APPEND-ONLY and unbounded — it already exceeds Supabase's
// ~1000-row single-response cap, so any single .select() silently truncates and
// the newest reactions vanish (likes never reach Saved; decided properties
// resurface in the feed). Page through every row in 1000-row windows, mirroring
// the uncapped getListings() loop above. A STABLE order (created_at, then id as a
// tiebreak for same-millisecond rows) keeps the .range() windows from skipping or
// duplicating rows across pages. `id` is always selected so the tiebreak resolves
// even for callers that don't otherwise need it.
async function _fetchAllReactionRows(sb, hid, { select, ascending = true }) {
  const PAGE = 1000;
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('listing_reactions')
      .select(select)
      .eq('household_id', hid)
      .order('created_at', { ascending })
      .order('id', { ascending })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < PAGE) break; // last (short) page reached
  }
  return all;
}

async function _sbGetReactionRows() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    // Full log (newest first), paged so the latest-per-listing reduction in
    // _reactionsToMap() sees every listing, not just the most recent ~1000 rows.
    return await _fetchAllReactionRows(sb, hid, {
      select: 'id, listing_id, reaction, reason, reasons, created_at',
      ascending: false,
    });
  } catch (e) {
    console.error('storage: read listing_reactions', e.message);
    return null;
  }
}

function _reactionsToMap(rows) {
  const latest = latestPerListing(rows || []);
  const obj = {};
  for (const [id, row] of latest) {
    obj[id] = {
      reaction: row.reaction,
      reason: row.reason ?? null,
      reasons: Array.isArray(row.reasons) ? row.reasons : [],
      created_at: row.created_at,
    };
  }
  return obj;
}

export async function getListingReactions(opts = {}) {
  const cached = readLocal('listing-reactions');
  if (cached !== null) {
    _sbGetReactionRows().then((rows) => {
      if (!rows) return;
      const fresh = _reactionsToMap(rows);
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        writeLocal('listing-reactions', fresh);
        if (opts.onUpdate) opts.onUpdate(fresh);
      }
    }).catch(() => {});
    return cached;
  }
  const rows = await _sbGetReactionRows();
  const map = rows ? _reactionsToMap(rows) : {};
  if (rows) writeLocal('listing-reactions', map);
  return map;
}

// Full append-only reaction log (with snapshots + ids) — the evidence the L5
// conflict detector and any re-derivation need. Distinct from getListingReactions,
// which reduces the log to the latest reaction per listing for the UI.
export async function getReactionLog() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return [];
  try {
    // Paged: the feed-suppression set and the Saved page both derive from this,
    // so it MUST return every row — an un-paged select capped at ~1000 rows is
    // exactly what broke Saved + feed dedup. Snapshots are included so delisted
    // likes still render.
    return await _fetchAllReactionRows(sb, hid, {
      select: 'id, listing_id, reaction, reason, reasons, created_at, listing_snapshot',
      ascending: true,
    });
  } catch (e) {
    console.error('storage: read reaction log', e.message);
    return [];
  }
}

export async function saveListingReaction({ listing_id, reaction, reason = null, reasons = null, listing_snapshot = null }) {
  const norm = normaliseReaction({ listing_id, reaction, reason, reasons, listing_snapshot });
  if (!norm) { console.error('storage: invalid listing reaction', reaction); return false; }
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const { error } = await sb.from('listing_reactions').insert({
      household_id: hid,
      user_id: session?.user?.id ?? null,
      listing_id: norm.listing_id,
      reaction: norm.reaction,
      reason: norm.reason,
      reasons: norm.reasons,
      listing_snapshot: norm.listing_snapshot,
    });
    if (error) throw error;
    // Optimistically refresh the current-reaction cache so the UI is instant.
    const cached = readLocal('listing-reactions') ?? {};
    cached[norm.listing_id] = { reaction: norm.reaction, reason: norm.reason, reasons: norm.reasons, created_at: norm.created_at };
    writeLocal('listing-reactions', cached);
    // Single notification chokepoint: every reaction write (feed OR dossier OR any
    // future path) announces itself so other live views re-derive their state. The
    // listings feed listens for this to keep its suppression sets in sync — fixing
    // dossier likes that previously never reached the feed's `decided` set. Fire-and-
    // forget: never awaited, never affects the return. Guarded for non-browser (Node
    // test) contexts so this module stays importable without a DOM shim.
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('reactions-changed', {
        detail: {
          listing_id: norm.listing_id,
          reaction: norm.reaction,
          reasons: norm.reasons,
          created_at: norm.created_at,
        },
      }));
    }
    return true;
  } catch (e) {
    console.error('storage: write listing_reactions', e.message);
    _toast(`Sync error (reactions): ${e.message}`, true);
    return false;
  }
}

// ── Learned preferences (v3 L4 — distilled reaction weights) ───────────────
// User-state, household-scoped. ONE row per household: `derived` (Layer 2,
// recomputed from the reaction log) + `overrides` (Layer 3, manual/AI intent).
// Cached + revalidated like the other user-state reads.
async function _sbGetLearnedPrefs() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    const { data, error } = await sb
      .from('learned_preferences')
      .select('derived, overrides, dismissals')
      .eq('household_id', hid)
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  } catch (e) {
    console.error('storage: read learned_preferences', e.message);
    return null;
  }
}

export async function getLearnedPreferences(opts = {}) {
  const cached = readLocal('learned-preferences');
  if (cached !== null) {
    _sbGetLearnedPrefs().then((row) => {
      if (!row) return;
      const fresh = { derived: row.derived ?? {}, overrides: row.overrides ?? {}, dismissals: row.dismissals ?? {} };
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        writeLocal('learned-preferences', fresh);
        if (opts.onUpdate) opts.onUpdate(fresh);
      }
    }).catch(() => {});
    return cached;
  }
  const row = await _sbGetLearnedPrefs();
  const val = { derived: row?.derived ?? {}, overrides: row?.overrides ?? {}, dismissals: row?.dismissals ?? {} };
  if (row) writeLocal('learned-preferences', val);
  return val;
}

export async function saveLearnedPreferences({ derived, overrides, dismissals } = {}) {
  const prev = readLocal('learned-preferences') || {};
  const next = {
    derived: derived ?? prev.derived ?? {},
    overrides: overrides ?? prev.overrides ?? {},
    dismissals: dismissals ?? prev.dismissals ?? {},
  };
  writeLocal('learned-preferences', next);
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const { error } = await sb.from('learned_preferences').upsert(
      { household_id: hid, derived: next.derived, overrides: next.overrides, dismissals: next.dismissals, updated_at: new Date().toISOString() },
      { onConflict: 'household_id' }
    );
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('storage: write learned_preferences', e.message);
    _toast(`Sync error (learned_preferences): ${e.message}`, true);
    return false;
  }
}

// v3 L5: record a conflict-prompt dismissal (key -> dismissed_until ISO) on the
// learned_preferences row, preserving derived + overrides.
export async function dismissConflict(key, dismissedUntil) {
  if (!key) return false;
  const prev = readLocal('learned-preferences') || (await _sbGetLearnedPrefs()) || {};
  const dismissals = { ...(prev.dismissals || {}), [key]: dismissedUntil };
  return saveLearnedPreferences({ derived: prev.derived || {}, overrides: prev.overrides || {}, dismissals });
}

// Recompute path: read the full append-only reaction log (with snapshots), run
// the pure deriveWeights(), persist the new `derived`, PRESERVE `overrides`.
// Returns the fresh { derived, overrides } so callers re-rank immediately.
export async function recomputeLearnedPreferences({ now } = {}) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  let rows = [];
  let statusMap = {};
  try {
    // Paged: deriveWeights() must train on the WHOLE append-only log, not the
    // oldest ~1000 rows a single select would return.
    const [reactRows, slRes] = await Promise.all([
      _fetchAllReactionRows(sb, hid, {
        select: 'id, listing_id, reaction, reason, reasons, created_at, listing_snapshot',
        ascending: true,
      }),
      sb.from('shortlist')
        .select('data')
        .eq('household_id', hid)
        .limit(1),
    ]);
    if (slRes.error) throw slRes.error;
    rows = reactRows ?? [];
    statusMap = _normShortlist(slRes.data?.[0]?.data).status;
  } catch (e) {
    console.error('storage: recompute read listing_reactions', e.message);
    return null;
  }
  const { derived } = deriveWeights(rows, now ? { now, statusMap } : { statusMap });
  const existing = readLocal('learned-preferences') || (await _sbGetLearnedPrefs()) || {};
  const overrides = existing.overrides ?? {};
  const dismissals = existing.dismissals ?? {};
  await saveLearnedPreferences({ derived, overrides, dismissals });
  return { derived, overrides, dismissals };
}
