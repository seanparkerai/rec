// storage/listings.js (REFACTOR P8): content + listings + learned-prefs split from storage.js -
// areas/house-types, reviewed marker, reports, live listings, reaction log, learned weights.
import {
  readLocal, writeLocal, _initSb, _getHid, _toast, _normShortlist,
} from './core.js';
import { loadJSON } from '../data-loader.js';
import { normaliseReaction, latestPerListing } from '../listings/reactions.js';
import { deriveWeights } from '../learned-preferences.js';

// Read-only, repo-owned content (no Supabase — served from data/ in the repo).
export async function getAreas()        { return await loadJSON('areas'); }
export async function getAreaDetail(id) { return await loadJSON(`data/areas/${id}.json`); }
export async function getHouseTypes()   { return await loadJSON('house-types'); }
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
export async function getListings({ limit = 200, status = null, includeOutOfArea = false } = {}) {
  const sb = await _initSb();
  if (!sb) return [];
  try {
    let q = sb
      .from('listings')
      .select('rightmove_id, url, title, address, postcode, outcode, area_id, price, beds, baths, property_type, tenure, epc, council_tax, status, lat, lng, image_url, description, first_seen, last_seen, added_date, update_reason, price_history, distance_mi, geofence_pass, name_match, corroborated, match_source')
      .order('first_seen', { ascending: false })
      .limit(limit);
    if (status) q = q.eq('status', status);
    // L7: only show listings inside a target-village geofence. Exclude
    // geofence_pass === false; a null verdict (a not-yet-backfilled row) is
    // treated as pass so nothing vanishes before the backfill lands.
    if (!includeOutOfArea) q = q.not('geofence_pass', 'is', false);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
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
async function _sbGetReactionRows() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    const { data, error } = await sb
      .from('listing_reactions')
      .select('listing_id, reaction, reason, reasons, created_at')
      .eq('household_id', hid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
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
    const { data, error } = await sb
      .from('listing_reactions')
      .select('id, listing_id, reaction, reason, reasons, created_at, listing_snapshot')
      .eq('household_id', hid);
    if (error) throw error;
    return data ?? [];
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
    const [reactRes, slRes] = await Promise.all([
      sb.from('listing_reactions')
        .select('id, listing_id, reaction, reason, reasons, created_at, listing_snapshot')
        .eq('household_id', hid),
      sb.from('shortlist')
        .select('data')
        .eq('household_id', hid)
        .limit(1),
    ]);
    if (reactRes.error) throw reactRes.error;
    rows = reactRes.data ?? [];
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
