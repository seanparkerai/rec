// deposit-risk.js — pure risk assessment for equity-backed deposit funds.
// No DOM, no storage, no fetch.

/**
 * Assess deposit risk given an investments record and a goals record.
 *
 * Verdict logic:
 *   low-risk     — earmarked < 50% in equities OR timeline > 12 months
 *   moderate-risk — 50-100% in equities AND timeline 6-12 months
 *   high-risk    — 100% in equities AND timeline < 6 months
 *
 * @param {object} investments  contents of data/investments.json
 * @param {object} goals        contents of data/goals.json
 * @returns {{
 *   currentValue: number,
 *   earmarkPct: number,
 *   timelineMonthsMax: number,
 *   scenarios: Array<{ label: string, pctDrop: number, newValue: number, gapImpact: number }>,
 *   verdict: 'low-risk' | 'moderate-risk' | 'high-risk',
 *   recommendation: { action: string, urgency: 'low' | 'medium' | 'high', reasoning: string }
 * }}
 */
export function assessDepositRisk(investments, goals) {
  const isa = investments?.trading212ISA ?? {};
  const currentValue = Number(isa.currentPortfolioValue) || 0;
  const earmarkPct = Number(isa.earmarkPct) || 0;

  const horizon = String(goals?.timeline?.horizon ?? '');
  const timelineMonthsMax = parseHorizonMax(horizon);

  const equityPct = deriveEquityPct(isa);

  const hopedDeposit = Number(goals?.deposit?.hopedFor) || 0;

  const dropPcts = [5, 10, 15, 20];
  const scenarios = dropPcts.map((pct) => {
    const newValue = Math.round(currentValue * (1 - pct / 100));
    const gapImpact = newValue - currentValue;
    return { label: `Markets drop ${pct}%`, pctDrop: pct, newValue, gapImpact };
  });

  const verdict = deriveVerdict(equityPct, timelineMonthsMax);
  const recommendation = buildRecommendation(verdict, timelineMonthsMax, currentValue, hopedDeposit);

  return {
    currentValue,
    earmarkPct,
    equityPct,
    timelineMonthsMax,
    scenarios,
    verdict,
    recommendation,
  };
}

// --- Helpers -------------------------------------------------------------------

function parseHorizonMax(horizon) {
  // Handles "3-6 months", "6-12 months", "12 months", "18 months" etc.
  const rangeMatch = horizon.match(/(\d+)\s*[-–]\s*(\d+)\s*month/i);
  if (rangeMatch) return Number(rangeMatch[2]);
  const singleMatch = horizon.match(/(\d+)\s*month/i);
  if (singleMatch) return Number(singleMatch[1]);
  return 12; // default — unknown horizon = moderate caution
}

function deriveEquityPct(isa) {
  // If no detailed holding data: use epoch to infer.
  // etfCore epoch = equity ETFs (VHYL/VUSA/VEVE/VFEM) + SGLN gold.
  // We treat the whole earmark as equity for risk purposes (conservative).
  const epochs = isa.strategyEpochs ?? [];
  const activeEpoch = epochs.find((e) => e.end === null) ?? epochs[epochs.length - 1];
  if (!activeEpoch) return 100;
  // etfCore includes gold (~10-15%) but we conservatively class the full fund as equity-risk.
  if (activeEpoch.id === 'etfCore') return 100;
  if (activeEpoch.id === 'stockpicker') return 100;
  return 100;
}

function deriveVerdict(equityPct, timelineMonthsMax) {
  if (equityPct < 50 || timelineMonthsMax > 12) return 'low-risk';
  if (timelineMonthsMax <= 6) return 'high-risk';
  return 'moderate-risk';
}

function buildRecommendation(verdict, timelineMonthsMax, currentValue, hopedDeposit) {
  if (verdict === 'high-risk') {
    return {
      action: 'De-risk 50-100% to a Cash ISA or high-interest savings account',
      urgency: 'high',
      reasoning: `${timelineMonthsMax}-month timeline combined with 100% in equity ETFs means a market correction directly reduces your deposit. Sell ETFs and transfer to Barclays at least 3 months before applying so lenders can see a clean source trail.`,
    };
  }
  if (verdict === 'moderate-risk') {
    return {
      action: 'Consider partially de-risking (50%) once timeline firms up',
      urgency: 'medium',
      reasoning: 'Timeline is 6-12 months — enough runway but market volatility remains a live risk. Gradual de-risk over the next few months reduces exposure without sacrificing all growth.',
    };
  }
  return {
    action: 'No immediate action required — review if timeline shortens',
    urgency: 'low',
    reasoning: 'Either timeline is over 12 months or equity allocation is below 50%. Monitor quarterly.',
  };
}
