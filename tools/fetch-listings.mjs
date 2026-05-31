#!/usr/bin/env node
// fetch-listings.mjs — v3 L1 listing fetcher (runtime-agnostic Node).
// Runs identically on a laptop or in GitHub Actions; writes via the PostgREST
// service-role path (the same automation writer tools/backfill-content-direct.mjs
// uses — NOT a third interactive writer). The Supabase MCP path is for Claude's
// interactive writes; this scheduled/dispatched job uses the service role.
//
// Pipeline (per outcode):
//   areas/*.json → distinct outcodes → resolve locationIdentifier (typeahead)
//   → Apify actor (dhrumil~rightmove-scraper) → normalise → validate-in-outcode
//   (coordinates-first, §L0 wrong-region guard) → dedupe → nearest-area match
//   → merge price_history vs existing rows → UPSERT listings (on_conflict=rightmove_id).
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   — required to write
//   APIFY_TOKEN, APIFY_ACTOR_ID               — required to fetch
//   FETCH_LIMIT (optional)                     — cap outcodes processed (debug)
//   USE_LEARNED=1 (optional)                   — v3 L4 "optimised search": read the
//                                                household's criteria + learned
//                                                preferences and narrow the Apify
//                                                query (minPrice/maxPrice/minBeds +
//                                                14-day recency), post-filter excluded
//                                                types, and process learned-favourite
//                                                outcodes first. Fewer paid results.
//   DRY_RUN=1 (optional)                       — fetch + normalise, print, do not write
//
// Usage:  node tools/fetch-listings.mjs                        (writes)
//         DRY_RUN=1 node tools/fetch-listings.mjs              (no writes)
//         USE_LEARNED=1 DRY_RUN=1 node tools/fetch-listings.mjs (preview the optimised search)

import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  normaliseRawListing,
  isInOutcode,
  withinGeofence,
  dedupeByRightmoveId,
  mergePriceHistory,
  haversineKm,
  MILES_PER_KM,
} from './listings-normalise.mjs';
import { effectiveWeights, deriveSearchSpec, isRecent } from '../assets/js/learned-preferences.js';
import { RECENCY_DAYS } from '../assets/js/intelligence-constants.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || 'dhrumil~rightmove-scraper';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const FETCH_LIMIT = Number(process.env.FETCH_LIMIT) || 0;
const USE_LEARNED = process.env.USE_LEARNED === '1' || process.env.USE_LEARNED === 'true';

const MAX_DAYS_SINCE_ADDED = 3;     // 3-day overlap so a missed run self-heals.
const RESULTS_PER_OUTCODE = Number(process.env.RESULTS_PER_OUTCODE) || 50;  // cap per outcode (lower = cheaper on pay-per-event actors)
const SOURCE = 'rightmove-apify';

const BROWSER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-GB,en;q=0.9',
  Referer: 'https://www.rightmove.co.uk/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

// ── areas → outcode map ──────────────────────────────────────────────────────
async function loadOutcodeMap() {
  const dir = resolve(root, 'data/areas');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const map = new Map(); // outcode → [{ id, name, outcode, lat, lng, geofenceRadiusKm? }]
  for (const f of files) {
    const a = JSON.parse(await readFile(resolve(dir, f), 'utf8'));
    if (a.active === false) continue;                       // L7.5 pruning (default active)
    const oc = String(a.postcode || '').toUpperCase().trim();
    const lat = a.coords?.lat, lng = a.coords?.lng;
    if (!oc || lat == null || lng == null) continue;
    if (!map.has(oc)) map.set(oc, []);
    map.get(oc).push({
      id: a.id, name: a.name, outcode: oc, lat: Number(lat), lng: Number(lng),
      geofenceRadiusKm: a.geofenceRadiusMi != null ? Number(a.geofenceRadiusMi) / MILES_PER_KM : undefined,
      searchRadiusMi: a.searchRadiusMi != null ? Number(a.searchRadiusMi) : undefined,
      rightmove: a.rightmove || undefined,
    });
  }
  return map;
}

/** Flatten the outcode map into the global active-village index. The geofence is
 *  measured GLOBALLY so a listing near a border village in a neighbouring outcode
 *  is matched/kept correctly rather than wrongly rejected. */
function flattenVillages(outcodeMap) {
  const all = [];
  for (const arr of outcodeMap.values()) for (const v of arr) all.push(v);
  return all;
}

const DEFAULT_SEARCH_MI = 3;
const CLUSTER_CAP_MI = Number(process.env.CLUSTER_CAP_MI) || 5;   // max disk radius
const SEARCH_MODE = (process.env.SEARCH_MODE || 'outcode').toLowerCase();

/**
 * Greedy geometric set-cover: merge villages whose search disks overlap into one
 * search, so a dense outcode collapses to a few disks and a sparse one becomes
 * village-tight disks (SP11 → two ~3mi disks around Wherwell + Newton Stacey;
 * Andover is never fetched). Pure — coordinates only.
 */
function clusterVillages(villages, { capMiles = CLUSTER_CAP_MI } = {}) {
  const remaining = villages.filter((v) => v.lat != null && v.lng != null);
  const clusters = [];
  while (remaining.length) {
    const seed = remaining.shift();
    const members = [seed];
    for (let i = remaining.length - 1; i >= 0; i--) {
      const v = remaining[i];
      const mi = haversineKm(seed, v) * MILES_PER_KM;
      // Absorb v if one disk centred on the seed can still cover v + its buffer.
      if (mi + (v.searchRadiusMi || DEFAULT_SEARCH_MI) <= capMiles) { members.push(v); remaining.splice(i, 1); }
    }
    let radius = seed.searchRadiusMi || DEFAULT_SEARCH_MI;
    for (const m of members) radius = Math.max(radius, haversineKm(seed, m) * MILES_PER_KM + (m.searchRadiusMi || DEFAULT_SEARCH_MI));
    clusters.push({ center: seed, radiusMiles: Math.min(radius, capMiles), members });
  }
  return clusters;
}

/**
 * Turn the active villages into Apify search targets for a given mode:
 *   outcode — one search per outcode (no radius; the cheapest *change*, geofence
 *             trims spillover). Zero-risk default; works without resolved ids.
 *   village — one search per active village using its resolved rightmove identifier
 *             + searchRadiusMi (maximum precision; ~195 small searches).
 *   cluster — greedy set-cover of overlapping village disks (recommended): few
 *             searches, each tight. Villages without a tight identifier fall back
 *             to their outcode identifier (still gains the radius).
 * Each target: { label, outcode, locationIdentifier|null, radiusMiles|null, areas }.
 */
function buildSearchTargets(outcodeMap, mode = SEARCH_MODE) {
  const villages = flattenVillages(outcodeMap);
  const idOf = (v) => v.rightmove?.locationIdentifier || null;     // populated by L7.3 resolver

  if (mode === 'village') {
    return villages.map((v) => ({
      label: v.id, outcode: v.outcode,
      locationIdentifier: idOf(v), radiusMiles: idOf(v) ? (v.searchRadiusMi || DEFAULT_SEARCH_MI) : null,
      areas: [v],
    }));
  }
  if (mode === 'cluster') {
    const targets = [];
    // Cluster within each outcode so a cluster's fallback identifier is unambiguous.
    for (const [oc, arr] of outcodeMap) {
      for (const c of clusterVillages(arr)) {
        const id = idOf(c.center);
        targets.push({
          label: `${oc}:${c.center.id}+${c.members.length - 1}`, outcode: oc,
          locationIdentifier: id, radiusMiles: id ? c.radiusMiles : null, areas: c.members,
        });
      }
    }
    return targets;
  }
  // outcode (default)
  return [...outcodeMap.entries()].map(([oc, arr]) => ({
    label: oc, outcode: oc, locationIdentifier: null, radiusMiles: null, areas: arr,
  }));
}

// ── outcode → Rightmove locationIdentifier (typeahead) ───────────────────────
async function resolveLocationId(outcode) {
  const url = `https://los.rightmove.co.uk/typeahead?query=${encodeURIComponent(outcode)}&limit=10`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`typeahead HTTP ${res.status}`);
  const json = await res.json();
  const matches = json?.matches || json?.typeAheadLocations || json?.locations || json?.suggestions || [];
  const idOf = (m) => String(m.locationIdentifier || m.identifier || m.id || m.locationId || m.value || '');
  const txtOf = (m) => String(m.displayName || m.displayText || m.name || m.label || m.text || '').toUpperCase();
  const hit =
    matches.find((m) => idOf(m).toUpperCase().startsWith('OUTCODE')) ||
    matches.find((m) => txtOf(m).includes(outcode.toUpperCase())) ||
    matches[0];
  if (!hit) throw new Error('no typeahead match');
  let id = idOf(hit);
  if (!id) throw new Error('typeahead match has no id');
  if (/^\d+$/.test(id)) {
    const type = String(hit.type || hit.locationType || 'OUTCODE').toUpperCase();
    id = `${type}^${id}`;
  }
  return id;
}

// Build the Rightmove search URL. A learned `spec` (v3 L4) narrows it: price
// floor/ceiling and a bed minimum cut the paid result count, and the recency
// window comes from the spec (14d for an optimised run vs the 3d cron overlap).
function buildSearchUrl(locationIdentifier, spec = null, opts = {}) {
  const params = new URLSearchParams({
    searchType: 'SALE',
    locationIdentifier,
    sortType: '6',                 // newest first
    maxDaysSinceAdded: String(spec?.recencyDays ?? MAX_DAYS_SINCE_ADDED),
  });
  if (spec?.priceMin) params.set('minPrice', String(spec.priceMin));
  if (spec?.priceMax) params.set('maxPrice', String(spec.priceMax));
  if (spec?.minBeds) params.set('minBedrooms', String(spec.minBeds));
  // L7.4: a search radius (miles) turns a point identifier (POSTCODE^/REGION^/
  // STATION^) into a tight disk — so a sparse outcode stops returning Andover.
  const radiusMiles = opts.radiusMiles ?? spec?.radiusMiles;
  if (radiusMiles != null) params.set('radius', String(radiusMiles));
  return `https://www.rightmove.co.uk/property-for-sale/find.html?${params}`;
}

// Post-filter normalised listings by the learned spec: drop excluded property
// types and (when a listing carries an added_date) anything outside the recency
// window. Undated listings are kept (we can't prove they're stale). Pure.
function filterListingsBySpec(listings, spec, now = new Date()) {
  if (!spec) return listings;
  const excl = new Set((spec.excludeTypes || []).map((s) => String(s).toLowerCase()));
  return listings.filter((l) => {
    if (excl.size && l.property_type && excl.has(String(l.property_type).toLowerCase())) return false;
    if (spec.recencyDays && l.added_date && !isRecent(l, now, spec.recencyDays)) return false;
    return true;
  });
}

// Reorder outcodes so the household's learned-favourite outcodes come first
// (under a FETCH_LIMIT cap they get priority). Never drops the others — the
// user wants the whole patch covered. Pure.
function orderOutcodesByFocus(outcodes, spec) {
  if (!spec || !spec.focusOutcodes?.length) return outcodes;
  const focus = new Set(spec.focusOutcodes.map((s) => String(s).toUpperCase()));
  const f = [], rest = [];
  for (const oc of outcodes) (focus.has(String(oc).toUpperCase()) ? f : rest).push(oc);
  return [...f, ...rest];
}

// ── Apify actor ──────────────────────────────────────────────────────────────
async function fetchRawForOutcode(locationIdentifier, spec = null, radiusMiles = null) {
  if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not set');
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR_ID)}` +
    `/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;
  const input = {
    listUrls: [{ url: buildSearchUrl(locationIdentifier, spec, { radiusMiles }) }],
    maxItems: RESULTS_PER_OUTCODE,
    monitoringMode: false,
    includePriceHistory: false,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`apify HTTP ${res.status}`);
  const items = await res.json();
  return Array.isArray(items) ? items : [];
}

// ── nearest-area match within the outcode ────────────────────────────────────
function assignArea(listing, areas) {
  if (listing.lat == null || listing.lng == null || !areas.length) return null;
  let best = null, bestKm = Infinity;
  for (const a of areas) {
    const km = haversineKm({ lat: listing.lat, lng: listing.lng }, a);
    if (km < bestKm) { bestKm = km; best = a; }
  }
  return best?.id ?? null;
}

// ── Supabase REST (service role) ─────────────────────────────────────────────
async function restGetExisting(ids) {
  if (!ids.length) return new Map();
  const inList = ids.map((i) => `"${i}"`).join(',');
  const url = `${SUPABASE_URL}/rest/v1/listings?select=rightmove_id,price,price_history,first_seen&rightmove_id=in.(${inList})`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`GET existing failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return new Map(rows.map((r) => [r.rightmove_id, r]));
}

async function restUpsert(rows) {
  const url = `${SUPABASE_URL}/rest/v1/listings?on_conflict=rightmove_id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`UPSERT failed: ${res.status} ${await res.text()}`);
  return rows.length;
}

async function syncLog(entries) {
  if (!entries.length) return;
  const url = `${SUPABASE_URL}/rest/v1/sync_log`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(entries),
  });
  if (!res.ok) console.warn(`sync_log write failed: ${res.status}`);
}

async function restGetOne(table, select) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=1`;
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
  const rows = await res.json();
  return rows[0] ?? null;
}

// v3 L4 optimised search: read the household's criteria + learned preferences and
// distil them into a narrowing spec (deriveSearchSpec). Returns null when learned
// mode is off or there's nothing to read — the fetcher then behaves exactly as L1.
async function loadSearchSpec() {
  if (!USE_LEARNED) return null;
  if (!SERVICE_KEY) { console.warn('USE_LEARNED set but no service key — skipping learned narrowing'); return null; }
  try {
    const [crit, lp] = await Promise.all([
      restGetOne('criteria', 'data'),
      restGetOne('learned_preferences', 'derived,overrides'),
    ]);
    const effective = effectiveWeights(lp?.derived || {}, lp?.overrides || {});
    return deriveSearchSpec(effective, crit?.data || {}, { recencyDays: RECENCY_DAYS });
  } catch (e) {
    console.warn('learned spec load failed:', e.message);
    return null;
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== L1 fetch-listings ===');
  console.log(`actor: ${APIFY_ACTOR_ID} · mode: ${SEARCH_MODE} · maxDaysSinceAdded: ${MAX_DAYS_SINCE_ADDED} · resultsPerTarget: ${RESULTS_PER_OUTCODE} · fetchLimit: ${FETCH_LIMIT || 'all'} · dry-run: ${DRY_RUN}`);
  if (!DRY_RUN && !SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY required to write (or set DRY_RUN=1)');

  const spec = await loadSearchSpec();
  if (spec) {
    console.log('learned search spec:', JSON.stringify(spec));
  } else if (USE_LEARNED) {
    console.log('learned mode requested but no spec resolved — running as plain L1');
  }

  const outcodeMap = await loadOutcodeMap();
  const ALL_ACTIVE = flattenVillages(outcodeMap);          // global geofence index
  // L7.4: build search targets for the chosen mode (outcode|village|cluster), then
  // order by learned focus (by outcode) and cap with FETCH_LIMIT.
  let targets = buildSearchTargets(outcodeMap, SEARCH_MODE);
  if (spec?.focusOutcodes?.length) {
    const focus = new Set(spec.focusOutcodes.map((s) => String(s).toUpperCase()));
    targets = [...targets.filter((t) => focus.has(t.outcode)), ...targets.filter((t) => !focus.has(t.outcode))];
  }
  if (FETCH_LIMIT) targets = targets.slice(0, FETCH_LIMIT);
  console.log(`targets: ${targets.length} (${SEARCH_MODE}) · active villages: ${ALL_ACTIVE.length}`);

  const now = new Date();
  let totalRaw = 0, totalKept = 0, totalRejected = 0, totalFlagged = 0, totalWritten = 0, totalPriceChanges = 0;

  for (const target of targets) {
    const oc = target.outcode;
    const areas = target.areas || [];
    try {
      const locId = target.locationIdentifier || await resolveLocationId(oc);
      const raw = await fetchRawForOutcode(locId, spec, target.radiusMiles);
      totalRaw += raw.length;

      const normalised = raw.map((r) => normaliseRawListing(r, { outcode: oc, source: SOURCE, now })).filter(Boolean);

      // L7: the DECISIVE gate is the coordinate geofence against the GLOBAL active
      // village set — not the 20km isInOutcode wrong-region guard (kept only as a
      // diagnostic). Coordinates decide; the listing's own name/postcode text
      // corroborates. corroborated=false → FLAG for audit, never silently dropped.
      const geo = normalised.map((l) => ({ l, g: withinGeofence(l, { villages: ALL_ACTIVE }) }));
      const inBuffer = geo.filter((x) => x.g.pass).map((x) => ({
        ...x.l,
        area_id: x.g.area_id,
        distance_mi: x.g.distance_mi,
        geofence_pass: true,
        name_match: x.g.name_match,
        corroborated: x.g.corroborated,
        match_source: x.g.name_match !== null ? 'coordinates+name' : 'coordinates',
      }));
      const rejected = normalised.length - inBuffer.length;
      totalRejected += rejected;
      // Diagnostic only: how many of the rejected were also out of the coarse region.
      const outOfRegion = geo.filter((x) => !x.g.pass && !isInOutcode(x.l, { outcode: oc, areaCoords: areas })).length;

      // v3 L4: apply the learned post-filter (excluded types + recency).
      const onSpec = filterListingsBySpec(inBuffer, spec, now);
      const filteredOut = inBuffer.length - onSpec.length;

      const deduped = dedupeByRightmoveId(onSpec);          // area_id already set by the geofence
      const flagged = deduped.filter((l) => l.corroborated === false).length;
      totalKept += deduped.length;
      totalFlagged += flagged;

      const radiusNote = target.radiusMiles != null ? ` r=${target.radiusMiles.toFixed(1)}mi` : '';
      console.log(`── ${target.label} (${locId}${radiusNote}): raw ${raw.length} → in-buffer ${inBuffer.length}${filteredOut ? ` → on-spec ${onSpec.length}` : ''} → unique ${deduped.length}${rejected ? `  [${rejected} out-of-buffer, ${outOfRegion} out-of-region]` : ''}${flagged ? ` · ${flagged} flagged` : ''}`);

      if (DRY_RUN) {
        for (const l of deduped.slice(0, 5)) {
          const flag = l.corroborated === false ? ' ⚠' : '';
          console.log(`    • ${l.address ?? '—'} — £${(l.price ?? 0).toLocaleString('en-GB')} — ${l.beds ?? '?'}bd ${l.property_type ?? ''} → ${l.area_id ?? '—'} (${(l.distance_mi ?? 0).toFixed(1)}mi)${flag}`);
        }
        continue;
      }

      // Merge price_history against existing rows; preserve first_seen.
      const existing = await restGetExisting(deduped.map((l) => l.rightmove_id));
      const payload = deduped.map((l) => {
        const prev = existing.get(l.rightmove_id);
        const { price_history, priceChanged } = mergePriceHistory(prev, l, now);
        if (priceChanged) totalPriceChanges += 1;
        return {
          ...l,
          first_seen: prev?.first_seen ?? l.first_seen, // never reset on update
          last_seen: now.toISOString(),
          price_history,
          raw_json: l.raw_json,
        };
      });

      if (payload.length) {
        await restUpsert(payload);
        await syncLog(payload.map((p) => ({
          table_name: 'listings', actor: 'system', action: existing.has(p.rightmove_id) ? 'update' : 'insert', row_id: p.rightmove_id,
        })));
        totalWritten += payload.length;
      }
    } catch (e) {
      console.log(`── ${target.label}: ✗ ${e.message}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`raw ${totalRaw} · kept(in-buffer,unique) ${totalKept} · out-of-buffer ${totalRejected} · flagged(corroborated=false) ${totalFlagged} · written ${totalWritten} · price-changes ${totalPriceChanges}`);
}

// Only run when invoked directly (so the orchestrator can be imported safely).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('FETCH CRASHED:', e); process.exit(1); });
}

export { loadOutcodeMap, assignArea, buildSearchUrl, filterListingsBySpec, orderOutcodesByFocus, clusterVillages, buildSearchTargets };
