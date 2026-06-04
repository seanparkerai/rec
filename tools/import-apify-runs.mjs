#!/usr/bin/env node
// import-apify-runs.mjs — backfill Supabase `listings` from EXISTING Apify
// dataset items (already-paid-for results of prior actor runs) WITHOUT running
// the actor again. Reading a dataset is a storage read, not an actor run, so it
// does not re-trigger the pay-per-event charge.
//
// Why: ad-hoc / L0-probe actor runs scraped ~1,300 listings into Apify dataset
// storage that were never ingested into our pipeline. This recovers them.
//
// Pipeline (per run dataset):
//   GET /v2/acts/{actor}/runs?status=SUCCEEDED  → defaultDatasetId per run
//   GET /v2/datasets/{id}/items                 → raw items (already paid for)
//   → normaliseRawListing (same locked field map as the live fetcher)
//   → matchListingToArea (coordinate-first, target outcode UNKNOWN for ad-hoc
//     runs, so match across ALL areas + address-token fallback; rejects wrong-region)
//   → dedupe by rightmove_id → merge price_history vs existing rows
//   → UPSERT listings (on_conflict=rightmove_id), same as the live fetcher.
//
// Env:
//   APIFY_TOKEN, APIFY_ACTOR_ID                — required (read runs + datasets)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY    — required to write (unless DRY_RUN=1)
//   IMPORT_RUNS_LIMIT (optional, default 25)   — how many recent SUCCEEDED runs to scan
//   DRY_RUN=1 (optional)                       — fetch + normalise + print, do not write
//
// Usage:  node tools/import-apify-runs.mjs
//         DRY_RUN=1 node tools/import-apify-runs.mjs

import {
  normaliseRawListing,
  matchListingToArea,
  dedupeByRightmoveId,
  mergePriceHistory,
} from './listings-normalise.mjs';
import { loadOutcodeMap } from './fetch-listings.mjs';
import { passesBaseline } from '../assets/js/listings/classify.js';
import { pathToFileURL } from 'node:url';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || 'dhrumil~rightmove-scraper';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const RUNS_LIMIT = Number(process.env.IMPORT_RUNS_LIMIT) || 25;
const SOURCE = 'rightmove-apify';

// ── Apify reads (no actor run → no pay-per-event charge) ──────────────────────
async function listSucceededRuns() {
  if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not set');
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs` +
    `?token=${encodeURIComponent(APIFY_TOKEN)}&status=SUCCEEDED&desc=true&limit=${RUNS_LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`list runs HTTP ${res.status}`);
  const json = await res.json();
  const items = json?.data?.items || [];
  return items
    .map((r) => ({ id: r.id, datasetId: r.defaultDatasetId, finishedAt: r.finishedAt }))
    .filter((r) => r.datasetId);
}

async function fetchDatasetItems(datasetId) {
  const url =
    `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items` +
    `?token=${encodeURIComponent(APIFY_TOKEN)}&clean=true&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`dataset ${datasetId} HTTP ${res.status}`);
  const items = await res.json();
  return Array.isArray(items) ? items : [];
}

// ── Supabase REST (service role) — same shape as the live fetcher ─────────────
// Chunked: a single in.(…) of ~1,300 ids overflows the request header limit.
async function restGetExisting(ids) {
  const out = new Map();
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    if (!slice.length) continue;
    const inList = slice.map((x) => `"${x}"`).join(',');
    const url = `${SUPABASE_URL}/rest/v1/listings?select=rightmove_id,price,price_history,first_seen&rightmove_id=in.(${inList})`;
    const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!res.ok) throw new Error(`GET existing failed: ${res.status} ${await res.text()}`);
    for (const r of await res.json()) out.set(r.rightmove_id, r);
  }
  return out;
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
  console.log('=== import-apify-runs (backfill from existing datasets) ===');
  console.log(`actor: ${APIFY_ACTOR_ID} · runsLimit: ${RUNS_LIMIT} · dry-run: ${DRY_RUN}`);
  if (!DRY_RUN && !SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY required to write (or set DRY_RUN=1)');

  // Flatten our areas into one index (target outcode is unknown per item).
  const outcodeMap = await loadOutcodeMap();
  const areas = [];
  const knownOutcodes = new Set();
  for (const [oc, list] of outcodeMap) {
    knownOutcodes.add(oc);
    for (const a of list) areas.push({ ...a, outcode: oc });
  }
  console.log(`areas: ${areas.length} across ${knownOutcodes.size} outcodes`);

  const runs = await listSucceededRuns();
  console.log(`succeeded runs found: ${runs.length}`);

  const now = new Date();
  const collected = [];
  let totalRaw = 0, totalRejected = 0, totalOffBaseline = 0;

  for (const run of runs) {
    let raw = [];
    try { raw = await fetchDatasetItems(run.datasetId); }
    catch (e) { console.log(`── run ${run.id} (${run.datasetId}): ✗ ${e.message}`); continue; }
    totalRaw += raw.length;

    let kept = 0;
    for (const item of raw) {
      const l = normaliseRawListing(item, { outcode: '', source: SOURCE, now });
      if (!l) continue;
      // Same hard baseline gate the live fetcher applies — this importer previously
      // upserted EVERYTHING (flats, park homes, land, over/under-priced), which is
      // how the table got polluted. Never again.
      if (!passesBaseline(l)) { totalOffBaseline += 1; continue; }
      const m = matchListingToArea(l, { areas, knownOutcodes });
      if (!m.accepted) { totalRejected += 1; continue; }
      l.outcode = m.outcode;
      l.area_id = m.area_id;
      collected.push(l);
      kept += 1;
    }
    console.log(`── run ${run.id} (${run.datasetId}): raw ${raw.length} → kept ${kept}`);
  }

  const deduped = dedupeByRightmoveId(collected);
  console.log(`\ncollected ${collected.length} → unique ${deduped.length} (rejected wrong-region ${totalRejected})`);

  if (DRY_RUN) {
    for (const l of deduped.slice(0, 10)) {
      console.log(`    • ${l.address ?? '—'} — £${(l.price ?? 0).toLocaleString('en-GB')} — ${l.beds ?? '?'}bd ${l.property_type ?? ''} → ${l.outcode}/${l.area_id ?? '—'}`);
    }
    console.log('\n=== SUMMARY (dry-run) ===');
    console.log(`raw ${totalRaw} · off-baseline ${totalOffBaseline} · unique ${deduped.length} · rejected ${totalRejected} · written 0 (dry-run)`);
    return;
  }

  // Merge price_history against existing rows; preserve first_seen.
  const existing = await restGetExisting(deduped.map((l) => l.rightmove_id));
  const payload = deduped.map((l) => {
    const prev = existing.get(l.rightmove_id);
    const { price_history } = mergePriceHistory(prev, l, now);
    return {
      ...l,
      first_seen: prev?.first_seen ?? l.first_seen,
      last_seen: now.toISOString(),
      price_history,
      raw_json: l.raw_json,
    };
  });

  let written = 0;
  // Chunk the UPSERT so a large backfill stays under request limits.
  const CHUNK = 200;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    await restUpsert(slice);
    await syncLog(slice.map((p) => ({
      table_name: 'listings', actor: 'system', action: existing.has(p.rightmove_id) ? 'update' : 'insert', row_id: p.rightmove_id,
    })));
    written += slice.length;
  }

  console.log('\n=== SUMMARY ===');
  console.log(`raw ${totalRaw} · off-baseline ${totalOffBaseline} · unique ${deduped.length} · rejected ${totalRejected} · written ${written}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('IMPORT CRASHED:', e); process.exit(1); });
}

export { main };
