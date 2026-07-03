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

## Reference-only rule (overhaul 9.5 / R6, 2026-07-03)

Every `.sql` file in this directory tree is **reference DDL, never an execution target**. The rule
is mechanical: each file's **first line** carries a `-- REFERENCE ONLY` marker naming the migration
(or the out-of-history `execute_sql` application) it corresponds to, and
`tests/contract/schema-reference-only.test.js` fails the harness if any `.sql` file lacks it.
Adding new DDL = `mcp__supabase__apply_migration` first, then (optionally) a stamped reference slice
here for the record.

**Migration-history reconciliation (live `list_migrations`, 2026-07-03): 32 migrations**, from
`add_content_mirror_and_sync_log` (20260525214013) to `refinement_runs_weights_snapshot`
(20260702085056). Spot-checks: `phase5_expanded_data_model` ↔ `schema-additions.sql` ·
`listings_l1` ↔ `schema-listings.sql` · `listing_reactions_multi_reason` ↔
`schema-multi-reason.sql` · `household_feed_rpc` ↔ `schema-household-feed.sql` ·
`add_reports_table`/`drop_reports_table` cancel out (feature removed 2026-06-18). The **one known
out-of-history application** is `schema-live-feed-stats.sql` (above) — expected and recorded; if a
second one ever appears, stop and reconcile before adding more DDL.
