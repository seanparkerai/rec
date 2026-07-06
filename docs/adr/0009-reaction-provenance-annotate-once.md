# 0009. Reaction provenance: durable `source` column, annotate-once backfill, append-only preserved

Date: 2026-07-06 (listings audit/cleanup phase, owner-approved)

## Status

Accepted

## State / rail

`listing_reactions` schema (MCP migration `listing_reactions_source_provenance`), the
append-only contract (`docs/SUPABASE_SYNC.md`, ADR 0006 exemption), and the provenance
classifier `assets/js/listings/reaction-provenance.js`.

## Context

Reaction provenance (was this a one-at-a-time judgement or part of an en-masse sweep?) was
inferred at read time only: a reject sharing its UTC minute with ≥6 graded reactions is "bulk",
`removed_area` is "admin". The heuristic is fragile — a slow sweep (<6/min) passes as genuine,
and nothing durable marks the 2026-06-04 sweep (3,303 rows in one day) that dominates the
4,667-row log. The weights engine trains reason-attributed bulk rejects at full strength, so
sweeps count exactly like manual reviews (owner measured and rejected this). The log itself is
append-only by DB contract (RLS: SELECT+INSERT only) and must stay that way — reaction *content*
is evidence and is never rewritten.

## Decision

Add `listing_reactions.source text NOT NULL DEFAULT 'manual'
CHECK (source IN ('manual','bulk','admin','import'))`, written by every writer at insert time
(the portal's `saveListingReaction` declares `'manual'`; any future programmatic sweep — MCP
included — MUST self-declare `'bulk'`, imports `'import'`). Historical rows get a **one-time
annotate-once backfill** in the same migration, mirroring the read-time heuristic
(`removed_area` → `'admin'`; rejects in ≥6-graded UTC-minute bursts → `'bulk'`; rest stay
`'manual'`). `classifyProvenance()` prefers the durable value and falls back to the heuristic
for rows without one (old caches, fixtures).

**Append-only relaxation, narrowly**: a migration may *annotate* historical rows by filling a
newly added column once; it must never mutate reaction content (reaction/reason/snapshot/
created_at) or delete rows. Client RLS stays SELECT+INSERT.

## Consequences

- Provenance becomes trustworthy at any sweep speed; the heuristic remains only as a fallback
  and a drift check (`tools/listings-audit.mjs` reports durable-vs-heuristic mismatches).
- The weights engine can discount bulk rows (ADR-adjacent change, `LEARNED_PREF.BULK_DISCOUNT`)
  without misclassifying careful reviews.
- Writers carry a new obligation: unmarked bulk inserts would poison the column; the audit
  drift check is the tripwire.
- The `'import'` value is reserved for re-ingested historical data (`import-apify-runs.mjs`
  writes listings, not reactions, today).
