// page-finances.js — finances page coordinator.
// All rendering is delegated to assets/js/finances/section-*.js modules.
import { getFinances, getCriteria, getInvestments } from './storage.js';
import { deriveFinances } from './finance-derive.js';
import { mountSavingsEditor } from './savings-editor.js';

import { renderFinanceVerdict }      from './finances/section-verdict.js';
import { renderTiles }               from './finances/section-deposit.js';
import { renderNowFlow }             from './finances/section-flow.js';
import { renderBreakdowns }          from './finances/section-breakdowns.js';
import { renderLaterFlow, attachAffordabilityWidget, renderWhatIfChart } from './finances/section-later.js';
import { renderDepositRiskTile }     from './finances/section-deposit-risk.js';
import { renderISAAttribution }      from './finances/section-isa-attribution.js';
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
  // Verdict-led lede (3.8a) — answers the page's question before the topics.
  renderFinanceVerdict(finData, criData);
  // Topic: Today
  renderTiles(finData);
  renderNowFlow(finData);
  renderBreakdowns(finData);
  // Topic: Investments
  renderISAAttribution(finData);
  renderSavingsOverTime(finData);
  renderMonthlyDeposits(finData);
  renderISAStackedArea(finData);
  renderDividendsInterest();
  renderEpochComparison();
  renderTickerTreemap();
  renderRealisedUnrealised();
  // Topic: The purchase
  renderLaterFlow(finData, criData);
  attachAffordabilityWidget(finData, criData);
  renderWhatIfChart(finData);
  renderDepositRiskTile(finData);
}

/* Sticky topic-nav scrollspy: mark the in-view topic's chip aria-current. */
function initTopicNav() {
  const links = Array.from(document.querySelectorAll('.finance-toc a[data-topic]'));
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(links.map((a) => [a.dataset.topic, a]));
  const setCurrent = (id) => links.forEach((a) =>
    a.setAttribute('aria-current', String(a.dataset.topic === id)));
  const obs = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible && byId.has(visible.target.id)) setCurrent(visible.target.id);
  }, { rootMargin: '-30% 0px -60% 0px', threshold: [0, 0.25, 0.5] });
  document.querySelectorAll('.finance-topic[id]').forEach((s) => obs.observe(s));
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
    initTopicNav();
    // Editing cash savings / ISA value re-derives the deposit total everywhere.
    mountSavingsEditor({
      openerId: 'edit-savings-btn',
      onSaved: async () => {
        try { rawInvestments = await getInvestments(); } catch { /* keep prior */ }
        const rawFin = await getFinances();
        finData = deriveFinances(rawFin, { investments: rawInvestments });
        renderEverything();
      },
    });
  } catch (e) {
    console.error('finances init error', e);
  }
}

init();
