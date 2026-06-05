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
> - **Active stage:** Stage 3 (Suggestion generation + persistence) — **COMPLETE.**
>   **Next: Stage 4** (Control panel — read-only views: Refinement page scaffold,
>   inbox cards capped at `MAX_INBOX`, plain-English "Why?" expander, patterns-forming
>   list, model-confidence meter reading real feedback volume vs the global gate). UI
>   only — still no user actions/levers (those are Stage 5/6).
> - **Done so far:** Stage 1 (schema + 3 RLS tables). Stage 2 (pure engine
>   `assets/js/refinement/engine.js` + config, 19 tests). Stage 3: the persistence
>   planning layer `assets/js/refinement/persistence.js` + the job driver
>   `tools/refinement-run.mjs`; engine refactored into `buildAggregates` +
>   `scoreFromAggregates`; 8 persistence tests; harness green (521/521). **Live DB now
>   holds 51 `forming` suggestions + 2 run-audit rows** for the household (notify-only,
>   no UI yet).
> - **Next action:** begin Stage 4 — build the read-only Refinement page (Section 4
>   layout). The data is already in `refinement_suggestions`; read it via a new
>   `storage.js` getter (`getRefinementSuggestions()` — §17 "Adding a new data type",
>   its own named change). No write actions this stage.
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
### Stage 4 — Control panel: read-only views
**Goal:** surface what the engine found; no actions yet.
- [ ] Refinement page scaffold (Section 4 layout).
- [ ] Inbox cards (capped at `MAX_INBOX`), plain-English copy, "Why?" expander
      with counts, tier, sparkline, sample listings.
- [ ] Patterns-forming, Active (empty for now), Probation (empty), Dismissed
      views render.
- [ ] Model-confidence meter reads real feedback volume vs the global gate.
- **Acceptance:** page renders real suggestions; artefact flag shows its note;
  buttons present but inert (or hidden) this stage.
- **Merge gate:** page merged to `main` behind a simple nav entry; read-only.
### Stage 5 — Display-hide lever (confirm + undo)
**Goal:** the reversible, low-stakes action goes live.
- [ ] **Hide these from view** → confirm modal (states count affected) → write
      rule to `learned_preferences.overrides`, flip matching live listings to
      `status='hidden'`, log to `sync_log` (`actor='portal'`),
      set suggestion `status='confirmed_hide'`.
- [ ] Listings read path filters `hidden` by default, with a global **Show
      hidden** toggle.
- [ ] **Active refinements** undo: restore `status='live'`, remove the override,
      log it.
- [ ] Dismiss / Snooze wired to `dismissals` / `snoozed_until`.
- **Acceptance:** hide → listings disappear from default view, reappear under
  "Show hidden"; undo fully restores; everything logged; round-trips are exact.
- **Merge gate:** display lever merged to `main`.
### Stage 6 — Scrape-scope lever + probation + exploration re-probe
**Goal:** the higher-stakes action goes live, with the feedback-loop safeguard.
- [ ] **Stop searching this area** → confirm modal (clear "no new listings"
      warning) → add to `scrape_probation`, remove value from the **active**
      scrape scope used by the Apify run, set suggestion `status='confirmed_scrape'`,
      log it.
- [ ] **Exploration re-probe:** every `PROBATION_REPROBE_RUNS` scraper runs,
      temporarily re-include probationed values for a small sample pull so the
      engine keeps learning about them.
- [ ] Auto **"Reconsider?"** badge when a probationed value's re-probe reject
      rate drops below `RECONSIDER_RATE`.
- [ ] **Bring back** restores the value to active scrape (and restores any hidden
      listings), logged.
- **Acceptance:** approving removes the value from the next scrape's scope;
  re-probe re-includes it on cadence; bring-back is exact and logged; no hard
  deletes anywhere.
- **Merge gate:** scrape lever merged to `main`.
### Stage 7 — Training controls & reset
**Goal:** user-friendly control over the model's learning.
- [ ] Sensitivity presets (Cautious/Balanced/Aggressive) mapping to constants;
      persisted per household; re-runs the engine on change.
- [ ] Reset training: all / per-dimension / per-value, with strong confirm;
      clears `refinement_suggestions` + derived prefs only; never touches raw
      `listing_reactions`.
- **Acceptance:** switching preset visibly changes which suggestions are
  actionable; reset clears derived state while raw reactions remain intact.
- **Merge gate:** controls merged to `main`.
### Stage 8 — Scrape enforcement & invariant check
**Goal:** make scope correctness self-enforcing so it can't silently drift.
- [ ] The scraper's active area/type list is derived at run time from the source
      of truth = **active areas** (from `areas`) **minus** `scrape_probation`
      values. If it currently reads a hand-maintained `criteria`/`zones` list,
      make that a generated projection, or add a pre-run validation that prunes
      probationed/inactive values before the Apify call fires.
- [ ] Invariant check (scheduled): re-derive "in-scope but not active/allowed"
      and "probationed but still in scope"; alert/log if either set is non-empty.
- **Acceptance:** a deliberately mis-set scope row is caught/pruned before a run;
  invariant check reports clean afterwards.
- **Merge gate:** enforcement + invariant check merged to `main`.
### Stage 9 — Polish, plain-English copy, safety review
**Goal:** make it genuinely easy and safe.
- [ ] Copy review: every suggestion, confirm modal, and undo reads in plain
      English; "Why?" expanders are clear; no exposed jargon.
- [ ] Accessibility / mobile layout pass on the Refinement page.
- [ ] Safety review against the golden rule: confirm there is **no code path**
      that hides a listing or removes a scrape area without an explicit user
      action; confirm all actions are reversible and logged; confirm no hard
      deletes of `listing_reactions`.
- [ ] Update this document's Progress Log and write a short `REFINEMENT_README.md`
      for future maintenance.
- **Acceptance:** safety review checklist passes; docs committed.
- **Merge gate:** final merge to `main`.
---
## 5. Configuration constants (single source of truth)
All live in one config module. **Shipped defaults below are the Cautious preset**
(Luke's choice). The four constants that vary by preset are listed separately in
the preset matrix. Confirm before Stage 1 migration.
**Preset matrix (the levers the preset buttons change):**
| Constant | Cautious (default) | Balanced | Aggressive |
|---|---|---|---|
| `WILSON_FLOOR` | 0.88 | 0.80 | 0.72 |
| `MIN_LIFT` | 1.6 | 1.3 | 1.15 |
| `PERSISTENCE_RUNS` | 5 | 3 | 2 |
| `FDR_Q` | 0.05 | 0.10 | 0.15 |
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
