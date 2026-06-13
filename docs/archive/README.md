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
