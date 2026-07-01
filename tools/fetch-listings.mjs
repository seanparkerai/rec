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
//   FETCH_LIMIT (optional)                     — cap targets processed (debug)
//   MAX_DAYS_SINCE_ADDED (optional)            — recency window in days (default 3);
//                                                overridden to 14 when FOUNDATION_MODE=1
//   FOUNDATION_MODE=1 (optional)               — 14-day backfill: sets the recency
//                                                window to 14 days for one-time pulls;
//                                                print a dry-run cost estimate first
//   APIFY_MAX_BUDGET_USD (optional)            — hard USD spend cap passed to the Apify
//                                                actor; Apify self-terminates at this
//                                                limit (default 25). PPE actors stop
//                                                cleanly — no overrun possible.
//   USE_LEARNED=1 (optional)                   — v3 L4 "optimised search": read the
//                                                household's criteria + learned
//                                                preferences and narrow the Apify
//                                                query (minPrice/maxPrice/minBeds +
//                                                14-day recency), post-filter excluded
//                                                types, and process learned-favourite
//                                                outcodes first. Fewer paid results.
//   DRY_RUN=1 (optional)                       — resolve + preview, print projected
//                                                target count + estimated cost, no writes
//
// Usage:  node tools/fetch-listings.mjs                           (writes, daily mode)
//         DRY_RUN=1 node tools/fetch-listings.mjs                 (preview daily mode)
//         FOUNDATION_MODE=1 DRY_RUN=1 node tools/fetch-listings.mjs  (preview foundation pull)
//         FOUNDATION_MODE=1 node tools/fetch-listings.mjs             (CONFIRM before running!)

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
import { isFetchEligible, deriveOutcode } from '../assets/js/areas/area-enrich.js';
import { isCuratedDisabled } from '../assets/js/areas/area-ref.js';
import { effectiveWeights, deriveSearchSpec, isRecent } from '../assets/js/learned-preferences.js';
import { probationDropIds, reprobeThisRun } from '../assets/js/refinement/scope.js';
import { resolveConfig } from '../assets/js/refinement/config.js';
import { RECENCY_DAYS } from '../assets/js/intelligence-constants.js';
import { passesBaseline } from '../assets/js/listings/classify.js';
import { membershipRowsFor, replaceListingAreas } from './listing-areas-writer.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || 'dhrumil~rightmove-scraper';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const FETCH_LIMIT = Number(process.env.FETCH_LIMIT) || 0;
const USE_LEARNED = process.env.USE_LEARNED === '1' || process.env.USE_LEARNED === 'true';
const FOUNDATION_MODE = process.env.FOUNDATION_MODE === '1' || process.env.FOUNDATION_MODE === 'true';

// Rightmove only accepts 1/3/7/14 for maxDaysSinceAdded — any other value returns 0 results.
// Foundation mode: null (omit the param entirely — pull all available listings).
// Daily mode: 3-day overlap so a missed cron self-heals.
const VALID_DAYS = new Set([1, 3, 7, 14]);
const MAX_DAYS_SINCE_ADDED = FOUNDATION_MODE ? null : (Number(process.env.MAX_DAYS_SINCE_ADDED) || 3);
// AREA_IDS: optional comma-separated list of area IDs to restrict the fetch to.
// When set, only areas in this list are fetched (curated or household stubs).
// Applied after all sources are merged and pruned — unmatched outcodes are dropped.
const AREA_IDS = process.env.AREA_IDS
  ? new Set(process.env.AREA_IDS.split(',').map((s) => s.trim()).filter(Boolean))
  : null;

const RESULTS_PER_OUTCODE = Number(process.env.RESULTS_PER_OUTCODE) || 50;  // cap per target (lower = cheaper on pay-per-event actors)
// Hard USD spend cap: passed to Apify as maxBudget. PPE actors self-terminate — no overrun possible.
const APIFY_MAX_BUDGET_USD = Number(process.env.APIFY_MAX_BUDGET_USD) || 25;

// Always-on baseline source filters — injected into EVERY Rightmove search URL.
// Never removed, only tightened by the learned spec.
// PRICE is the exception: the live band per search target is the UNION of the
// linked households' budgets (criteria.budget.{min,max} — lowest min, highest
// max, see priceBandForAreas). BASELINE_PRICE_MIN/MAX is the FALLBACK band,
// used when an area has no linked household or a budget can't be read.
const BASELINE_PRICE_MIN = 250000;
const BASELINE_PRICE_MAX = 425000;
const BASELINE_MIN_BEDS = 2;
const BASELINE_DONT_SHOW = 'retirement,sharedOwnership';
// Always-on property-type allow-list (Rightmove slugs). Rightmove files apartments,
// maisonettes, ground flats, penthouses, studios, coach houses and duplexes ALL under
// `flat`, so omitting `flat` excludes the whole flat family in one shot; omitting
// `land` and `park-home` excludes those too. All at source — Apify never returns (or
// bills for) an excluded type. Houses + bungalows only; matches criteria.propertyTypes.
// This is a hard allow-list: a learned spec can post-filter further but can never
// re-admit an excluded type.
const BASELINE_PROPERTY_TYPES = ['detached', 'semi-detached', 'terraced', 'bungalow'];
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

/**
 * Turn household-linked Supabase area rows into fetcher village entries (same shape
 * as loadOutcodeMap values). A household-onboarding stub is never materialised to a
 * repo file (sync-areas-from-supabase skips it), so the fetcher reads it live and
 * merges it in here — making a newly-added, accurately-located area eligible for the
 * very next run with no commit/promotion. INCLUSION is driven by isFetchEligible
 * (coords + derivable outcode + county confirmed), NOT by the active flag (a stub is
 * always active:false by RLS), so the repo's active===false skip never excludes it.
 * Rows whose id is already in the repo set (curated catalog-match links) are dropped
 * — they are already covered by loadOutcodeMap. Un-enriched / county-flagged stubs are
 * dropped here and stay "Researching". Pure (no network) so it unit-tests without
 * Supabase.
 * @param {Array<{id:string,data:object}>} rows  joined areas rows for the household.
 * @param {Set<string>} repoIds  ids already present in the repo outcode map.
 * @returns {Array} village entries: { id, name, outcode, lat, lng, geofenceRadiusKm?, searchRadiusMi?, rightmove? }
 */
function householdRowsToVillages(rows, repoIds = new Set()) {
  const out = [];
  const seen = new Set();
  for (const r of rows || []) {
    const data = r?.data || {};
    const id = r?.id || data.id;
    if (!id || seen.has(id) || repoIds.has(id)) continue;
    // active:false is authoritative for CURATED areas: a deliberate disable must never be
    // re-admitted by a stale household_areas link. Onboarding stubs are ALSO active:false
    // but must stay admittable by design, so they are exempt (isCuratedDisabled checks the
    // source tag). The SAME predicate gates the display feed, so scrape + display stay in
    // lockstep. (Without this guard, repoIds — built from the already-pruned outcodeMap —
    // omits disabled curated areas, so the repoIds.has(id) dedupe above never catches them.)
    if (isCuratedDisabled(data)) continue;
    if (!isFetchEligible(data)) continue;
    const outcode = String(deriveOutcode(data.postcode) || '').toUpperCase();
    if (!outcode) continue;
    out.push({
      id, name: data.name, outcode,
      // Full postcode kept (stubs store one) so a tight POSTCODE^ identifier can
      // be resolved at run time when the stub has none — see resolveTightIdFromPostcode.
      postcode: String(data.postcode || '').toUpperCase().trim(),
      lat: Number(data.coords.lat), lng: Number(data.coords.lng),
      geofenceRadiusKm: data.geofenceRadiusMi != null ? Number(data.geofenceRadiusMi) / MILES_PER_KM : undefined,
      searchRadiusMi: data.searchRadiusMi != null ? Number(data.searchRadiusMi) : undefined,
      rightmove: data.rightmove || undefined,
    });
    seen.add(id);
  }
  return out;
}

/**
 * Demand-gate the fetch set: keep only areas at least one ACTIVE household has
 * linked (v.id ∈ demandSet). A curated area nobody currently searches drops out
 * entirely — the fetch-side mirror of the per-household active/inactive pause, so
 * the last household to pause/remove an area takes it out of the scraper (zero
 * demand → no scrape). Household stubs are in the demand set by construction (they
 * exist only because a household linked them). Returns a NEW Map (outcodes with no
 * surviving area are dropped); the input is left untouched. The caller skips this
 * filter entirely when the household_areas read failed, so a read outage can never
 * zero a run. Pure — no network, no env.
 * @param {Map<string, Array>} outcodeMap  outcode → village entries
 * @param {Set<string>} demandSet  area_ids with ≥1 active household link
 * @returns {Map<string, Array>} filtered copy
 */
function demandFilterOutcodeMap(outcodeMap, demandSet) {
  const out = new Map();
  for (const [oc, arr] of outcodeMap) {
    const kept = (arr || []).filter((v) => demandSet.has(v.id));
    if (kept.length) out.set(oc, kept);
  }
  return out;
}

const DEFAULT_SEARCH_MI = 3;
// Per-area learned radius (area_search_tuning, written by tools/radius-tune.mjs). The
// exploration-ring radius (RADIUS_CEIL_MI) is reused when an area is inside its periodic
// re-widening window so the boundary stays measurable.
const { RADIUS_CEIL_MI } = resolveConfig();
const CLUSTER_CAP_MI = Number(process.env.CLUSTER_CAP_MI) || 7;   // max disk radius (mi); lower = tighter/cheaper-per-result but more runs
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
  // Only a TIGHT identifier (a point: POSTCODE/REGION/STATION) earns a radius disk.
  // A coarse OUTCODE identifier is NOT village-precise, so it counts as unresolved
  // here and the outcode falls back to a single whole-outcode search.
  const idOf = (v) => (v.rightmove?.identifierQuality === 'tight' ? v.rightmove.locationIdentifier : null);

  if (mode === 'village') {
    return villages.map((v) => ({
      label: v.id, outcode: v.outcode,
      locationIdentifier: idOf(v), radiusMiles: idOf(v) ? (v.searchRadiusMi || DEFAULT_SEARCH_MI) : null,
      areas: [v],
    }));
  }
  if (mode === 'cluster') {
    // Cost-safe by construction: cluster NEVER issues more searches than outcode
    // mode. An outcode with ANY unresolved (coarse) village is fetched as ONE
    // whole-outcode search (which also covers its tight villages — a tight disk
    // there would just overlap and double-bill). Only a FULLY-tight outcode is
    // searched as tight disks (no whole-outcode fetch). So savings grow as
    // resolution completes per outcode, and can never regress.
    const targets = [];
    for (const [oc, arr] of outcodeMap) {
      const allTight = arr.every((v) => idOf(v));
      if (!allTight) {
        targets.push({ label: oc, outcode: oc, locationIdentifier: null, radiusMiles: null, areas: arr });
        continue;
      }
      for (const c of clusterVillages(arr)) {
        targets.push({
          label: `${oc}:${c.center.id}+${c.members.length - 1}`, outcode: oc,
          locationIdentifier: idOf(c.center), radiusMiles: c.radiusMiles, areas: c.members,
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

/**
 * Merge duplicate search targets. Two villages can resolve to the SAME tight
 * identifier (e.g. flexcombe-gu32/flexcombe-gu33 share one postcode), which
 * produces two identical paid searches every run. Merge by locationIdentifier,
 * keeping the widest radius and the union of covered areas (so the budget band
 * and the per-target logs still account for every village). Outcode-fallback
 * targets (null identifier) are already unique per outcode key. Pure.
 */
function dedupeSearchTargets(targets) {
  const out = [];
  const byId = new Map();
  for (const t of targets || []) {
    if (!t.locationIdentifier) { out.push(t); continue; }
    const prev = byId.get(t.locationIdentifier);
    if (!prev) { byId.set(t.locationIdentifier, t); out.push(t); continue; }
    prev.label = `${prev.label}=${t.label}`;
    if (t.radiusMiles != null) prev.radiusMiles = Math.max(prev.radiusMiles ?? 0, t.radiusMiles);
    for (const a of t.areas || []) {
      if (!(prev.areas || []).some((x) => x.id === a.id)) prev.areas.push(a);
    }
  }
  return out;
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

// ── full postcode → tight Rightmove identifier (household stubs) ─────────────
// A located household stub stores a FULL postcode but no resolved Rightmove
// identifier, so cluster mode demotes its whole outcode to a coarse search: no
// radius disk, and a listing just over the outcode border (but inside the
// village's search radius) is never returned. Resolving the full postcode to a
// POSTCODE^ identifier here (the same typeahead path resolve-areas.mjs uses for
// curated villages) restores the precise disk search. Returns null on any
// failure — the village simply stays coarse for this run.
async function resolveTightIdFromPostcode(fullPostcode) {
  try {
    const url = `https://los.rightmove.co.uk/typeahead?query=${encodeURIComponent(fullPostcode)}&limit=10`;
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) return null;
    const json = await res.json();
    const matches = json?.matches || json?.typeAheadLocations || json?.locations || json?.suggestions || [];
    const idOf = (m) => String(m.locationIdentifier || m.identifier || m.id || m.locationId || m.value || '');
    const isPostcode = (m) =>
      idOf(m).toUpperCase().startsWith('POSTCODE') ||
      String(m.type || m.locationType || '').toUpperCase() === 'POSTCODE';
    const hit = matches.find(isPostcode);
    if (!hit) return null;
    let id = idOf(hit);
    if (/^\d+$/.test(id)) id = `POSTCODE^${id}`;
    return id.toUpperCase().startsWith('POSTCODE') ? id : null;
  } catch {
    return null;
  }
}

// Build the Rightmove search URL. Always-on baseline (BASELINE_MIN_BEDS,
// BASELINE_DONT_SHOW, property-type allow-list) is injected into every call — a
// learned `spec` (v3 L4) can only tighten these, never loosen them.
// The price band comes from opts.priceMin/priceMax (the per-target union of
// linked households' budgets), defaulting to the fallback BASELINE_PRICE_MIN/MAX.
// opts.days overrides the recency window (used by tests; production passes via spec).
function buildSearchUrl(locationIdentifier, spec = null, opts = {}) {
  const rawDays = opts.days ?? spec?.recencyDays ?? MAX_DAYS_SINCE_ADDED;
  // Coerce to nearest valid Rightmove value; null = omit (foundation pull — all listings).
  const days = rawDays == null ? null : (VALID_DAYS.has(Number(rawDays)) ? Number(rawDays) : 14);
  // locationIdentifier MUST stay outside URLSearchParams — URLSearchParams encodes ^ as %5E
  // which Rightmove double-decodes to a dead URL returning 0 results. Pass it as a raw literal.
  const params = new URLSearchParams({
    searchType: 'SALE',
    sortType: '6',                 // newest first
  });
  if (days != null) params.set('maxDaysSinceAdded', String(days));
  // Always-on baseline: price band, minimum beds, excluded categories, and the
  // house+bungalow allow-list (excludes the whole flat family + land + park-home at source).
  // The band is the per-target household-budget union when supplied; fallback otherwise.
  const priceMin = Number(opts.priceMin) || BASELINE_PRICE_MIN;
  const priceMax = Number(opts.priceMax) || BASELINE_PRICE_MAX;
  params.set('minPrice', String(priceMin));
  params.set('maxPrice', String(priceMax));
  params.set('minBedrooms', String(BASELINE_MIN_BEDS));
  params.set('dontShow', BASELINE_DONT_SHOW);
  params.set('propertyTypes', BASELINE_PROPERTY_TYPES.join(','));
  // A learned spec can tighten (raise minPrice, lower maxPrice, raise minBeds) within the band.
  if (spec?.priceMin && spec.priceMin > priceMin) params.set('minPrice', String(spec.priceMin));
  if (spec?.priceMax && spec.priceMax < priceMax) params.set('maxPrice', String(spec.priceMax));
  if (spec?.minBeds && spec.minBeds > BASELINE_MIN_BEDS) params.set('minBedrooms', String(spec.minBeds));
  // L7.4: a search radius (miles) turns a point identifier (POSTCODE^/REGION^/
  // STATION^) into a tight disk — so a sparse outcode stops returning Andover.
  const radiusMiles = opts.radiusMiles ?? spec?.radiusMiles;
  if (radiusMiles != null) params.set('radius', String(radiusMiles));
  return `https://www.rightmove.co.uk/property-for-sale/find.html?locationIdentifier=${locationIdentifier}&${params}`;
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
async function fetchRawForOutcode(locationIdentifier, spec = null, radiusMiles = null, band = null) {
  if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not set');
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR_ID)}` +
    `/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;
  const input = {
    listUrls: [{ url: buildSearchUrl(locationIdentifier, spec, { radiusMiles, priceMin: band?.min, priceMax: band?.max }) }],
    maxItems: RESULTS_PER_OUTCODE,
    monitoringMode: false,
    includePriceHistory: false,
    maxBudget: APIFY_MAX_BUDGET_USD,   // USD hard cap; actor self-terminates at limit
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
  const url = `${SUPABASE_URL}/rest/v1/listings?select=rightmove_id,price,price_history,first_seen,image_url&rightmove_id=in.(${inList})`;
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

// Household-added areas (service-role read). The onboarding/Areas flow inserts an
// accurately-located stub (source='household-onboarding', active=false) and links it
// via household_areas; those stubs are intentionally NOT materialised to repo files,
// so the fetcher reads them live here and merges the eligible ones into the target
// set. Only status='active' links are read — a paused ('inactive') link drops out of
// the demand set. Returns { rows, links, ok }: the joined [{ id, data }] area rows,
// the raw household_id↔area_id links (for per-target budget bands + the demand gate),
// and `ok` = whether the read SUCCEEDED. `ok` is the demand gate's safety latch:
// only a successful read may prune curated areas to those with active demand; on a
// failure (or no service key) ok=false so the run falls back to all curated areas
// rather than silently zeroing out. Empty (never throws) so a read outage never crashes.
async function loadHouseholdAreas() {
  if (!SERVICE_KEY) return { rows: [], links: [], ok: false };
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  try {
    const laUrl = `${SUPABASE_URL}/rest/v1/household_areas?status=eq.active&select=household_id,area_id,is_origin`;
    const laRes = await fetch(laUrl, { headers });
    if (!laRes.ok) throw new Error(`GET household_areas failed: ${laRes.status}`);
    const links = (await laRes.json()) || [];
    const ids = [...new Set(links.map((l) => l.area_id).filter(Boolean))];
    if (!ids.length) return { rows: [], links, ok: true };   // genuine zero demand (read succeeded)
    const inList = ids.map((i) => `"${i}"`).join(',');
    const aUrl = `${SUPABASE_URL}/rest/v1/areas?id=in.(${inList})&select=id,data`;
    const aRes = await fetch(aUrl, { headers });
    if (!aRes.ok) throw new Error(`GET areas failed: ${aRes.status}`);
    return { rows: await aRes.json(), links, ok: true };
  } catch (e) {
    console.warn('household areas load failed:', e.message);
    return { rows: [], links: [], ok: false };
  }
}

// Per-household budget bands (service-role read): criteria.budget.{min,max} for
// every household. A row without a positive max is skipped (treated as
// unbudgeted → fallback band); a missing/invalid min falls back to
// BASELINE_PRICE_MIN so a max-only budget never opens the floor to £0.
// Returns Map household_id → { min, max }; empty on failure (fallback band).
async function loadHouseholdBudgets() {
  const budgets = new Map();
  if (!SERVICE_KEY) return budgets;
  try {
    const url = `${SUPABASE_URL}/rest/v1/criteria?select=household_id,data`;
    const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!res.ok) throw new Error(`GET criteria failed: ${res.status}`);
    for (const r of (await res.json()) || []) {
      const b = r?.data?.budget || {};
      const min = Number(b.min), max = Number(b.max);
      if (!r?.household_id || !(Number.isFinite(max) && max > 0)) continue;
      budgets.set(r.household_id, { min: Number.isFinite(min) && min > 0 ? min : BASELINE_PRICE_MIN, max });
    }
    return budgets;
  } catch (e) {
    console.warn('household budgets load failed:', e.message);
    return budgets;
  }
}

/**
 * Union price band for one search target: scrutinise every household linked to
 * any of the target's areas and take the LOWEST budget.min and HIGHEST
 * budget.max across them, so a single Rightmove search covers all of them. A
 * linked household with no stored budget folds in the fallback band (its
 * coverage never shrinks); a target whose areas have no household links at all
 * gets the fallback band unchanged. Pure — unit-tests without Supabase.
 * @param {Array<string>} areaIds  the target's area ids
 * @param {Map<string,Set<string>>} areaHouseholds  area_id → linked household ids
 * @param {Map<string,{min:number,max:number}>} budgets  household_id → band
 * @returns {{min:number,max:number}}
 */
function priceBandForAreas(areaIds, areaHouseholds, budgets, fallback = { min: BASELINE_PRICE_MIN, max: BASELINE_PRICE_MAX }) {
  const households = new Set();
  for (const id of areaIds || []) {
    for (const h of areaHouseholds?.get(id) || []) households.add(h);
  }
  let min = Infinity, max = -Infinity, anyBudget = false, anyUnbudgeted = households.size === 0;
  for (const h of households) {
    const b = budgets?.get(h);
    if (b && Number.isFinite(b.min) && Number.isFinite(b.max) && b.min <= b.max) {
      min = Math.min(min, b.min); max = Math.max(max, b.max); anyBudget = true;
    } else {
      anyUnbudgeted = true;
    }
  }
  if (!anyBudget || anyUnbudgeted) { min = Math.min(min, fallback.min); max = Math.max(max, fallback.max); }
  return { min, max };
}

const fmtPrice = (v) => `£${v % 1000 === 0 ? `${v / 1000}k` : v.toLocaleString('en-GB')}`;

// Persist a run-time-resolved Rightmove identifier back onto a household stub's
// areas row, so subsequent runs (and the portal) skip the typeahead lookup.
// Stubs are NOT materialised to repo files (sync-areas-from-supabase skips
// household-onboarding rows), so this never drifts the DB↔repo parity test.
// Best-effort: a failed write just means the next run resolves again.
async function persistStubRightmove(row, rightmove) {
  if (!SERVICE_KEY || !row?.id) return;
  try {
    const url = `${SUPABASE_URL}/rest/v1/areas?id=eq.${encodeURIComponent(row.id)}`;
    await fetch(url, {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data: { ...(row.data || {}), rightmove }, updated_at: new Date().toISOString() }),
    });
  } catch (e) {
    console.warn(`persist rightmove id for ${row.id} failed:`, e.message);
  }
}


// Stage 6 enforcement: the household-scoped areas the user paused via "Stop searching".
// Read-only here (the portal writes these rows). Returns [] when unreadable so a probation
// outage never silently widens the scrape (the scraper just behaves as un-pruned L1).
async function loadProbation() {
  if (!SERVICE_KEY) return [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/scrape_probation?select=dimension,value,status,reprobe_every_runs,last_reprobe_run`;
    const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!res.ok) throw new Error(`GET scrape_probation failed: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn('probation load failed:', e.message);
    return [];
  }
}

// Advance last_reprobe_run for the areas re-probed this run (best-effort; only when the
// workflow supplies a monotonic SCRAPER_RUN_INDEX). Never blocks the fetch.
async function markReprobed(values, runIndex) {
  if (!SERVICE_KEY || runIndex == null || !values.length) return;
  for (const v of values) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/scrape_probation?dimension=eq.area&value=eq.${encodeURIComponent(v)}`;
      await fetch(url, {
        method: 'PATCH',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ last_reprobe_run: runIndex, updated_at: new Date().toISOString() }),
      });
    } catch (e) { console.warn(`mark-reprobed ${v} failed:`, e.message); }
  }
}

// Per-area learned search radius: read the area_search_tuning rows (service-role, written
// by tools/radius-tune.mjs). Area-global (not household-scoped). Returns an empty Map on
// any failure so a read outage simply leaves the file/default radius in force — never
// widens or zeroes a run. Mirrors loadProbation's empty-on-failure contract.
async function loadRadiusTuning() {
  if (!SERVICE_KEY) return new Map();
  try {
    const url = `${SUPABASE_URL}/rest/v1/area_search_tuning?select=area_id,search_radius_mi,geofence_radius_mi,override_radius_mi,geofence_radii,explore_until`;
    const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!res.ok) throw new Error(`GET area_search_tuning failed: ${res.status}`);
    const rows = await res.json();
    return new Map(rows.map((r) => [r.area_id, r]));
  } catch (e) {
    console.warn('radius tuning load failed:', e.message);
    return new Map();
  }
}

/**
 * Overlay the learned per-area radius onto the village entries (pure mutation of the
 * objects already in outcodeMap — they flow into clustering / search / geofence by
 * reference). For each tuned area:
 *   • the SEARCH disk (`searchRadiusMi`) = the widest learned sector (or the override) so
 *     the Rightmove call covers every direction the area keeps;
 *   • the GEOFENCE = the per-sector "petals" (`geofenceRadiiKm`) — reaching toward rural
 *     sectors, pulled in toward urban ones — with the scalar `geofenceRadiusKm` as a
 *     fallback for directions/areas without petals.
 * A user override pins the whole area to one radius (uniform). An area inside its
 * exploration window is widened to RADIUS_CEIL_MI (petals cleared) so the full disk is
 * periodically re-measured. Areas with no tuning row keep their file/default radius.
 * Returns { tuned, exploring }.
 */
function applyRadiusTuning(villages, tuning, now = new Date()) {
  let tuned = 0;
  let exploring = 0;
  for (const v of villages) {
    const t = tuning.get(v.id);
    if (!t) continue;
    const isExploring = t.explore_until != null && new Date(t.explore_until) > now;
    if (isExploring) {
      v.searchRadiusMi = RADIUS_CEIL_MI;
      v.geofenceRadiusKm = RADIUS_CEIL_MI / MILES_PER_KM;
      v.geofenceRadiiKm = null;            // measure the full disk while exploring
      tuned += 1; exploring += 1;
      continue;
    }
    const searchMi = t.override_radius_mi != null ? Number(t.override_radius_mi)
      : t.search_radius_mi != null ? Number(t.search_radius_mi) : null;
    if (searchMi == null || !Number.isFinite(searchMi)) continue;
    v.searchRadiusMi = searchMi;
    const keepScalar = t.override_radius_mi != null ? Number(t.override_radius_mi)
      : t.geofence_radius_mi != null ? Number(t.geofence_radius_mi) : searchMi;
    v.geofenceRadiusKm = keepScalar / MILES_PER_KM;
    v.geofenceRadiiKm = Array.isArray(t.geofence_radii) && t.geofence_radii.length
      ? t.geofence_radii.map((mi) => Number(mi) / MILES_PER_KM)
      : null;
    tuned += 1;
  }
  return { tuned, exploring };
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
  const modeLabel = FOUNDATION_MODE ? 'FOUNDATION(14d)' : `daily(${MAX_DAYS_SINCE_ADDED}d)`;
  console.log(`actor: ${APIFY_ACTOR_ID} · mode: ${SEARCH_MODE} · recency: ${modeLabel} · resultsPerTarget: ${RESULTS_PER_OUTCODE} · budget-cap: $${APIFY_MAX_BUDGET_USD} · fetchLimit: ${FETCH_LIMIT || 'all'} · dry-run: ${DRY_RUN}`);
  if (!DRY_RUN && !SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY required to write (or set DRY_RUN=1)');

  const spec = await loadSearchSpec();
  if (spec) {
    console.log('learned search spec:', JSON.stringify(spec));
  } else if (USE_LEARNED) {
    console.log('learned mode requested but no spec resolved — running as plain L1');
  }

  let outcodeMap = await loadOutcodeMap();
  // Merge household-added areas (Supabase, service-role) that postcodes.io has
  // accurately located. Done BEFORE pruning so they are equally subject to learned
  // prunes + probation, then flow through clustering / resolve / geofence exactly like
  // curated villages. No commit, no promotion: a stub added minutes ago is in this run.
  const repoIds = new Set(flattenVillages(outcodeMap).map((v) => v.id));
  const { rows: householdRows, links: householdLinks, ok: householdAreasOk } = await loadHouseholdAreas();
  const householdVillages = householdRowsToVillages(householdRows, repoIds);
  for (const v of householdVillages) {
    if (!outcodeMap.has(v.outcode)) outcodeMap.set(v.outcode, []);
    const arr = outcodeMap.get(v.outcode);
    if (!arr.some((x) => x.id === v.id)) arr.push(v);
  }
  if (householdRows.length) {
    const skipped = householdRows.length - householdVillages.length;
    console.log(`household areas: +${householdVillages.length} eligible merged${skipped > 0 ? ` · ${skipped} linked row(s) skipped (curated/un-enriched/county-flagged)` : ''}`);
  }
  // Overlay the learned per-area search radius (area_search_tuning) onto every village
  // (curated + household stub) before clustering/targets, so a tuned area scrapes + geofences
  // at its learned radius instead of the uniform default. Override wins; an area inside its
  // exploration window widens to the ceil. No row → unchanged (file/default radius).
  const radiusTuning = await loadRadiusTuning();
  if (radiusTuning.size) {
    const { tuned, exploring } = applyRadiusTuning(flattenVillages(outcodeMap), radiusTuning, new Date());
    console.log(`radius tuning: ${tuned} area(s) at a learned radius${exploring ? ` · ${exploring} widened to ${RADIUS_CEIL_MI}mi for exploration` : ''}`);
  }
  // Tight identifiers for located stubs: a stub with a full postcode but no
  // resolved Rightmove id would demote its whole outcode to a coarse search.
  // Resolve once here and persist, so the stub clusters into radius disks like
  // a curated village from this run onwards.
  let resolvedTight = 0;
  for (const v of householdVillages) {
    if (v.rightmove?.identifierQuality === 'tight') continue;
    if (!v.postcode || !/\s/.test(v.postcode)) continue;          // full postcodes only
    const locationIdentifier = await resolveTightIdFromPostcode(v.postcode);
    if (!locationIdentifier) continue;
    v.rightmove = { locationIdentifier, identifierType: 'POSTCODE', identifierQuality: 'tight', resolvedAt: new Date().toISOString() };
    resolvedTight += 1;
    if (!DRY_RUN) {
      const row = householdRows.find((r) => (r?.id || r?.data?.id) === v.id);
      if (row) await persistStubRightmove(row, v.rightmove);
    }
  }
  if (resolvedTight) console.log(`stub identifiers: ${resolvedTight} full postcode(s) resolved → tight POSTCODE^ ids${DRY_RUN ? '' : ' (persisted to areas rows)'}`);
  // Per-target price bands: every household linked to a target's areas
  // contributes its budget; each search runs with the union (lowest min,
  // highest max) so one search serves all interested households.
  const budgets = await loadHouseholdBudgets();
  const areaHouseholds = new Map();
  for (const l of householdLinks || []) {
    if (!l?.area_id || !l?.household_id) continue;
    // Origin areas (where the household LIVES, not where they want to buy) are
    // excluded from the demand set: the fetcher must not spend Apify budget
    // scraping a household's home/commute catchment whose listings the feed will
    // never show (the display-side mirror of this drop is in storage/listings/feed.js).
    if (l.is_origin) continue;
    if (!areaHouseholds.has(l.area_id)) areaHouseholds.set(l.area_id, new Set());
    areaHouseholds.get(l.area_id).add(l.household_id);
  }
  // Demand gate: an area (curated OR stub) is scraped only if at least one ACTIVE
  // household has it linked. This is the fetch-side mirror of the per-household
  // active/inactive pause — when the last interested household pauses or removes an
  // area, its id leaves the demand set and the scraper stops fetching it entirely
  // (zero households → no scrape). Stubs are in the demand set by construction.
  // Gated on a SUCCESSFUL household_areas read (householdAreasOk): on a read outage
  // (or no service key, e.g. a local DRY_RUN) we skip pruning and fetch every curated
  // area, so a transient failure never silently zeroes the run.
  if (householdAreasOk) {
    const demandSet = new Set(areaHouseholds.keys());
    const before = flattenVillages(outcodeMap).length;
    outcodeMap = demandFilterOutcodeMap(outcodeMap, demandSet);
    const after = flattenVillages(outcodeMap).length;
    console.log(`demand gate: ${after}/${before} areas have ≥1 active household · ${before - after} zero-demand area(s) dropped`);
  } else {
    console.warn('demand gate: household_areas read unavailable — fetching all curated areas (no demand pruning)');
  }
  console.log(`household budgets: ${budgets.size} loaded (${[...budgets.values()].map((b) => `${fmtPrice(b.min)}–${fmtPrice(b.max)}`).join(', ') || 'none'}) · fallback band ${fmtPrice(BASELINE_PRICE_MIN)}–${fmtPrice(BASELINE_PRICE_MAX)}`);
  // L7.5: honour learned prunes (surfaced + accepted upstream; here we just obey).
  // Areas set active:false are already dropped in loadOutcodeMap; a learned spec may
  // additionally carry dropAreas / dropOutcodes.
  const dropAreas = new Set(spec?.dropAreas || []);
  const dropOutcodes = new Set((spec?.dropOutcodes || []).map((s) => String(s).toUpperCase()));
  // Stage 6 enforcement: subtract user-paused areas (scrape_probation) from the active
  // set, honouring the exploration re-probe. With no SCRAPER_RUN_INDEX, probation is
  // fully enforced and nothing is re-probed (and no probation writes happen).
  const probation = await loadProbation();
  const runIndex = process.env.SCRAPER_RUN_INDEX != null && process.env.SCRAPER_RUN_INDEX !== ''
    ? Number(process.env.SCRAPER_RUN_INDEX) : null;
  const probDrop = probationDropIds(probation, runIndex);
  const reprobed = [...reprobeThisRun(probation, runIndex)];
  for (const id of probDrop) dropAreas.add(id);
  if (probDrop.size || reprobed.length) {
    console.log(`probation: -${probDrop.size} paused area(s)${reprobed.length ? ` · re-probing ${reprobed.length} this run (${reprobed.join(', ')})` : ''}`);
  }
  if (dropAreas.size || dropOutcodes.size) {
    for (const [oc, arr] of [...outcodeMap]) {
      const kept = arr.filter((v) => !dropAreas.has(v.id));
      if (dropOutcodes.has(oc) || !kept.length) outcodeMap.delete(oc);
      else outcodeMap.set(oc, kept);
    }
    console.log(`learned prune: -${dropAreas.size} areas · -${dropOutcodes.size} outcodes`);
  }
  if (!DRY_RUN && reprobed.length) await markReprobed(reprobed, runIndex);
  // AREA_IDS scope: restrict the fetch to a specific subset of area IDs.
  // Applies to both curated repo areas and household stubs.
  if (AREA_IDS?.size) {
    for (const [oc, arr] of [...outcodeMap]) {
      const kept = arr.filter((v) => AREA_IDS.has(v.id));
      if (!kept.length) outcodeMap.delete(oc);
      else outcodeMap.set(oc, kept);
    }
    console.log(`area scope: restricted to ${AREA_IDS.size} specified area ID(s) (AREA_IDS)`);
  }
  const ALL_ACTIVE = flattenVillages(outcodeMap);          // global geofence index
  // L7.4: build search targets for the chosen mode (outcode|village|cluster), then
  // order by learned focus (by outcode) and cap with FETCH_LIMIT.
  let targets = buildSearchTargets(outcodeMap, SEARCH_MODE);
  const beforeDedupe = targets.length;
  targets = dedupeSearchTargets(targets);
  if (beforeDedupe !== targets.length) console.log(`target dedupe: -${beforeDedupe - targets.length} duplicate search(es) (same Rightmove identifier)`);
  if (spec?.focusOutcodes?.length) {
    const focus = new Set(spec.focusOutcodes.map((s) => String(s).toUpperCase()));
    targets = [...targets.filter((t) => focus.has(t.outcode)), ...targets.filter((t) => !focus.has(t.outcode))];
  }
  if (FETCH_LIMIT) targets = targets.slice(0, FETCH_LIMIT);
  const worstCaseResults = targets.length * RESULTS_PER_OUTCODE;
  const estimatedCostUSD = (worstCaseResults / 1000) * 2;
  console.log(`targets: ${targets.length} (${SEARCH_MODE}) · active villages: ${ALL_ACTIVE.length}`);
  console.log(`cost estimate: ${targets.length} targets × ${RESULTS_PER_OUTCODE} results = ${worstCaseResults} worst-case results → ~$${estimatedCostUSD.toFixed(2)} USD (@$2/1k) · hard cap: $${APIFY_MAX_BUDGET_USD}`);
  if (DRY_RUN) console.log('DRY RUN — no Apify calls or writes will be made');

  const now = new Date();
  let totalRaw = 0, totalOffBaseline = 0, totalKept = 0, totalRejected = 0, totalFlagged = 0, totalWritten = 0, totalPriceChanges = 0;
  const failures = [];

  for (const target of targets) {
    const oc = target.outcode;
    const areas = target.areas || [];
    try {
      const locId = target.locationIdentifier || await resolveLocationId(oc);
      const band = priceBandForAreas(areas.map((a) => a.id), areaHouseholds, budgets);
      const raw = await fetchRawForOutcode(locId, spec, target.radiusMiles, band);
      totalRaw += raw.length;

      const normalised = raw.map((r) => normaliseRawListing(r, { outcode: oc, source: SOURCE, now })).filter(Boolean);

      // Hard baseline gate (houses+bungalows · price band · ≥2 beds). The Apify
      // actor honours the search-URL type/price filters only loosely, so this is
      // the GUARANTEE: out-of-band rows never reach the geofence or the upsert.
      // The price band is the same per-target household-budget union as the search URL.
      const inBaseline = normalised.filter((l) => passesBaseline(l, { priceMin: band.min, priceMax: band.max }));
      const offBaseline = normalised.length - inBaseline.length;
      totalOffBaseline += offBaseline;

      // Text-match new-build exclusion: drop listings whose title or description
      // mention "new build", "new home", or "NHBC". Catches new-build schemes at
      // source; resale new-builds without these terms remain visible (accepted per
      // owner decision 2026-06-04).
      const NEW_BUILD_RE = /\bnew\s+(?:build|home)\b|\bnhbc\b/i;
      const notNewBuild = inBaseline.filter(
        (l) => !NEW_BUILD_RE.test(l.title ?? '') && !NEW_BUILD_RE.test(l.description ?? '')
      );
      const newBuildDropped = inBaseline.length - notNewBuild.length;
      if (newBuildDropped > 0) console.log(`  ↳ dropped ${newBuildDropped} new-build listing(s) (text match)`);

      // L7: the DECISIVE gate is the coordinate geofence against the GLOBAL active
      // village set — not the 20km isInOutcode wrong-region guard (kept only as a
      // diagnostic). Coordinates decide; the listing's own name/postcode text
      // corroborates. corroborated=false → FLAG for audit, never silently dropped.
      const geo = notNewBuild.map((l) => ({ l, g: withinGeofence(l, { villages: ALL_ACTIVE }) }));
      const inBuffer = geo.filter((x) => x.g.pass).map((x) => ({
        ...x.l,
        area_id: x.g.area_id,
        distance_mi: x.g.distance_mi,
        geofence_pass: true,
        name_match: x.g.name_match,
        corroborated: x.g.corroborated,
        match_source: x.g.name_match !== null ? 'coordinates+name' : 'coordinates',
      }));
      const rejected = inBaseline.length - inBuffer.length;
      totalRejected += rejected;
      // Diagnostic only: how many of the rejected were also out of the coarse region.
      const outOfRegion = geo.filter((x) => !x.g.pass && !isInOutcode(x.l, { outcode: oc, areaCoords: areas })).length;

      // v3 L4: apply the learned post-filter (excluded types + recency).
      const onSpec = filterListingsBySpec(inBuffer, spec, now);
      const filteredOut = inBuffer.length - onSpec.length;

      const deduped = dedupeByRightmoveId(onSpec);          // area_id already set by the geofence
      // m2m membership for every listing we are about to write: the FULL in-buffer
      // area set from the geofence verdict (one row per containing area, is_primary
      // === the single area_id). Built from the same `geo` results, scoped to the
      // rows that survived on-spec + dedupe so memberships match the upserted rows.
      const writtenIds = new Set(deduped.map((l) => l.rightmove_id));
      const memberRows = membershipRowsFor(geo.filter((x) => writtenIds.has(x.l.rightmove_id)));
      const flagged = deduped.filter((l) => l.corroborated === false).length;
      totalKept += deduped.length;
      totalFlagged += flagged;

      const radiusNote = target.radiusMiles != null ? ` r=${target.radiusMiles.toFixed(1)}mi` : '';
      const bandNote = (band.min !== BASELINE_PRICE_MIN || band.max !== BASELINE_PRICE_MAX) ? ` ${fmtPrice(band.min)}–${fmtPrice(band.max)}` : '';
      console.log(`── ${target.label} (${locId}${radiusNote}${bandNote}): raw ${raw.length}${offBaseline ? ` → baseline ${inBaseline.length} [-${offBaseline} off-baseline]` : ''} → in-buffer ${inBuffer.length}${filteredOut ? ` → on-spec ${onSpec.length}` : ''} → unique ${deduped.length}${rejected ? `  [${rejected} out-of-buffer, ${outOfRegion} out-of-region]` : ''}${flagged ? ` · ${flagged} flagged` : ''}`);

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
          // Never blank a photo or price we already hold: a re-fetch that returns
          // a null image/price (e.g. a summary payload) must not erase good data.
          image_url: l.image_url ?? prev?.image_url ?? null,
          price: l.price ?? prev?.price ?? null,
          price_history,
          raw_json: l.raw_json,
        };
      });

      if (payload.length) {
        await restUpsert(payload);
        // m2m membership: atomically replace each written listing's area set. Done
        // AFTER the listings upsert so a membership row never references a row that
        // failed to write. replace = delete-then-insert per listing (the set can
        // shrink on re-geocode / radius tuning).
        await replaceListingAreas(memberRows, { SUPABASE_URL, SERVICE_KEY });
        await syncLog(payload.map((p) => ({
          table_name: 'listings', actor: 'system', action: existing.has(p.rightmove_id) ? 'update' : 'insert', row_id: p.rightmove_id,
        })));
        totalWritten += payload.length;
      }
    } catch (e) {
      console.log(`── ${target.label}: ✗ ${e.message}`);
      failures.push(target.label);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`raw ${totalRaw} · off-baseline ${totalOffBaseline} · kept(in-buffer,unique) ${totalKept} · out-of-buffer ${totalRejected} · flagged(corroborated=false) ${totalFlagged} · written ${totalWritten} · price-changes ${totalPriceChanges}`);
  // A failed target means listings silently went unfetched (this hid a crash
  // for a week in 2026-06). Surface it and fail the run — the 3-day recency
  // overlap means the next green run self-heals the gap.
  if (failures.length) {
    console.log(`⚠ ${failures.length}/${targets.length} target(s) FAILED: ${failures.join(', ')}`);
    process.exitCode = 1;
  }
}

// Only run when invoked directly (so the orchestrator can be imported safely).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('FETCH CRASHED:', e); process.exit(1); });
}

export { loadOutcodeMap, assignArea, buildSearchUrl, filterListingsBySpec, orderOutcodesByFocus, clusterVillages, buildSearchTargets, dedupeSearchTargets, householdRowsToVillages, demandFilterOutcodeMap, applyRadiusTuning, priceBandForAreas, BASELINE_PRICE_MIN, BASELINE_PRICE_MAX, BASELINE_MIN_BEDS, BASELINE_DONT_SHOW, BASELINE_PROPERTY_TYPES, FOUNDATION_MODE, MAX_DAYS_SINCE_ADDED };
