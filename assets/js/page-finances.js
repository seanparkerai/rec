// page-finances.js — finances page coordinator.
// All rendering is delegated to assets/js/finances/section-*.js modules.
import { getFinances, getCriteria } from './storage.js';
import { loadJSON } from './data-loader.js';
import { deriveFinances } from './finance-derive.js';

import { renderTiles }               from './finances/section-deposit.js';
import { renderNowFlow }             from './finances/section-flow.js';
import { renderBreakdowns }          from './finances/section-breakdowns.js';
import { renderLaterFlow, attachAffordabilityWidget, renderWhatIfChart } from './finances/section-later.js';
import { renderISAAttribution }      from './finances/section-isa-attribution.js';
import { renderDepositRiskTile }     from './finances/section-deposit-risk.js';
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
let criData = null;
let rawInvestments = null;

function renderEverything() {
  renderTiles(finData);
  renderNowFlow(finData);
  renderBreakdowns(finData);
  renderLaterFlow(finData, criData);
  attachAffordabilityWidget(finData, criData);
  renderWhatIfChart(finData);
  renderISAAttribution(finData);
  renderDepositRiskTile(finData);
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
    try { rawInvestments = await loadJSON('investments'); } catch { rawInvestments = null; }
    const rawFinances = await getFinances({
      onUpdate: (fresh) => {
        finData = deriveFinances(fresh, { investments: rawInvestments });
        renderEverything();
      },
    });
    finData = deriveFinances(rawFinances, { investments: rawInvestments });
    try { criData = await getCriteria(); } catch (e) { console.error('criteria fetch failed', e); criData = null; }
    renderEverything();
  } catch (e) {
    console.error('finances init error', e);
  }
}

init();
