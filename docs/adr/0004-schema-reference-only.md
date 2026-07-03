# 0004. One schema truth: MCP migration history is canonical; every repo .sql is REFERENCE ONLY

Date: 2026-07-03 (step 9.5; backfilled same day, Phase 10.1)

## Status

Accepted

## State / rail

`supabase/schema.sql` + `supabase/archive/*.sql` and the DDL write path (CLAUDE.md §17/§18.5).

## Context

`supabase/schema.sql` predates the MCP workflow and still carried a "run in Supabase → SQL
Editor" instruction that contradicted §18.5. The archive had accumulated reference DDL slices
whose relationship to the live schema was undeclared, and one file
(`schema-live-feed-stats.sql`) had been applied via `execute_sql` outside the migration
history. Two candidate fixes from the plan — delete `schema.sql`, or auto-generate it in CI —
each destroyed something useful (bootstrap readability; zero-build simplicity).

## Decision

Neither delete nor auto-generate. The MCP migration history (32 migrations at reconciliation,
`20260525214013`→`20260702085056`) is the single schema truth; every `.sql` under `supabase/`
opens with a `-- REFERENCE ONLY` marker naming its migration, enforced by
`tests/contract/schema-reference-only.test.js` (marker mandatory, slices present, no
dashboard-run instructions). `schema-live-feed-stats.sql` is recorded as the one known
out-of-history application; a second is a stop-and-reconcile event. All DDL goes through
`mcp__supabase__apply_migration`, followed by regenerating `types/supabase.d.ts` (step added to
CLAUDE.md §17 in 9.7).

## Consequences

Reference DDL stays readable without ever being mistaken for the write path; drift between the
files and the live schema is a named, tested condition rather than a silent one. Cost: new
reference slices must carry the marker or the harness fails — deliberate friction.
