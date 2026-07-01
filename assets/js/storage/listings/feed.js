// storage/listings/feed.js — Rightmove fetch trigger, the local reviewed-marker,
// live listings (public read), and the append-only listing_reactions read/write.
// Split from storage/listings.js. The shared paged-log helper lives in
// ./_reactions-core.js.
import { readLocal, writeLocal, _initSb, _getHid, _toast } from '../core.js';
import { normaliseReaction, latestPerListing } from '../../listings/reactions.js';
import { _fetchAllReactionRows } from './_reactions-core.js';
import { getAreaCatalog } from './content.js';

// ── Trigger a Rightmove fetch (server-side dispatch via Vault token) ───────
// The fetcher (tools/fetch-listings.mjs) needs the Apify + service-role secrets,
// so it runs on a GitHub runner, not the browser. The listings-page 24hr/3d/7d
// buttons call this, which invokes the `request_rightmove_fetch` RPC: a signed-in
// user triggers the workflow_dispatch server-side, with the GitHub token held in
// Supabase Vault — never in the browser. Returns the RPC's shaped result
// { ok, status, request_id?, retry_after_seconds?, days?, message } so the UI can
// report dispatched / cooldown / error uniformly. `days` ∈ {1,3,7,14} (recency window).
export async function requestListingsFetch(days = 1) {
  const sb = await _initSb();
  if (!sb) return { ok: false, status: 'error', message: 'Not connected to the backend.' };
  try {
    const { data, error } = await sb.rpc('request_rightmove_fetch', { p_days: Number(days) });
    if (error) return { ok: false, status: 'error', message: error.message };
    return data ?? { ok: false, status: 'error', message: 'No response from the trigger.' };
  } catch (e) {
    return { ok: false, status: 'error', message: e.message };
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
// content (one fetcher writes it for every household). A listing "belongs" to a
// household only when it is a member (listing_areas) of a target area the
// household holds — the household_feed RPC owns that whole rule (step 2.13).
// Without the scope every household reads the whole table — a brand-new user
// who has only just picked their areas (and whose areas the fetcher hasn't run
// for yet) would otherwise see every other household's listings instead of an
// empty feed. The saved view opts out (`false`) so a deliberately-saved home
// still resolves its live row even after its area is deselected.
// Prettify a slug area id into a display fallback (for stub areas absent from the
// catalog): drop a trailing outcode/county token and title-case the rest.
function _prettyAreaId(id) {
  const s = String(id || '');
  const cleaned = s
    .replace(/-(?:hampshire|wiltshire|dorset|somerset|berkshire|surrey|so\d+|sp\d+|po\d+|rg\d+|gu\d+|ba\d+)$/i, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return cleaned || s;
}

// Attach the full m2m area membership to each listing — every area whose geofence
// contains it (nearest-first, `is_primary` flagged, names resolved from the area
// catalog with a slug fallback for household-stub areas). This is what lets the UI
// answer "why is this listing showing for me": it lists all the areas the property
// overlaps / is within range of. Read-only, best-effort (a failure leaves .areas=[]
// so the card still renders from its single area_id).
async function _attachAreaMemberships(sb, rows) {
  const ids = [...new Set(rows.map((r) => r.rightmove_id).filter(Boolean))];
  if (!ids.length) return rows;
  let nameById = new Map();
  try { nameById = new Map((await getAreaCatalog() ?? []).map((a) => [a.id, a.name])); }
  catch (e) { console.error('storage: area catalog for membership names', e.message); }
  const byListing = new Map();
  const CHUNK = 200;                          // ≤ ~200 ids × avg 4 areas keeps each page well under 1000
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('listing_areas')
        .select('rightmove_id, area_id, distance_mi, is_primary')
        .in('rightmove_id', slice).range(from, from + 999);
      if (error) { console.error('storage: read listing_areas (attach)', error.message); break; }
      for (const m of data ?? []) {
        if (!byListing.has(m.rightmove_id)) byListing.set(m.rightmove_id, []);
        byListing.get(m.rightmove_id).push({
          area_id: m.area_id,
          name: nameById.get(m.area_id) || _prettyAreaId(m.area_id),
          distance_mi: m.distance_mi,
          is_primary: !!m.is_primary,
        });
      }
      if ((data ?? []).length < 1000) break;
    }
  }
  for (const r of rows) {
    const arr = byListing.get(r.rightmove_id) || [];
    arr.sort((a, b) => (a.distance_mi ?? Infinity) - (b.distance_mi ?? Infinity));
    r.areas = arr;
  }
  return rows;
}

// The household-scoped read (step 2.13): ONE call to the household_feed RPC —
// the single visibility predicate (membership ∩ non-origin active areas ∩
// curated-disable ∩ geofence_pass ∩ baseline; see supabase/archive/
// schema-household-feed.sql + docs/DATA_MODEL.md). This retired the client-side
// composition (resolve area ids → page listing_areas → .in('rightmove_id', …)
// id list → belt-and-braces geofence gate): the id-list had a URL-length scale
// wall, and two half-rules held apart can disagree. The RPC returns the full
// membership set as `areas` jsonb; only display names are resolved client-side.
async function _householdFeed(sb, hid, { limit, status, includeOutOfArea }) {
  let nameById = new Map();
  try { nameById = new Map((await getAreaCatalog() ?? []).map((a) => [a.id, a.name])); }
  catch (e) { console.error('storage: area catalog for membership names', e.message); }
  const call = (lim, off) => sb.rpc('household_feed', {
    p_household_id: hid,
    p_status: status,
    p_include_out_of_area: includeOutOfArea,
    p_limit: lim,
    p_offset: off,
  });
  try {
    const rows = [];
    if (limit != null) {
      const { data, error } = await call(limit, 0);
      if (error) throw error;
      rows.push(...(data ?? []));
    } else {
      // Uncapped: page through everything (PostgREST caps a single response).
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await call(PAGE, from);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data ?? []).length < PAGE) break;
      }
    }
    for (const r of rows) {
      r.areas = (r.areas ?? []).map((m) => ({
        area_id: m.area_id,
        name: nameById.get(m.area_id) || _prettyAreaId(m.area_id),
        distance_mi: m.distance_mi,
        is_primary: !!m.is_primary,
      }));
    }
    return rows;
  } catch (e) {
    console.error('storage: household feed', e.message);
    return [];
  }
}

export async function getListings({ limit = 200, status = null, includeOutOfArea = false, scopeToHousehold = true } = {}) {
  const sb = await _initSb();
  if (!sb) return [];
  // Household-scoped (the Browse feed): the household_feed RPC owns the whole
  // visibility rule — a household with no target areas gets [] from it
  // naturally. With no household context (offline / pre-auth / local dev) we
  // fall through to the open read so tests and the signed-out shell still
  // render, mirroring getHouseholdAreas()'s fallback.
  if (scopeToHousehold) {
    const hid = await _getHid();
    if (hid) return await _householdFeed(sb, hid, { limit, status, includeOutOfArea });
  }
  // Unscoped read (saved view resolving live rows after an area is deselected,
  // signed-out shell, local dev). Rebuilt per page so filters and ordering are
  // applied consistently across the .range() window.
  const buildQuery = () => {
    let q = sb.from('listings').select(_LISTING_COLS).order('first_seen', { ascending: false });
    if (status) q = q.eq('status', status);
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
      return await _attachAreaMemberships(sb, data ?? []);
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
    return await _attachAreaMemberships(sb, all);
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
    const row = data?.[0] ?? null;
    if (!row) return null;
    // Attach the full area membership so the dossier can list every area this
    // property overlaps / is within range of (why it surfaces).
    await _attachAreaMemberships(sb, [row]);
    return row;
  } catch (e) {
    console.error('storage: read listing', e.message);
    return null;
  }
}

// ── /live-feed admin kiosk readers (aggregate RPC + public scraper log) ────
// Read-only, no localStorage cache (the kiosk always wants a fresh read). Both go
// through storage (CLAUDE.md §17.4 — page modules never call Supabase directly).

// The admin-only aggregate: cross-household counts + savings + rolling averages
// from the public.live_feed_stats() SECURITY DEFINER RPC. Returns the parsed
// object, or null on error (incl. the `forbidden` raise for any non-admin caller).
export async function getLiveFeedStats() {
  const sb = await _initSb();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc('live_feed_stats');
    if (error) { console.error('storage: live_feed_stats', error.message); return null; }
    return data ?? null;
  } catch (e) {
    console.error('storage: live_feed_stats', e.message);
    return null;
  }
}

// The Rightmove-scraper feed: recent public sync_log writes (fetcher rows,
// table_name='listings', actor='system') for client-side run clustering. Public
// read (qual=true), so it works for the household-less admin account. Returns the
// raw rows newest-first; [] on error.
export async function getScraperLog({ sinceDays = 3, limit = 400 } = {}) {
  const sb = await _initSb();
  if (!sb) return [];
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await sb
      .from('sync_log')
      .select('action, at')
      .eq('table_name', 'listings')
      .eq('actor', 'system')
      .gte('at', since)
      .order('at', { ascending: false })
      .limit(limit);
    if (error) { console.error('storage: read sync_log', error.message); return []; }
    return data ?? [];
  } catch (e) {
    console.error('storage: read sync_log', e.message);
    return [];
  }
}

// Persist the household's current "to review" count — the size of the visible
// Browse pool the listings page renders AFTER the full intelligence pipeline
// (radius → affordability gate → junk → refinement/probation → decided
// suppression → dedupe). The raw live-listings count cannot reproduce this, so
// the /live-feed kiosk reads this persisted figure (via live_feed_stats) instead.
// Upsert keyed on household_id into the derived household_review_stats cache.
export async function saveListingsReviewCount(count) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const { error } = await sb.from('household_review_stats').upsert(
      { household_id: hid, pending_count: Math.max(0, Math.round(Number(count) || 0)), updated_at: new Date().toISOString() },
      { onConflict: 'household_id' },
    );
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('storage: save review count', e.message);
    return false;
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
