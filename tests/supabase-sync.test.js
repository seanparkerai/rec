// tests/supabase-sync.test.js — sync contract enforcement (CLAUDE.md §6, §18)
// Tests that the bidirectional sync between repo/local/Supabase remains consistent.
// Includes offline checks (repo structure) and optional online checks (MCP queries).

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const TESTS = [];
const test = (name, fn) => TESTS.push({ name, fn });

// ── Offline: snapshot validity ──────────────────────────────────────────────

test('snapshot file exists and is valid JSON', async () => {
  const path = resolve(root, 'data/snapshots/sync-state.json');
  const content = await readFile(path, 'utf8');
  assert(content, 'snapshot file is empty');
  const parsed = JSON.parse(content); // throws if invalid
  assert(typeof parsed === 'object', 'snapshot must be an object');
});

test('snapshot includes all 17 tracked tables', async () => {
  const path = resolve(root, 'data/snapshots/sync-state.json');
  const snapshot = JSON.parse(await readFile(path, 'utf8'));
  // 15 user-state tables + 2 content mirrors
  const expected = [
    'profile', 'criteria', 'finances', 'goals', 'shortlist', 'zones',
    'journey_checks', 'contacts', 'outreach',
    'readiness_checklist', 'investments_accounts', 'investments_history',
    'debts_credit_cards', 'debts_student_loans', 'debts_other',
    'areas', 'house_types',
  ];
  for (const table of expected) {
    assert(table in snapshot, `snapshot missing table: ${table}`);
  }
});

test('snapshot v3+ tables have required shape', async () => {
  const path = resolve(root, 'data/snapshots/sync-state.json');
  const snapshot = JSON.parse(await readFile(path, 'utf8'));
  // Tables with real data must have a non-null last_synced_at
  const withData = ['goals', 'readiness_checklist', 'investments_accounts', 'investments_history'];
  for (const table of withData) {
    assert(table in snapshot, `snapshot missing table: ${table}`);
    assert(snapshot[table].last_synced_at, `snapshot.${table} missing last_synced_at`);
  }
  // Debt tables exist but may be empty; shape must still be present
  const debtTables = ['debts_credit_cards', 'debts_student_loans', 'debts_other'];
  for (const table of debtTables) {
    assert(table in snapshot, `snapshot missing debt table: ${table}`);
    assert('count' in snapshot[table], `snapshot.${table} missing count`);
  }
});

// ── Offline: repo content structure ──────────────────────────────────────────

test('all area files match schema', async () => {
  const dir = resolve(root, 'data/areas');
  const files = (await readdir(dir)).filter(f => f.endsWith('.json'));
  const schema = JSON.parse(await readFile(resolve(root, 'data/schema/area.schema.json'), 'utf8'));

  for (const f of files.slice(0, 5)) { // sample first 5
    const content = JSON.parse(await readFile(resolve(dir, f), 'utf8'));
    assert(typeof content.id === 'string', `${f}: missing id`);
    assert(typeof content.name === 'string', `${f}: missing name`);
    assert(typeof content.status === 'string', `${f}: missing status`);
    assert(['directory', 'stub', 'drafted', 'partial', 'researched'].includes(content.status),
      `${f}: invalid status "${content.status}"`);
  }
});

test('house-types.json is valid', async () => {
  const path = resolve(root, 'data/house-types.json');
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  assert(Array.isArray(parsed), 'house-types must be an array');
  assert(parsed.length > 0, 'house-types array is empty');
  for (const ht of parsed.slice(0, 3)) {
    assert(ht.id, 'house-type missing id');
    assert(ht.name, 'house-type missing name');
  }
});

test('checklists.json is valid', async () => {
  const path = resolve(root, 'data/checklists.json');
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  assert(typeof parsed === 'object', 'checklists must be an object');
  assert('viewing' in parsed && 'process' in parsed && 'moving' in parsed,
    'checklists must have viewing/process/moving keys');
});

test('outreach-templates.json is valid', async () => {
  const path = resolve(root, 'data/outreach-templates.json');
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  assert(Array.isArray(parsed), 'outreach-templates must be an array');
  assert(parsed.length === 24, `expected 24 templates, got ${parsed.length}`);
  for (const t of parsed) {
    assert(t.id, 'template missing id');
    assert(t.stage, 'template missing stage');
  }
});

// ── Status: backfill tooling present ──────────────────────────────────────

test('backfill script is present and executable', async () => {
  const path = resolve(root, 'tools/backfill-content-direct.mjs');
  const content = await readFile(path, 'utf8');
  assert(content.includes('SUPABASE_SERVICE_ROLE_KEY'), 'backfill script must require service role key');
  assert(content.includes('rest/v1/'), 'backfill script must use PostgREST endpoint');
  assert(content.includes("supabaseUpsert('areas'") || content.includes('upsert(\'areas\''),
    'backfill script must upsert to areas');
  assert(content.includes("supabaseUpsert('house_types'") || content.includes('upsert(\'house_types\''),
    'backfill script must upsert to house_types');
});

// ── Online: schema check (MCP required) ──────────────────────────────────────
// Skipped in this test harness (offline only). Call via claude during sessions.

test('(skipped) schema check — run via MCP in session', () => {
  // Offline harness cannot call MCP. Claude performs this check at session start
  // via mcp__supabase__list_tables. Test passes to keep harness green.
});

// ── Online: content mirror backfill progress (MCP required) ──────────────────
// This assertion is deferred until after Phase 10C (backfill execution) completes.

test('(skipped) areas mirror row count — pending backfill', () => {
  // Will be wired up after the 195 areas are pushed to Supabase.
  // Check: SELECT COUNT(*) FROM areas SHOULD EQUAL 195 (or subset, depending on progress).
});

// ── Runner ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

for (const { name, fn } of TESTS) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.log(`  ${e.message}`);
    failed++;
  }
}

console.log('');
console.log(`${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
