# 0002. Make Supabase canonical for area content; repo files become a materialised view

Date: 2026-06-04 (owner decision; backfilled 2026-07-03, Phase 10.1)

## Status

Accepted

## State / rail

The `areas` content class (CLAUDE.md §2/§18.5) and `data/schema/area.schema.json`'s write path.

## Context

Area content originally lived repo-first (JSON canonical, mirrored up to Supabase). That gave
two write paths and repeated drift: a session could edit a file and forget the mirror, or edit
the DB and forget the file. Areas are also queried and joined live (household selections,
geofences, the fetcher demand set), which the repo copy cannot serve.

## Decision

The owner ruled the Supabase `areas` table canonical (the "§18.5 relaxation"). Every area write
goes **DB-first**: MCP UPSERT → `tools/sync-areas-from-supabase.mjs` materialises
`data/areas/<id>.json` → `tools/build-areas.mjs` regenerates the index → commit.
`tests/contract/areas-db-repo-parity.test.js` fails the harness if any file drifts from its DB
row. Hand-editing a per-area file as the primary write is banned.

## Consequences

One write path, mechanically guarded; the repo keeps reviewable, diff-able, cite-able copies
without being a second source of truth. Cost: area edits require the MCP connector (no
offline-only area sessions), and an id/postcode migration must also rewrite
`data/source/villages.csv` and carry references in the same change.
