# Session log 2026-06-18 — Claude-Code-management optimisation pass

> Split from `fable_refactor.md` (2026-07-01, content unchanged). Directory: [`plan/README.md`](../README.md).

## Appendix — Session log: Claude-Code-management optimisation pass (2026-06-18)

A structural/organisational optimisation pass run **independently of, and prior to,** the Fable
overhaul above (owner decision: this is a precursor; the plan in this file is untouched except for
this appended log). Goal: make the repo maximally legible for AI-assisted management — findability,
clear references, context at every stage, current docs, and the house file-size norm — **without any
behaviour change**. The test harness (`node tools/run-intelligence-tests.mjs`) was green (712 pass,
0 fail) after every phase. All work landed on branch `claude/codebase-optimization-plan-7u74zo`.

- **Phase 0 — doc freshness.** Reconciled the `CLAUDE.md` "Last reconciled" banner to 2026-06-18.
  Left `DATA_MODEL.md` / `REFINEMENT_README.md` provenance dates honest (facts still hold).
- **Phase 1 — navigation & context scaffolding.** Added `docs/REPO_MAP.md` (whole-repo orientation:
  tree, naming conventions, file-size norm, guard-rail pointer); `tools/README.md` (index of the 22
  active tools); per-subtree `README.md` for the substantial `assets/js/*` folders plus
  `assets/js`, `assets/css`, `components`, `data`, `tests`; and purpose headers on 26 previously
  header-less leaf modules (`dashboard/tile-*`, `finances/section-*`, `outreach/*`). Fixed a stale
  note in `tools/archive/README.md`. Added `build` / `area-status` / `sync-areas` npm aliases.
- **Phase 2 — naming/findability (verification, no churn).** The flagged issues were already resolved
  or intentional: the CSS folder is already `pages/listings/`; `savings-editor.js`/`savings-edit.js`
  are distinct and both used; `types.js` is an intentional JSDoc typedef artifact. Convention
  documented in `REPO_MAP.md` rather than mass-renaming working code.
- **Phase 3 — behaviour-preserving code splits (tests as the net).** Split oversized modules behind
  the established shim/coordinator pattern, public import paths unchanged:
  `page-listings.js` 1050→629 (→ `page-listings/{row,progress}.js`),
  `page-report.js` 445→193, `page-property.js` 430→129, `page-area-detail.js` 415→212
  (each → `page-<name>/sections.js`), and `components/outreach.css` 595→9-line `@import` shell over
  five partials. (`page-listings.js`'s residual 629 is its single cohesive `render()` closure, left
  intact by design.)
- **Phase 4 — conventions codified.** Made the ~400-line split-with-a-shim norm explicit in
  `CLAUDE.md` §19 and recorded the page-`<name>/` subtree pattern.
- **Phase 5 — guard-railed storage splits (§16, owner-approved as named phases).** Split
  `storage/listings.js` 648 → `storage/listings/{content,feed,learned}.js` (+ internal
  `_reactions-core.js`) and `storage/user-state.js` 424 →
  `storage/user-state/{singletons,readiness,investments,shortlist}.js`, each behind a re-export shim.
  Public surfaces preserved **byte-for-byte** (Node resolves exactly the original 24 / 29 exports —
  none missing, none leaked). `CLAUDE.md` §16 updated to record the nested shims.

Net effect: no source module outside generated data exceeds the house norm except the one intentional
`render()` closure; every directory and tool is self-documenting; docs reflect reality. No data,
schema, or user-state was touched (pure code/UI/docs refactor — Supabase ceremony correctly skipped).

---
