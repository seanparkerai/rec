# Architecture Decision Records

Every guard-rail / rail-change decision (plan §4, `docs/archive/plan-2026-07-overhaul/01-protocol.md`) maps to an ADR here —
the G2 mechanism from `docs/archive/plan-2026-07-overhaul/02-intake.md` §8.1. Copy `0000-template.md`, take the next free
number, and keep it short: a future cold session should understand *why* in one screen.

Rules:
- Numbering is zero-padded, sequential, and never reused. The filename is
  `NNNN-kebab-title.md`.
- `Status` is one of **Proposed / Accepted / Superseded by NNNN / Declined**. An ADR is never
  edited to change its decision — write a new one that supersedes it.
- ADRs 0001–0006 were backfilled on 2026-07-03 (Phase 10.1) from decisions recorded at the time
  in `docs/archive/plan-2026-07-overhaul/03-checklist.md` and the docs — the decision dates in each header are the real ones.
- Shape and field presence are enforced by `tests/contract/docs-consistency.test.js`.
