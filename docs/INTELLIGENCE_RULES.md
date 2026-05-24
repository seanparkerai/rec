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
| stretch | ≤ 5.0× |
| tight | ≤ 5.5× |
| out-of-reach | > 5.5× |

*Source:* HSBC, Halifax, Barclays published affordability guidelines, 2024–2026. 4.5× is the standard mainstream cap; 5.0–5.5× available with strong affordability + clean credit at higher-LTI products (often with criteria, e.g. minimum income £50k).

---

## Stress-test rate

Affordability is assessed at both the contract rate and a stressed rate.

- **Stressed rate = assumed rate + 3 percentage points.**

*Source:* PRA SS3/13 (residential mortgage stress testing). Even after the FPC's 2022 withdrawal of the specific 3-pp rule, +3 pp remains the lenders' working convention.

---

## Payment-to-take-home bands

Monthly mortgage payment as % of monthly net (take-home) income.

| Band | Payment / take-home |
| --- | --- |
| comfortable | ≤ 35% |
| stretch | ≤ 45% |
| tight | ≤ 50% |
| out-of-reach | > 50% |

*Source:* FCA MCOB-aligned norms and ONS household-spending ratios. 35% is the conventional housing-cost ceiling; 50% is the FCA-typical upper bound below which stress is still considered manageable.

---

## Post-move spare-cash floors

Monthly cash left after take-home minus all bills, expenses, and the new mortgage payment.

| Band | Spare per month |
| --- | --- |
| comfortable | ≥ £400 |
| stretch | ≥ £100 |
| tight or worse | < £100 |

*Source:* household-resilience guidance from StepChange and MoneyHelper. £400/mo is a single-month buffer threshold; below £100 the household has effectively zero margin for an unexpected bill.

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

## Maintenance

When any constant changes:

1. Edit this file first, including the source citation.
2. Update the matching literal in `assets/js/affordability.js`.
3. Update the affordability test fixtures in `tests/affordability.test.js` if a band edge moved across a test case.
4. Commit with `docs: update intelligence rules — <which one>` and a one-line rationale.
