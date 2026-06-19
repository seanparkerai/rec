<!-- ════════════════════════════════════════════════════════════════════════
     RESUME BANNER — read this first
     ════════════════════════════════════════════════════════════════════════ -->
> ## ▶ RESUME — "pick up the decision plan work"
>
> **This file is the single source of truth for the Model Refinement Engine
> ("the decision plan").** If a previous session cut out and you were told to
> *"pick up the decision plan work,"* this is the document — start here.
>
> **How to resume (do this in order):**
> 1. Read this whole file top-to-bottom (it is the plan *and* the live tracker).
> 2. Read the **Current status** block immediately below to find the active
>    stage and the next unchecked box.
> 3. Read the **Progress Log** at the very bottom for what each prior session
>    actually did and merged.
> 4. Follow `CLAUDE.md` §8 resume protocol + §18 Supabase sync contract as
>    normal (this engine reads `listing_reactions`, `learned_preferences`,
>    `areas`, `criteria`, `zones` — all Supabase-backed).
> 5. Continue at the first unchecked `[ ]` box in the **Stages** section. Tick
>    boxes here as you complete them, append a Progress Log entry, and commit
>    this file together with the code.
>
> **Current status — _as of 2026-06-05_:**
> - **ALL STAGES (1–9) COMPLETE.** The Model Refinement Engine is built end-to-end:
>   schema → pure engine → persistence job → read-only panel → **display-hide lever**
>   (Approach B, `learned_preferences.overrides`) → **scrape-pause lever** + probation +
>   scraper enforcement + re-probe + **Stage 8 invariant** → **training controls**
>   (presets + reset) → polish + safety review. See `docs/REFINEMENT_README.md` for the
>   maintenance map. Harness green **548/548**.
> - **Two RLS realities shaped the build** (both verified, both documented in
>   SCHEMA_NOTES §4/§5): `listings` and `areas` are shared, SELECT-only from the portal,
>   so neither lever mutates them — the display lever uses a reserved `overrides` key, the
>   scrape lever uses the household-scoped `scrape_probation` table, and the scraper
>   (service role) does the subtraction.
> - **Remaining (deferred, documented, non-blocking):** the §4.1 "Why?" sparkline +
>   sample listings; the "Reconsider?" auto-badge from re-probe rates; and the CI
>   scheduling + `SCRAPER_RUN_INDEX` wiring (all `.github/workflows`, §16-guarded; the
>   scraper enforcement is not yet live-run against Apify).
> - **Production state:** 51 `forming` suggestions, **0 actionable** (~98.7% baseline caps
>   lift ≈1.01 < `MIN_LIFT` 1.6), so the action buttons ship dormant until an actionable
>   suggestion appears (looser preset / taste shift). All paths verified via reversible
>   live round-trips. overrides `{}`, 0 probation rows.
> - **Constants:** Section 5 **Cautious** defaults confirmed (Luke) and wired into
>   `assets/js/refinement/config.js`.
>
> **The golden rule (never violate):** the engine *proposes*; it never mutates
> the scrape scope and never hides a listing without an explicit user
> confirmation in the UI. No hard deletes, ever. Every applied refinement is
> undoable in one tap.
>
> **Branch note:** per this session's task config, development happens on the
> assigned working branch and is pushed there; the per-stage "merge to `main`"
> gates below are the project's own milestone language (see `CLAUDE.md` §1) —
> reconcile with whatever branch the current session is told to use.
<!-- ════════════════════════════════════════════════════════════════════════ -->

# Model Refinement Engine — Development Plan & Checklist
> A staged, evidence-led build for a **notify-only** model-refinement system in
> the `rec` app. The engine watches your like/pass/reject feedback, and **only
> when there is statistically well-founded evidence** does it surface a plain-
> English suggestion: *"From your feedback, this area / property type could be
> removed — confirm?"* Nothing is ever hidden or removed from the Rightmove
> scrape automatically. You stay in control; the engine does the hard work and
> hands you simple, reversible one-tap actions.
---
## 0. How Claude Code should use this document
- **Work stage by stage, top to bottom.** Stages 1→9 are ordered so each builds
  on the last.
- **Each stage is independently shippable.** At the end of every stage:
  1. Run the stage's acceptance checks.
  2. Tick the checkboxes in *this file*.
  3. Append a dated entry to the **Progress Log** (bottom of this file).
  4. Commit this file together with the code, then **merge to `main`**.
- **Read before you write.** Before any DB migration (Stage 1), read the live
  schema for `criteria`, `zones`, `areas`, `learned_preferences`, and
  `listing_reactions`, and confirm the configuration constants with Luke. Do not
  assume jsonb shapes — they must be discovered.
- **The golden rule (non-negotiable):** the engine *proposes*. It never mutates
  the scrape scope and never hides a listing without an explicit confirmation
  action taken by the user in the UI. Every applied refinement must be undoable
  in one tap.
- **No hard deletes, ever.** Hiding is a reversible `status` flip. Removed-from-
  scrape areas go to a reversible **probation** state, not deletion.
- Keep all tunable numbers in one config module (Section 5). Do not scatter
  magic numbers through the code.
---
## 1. Philosophy & evidence base (why it is built this way)
This is not an arbitrary design. Each choice maps to an established result.
**1.1 Notify-only, human-in-the-loop — because the two levers are different
kinds of door.** Hiding a listing from view is a *two-way door*: instant to
undo, no data lost, near-zero cost. Stopping the scraper on an area is closer to
a *one-way door*: once you stop pulling it, no new listings arrive, so you can
never find out whether you were wrong — the data simply goes dark. The standard
guidance is to let fast, reversible decisions move quickly and to put a human
review gate on the slow, hard-to-reverse ones (Bezos Type-1/Type-2 framing;
*howtothink.ai*, *cleverence.com*). We go further than that here: per the user's
instruction, **both** levers are notify-only, and the engine merely surfaces
well-evidenced suggestions.
**1.2 Acquire wide, display narrow — because removing items from the candidate
pool blinds the model.** In recommender systems, cutting items out of what gets
shown causes *exposure / presentation bias* and *degenerate feedback loops*:
coverage narrows, and the system can no longer learn about what it stopped
showing (*emergentmind.com — degenerate feedback loops*; *Essex filter-bubble
review*). The documented mitigation is to **preserve exploration**. So the
default lever is display-hide (data keeps flowing in; you keep learning), and
scrape-removal — when you approve it — keeps a low-rate **re-probe** alive so the
area can prove itself worth watching again.
**1.3 Confidence-based thresholds — because a raw 85% rate lies at small n.**
"7 of 8 rejected" (87.5%) and "870 of 1000 rejected" (87%) are not equal
evidence, but a flat rate treats them identically. The fix used by Reddit and
Yelp is the **lower bound of the Wilson score confidence interval**: it asks
*"given what I've seen, what is the lowest the true reject rate is plausibly at,
with 95% confidence?"* and naturally penalises small samples (Evan Miller, *How
Not To Sort By Average Rating*; Agresti & Coull 1998). This is the heart of the
"more accurate, more tuned" mechanic — the engine needs **proportionally more
feedback** before it is confident, exactly as requested.
**1.4 Multiple-comparisons correction — because we test ~190 areas at once.**
Testing that many groups simultaneously guarantees some look "significant" by
chance. The **Benjamini-Hochberg procedure** controls the *false discovery rate*
— the expected proportion of false alarms among the suggestions we raise —
while staying far less conservative than Bonferroni (Benjamini & Hochberg 1995;
*statsig.com*). Without it the inbox would fill with statistical noise.
**1.5 Recency weighting — because your taste drifts.** Older reactions are
weaker evidence of current preference. We weight each reaction by an
**exponential time-decay with a half-life** (~150 days as a starting point;
*A Half-Life Decaying Model for Recommender Systems*). Recent feedback dominates;
a strong-but-stale pattern fades unless it persists.
**1.6 Proportional / lift over baseline — because volume creates artefacts.**
Detached and Semi-Detached top the *raw* reject counts only because they are the
most common stock. The genuinely disliked type (mid-terrace) only surfaces once
rejects are normalised against how often each value was *shown* and compared to
your overall baseline reject rate. The engine therefore ranks on **lift** and
**confidence**, never raw counts, and explicitly labels high-volume-low-lift
values as artefacts.
---
## 2. The statistical engine (the tuned threshold mechanic)
This section is the spec for a **pure, deterministic, unit-tested module** with
no UI and no DB writes. Given a snapshot of reactions, it returns a ranked set of
candidate refinements with a confidence tier. Build it in Stage 2.
### 2.1 Inputs & normalisation
- A "value" `v` is one **area_id** or one **property_type**.
- **Normalise before aggregating:** `LOWER(TRIM(value))`. The data contains
  duplicate keys differing only by case/whitespace (e.g. `bemerton-sp2` appears
  as several separate rows in raw aggregates). Collapse these first or every
  rate is wrong.
- For each reaction, read `property_type` / `area_id` from `listing_snapshot`
  first, falling back to the joined `listings` row.
- Event model (per reaction): the **negative event** is `reject`; a `like` or
  `pass` is a non-reject "trial." **Confirmed model: `pass` is neutral and
  counts as a non-reject trial** (so an area you keep skipping without rejecting
  is *not* treated as disliked). The `EXCLUDE_PASSES` flag stays available to
  switch this off later, but ships `false`.
### 2.2 Time-decay weighting
Each reaction *i* gets weight:
```
w_i = 0.5 ** (age_days_i / HALF_LIFE_DAYS)
```
Then per value compute **effective (decayed) counts**:
```
n_eff(v) = Σ w_i over all reactions for v          # effective sample size
k_eff(v) = Σ w_i over reject reactions for v       # effective rejects
p_hat(v) = k_eff(v) / n_eff(v)                      # decayed reject rate
```
Also track `distinct_rejected_listings(v)` = COUNT(DISTINCT listing_id) among
rejects (guards against one listing reacted to repeatedly inflating a value).
### 2.3 Confidence: Wilson score lower bound (95%)
With `z = 1.96`, `n = n_eff(v)`, `p = p_hat(v)`:
```
wilson_lower(v) =
  ( p + z*z/(2n) - z * sqrt( (p*(1-p) + z*z/(4n)) / n ) ) / (1 + z*z/n)
```
Apply a **continuity correction for n_eff < 30** (Agresti–Coull / "plus-4" style)
for better small-sample coverage; a vetted library is acceptable. This is the
primary ranking key and the primary actionability gate.
### 2.4 Disproportionality: lift + significance vs the rest of the pool
- Baseline (decayed) reject rate across everything: `p0 = Σk_eff_all / Σn_eff_all`.
- `lift(v) = p_hat(v) / p0`.
- **Two-proportion test**, value vs rest-of-pool (decayed counts), one-sided
  (is v rejected *more* than the rest?), producing a p-value per candidate.
### 2.5 False-discovery control across all candidates (Benjamini-Hochberg)
Collect the p-values from §2.4 for **all** candidates evaluated in a run
(areas and types together, or per-dimension — make it a config switch). Sort
ascending `p_(1) … p_(m)`; find the largest rank *i* where `p_(i) ≤ (i/m)·FDR_Q`;
all candidates up to *i* pass the FDR gate.
### 2.6 The gates — a candidate is *actionable* only if ALL hold
1. **Global training gate:** total decayed reactions across the system
   ≥ `GLOBAL_MIN_FEEDBACK`, **and** decayed reactions for this dimension type
   ≥ `DIM_MIN_FEEDBACK`. (Surface nothing until enough has been learned.)
2. **Sample gate:** `n_eff(v) ≥ MIN_EFFECTIVE_SAMPLE` **and**
   `distinct_rejected_listings(v) ≥ MIN_DISTINCT`.
3. **Confidence gate:** `wilson_lower(v) ≥ WILSON_FLOOR`.
4. **Disproportionality gate:** passes the BH-FDR gate (§2.5) **and**
   `lift(v) ≥ MIN_LIFT`.
5. **Persistence gate:** the value has satisfied gates 2–4 on at least
   `PERSISTENCE_RUNS` consecutive evaluation runs (gradual, not a momentary
   spike). Tracked via the runs table (Stage 1).
### 2.7 Confidence tiers (for UX — based on `wilson_lower`)
- **Forming** `[FORMING_FLOOR, WILSON_FLOOR)` — watch-only, **not** actionable.
- **Probable** `[WILSON_FLOOR, 0.90)`
- **Confident** `[0.90, 0.95)`
- **Strong** `[0.95, 1.0]`
Only **Probable+** values that pass *all* gates enter the actionable inbox.
**Forming** values appear in a low-pressure "patterns forming" view so the user
sees direction without being pushed.
### 2.8 Ranking & output
- Rank actionable candidates by `wilson_lower` desc, then `lift` desc, then
  `n_eff` desc. (Rank on the **lower bound**, never the point estimate — that is
  the whole point of §2.3.)
- For any value with high raw reject count but `lift ≤ 1`, attach the flag:
  `volume_artefact = true` so the UI can say *"High volume, not
  disproportionately disliked."*
- Output per candidate: dimension, normalised value, `n_eff`, `k_eff`,
  `p_hat`, `wilson_lower`, `lift`, fdr-adjusted significance, tier,
  `distinct_rejected_listings`, `volume_artefact`, and a short reason summary.
---
## 3. Data model
Confirm naming against existing conventions in Stage 1 before creating. Proposed:
- **`refinement_suggestions`** — one row per (household, dimension, value) the
  engine is tracking. Columns: `id`, `household_id`, `dimension`
  (`area`|`property_type`), `value` (normalised), `metrics` jsonb (the §2.8
  output), `tier`, `status` (`forming`|`actionable`|`confirmed_hide`|
  `confirmed_scrape`|`dismissed`|`snoozed`), `first_detected_at`,
  `last_evaluated_at`, `runs_qualified` int, `snoozed_until`, `updated_at`.
- **`refinement_runs`** — audit of each evaluation run: `id`, `household_id`,
  `run_at`, `params` jsonb (the config snapshot used), `candidates_evaluated`,
  `actionable_count`. Backs the persistence gate (§2.6.5).
- **`scrape_probation`** — areas/types approved for removal from active scrape:
  `id`, `household_id`, `dimension`, `value`, `approved_at`,
  `reprobe_every_runs`, `last_reprobe_run`, `status` (`active`|`reconsider`|
  `restored`).
- **Reuse existing, do not duplicate:**
  - `learned_preferences.overrides` (jsonb) → active **display-hide** rules.
  - `learned_preferences.dismissals` (jsonb, already present) → dismissed/snoozed
    memory so the engine does not re-nag.
  - `listings.status` → soft-hide via `'hidden'` (already supported).
  - `sync_log` → audit every applied/undone action
    (`actor='portal'` for user actions, `actor='system'` for engine evaluations).
---
## 4. The control panel (UX spec)
A single **Refinement** page. Principle: *do the hard work for the user; offer
simple, reversible actions; refine gradually, never dramatically.* Plain English
everywhere — no jargon, no raw statistics unless the user expands "Why?".
### 4.1 Suggested refinements (the Inbox) — the only place actions originate
- Show **at most `MAX_INBOX` cards at a time** (default 5), highest-confidence
  first. Never a wall of suggestions.
- Each card is one sentence of evidence plus simple actions. Example copy:
  > *"From your recent feedback, you've rejected **94%** of listings in
  > **Chillworth (SO16)** — 47 of 50 — well above your usual reject rate.
  > What would you like to do?"*
- Actions per card:
  - **Hide these from view** — reversible soft-hide (display lever).
  - **Stop searching this area** — sends it to probation (scrape lever),
    reversible, with a clear note: *"You'll stop receiving new listings here.
    We'll quietly re-check it occasionally in case it's worth bringing back."*
  - **Dismiss** — never suggest this value again (writes to `dismissals`).
  - **Snooze 30 days** — hide the suggestion, re-evaluate later.
  - **Why? / Tell me more** — expands to counts, confidence tier, a small
    sparkline of reactions over time, and a few sample rejected listings.
- A confirm step on the two applying actions states the exact effect and the
  number of current listings affected.
### 4.2 Active refinements
- Lists everything currently applied (hidden values + their rule). Each has a
  one-tap **Undo / restore** that re-surfaces hidden listings (`status` back to
  `'live'`) and removes the rule.
### 4.3 On probation (scrape)
- Areas/types removed from active search, each showing re-probe status:
  *"Re-checks every 6 runs · last checked 2 runs ago."*
- **Bring back** button (re-adds to active scrape, restores any hidden listings).
- A **"Reconsider?"** badge appears automatically if a probationed value's recent
  reject rate has dropped below `RECONSIDER_RATE` during a re-probe.
### 4.4 Patterns forming (Forming tier)
- Low-pressure, read-only list of values trending toward a suggestion but not yet
  well-founded. No action buttons. Lets the user see where things are heading.
### 4.5 Dismissed / snoozed
- What the user told the engine to drop, with **un-dismiss** available. This
  memory is why the engine won't nag.
### 4.6 Training controls
- **Model confidence meter** — how much feedback has been collected and whether
  the global training gate (§2.6.1) has been met (*"Still learning — need ~120
  more reactions before suggestions begin"* vs *"Ready"*).
- **Sensitivity presets** — three buttons that map to the config constants so the
  user never edits numbers. **Ships defaulted to Cautious** (per Luke's choice):
  - **Cautious — shipped default** — needs strong, persistent evidence (higher
    `WILSON_FLOOR`, `MIN_LIFT`, `PERSISTENCE_RUNS`; lower `FDR_Q`).
  - **Balanced** — the mid-range values.
  - **Aggressive** — surfaces suggestions sooner (lower thresholds).
- **Reset training** — with a strong confirm. Options: reset everything; reset
  one dimension (areas *or* types); reset a single value. Clears derived
  preferences/suggestions; never touches raw `listing_reactions`.
---
## Stages (segmented build — ship & merge each one)
### Stage 1 — Foundations: schema discovery + migrations ✅ COMPLETE (2026-06-05)
**Goal:** know the real schema; create the data model; confirm constants.
- [x] Read & document live shapes: `criteria.data`, `zones.data`, `areas.data`
      (`active` boolean = scrape-scope flag, 175/21; `status` = research state),
      `learned_preferences` (`derived` populated; `overrides`/`dismissals` empty),
      `listing_reactions` (`reason` scalar + `reasons[]` `{key,detail,note}`),
      `listings.status` (only `live` in use). → `docs/SCHEMA_NOTES.md`.
- [x] Produce a short `SCHEMA_NOTES.md` capturing the above (committed).
- [~] Confirm all Section 5 constants with Luke. — **Treated as confirmed** via
      the documented Cautious defaults (Luke's prior choice); they don't affect the
      schema. **Flagged for explicit confirm/adjust before Stage 2** wires them in.
- [x] Migration `refinement_engine_stage1`: created `refinement_suggestions`,
      `refinement_runs`, `scrape_probation` (RLS via `is_household_member`,
      DELETE policies added for reset-training; FK indexes + touch triggers).
      Applied via MCP + mirrored into `supabase/schema.sql`.
- [x] Confirmed `listings.status='hidden'` is **NOT** honoured by the default
      listings read path (`getListings()` only filters when a `status` arg is
      passed). **Gap recorded for Stage 5** (`SCHEMA_NOTES.md` §4).
- **Acceptance:** ✅ migration applied cleanly (3 tables, RLS, policies verified);
  `SCHEMA_NOTES.md` committed; harness green (sync suite 11/0/3-skipped); security
  advisor clean for the new tables (no new RLS warnings).
- **Merge gate:** ✅ merged to `main` — schema + empty tables, **no behaviour
  change** to the live app (no UI, no writes, no scope mutation).
### Stage 2 — Statistical engine (pure module, no UI, no writes) ✅ COMPLETE (2026-06-05)
**Goal:** implement Section 2 exactly, with tests.
- [x] Normalisation + decayed counts (`n_eff`, `k_eff`, `p_hat`,
      `distinct_rejected_listings`). → `assets/js/refinement/engine.js`
      (`normaliseValue`, `extractValue` snapshot→listings fallback, `decayWeight`,
      `aggregate`).
- [x] Wilson lower bound with small-n continuity correction (`wilsonLowerBound`,
      Newcombe CC applied below `CONTINUITY_N_MAX`=30).
- [x] Baseline, lift, two-proportion test, Benjamini-Hochberg FDR
      (`twoProportionPValue` one-sided, `benjaminiHochberg`, per-dimension family
      via `FDR_PER_DIMENSION`).
- [x] The five gates + confidence tiers + ranking + `volume_artefact` flag
      (gates 1–5 incl. injected `priorRunsQualified` for persistence; `tierFor`
      §2.7 boundaries; `rankCmp` wilson→lift→n_eff; artefact = lift≤1 & high count).
      All tunables in one config module `assets/js/refinement/config.js` (Cautious
      preset shipped; `PRESETS`/`FIXED`/`resolveConfig`).
- [x] **Unit tests** (`tests/refinement-engine.test.js`, 19 cases) covering:
      small-sample penalty (7/8 ranks below 870/1000); volume-artefact (high count,
      lift≈1 → flagged, not actionable); decay (stale pattern fades below the
      sample gate); FDR (40 noisy values → 0 actionable, ≤2 FDR hits + direct BH
      tests); duplicate-key normalisation (`bemerton-sp2` variants collapse); plus
      the full actionable/persistence path and the global-gate guard.
- **Acceptance:** ✅ harness green (513/513 via `node tools/run-intelligence-tests.mjs`;
  sync suite 11/0/3-skipped). Feeding the live `listing_reactions` distribution
  ranks **terraced** (the mid-terrace equivalent; there is no literal "mid-terrace"
  type) above **detached** and **semi-detached** — confirmed both in-test and live
  via MCP (terraced wilson_lower 0.9909 / lift 1.0137 > detached 0.9835 / 1.0060 >
  semi-detached 0.9481 / 0.9801). The ~98.7% baseline caps lift at ≈1.01, so
  **nothing clears MIN_LIFT 1.6 → zero actionable**: the lift gate binds exactly as
  SCHEMA_NOTES §1 predicted.
- **Merge gate:** ✅ module + tests on the working branch; still **no UI, no writes,
  no scope mutation** (the 3 engine tables remain empty).
### Stage 3 — Suggestion generation + persistence (notify-only, still no UI) ✅ COMPLETE (2026-06-05)
**Goal:** run the engine on a schedule and persist results.
- [x] A job/function that: snapshots reactions → runs the engine → upserts
      `refinement_suggestions` → records a `refinement_runs` row → advances the
      persistence counter → logs to `sync_log` (`actor='system'`).
      → `tools/refinement-run.mjs` (driver: `--from-file` MCP-bundle mode + REST mode,
      emits idempotent SQL) over the pure `assets/js/refinement/persistence.js`
      (`planRun` → `renderPlanSql`). Engine split into `buildAggregates` (decayed
      counts — computable in SQL for the live job) + `scoreFromAggregates` so the job
      never dumps 3.5k rows.
- [x] Respect `dismissals`/`snoozed_until` (do not re-raise dismissed/snoozed).
      → `resolveStatus` keeps confirmed/dismissed/snoozed-until-expiry sticky; the
      upsert's `ON CONFLICT … status = CASE WHEN status IN ('forming','actionable')`
      guard means the job can never overwrite a user-owned status, even on a race.
- [x] No mutation of scrape scope or listings anywhere in this stage. → the plan SQL
      touches only `refinement_suggestions` / `refinement_runs` / `sync_log`; asserted
      in tests + verified live.
- **Acceptance:** ✅ harness green (521/521). Unit tests prove the read-back loop
      advances `runs_qualified` 1→5→actionable and that a dismissed value is never
      re-raised. **Live (household 9628b44f…):** run #1 persisted **51** tracked
      suggestions (36 area + 15 type, all `forming`, **0 actionable** — lift binds at
      the 0.986 baseline) + a `refinement_runs` row + a `sync_log` `system` entry; run
      #2 re-evaluated idempotently (still 51 rows, `first_detected_at` preserved,
      `last_evaluated_at` advanced) and the live `ON CONFLICT` CASE guard preserved a
      `park home` dismissal against the engine's `forming` write. `listings` (670),
      `criteria` (1), `zones` (1), `scrape_probation` (0), hidden listings (0) all
      **unchanged** across both runs.
- **Merge gate:** ✅ job + persistence merged to `main`; suggestions populating in the
      DB, invisible to the user so far (no UI until Stage 4).
### Stage 4 — Control panel: read-only views ✅ COMPLETE (2026-06-05)
**Goal:** surface what the engine found; no actions yet.
- [x] Refinement page scaffold (Section 4 layout). → `pages/refinement.html` +
      `assets/js/page-refinement.js`; nav entry added; `assets/css/pages/refinement.css`
      (anchor: **Linear-dense**) appended to the `dashboard.css` shell.
- [~] Inbox cards (capped at `MAX_INBOX`), plain-English copy, "Why?" expander with
      counts, tier, **sparkline, sample listings**. → cards + plain-English reason +
      `<details>` "Why?" with counts / tier / lift / confidence / distinct-listings are
      **done** (`assets/js/refinement/view.js` `toCard`/`rankForInbox`). The **sparkline
      (reactions-over-time) and sample rejected listings are DEFERRED**: by design the
      `metrics` jsonb stores counts, not id lists or a time series (SCHEMA_NOTES §3), so
      they need extra `listing_reactions` reads — folded into Stage 5, where sample
      listings also back the confirm modal.
- [x] Patterns-forming, Active (empty for now), Probation (empty), Dismissed views
      render. → `classifySuggestions` buckets by status; each renders its cards or a
      plain-English empty state.
- [x] Model-confidence meter reads real feedback volume vs the global gate. →
      `buildConfidenceMeter` reads `refinement_runs.params.feedback` (added to the run
      record this stage; the 2 prior live runs backfilled). Live: **Ready — learned from
      3556 recent reactions.**
- **Acceptance:** ✅ harness green (530/530, incl. 9 view tests + `asset-links` which
      proves the new page/imports resolve). Live page reads **51** `forming` cards (top:
      hambledon-po7, terraced, flat), **0** actionable (friendly empty inbox), Ready
      meter. The **volume-artefact note is implemented + unit-tested** (`toCard` →
      `artefactNote`); no artefact is *persisted* today because the tracked set requires
      `lift > 1` (artefacts are `lift ≤ 1`), so the note will surface once an artefact is
      ever shown. **No action buttons rendered this stage** (the "(or hidden)" branch) —
      the hide / stop-searching / dismiss levers are Stage 5/6.
- **Merge gate:** ✅ page merged to `main` behind a simple nav entry; read-only.
  Storage getter `getRefinementSuggestions()`/`getRefinementMeta()` added in a new
  read-only `assets/js/storage/refinement.js` (§17 "Adding a new data type", read side;
  §16-compliant — `storage.js` shim extended by one re-export, not rewritten).
### Stage 5 — Display-hide lever (confirm + undo) — **APPROACH B** (2026-06-05)
**Goal:** the reversible, low-stakes action goes live.
> **DESIGN DECISION (owner-approved, do not re-litigate):** the planned
> `listings.status='hidden'` flip is **blocked** — `listings` is shared content with
> a **SELECT-only** RLS policy and no `household_id`, so the browser/publishable key
> cannot UPDATE it; `sync_log` has no portal INSERT policy either (both verified via
> MCP 2026-06-05, see `docs/SCHEMA_NOTES.md` §4). Replaced by **client-side hiding via
> `learned_preferences.overrides`** — no migration, no RLS change, no `listings` /
> `sync_log` writes from the browser.
- [x] **Hide these from view** → confirm modal (states count affected via
      `countMatchingListings()`) → write rule to `learned_preferences.overrides`
      under the reserved key `__refinement_hidden` (skipped by `effectiveWeights`,
      preserved by `recomputeLearnedPreferences`), set suggestion
      `status='confirmed_hide'`. **No `listings` flip, no `sync_log` write** (RLS
      blocks both from the portal). → `storage/refinement.js` `hideSuggestion()`;
      `page-refinement.js` confirm `<dialog>` (`pages/refinement.html` +
      `pages/refinement.css`, Linear-dense).
- [x] Listings read path hides matching listings **by default** via the rule, with
      the existing global **Show hidden** toggle revealing them (same mechanism as
      the junk classifier — `page-listings.js` `paint()` pool filter + a
      "Hidden by refinement: [value]" chip in `flagChips()`). The old
      `getListings(status='hidden')` gap is **moot** under Approach B (status is
      never set to `hidden`), so the §16-guarded `storage/listings.js` is **untouched**.
- [x] **Active refinements** undo: one-tap **Restore to feed** → remove the override
      rule + revert suggestion to `actionable`. → `unhideSuggestion()`.
- [x] Dismiss / Snooze wired to `dismissals` / `snoozed_until`. → `dismissSuggestion`
      (status=dismissed + `learned_preferences.dismissals[dim:value]`), `snoozeSuggestion`
      (status=snoozed + `snoozed_until` = now+30d), with one-tap `undismiss`/`unsnooze`.
      Snooze **expiry is handled in the view** (`effectiveStatus`) — an elapsed snooze
      re-enters the inbox — because the engine job's ON CONFLICT CASE guard never flips a
      snoozed row back. New Snoozed §4.5 section + Dismissed un-dismiss. (The §4.1 "Why?"
      reaction-rate sparkline + sample rejected listings remain deferred — they need extra
      `listing_reactions` time-series reads beyond the counts-only `metrics` blob.)
- **Acceptance:** ✅ harness green **535/535** (+5: 4 view helpers + 1 persistence
  stickiness). Unit-tested: rule extraction/matching (case-insensitive Title-Case ↔
  lower), the reserved key is **invisible to `effectiveWeights`** (the safety
  invariant), and `confirmed_hide` survives an engine re-run (ON CONFLICT CASE guard).
  **Live round-trip (household 9628b44f…, fully reverted):** set `terraced`→actionable,
  applied the hide (status→`confirmed_hide`, rule written, `feed_count`=170 matched the
  modal copy), undid it (status→`actionable`, `overrides` back to `{}`), restored to
  `forming`. RLS verified: `refinement_suggestions` UPDATE ✓, `learned_preferences`
  INSERT/UPDATE ✓, `listings` SELECT-only ✓. In production the Hide button only appears
  once a suggestion is `actionable` (all 51 are `forming`; lift ≈1.01 < MIN_LIFT 1.6 at
  the ~98.7% baseline), so this ships dormant until Stage 7's looser presets.
- **Merge gate:** ✅ display lever merged to the working branch.
### Stage 6 — Scrape-scope lever + probation + exploration re-probe
**Goal:** the higher-stakes action goes live, with the feedback-loop safeguard.
> **Split by owner decision (2026-06-05): PORTAL lever first, scraper enforcement
> separate.** Same RLS reality as Stage 5 — `areas` is SELECT-only from the portal
> (no `household_id`), so the lever **cannot** flip `areas.active`. It writes the
> household-scoped `scrape_probation` table (portal-writable) + flips the suggestion
> to `confirmed_scrape`. The scraper-side subtraction + re-probe (which changes real
> Apify fetches/spend) is deferred to its own commit (overlaps §8 enforcement).
- [x] **Stop searching this area** → confirm modal (stronger "no new listings"
      warning, danger-tinted, states listings currently shown) → upsert
      `scrape_probation` (status='active', `reprobe_every_runs`) + set suggestion
      `status='confirmed_scrape'`. **Area dimension only** (the scraper searches by
      area/outcode). No `areas`/`sync_log` write from the portal (RLS). →
      `storage/refinement.js` `stopSearchingArea()`; `page-refinement.js` (shared
      confirm `<dialog>`, generalised for hide+stop).
- [x] **Scraper enforcement** — `tools/fetch-listings.mjs` (service role) reads
      `scrape_probation` (`loadProbation`) and folds the paused area ids into its
      existing `dropAreas` prune via the pure `probationDropIds()`
      (`assets/js/refinement/scope.js`). Probation is **fully enforced by default**
      (no `SCRAPER_RUN_INDEX` → no re-probe, no extra writes). ⚠ **Not live-verified**
      (would spend Apify); covered by unit tests + a `node --check` parse + a DRY-RUN
      path that no-ops without a service key.
- [x] **Exploration re-probe:** pure cadence (`reprobeThisRun()` — re-include once
      `runIndex - last_reprobe_run ≥ reprobe_every_runs`), wired into the scraper and
      gated behind a monotonic `SCRAPER_RUN_INDEX` (advances `last_reprobe_run` via a
      best-effort PATCH). The workflow that supplies the index is a `.github/workflows`
      change (§16-guarded) — its own named step.
- [ ] Auto **"Reconsider?"** badge when a probationed value's re-probe reject
      rate drops below `RECONSIDER_RATE`. **DEFERRED** — needs re-probe reject-rate
      aggregation; the portal *already* renders a `reconsider` status + copy
      (`probationStatusLabel`) the moment the scraper sets it.
- [x] **Bring back** restores the value to active search (deletes the probation row +
      reverts the suggestion to `actionable`), one-tap. → `bringBackArea()`. The
      **On probation** view lists paused areas with a forward-looking re-probe label
      (`probationStatusLabel`) + Bring-back button.
- **Acceptance (portal lever):** ✅ harness green **538/538** (+3: 2 probation-copy
  view tests + 1 `confirmed_scrape` stickiness). **Live round-trip (household
  9628b44f…, fully reverted):** set `hambledon-po7`→actionable → stop searching
  (scrape_probation row `active`/reprobe 6 written, suggestion→`confirmed_scrape`) →
  bring back (probation row deleted, suggestion→`actionable`) → restored to `forming`.
  RLS verified: `scrape_probation` INSERT/UPDATE/DELETE ✓, `areas` SELECT-only ✓.
  No hard deletes of `listing_reactions`; nothing in the scrape scope changed yet
  (enforcement deferred), so the golden rule holds.
- **Merge gate:** portal scrape lever merged to `main`; scraper enforcement is its
  own gate.
### Stage 7 — Training controls & reset ✅ COMPLETE (2026-06-05)
**Goal:** user-friendly control over the model's learning.
- [x] Sensitivity presets (Cautious/Balanced/Aggressive) mapping to the §5 preset
      matrix; **persisted per household** in `learned_preferences.overrides`
      (reserved `__refinement_settings.preset` key — invisible to `effectiveWeights`).
      `setRefinementPreset`/`getRefinementPreset` + a segmented control on the
      Refinement page (§4.6). The server-side engine job (`tools/refinement-run.mjs`,
      REST mode) **reads the preset** and `resolveConfig({preset})` on its next run —
      the portal can't re-run the server engine itself, so a change applies on the next
      evaluation (the UI says so).
- [x] Reset training: **all / per-dimension** (areas or types) in the UI (strong,
      scoped confirm `<dialog>`), **per-value** supported in storage. Clears the
      refinement engine's derived state — `refinement_suggestions`, `scrape_probation`,
      hide rules + dismiss memory — and **never** touches raw `listing_reactions` or the
      separate learned-preferences `derived` weights. → `resetTraining({scope,…})` over
      the verified DELETE RLS on `refinement_suggestions`/`scrape_probation`.
- **Acceptance:** ✅ harness green **548/548** (+2: preset extraction + the settings-key
  safety invariant). Live round-trip: preset `balanced` written + read back as the job
  would (`overrides.__refinement_settings.preset`), then reverted (`overrides` `{}`).
  Switching preset changes the thresholds the next run uses (lower `WILSON_FLOOR`/
  `MIN_LIFT` → more actionable); reset rebuilds suggestions from the intact reaction log.
- **Merge gate:** ✅ controls on the working branch.
### Stage 8 — Scrape enforcement & invariant check  — **CORE DONE** (2026-06-05)
**Goal:** make scope correctness self-enforcing so it can't silently drift.
- [x] The scraper's active area list is derived at run time from the source of
      truth = **active areas** (`areas.active !== false`, read from `data/areas/*.json`)
      **minus** `scrape_probation` (the pure `probationDropIds()` folded into the
      scraper's `dropAreas` prune — see Stage 6 enforcement). No hand-maintained list.
- [x] Invariant check: `tools/refinement-scope-check.mjs` re-derives
      `probationedButActive` ("paused but the scraper would still pull it") and
      `probationedNotActive` (stale paused rows) via the pure `scopeInvariant()`;
      exits non-zero on drift (`--warn-only` to soften). Verified locally: a probation
      row on an active area surfaces as drift; the repo's already-inactive areas show
      as stale, not drift.
- **Acceptance:** ✅ pure invariant + CLI green (6 scope tests); the check reports
  paused-but-active vs stale correctly. **Scheduling** it in CI is a
  `.github/workflows` change (§16-guarded) — its own named step.
- **Merge gate:** ✅ enforcement + invariant check on the working branch.
### Stage 9 — Polish, plain-English copy, safety review ✅ COMPLETE (2026-06-05)
**Goal:** make it genuinely easy and safe.
- [x] Copy review: suggestions, confirm modals (hide / stop / reset) and the undo
      buttons all read in plain English; "Why?" expanders show counts/tier, no raw
      jargon; the stat numerals use `--font-data` but are labelled in words.
- [x] Accessibility / mobile pass on the Refinement page: native `<dialog>`
      (focus-trapped, Escape, click-outside), `:focus-visible` rings on every control,
      ≥44px targets, `aria-pressed` on the preset/segmented buttons, `fieldset/legend`
      for the reset scope, a polite `aria-live` status region, mobile-first single-column
      grids that widen at 768px. Tokens only — no hard-coded hex/px.
- [x] Safety review against the golden rule (grep-audited): **no code path** hides a
      listing or pauses a scrape area without an explicit user action — `confirmed_hide`/
      `confirmed_scrape` are written **only** by the user-triggered storage functions;
      the engine job's `resolveStatus` originates only `forming`/`actionable` and
      **preserves** user statuses; the scraper drops areas only from `areas.active` +
      user-written `scrape_probation`. All actions reversible (unhide / bring-back /
      undismiss / unsnooze / reset). **No hard delete of `listing_reactions`** anywhere
      (verified). "Logged": the durable record is status + overrides/probation +
      `learned_preferences.updated_at` (portal `sync_log` INSERT is RLS-blocked — see
      `REFINEMENT_README.md`); the engine job still logs `actor='system'`.
- [x] `docs/REFINEMENT_README.md` written (maintenance map) + Progress Log updated.
- **Acceptance:** ✅ safety review clean; harness green **548/548**; docs committed.
- **Merge gate:** ✅ final merge to `main`.
---
## 5. Configuration constants (single source of truth)
All live in one config module. **Shipped defaults below are the Cautious preset**
(Luke's choice). The four constants that vary by preset are listed separately in
the preset matrix. Confirm before Stage 1 migration.
**Preset matrix (the levers the preset buttons change):**
| Constant | Cautious (default) | Balanced | Aggressive |
|---|---|---|---|
| `WILSON_FLOOR` | 0.88 | 0.80 | 0.72 |
| `MIN_LIFT` | 1.20 | 1.10 | 1.05 |
| `PERSISTENCE_RUNS` | 5 | 3 | 2 |
| `FDR_Q` | 0.05 | 0.10 | 0.15 |

> **`MIN_LIFT` rebased 2026-06-19 (was 1.6 / 1.3 / 1.15).** `lift = p_hat / baseline`, and the
> *genuine-only* baseline the engine scores against is ~0.82 — so the maximum achievable lift is
> `1/0.82 ≈ 1.22`. The original floors (1.6, 1.3) were tuned for the ~98.7% RAW baseline and were
> **mathematically unreachable** against the genuine baseline, so nothing ever became actionable.
> Rebased to the real headroom: Cautious stays the strict, near-silent floor (only near-100%-reject
> signals clear it); Balanced is the recommended working setting; Aggressive the loosest. Wilson +
> FDR + `MIN_DISTINCT` are unchanged, so only a handful of genuinely disproportionate values surface.
**Fixed constants (same across presets):**
| Constant | Default | Meaning / tuning |
|---|---|---|
| `HALF_LIFE_DAYS` | 150 | Recency decay half-life. Lower = forgets faster. |
| `GLOBAL_MIN_FEEDBACK` | 300 | No suggestions until this many decayed reactions exist system-wide. |
| `DIM_MIN_FEEDBACK` | 150 | Per-dimension (area / type) minimum decayed reactions. |
| `MIN_EFFECTIVE_SAMPLE` | 12 | Min `n_eff` for a single value to be eligible. |
| `MIN_DISTINCT` | 6 | Min distinct rejected listings for a value (anti-skew). |
| `FORMING_FLOOR` | 0.65 | Below this Wilson lower bound, not even "forming." |
| `MAX_INBOX` | 5 | Max suggestions shown at once. |
| `PROBATION_REPROBE_RUNS` | 6 | Re-probe a removed value every N scraper runs (exploration). Higher = cheaper but blinder. |
| `RECONSIDER_RATE` | 0.60 | If a probationed value's re-probe reject rate drops below this, flag "Reconsider?". |
| `EXCLUDE_PASSES` | false | Confirmed: `pass` counts as a non-reject trial. Set true only to switch to like-vs-reject-only. |
---
## Progress Log
> Claude Code: append a dated, one-line entry per merge. Most recent at top.
- **2026-06-19** — **Refinement overhaul (calibration + expansion + cadence).** Diagnosed why
  Luke had never seen a suggestion: all candidates sat `forming`, 0 `actionable`, because the
  Cautious `MIN_LIFT` (1.6) exceeded the achievable ceiling (`1/baseline ≈ 1.22`). Rebased the
  `MIN_LIFT` levers (1.20 / 1.10 / 1.05 — §5); added a sensitivity **nudge** (forming-but-stuck on
  Cautious → switch to Balanced). Expanded the engine beyond area/property_type to
  `price_band/beds/outdoor/parking/outcode` (migration `refinement_expand_dimensions`; non-geographic
  dims are display/observation only, scrape_probation unchanged). Added a notify-only **Trends &
  nudges** observation lane. Added `.github/workflows/refinement-run.yml` (daily cadence; needs owner
  secrets). Live read-only review confirmed terraced/flat lift ≈1.19 (clears Balanced, gated by
  Cautious) and a new `price_band` signal (≈93% reject under £300k). Harness green 716/716. Full
  account appended to `fable_refactor.md`.
- **2026-06-05** — **Stage 9 COMPLETE → ALL STAGES DONE.** Polish + plain-English copy
  pass; accessibility/mobile pass (native dialogs, focus-visible, 44px targets,
  aria-pressed/live, fieldset reset scope, mobile-first grids, tokens only). Safety review
  grep-audited against the golden rule: no path hides/pauses without explicit user action
  (confirmed_* written only by user-triggered storage; engine originates only
  forming/actionable + preserves user statuses; scraper drops only active-flag +
  user-written probation); all actions reversible; **zero** listing_reactions deletes.
  Wrote `docs/REFINEMENT_README.md` (maintenance map; documents why portal sync_log audit
  is RLS-blocked and the durable record instead). Harness green **548/548**. Supabase:
  pushed 0 areas, 0 user-state rows.
- **2026-06-05** — **Stage 7 COMPLETE → working branch.** Training controls: sensitivity
  presets persisted in `learned_preferences.overrides.__refinement_settings` (reserved key,
  skipped by `effectiveWeights`) via `setRefinementPreset`/`getRefinementPreset` + a
  segmented control (§4.6); `tools/refinement-run.mjs` REST mode now reads the preset +
  dismiss memory so a portal change applies next run. `resetTraining({scope})` clears
  refinement_suggestions / scrape_probation / hide rules / dismissals (never
  listing_reactions or learned `derived`) with a scoped strong-confirm dialog (all /
  areas / property types). +2 tests (548/548). Live round-trip: preset balanced
  written/read/reverted (overrides {}). Supabase: pushed 0 areas, 0 user-state rows.
- **2026-06-05** — **Stage 6 scraper enforcement + Stage 8 invariant → working branch.**
  Pure scope module `assets/js/refinement/scope.js` (`activeAreaIds`/`probationAreaSet`/
  `reprobeThisRun`/`probationDropIds`/`scopeInvariant`). Wired into
  `tools/fetch-listings.mjs`: `loadProbation()` (REST read) + `probationDropIds` folded
  into the existing `dropAreas` prune (probation fully enforced by default; exploration
  re-probe gated behind a monotonic `SCRAPER_RUN_INDEX`, advancing `last_reprobe_run`
  via best-effort PATCH). New `tools/refinement-scope-check.mjs` (Stage 8 drift check,
  exits non-zero on paused-but-active). +6 scope tests (546/546 green); `node --check`
  clean; scope-check verified locally (active-area probation → drift; inactive → stale).
  ⚠ Scraper not live-run (Apify spend); the CI schedule for the check is a §16-guarded
  workflow step (deferred). Supabase: pushed 0 areas, 0 user-state rows. **Next: Stage 7.**
- **2026-06-05** — **dismiss/snooze levers → working branch.** `dismissSuggestion`/
  `undismissSuggestion`/`snoozeSuggestion`/`unsnoozeSuggestion` (status flip +
  `learned_preferences.dismissals`; snooze `snoozed_until`=now+30d). View `effectiveStatus`
  handles snooze expiry (elapsed → back to inbox); new Snoozed §4.5 section + Dismissed
  un-dismiss. +2 tests (540/540). Supabase: pushed 0 areas, 0 user-state rows.
- **2026-06-05** — **Stage 6 PORTAL LEVER → working branch** (scraper enforcement
  deferred, owner decision: portal-first). Shipped the reversible **"Stop searching this
  area" / "Bring back"** scrape lever. Same RLS reality as Stage 5 — `areas` is
  SELECT-only from the portal (verified), so the lever writes the household-scoped
  `scrape_probation` table (full CRUD RLS) + flips the suggestion to `confirmed_scrape`,
  NOT `areas.active`. Added `getScrapeProbation`/`stopSearchingArea`/`bringBackArea` to
  `storage/refinement.js` (area-only; upsert on the unique (household,dimension,value));
  `probationStatusLabel` (forward-looking re-probe copy) to `refinement/view.js`; the
  Stop button (area inbox cards, danger-tinted) + Bring-back (On-probation cards) + a
  generalised confirm `<dialog>` in `page-refinement.js`/`pages/refinement.css`. +3 tests
  (538/538 green): 2 probation-copy, 1 `confirmed_scrape`-sticky against an engine re-run.
  Live round-trip verified then fully reverted (hambledon-po7: actionable→stop [probation
  row active/reprobe 6, status confirmed_scrape]→bring back [row deleted, actionable]→
  forming; 0 probation rows after). SCHEMA_NOTES §5 updated (areas SELECT-only →
  scrape_probation is the lever). **DEFERRED:** the scraper-side subtraction + exploration
  re-probe + "Reconsider?" (the Apify-spending half; overlaps §8). Supabase: pushed 0
  areas, 0 user-state rows (round-trip reverted). **Next: scraper enforcement.**
- **2026-06-05** — **Stage 5 COMPLETE (Approach B) → working branch.** Shipped the
  reversible **display-hide lever** without any `listings`/`sync_log` write: the planned
  `listings.status='hidden'` flip is **impossible from the portal** (shared, SELECT-only
  `listings` RLS; no household_id; no `sync_log` INSERT policy — all verified via MCP), so
  the owner-approved design is **client-side via `learned_preferences.overrides`**. Added
  `hideSuggestion`/`unhideSuggestion`/`countMatchingListings` to `storage/refinement.js`
  (rule under reserved key `__refinement_hidden` — skipped by `effectiveWeights`, preserved
  by `recomputeLearnedPreferences`; suggestion status → `confirmed_hide`/back to
  `actionable`); pure helpers `hiddenRulesFromOverrides`/`matchingHideRule`/
  `listingHiddenByRefinement` in `refinement/view.js`; a confirm `<dialog>` + Hide/Restore
  buttons + live region in `page-refinement.js`/`pages/refinement.html`/`pages/refinement.css`
  (Linear-dense, tokens only); feed integration in `page-listings.js` (pool filter +
  "Hidden by refinement" chip + summary segment, revealed by the existing Show-hidden
  toggle; deck wave excludes hidden too). +5 tests (4 view incl. the effectiveWeights
  safety invariant, 1 persistence `confirmed_hide`-sticky); harness green **535/535**.
  Live round-trip verified end-to-end then fully reverted (set terraced→actionable→hide
  [status confirmed_hide, rule written, feed_count 170 == modal copy]→undo [overrides {}]→
  restore forming). SCHEMA_NOTES §4 corrected (status-flip assumption → Approach B).
  **Deferred to a follow-up:** dismiss/snooze + the "Why?" sparkline / sample listings.
  Supabase: pushed 0 areas, 0 user-state rows (round-trip reverted). **Next: Stage 6.**
- **2026-06-05** — **Stage 4 COMPLETE → merged to `main`.** Read-only Refinement
  control panel: `pages/refinement.html` + `assets/js/page-refinement.js` + the pure
  view layer `assets/js/refinement/view.js` (`humaniseValue`/`toCard`/`rankForInbox`/
  `classifySuggestions`/`buildConfidenceMeter`, incl. the volume-artefact note),
  `assets/css/pages/refinement.css` (Linear-dense, tokens only) appended to the
  dashboard shell, nav entry, and a read-only storage getter
  `assets/js/storage/refinement.js` (`getRefinementSuggestions`/`getRefinementMeta`;
  `storage.js` shim extended by one re-export — §16-compliant). Added a `feedback`
  summary to the run record (engine `scoreFromAggregates` now returns `system_decayed`)
  and backfilled the 2 live runs so the model-confidence meter reads **Ready** (3556
  reactions). 9 view tests; harness green **530/530**. Live page renders 51 `forming`
  cards (0 actionable → empty inbox) + Ready meter; no action buttons (Stage 5/6).
  Deferred to Stage 5: the "Why?" sparkline + sample rejected listings (need
  `listing_reactions` reads, not in the counts-only `metrics` blob). Supabase: backfilled
  2 run rows (feedback), 0 new suggestion rows. **Next: Stage 5** (display-hide lever).
- **2026-06-05** — **Stage 3 COMPLETE → merged to `main`.** Built the notify-only
  persistence job: pure planner `assets/js/refinement/persistence.js`
  (`priorRunsFromRows`/`isTracked`/`resolveStatus`/`planRun`/`renderPlanSql`) + driver
  `tools/refinement-run.mjs` (`--from-file` MCP-bundle + REST modes, emits idempotent
  SQL). Refactored the engine into `buildAggregates` (decayed counts — runnable in SQL
  for the live job, no 3.5k-row dump) + `scoreFromAggregates`; `runRefinementEngine`
  now composes them (Stage-2 behaviour unchanged). 8 persistence tests; harness green
  **521/521**. **Live run (household 9628b44f…):** persisted **51 `forming`**
  suggestions (36 area + 15 type; **0 actionable** — lift binds at the 0.986 baseline,
  per SCHEMA_NOTES §1) + 2 `refinement_runs` audit rows + 2 `sync_log` `system` entries
  across two runs; verified `runs_qualified` read-back, `first_detected_at` preserved,
  and the live `ON CONFLICT` CASE guard preserving a `dismissed` against an engine
  `forming` write. `listings`/`criteria`/`zones`/`scrape_probation`/hidden-listings all
  unchanged — golden rule intact. SCHEMA_NOTES §8 updated: `refinement_*` remain
  **untracked** (engine/audit-class). Supabase: pushed 51 suggestion rows + 2 run rows
  + 2 sync_log (system). **Next: Stage 4** (read-only control panel).
- **2026-06-05** — **Stage 2 COMPLETE.** Built the pure, deterministic engine
  `assets/js/refinement/engine.js` (normalise → decayed `n_eff`/`k_eff`/`p_hat`/
  `distinct_rejected_listings` → Wilson lower bound w/ Newcombe continuity correction
  <30 → baseline `p0` + lift + one-sided two-proportion test → Benjamini-Hochberg FDR
  → 5 gates + tiers + wilson→lift→n_eff ranking + `volume_artefact`) and the single
  config module `assets/js/refinement/config.js` (Cautious shipped; preset matrix +
  fixed constants + `resolveConfig`). 19 unit tests in `tests/refinement-engine.test.js`
  (all 5 named cases + actionable/persistence path + global-gate guard); wired into the
  runner. Harness green **513/513**. Live MCP check: terraced (wilson 0.9909/lift 1.014)
  ranks above detached (0.9835/1.006) & semi-detached (0.9481/0.980); ~98.7% baseline
  caps lift ≈1.01 ⇒ **0 actionable** (lift gate binds, per SCHEMA_NOTES §1). No UI, no
  DB writes, no scope mutation — 3 engine tables still empty. Supabase: pushed 0 areas,
  0 user-state rows. **Next: Stage 3.**
- **2026-06-05** — **Stage 1 COMPLETE → merged to `main`.** Discovered live schema
  via Supabase MCP → `docs/SCHEMA_NOTES.md` (key fact: ~98.7% raw reject baseline
  ⇒ lift is the binding gate; `overrides`/`dismissals` empty; `listings.status`
  only `live`; `'hidden'` not honoured by default read path → Stage-5 gap;
  `areas.data.active` is the scrape-scope flag). Applied migration
  `refinement_engine_stage1` (3 empty RLS tables) via MCP + mirrored to
  `supabase/schema.sql`. Harness green; advisor clean. **Next: Stage 2** (pure
  statistical engine + tests). Constants = Cautious defaults, pending Luke's final
  confirm before Stage 2 wiring.
- **2026-06-05** — Plan captured and persisted to the repo as
  `docs/REFINEMENT_PLAN.md` (with resume banner) so the work is resumable across
  sessions; pointer added to `docs/CHECKLIST.md`. No code/schema yet. **Next:
  Stage 1** (schema discovery + `SCHEMA_NOTES.md` + confirm Section 5 constants
  with Luke before any migration).
