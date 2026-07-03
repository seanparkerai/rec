# 0001. Rebuild the test net as a tiered harness behind one command

Date: 2026-07-01 (backfilled 2026-07-03, Phase 10.1)

## Status

Accepted

## State / rail

`tools/run-all-tests.mjs` + the `tests/{unit,contract,characterization,integration,pages}/`
tiers — the §5 test re-architecture, a §4.4 foundational change (owner-mandated in
`docs/archive/plan-2026-07-overhaul/01-protocol.md` §5).

## Context

The pre-program net was a single flat runner (`tools/run-intelligence-tests.mjs`) with mixed
concerns: online Supabase assertions could be reported as passing when skipped, there was no
type tier, and suite failures were aggregated in ways that could hide a red child. The overhaul
mandate (§5) required a rebuilt apparatus with honest reporting and a strangler path that never
left the net down.

## Decision

We built `tools/run-all-tests.mjs` (aliased `npm test`) running, in order: Tier-0
`tsc --checkJs` over a **ratcheting** `tsconfig.json` include list (grow-only), the five test
tiers, the semantic responsive lint (justified ratcheting baseline), and the Supabase sync
suite. One honest pass/fail per suite from the child exit code; online assertions are reported
as **skipped, never passing** — they run via the MCP connector per CLAUDE.md §18.2/§18.3.
Mutation testing (Stryker) is opt-in per domain with raise-only `break` floors, never in the
default gate. The old runner became a deprecated forwarder, deleted once nothing references it.

## Consequences

Every commit gates on one command; regressions surface in the tier that owns them. The ratchets
(tier-0 scope, lint baseline, mutation floors) only tighten, so quality is monotonic. Cost: the
harness itself is now a rail — changes to the runner are §16-adjacent and need care, and the
ratchet files must be updated deliberately, never loosened to make a red run green.
