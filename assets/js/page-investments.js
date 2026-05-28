// page-investments.js — investments page coordinator.
import { getFinances, getInvestments } from './storage.js';
import { deriveFinances } from './finance-derive.js';

import { renderISAAttribution } from './finances/section-isa-attribution.js';
import {
  renderSavingsOverTime,
  renderMonthlyDeposits,
  renderISAStackedArea,
  renderDividendsInterest,
  renderEpochComparison,
  renderTickerTreemap,
  renderRealisedUnrealised,
} from './finances/section-v3-charts.js';

let finData = null;

function renderAll() {
  renderISAAttribution(finData);
  renderSavingsOverTime(finData);
  renderMonthlyDeposits(finData);
  renderISAStackedArea(finData);
  renderDividendsInterest();
  renderEpochComparison();
  renderTickerTreemap();
  renderRealisedUnrealised();
}

async function init() {
  try {
    let rawInvestments = null;
    try { rawInvestments = await getInvestments(); } catch { rawInvestments = null; }
    const rawFinances = await getFinances({
      onUpdate: (fresh) => {
        finData = deriveFinances(fresh, { investments: rawInvestments });
        renderAll();
      },
    });
    finData = deriveFinances(rawFinances, { investments: rawInvestments });
    renderAll();
  } catch (e) {
    console.error('investments init error', e);
  }
}

init();
