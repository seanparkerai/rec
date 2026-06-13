---
name: area-research
description: Research one or more areas and persist them the DB-first way (CLAUDE.md §2/§18.5). Use when asked to research, revise, or batch-update area content.
---

# Area research — the DB-first write path

Supabase `areas` is the source of truth; `data/areas/<id>.json` is a materialised view.
**Never hand-edit a per-area file as the primary write** — the parity test will fail.

1. Pick the queue: `node tools/area-status.mjs --missing` (or the user's named areas).
2. **Research properly** (CLAUDE.md §7): detailed, place-specific web searches (exact
   place name + property type). Record every source in the record's `sources[]`.
   Only openly-licensed imagery, downloaded with `credit` + `licence`. Never
   auto-generate content.
3. Shape per `data/schema/area.schema.json`; set `status`
   (`directory` → `stub` → `drafted` → `partial` → `researched`).
4. **Write to Supabase** via MCP `execute_sql` UPSERT into `areas`; verify by re-SELECT.
5. Materialise: `node tools/sync-areas-from-supabase.mjs` then `node tools/build-areas.mjs`
   (rebuilds the `data/areas.json` index from `data/source/villages.csv` + content files).
6. Verify coords if locations changed: `node tools/verify-area-coords.mjs --online`.
7. Update `data/snapshots/sync-state.json` high-water marks.
8. `node tools/run-intelligence-tests.mjs` green → commit, ending the message with
   `Supabase: pushed N areas, 0 user-state rows`.

An id/postcode migration also rewrites `data/source/villages.csv` and carries
references (incl. `area_confirmations` keys — the narrow §18.4 relaxation).
