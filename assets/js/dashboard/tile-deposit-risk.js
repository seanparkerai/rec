import { getInvestments, getGoals } from '../storage.js';
import { assessDepositRisk } from '../deposit-risk.js';
import { gbp } from '../format.js';
import { esc } from '../dom.js';

export async function renderDepositRiskTile() {
  const el = document.getElementById('tdr-body');
  const badge = document.getElementById('tdr-badge');
  if (!el) return;

  let investments, goals;
  try {
    investments = await getInvestments();
    goals = await getGoals();
  } catch { return; }
  if (!investments || !goals) return;

  const risk = assessDepositRisk(investments, goals);
  const verdictSlug = risk.verdict.replace('-', '_');

  if (badge) {
    badge.className = `verdict-badge verdict-badge--${verdictSlug}`;
    badge.textContent = risk.verdict.toUpperCase().replace('-', ' ');
  }

  const scenarioRows = risk.scenarios
    .filter((s) => [10, 20].includes(s.pctDrop))
    .map((s) => `<li class="deposit-risk-row">
      If markets drop ${s.pctDrop}%: <strong class="num">${gbp(s.newValue)}</strong>
      <span class="muted"> — that's ${gbp(s.gapImpact)} off your deposit</span>
    </li>`)
    .join('');

  el.innerHTML = `
    <p class="tile-kpi num">${gbp(risk.currentValue)}</p>
    <ul class="deposit-risk-list" aria-label="Market drop scenarios">${scenarioRows}</ul>
    <p class="deposit-risk-action muted">${esc(risk.recommendation.action)}</p>`;
}
