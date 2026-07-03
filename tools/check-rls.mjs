#!/usr/bin/env node
// check-rls.mjs — the RLS guard rail (overhaul step 1.11; docs/archive/plan-2026-07-overhaul/04-program.md §4).
//
// Every public table in the live database MUST have Row Level Security enabled:
// the browser ships the publishable key, so RLS is the entire authorisation
// model. A table that loses RLS leaks data to any authenticated user.
//
// Online check (authoritative): needs SUPABASE_DB_URL (the Postgres connection
// string; CI repo secret — owner step 2.16). Queries pg_class for public tables
// with relrowsecurity = false and FAILS if any exist.
//
// Without the secret it exits 0 but reports SKIPPED — an unrun check is never
// reported as passing (§5.2 "gated honestly").
//
// Usage:  node tools/check-rls.mjs           (also wired into CI)

import { spawnSync } from 'node:child_process';

export const RLS_QUERY = `
  SELECT c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')       -- ordinary + partitioned tables
    AND NOT c.relrowsecurity
  ORDER BY c.relname;
`.trim();

export function checkRls({ dbUrl = process.env.SUPABASE_DB_URL, exec = spawnSync } = {}) {
  if (!dbUrl) {
    return { status: 'skipped', tables: [], message: 'SKIPPED — SUPABASE_DB_URL not set; online RLS check unrun (NOT passing)' };
  }
  const res = exec('psql', [dbUrl, '-tA', '-c', RLS_QUERY], { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    return { status: 'error', tables: [], message: `RLS check could not run: ${res.error?.message || res.stderr || `psql exit ${res.status}`}` };
  }
  const tables = res.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  if (tables.length) {
    return { status: 'fail', tables, message: `RLS DISABLED on public table(s): ${tables.join(', ')} — every public table must have RLS (CLAUDE.md §17)` };
  }
  return { status: 'pass', tables: [], message: 'RLS enabled on every public table' };
}

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) {
  const r = checkRls();
  console.log(`[check-rls] ${r.message}`);
  // skipped exits 0 (the gate is honest, not blocking without creds);
  // fail/error exit 1 so CI blocks when the check CAN run and finds a hole.
  process.exit(r.status === 'fail' || r.status === 'error' ? 1 : 0);
}
