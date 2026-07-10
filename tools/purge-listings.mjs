#!/usr/bin/env node
// purge-listings.mjs — maintenance purge for the heavy `listings` table (v3 L1).
// Deletes rows we no longer need to keep as full records, while NEVER touching the
// durable preference signal. Runtime-agnostic Node; writes via the same PostgREST
// service-role path as tools/fetch-listings.mjs.
//
// A row is purged when (checked in order, first match wins):
//   liked          → KEEP. A property ever liked is never purged (the Saved view
//                    resolves it from the live row or its snapshot).
//   (a) baseline   → out of the houses+bungalows price/beds baseline (the pollution
//                    the importer once leaked). Reuses passesBaseline() — no drift.
//   (b) rejected-stale → its CURRENT reaction is reject (matched by id AND by
//                    physical-property fingerprint, so a re-list under a new id is
//                    caught) AND it hasn't been seen in REJECT_HALF_LIFE_DAYS.
//   (c) stale      → not seen in STALE_DAYS (delisted/dead), regardless of reaction.
//
// The reject SIGNAL lives forever in the append-only listing_reactions log, so feed
// suppression (page-listings.js) survives a purge of the heavy listings row. This is
// NOT a cap: it removes records that are out-of-baseline, rejected-and-old, or stale —
// it never trims valid, undecided, in-baseline listings.
//
// Each purged listing's `listing_areas` membership rows are deleted alongside it
// (no FK ties them — junction hygiene, step 2.18). PURGE_REASONS is the COMPLETE
// reason set: purgeDecision returns one of those or null, nothing else (pinned by
// tests/unit/purge-listings.test.js).
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — required (read + delete)
//   APPLY=1                                   — actually DELETE (default is DRY RUN)
//   REJECT_HALF_LIFE_DAYS (default 14)        — rejected rows older than this are purged
//   STALE_DAYS (default 30)                   — any row unseen this long is purged
//
// Usage:  node tools/purge-listings.mjs            (DRY RUN — prints the plan, no writes)
//         APPLY=1 node tools/purge-listings.mjs    (DELETE the planned rows)

import { pathToFileURL } from 'node:url';
import {
  passesBaseline, propertyFingerprint,
  BASELINE_PRICE_MIN, BASELINE_PRICE_MAX, BASELINE_MIN_BEDS,
} from '../assets/js/listings/classify.js';
import { decidedSets, isDecided } from '../assets/js/listings/suppress.js';
import { latestPerListing } from '../assets/js/listings/reactions.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APPLY = process.env.APPLY === '1' || process.env.APPLY === 'true';
const DRY_RUN = !APPLY;                                   // destructive: preview unless APPLY=1
const REJECT_HALF_LIFE_DAYS = Number(process.env.REJECT_HALF_LIFE_DAYS) || 14;
const STALE_DAYS = Number(process.env.STALE_DAYS) || 30;
const DELETE_CHUNK = 100;

export const PURGE_REASONS = ['baseline', 'rejected-stale', 'stale'];

/**
 * The live global union band across household budgets (criteria rows): lowest
 * budget.min, highest budget.max, lowest size.minBeds — each falling back to the
 * static classify.js constant when unset/invalid. This is the widest envelope any
 * household's limits admit, so a purge judged against it never deletes a listing
 * some household can see. Pure.
 * @param {Array<{household_id:string,data:object}>} criteriaRows
 * @returns {{priceMin:number,priceMax:number,minBeds:number}}
 */
export function unionBand(criteriaRows) {
  let priceMin = Infinity, priceMax = -Infinity, minBeds = Infinity;
  for (const r of criteriaRows || []) {
    const b = r?.data?.budget || {};
    const min = Number(b.min), max = Number(b.max);
    if (Number.isFinite(max) && max > 0) {
      priceMax = Math.max(priceMax, max);
      priceMin = Math.min(priceMin, Number.isFinite(min) && min > 0 ? min : BASELINE_PRICE_MIN);
    }
    const beds = Number(r?.data?.size?.minBeds);
    if (Number.isFinite(beds) && beds > 0) minBeds = Math.min(minBeds, Math.round(beds));
  }
  return {
    priceMin: Number.isFinite(priceMin) ? Math.min(priceMin, BASELINE_PRICE_MIN) : BASELINE_PRICE_MIN,
    priceMax: priceMax > 0 ? Math.max(priceMax, BASELINE_PRICE_MAX) : BASELINE_PRICE_MAX,
    minBeds: Number.isFinite(minBeds) ? Math.min(minBeds, BASELINE_MIN_BEDS) : BASELINE_MIN_BEDS,
  };
}

/** Age in days from last_seen (fallback first_seen). 0 (never stale) when unknown. */
export function ageInDays(row, now = new Date()) {
  const t = new Date(row?.last_seen || row?.first_seen || 0).getTime();
  if (!Number.isFinite(t) || t === 0) return 0;
  return (now.getTime() - t) / 86400000;
}

/**
 * Build the purge context from the reaction log + a live-row map.
 *   likedIds     — every listing_id EVER liked (never purged).
 *   rejectedSets — { ids, fps } for listings whose CURRENT reaction is reject; the
 *                  fingerprint set (via snapshot, falling back to the live row)
 *                  catches re-lists under a new rightmove_id. Reuses decidedSets().
 * @param {Array} reactions  full append-only reaction log rows
 * @param {Map<string,object>} [liveById]  rightmove_id → live listing row
 */
export function buildPurgeContext(reactions, liveById = new Map(), now = new Date()) {
  const latest = latestPerListing(reactions);
  const rejectLatest = new Map([...latest].filter(([, r]) => r.reaction === 'reject'));
  const rejectedSets = decidedSets(rejectLatest, liveById);
  const likedIds = new Set((reactions || []).filter((r) => r.reaction === 'like').map((r) => String(r.listing_id)));
  return { likedIds, rejectedSets, now };
}

/**
 * Pure purge decision for one listing row. Returns a PURGE_REASONS string, or null
 * to keep. Liked rows are kept unconditionally; otherwise baseline-violating rows go
 * first, then rejected-and-old, then plain-stale.
 */
export function purgeDecision(row, ctx) {
  const {
    likedIds, rejectedSets, now = new Date(),
    rejectHalfLifeDays = REJECT_HALF_LIFE_DAYS, staleDays = STALE_DAYS,
    band = null,
  } = ctx || {};
  if (!row) return null;
  if (likedIds && likedIds.has(String(row.rightmove_id))) return null;       // liked → protected
  // The baseline band tracks the LIVE household budgets (ctx.band — the global
  // union the fetcher scrapes at), not the static classify.js constants: a raised
  // budget must never see its freshly-fetched, in-limits listings purged as
  // "baseline violations" the same night. No band supplied → static defaults.
  if (!passesBaseline(row, band || undefined)) return 'baseline';
  // NOTE (2.18 audit): an undocumented 'new-build' purge reason was removed here —
  // it arrived in an unrelated commit (fc5574a), was absent from PURGE_REASONS and
  // the header contract, crashed main() (no report bucket), and contradicted the
  // product rule that new-build is a FLAG (flags.js), never junk. Purging by
  // build-age is a policy decision the owner has not made.
  const age = ageInDays(row, now);
  if (rejectedSets && isDecided(row, rejectedSets) && age > rejectHalfLifeDays) return 'rejected-stale';
  if (age > staleDays) return 'stale';
  return null;
}

// ── Supabase REST (service role) ─────────────────────────────────────────────
async function restGetAll(table, select, order) {
  const PAGE = 1000;
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&order=${order}&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!res.ok) throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

async function restDelete(ids) {
  const inList = ids.map((i) => `"${i}"`).join(',');
  const url = `${SUPABASE_URL}/rest/v1/listings?rightmove_id=in.(${inList})`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=minimal' },
  });
  if (!res.ok) throw new Error(`DELETE failed: ${res.status} ${await res.text()}`);
  // Junction hygiene (2.18): listing_areas has no FK to listings (loose by
  // design), so a purge must clean the membership rows itself or they orphan —
  // deleted AFTER the listings so a live row is never left feed-invisible.
  const laUrl = `${SUPABASE_URL}/rest/v1/listing_areas?rightmove_id=in.(${inList})`;
  const laRes = await fetch(laUrl, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=minimal' },
  });
  if (!laRes.ok) throw new Error(`DELETE listing_areas failed: ${laRes.status} ${await laRes.text()}`);
  return ids.length;
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

async function main() {
  console.log('=== purge-listings ===');
  console.log(`mode: ${DRY_RUN ? 'DRY RUN (no deletes — set APPLY=1 to delete)' : 'APPLY (will DELETE)'} · reject half-life: ${REJECT_HALF_LIFE_DAYS}d · stale: ${STALE_DAYS}d`);
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY required to read/purge');

  const [listings, reactions, criteriaRows] = await Promise.all([
    restGetAll('listings', 'rightmove_id,property_type,price,beds,address,last_seen,first_seen', 'rightmove_id.asc'),
    restGetAll('listing_reactions', 'listing_id,reaction,created_at,listing_snapshot', 'created_at.asc'),
    restGetAll('criteria', 'household_id,data', 'household_id.asc'),
  ]);
  const liveById = new Map(listings.map((l) => [String(l.rightmove_id), l]));
  const now = new Date();
  const ctx = buildPurgeContext(reactions, liveById, now);
  // Live union band across every household budget (lowest min, highest max, lowest
  // minBeds) — the same envelope the fetcher scrapes at — so the purge's baseline
  // check can never delete a listing some household's limits admit. Falls back to
  // the static classify.js band per value when no budget is stored.
  ctx.band = unionBand(criteriaRows);
  console.log(`baseline band (live union): £${ctx.band.priceMin.toLocaleString('en-GB')}–£${ctx.band.priceMax.toLocaleString('en-GB')} · ≥${ctx.band.minBeds} beds`);

  const byReason = { baseline: [], 'rejected-stale': [], stale: [] };
  for (const l of listings) {
    const reason = purgeDecision(l, ctx);
    if (reason) byReason[reason].push(l);
  }
  const toDelete = [...byReason.baseline, ...byReason['rejected-stale'], ...byReason.stale];

  console.log(`scanned ${listings.length} listings · ${reactions.length} reactions · protected (liked) ${ctx.likedIds.size}`);
  for (const r of PURGE_REASONS) {
    console.log(`  ${r}: ${byReason[r].length}`);
    for (const l of byReason[r].slice(0, 4)) {
      console.log(`    • ${l.rightmove_id} — ${l.address ?? '—'} — £${(l.price ?? 0).toLocaleString('en-GB')} — ${l.beds ?? '?'}bd ${l.property_type ?? ''} (last_seen ${l.last_seen ?? '—'})`);
    }
  }
  console.log(`TOTAL to purge: ${toDelete.length} of ${listings.length}`);

  if (DRY_RUN) { console.log('DRY RUN — no rows deleted. Re-run with APPLY=1 to delete.'); return; }
  if (!toDelete.length) { console.log('nothing to purge.'); return; }

  let deleted = 0;
  const ids = toDelete.map((l) => l.rightmove_id);
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    const slice = ids.slice(i, i + DELETE_CHUNK);
    await restDelete(slice);
    await syncLog(slice.map((id) => ({ table_name: 'listings', actor: 'system', action: 'delete', row_id: id })));
    deleted += slice.length;
    console.log(`  deleted ${deleted}/${ids.length}`);
  }
  console.log(`=== purged ${deleted} listings ===`);
}

// Only run when invoked directly (so tests can import the pure helpers safely).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('PURGE CRASHED:', e); process.exit(1); });
}

export { REJECT_HALF_LIFE_DAYS, STALE_DAYS };
