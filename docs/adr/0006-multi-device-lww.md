# 0006. Multi-device conflicts: last-write-wins + the pending-write clobber guard; no version columns

Date: 2026-07-03 (step 9.8, owner-ruled; backfilled same day, Phase 10.1)

## Status

Accepted

## State / rail

`assets/js/storage/core.js` write path (§16 guard-railed) and the sync contract
(docs/SUPABASE_SYNC.md §8).

## Context

Two devices editing the same user-state blob concurrently resolve by timestamp — the later
whole-blob UPSERT replaces the earlier one. The plan's R7 sketched version-column optimistic
concurrency (an expected-version check on every write plus a conflict prompt), which would
touch every `_save` call site in the guard-railed storage layer. The household is a single
couple; every user-state table is a per-household singleton blob; the realistic worst case is
one device's field-set winning within a minute, recoverable by re-entering the losing edit.
Separately, 9.1 had already closed the dangerous variant — a *failed* write being silently
reverted by revalidation.

## Decision

The owner ruled: **last-write-wins is the strategy**, protected by the 9.1 pending-write
journal + revalidation clobber guard and the 9.2 retry drain. Version-column conflict detection
is **declined unless need**. Mechanics, sizing rationale, and revisit triggers (a real
lost-edit report from concurrent editing, membership beyond the couple, or a high-frequency
collaborative blob) are documented in docs/SUPABASE_SYNC.md §8.

## Consequences

No new machinery to maintain; the storage layer stays small and the guard rails untouched. The
accepted risk — a concurrent-edit field-set loss — is documented rather than defended against,
and the revisit triggers define exactly when that trade-off expires.
