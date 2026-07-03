# 0003. Repair and prune the GitHub Actions estate (Node 22, 11→9 workflows, honest cadence)

Date: 2026-07-03 (step 8.W, owner-directed; backfilled same day, Phase 10.1)

## Status

Accepted

## State / rail

`.github/workflows/*` — a §4.4 foundational rail (deploy + spend).

## Context

CI and the Pages deploy had failed on every push since the Phase-7 merge: the ask tool-contract
test loads the edge function's TypeScript via `--experimental-strip-types`, which needs Node
≥22.6, while `ci.yml`/`pages.yml` ran Node 20. The estate also carried deprecated action
versions, a `*/15` cron that GitHub actually ran ~hourly, and two workflows nothing needed.

## Decision

All workflows moved to Node 22 and current action versions (checkout@v5, setup-node@v5), with
the Node requirement annotated where it is load-bearing. The review-counts cron was re-declared
at its *measured* cadence (hourly offset) instead of the aspirational one. Two workflows were
deleted (git history keeps them): `suzanne-backfill.yml` (its job is now a `fetch-listings`
dispatch input) and `postcodes-accuracy.yml` (dormant diagnostic; the tool remains in
`tools/`). Nine workflows survive, all YAML-parsed and verified working-as-designed.

## Consequences

CI and Pages deploys are green and trustworthy again; the schedule documentation matches
observed behaviour. Cost: any future test that raises the Node floor must update the workflow
matrix in the same change — the annotation in `ci.yml` exists to make that failure mode loud.
