// finances/section-deposit-risk.js — renders the Deposit Risk section: waterfall SVG showing current value, −10%, −20% scenarios, and impact badges. DOM. Rendered on the finances page.

import { getInvestments, getGoals } from '../storage.js';
import { assessDepositRisk } from '../deposit-risk.js';
import { gbp } from '../format.js';
import { SVG_NS as SVG_NS_F } from '../svg.js';

export async function renderDepositRiskTile(finData) {
  const svg = document.getElementById('dr-waterfall-svg');
  const badge = document.getElementById('tdr-badge');
  const cap = document.getElementById('dr-waterfall-caption');
  const detailsBody = document.getElementById('dr-waterfall-rows');
  if (!svg) return;

  let investments, goals;
  try {
    investments = await getInvestments();
    goals = await getGoals();
  } catch { return; }
  if (!investments || !goals) return;
  const risk = assessDepositRisk(investments, goals);
  const verdictClass = risk.verdict.replace('-', '_');
  if (badge) {
    badge.className = `verdict-badge verdict-badge--${verdictClass}`;
    badge.textContent = risk.verdict.toUpperCase().replace('-', ' ');
  }

  const current = Number(risk.currentValue) || 0;
  const monthly = Number(finData?.savings?.monthlyContribution ?? 0);
  const steps = [
    { label: 'Current', value: current, kind: 'base' },
    { label: 'If −10%', value: current * 0.9, kind: 'drop' },
    { label: 'If −20%', value: current * 0.8, kind: 'drop' },
  ];

  const W = 500, H = 200, PAD_L = 50, PAD_R = 12, PAD_T = 18, PAD_B = 36;
  const colW = (W - PAD_L - PAD_R) / steps.length;
  const maxV = Math.max(...steps.map((s) => s.value), 1);
  const ys = (v) => H - PAD_B - (v / maxV) * (H - PAD_T - PAD_B);

  svg.replaceChildren();
  const guide = document.createElementNS(SVG_NS_F, 'line');
  guide.setAttribute('x1', String(PAD_L)); guide.setAttribute('x2', String(W - PAD_R));
  guide.setAttribute('y1', ys(current).toFixed(1)); guide.setAttribute('y2', ys(current).toFixed(1));
  guide.setAttribute('class', 'deposit-risk-waterfall__guide');
  svg.appendChild(guide);

  steps.forEach((s, i) => {
    const x = PAD_L + i * colW + colW * 0.15;
    const w = colW * 0.7;
    const y = ys(s.value);
    const h = H - PAD_B - y;
    const rect = document.createElementNS(SVG_NS_F, 'rect');
    rect.setAttribute('x', x.toFixed(1)); rect.setAttribute('y', y.toFixed(1));
    rect.setAttribute('width', w.toFixed(1)); rect.setAttribute('height', h.toFixed(1));
    rect.setAttribute('class', `deposit-risk-waterfall__step deposit-risk-waterfall__step--${s.kind}`);
    svg.appendChild(rect);

    const val = document.createElementNS(SVG_NS_F, 'text');
    val.setAttribute('x', String(x + w / 2)); val.setAttribute('y', (y - 4).toFixed(1));
    val.setAttribute('text-anchor', 'middle'); val.setAttribute('class', 'deposit-risk-waterfall__value');
    val.textContent = gbp(Math.round(s.value));
    svg.appendChild(val);

    const lbl = document.createElementNS(SVG_NS_F, 'text');
    lbl.setAttribute('x', String(x + w / 2)); lbl.setAttribute('y', String(H - PAD_B + 16));
    lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('class', 'deposit-risk-waterfall__label');
    lbl.textContent = s.label;
    svg.appendChild(lbl);

    if (i > 0) {
      const monthsLost = monthly > 0 ? Math.round((current - s.value) / monthly) : 0;
      const lossLbl = document.createElementNS(SVG_NS_F, 'text');
      lossLbl.setAttribute('x', String(x + w / 2)); lossLbl.setAttribute('y', String(H - PAD_B + 30));
      lossLbl.setAttribute('text-anchor', 'middle'); lossLbl.setAttribute('class', 'deposit-risk-waterfall__sub');
      lossLbl.textContent = `≈ ${monthsLost} months lost`;
      svg.appendChild(lossLbl);
    }
  });

  if (cap) {
    const lossAt20 = current * 0.2;
    const monthsLost = monthly > 0 ? Math.round(lossAt20 / monthly) : 0;
    cap.textContent = `A 20% market drop wipes out about ${monthsLost} months of savings progress.`;
  }
  if (detailsBody) {
    detailsBody.innerHTML = risk.scenarios
      .filter((s) => [10, 20].includes(s.pctDrop))
      .map((s) => `<div class="dr-waterfall-row"><span>Markets drop ${s.pctDrop}%</span><span class="num">${gbp(s.newValue)}</span><span class="num">${gbp(s.gapImpact)} deposit impact</span></div>`)
      .join('');
  }
}
