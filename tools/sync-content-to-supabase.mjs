#!/usr/bin/env node
// sync-content-to-supabase.mjs — generates the UPSERT SQL to push repo content
// JSON into Supabase mirror tables (areas, house_types).
//
// Canonical content lives in data/areas/<id>.json + data/house-types.json. This
// tool reads those files, packages them as JSON arrays, and emits a SQL script
// at .tmp/sync-content.sql for Claude to execute via the Supabase MCP connector.
//
// Claude's workflow:
//   1. node tools/sync-content-to-supabase.mjs
//   2. mcp__supabase__execute_sql with the contents of .tmp/sync-content.sql
//   3. node tools/sync-content-to-supabase.mjs --snapshot   (after success)
//
// See CLAUDE.md §18 + docs/SUPABASE_SYNC.md for the full contract.

import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TMP_DIR = resolve(root, '.tmp');
const SNAPSHOT = resolve(root, 'data/snapshots/sync-state.json');

const args = new Set(process.argv.slice(2));
const SNAPSHOT_MODE = args.has('--snapshot');
const QUIET = args.has('--quiet');

const log = (m) => { if (!QUIET) console.log(m); };

async function loadAreas() {
  const dir = resolve(root, 'data/areas');
  const files = (await readdir(dir)).filter(f => f.endsWith('.json'));
  const records = [];
  let maxMtime = 0;
  for (const f of files) {
    const path = resolve(dir, f);
    const [content, st] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    records.push(JSON.parse(content));
    maxMtime = Math.max(maxMtime, st.mtimeMs);
  }
  return { records, maxMtime };
}

async function loadHouseTypes() {
  const path = resolve(root, 'data/house-types.json');
  const [content, st] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
  const parsed = JSON.parse(content);
  const records = Array.isArray(parsed) ? parsed : (parsed.types || parsed.houseTypes || []);
  return { records, maxMtime: st.mtimeMs };
}

function buildUpsertSQL(table, records) {
  // jsonb_array_elements expansion — one INSERT statement handles all rows.
  const json = JSON.stringify(records).replace(/'/g, "''");
  return `
INSERT INTO ${table} (id, data, updated_at)
SELECT (value->>'id')::text, value, now()
FROM jsonb_array_elements('${json}'::jsonb) AS value
ON CONFLICT (id) DO UPDATE
  SET data = EXCLUDED.data,
      updated_at = now()
WHERE ${table}.data IS DISTINCT FROM EXCLUDED.data;
INSERT INTO sync_log (table_name, actor, action, row_id)
SELECT '${table}', 'claude', 'backfill', (value->>'id')::text
FROM jsonb_array_elements('${json}'::jsonb) AS value;
`;
}

async function writeSnapshot(state) {
  await mkdir(dirname(SNAPSHOT), { recursive: true });
  await writeFile(SNAPSHOT, JSON.stringify(state, null, 2) + '\n');
  log(`✓ snapshot written → ${SNAPSHOT}`);
}

async function readSnapshot() {
  try { return JSON.parse(await readFile(SNAPSHOT, 'utf8')); }
  catch { return {}; }
}

async function main() {
  await mkdir(TMP_DIR, { recursive: true });

  if (SNAPSHOT_MODE) {
    // Stamp current local state into the snapshot; called AFTER MCP push succeeds.
    const [areas, houseTypes] = await Promise.all([loadAreas(), loadHouseTypes()]);
    const now = new Date().toISOString();
    const snapshot = {
      ...(await readSnapshot()),
      areas:       { count: areas.records.length,      last_synced_at: now },
      house_types: { count: houseTypes.records.length, last_synced_at: now },
    };
    await writeSnapshot(snapshot);
    log(`✓ stamped ${areas.records.length} areas + ${houseTypes.records.length} house types as synced at ${now}`);
    return;
  }

  const [areas, houseTypes] = await Promise.all([loadAreas(), loadHouseTypes()]);
  log(`→ ${areas.records.length} areas + ${houseTypes.records.length} house types loaded from repo`);

  // Batch areas into chunks small enough to fit comfortably in an MCP message.
  // Day-to-day single-area edits do one UPSERT per area; this batching only
  // matters for the one-time backfill.
  const BATCH = 10;
  const batches = [];
  for (let i = 0; i < areas.records.length; i += BATCH) {
    batches.push(areas.records.slice(i, i + BATCH));
  }

  for (let i = 0; i < batches.length; i++) {
    const sql = `-- areas batch ${i + 1}/${batches.length} (${batches[i].length} rows)\nBEGIN;\n${buildUpsertSQL('areas', batches[i])}\nCOMMIT;\n`;
    const outPath = resolve(TMP_DIR, `sync-areas-${String(i + 1).padStart(2, '0')}.sql`);
    await writeFile(outPath, sql);
    log(`✓ ${outPath} (${(sql.length / 1024).toFixed(1)} KB)`);
  }

  const htSql = `-- house_types batch (${houseTypes.records.length} rows)\nBEGIN;\n${buildUpsertSQL('house_types', houseTypes.records)}\nCOMMIT;\n`;
  await writeFile(resolve(TMP_DIR, 'sync-house-types.sql'), htSql);
  log(`✓ ${TMP_DIR}/sync-house-types.sql (${(htSql.length / 1024).toFixed(1)} KB)`);

  log(`  next: execute each .tmp/sync-*.sql via mcp__supabase__execute_sql, then re-run with --snapshot`);
}

main().catch(e => { console.error(e); process.exit(1); });
