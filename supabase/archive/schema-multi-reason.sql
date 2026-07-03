-- REFERENCE ONLY — applied to the live project as migration listing_reactions_multi_reason (20260531115047); do not re-run.
-- schema-multi-reason.sql — DDL for v3 L3 multi-reason feedback.
-- Fully idempotent — safe to re-run on an existing project.
-- DO NOT run from a page; apply via the Supabase MCP connector:
--   mcp__supabase__apply_migration({ name: 'listing_reactions_multi_reason', query: <contents> })
-- Migration: listing_reactions_multi_reason (applied 2026-05-31).
--
-- Adds a structured, multi-select reasons array to listing_reactions. The scalar
-- `reason` column is kept and DUAL-WRITTEN with the primary (first) reason key so
-- the 44 historical single-reason rows and the latestPerListing / cache shape keep
-- working unchanged. `reasons` is the source of truth going forward and is what the
-- L4 reason-attribution training (deriveWeights) reads.

BEGIN;

ALTER TABLE listing_reactions
  ADD COLUMN IF NOT EXISTS reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN listing_reactions.reasons IS
  'v3 L3 multi-reason. Array of structured reason objects { key, detail, note }. Source of truth going forward. The scalar `reason` column is dual-written with the primary (first) reason key so legacy read paths and the latestPerListing/cache shape keep working. Applies to reject (negative reasons) and like (positive reasons).';

-- Backfill historical single-reason rows into a one-element reasons array so the
-- rows that carry a `reason` keep training under the new array-aware engine.
UPDATE listing_reactions
  SET reasons = jsonb_build_array(jsonb_build_object('key', reason, 'detail', NULL, 'note', NULL))
  WHERE reason IS NOT NULL
    AND (reasons IS NULL OR reasons = '[]'::jsonb);

COMMIT;
