// page-home.js — dashboard coordinator.
// All tile rendering is delegated to assets/js/dashboard/tile-*.js modules.
import { getFinances, getProfile, getCriteria, getInvestments } from './storage.js';
import { normalizeProfile } from './profile-schema.js';
import { deriveFinances } from './finance-derive.js';
import { byId } from './dom.js';

import { renderLede }                      from './dashboard/tile-lede.js';
import { renderDeposit }                   from './dashboard/tile-deposit.js';
import { renderAffordability }             from './dashboard/tile-affordability.js';
import { renderMoneyFlow }                 from './dashboard/tile-money-flow.js';
import { renderShortlist }                 from './dashboard/tile-shortlist.js';
import { renderJourneyTrack }              from './dashboard/tile-journey.js';
import { renderCriteriaProse }             from './dashboard/tile-criteria.js';
import { renderReadinessTile }             from './dashboard/tile-readiness.js';
import { renderDepositRiskTile }           from './dashboard/tile-deposit-risk.js';
import { renderAffordabilityScenariosTile } from './dashboard/tile-affordability-scenarios.js';
import { renderISAYTD }                    from './dashboard/tile-isa-ytd.js';
import { renderNba }                        from './dashboard/tile-nba.js';
import {
  renderSavingsSpark,
  renderScenariosFan,
  renderNetworthDonut,
  renderWithdrawalReadiness,
} from './dashboard/tile-savings-visuals.js';

const LOADING_IDS = ['td-headline', 'tf-headline', 'ta-verdict', 'tj-next-text', 'tc-prose'];

function markLoading() {
  for (const id of LOADING_IDS) {
    const el = byId(id);
    if (el) { el.dataset.loading = 'true'; el.textContent = ''; }
  }
}

function clearStuckLoading() {
  for (const id of LOADING_IDS) {
    const el = byId(id);
    if (el && el.dataset.loading) { delete el.dataset.loading; if (!el.textContent.trim()) el.textContent = '—'; }
  }
}

async function init() {
  markLoading();
  let rawFinances = null, rawInvestments = null, profile = null, criteria = null;

  try { rawInvestments = await getInvestments(); } catch { rawInvestments = null; }

  const renderAll = (financesData) => {
    renderLede(profile, criteria, financesData);
    if (financesData) {
      renderDeposit(financesData);
      if (criteria) {
        renderAffordability(financesData, criteria);
        renderMoneyFlow(financesData, criteria);
      }
    }
    renderShortlist(financesData, criteria);
    renderJourneyTrack();
    renderCriteriaProse(criteria, profile, financesData);
    renderISAYTD();
    renderReadinessTile(financesData);
    renderDepositRiskTile();
    renderAffordabilityScenariosTile(financesData, criteria);
    renderSavingsSpark(financesData);
    renderScenariosFan(financesData);
    renderNetworthDonut(financesData);
    renderWithdrawalReadiness();
    clearStuckLoading();
  };

  try {
    rawFinances = await getFinances({
      onUpdate: (fresh) => renderAll(deriveFinances(fresh, { investments: rawInvestments })),
    });
  } catch (e) { console.error('finances error', e); }
  try { profile = normalizeProfile(await getProfile()); } catch (e) { console.error('profile error', e); }
  try { criteria = await getCriteria(); } catch (e) { console.error('criteria error', e); }

  const financesData = deriveFinances(rawFinances, { investments: rawInvestments });
  renderAll(financesData);

  // v3 L5 — Next-Best-Action strip (self-contained; never blocks the bento).
  renderNba().catch((e) => console.error('nba error', e));
}

function ready(fn) {
  if (document.readyState === 'complete') fn();
  else window.addEventListener('load', fn, { once: true });
}
ready(init);
