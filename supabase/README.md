# supabase/ — what's canonical here

- **`schema.sql`** — the idempotent base DDL for the original tables. Useful as a readable
  reference and for bootstrapping a fresh project.
- **Live schema truth is the MCP migration history**, not these files (CLAUDE.md §18.5): all DDL
  changes go through `mcp__supabase__apply_migration`, and the live shape is read with
  `mcp__supabase__list_tables` / `docs/SCHEMA_NOTES.md` — never inferred from SQL files in this
  directory.
- **`archive/`** — historical add-on DDL that has long been applied to the live project
  (`schema-additions.sql` Phase 5 data-model expansion · `schema-listings.sql` v3 L1 ·
  `schema-multi-reason.sql` v3 L3). Verified applied via `list_tables` 2026-06-12 (all tables
  present, RLS enabled). Kept for the record; do not re-run.
