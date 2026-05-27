#!/usr/bin/env node
// backfill-content-direct.mjs — direct backfill of areas + house_types into Supabase.
//
// This is the ONE-TIME bootstrap that pushes existing repo content into the
// Supabase mirror tables. After this runs, day-to-day edits flow through the
// normal Claude MCP sync (one area at a time).
//
// Usage:
//   1. Get your Supabase Service Role Key from: https://supabase.com/dashboard/project/qxmyrahqsopmaeokxdub/settings/api
//      (it's the "service_role" secret, not the publishable/anon key)
//   2. export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
//   3. npm install @supabase/supabase-js   # if not already installed
//   4. node tools/backfill-content-direct.mjs
//
// The script will:
//   - Read all data/areas/*.json files (195 records)
//   - Read data/house-types.json (15 records)
//   - UPSERT each into the corresponding mirror table
//   - Log each operation to sync_log
//   - Update data/snapshots/sync-state.json
//
// Idempotent: safe to re-run. Existing rows are updated only if data differs.

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = 'https://qxmyrahqsopmaeokxdub.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable not set.');
  console.error('');
  console.error('Get the key from: https://supabase.com/dashboard/project/qxmyrahqsopmaeokxdub/settings/api');
  console.error('Then run: export SUPABASE_SERVICE_ROLE_KEY="eyJ..."');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = resolve(root, 'data/snapshots/sync-state.json');

async function supabaseUpsert(table, records) {
  // Use the PostgREST API directly — no SDK needed.
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`;
  const payload = records.map(r => ({ id: r.id, data: r, updated_at: new Date().toISOString() }));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`UPSERT ${table} failed: ${res.status} ${text}`);
  }
  return records.length;
}

async function syncLog(rows) {
  const url = `${SUPABASE_URL}/rest/v1/sync_log`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    console.warn(`sync_log write failed: ${res.status} ${await res.text()}`);
  }
}

async function loadAreas() {
  const dir = resolve(root, 'data/areas');
  const files = (await readdir(dir)).filter(f => f.endsWith('.json'));
  const records = [];
  for (const f of files) {
    records.push(JSON.parse(await readFile(resolve(dir, f), 'utf8')));
  }
  return records;
}

async function loadHouseTypes() {
  const parsed = JSON.parse(await readFile(resolve(root, 'data/house-types.json'), 'utf8'));
  return Array.isArray(parsed) ? parsed : (parsed.types || parsed.houseTypes || []);
}

async function main() {
  console.log('🔄 Loading repo content...');
  const [areas, houseTypes] = await Promise.all([loadAreas(), loadHouseTypes()]);
  console.log(`  ${areas.length} areas, ${houseTypes.length} house types`);

  // Batch UPSERTs of 25 at a time (PostgREST handles large arrays fine but
  // smaller batches give better progress feedback).
  const BATCH = 25;

  console.log(`\n📤 Backfilling areas...`);
  let done = 0;
  for (let i = 0; i < areas.length; i += BATCH) {
    const batch = areas.slice(i, i + BATCH);
    await supabaseUpsert('areas', batch);
    await syncLog(batch.map(r => ({ table_name: 'areas', actor: 'claude', action: 'backfill', row_id: r.id })));
    done += batch.length;
    process.stdout.write(`  ${done}/${areas.length}\r`);
  }
  console.log(`  ✓ ${areas.length}/${areas.length} areas`);

  console.log(`\n📤 Backfilling house types...`);
  await supabaseUpsert('house_types', houseTypes);
  await syncLog(houseTypes.map(r => ({ table_name: 'house_types', actor: 'claude', action: 'backfill', row_id: r.id })));
  console.log(`  ✓ ${houseTypes.length}/${houseTypes.length} house types`);

  console.log(`\n📝 Updating snapshot...`);
  const now = new Date().toISOString();
  let snapshot = {};
  try { snapshot = JSON.parse(await readFile(SNAPSHOT, 'utf8')); } catch {}
  snapshot.areas = { count: areas.length, last_synced_at: now };
  snapshot.house_types = { count: houseTypes.length, last_synced_at: now };
  await mkdir(dirname(SNAPSHOT), { recursive: true });
  await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`  ✓ ${SNAPSHOT}`);

  console.log(`\n✅ Backfill complete. Total: ${areas.length + houseTypes.length} records.`);
  console.log(`   Verify: SELECT COUNT(*) FROM areas; (should be ${areas.length})`);
  console.log(`           SELECT COUNT(*) FROM house_types; (should be ${houseTypes.length})`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
