import { loadJSON } from '../data-loader.js';
import { assessAffordabilityScenarios } from '../affordability.js';
import { gbp } from '../format.js';
import { esc } from '../dom.js';

export async function renderAffordabilityScenariosTile(financesData, criteria) {
  const el = document.getElementById('tsc-body');
  if (!el || !financesData) return;

  let goals;
  try { goals = await loadJSON('goals'); } catch { goals = null; }

  const sc = assessAffordabilityScenarios({ finances: financesData, criteria, goals });

  function scRow(key, label, sc) {
    const verdictSlug = sc.verdict.replace('-', '_');
    const mo = sc.monthsToReady > 0 ? ` — ~${sc.monthsToReady} months` : ' — available now';
    return `<li class="scenario-row-item">
      <span class="scenario-label">${esc(label)}</span>
      <span class="scenario-detail num">${gbp(sc.price)} at ~${sc.ltvPct.toFixed(0)}% LTV</span>
      <span class="verdict-badge verdict-badge--${esc(verdictSlug)}">${esc(sc.verdict)}</span>
      <span class="scenario-eta muted">${esc(mo)}</span>
    </li>`;
  }

  el.innerHTML = `<ul class="scenario-list" aria-label="Affordability scenarios">
    ${scRow('lower', 'Buy sooner, smaller', sc.buyNowLowerTarget)}
    ${scRow('target', 'Buy at hoped target', sc.buyOnTargetDeposit)}
    ${scRow('higher', 'Stretch to £400k', sc.buyAtHigherTarget)}
  </ul>`;
}
