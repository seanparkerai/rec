# plan/ — The Master Refactor & Overhaul Program (directory)

> **This directory is the overhaul program.** It replaces the single-file `fable_refactor.md`
> (832 KB / 11,068 lines — split 2026-07-01, owner-directed, content preserved). The root
> `fable_refactor.md` is now a pointer stub kept so old references resolve.
>
> **Status (2026-07-01):** §2 kickoff scan **complete** (harness baseline **783 pass / 0 fail**;
> 33 Supabase tables live, all RLS-enabled; listings-pipeline deep-trace, repo drift audit, and
> front-end audit done). Next deliverable: the §7 Q&A intake, then the reality-wins rewrite of each
> segment file + the atomic §9 backlog in `03-checklist.md`, presented for the owner's approval —
> the gate that starts product-code execution.

## How to use this directory (cold-resume protocol)

1. Read **`00-mandate.md`** — the Session Mandate, the ⭐ TOP PRIORITY DIRECTIVE (listings pipeline
   first, mobile-first UI second), and what the product is.
2. Read **`03-checklist.md`** — the living backlog. Resume at the **first unticked step**.
3. Read the **segment file** for the step you're on (plus its listed companion logs/docs).
4. Obey **`01-protocol.md`** for *how* to ship every step (safety, rails, tests, descriptions).
5. Tick the checklist + commit after every merged step, so the next cold session resumes cleanly.

## Files

| File | Contents | Read when |
|---|---|---|
| `00-mandate.md` | Session Mandate · ⭐ TOP PRIORITY DIRECTIVE · prime directive · §0 how-to-use · §1 the product | **Every session start** |
| `01-protocol.md` | §2 kickoff scan · §3 safety & merge protocol · §4 guard-rail authority · §5 test re-architecture mandate · §6 feature-description standard | Before shipping any step; before touching a rail |
| `02-intake.md` | §7 Q&A intake standard · §8 global conventions (+ §8.1 external validation) | Before asking the owner anything; before any UI commit |
| `03-checklist.md` | §9 living checklist — **the resumable backlog spine** | **Every session start**; tick after every merged step |
| `segments/README.md` | §10 segment index · §10.0 safe modular decomposition rule | Before starting any segment |
| `segments/10.1-design-shell.md` | Design system, app shell & navigation | Priority-2 UI overhaul work |
| `segments/10.2-dashboard.md` | Home dashboard (tiles, bands, visuals) | Dashboard work |
| `segments/10.3-finances.md` | Finance calculators, affordability engine, charts | Finance work (⚠ trust surface, §3.10b) |
| `segments/10.4-listings.md` | ★ Listings & property — feed, fit-score, reactions, dossier | **Flagship** — with `logs/2026-07-01-listings-m2m.md` |
| `segments/10.5-areas-map.md` | ★ Areas & map — dossiers, matching, materialisation pipeline | **Flagship** — with `logs/2026-07-01-listings-m2m.md` |
| `segments/10.6-intelligence.md` | Refinement engine, learned preferences, suggestions | Engine work — with `logs/2026-06-19-refinement.md` |
| `segments/10.7-ask.md` | Ask assistant + Supabase Edge Function | Ask work |
| `segments/10.8-profile-journey.md` | Profile, criteria, journey & outreach(-via-Ask) | Profile/journey work |
| `segments/10.9-backend-sync.md` | ★ Backend, storage, data & sync | **Flagship** — any storage/schema/data step |
| `segments/10.10-tooling-tests.md` | Tooling, tests & CI — incl. the new test-apparatus blueprint | Phase-1 test rebuild; any CI change |
| `99-reference.md` | §11 quick reference — repo map, commands, data classes, DoD, owner directives | Quick lookup |
| `logs/2026-06-18-optimisation.md` | Session log: repo legibility optimisation pass | Historical context |
| `logs/2026-06-19-refinement.md` | Session log: refinement-engine recalibration + expansion | Before engine work |
| `logs/2026-07-01-listings-m2m.md` | Session log **+ flagship current-state briefing & known-weakness list** | **Before any listings-pipeline work** |

## Known drift (scan findings, 2026-07-01 — to be folded into the segment rewrites)

The split preserved content **as written on 2026-06-16**; the §2 scan found reality has moved.
Until each segment file is rewritten, read them with these corrections in mind:

- **Counts:** 145 JS modules (not 132) · 53 CSS partials (not 51) · 67 test files (not ~65) ·
  28 tools (not 24) · 14 page surfaces (not 15).
- **Removed since authoring:** the Report/Value-Report feature (2026-06-18); the standalone setup
  wizard (folded into the profile page; `assets/js/setup/*` survives as shared field engine); the
  outreach grid page (folded into Ask Compose/Messages; renderer/store helpers survive). There is
  no `pages/map.html` — the map lives with the areas surface; no `pages/outreach.html`.
- **Added since authoring:** `listing_areas` m2m + origin-area exclusion (see the 2026-07-01 log);
  directional "petal" per-area radius learning (`area_search_tuning`, `radius-tune.mjs`,
  `refinement/radius*.js`); the admin-only `/live-feed/` kiosk; the budget hard-gate; active/inactive
  household areas; `household_review_stats`.
- **Refinement engine:** the 2026-06-19 recalibration means parts of `segments/10.6` (unreachable
  MIN_LIFT, no cadence, area/type-only dimensions) are already fixed — see that log.
- **Docs:** `docs/REPO_MAP.md` still claims 15 pages; reconcile during the overhaul.
