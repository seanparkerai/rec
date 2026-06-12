# SUPABASE_MIGRATION.md — applying the Phase 5 schema additions

## What this is

`supabase/schema-additions.sql` contains idempotent PostgreSQL DDL for the tables added in Phase 5 of the data model expansion. It must be applied to the live Supabase project before the new data types (goals, investments, debts, readiness checklist) can be synced bidirectionally.

## How to apply

**Do not paste SQL into the Supabase dashboard manually.** Use the MCP connector to maintain migration history alignment.

### Option A — Claude Code + Supabase MCP connector (recommended)

In a Claude Code session with the Supabase MCP connector enabled:

```
Apply the migration at supabase/schema-additions.sql to the rec project.
```

Claude will call `mcp__supabase__apply_migration` with the SQL contents. Verify by running `mcp__supabase__list_tables` after — you should see the new tables listed with RLS enabled.

### Option B — Manual (fallback only)

1. Open Supabase dashboard → SQL Editor → New query
2. Paste the contents of `supabase/schema-additions.sql`
3. Run
4. Confirm all new tables appear in the Table Editor with RLS enabled

**Note:** Manual runs bypass the migration history tracker. Prefer Option A.

## Tables added

| Table | Purpose |
|-------|---------|
| `profile.extended_data` column | New nested profile.json format (ALTER existing table) |
| `goals` | Deposit target, timeline, readiness checklist (JSON blob) |
| `investments_accounts` | One row per investment account (T212 ISA) |
| `investments_history` | Monthly T212 import aggregates |
| `debts_credit_cards` | One row per credit card |
| `debts_student_loans` | One row per student loan plan |
| `debts_other` | Personal loans, BNPL, car finance, overdraft |
| `readiness_checklist` | Key-value readiness items (one row per checklist item) |

All tables use Row Level Security with `is_household_member(household_id)`.

## What needs wiring after migration

1. **`assets/js/storage.js`** — add `getGoals()` / `saveGoals()`, `getInvestments()` / `saveInvestments()`, and `getReadinessChecklist()` / `saveReadinessItem()` pairs following the existing `_get`/`_save` pattern. Per §17 in CLAUDE.md: extend, do not rewrite.

2. **`pages/data-sync.html`** — extend the sync page to include the new tables in its bidirectional sync verification step.

3. **`tests/supabase-sync.test.js`** — add test assertions for the new tables (non-null row presence for goals, checklist items).

4. **Dashboard readiness tile** — once storage.js provides `getReadinessChecklist()`, update `renderReadinessTile()` in `page-home.js` to read from Supabase rather than the local JSON stub.

## Deferred

The following work is out of scope for this phase and will be handled separately:
- Backfilling `goals`, `investments_accounts`, and `readiness_checklist` rows from the local JSON files
- Building the portal UI for editing checklist items (currently read-only via JSON)
- Syncing the T212 importer output to `investments_history` rows automatically
