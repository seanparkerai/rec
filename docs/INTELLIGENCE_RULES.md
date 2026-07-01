# Intelligence rules

This file fixes the constants used by `assets/js/affordability.js` (Phase 2) and the surfaces that consume it. Constants live here so the rationale and source of every number is reviewable in one place. The JS module will duplicate the literal values — a handful of numbers, not worth a build step to share.

## Why these constants?

A "verdict" on a property price is only meaningful if the thresholds match how UK lenders and the FCA actually behave. Each rule below is anchored to a published norm or statutory rule, not to a designer's gut feel. When any of these shifts (a Budget change, a PRA bulletin, a new LISA cap), update this file *first*, then the constants in `affordability.js`.

---

## Income multiple bands

The loan-to-income ratio — loan ÷ gross annual household income — that mainstream UK lenders publish as their stress cap.

| Band | LTI |
| --- | --- |
| comfortable | ≤ 4.5× |
| stretch | ≤ 5.5× |
| tight | ≤ 6.0× |
| out-of-reach | > 6.0× |

*Source:* HSBC, Halifax, Barclays published affordability guidelines, 2024–2026. 4.5× is the standard mainstream cap (= top of "comfortable"); 5.0–5.5× available with strong affordability + clean credit at higher-LTI products (Halifax, Barclays — often with criteria, e.g. minimum income £50k). Above 5.5× requires specialist underwriting. **Calibration note:** the stretch / tight upper bounds are widened from a strict reading of mainstream caps to reflect what real households in this profile (a single mid-range income, FTB) plausibly clear — see the calibration note at the foot of this file.

---

## Stress-test rate

Affordability is assessed at both the contract rate and a stressed rate.

- **Stressed rate = assumed rate + 3 percentage points.**

*Source:* PRA SS3/13 (residential mortgage stress testing). Even after the FPC's 2022 withdrawal of the specific 3-pp rule, +3 pp remains the lenders' working convention.

---

## Payment-to-take-home bands

Monthly mortgage payment (P&I only, contract rate) as % of monthly net (take-home) income.

| Band | Payment / take-home |
| --- | --- |
| comfortable | ≤ 40% |
| stretch | ≤ 52% |
| tight | ≤ 60% |
| out-of-reach | > 60% |

*Source:* FCA MCOB-aligned norms and ONS household-spending ratios. The 35% conventional ceiling refers to **all** housing cost (P&I + tax + insurance + maintenance + utilities) — for P&I-only the equivalent ceiling is ≈40%. The 50% FCA-typical upper bound is widened to 52–60% to reflect realistic FTB experience at current rates. **Calibration note:** stretch / tight thresholds calibrated against this household; published norms are intentionally conservative defaults. See the calibration note at the foot.

---

## Post-move spare-cash floors

Monthly cash left after **monthly total income (take-home + recurring monthly bonus)** minus all bills, expenses, and the new mortgage payment.

| Band | Spare per month |
| --- | --- |
| comfortable | ≥ £400 |
| stretch | ≥ £100 |
| tight or worse | < £100 |

*Source:* household-resilience guidance from StepChange and MoneyHelper. £400/mo is a single-month buffer threshold; below £100 the household has effectively zero margin for an unexpected bill.

**Denominator choice:** `finances.income.totalMonthly` (i.e. take-home **plus** the regular monthly bonus broken out in this dataset), not bare take-home. The bonus in the finances data (from Supabase) is a recurring monthly figure, not a quarterly lump, so treating it as income for the spare calc is fair. If a future profile breaks out an irregular bonus, switch the denominator to bare take-home for that profile.

---

## LISA cap

The Lifetime ISA bonus is only available toward a first property of purchase price **≤ £450,000** (statutory).

*Source:* HM Treasury LISA regulations. Buying at £450,001 forfeits the bonus and may incur a withdrawal penalty — surface this cliff prominently in the UI.

---

## LTV tiers (rate cliffs)

Lenders price mortgages in LTV bands. Crossing into a lower LTV band typically unlocks a cheaper product. The tier boundaries used in the UI:

- **60% · 75% · 85% · 90% · 95%**

A "deposit gap to next tier" is surfaced in the affordability widget — saving £X more can shift the rate band even though the property price hasn't moved.

*Source:* mainstream lender product matrices, 2024–2026.

---

## Calibration note

These bands are **calibrated to this household** (a single-income household with southern-England target prices — finances data lives in Supabase, accessed via `mcp__supabase__execute_sql`). The narrow / conservative reading of mainstream lender caps and FCA norms would mark almost any current-rate purchase as "tight" or "out-of-reach", which is true at the system level but not actionable at the household level — every viable purchase would be flagged red and the verdict surface would lose all signal.

Two consequences:

1. The bands above are deliberately widened from the strict published norms to surface a useful gradient (`comfortable` → `stretch` → `tight` → `out-of-reach`) across the household's plausible price range. The strict-published-norm values are kept as the "comfortable" upper bounds; the stretch / tight tiers extend into the territory mainstream lenders will still write loans against, just with stricter underwriting.
2. When a future profile changes materially (joint income, second earner, higher take-home, or a different rate environment), revisit this calibration before reusing the bands as-is. The calibration is not universal.

The intent is that `comfortable` ≈ "any mainstream lender will write this without question", `stretch` ≈ "available with strong credit and clean affordability", `tight` ≈ "high-LTI products only, with criteria", `out-of-reach` ≈ "specialist underwriting required or simply unaffordable on this income".

## Maintenance

When any constant changes:

1. Edit this file first, including the source citation.
2. Update the matching literal in `assets/js/affordability.js`.
3. Update the affordability test fixtures in `tests/unit/affordability.test.js` if a band edge moved across a test case.
4. Commit with `docs: update intelligence rules — <which one>` and a one-line rationale.

---

## Deposit-risk verdict engine (`assets/js/deposit-risk.js`)

Verdict thresholds for `assessDepositRisk(investments, goals)`:

| Verdict | Condition |
|---------|-----------|
| `low-risk` | earmarked equity < 50% **OR** timeline > 12 months |
| `moderate-risk` | 50-100% equity **AND** timeline 6-12 months |
| `high-risk` | 100% equity **AND** timeline < 6 months |

**Worked example:** a deposit fund held almost entirely in equity ETFs + gold on a short timeline resolves to **high-risk**, urgency=high.

**Risk recommendation logic:**

- `high-risk` → "De-risk 50-100% to a Cash ISA or high-interest savings account", urgency=high. Rationale: 3-6 month timeline with 100% equity means a market correction maps directly to a deposit shortfall.
- `moderate-risk` → "Consider partially de-risking (50%)", urgency=medium.
- `low-risk` → "No immediate action required", urgency=low.

**Scenarios returned:** 5%, 10%, 15%, 20% drop. The dashboard surfaces 10% and 20%.

**Withdrawal readiness note:** Lenders need a 3-month paper trail showing the deposit source. Move the deposit into the receiving cash account at least 3 months before applying.

*Source:* standard lender source-of-funds requirements; volatility risk is timeline-dependent, from the horizon stated in the goals data (Supabase `goals` table).

---

## Affordability scenarios (`assessAffordabilityScenarios()`)

Three canned scenarios produced by `assessAffordabilityScenarios({ finances, criteria, goals })`:

| Scenario key | Price | Deposit | Description |
|-------------|-------|---------|-------------|
| `buyNowLowerTarget` | lower target price | current savings | Buy sooner with the current pot |
| `buyOnTargetDeposit` | engine-centre price | hoped-for deposit | Buy when the hoped deposit is reached |
| `buyAtHigherTarget` | upper budget bound | ~12.5% of price | Stretch scenario at the upper budget bound |

**monthsToReady** is computed as `ceil((targetDeposit - currentSavings) / monthlyContribution)`. For `buyNowLowerTarget` it is always 0.

**Important:** the discretionary bonus and the pay-rise scenario are **not** used in these projections. They are available as scenario toggles only.

**Verdicts** are computed live from the household's finances / criteria / goals (stored in Supabase),
not hard-coded here. At current rates the three scenarios typically span the **stretch → tight** range;
the engine returns the exact band, LTI and post-move spare for each.

---

## Maintenance (additions)

When deposit-risk thresholds change:
1. Update verdict logic in `assets/js/deposit-risk.js` `deriveVerdict()`.
2. Update the table above with rationale.
3. Update test cases in `tests/unit/deposit-risk.test.js`.

---

## Listing fit (v3 L2)

The **listing** verdict is a 5-band scale — `strong / possible / stretch / weak / reject` —
distinct from the 4-band **affordability** verdict it consumes. It lives in
`assets/js/listing-fit.js` (`scoreListingFit`), which **imports** `assessAffordability`
and never re-implements an affordability number.

**The seam — gate, then signal:**
1. **Hard gate.** `assessAffordability(price, …)` runs first. `out-of-reach` ⇒ verdict
   `reject`, `gated:true`. Gated listings are filtered from the default feed (a
   "show out-of-reach" toggle reveals them). No preference can surface a home you cannot buy.
2. **Soft signal.** For everything that survives, the affordability band is one weighted
   input alongside beds / type / price / LISA / EPC fit, and (from L4) the learned-preference weights.
3. **Output.** A 5-band verdict + a `contributions[]` array built *by construction*, so every
   verdict can show its working (the anti-black-box contract). Each entry is `{ signal, label, delta }`.

**Score → band (`FIT_BANDS`, 0–1):** strong ≥ 0.75 · possible ≥ 0.55 · stretch ≥ 0.40 ·
weak ≥ 0.20 · else reject. Base score 0.5, contributions summed, clamped 0–1.

**Contribution weights (`FIT_WEIGHTS`)** — CALIBRATED, revisable:
affordability comfortable +0.25 / stretch +0.10 / tight -0.05 · beds ideal +0.15 / min +0.05 /
below-min -0.30 · type preferred +0.15 / acceptable 0 / excluded -0.40 · price in-budget +0.10 /
over-budget -0.20 · LISA-eligible +0.08 · EPC meets min +0.05.

**Manual rating (`ratingMax` +0.20, POSITIVE-ONLY).** A saved listing can carry a 1–10
priority rating (stored on the `shortlist` row). It enters `scoreListingFit` as a single
contribution `clamp(ratingMax × (rating−1)/9, 0, ratingMax)` — rating 10 adds the full +0.20,
rating 1 adds +0, and it is **never negative**: a low rating is a weaker boost, not a penalty.
This keeps the user's explicit prioritisation aligned with the ranking without letting it
demote a home below an unrated one.

Constants live in `assets/js/intelligence-constants.js` (`LISTING_VERDICTS`, `FIT_BANDS`,
`FIT_WEIGHTS`). Change them and this section together. *(v3 L2 — added 2026-05-30; rating signal 2026-06-01.)*

## Listing identity, suppression & purge (v3 convergence)

**Baseline gate (`assets/js/listings/classify.js`).** One houses+bungalows allow-list plus a
price/beds band is the single "is this a home worth showing?" rule, applied post-normalise by
every writer of the `listings` table (the live fetcher AND the backfill importer):
- `BASELINE_PRICE_MIN` = £100,000 · `BASELINE_PRICE_MAX` = £450,000 (LISA-aligned) ·
  `BASELINE_MIN_BEDS` = 2. A KNOWN price/beds outside the band rejects; UNKNOWN (null) does not
  (a re-fetched summary can omit them, and must not drop a known-good row). The type rule is
  unconditional.
- EXCLUDED is tested before ALLOWED, so "Coach House" / "House Share" / HMO don't slip through
  the broad "house" rule. `passesBaseline()` is the gate; `flags.js` also hides an excluded type
  in the feed. *(This gate is the pollution guard — `tests/supabase-sync.test.js` asserts every
  writer imports it, so the table can't silently re-pollute.)*

**Physical-property fingerprint.** `propertyFingerprint(l)` = `type|beds|street|town`, a
price-insensitive identity that is `null` when the address is too coarse (town-only) to trust —
deliberately conservative so distinct homes never false-merge. It exists because `rightmove_id`
is NOT stable: a withdrawn-then-relisted property gets a new id, which is why reactions orphaned
and duplicates piled up.

**Suppression policy (`assets/js/listings/suppress.js`).**
- A property whose LATEST reaction is **like or reject is "decided"** → never shown as a fresh
  card again, matched by id AND fingerprint (so a re-list under a new id is caught).
- **`pass` is a soft skip** — not decided, may resurface.
- Among undecided rows, same-fingerprint **duplicates collapse to one** representative
  (`dedupeByFingerprint` keeps the newest listing; `dedupeNewestByFingerprint` keeps the newest by
  an explicit time accessor — the Saved view's most-recently-liked).
- The feed derives "decided" from the LIVE append-only log via `latestPerListing` + `decidedSets`,
  the same source the Saved view reads (so feed and Saved never disagree).

**Rejection memory is DERIVED, not stored separately.** There is no rejection table — the
append-only `listing_reactions` log is the durable signal. This is why the heavy `listings` row can
be purged without losing suppression.

**Maintenance purge (`tools/purge-listings.mjs`).** Deletes a `listings` row when it is (a)
baseline-violating, (b) rejected (by id AND fingerprint) and unseen past `REJECT_HALF_LIFE_DAYS`
(14), or (c) stale past `STALE_DAYS` (30) — but NEVER a row ever liked. Reuses `passesBaseline` +
`propertyFingerprint` + `isDecided` so it can't drift from what the feed suppresses. It is
maintenance, **not a cap** — it never trims valid, undecided, in-baseline listings. *(v3 convergence — added 2026-06-04.)*

## Learned preferences (v3 L4)

The append-only `listing_reactions` log (Layer 1) is distilled into **derived weights**
(Layer 2) that re-rank listings through the `listing-fit.js` `learnedPrefs` seam, then merged
with **overrides** (Layer 3). The pure core is `assets/js/learned-preferences.js`; the persisted
state is the `learned_preferences` table (one row/household: `derived` + `overrides`).

**Signals** are extracted symmetrically from a live listing and from a reaction's
`listing_snapshot` (so we learn on exactly what we score on): `type:<t>`, `beds:<n>` (5+ collapsed),
`baths:<n>` (3+ collapsed), `outcode:<oc>`, `area:<id>`, `price-band:<band>` (coarse, market-aligned).
`baths` is snapshot-durable (the snapshot already carries `baths`).

**Reason attribution (multi-reason → causal sharpening).** A reaction's `reasons[]`
(see "Multi-reason feedback" below) are *causal* evidence about WHICH feature drove it.
`deriveWeights` reads them: the signal **kinds** a reason implicates take the **full**
recency-weighted contribution; every other kind is multiplied by `UNATTRIBUTED_DISCOUNT`
(0.35). A reaction with **no reasons** is undiscounted everywhere (backward-compatible —
the ~88 legacy rows and all no-reason reactions behave exactly as before). The
liked/rejected **mass** (denominators) always uses the full recency weight `w`; only the
per-signal numerators are discounted — so an unattributed signal present in every reject
reaches `P(s|rejected) = d`, and its discrimination/weight is scaled by exactly `d` versus
the attributed signal (probability shares stay ≤ 1, every reaction contributes its full
`w` to mass exactly once). Counts (`n`, hence `MIN_SIGNAL_N`/confidence) are untouched —
the discount applies to mass, not counts.

**Unattributed rejects don't train (2026-06).** The "no reasons ⇒ undiscounted" path above
applies to **likes** (which train on their own merit). A **reject** carrying *no* reason at
all (no `reasons[]`, no scalar `reason`) is now a **non-training** signal
(`reactions.js#isUnattributedReject`, gated in `weights.js#isTraining` + `trainingProgress`):
it still hides the listing, but it carries no causal information, so it never moves a weight
and counts toward neither `gradedCount` nor the training-progress totals — exactly like an
administrative `removed_area` reject, different cause. Rationale: unattributed rejects are
overwhelmingly quick / bulk-triage actions; crediting them at full weight against every
feature poisoned the live model (an in-budget detached home quick-rejected for its *location*
read as "dislikes detached"). A reasoned reject of the same home still trains normally — it is
the missing reason, not the reject verb, that gates.

Reason → implicated signal kinds (`REASON_SIGNAL_KINDS`):
`too_small→beds` · `wrong_area→outcode,area` · `too_expensive→price-band` ·
`busy_road→outcode,area` · `poor_layout→baths` · `needs_work / no_outdoor / other → (none,
generic discount on all)`. Like-reasons mirror this: `great_area→outcode,area` ·
`good_value→price-band` · `right_size→beds` · `good_layout→baths` · `character→type`.
A reason mapping to no captured signal still contributes a generic, discounted listing-level
signal (never silently dropped).

**`deriveWeights(reactions)` algorithm** — three non-negotiable properties:
1. **Train only on graded reactions** (`like` / `reject`). `pass`, `ignored`, and passive `viewed`
   are *unlabelled* and never train — absence is not a negative (the single most important
   guardrail: busy weeks would otherwise teach suppression).
2. **Base-rate calibrated.** A signal earns weight from its *discrimination*
   `P(signal | liked) − P(signal | rejected)`. A signal present in everything cancels to ≈0, so we
   never just re-learn `criteria`.
3. **Recency-decayed + traceable.** Each reaction's contribution is weighted `0.5^(ageDays / HALF_LIFE_DAYS)`
   (decay basis = days), and each derived weight records the `reaction_ids` that produced it plus
   `n / n_liked / n_rejected / discrimination / confidence`.

`weight = discrimination × MAX_LEARNED_WEIGHT × confidence`, where `confidence = n / (n + SMOOTHING)`;
signals below `MIN_SIGNAL_N` are dropped; weights below 0.01 are not surfaced.

**Cold start.** Below `COLD_START_MIN` graded reactions, `deriveWeights` returns `{}` (scoring falls
back to static fit) and the listings page shows a **review deck** that diversifies the recent wave
(`diversifySelection` across type × price-band × beds) so early reactions are maximally contrastive.
A signal is "recent" when `added_date ≥ now − RECENCY_DAYS` (undated never counts).

**Effective weights & overrides.** `effectiveWeights(derived, overrides)` is a flat `signal → weight`
map where an override **replaces** the derived weight (Layer-3 precedence); the override keeps
`derived_weight_at_set` so L5 can detect drift and surface a conflict — never resolved silently.
`listingLearnedPrefs(listing, effective)` pre-selects the signals a listing exhibits before they hit
the scoring seam (so a `type:detached` weight only touches detached homes).

**Optimised next fetch.** `deriveSearchSpec(effective, criteria)` turns the learned weights + criteria
into a Rightmove query narrowing (price floor/ceiling, bed minimum, `RECENCY_DAYS` window, excluded
types, focus outcodes). Learned weights only *add* focus or exclude on a **strong** signal
(`|weight| ≥ STRONG_FRACTION × MAX_LEARNED_WEIGHT`) — a weak/uncertain weight never removes a class
(asymmetric caution). Consumed by `tools/fetch-listings.mjs` under `USE_LEARNED=1` to cut paid results.

**Constants (`LEARNED_PREF`, `RECENCY_DAYS`, `TRAINING_MILESTONES`)** — CALIBRATED, revisable; change
them and this section together:
`COLD_START_MIN` 10 graded · `HALF_LIFE_DAYS` 30 · `MAX_LEARNED_WEIGHT` 0.30 · `MIN_SIGNAL_N` 2 ·
`SMOOTHING` 3 · `STRONG_FRACTION` 0.5 · `UNATTRIBUTED_DISCOUNT` 0.35 · `RECENCY_DAYS` 14 ·
`TRAINING_MILESTONES` { usable 30, solid 80, mature 160 }. *(v3 L4 — added 2026-05-31; reason
attribution + baths signal + milestones added 2026-05-31.)*

### Multi-reason feedback + training progress (v3 L4 upgrade)

**Reaction reasons** are a structured, multi-select array on each `listing_reactions` row:
`reasons jsonb` = `[{ key, detail, note }]` (migration `listing_reactions_multi_reason`). `key` is a
primary reason; `detail` an optional sub-reason (validated against that parent only); `note` optional
free text. The scalar `reason` column is **dual-written** with the primary (first) key for back-compat
with the 44 historical single-reason rows and the `latestPerListing` cache shape. A `reject` carries
negative reasons (`REJECT_REASONS` + `REJECT_SUBREASONS`); a `like` may carry positive reasons
(`LIKE_REASONS` + `LIKE_SUBREASONS`) — the cheapest fix for the negative-signal skew. `pass` stays
unlabelled (never carries reasons; never trains). Pure helpers in `listing-reactions.js`
(`normaliseReasons`, `primaryReasonKey`, `isReasonKey`, `isSubReasonKey`); attribution map +
`implicatedKinds` in `learned-preferences.js`.

**Training progress (`trainingProgress`).** An honest, balance-aware progress signal (NOT a single
magic number): graded count vs `TRAINING_MILESTONES`, the like/reject balance, and an *effective*
strength that is penalised when the signal is one-sided. `strengthPct = volumeProgress × balanceFactor`,
where `balanceFactor = min(likeShare, rejectShare) / 0.5` (a perfectly balanced 50/50 split scores 1.0;
the current ~84:4 negative split scores ≈0.09 — surfacing "add more likes" as the real bottleneck).
Below `COLD_START_MIN` graded → "warming up"; `likeShare < 0.2` → headline guidance is "add more likes".
Pure core in `learned-preferences.js`; the page only renders it.

## Recommendation loop (v3 L5)

The learning loop closes by *talking back*: when behaviour and stated criteria disagree, the app
**recommends** — it never rewrites criteria silently. Pure core: `assets/js/meta-observations.js`.

**Conflict prompts (`detectConflicts`).** Three kinds, each comparing **likes** to a stated rule:
`over-budget` (price > `budget.max`), `excluded-type` (liked a `propertyTypePrefs.excluded` type),
`below-min-beds` (beds < `size.minBeds`). A conflict fires only on the **3-condition trigger** — all
three must hold, so it stays off noise:
1. **Volume** — at least `MIN_CONFLICT_LIKES` (3) violating likes.
2. **Dominance** — violating likes are ≥ `MIN_CONFLICT_SHARE` (60%) of the *comparable* likes (those
   that could violate the rule), so an occasional outlier never triggers.
3. **Recency** — at least one violating like within `CONFLICT_RECENCY_DAYS` (30), so a stale one-off
   pattern stays quiet.
A dismissed prompt is silenced for `DISMISS_DAYS` (14) via a `dismissed_until` ISO stamp stored in
`learned_preferences.dismissals` (user-state; migration `learned_preferences_dismissals_l5`). Trains
on **likes only** — pass/reject/viewed are never counted as a contradiction.

**Listings-to-review total (`tile-review-count.js`).** A single count above the dashboard bento:
how many listings are still waiting for a decision on the Listings page, linking straight to it. It
is DIRECTLY tied to the Browse feed — it runs the same pure partition pipeline
(`listings/feed-partition.js`) with the same radius / affordability-gate / junk / refinement /
decided / dedupe rules, so the dashboard number can never drift from the feed's "to review" total.
*(Replaced the v3 L5 next-best-action strip, 2026-06-16.)*

**Constants (`META_OBS`)** — CALIBRATED, revisable; change them and this section together:
`MIN_CONFLICT_LIKES` 3 · `MIN_CONFLICT_SHARE` 0.6 · `CONFLICT_RECENCY_DAYS` 30 · `DISMISS_DAYS` 14 ·
`SAVED_STALE_DAYS` 7. *(v3 L5 — added 2026-05-31.)*

### Maintenance (deposit-risk, cont.)
4. Commit with `docs: update intelligence rules — deposit-risk thresholds`.
