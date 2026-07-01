# Session log 2026-06-19 — Model Refinement Engine overhaul

> Split from `fable_refactor.md` (2026-07-01, content unchanged). Directory: [`plan/README.md`](../README.md).

## Appendix — Session log: Model Refinement Engine overhaul (2026-06-19)

A targeted overhaul of the **Model Refinement Engine** (§10.6), run **independently of, and prior
to,** the Fable overhaul above (owner decision: this is a precursor; the plan in this file is
untouched except for this appended log). The trigger: the owner reported that Luke — and likely every
household — had **never once seen a suggested refinement**, and asked for a review + a fully optimal
improvement that *only improves and never risks current reaction progress*. The work landed on branch
`claude/refinements-model-review-w7dbru`; the test harness (`node tools/run-intelligence-tests.mjs`)
was green (**716 pass, 0 fail**) after every phase. **NOTIFY-ONLY throughout** — no change touched the
reaction write path (`assets/js/storage/listings/*`, §16) or the learned-preference weight derivation;
the engine still writes only `refinement_suggestions` / `refinement_runs` and never auto-acts.

- **Review — root-cause diagnosis (live, read-only).** Queried the live DB: Luke's household has
  **4,019 reactions** (98.2% reject) yet **8 suggestions, all `forming`, 0 `actionable`** — the inbox
  was empty *by construction*. The binding gate is disproportionality: `lift = p_hat / baseline`, and
  on the genuine-only baseline (~0.82) the **maximum achievable lift is `1/0.82 ≈ 1.22`**, but the
  shipped Cautious `MIN_LIFT` was **1.6** (Balanced 1.3) — both **mathematically unreachable**. The
  strongest candidate (`terraced`: wilson 0.944, FDR-significant, 60 distinct listings) cleared every
  gate *except* the impossible lift floor. Compounding it, the engine last ran **2026-06-07** with no
  cadence, so the persistence counter never accumulated.
- **Phase 1 — recalibration + sensitivity nudge.** Rebased the `MIN_LIFT` levers to the real headroom
  (**Cautious 1.20 / Balanced 1.10 / Aggressive 1.05**); Cautious stays the strict, near-silent floor
  (owner's choice), and a new `presetNudge()` (refinement/view.js) prompts a switch to Balanced when
  strong patterns are forming but held back. Wilson / FDR / `MIN_DISTINCT` unchanged, so only a
  handful of genuinely disproportionate values surface. Reconciled `docs/archive/REFINEMENT_PLAN.md`
  §5 + `docs/REFINEMENT_README.md`.
- **Phase 2 — dimension expansion.** Generalised `engine.js#extractValue` with a per-dimension
  extractor registry reusing the learned-preferences buckets (`priceBand`, `bedBucket`), expanding
  scoring beyond `area`/`property_type` to `price_band`/`beds`/`outdoor`/`parking`/`outcode`. Migration
  `refinement_expand_dimensions` relaxed the `refinement_suggestions.dimension` CHECK;
  **`scrape_probation` stays `area`/`property_type`** (the fetcher searches by area/postcode), so the
  new dimensions are display/observation only — `suggestions/model.js` routes them notify-only (no
  broken Apply).
- **Phase 3 — Trends & nudges lane.** New pure `assets/js/refinement/observations.js` composes
  existing helpers (`reactionMix`/`topDrivers`/`coverage` + the engine's `forming` bucket) into short,
  dismissible, notify-only observations (keep-rate, strongest pull, biggest turn-off, coverage gaps,
  forming digest) — surfaced more regularly without diluting the high-stakes inbox; dismissal reuses
  the shared `learned_preferences.dismissals` map.
- **Phase 4 — scheduled cadence (§16 workflow phase).** Added `.github/workflows/refinement-run.yml`
  (daily 06:00 UTC + manual dispatch): runs the engine in REST mode, applies the SQL plan via psql,
  runs the scope-check invariant. It **no-ops until the owner adds repo secrets** (`SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`; optional `REFINEMENT_HOUSEHOLD_ID`). Also scoped the
  REST reactions read to one `household_id` (the service role bypasses RLS — baseline must reflect one
  household's taste).
- **Verification.** Harness green (716/716, + new `tests/refinement-observations.test.js`). Live
  read-only preview against Luke's genuine reactions confirmed the fix end-to-end: `terraced`/`flat`
  lift ≈1.19 (now clears Balanced, still gated by Cautious — the nudge story holds exactly), and the
  new `price_band` dimension surfaces a real pattern (~93% reject under £300k, lift ≈1.11). No
  suggestions were written to live accounts — that is the scheduled job's role once the secrets exist.

Net effect: the engine can now actually surface suggestions (Balanced reaches the genuine ceiling;
Cautious stays deliberately strict with a nudge to switch), covers five more reaction-trend
dimensions, and offers a calmer notify-only observation lane — with a daily cadence ready to switch on.
Reaction capture, learned weights, and the scrape scope were untouched; every change is additive,
reversible, and notify-only.

