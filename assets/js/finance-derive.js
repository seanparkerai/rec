// finance-derive.js — single source of truth for derived finance values.
//
// Raw finances.json stores ONLY user-typed inputs (line items, gross salary,
// raw deductions). Every total or alias is computed here on read. This is
// the only place that knows how a total is built, so storage drift is
// impossible by construction.
//
// Pure: no DOM, no storage. Pass in raw finances (and optionally investments
// for cross-resource savings totals); receive the enriched object that all
// consumer code expects.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const sum = (arr, key) => {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((acc, item) => acc + num(item?.[key]), 0);
};
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Enrich a raw finances record with all derived totals + alias fields.
 *
 * Canonical raw keys (what consumers may rely on as inputs):
 *   income.annualGrossBase          — gross annual salary
 *   income.monthlyNetTakeHome       — net take-home per month (post tax/NI/SL/pension)
 *   income.annualBonus              — last annual bonus (NOT included in income totals)
 *   income.deductions.*             — itemised payslip deductions
 *   savings.current                 — cash savings only
 *   savings.monthlyContribution     — monthly addition to savings
 *   goal.targetDeposit              — single source for deposit target
 *   mortgage.estimatedMonthlyPayment — assumed P&I post-move
 *   oneTimeCosts[].cost, ongoingBills[].monthly, expenses[].monthly,
 *   shoppingList[].cost, giftCards[].amount  — raw line items
 *
 * Derived (computed here, never stored):
 *   income.takeHomeMonthly  (alias of monthlyNetTakeHome)
 *   income.totalMonthly     (= takeHomeMonthly; bonus excluded per house rules)
 *   income.annualBaseSalary (alias of annualGrossBase)
 *   income.monthlyGross     (annualGrossBase / 12)
 *   income.bonusMonthly     (annualBonus / 12 — informational, not in totalMonthly)
 *   oneTimeCostsTotal, ongoingBillsTotal{monthly,annual},
 *   expensesTotal{monthly,annual,weekly}, shoppingTotal, giftCardsTotal
 *   savings.giftCardsValue (= giftCardsTotal — alias for legacy callers)
 *   savings.totalSavings, savings.savingsGap, savings.monthsToSave
 *   monthlyOutgoingsPostMove{bills,expenses,mortgage,total}
 *   spare.monthly
 *
 * @param {object} raw  raw finances record (no derived fields required).
 * @param {object} [opts]
 * @param {object} [opts.investments]  raw investments record; if present,
 *                                     totalSavings includes the deposit-earmarked
 *                                     portion of trading212ISA.currentPortfolioValue.
 * @returns {object} enriched finances with derived fields.
 */
export function deriveFinances(raw, opts = {}) {
  if (!raw || typeof raw !== 'object') return raw;
  const investments = opts.investments || null;

  // --- Income aliases -------------------------------------------------------
  const annualGross = num(raw.income?.annualGrossBase);
  const takeHome = num(raw.income?.monthlyNetTakeHome);
  const annualBonus = num(raw.income?.annualBonus);
  const income = {
    ...(raw.income || {}),
    annualBaseSalary: annualGross,
    monthlyGross: round2(annualGross / 12),
    takeHomeMonthly: takeHome,
    totalMonthly: takeHome, // bonus excluded — see house rules
    bonusMonthly: round2(annualBonus / 12),
  };

  // --- Line-item totals -----------------------------------------------------
  const oneTimeCostsTotal = sum(raw.oneTimeCosts, 'cost');
  const billsMonthly = sum(raw.ongoingBills, 'monthly');
  const expensesMonthly = sum(raw.expenses, 'monthly');
  const shoppingTotal = sum(raw.shoppingList, 'cost');
  const giftCardsTotal = sum(raw.giftCards, 'amount');

  const ongoingBillsTotal = { monthly: round2(billsMonthly), annual: round2(billsMonthly * 12) };
  const expensesTotal = {
    monthly: round2(expensesMonthly),
    annual: round2(expensesMonthly * 12),
    weekly: round2(expensesMonthly / 4.33),
  };

  // --- Savings (cross-resource if investments provided) ---------------------
  // totalSavings = liquid funds available to put toward the deposit.
  //   - cash savings (current accounts / cash ISA)
  //   - + earmarked portion of the Trading 212 ISA, if investments provided
  // Gift cards are NOT deposit-eligible (a solicitor doesn't take M&S vouchers);
  // they're tracked separately and offset the move-in shopping list.
  const cashSavings = num(raw.savings?.current);
  const isaTotal = num(investments?.trading212ISA?.currentPortfolioValue);
  const isaEarmarkPct = num(investments?.trading212ISA?.earmarkPct);
  // If earmarkPct is set, only that portion counts toward the deposit.
  // Otherwise (no investments / no earmark), count the full ISA value.
  const isaForDeposit = investments?.trading212ISA
    ? (isaEarmarkPct > 0 ? round2((isaTotal * isaEarmarkPct) / 100) : isaTotal)
    : 0;
  const totalSavings = round2(cashSavings + isaForDeposit);

  const targetDeposit = num(raw.goal?.targetDeposit);
  const monthlyContribution = num(raw.savings?.monthlyContribution);
  const savingsGap = Math.max(0, round2(targetDeposit - totalSavings));
  const monthsToSave = monthlyContribution > 0 && savingsGap > 0
    ? round2(savingsGap / monthlyContribution)
    : 0;

  // Prefer pre-computed net average from investments_history (excludes market gains).
  // Falls back to portfolio÷months estimate only when history is absent (fresh install).
  const preComputedNet   = num(raw.savings?.monthlyAverage?.net);
  const preComputedGross = num(raw.savings?.monthlyAverage?.gross);
  let avgMonthlyDepositEstimate = null;
  let avgMonthlyDepositGross    = null;
  if (preComputedNet > 0) {
    avgMonthlyDepositEstimate = preComputedNet;
    avgMonthlyDepositGross    = preComputedGross || null;
  } else {
    const isaOpenedStr = investments?.trading212ISA?.accountOpened;
    if (isaTotal > 0 && isaOpenedStr) {
      const opened = new Date(isaOpenedStr);
      if (!Number.isNaN(opened.getTime())) {
        const months = Math.max(1, (Date.now() - opened.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
        avgMonthlyDepositEstimate = round2(isaTotal / months);
      }
    }
  }

  const savings = {
    ...(raw.savings || {}),
    giftCardsValue: giftCardsTotal,
    totalSavings,
    savingsGap,
    monthsToSave,
    avgMonthlyDepositEstimate,
    avgMonthlyDepositGross,
  };

  // --- Post-move outgoings + spare -----------------------------------------
  const mortgage = num(raw.mortgage?.estimatedMonthlyPayment);
  const postMoveTotal = round2(billsMonthly + expensesMonthly + mortgage);
  const monthlyOutgoingsPostMove = {
    bills: ongoingBillsTotal.monthly,
    expenses: expensesTotal.monthly,
    mortgage: round2(mortgage),
    total: postMoveTotal,
  };
  const spareMonthly = round2(takeHome - postMoveTotal);
  const spare = {
    ...(raw.spare || {}),
    monthly: spareMonthly,
  };

  return {
    ...raw,
    income,
    savings,
    oneTimeCostsTotal,
    ongoingBillsTotal,
    expensesTotal,
    shoppingTotal,
    giftCardsTotal,
    monthlyOutgoingsPostMove,
    spare,
  };
}

/**
 * Strip every derived/alias key from an enriched finances object so the
 * remainder is safe to persist as the canonical raw record. Used by tools
 * that migrate older data shapes into the post-refactor schema.
 */
export function stripDerived(enriched) {
  if (!enriched || typeof enriched !== 'object') return enriched;
  const { oneTimeCostsTotal, ongoingBillsTotal, expensesTotal, shoppingTotal,
    giftCardsTotal, monthlyOutgoingsPostMove, spare, ...rest } = enriched;
  // The "rest" object still has aliases inside income/savings — strip those too.
  void oneTimeCostsTotal; void ongoingBillsTotal; void expensesTotal;
  void shoppingTotal; void giftCardsTotal; void monthlyOutgoingsPostMove;
  void spare;
  const income = rest.income ? { ...rest.income } : undefined;
  if (income) {
    delete income.annualBaseSalary;
    delete income.monthlyGross;
    delete income.takeHomeMonthly;
    delete income.totalMonthly;
    delete income.bonusMonthly;
  }
  const savings = rest.savings ? { ...rest.savings } : undefined;
  if (savings) {
    delete savings.giftCardsValue;
    delete savings.totalSavings;
    delete savings.savingsGap;
    delete savings.monthsToSave;
  }
  return { ...rest, ...(income ? { income } : {}), ...(savings ? { savings } : {}) };
}
