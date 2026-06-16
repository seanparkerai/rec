# docs/ — index

Live operating docs for this repo, one line each. Historical material lives in
[`archive/`](archive/). For the rules that govern how work happens here, start at the repo-root
`CLAUDE.md`; for the visual contract, `DESIGN.md`.

| Doc | What it is / when to read it |
|---|---|
| [`CHECKLIST.md`](CHECKLIST.md) | **Live progress tracker — the resume point for any fresh session.** Read first. |
| [`ROADMAP.md`](ROADMAP.md) | v3 capabilities — what has shipped and what remains. |
| [`CONTEXT.md`](CONTEXT.md) | Distilled, sourced research: FTB domain, architecture, Hampshire/Wiltshire region. |
| [`AREAS.md`](AREAS.md) | Generated master location list (`tools/build-areas.mjs`) — never hand-edit. |
| [`DATA_MODEL.md`](DATA_MODEL.md) | Reference for every data shape in the app and where it lives/flows. |
| [`INTELLIGENCE_RULES.md`](INTELLIGENCE_RULES.md) | Reviewable constants + rationale for the affordability/fit/learning engines. |
| [`SUPABASE_SYNC.md`](SUPABASE_SYNC.md) | Operational detail behind CLAUDE.md §18 — the bidirectional sync contract. |
| [`SCHEMA_NOTES.md`](SCHEMA_NOTES.md) | Live Supabase schema facts discovered via MCP (refinement-engine Stage 1). |
| [`REFINEMENT_README.md`](REFINEMENT_README.md) | How the refinement engine fits together and how to operate it. |
| [`ASK.md`](ASK.md) | The Ask assistant — how it works, the tool catalogue, and how to deploy/operate it. |
| [`FETCH_SCHEDULE.md`](FETCH_SCHEDULE.md) | Daily Rightmove fetch — timing, the two cooperating triggers, and DST-safe scheduling. |
| [`USER_PROFILE.md`](USER_PROFILE.md) | Pointer doc: buyer profile lives in Supabase only, never in repo JSON. |

`archive/` holds completed plans, one-off migration instructions, superseded progress logs and
audit snapshots — kept for the record, not needed for day-to-day work. Notably:
`archive/PLAN-v2.md` (the shipped v2 master plan) and `archive/REFINEMENT_PLAN.md` (the shipped
Model Refinement Engine plan, Stages 1–9 — operate it via `REFINEMENT_README.md`).
