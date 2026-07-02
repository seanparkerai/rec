// finances/section-later.js — renders the Later/Post-Move section: money flow before/after mortgage, affordability widget with price slider, and what-if savings projection chart. DOM. Rendered on the finances page.

import * as fin from '../finances.js';
import { gbp } from '../format.js';
import { assessAffordability } from '../affordability.js';
import { getMoneyFlow, getMoneyFlowPostMove } from '../money-flow.js';
import { getSavingsVelocity } from '../savings-velocity.js';
import { esc, byId as $, setText, setHTML } from '../dom.js';
import { cssVar } from '../css-vars.js';
import { prefersReducedMotion } from '../motion.js';
import { buildFlowBar, buildFlowLegend } from './section-flow.js';
import { chartOpts } from './chart-helpers.js';

export function renderLaterFlow(finData, criData, currentPrice) {
  const offer = Number(currentPrice ?? finData?.goal?.offerTarget ?? 0);
  const targetDeposit = Number(criData?.budget?.targetDeposit || finData?.goal?.targetDeposit || 0);
  const loan = Math.max(0, offer - targetDeposit);
  const monthlyMortgage = fin.calcMonthlyMortgage(loan, finData.mortgage?.ratePctAssumed || 0, finData.mortgage?.termYears || 0);

  const today = getMoneyFlow(finData);
  const after = getMoneyFlowPostMove(finData, monthlyMortgage);

  const maxTotal = Math.max(
    today.buckets.reduce((s, b) => s + Math.max(0, b.amount), 0),
    after.buckets.reduce((s, b) => s + Math.max(0, b.amount), 0),
  );

  setHTML('later-flow-today', buildFlowBar(today, maxTotal));
  setHTML('later-flow-after', buildFlowBar(after, maxTotal));
  setHTML('later-legend-today', buildFlowLegend(today));
  setHTML('later-legend-after', buildFlowLegend(after));
  setText('later-flow-headline', `Spare ${gbp(today.spare)} → ${gbp(after.spare)}/mo`);
  const cap = $('later-flow-caption');
  if (cap) {
    const verb = after.spare < 0 ? 'drops below zero' : 'drops';
    cap.innerHTML = `At <strong>${esc(gbp(offer))}</strong> the mortgage adds <strong>${esc(gbp(monthlyMortgage))}/mo</strong> and spare ${verb} from <strong>${esc(gbp(today.spare))}</strong> to <strong>${esc(gbp(after.spare))}/mo</strong>.`;
  }
}

function renderAffordWidget(finData, criData, price) {
  const r = assessAffordability({ price, finances: finData, criteria: criData });
  const pill = $('afford-pill');
  if (pill) {
    pill.className = `afford-verdict-pill afford-verdict-pill--${r.verdict}`;
    pill.textContent = r.verdict;
  }
  setText('afford-deposit', gbp(criData?.budget?.targetDeposit || finData?.goal?.targetDeposit || 0));
  setText('afford-loan', gbp(r.loanRequired));
  const ltvEl = $('afford-ltv');
  if (ltvEl) ltvEl.innerHTML = `${r.ltvPct.toFixed(1)}%<small>tier ${r.ltvTier ?? '—'}</small>`;
  setText('afford-sdlt', gbp(r.sdlt));
  setText('afford-lisa', r.bandSignals.lisaEligible ? 'Yes' : 'No');
  setText('afford-monthly', gbp(r.monthlyPI));
  const stressedEl = $('afford-stressed');
  if (stressedEl) stressedEl.innerHTML = `${esc(gbp(r.monthlyPIStressed))}<small>@${r.rateRiseRatePct.toFixed(2)}%</small>`;
  setText('afford-spare', gbp(r.monthlySpareAfter));
  setHTML('afford-why', r.whyVerdict.map((s) => `<li>${esc(s)}</li>`).join(''));
}

export function attachAffordabilityWidget(finData, criData) {
  const slider = $('afford-slider');
  const number = $('afford-price-input');
  const display = $('afford-price-display');
  if (!slider || !number) return;

  const initial = Number(finData?.goal?.offerTarget || 0);
  slider.value = String(initial);
  number.value = String(initial);
  if (display) display.textContent = gbp(initial);

  const update = (raw) => {
    const price = Math.max(100000, Math.min(2000000, Number(raw) || 0));
    if (display) display.textContent = gbp(price);
    if (slider.value !== String(price)) slider.value = String(price);
    if (number.value !== String(price)) number.value = String(price);
    renderAffordWidget(finData, criData, price);
    renderLaterFlow(finData, criData, price);
  };

  slider.addEventListener('input', (e) => update(e.target.value));
  number.addEventListener('input', (e) => update(e.target.value));
  update(initial);
}

let whatIfChart = null;
function extendProjection(projection, maxMonths) {
  const out = projection.map((p) => p.balance);
  if (out.length > maxMonths + 1) return out.slice(0, maxMonths + 1);
  const last = out[out.length - 1] ?? 0;
  while (out.length <= maxMonths) out.push(last);
  return out;
}

export function renderWhatIfChart(finData) {
  const canvas = $('what-if-canvas');
  if (!canvas || typeof Chart === 'undefined') return;
  const v = getSavingsVelocity(finData);

  const allProjections = [v.baseline, ...v.scenarios.filter((s) => Number.isFinite(s.etaMonths))];
  const maxMonths = Math.min(60, Math.ceil(Math.max(...allProjections.map((p) => p.etaMonths || 0)) + 2));
  if (!Number.isFinite(maxMonths) || maxMonths <= 0) return;
  const labels = Array.from({ length: maxMonths + 1 }, (_, i) => `M+${i}`);

  const accent = cssVar('--accent');
  const ink = cssVar('--ink');
  const muted = cssVar('--ink-muted');
  const hairline = cssVar('--hairline');
  const dataFont = cssVar('--font-data');

  const featured = v.scenarios.filter((s) => ['+£100/mo', '+£500/mo', '+£5k windfall'].includes(s.label));

  const datasets = [
    {
      label: 'Baseline',
      data: extendProjection(v.baseline.projection, maxMonths),
      borderColor: accent,
      backgroundColor: `color-mix(in oklch, ${accent} 14%, transparent)`,
      borderWidth: 2, tension: 0.25, fill: true, pointRadius: 0, pointHoverRadius: 4,
    },
    ...featured.map((s) => ({
      label: s.label,
      data: extendProjection(s.projection, maxMonths),
      borderColor: `color-mix(in oklch, ${accent} 70%, ${muted})`,
      borderWidth: 1.5, borderDash: [4, 4], tension: 0.25, pointRadius: 0, fill: false,
    })),
    {
      label: 'Target',
      data: Array(maxMonths + 1).fill(finData.goal?.targetDeposit || 0),
      borderColor: muted, borderDash: [2, 8], borderWidth: 1, pointRadius: 0, fill: false,
    },
  ];

  if (whatIfChart) whatIfChart.destroy();
  whatIfChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: prefersReducedMotion() ? false : { duration: 450 },
      plugins: {
        legend: { labels: { color: ink, font: { family: dataFont, size: 11 }, boxWidth: 10, boxHeight: 10 } },
        tooltip: {
          backgroundColor: ink, titleColor: cssVar('--paper'), bodyColor: cssVar('--paper'),
          padding: 8, displayColors: true, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${gbp(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: { ticks: { color: muted, maxTicksLimit: 10, font: { family: dataFont, size: 11 } }, grid: { display: false }, border: { color: hairline } },
        y: { ticks: { color: muted, callback: (val) => '£' + (val / 1000).toFixed(0) + 'k', font: { family: dataFont, size: 11 } }, grid: { color: hairline }, border: { display: false } },
      },
    },
  });
}
