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
- **`archive/schema-live-feed-stats.sql`** — the `/live-feed` kiosk DB surface (LIVE_FEED_PLAN §2):
  the `public.live_feed_stats()` admin-only aggregate RPC **and** the `household_review_stats`
  derived per-household cache (the listings-page "to review" count). Applied to the live project
  2026-06-22 via MCP `execute_sql` (the `apply_migration` tool was approval-gated that session);
  verified present + rejecting non-admin callers. `household_review_stats` is untracked engine/derived
  state (see `docs/SUPABASE_SYNC.md` §0). Kept for the record; do not re-run blindly.
