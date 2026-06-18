// tile-savings-visuals.js — renders four visualizations: sparkline of monthly savings
// trajectory, scenarios fan (save rates ±£500/mo, +£5k windfall), networth donut
// (ISA vs cash vs debt), and withdrawal readiness seasoning timeline. DOM-rendering
// tile for the home dashboard.
import { getInvestments, getInvestmentsHistory, getGoals } from '../storage.js';
import { buildSavingsSeries } from '../savings-series.js';
import { getSavingsVelocity } from '../savings-velocity.js';
import { gbp } from '../format.js';
import { SVG_NS } from '../svg.js';

function fmtMonth(label) {
  if (!label || typeof label !== 'string' || label.length < 7) return label ?? '';
  const [y, m] = label.split('-').map(Number);
  if (!y || !m) return label;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
}

export async function renderSavingsSpark(financesData) {
  const svg = document.getElementById('td-savings-spark');
  const caption = document.getElementById('td-spark-caption');
  if (!svg || !financesData) return;

  let history;
  try { history = await getInvestmentsHistory(); } catch { history = null; }

  const goal = Number(financesData?.goal?.targetDeposit ?? 0);
  const series = buildSavingsSeries({ history, finances: financesData, goal });

  if (series.isStub || series.points.length === 0) {
    svg.replaceChildren();
    if (caption) caption.textContent = 'Run the Trading 212 importer to see your savings trajectory.';
    return;
  }

  const window = series.points.slice(-12);
  const minV = 0;
  const maxV = Math.max(goal, ...window.map((p) => p.cumulative));
  const W = 280, H = 60, PAD_X = 4, PAD_Y = 6;
  const xs = (i) => PAD_X + (i / Math.max(1, window.length - 1)) * (W - 2 * PAD_X);
  const ys = (v) => H - PAD_Y - ((v - minV) / Math.max(1, maxV - minV)) * (H - 2 * PAD_Y);

  const targetY = ys(goal);
  const linePath = window.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.cumulative).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${xs(window.length - 1).toFixed(1)} ${(H - PAD_Y).toFixed(1)} L ${xs(0).toFixed(1)} ${(H - PAD_Y).toFixed(1)} Z`;

  svg.replaceChildren();
  const targetLine = document.createElementNS(SVG_NS, 'line');
  targetLine.setAttribute('x1', String(PAD_X));
  targetLine.setAttribute('x2', String(W - PAD_X));
  targetLine.setAttribute('y1', targetY.toFixed(1));
  targetLine.setAttribute('y2', targetY.toFixed(1));
  targetLine.setAttribute('class', 'deposit-sparkline__target');
  svg.appendChild(targetLine);
  const area = document.createElementNS(SVG_NS, 'path');
  area.setAttribute('d', areaPath);
  area.setAttribute('class', 'deposit-sparkline__area');
  svg.appendChild(area);
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('d', linePath);
  line.setAttribute('class', 'deposit-sparkline__line');
  svg.appendChild(line);

  if (caption) {
    const last = window[window.length - 1];
    const first = window[0];
    const monthsSpan = Math.max(1, window.length - 1);
    const avgPerMo = (last.cumulative - first.cumulative) / monthsSpan;
    if (series.targetLine.etaMonth) {
      caption.textContent = `At ${gbp(Math.round(avgPerMo))}/mo you hit ${gbp(goal)} in ${fmtMonth(series.targetLine.etaMonth)}.`;
    } else {
      caption.textContent = `${gbp(last.cumulative)} saved · averaging ${gbp(Math.round(avgPerMo))}/mo over the last ${window.length} months.`;
    }
  }
}

export async function renderScenariosFan(financesData) {
  const svg = document.getElementById('tsf-svg');
  const caption = document.getElementById('tsf-caption');
  if (!svg || !financesData) return;

  const velocity = getSavingsVelocity(financesData);
  if (!velocity || !Number.isFinite(velocity.baseline?.etaMonths)) {
    svg.replaceChildren();
    if (caption) caption.textContent = 'Not enough finance data yet to project scenarios.';
    return;
  }

  const labels = ['−£500/mo', '−£200/mo', 'baseline', '+£200/mo', '+£500/mo', '+£5k windfall'];
  const items = labels.map((l) => {
    if (l === 'baseline') {
      return { label: 'Baseline', etaMonths: velocity.baseline.etaMonths, etaDate: velocity.baseline.etaDate };
    }
    const s = velocity.scenarios.find((x) => x.label === l);
    return s ? { label: s.label, etaMonths: s.etaMonths, etaDate: s.etaDate } : null;
  }).filter(Boolean);

  const maxEta = Math.max(...items.map((i) => Number.isFinite(i.etaMonths) ? i.etaMonths : 0));
  if (maxEta <= 0) {
    svg.replaceChildren();
    if (caption) caption.textContent = 'Already at target — no projection needed.';
    return;
  }

  const W = 320, H = 140, PAD_L = 92, PAD_R = 12, PAD_T = 10, PAD_B = 10;
  const rowH = (H - PAD_T - PAD_B) / items.length;
  const barH = Math.max(6, rowH * 0.55);

  svg.replaceChildren();
  items.forEach((it, i) => {
    const y = PAD_T + i * rowH + (rowH - barH) / 2;
    const eta = Number.isFinite(it.etaMonths) ? it.etaMonths : maxEta;
    const w = ((eta / maxEta) * (W - PAD_L - PAD_R));
    const isBaseline = it.label === 'Baseline';

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', String(PAD_L - 6));
    label.setAttribute('y', String(y + barH / 2 + 4));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('class', `scenarios-fan__label${isBaseline ? ' is-baseline' : ''}`);
    label.textContent = it.label;
    svg.appendChild(label);

    const bar = document.createElementNS(SVG_NS, 'rect');
    bar.setAttribute('x', String(PAD_L));
    bar.setAttribute('y', String(y));
    bar.setAttribute('width', String(Math.max(2, w)));
    bar.setAttribute('height', String(barH));
    bar.setAttribute('class', `scenarios-fan__bar${isBaseline ? ' is-baseline' : ''}`);
    svg.appendChild(bar);

    const val = document.createElementNS(SVG_NS, 'text');
    val.setAttribute('x', String(PAD_L + w + 4));
    val.setAttribute('y', String(y + barH / 2 + 4));
    val.setAttribute('class', 'scenarios-fan__value');
    val.textContent = `${Math.ceil(eta)} mo`;
    svg.appendChild(val);
  });

  if (caption) {
    const baseline = items.find((i) => i.label === 'Baseline');
    const plus500 = items.find((i) => i.label === '+£500/mo');
    if (baseline && plus500 && Number.isFinite(baseline.etaMonths) && Number.isFinite(plus500.etaMonths)) {
      const delta = Math.max(0, Math.round((baseline.etaMonths - plus500.etaMonths) * 10) / 10);
      caption.textContent = `Adding £500/mo brings target ${delta} months closer.`;
    } else {
      caption.textContent = 'Scenario projection ready.';
    }
  }
}

export async function renderNetworthDonut(financesData) {
  const svg = document.getElementById('tnw-svg');
  const statsEl = document.getElementById('tnw-stats');
  const caption = document.getElementById('tnw-caption');
  if (!svg || !financesData) return;

  const isaValue = Number(financesData?.savings?.totalSavings ?? 0)
    - Number(financesData?.savings?.cashSavings ?? 0);
  const cashValue = Number(financesData?.savings?.cashSavings ?? 0);
  const cardDebt = Number(financesData?.debts?.creditCardsBalance ?? 0);

  const total = Math.max(1, isaValue + cashValue);
  const effective = Math.max(0, isaValue + cashValue - cardDebt);

  const cx = 100, cy = 100, r = 70, stroke = 18;
  const circ = 2 * Math.PI * r;
  const isaFrac = isaValue / total;
  const cashFrac = cashValue / total;

  svg.replaceChildren();
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('cx', String(cx)); track.setAttribute('cy', String(cy)); track.setAttribute('r', String(r));
  track.setAttribute('class', 'networth-donut__track');
  track.setAttribute('stroke-width', String(stroke));
  svg.appendChild(track);
  const isaArc = document.createElementNS(SVG_NS, 'circle');
  isaArc.setAttribute('cx', String(cx)); isaArc.setAttribute('cy', String(cy)); isaArc.setAttribute('r', String(r));
  isaArc.setAttribute('class', 'networth-donut__isa');
  isaArc.setAttribute('stroke-width', String(stroke));
  isaArc.setAttribute('stroke-dasharray', `${(circ * isaFrac).toFixed(2)} ${circ.toFixed(2)}`);
  isaArc.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
  svg.appendChild(isaArc);
  if (cashFrac > 0) {
    const cashArc = document.createElementNS(SVG_NS, 'circle');
    cashArc.setAttribute('cx', String(cx)); cashArc.setAttribute('cy', String(cy)); cashArc.setAttribute('r', String(r));
    cashArc.setAttribute('class', 'networth-donut__cash');
    cashArc.setAttribute('stroke-width', String(stroke));
    cashArc.setAttribute('stroke-dasharray', `${(circ * cashFrac).toFixed(2)} ${circ.toFixed(2)}`);
    cashArc.setAttribute('stroke-dashoffset', `${(-circ * isaFrac).toFixed(2)}`);
    cashArc.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
    svg.appendChild(cashArc);
  }
  const centerVal = document.createElementNS(SVG_NS, 'text');
  centerVal.setAttribute('x', String(cx)); centerVal.setAttribute('y', String(cy + 2));
  centerVal.setAttribute('text-anchor', 'middle');
  centerVal.setAttribute('class', 'networth-donut__value');
  centerVal.textContent = gbp(effective);
  svg.appendChild(centerVal);
  const centerLbl = document.createElementNS(SVG_NS, 'text');
  centerLbl.setAttribute('x', String(cx)); centerLbl.setAttribute('y', String(cy + 22));
  centerLbl.setAttribute('text-anchor', 'middle');
  centerLbl.setAttribute('class', 'networth-donut__label');
  centerLbl.textContent = 'Effective deposit';
  svg.appendChild(centerLbl);

  if (statsEl) {
    statsEl.innerHTML = `
      <div><dt>ISA earmarked</dt><dd class="num">${gbp(Math.round(isaValue))}</dd></div>
      <div><dt>Cash</dt><dd class="num">${gbp(Math.round(cashValue))}</dd></div>
      <div><dt>Card debt</dt><dd class="num">${cardDebt > 0 ? '−' + gbp(Math.round(cardDebt)) : '£0'}</dd></div>`;
  }
  if (caption) {
    if (cardDebt > 0) {
      caption.textContent = `Your effective deposit is ${gbp(Math.round(effective))} after subtracting ${gbp(Math.round(cardDebt))} in card debt.`;
    } else {
      caption.textContent = `Your effective deposit is ${gbp(Math.round(effective))} — no card-debt drag.`;
    }
  }
}

export async function renderWithdrawalReadiness() {
  const bar = document.getElementById('tws-bar');
  const fill = document.getElementById('tws-fill');
  const marker = document.getElementById('tws-marker');
  const caption = document.getElementById('tws-caption');
  if (!bar) return;

  let goals, investments;
  try { goals = await getGoals(); } catch { goals = null; }
  try { investments = await getInvestments(); } catch { investments = null; }

  const SEASONING_MONTHS = 3;
  const today = new Date();
  const applyDate = new Date(today.getFullYear(), today.getMonth() + 4, today.getDate());
  const transferBy = new Date(applyDate.getFullYear(), applyDate.getMonth() - SEASONING_MONTHS, applyDate.getDate());
  const totalDays = Math.max(1, Math.round((applyDate - today) / 86400000));
  const transferDayOffset = Math.max(0, Math.round((transferBy - today) / 86400000));
  const markerPct = Math.min(100, Math.max(0, (transferDayOffset / totalDays) * 100));

  if (fill) fill.style.setProperty('--seasoning-pct', `${markerPct.toFixed(1)}%`);
  if (marker) marker.style.setProperty('--marker-pct', `${markerPct.toFixed(1)}%`);

  if (caption) {
    const opts = { day: 'numeric', month: 'short', year: 'numeric' };
    const transferLabel = transferBy.toLocaleDateString('en-GB', opts);
    caption.textContent = `Sell & transfer to a current account by ${transferLabel} for the ${SEASONING_MONTHS}-month deposit seasoning lenders expect.`;
  }
}
