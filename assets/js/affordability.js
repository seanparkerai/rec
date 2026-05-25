// affordability.js — verdict engine.
// Pure module. No DOM, no storage, no fetch.
// Constants duplicated literally from docs/INTELLIGENCE_RULES.md — when that file
// changes, update the BANDS object below in lockstep (see §Maintenance there).

import {
  calcMonthlyMortgage,
  calcSDLT,
  calcLTV,
  lisaEligible,
} from './finances.js';

// --- Band constants ------------------------------------------------------------

/** Loan-to-income (loan ÷ gross annual income). Upper bound is "out-of-reach". */
const LTI_BANDS = { comfortable: 4.5, stretch: 5.5, tight: 6.0 };

/** Monthly mortgage payment as % of monthly take-home (P&I, contract rate). */
const PAYMENT_BANDS_PCT = { comfortable: 40, stretch: 52, tight: 60 };

/** Monthly cash left after total-monthly minus bills + expenses + mortgage. */
const SPARE_BANDS_GBP = { comfortable: 400, stretch: 100 };

/** LISA bonus available only up to this purchase price (statutory). */
const LISA_CAP_GBP = 450_000;

/** LTV tier boundaries — lender rate cliffs. Sorted ascending. */
const LTV_TIERS = [60, 75, 85, 90, 95];

/** Stressed-rate uplift over contract rate (percentage points). */
const STRESS_UPLIFT_PP = 3;

/** Stressed payment / take-home above this triggers a whyVerdict warning. */
const STRESS_WARNING_PCT = 60;

const VERDICTS = ['comfortable', 'stretch', 'tight', 'out-of-reach'];

// --- Helpers -------------------------------------------------------------------

/** Worst (rightmost) of a list of verdicts. */
function worst(...verdicts) {
  let idx = 0;
  for (const v of verdicts) {
    const i = VERDICTS.indexOf(v);
    if (i > idx) idx = i;
  }
  return VERDICTS[idx];
}

/** Map an LTI multiple to a verdict band. */
function bandLTI(lti) {
  if (lti <= LTI_BANDS.comfortable) return 'comfortable';
  if (lti <= LTI_BANDS.stretch) return 'stretch';
  if (lti <= LTI_BANDS.tight) return 'tight';
  return 'out-of-reach';
}

/** Map a payment % to a verdict band. */
function bandPaymentPct(pct) {
  if (pct <= PAYMENT_BANDS_PCT.comfortable) return 'comfortable';
  if (pct <= PAYMENT_BANDS_PCT.stretch) return 'stretch';
  if (pct <= PAYMENT_BANDS_PCT.tight) return 'tight';
  return 'out-of-reach';
}

/** Map a spare-cash £ value to a verdict band (no "out-of-reach" floor here). */
function bandSpare(gbp) {
  if (gbp >= SPARE_BANDS_GBP.comfortable) return 'comfortable';
  if (gbp >= SPARE_BANDS_GBP.stretch) return 'stretch';
  return 'tight';
}

/** Find which LTV tier (60/75/85/90/95) the actual LTV sits in or above. */
function ltvTierFor(ltvPct) {
  for (const tier of LTV_TIERS) {
    if (ltvPct <= tier) return tier;
  }
  return null;
}

/** Deposit needed at this price to reach the next-cheaper LTV tier. */
function depositGapToNextTier(price, currentDeposit) {
  if (!price || price <= 0) return null;
  const ltvPct = calcLTV(price - currentDeposit, price);
  const idx = LTV_TIERS.findIndex((t) => ltvPct <= t);
  if (idx <= 0) return 0;
  const nextTier = LTV_TIERS[idx - 1];
  // Avoid float drift from (1 - tier/100): use integer arithmetic.
  const requiredDeposit = Math.ceil((price * (100 - nextTier)) / 100);
  return Math.max(0, requiredDeposit - currentDeposit);
}

/** Sum monthly bills + expenses out of a finances record. */
function monthlyOutgoings(finances) {
  const bills = Number(finances?.ongoingBillsTotal?.monthly) || 0;
  const expenses = Number(finances?.expensesTotal?.monthly) || 0;
  return { bills, expenses, total: bills + expenses };
}

// --- Main export ---------------------------------------------------------------

/**
 * Assess affordability of a target price given a household's finances + criteria.
 * Pure: returns a plain object, no side effects.
 *
 * Verdict drivers (worst-band wins): LTI, payment/take-home, spare-cash post-move.
 * Stressed-rate payment is NOT a verdict driver — it surfaces as a `whyVerdict`
 * warning when > 60% of take-home.
 *
 * @param {object} args
 * @param {number} args.price        target purchase price (GBP).
 * @param {object} args.finances     contents of data/finances.json.
 * @param {object} args.criteria     contents of data/criteria.json.
 * @param {string} [args.councilTaxBand]  e.g. "D" — reserved for future v3 work.
 * @returns {object}
 */
export function assessAffordability({ price, finances, criteria, councilTaxBand: _ctb } = {}) {
  const p = Number(price) || 0;

  const grossIncome = Number(finances?.income?.annualBaseSalary || 0)
    + Number(finances?.income?.annualBonus || 0);
  const takeHome = Number(finances?.income?.takeHomeMonthly || 0);
  const totalMonthly = Number(finances?.income?.totalMonthly || takeHome);

  const targetDeposit = Number(
    criteria?.budget?.targetDeposit ?? finances?.goal?.targetDeposit ?? 0,
  );
  const currentDeposit = Number(finances?.savings?.totalSavings || 0);

  const rate = Number(finances?.mortgage?.ratePctAssumed || 0);
  const term = Number(finances?.mortgage?.termYears || 0);
  const stressedRate = rate + STRESS_UPLIFT_PP;
  const ftb = finances?.firstTimeBuyer !== false;

  // Verdict-side numbers (assumes the user buys at the target deposit).
  const loanRequired = Math.max(0, p - targetDeposit);
  const ltvPct = calcLTV(loanRequired, p);
  const ltvTier = ltvTierFor(ltvPct);
  const depositGapToTier = depositGapToNextTier(p, targetDeposit);
  const monthlyPI = calcMonthlyMortgage(loanRequired, rate, term);
  const monthlyPIStressed = calcMonthlyMortgage(loanRequired, stressedRate, term);

  const { bills, expenses, total: outgoings } = monthlyOutgoings(finances);
  const monthlyTotal = monthlyPI + outgoings;
  const monthlySpareAfter = totalMonthly - outgoings - monthlyPI;
  const monthlySpareNow = totalMonthly - outgoings;
  const spareDelta = monthlySpareAfter - monthlySpareNow;

  // Band signals.
  const incomeMultiple = grossIncome > 0 ? Math.round((loanRequired / grossIncome) * 100) / 100 : 0;
  const paymentToIncomePct = takeHome > 0 ? Math.round((monthlyPI / takeHome) * 1000) / 10 : 0;
  const stressedPaymentToIncomePct = takeHome > 0
    ? Math.round((monthlyPIStressed / takeHome) * 1000) / 10
    : 0;
  const lisaOk = lisaEligible(p);

  const bandIncomeMultiple = bandLTI(incomeMultiple);
  const bandPayment = bandPaymentPct(paymentToIncomePct);
  const bandSpareAfter = bandSpare(monthlySpareAfter);

  const verdict = worst(bandIncomeMultiple, bandPayment, bandSpareAfter);

  // Max borrow + max property (at comfortable LTI cap of 4.5×).
  const maxBorrowEstimate = Math.round(grossIncome * LTI_BANDS.comfortable);
  const maxPropertyAtCurrentDeposit = maxBorrowEstimate + currentDeposit;
  const maxPropertyAtTargetDeposit = maxBorrowEstimate + targetDeposit;

  // SDLT (FTB relief lost above £500k).
  const sdlt = calcSDLT(p, { firstTimeBuyer: ftb });

  // whyVerdict — sentence-ish drivers (kept terse; consumers may render as a list).
  const whyVerdict = [];
  whyVerdict.push(`Loan-to-income ${incomeMultiple.toFixed(2)}× sits in the ${bandIncomeMultiple} band.`);
  whyVerdict.push(`Payment is ${paymentToIncomePct.toFixed(1)}% of take-home (${bandPayment} band).`);
  if (monthlySpareAfter < 0) {
    whyVerdict.push(`Spare cash is negative (£${Math.round(monthlySpareAfter)}/mo) — outgoings exceed income.`);
  } else {
    whyVerdict.push(`£${Math.round(monthlySpareAfter)}/mo spare after the mortgage (${bandSpareAfter} band).`);
  }
  if (stressedPaymentToIncomePct > STRESS_WARNING_PCT) {
    whyVerdict.push(
      `Stressed at +${STRESS_UPLIFT_PP}pp (${stressedRate.toFixed(2)}%) the payment would be ${stressedPaymentToIncomePct.toFixed(1)}% of take-home — fails the resilience floor.`,
    );
  }
  if (!lisaOk && p > LISA_CAP_GBP) {
    whyVerdict.push(`Price exceeds the £${(LISA_CAP_GBP / 1000).toFixed(0)}k LISA cap — bonus forfeited.`);
  }
  if (sdlt > 0 && ftb && p > 500_000) {
    whyVerdict.push(`FTB SDLT relief lost above £500k — standard rates apply (£${sdlt.toLocaleString('en-GB')}).`);
  }

  const headline = buildHeadline({
    price: p,
    verdict,
    loanRequired,
    monthlyPI,
    paymentToIncomePct,
  });

  return {
    verdict,
    headline,
    maxBorrowEstimate,
    maxPropertyAtCurrentDeposit,
    maxPropertyAtTargetDeposit,
    loanRequired,
    ltvPct,
    ltvTier,
    depositGapToTier,
    monthlyPI,
    monthlyPIStressed,
    monthlyTotal,
    monthlySpareAfter,
    monthlySpareNow,
    spareDelta,
    bandSignals: {
      incomeMultiple,
      paymentToIncome: paymentToIncomePct,
      stressedPaymentToIncome: stressedPaymentToIncomePct,
      lisaEligible: lisaOk,
    },
    whyVerdict,
    // Extras for the dashboard / Phase 3 — not in the strict PLAN.md shape but cheap to expose.
    sdlt,
    bills,
    expenses,
  };
}

function buildHeadline({ price, verdict, loanRequired, monthlyPI, paymentToIncomePct }) {
  const verdictText = {
    comfortable: 'sits comfortably within your reach',
    stretch: 'is a stretch — workable with clean affordability',
    tight: 'is tight — only a higher-LTI lender will look at this',
    'out-of-reach': 'is out of reach on this income',
  }[verdict];
  const priceGbp = price.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  const loanGbp = loanRequired.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  const monthlyGbp = monthlyPI.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  return `${priceGbp} ${verdictText} — ${loanGbp} loan at ~${monthlyGbp}/month (${paymentToIncomePct.toFixed(0)}% of take-home).`;
}

// Re-export band constants for tests + consumers that want to render thresholds.
export const BANDS = {
  lti: { ...LTI_BANDS },
  payment: { ...PAYMENT_BANDS_PCT },
  spare: { ...SPARE_BANDS_GBP },
  lisaCap: LISA_CAP_GBP,
  ltvTiers: [...LTV_TIERS],
  stressUpliftPP: STRESS_UPLIFT_PP,
  stressWarningPct: STRESS_WARNING_PCT,
};
