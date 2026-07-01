---
name: sync-check
description: Run the CLAUDE.md §18.2/§18.3 Supabase sync ceremony for data sessions — session-start freshness check or session-end verification before commit.
---

# Sync check (CLAUDE.md §18.2 start / §18.3 end)

Applies to sessions touching data, schema, or user-state. The table inventory lives in
`docs/SUPABASE_SYNC.md` §0; the enforced list in `tests/supabase-sync.test.js`.

## Session start (§18.2)
1. `mcp__supabase__list_tables` — schema intact, RLS on every table.
2. `node tools/check-supabase-freshness.mjs` (or `execute_sql` `MAX(updated_at)` per
   table) vs `data/snapshots/sync-state.json`.
3. **User-state table fresher** → the user edited in the portal: pull the row via
   `execute_sql`, update the snapshot, surface a one-line diff.
4. **Content table behind the repo** → a previous session failed to mirror: re-push via
   UPSERT before anything else.

## Session end (§18.3) — before any commit + push
1. UPSERT every user-state value changed this session; verify by re-SELECT.
2. UPSERT every edited content file into its mirror (`house_types`; `areas` is
   DB-canonical so the flow is reversed — see the area-research skill). `checklists` /
   `outreach_templates` have no mirror — do not UPSERT them.
3. Update `data/snapshots/sync-state.json` high-water marks.
4. `node tools/run-all-tests.mjs` green (includes the sync suite).
5. Commit with the footer `Supabase: pushed N areas, M user-state rows`.

If any MCP write fails the session is **incomplete** — fix it or surface it; never
commit a half-sync. Conflict rules: user state — Supabase wins, stop and ask if
`updated_at` is unexpectedly new; `areas` — DB wins; other content — repo wins;
DDL — only via `apply_migration`.
