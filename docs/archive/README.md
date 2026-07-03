# docs/archive/

Historical / superseded documents kept for provenance. Nothing here is needed for
day-to-day work; the live docs are indexed in [`../README.md`](../README.md).

- `PLAN-v1.md` / `PLAN-v2.md` — the original and v2 master plans, both fully shipped.
  Live progress is tracked in `docs/CHECKLIST.md`; remaining capability work in
  `docs/ROADMAP.md`.
- `REFINEMENT_PLAN.md` — Model Refinement Engine staged plan + progress log
  (Stages 1–9 complete 2026-06-05). The live operating guide is
  `docs/REFINEMENT_README.md`.
- `Areadetails.md` — **deleted 2026-06-12** (recover via git history if ever needed).
  It held the original research drafts for ~30 areas as fenced ```json``` blocks,
  superseded by the per-area JSON files at `data/areas/<id>.json` (migrated by the
  now-archived `tools/archive/migrate-areas.mjs`). Do **not** recreate it — write area
  content to Supabase per CLAUDE.md §18.5.
- `PROGRESS-2026-05-26.md` — session progress log (an identical duplicate,
  `PROGRESS-2026-05-26-session.md`, was deleted 2026-06-12).
- Refactor-era records: `REFACTOR_PLAN.md`, `REFACTOR_CHECKLIST.md`, `REFACTOR_NOTES.md`,
  `AUDIT_NOTES.md`.
- Shipped feature plans: `V3_LISTINGS_PLAN.md`, `JOURNEY_TIMELINE_PLAN.md`,
  `LISTINGS_REVIEW_GROUPS_PLAN.md`.
- One-offs: `SUPABASE_MIGRATION.md`, `STRICT_Codex_Prompt_Remaining_Areas.md`.
- `DATA_ALIGN_PLAN.md` — data-contract / finance-unification plan (was `data-align.md` at
  the repo root). Partly executed (Phase 5, 2026-06-16); the remainder was completed by the
  overhaul program's §10.9 (below). Archived 2026-06-20.
- `plan-2026-07-overhaul/` — **the Master Refactor & Overhaul Program (2026-06-16 →
  2026-07-03), CLOSED with all phases 1–10 complete** (harness 1128/1128). Was the repo-root
  `plan/` directory (itself split from the 832 KB `fable_refactor.md`, whose root pointer stub
  was deleted at archive time — both live in git history). Start at its `README.md` for the
  full phase-by-phase record; the rails it created are enforced by `npm test` and documented
  in CLAUDE.md §16 + `docs/adr/`. Archived 2026-07-03.
