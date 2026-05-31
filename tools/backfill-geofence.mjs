#!/usr/bin/env node
// backfill-geofence.mjs — L7.0: recompute the geofence verdict over the listings
// rows we have ALREADY PAID FOR, with no Apify call (it is a pure recompute over
// existing data, not a fetch — £0). Sets distance_mi, geofence_pass, area_id,
// name_match, corroborated, match_source on every existing row using the SAME
// withinGeofence() the live fetcher uses, so backfilled and freshly-fetched rows
// are scored identically.
//
// Two modes, because the geofence verdict must be computed by the canonical JS
// withinGeofence() (locked by tests) rather than re-implemented in SQL:
//
//   REST mode (CI / a machine with the service key):
//     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set → read listings via PostgREST,
//     compute, UPSERT back (on_conflict=rightmove_id, merge-duplicates).
//       node tools/backfill-geofence.mjs            (writes)
//       DRY_RUN=1 node tools/backfill-geofence.mjs  (read + report, no write)
//
//   File / emit-sql mode (this sandbox, applied via the Supabase MCP connector):
//     --from-file <listings.json>  reads rows dumped via MCP execute_sql
//     --emit-sql <out.sql>         writes UPDATE…FROM(VALUES…) batches to apply via MCP
//       node tools/backfill-geofence.mjs --from-file /tmp/listings.json --emit-sql /tmp/geofence.sql
//
// DRY_RUN prints TWO counts: rows flipping to geofence_pass=false (the Andover
// backlog) and rows that pass the buffer but are corroborated=false (the audit
// pile a coordinate-only system would have trusted blindly).

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withinGeofence } from './listings-normalise.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

// ── active-village index (the geofence is measured globally, across outcodes) ──
export async function loadActiveVillages() {
  const dir = resolve(root, 'data/areas');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const villages = [];
  for (const f of files) {
    const a = JSON.parse(await readFile(resolve(dir, f), 'utf8'));
    if (a.active === false) continue;                       // L7.5 pruning (default active)
    const lat = a.coords?.lat, lng = a.coords?.lng;
    if (lat == null || lng == null) continue;
    villages.push({
      id: a.id, name: a.name, outcode: String(a.postcode || '').toUpperCase(),
      lat: Number(lat), lng: Number(lng),
      geofenceRadiusKm: a.geofenceRadiusMi != null ? Number(a.geofenceRadiusMi) / 0.621371 : undefined,
    });
  }
  return villages;
}

/** Compute the geofence fields for one listing row. Pure. */
export function geofenceFields(row, villages) {
  const g = withinGeofence(row, { villages });
  return {
    rightmove_id: row.rightmove_id,
    area_id: g.area_id,
    distance_mi: g.distance_mi == null ? null : Number(g.distance_mi.toFixed(3)),
    geofence_pass: g.pass,
    name_match: g.name_match,
    corroborated: g.corroborated,
    match_source: g.name_match !== null ? 'coordinates+name' : 'coordinates',
  };
}

/** Summarise a batch of computed fields for the dry-run / report. */
export function summarise(computed) {
  const flips = computed.filter((c) => c.geofence_pass === false);
  const flagged = computed.filter((c) => c.geofence_pass === true && c.corroborated === false);
  const kept = computed.filter((c) => c.geofence_pass === true);
  return { total: computed.length, kept: kept.length, flips: flips.length, flagged: flagged.length };
}

// ── SQL emit (apply via MCP) ──────────────────────────────────────────────────
function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function emitSql(computed, { chunk = 200 } = {}) {
  const out = [];
  for (let i = 0; i < computed.length; i += chunk) {
    const slice = computed.slice(i, i + chunk);
    const values = slice.map((c) =>
      `(${sqlLiteral(c.rightmove_id)}, ${sqlLiteral(c.area_id)}, ${sqlLiteral(c.distance_mi)}, ` +
      `${sqlLiteral(c.geofence_pass)}, ${sqlLiteral(c.name_match)}, ${sqlLiteral(c.corroborated)}, ${sqlLiteral(c.match_source)})`
    ).join(',\n  ');
    out.push(
      `UPDATE listings AS l SET\n` +
      `  area_id = v.area_id, distance_mi = v.distance_mi, geofence_pass = v.geofence_pass,\n` +
      `  name_match = v.name_match, corroborated = v.corroborated, match_source = v.match_source\n` +
      `FROM (VALUES\n  ${values}\n) AS v(rightmove_id, area_id, distance_mi, geofence_pass, name_match, corroborated, match_source)\n` +
      `WHERE l.rightmove_id = v.rightmove_id;`
    );
  }
  return out.join('\n\n');
}

// ── REST (CI) ─────────────────────────────────────────────────────────────────
async function restGetAllListings() {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/listings?select=rightmove_id,lat,lng,town,address,postcode,outcode`;
    const res = await fetch(url, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`GET listings failed: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

async function restUpsert(rows) {
  const url = `${SUPABASE_URL}/rest/v1/listings?on_conflict=rightmove_id`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`UPSERT failed: ${res.status} ${await res.text()}`);
}

function printReport(computed, rows) {
  const s = summarise(computed);
  const byId = new Map(rows.map((r) => [r.rightmove_id, r]));
  console.log(`\n=== geofence backfill report ===`);
  console.log(`rows ${s.total} · in-buffer kept ${s.kept} · flip→geofence_pass=false ${s.flips} · in-buffer-but-uncorroborated ${s.flagged}`);
  const flips = computed.filter((c) => c.geofence_pass === false).slice(0, 8);
  if (flips.length) {
    console.log(`\nsample of rows leaving the feed (out of every village buffer):`);
    for (const c of flips) { const r = byId.get(c.rightmove_id) || {}; console.log(`  ✗ ${r.address ?? r.rightmove_id} — ${c.distance_mi ?? '∞'}mi from nearest village`); }
  }
  const flagged = computed.filter((c) => c.geofence_pass === true && c.corroborated === false).slice(0, 8);
  if (flagged.length) {
    console.log(`\nsample of in-buffer rows the failsafe flags (coords say one village, text says another):`);
    for (const c of flagged) { const r = byId.get(c.rightmove_id) || {}; console.log(`  ⚠ ${r.address ?? r.rightmove_id} → ${c.area_id} (${c.distance_mi}mi) but text contradicts`); }
  }
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const fromFileIdx = argv.indexOf('--from-file');
  const emitSqlIdx = argv.indexOf('--emit-sql');
  const fromFile = fromFileIdx >= 0 ? argv[fromFileIdx + 1] : null;
  const emitSqlPath = emitSqlIdx >= 0 ? argv[emitSqlIdx + 1] : null;

  const villages = await loadActiveVillages();
  console.log(`active villages: ${villages.length}`);

  let rows;
  if (fromFile) {
    rows = JSON.parse(await readFile(resolve(fromFile), 'utf8'));
    console.log(`listings loaded from file: ${rows.length}`);
  } else {
    if (!SERVICE_KEY) throw new Error('no service key — use --from-file <json> (dump via MCP) for the sandbox path');
    rows = await restGetAllListings();
    console.log(`listings loaded via REST: ${rows.length}`);
  }

  const computed = rows.map((r) => geofenceFields(r, villages));
  printReport(computed, rows);

  if (emitSqlPath) {
    await writeFile(resolve(emitSqlPath), emitSql(computed) + '\n');
    console.log(`\nSQL written → ${emitSqlPath} (apply via mcp__supabase__execute_sql)`);
    return;
  }
  if (DRY_RUN) { console.log('\nDRY_RUN — no write.'); return; }
  if (fromFile) { console.log('\n--from-file with no --emit-sql and no service key → nothing written.'); return; }

  // REST write path (CI).
  const CHUNK = 500;
  for (let i = 0; i < computed.length; i += CHUNK) {
    await restUpsert(computed.slice(i, i + CHUNK));
  }
  console.log(`\nUPSERTed ${computed.length} rows.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error('BACKFILL CRASHED:', e); process.exit(1); });
}
