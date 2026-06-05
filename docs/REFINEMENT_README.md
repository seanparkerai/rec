# Model Refinement Engine — maintenance README

> Short operational guide for the refinement engine (Stages 1–9). The full design +
> staged history is in `docs/REFINEMENT_PLAN.md`; live schema facts are in
> `docs/SCHEMA_NOTES.md`. This file is the "how it fits together / how to operate it" map.

## What it does
The engine watches the household's like/pass/reject feedback (`listing_reactions`) and,
**only when the evidence is statistically well-founded**, surfaces a plain-English
suggestion to stop seeing an **area** or **property type**. It is **notify-only**: the
engine *proposes*; nothing is hidden or removed from the scrape without an explicit,
reversible user action in the UI. No hard deletes, ever.

## The golden rule (never violate)
- The engine originates only `forming` / `actionable` suggestion statuses.
- `confirmed_hide` / `confirmed_scrape` / `dismissed` / `snoozed` are set **only** by the
  user-triggered storage functions in `assets/js/storage/refinement.js`.
- The scraper drops an area **only** if `areas.active === false` (content) or a
  user-written `scrape_probation` row exists. Never automatically.
- `listing_reactions` is append-only and is **never** deleted (verified: no DELETE path).

## Moving parts
| Concern | Where |
|---|---|
| Pure statistical engine (Wilson, lift, BH-FDR, gates, tiers) | `assets/js/refinement/engine.js` |
| Tunable constants + presets | `assets/js/refinement/config.js` (§5 matrix) |
| Persistence planner (idempotent upsert SQL) | `assets/js/refinement/persistence.js` |
| Pure view-models (cards, hide rules, probation copy, preset, snooze expiry) | `assets/js/refinement/view.js` |
| Pure scope maths (probation subtract, re-probe, invariant) | `assets/js/refinement/scope.js` |
| Storage (reads + all user actions) | `assets/js/storage/refinement.js` (+ `storage/listings.js` for learned_preferences) |
| Control panel UI | `pages/refinement.html` · `assets/js/page-refinement.js` · `assets/css/pages/refinement.css` |
| Listings feed integration (display-hide) | `assets/js/page-listings.js` |
| Scheduled evaluation job | `tools/refinement-run.mjs` |
| Scraper enforcement | `tools/fetch-listings.mjs` (`loadProbation` → `probationDropIds`) |
| Scope invariant / drift check | `tools/refinement-scope-check.mjs` |
| Tables | `refinement_suggestions`, `refinement_runs`, `scrape_probation` (engine-managed, untracked); state on `learned_preferences` |

## The two levers (both reversible)
- **Display-hide** (low stakes): "Hide these from view" writes a rule into
  `learned_preferences.overrides.__refinement_hidden` (a **reserved key** skipped by
  `effectiveWeights` and preserved by `recomputeLearnedPreferences`) and flips the
  suggestion to `confirmed_hide`. The feed filters matching listings client-side
  (`listingHiddenByRefinement`), revealed by the existing **Show hidden** toggle. Undo =
  remove the rule + status → `actionable`. **No `listings.status` flip** — `listings` is
  shared, SELECT-only RLS (see SCHEMA_NOTES §4).
- **Scrape-pause** (higher stakes): "Stop searching this area" upserts a
  `scrape_probation` row + flips the suggestion to `confirmed_scrape`. The scraper
  subtracts paused areas; an exploration **re-probe** re-includes one every
  `reprobe_every_runs` runs (gated behind `SCRAPER_RUN_INDEX`). Bring back = delete the
  row + status → `actionable`. **No `areas.active` flip** — `areas` is also SELECT-only
  (SCHEMA_NOTES §5).

Dismiss / snooze write the suggestion status (+ `learned_preferences.dismissals` /
`snoozed_until`). Snooze expiry is handled in the view (`effectiveStatus`).

## Why no `sync_log` audit row from the portal
`sync_log` has no portal INSERT policy, so browser-side actions can't write audit rows.
The durable, reversible record is instead: the suggestion status + the
overrides/probation row + `learned_preferences.updated_at`. Adding portal audit would
need a `sync_log` INSERT policy (its own named migration). The scheduled **engine job**
still logs `actor='system'` run rows.

## Operating it
- **Run an evaluation** (sandbox): build a bundle via Supabase MCP, then
  `node tools/refinement-run.mjs --from-file <bundle>.json --emit-sql <out>.sql` and apply
  the SQL via MCP. CI/REST: set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and pipe
  stdout into `psql`. The job reads the household's persisted **preset** + dismiss memory.
- **Check scope drift**: `node tools/refinement-scope-check.mjs` (REST) or
  `--probation-file <rows>.json` (sandbox). Exits non-zero on paused-but-active drift.
- **Tests**: `node tools/run-intelligence-tests.mjs` (the refinement suites are
  `refinement-engine` / `-persistence` / `-view` / `-scope`).

## Current production state (2026-06-05)
51 `forming` suggestions, **0 actionable** — the ~98.7% reject baseline caps lift at
≈1.01, below `MIN_LIFT` 1.6 (Cautious). The Hide/Stop buttons therefore stay dormant in
production until an actionable suggestion appears (e.g. a looser preset, or taste shift).
The full UI + data paths are verified via live reversible round-trips (see Progress Log).

## Known follow-ups (deferred, documented)
- The §4.1 "Why?" reaction-rate **sparkline + sample rejected listings** (need extra
  `listing_reactions` time-series reads beyond the counts-only `metrics`).
- **"Reconsider?"** auto-badge from re-probe reject rates (the portal already renders a
  `reconsider` status when the scraper sets it).
- **CI scheduling** of `refinement-run.mjs` + `refinement-scope-check.mjs`, and passing a
  monotonic `SCRAPER_RUN_INDEX` to `fetch-listings.mjs` — all `.github/workflows` changes
  (guard-railed, their own named step). The scraper enforcement is **not yet live-run**
  against Apify.
