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
const skip = (name, reason) => TESTS.push({ name, skip: reason || true });

// ── Offline: snapshot validity ──────────────────────────────────────────────

test('snapshot file exists and is valid JSON', async () => {
  const path = resolve(root, 'data/snapshots/sync-state.json');
  const content = await readFile(path, 'utf8');
  assert(content, 'snapshot file is empty');
  const parsed = JSON.parse(content); // throws if invalid
  assert(typeof parsed === 'object', 'snapshot must be an object');
});

test('snapshot includes all 23 tracked tables', async () => {
  const path = resolve(root, 'data/snapshots/sync-state.json');
  const snapshot = JSON.parse(await readFile(path, 'utf8'));
  // Canonical: 21 user-state + 2 content mirrors = 23 tracked tables.
  // Source of truth for this list is docs/SUPABASE_SYNC.md §0. Keep in sync.
  // (Phase 2 added household_areas — the per-household area SELECTION layer.)
  // (Ask feature added ask_conversations — natural-language assistant chat threads.)
  const expected = [
    'profile', 'criteria', 'finances', 'goals', 'shortlist', 'zones',
    'journey_checks', 'journey_progress', 'contacts', 'outreach',
    'readiness_checklist', 'investments_accounts', 'investments_history',
    'debts_credit_cards', 'debts_student_loans', 'debts_other',
    'listing_reactions', 'learned_preferences', 'area_confirmations',
    'household_areas', 'ask_conversations',
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

test('listing_reactions vocabulary is well-formed (v3 L3)', async () => {
  const mod = await import('../assets/js/listings/reactions.js');
  // Append-only graded-signal contract: like/pass/reject, only like+reject graded.
  assert(Array.isArray(mod.REACTIONS) && mod.REACTIONS.length === 3, 'REACTIONS must be the 3-verb set');
  assert(mod.REACTIONS.includes('like') && mod.REACTIONS.includes('reject'), 'REACTIONS must include like+reject');
  assert(!mod.GRADED_REACTIONS.includes('pass'), 'pass must not be a graded training signal');
  assert(mod.REJECT_REASONS.length >= 3 && mod.REJECT_REASONS.every((r) => r.key && r.label),
    'REJECT_REASONS must be {key,label} chips');
  // Personal-status lifecycle is distinct from reactions and lives on the shortlist record.
  assert(mod.PERSONAL_STATUSES.join(',') === 'new,saved,viewed,offered,rejected', 'personal-status lifecycle locked');
  assert(typeof mod.validateReaction === 'function' && typeof mod.latestPerListing === 'function',
    'reaction helpers must be exported for storage.js');
});

test('listings baseline gate is wired into every writer (pollution guard, v3 P1)', async () => {
  // The single houses+bungalows price/beds gate must be applied by EVERY path that
  // writes the listings table, or the table re-pollutes (as it did from the one
  // unfiltered 2026-05-31 import). Assert the gate exists and that BOTH the live
  // fetcher and the backfill importer import + apply passesBaseline.
  const classify = await import('../assets/js/listings/classify.js');
  assert(typeof classify.passesBaseline === 'function', 'classify.passesBaseline must exist');
  assert(typeof classify.propertyFingerprint === 'function', 'classify.propertyFingerprint must exist');
  assert(classify.BASELINE_PRICE_MIN < classify.BASELINE_PRICE_MAX, 'baseline price band must be sane');
  assert(classify.BASELINE_MIN_BEDS >= 1, 'baseline min beds must be >= 1');
  for (const tool of ['tools/fetch-listings.mjs', 'tools/import-apify-runs.mjs']) {
    const src = await readFile(resolve(root, tool), 'utf8');
    assert(/passesBaseline/.test(src) && /listings\/classify\.js/.test(src),
      `${tool} must import + apply passesBaseline (pollution guard)`);
  }
});

test('purge tool reuses the baseline + fingerprint contract (no drift, v3 P4)', async () => {
  // tools/purge-listings.mjs must reuse the SAME gate + fingerprint as the feed, never
  // re-implement them, so a purge can't diverge from what the feed suppresses.
  const src = await readFile(resolve(root, 'tools/purge-listings.mjs'), 'utf8');
  assert(/passesBaseline/.test(src), 'purge must reuse passesBaseline');
  assert(/propertyFingerprint/.test(src) && /isDecided/.test(src),
    'purge must reuse the fingerprint suppression contract (propertyFingerprint + isDecided)');
});

test('household_areas supports a reversible inactive (pause) status', async () => {
  // The per-household area selection layer must offer a reversible pause, distinct
  // from a hard delete. Guard the contract end-to-end without a browser import:
  //   1. the storage layer exposes setHouseholdAreaStatus + an includeInactive read,
  //   2. the active-only read path that listings/map rely on is preserved,
  //   3. the sync doc records the {active, inactive, removed} status domain.
  // The household-areas code lives in storage/listings/content.js (storage/listings.js
  // is now a re-export shim over content/feed/learned).
  const storage = await readFile(resolve(root, 'assets/js/storage/listings/content.js'), 'utf8');
  assert(/export async function setHouseholdAreaStatus\(/.test(storage),
    'storage must export setHouseholdAreaStatus(area_id, status)');
  assert(/status !== 'active' && status !== 'inactive'/.test(storage),
    'setHouseholdAreaStatus must constrain status to active|inactive');
  assert(/includeInactive/.test(storage),
    'getHouseholdAreas must accept includeInactive to surface paused areas');
  assert(/\.eq\('status', 'active'\)/.test(storage),
    'the default (active-only) read path must be preserved for listings/map');
  assert(/\.in\('status', \['active', 'inactive'\]\)/.test(storage),
    'includeInactive must read active + inactive links');
  const doc = await readFile(resolve(root, 'docs/SUPABASE_SYNC.md'), 'utf8');
  assert(/`status` ∈ \{`active`, `inactive`, `removed`\}/.test(doc),
    'SUPABASE_SYNC.md must document the household_areas status domain');
});

// ── Offline: repo content structure ──────────────────────────────────────────

test('all area files match schema', async () => {
  const dir = resolve(root, 'data/areas');
  const files = (await readdir(dir)).filter(f => f.endsWith('.json'));
  const schema = JSON.parse(await readFile(resolve(root, 'data/schema/area.schema.json'), 'utf8'));

  for (const f of files) { // validate every area file (was: sample first 5)
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

// These require a live Supabase connection (MCP / service-role) and are NOT run by
// the offline CI harness. Claude runs the equivalent check via mcp__supabase__list_tables
// and execute_sql at session start/end (CLAUDE.md §8/§18). They are reported as skipped —
// never counted as passing — so the green total reflects only what was actually verified.
skip('schema check — run online via MCP in session', 'offline harness cannot call MCP');
skip('areas mirror row count == repo area files — run online via MCP', 'requires live Supabase');
skip('every live listings row passes the baseline gate (no pollution) — run online via MCP', 'requires live Supabase');

// ── Runner ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

for (const { name, fn, skip: skipReason } of TESTS) {
  if (skipReason) {
    console.log(`↷ ${name} (skipped: ${typeof skipReason === 'string' ? skipReason : 'n/a'})`);
    skipped++;
    continue;
  }
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
console.log(`${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
  process.exit(1);
}
