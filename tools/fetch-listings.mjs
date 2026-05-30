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
//   DRY_RUN=1 (optional)                       — fetch + normalise, print, do not write
//
// Usage:  node tools/fetch-listings.mjs            (writes)
//         DRY_RUN=1 node tools/fetch-listings.mjs  (no writes)

import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  normaliseRawListing,
  isInOutcode,
  dedupeByRightmoveId,
  mergePriceHistory,
  haversineKm,
} from './listings-normalise.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || 'dhrumil~rightmove-scraper';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const FETCH_LIMIT = Number(process.env.FETCH_LIMIT) || 0;

const MAX_DAYS_SINCE_ADDED = 3;     // 3-day overlap so a missed run self-heals.
const RESULTS_PER_OUTCODE = 50;
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
  const map = new Map(); // outcode → [{ id, name, lat, lng }]
  for (const f of files) {
    const a = JSON.parse(await readFile(resolve(dir, f), 'utf8'));
    const oc = String(a.postcode || '').toUpperCase().trim();
    const lat = a.coords?.lat, lng = a.coords?.lng;
    if (!oc || lat == null || lng == null) continue;
    if (!map.has(oc)) map.set(oc, []);
    map.get(oc).push({ id: a.id, name: a.name, lat: Number(lat), lng: Number(lng) });
  }
  return map;
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

function buildSearchUrl(locationIdentifier) {
  const params = new URLSearchParams({
    searchType: 'SALE',
    locationIdentifier,
    sortType: '6',                 // newest first
    maxDaysSinceAdded: String(MAX_DAYS_SINCE_ADDED),
  });
  return `https://www.rightmove.co.uk/property-for-sale/find.html?${params}`;
}

// ── Apify actor ──────────────────────────────────────────────────────────────
async function fetchRawForOutcode(locationIdentifier) {
  if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not set');
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR_ID)}` +
    `/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;
  const input = {
    listUrls: [{ url: buildSearchUrl(locationIdentifier) }],
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

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== L1 fetch-listings ===');
  console.log(`actor: ${APIFY_ACTOR_ID} · maxDaysSinceAdded: ${MAX_DAYS_SINCE_ADDED} · dry-run: ${DRY_RUN}`);
  if (!DRY_RUN && !SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY required to write (or set DRY_RUN=1)');

  const outcodeMap = await loadOutcodeMap();
  let outcodes = [...outcodeMap.keys()].sort();
  if (FETCH_LIMIT) outcodes = outcodes.slice(0, FETCH_LIMIT);
  console.log(`outcodes: ${outcodes.length} (${outcodes.join(', ')})`);

  const now = new Date();
  let totalRaw = 0, totalKept = 0, totalRejected = 0, totalWritten = 0, totalPriceChanges = 0;

  for (const oc of outcodes) {
    const areas = outcodeMap.get(oc) || [];
    try {
      const locId = await resolveLocationId(oc);
      const raw = await fetchRawForOutcode(locId);
      totalRaw += raw.length;

      const normalised = raw.map((r) => normaliseRawListing(r, { outcode: oc, source: SOURCE, now })).filter(Boolean);
      const inRegion = normalised.filter((l) => isInOutcode(l, { outcode: oc, areaCoords: areas }));
      const rejected = normalised.length - inRegion.length;
      totalRejected += rejected;

      const deduped = dedupeByRightmoveId(inRegion).map((l) => ({ ...l, area_id: assignArea(l, areas) }));
      totalKept += deduped.length;

      console.log(`── ${oc} (${locId}): raw ${raw.length} → in-region ${inRegion.length} → unique ${deduped.length}${rejected ? `  [${rejected} rejected]` : ''}`);

      if (DRY_RUN) {
        for (const l of deduped.slice(0, 5)) {
          console.log(`    • ${l.address ?? '—'} — £${(l.price ?? 0).toLocaleString('en-GB')} — ${l.beds ?? '?'}bd ${l.property_type ?? ''} → area ${l.area_id ?? '—'}`);
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
      console.log(`── ${oc}: ✗ ${e.message}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`raw ${totalRaw} · kept(in-region,unique) ${totalKept} · rejected ${totalRejected} · written ${totalWritten} · price-changes ${totalPriceChanges}`);
}

// Only run when invoked directly (so the orchestrator can be imported safely).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('FETCH CRASHED:', e); process.exit(1); });
}

export { loadOutcodeMap, assignArea, buildSearchUrl };
