// page-finances.js — finances page coordinator.
// All rendering is delegated to assets/js/finances/section-*.js modules.
import { getFinances, getCriteria, getInvestments } from './storage.js';
import { deriveFinances } from './finance-derive.js';

import { renderTiles }               from './finances/section-deposit.js';
import { renderNowFlow }             from './finances/section-flow.js';
import { renderBreakdowns }          from './finances/section-breakdowns.js';
import { renderLaterFlow, attachAffordabilityWidget, renderWhatIfChart } from './finances/section-later.js';
import { renderDepositRiskTile }     from './finances/section-deposit-risk.js';

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
  renderDepositRiskTile(finData);
}

async function init() {
  try {
    try { rawInvestments = await getInvestments(); } catch { rawInvestments = null; }
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
