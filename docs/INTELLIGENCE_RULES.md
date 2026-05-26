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

*Source:* HSBC, Halifax, Barclays published affordability guidelines, 2024–2026. 4.5× is the standard mainstream cap (= top of "comfortable"); 5.0–5.5× available with strong affordability + clean credit at higher-LTI products (Halifax, Barclays — often with criteria, e.g. minimum income £50k). Above 5.5× requires specialist underwriting. **Calibration note:** the stretch / tight upper bounds are widened from a strict reading of mainstream caps to reflect what real households in this profile (mid-£60k single income, FTB) plausibly clear — see the calibration note at the foot of this file.

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

**Denominator choice:** `finances.income.totalMonthly` (i.e. take-home **plus** the regular monthly bonus broken out in this dataset), not bare take-home. The bonus in `data/finances.json` is a recurring monthly figure, not a quarterly lump, so treating it as income for the spare calc is fair. If a future profile breaks out an irregular bonus, switch the denominator to bare take-home for that profile.

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

These bands are **calibrated to the household whose profile lives at `data/finances.json`** (single mid-£60k income, first-time buyer, southern-England target prices). The narrow / conservative reading of mainstream lender caps and FCA norms would mark almost any current-rate FTB purchase as "tight" or "out-of-reach", which is true at the system level but not actionable at the household level — every viable purchase would be flagged red and the verdict surface would lose all signal.

Two consequences:

1. The bands above are deliberately widened from the strict published norms to surface a useful gradient (`comfortable` → `stretch` → `tight` → `out-of-reach`) across the household's plausible price range. The strict-published-norm values are kept as the "comfortable" upper bounds; the stretch / tight tiers extend into the territory mainstream lenders will still write loans against, just with stricter underwriting.
2. When a future profile changes materially (joint income, second earner, higher take-home, or a different rate environment), revisit this calibration before reusing the bands as-is. The calibration is not universal.

The intent is that `comfortable` ≈ "any mainstream lender will write this without question", `stretch` ≈ "available with strong credit and clean affordability", `tight` ≈ "high-LTI products only, with criteria", `out-of-reach` ≈ "specialist underwriting required or simply unaffordable on this income".

## Maintenance

When any constant changes:

1. Edit this file first, including the source citation.
2. Update the matching literal in `assets/js/affordability.js`.
3. Update the affordability test fixtures in `tests/affordability.test.js` if a band edge moved across a test case.
4. Commit with `docs: update intelligence rules — <which one>` and a one-line rationale.

---

## Deposit-risk verdict engine (`assets/js/deposit-risk.js`)

Verdict thresholds for `assessDepositRisk(investments, goals)`:

| Verdict | Condition |
|---------|-----------|
| `low-risk` | earmarked equity < 50% **OR** timeline > 12 months |
| `moderate-risk` | 50-100% equity **AND** timeline 6-12 months |
| `high-risk` | 100% equity **AND** timeline < 6 months |

**Luke's current state:** 100% in equity ETFs (VHYL/VUSA/VEVE/VFEM) + physical gold (SGLN), 3-6 month timeline → **high-risk**, urgency=high.

**Risk recommendation logic:**

- `high-risk` → "De-risk 50-100% to a Cash ISA or high-interest savings account", urgency=high. Rationale: 3-6 month timeline with 100% equity means a market correction maps directly to a deposit shortfall.
- `moderate-risk` → "Consider partially de-risking (50%)", urgency=medium.
- `low-risk` → "No immediate action required", urgency=low.

**Scenarios returned:** 5%, 10%, 15%, 20% drop. The dashboard surfaces 10% and 20%.

**Withdrawal readiness note:** Lenders need a 3-month paper trail showing the deposit source. Sell ETFs and transfer to Barclays at least 3 months before applying.

*Source:* standard lender source-of-funds requirements; volatility risk is user-specific based on 3-6 month timeline stated in `data/goals.json`.

---

## Affordability scenarios (`assessAffordabilityScenarios()`)

Three canned scenarios produced by `assessAffordabilityScenarios({ finances, criteria, goals })`:

| Scenario key | Price | Deposit | Description |
|-------------|-------|---------|-------------|
| `buyNowLowerTarget` | £340,000 | current savings (£31,193) | Buy sooner with current pot |
| `buyOnTargetDeposit` | £375,000 (engine centre) | hoped-for £50,000 | Buy when hoped deposit is reached |
| `buyAtHigherTarget` | £400,000 | 12.5% of price (£50,000) | Stretch scenario at upper budget bound |

**monthsToReady** is computed as `ceil((targetDeposit - currentSavings) / monthlyContribution)`. For `buyNowLowerTarget` it is always 0.

**Important:** Bonus (£3,000 discretionary) and pay rise scenario (£66k) are **not** used in these projections. They are available as scenario toggles only.

**Verdict for Luke's actual numbers (£3,543.54 take-home, £64k gross, April 2026):**
- buyNow £340k: stretch (LTI 4.76×, spare ~£229)
- target £375k: tight (LTI 5.07×, spare ~£19 with £50k deposit)
- higher £400k: tight (LTI 5.22×, spare negative without bonus)

---

## Maintenance (additions)

When deposit-risk thresholds change:
1. Update verdict logic in `assets/js/deposit-risk.js` `deriveVerdict()`.
2. Update the table above with rationale.
3. Update test cases in `tests/deposit-risk.test.js`.
4. Commit with `docs: update intelligence rules — deposit-risk thresholds`.
