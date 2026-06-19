# Model Refinement Engine — maintenance README

> Short operational guide for the refinement engine (Stages 1–9, shipped). The full design +
> staged history is archived at `docs/archive/REFINEMENT_PLAN.md`; live schema facts are in
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

## Current production state (2026-06-07)
**Genuine-only inputs (2026-06-07).** The engine now scores **genuine, one-at-a-time
reactions only**. `tools/refinement-run.mjs` filters the log through
`assets/js/listings/reaction-provenance.js#genuineReactions`, dropping administrative
`removed_area` removals **and** en-masse **bulk-burst** rejects (≥ `REACTION_CADENCE.BULK_PER_MIN`
= 6 graded reactions sharing one minute). Before this, ~85% of the log was bulk area/price
sweeps, inflating the baseline reject rate to ~98.7% so **every** value — including the
household's favourite types — showed lift ≈ 1.0 with a scary ~99% reject rate (detached read
99.1% "strong", terrifying the owner even though detached is their #1 liked type). On the
genuine set the baseline is **0.819** and the findings collapse to **8 `forming`, 0 actionable**:
`terraced`, `flat`, `end of terrace` + 5 areas — the values genuinely rejected *above* baseline.
Detached / semi-detached / bungalow / cottage sit *below* baseline (lift < 1) and correctly
**drop out**. The portal's "Your reactions" panel (page-refinement) shows the honest
individual-vs-bulk split via `provenanceSummary`.

### Calibration & expansion (2026-06-19)
The "0 actionable" above had a second, decisive cause: with the genuine baseline at ~0.82 the
**maximum achievable lift is `1/0.82 ≈ 1.22`**, yet the Cautious `MIN_LIFT` was **1.6** (Balanced
1.3) — both unreachable, so nothing could *ever* become actionable on the shipped default. The
`MIN_LIFT` levers were rebased to that real headroom (**Cautious 1.20 / Balanced 1.10 / Aggressive
1.05**); Cautious stays the strict, near-silent floor and a **sensitivity nudge** prompts a switch to
Balanced when strong patterns are forming but held back. The engine was also expanded beyond
`area`/`property_type` to `price_band`/`beds`/`outdoor`/`parking`/`outcode` (reusing the
learned-preferences buckets); these non-geographic dimensions are **display/observation only** —
`scrape_probation` stays `area`/`property_type`. A notify-only **Trends & nudges** lane
(`assets/js/refinement/observations.js`) surfaces lighter observations more regularly. On Luke's live
data this lifts `terraced`/`flat` to ~1.19 (clears Balanced, gated by Cautious) and surfaces a new
`price_band` signal (~93% reject under £300k). Aggregates-mode callers must pre-filter the same way
in SQL. The Hide/Stop buttons stay dormant until an actionable suggestion appears (lift ≥ `MIN_LIFT`,
and the persistence gate is met across consecutive runs).

## Known follow-ups (deferred, documented)
- The §4.1 "Why?" reaction-rate **sparkline + sample rejected listings** (need extra
  `listing_reactions` time-series reads beyond the counts-only `metrics`).
- **"Reconsider?"** auto-badge from re-probe reject rates (the portal already renders a
  `reconsider` status when the scraper sets it).
- **Enable the scheduled run.** `.github/workflows/refinement-run.yml` ships the daily cadence +
  scope-check; it no-ops until the owner adds the `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
  `SUPABASE_DB_URL` repo secrets (optional `REFINEMENT_HOUSEHOLD_ID`). Passing a monotonic
  `SCRAPER_RUN_INDEX` to `fetch-listings.mjs` remains a separate scraper-enforcement step.
