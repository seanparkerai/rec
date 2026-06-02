#!/usr/bin/env node
// check-supabase-freshness.mjs — session-start freshness check (CLAUDE.md §8 Step 0)
//
// Reads local snapshot (data/snapshots/sync-state.json) of last-known MAX(updated_at)
// per table, and guides Claude on what MCP queries to run to detect changes since
// the last session. This is the "pull upstream state" step of the sync contract.
//
// Usage: node tools/check-supabase-freshness.mjs

import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = resolve(root, 'data/snapshots/sync-state.json');

const tables = [
  'profile', 'criteria', 'finances', 'shortlist', 'zones', 'journey_checks', 'contacts', 'outreach',
  'areas', 'house_types'
];

async function readSnapshot() {
  try {
    const content = await readFile(SNAPSHOT, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function main() {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();

  console.log('┌─ Supabase freshness check ─────────────────────────────────────┐');
  console.log('│ Last-known MAX(updated_at) per table (from snapshot):            │');
  console.log('├─────────────────────────────────────────────────────────────────┤');

  for (const table of tables) {
    const cached = snapshot[table]?.last_synced_at || 'never';
    console.log(`│ ${table.padEnd(24)} ${cached}`);
  }

  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log('│ Next step (run via Claude MCP):                                  │');
  console.log('└─────────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('Execute via mcp__supabase__execute_sql:');
  console.log('');

  const sql = `
SELECT
  'profile' as table_name,
  MAX(updated_at) as max_updated_at
FROM profile
UNION ALL
SELECT 'criteria', MAX(updated_at) FROM criteria
UNION ALL
SELECT 'finances', MAX(updated_at) FROM finances
UNION ALL
SELECT 'shortlist', MAX(updated_at) FROM shortlist
UNION ALL
SELECT 'zones', MAX(updated_at) FROM zones
UNION ALL
SELECT 'journey_checks', MAX(updated_at) FROM journey_checks
UNION ALL
SELECT 'contacts', MAX(updated_at) FROM contacts
UNION ALL
SELECT 'outreach', MAX(updated_at) FROM outreach
UNION ALL
SELECT 'areas', MAX(updated_at) FROM areas
UNION ALL
SELECT 'house_types', MAX(updated_at) FROM house_types;
`.trim();

  console.log(sql);
  console.log('');
  console.log('Then compare results:');
  console.log('  • If any USER-STATE table (profile, criteria, finances, shortlist,');
  console.log('    zones, journey_checks, contacts, outreach) is fresher:');
  console.log('    → User edited in the portal. Pull that row and update the snapshot.');
  console.log('  • If any CONTENT table (areas, house_types) is behind:');
  console.log('    → A previous session failed to mirror. Re-push from repo.');
  console.log('');
  console.log('See CLAUDE.md §18.2 + docs/SUPABASE_SYNC.md for the full protocol.');
}

main().catch(e => { console.error(e); process.exit(1); });
