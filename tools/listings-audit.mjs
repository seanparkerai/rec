#!/usr/bin/env node
// listings-audit.mjs — the canonical listings-health snapshot (read-only).
// One command that answers "what state is the listings subsystem in?" without
// touching anything: lifecycle buckets, reaction provenance mix, orphan/snapshot
// coverage, per-household counts, sync_log growth, junction hygiene and physical
// re-list duplicates. Run it before and after any cleanup phase and diff.
//
// Read-only by construction: every request is a GET; there is no write path in
// this file. Pure aggregation helpers are exported for tests/unit/listings-audit.test.js.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — required (read)
//
// Usage:  node tools/listings-audit.mjs           (human-readable report)
//         node tools/listings-audit.mjs --json    (machine-readable, for baselining)

import { pathToFileURL } from 'node:url';
import { propertyFingerprint } from '../assets/js/listings/classify.js';
import { classifyProvenance, provenanceSummary } from '../assets/js/listings/reaction-provenance.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ── Pure aggregation helpers (unit-tested, no network) ───────────────────────

export const FRESHNESS_BANDS = ['<=7d', '8-30d', '31-90d', '>90d', 'unknown'];

/** last_seen (fallback first_seen) freshness band for one listing row. */
export function freshnessBand(row, now = new Date()) {
  const t = new Date(row?.last_seen || row?.first_seen || NaN).getTime();
  if (!Number.isFinite(t)) return 'unknown';
  const days = (now.getTime() - t) / 86400000;
  if (days <= 7) return '<=7d';
  if (days <= 30) return '8-30d';
  if (days <= 90) return '31-90d';
  return '>90d';
}

/**
 * Lifecycle buckets over the listings table: archived vs live split (archived_at
 * set — absent pre-migration rows count as live), status mix, and last_seen
 * freshness bands for the un-archived rows (an archived row's staleness is settled).
 */
export function lifecycleBuckets(listings, now = new Date()) {
  const out = {
    total: 0, archived: 0, live: 0,
    byStatus: {}, archiveReasons: {},
    freshness: Object.fromEntries(FRESHNESS_BANDS.map((b) => [b, 0])),
  };
  for (const l of listings || []) {
    if (!l) continue;
    out.total += 1;
    const status = l.status || '(none)';
    out.byStatus[status] = (out.byStatus[status] || 0) + 1;
    if (l.archived_at) {
      out.archived += 1;
      const r = l.archive_reason || '(none)';
      out.archiveReasons[r] = (out.archiveReasons[r] || 0) + 1;
      continue;
    }
    out.live += 1;
    out.freshness[freshnessBand(l, now)] += 1;
  }
  return out;
}

/**
 * Reaction provenance mix: the honest engagement summary plus, where rows carry a
 * durable `source` column (post-ADR-0009), the by-source counts and the drift
 * between the durable value and what the read-time heuristic would have said.
 * 'import' has no heuristic twin, so it is excluded from the drift denominator.
 */
export function provenanceMix(reactions, opts = {}) {
  const rows = Array.isArray(reactions) ? reactions : [];
  const summary = provenanceSummary(rows, opts);
  const bySource = {};
  const HEURISTIC_TWIN = { manual: 'individual', bulk: 'bulk', admin: 'admin' };
  const drift = { checked: 0, mismatches: 0 };
  const classified = classifyProvenance(rows, opts);
  for (const r of classified) {
    if (r.source == null) continue;
    bySource[r.source] = (bySource[r.source] || 0) + 1;
    const twin = HEURISTIC_TWIN[r.source];
    if (!twin) continue;
    drift.checked += 1;
    if (twin !== r.provenance) drift.mismatches += 1;
  }
  return { summary, bySource, drift, byReaction: countBy(rows, (r) => r?.reaction || '(none)') };
}

/**
 * Orphan + snapshot coverage of the reaction log against the live listings set:
 * an orphaned reaction references a rightmove_id with no listings row (expected
 * after purges — the snapshot keeps it trainable); a snapshotless orphan is dead
 * weight (untrainable, unrecoverable). Also counts listings with multiple reactions.
 */
export function orphanStats(reactions, liveIds = new Set()) {
  const rows = Array.isArray(reactions) ? reactions : [];
  const out = { total: rows.length, orphaned: 0, orphanedDistinct: 0, snapshotless: 0, snapshotlessOrphans: 0, multiReactionListings: 0 };
  const orphanIds = new Set();
  const perListing = new Map();
  for (const r of rows) {
    if (!r) continue;
    const id = String(r.listing_id);
    perListing.set(id, (perListing.get(id) || 0) + 1);
    const orphan = !liveIds.has(id);
    if (orphan) { out.orphaned += 1; orphanIds.add(id); }
    if (r.listing_snapshot == null) {
      out.snapshotless += 1;
      if (orphan) out.snapshotlessOrphans += 1;
    }
  }
  out.orphanedDistinct = orphanIds.size;
  for (const n of perListing.values()) if (n > 1) out.multiReactionListings += 1;
  return out;
}

/**
 * Physical re-list duplicates among the CURRENT listings rows: distinct property
 * fingerprints carried by more than one rightmove_id (a re-list under a new id that
 * ingest cannot dedupe — the feed hides them, purge reaps them; the audit counts them).
 */
export function fingerprintDupes(listings) {
  const byFp = new Map();
  for (const l of listings || []) {
    const fp = propertyFingerprint(l);
    if (!fp) continue;
    if (!byFp.has(fp)) byFp.set(fp, []);
    byFp.get(fp).push(String(l.rightmove_id));
  }
  let groups = 0; let rows = 0;
  for (const ids of byFp.values()) {
    if (ids.length > 1) { groups += 1; rows += ids.length; }
  }
  return { groups, rows };
}

/** Junction hygiene: listing_areas rows whose listing no longer exists. */
export function junctionOrphans(listingAreaIds, liveIds = new Set()) {
  let orphans = 0;
  for (const id of listingAreaIds || []) if (!liveIds.has(String(id))) orphans += 1;
  return orphans;
}

function countBy(rows, keyFn) {
  const out = {};
  for (const r of rows || []) {
    const k = keyFn(r);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

// ── Supabase REST (service role, read-only) ──────────────────────────────────

function headers() {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
}

async function restGetAll(table, select, order) {
  const PAGE = 1000;
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&order=${order}&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/** Try each select list in turn — lets the audit run before AND after column migrations. */
async function restGetAllTry(table, selects, order) {
  let lastErr;
  for (const select of selects) {
    try {
      return await restGetAll(table, select, order);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/** Exact row count without fetching rows (content-range header). */
async function restCount(table, filter = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1${filter ? `&${filter}` : ''}`;
  const res = await fetch(url, { headers: { ...headers(), Prefer: 'count=exact' } });
  if (!res.ok) throw new Error(`COUNT ${table} failed: ${res.status} ${await res.text()}`);
  const range = res.headers.get('content-range') || '';
  return Number(range.split('/')[1] ?? NaN);
}

const LISTING_COLS = 'rightmove_id,status,property_type,price,beds,address,last_seen,first_seen';

async function collect(now = new Date()) {
  const [listings, reactions, listingAreas, syncLogCount, syncLogOld] = await Promise.all([
    restGetAllTry('listings', [
      `${LISTING_COLS},archived_at,archive_reason`,   // post soft-archive migration
      LISTING_COLS,                                   // pre-migration fallback
    ], 'rightmove_id.asc'),
    restGetAllTry('listing_reactions', [
      'listing_id,household_id,reaction,reason,created_at,listing_snapshot,source', // post ADR-0009
      'listing_id,household_id,reaction,reason,created_at,listing_snapshot',        // pre-migration fallback
    ], 'created_at.asc'),
    restGetAll('listing_areas', 'rightmove_id', 'rightmove_id.asc'),
    restCount('sync_log'),
    restGetAll('sync_log', 'at', 'at.asc&limit=1').catch(() => []),
  ]);
  const liveIds = new Set(listings.map((l) => String(l.rightmove_id)));
  return {
    generated_at: now.toISOString(),
    lifecycle: lifecycleBuckets(listings, now),
    reactions: provenanceMix(reactions),
    orphans: orphanStats(reactions, liveIds),
    households: countBy(reactions, (r) => r?.household_id || '(none)'),
    fingerprintDupes: fingerprintDupes(listings.filter((l) => !l.archived_at)),
    junction: { rows: listingAreas.length, orphans: junctionOrphans(listingAreas.map((r) => r.rightmove_id), liveIds) },
    syncLog: { rows: syncLogCount, oldest: syncLogOld[0]?.at ?? null },
  };
}

function printReport(a) {
  const { lifecycle: lc, reactions: rx, orphans: or } = a;
  console.log('=== listings-audit ===');
  console.log(`generated: ${a.generated_at}`);
  console.log(`\nLIFECYCLE — ${lc.total} listings · ${lc.live} live · ${lc.archived} archived`);
  console.log(`  status: ${fmtCounts(lc.byStatus)}`);
  if (lc.archived) console.log(`  archive reasons: ${fmtCounts(lc.archiveReasons)}`);
  console.log(`  freshness (live rows, last_seen): ${fmtCounts(lc.freshness)}`);
  console.log(`\nREACTIONS — ${rx.summary.total} rows: ${fmtCounts(rx.byReaction)}`);
  const i = rx.summary.individual;
  console.log(`  provenance: individual ${i.total} (${i.likes} like / ${i.rejects} reject / ${i.passes} pass) · bulk ${rx.summary.bulk} · admin ${rx.summary.admin}`);
  console.log(`  genuine graded (drives findings): ${rx.summary.genuineGraded}`);
  if (Object.keys(rx.bySource).length) {
    console.log(`  durable source: ${fmtCounts(rx.bySource)} · heuristic drift ${rx.drift.mismatches}/${rx.drift.checked}`);
  } else {
    console.log('  durable source: (column absent — heuristic only)');
  }
  console.log(`\nORPHANS — ${or.orphaned}/${or.total} reactions reference a purged listing (${or.orphanedDistinct} distinct)`);
  console.log(`  snapshotless: ${or.snapshotless} total · ${or.snapshotlessOrphans} orphaned (dead weight)`);
  console.log(`  listings with >1 reaction: ${or.multiReactionListings}`);
  console.log(`\nHOUSEHOLDS — reactions per household: ${fmtCounts(a.households)}`);
  console.log(`RE-LISTS — ${a.fingerprintDupes.groups} fingerprint groups spanning ${a.fingerprintDupes.rows} live rows`);
  console.log(`JUNCTION — ${a.junction.rows} listing_areas rows · ${a.junction.orphans} orphaned`);
  console.log(`SYNC_LOG — ${a.syncLog.rows} rows · oldest ${a.syncLog.oldest ?? '—'}`);
}

function fmtCounts(obj) {
  const entries = Object.entries(obj || {}).sort((x, y) => y[1] - x[1]);
  return entries.length ? entries.map(([k, v]) => `${k} ${v}`).join(' · ') : '—';
}

async function main() {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY required (read-only)');
  const audit = await collect();
  if (process.argv.includes('--json')) console.log(JSON.stringify(audit, null, 2));
  else printReport(audit);
}

// Only run when invoked directly (so tests can import the pure helpers safely).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('AUDIT CRASHED:', e); process.exit(1); });
}
