---
name: resume
description: Resume work in a fresh session — the CLAUDE.md §8 protocol as executable steps. Use at the start of any session, or when asked "where were we" / "what's next".
---

# Resume protocol (CLAUDE.md §8)

Run these steps in order; stop and surface anything unexpected.

1. **Supabase freshness check — only if this session will edit data, schema, or user-state.**
   Skip entirely for pure code/UI/docs work. When it applies:
   - `mcp__supabase__list_tables` — tracked tables present, RLS enabled
     (inventory: `docs/SUPABASE_SYNC.md` §0).
   - `node tools/check-supabase-freshness.mjs` vs `data/snapshots/sync-state.json`.
     A fresher **user-state** table = the user edited in the portal → pull the row,
     update the snapshot, surface a one-line diff before continuing.
2. `node tools/area-status.mjs` — the canonical research-progress view and next-to-do
   queue (`--missing` to filter, `--id <area-id>` for one area).
3. Read `docs/CHECKLIST.md` (the live tracker). Add `docs/CONTEXT.md` for content
   sessions, `docs/SUPABASE_SYNC.md` for data sessions.
4. `node tools/run-intelligence-tests.mjs` — must be green before starting.
5. Continue at the **first unchecked** checklist item — or, for area research, the next
   area surfaced by `area-status.mjs`.

Rules of the road: CLAUDE.md governs everything; `DESIGN.md` before any UI change;
§16 guard-railed files are never touched by feature work.
