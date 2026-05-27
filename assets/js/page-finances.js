// page-finances.js — finances page (Phase 4a overhaul).
// NOW: deposit hero (with LISA band) + full-width money-flow + bills/expenses tables (sparkbars).
// LATER: side-by-side flow today vs after-move + unified affordability widget + "What if" chart + collapsible cards.
import { getFinances, getCriteria } from './storage.js';
import { loadJSON } from './data-loader.js';
import * as fin from './finances.js';
import { gbp, gbpPence, monthsAsDuration } from './format.js';
import { assessAffordability, BANDS } from './affordability.js';
import { getMoneyFlow, getMoneyFlowPostMove } from './money-flow.js';
import { getSavingsVelocity } from './savings-velocity.js';
import { analysePerformance, getMonthlyCumulativeDeposits, getEpochAttribution } from './investment-performance.js';
import { buildSavingsSeries } from './savings-series.js';
import { assessDepositRisk } from './deposit-risk.js';
import { deriveFinances } from './finance-derive.js';
import { esc, byId as $, setText, setHTML } from './dom.js';
import { prefersReducedMotion } from './motion.js';
import { cssVar } from './css-vars.js';

let finData = null;
let criData = null;

// ============================================================
// NOW — deposit hero (kept) + full-width flow + tables with sparkbars
// ============================================================

function renderTiles() {
  const target = finData.goal?.targetDeposit || 0;
  const saved = finData.savings?.totalSavings || 0;
  const pct = fin.calcDepositProgress(saved, target);
  const months = fin.calcMonthsToTarget(saved, target, finData.savings?.monthlyContribution || 0);
  setText('tile-progress', String(pct));
  const bar = $('progress-bar'); if (bar) bar.style.width = `${pct}%`;
  setText('tile-saved', gbp(saved));
  const goalMo = Number(finData.savings?.monthlyContribution || 0);
  const avgMo = finData.savings?.avgMonthlyDepositEstimate;
  setText('tile-monthly', goalMo ? `${gbp(goalMo)} goal` : '—');
  setText('tile-monthly-avg', Number.isFinite(avgMo) && avgMo > 0 ? `${gbp(avgMo)} avg` : '');
  setText('tile-months', Number.isFinite(months) ? `${monthsAsDuration(months)}` : '—');

  // LISA band — show eligibility note tied to the current goal price.
  const goalPrice = finData.goal?.targetPropertyPrice || finData.goal?.offerTarget || 0;
  const lisaEl = $('tile-lisa');
  if (lisaEl) {
    if (goalPrice > 0 && goalPrice <= BANDS.lisaCap) {
      lisaEl.innerHTML = `LISA eligible at <strong>${esc(gbp(goalPrice))}</strong> — bonus up to <strong>£1,000/yr</strong>`;
    } else if (goalPrice > BANDS.lisaCap) {
      lisaEl.innerHTML = `LISA cap is <strong>${esc(gbp(BANDS.lisaCap))}</strong>; at ${esc(gbp(goalPrice))} the bonus is forfeited.`;
    } else {
      lisaEl.innerHTML = `LISA cap <strong>${esc(gbp(BANDS.lisaCap))}</strong>`;
    }
  }
}

// Reusable: build an SVG flow bar (mirrors the dashboard tile-flow shape).
const FLOW_PALETTE = { bills: 'bills', expenses: 'expenses', savings: 'savings', mortgage: 'mortgage', spare: 'spare' };
function buildFlowBar(flow, maxTotal) {
  const w = 300, h = 40, padX = 4, barY = 8, barH = 24;
  const innerW = w - 2 * padX;
  const scale = (val) => Math.max(0, (val / maxTotal) * innerW);
  let x = padX;
  let svg = '';
  for (const bucket of flow.buckets) {
    if (bucket.amount <= 0) continue;
    const bw = scale(bucket.amount);
    const cls = `flow__seg flow__seg--${FLOW_PALETTE[bucket.kind] || 'bills'}`;
    svg += `<rect class="${cls}" x="${x.toFixed(1)}" y="${barY}" width="${bw.toFixed(1)}" height="${barH}" data-bucket="${esc(bucket.kind)}" />`;
    if (bw > 36) {
      svg += `<text class="flow__seg-label" x="${(x + bw / 2).toFixed(1)}" y="${(barY + barH / 2 + 3).toFixed(1)}" text-anchor="middle" pointer-events="none">${esc(gbp(bucket.amount))}</text>`;
    }
    x += bw;
  }
  if (flow.spare < 0) {
    const sw = scale(Math.abs(flow.spare));
    svg += `<rect class="flow__seg flow__seg--negative" x="${(w - padX - sw).toFixed(1)}" y="${barY}" width="${sw.toFixed(1)}" height="${barH}" data-bucket="negative" />`;
  }
  return svg;
}

function buildFlowLegend(flow) {
  return flow.buckets.map((b) => `
    <li>
      <span class="swatch swatch--${esc(FLOW_PALETTE[b.kind] || 'bills')}" aria-hidden="true"></span>
      <span>${esc(b.name)}</span>
      <span class="num">${esc(gbp(b.amount))}</span>
    </li>
  `).join('');
}

function renderNowFlow() {
  const flow = getMoneyFlow(finData);
  const total = flow.buckets.reduce((s, b) => s + Math.max(0, b.amount), 0);
  setHTML('now-flow-bar', buildFlowBar(flow, total));
  setHTML('now-flow-legend', buildFlowLegend(flow));
  setText('now-flow-headline', `${gbp(flow.income.total)}/mo in · ${gbp(flow.spare)} spare`);
  const cap = $('now-flow-caption');
  if (cap) {
    const billsPct = ((flow.buckets.find((b) => b.kind === 'bills')?.amount || 0) / total) * 100;
    const savingsPct = ((flow.buckets.find((b) => b.kind === 'savings')?.amount || 0) / total) * 100;
    cap.innerHTML = `Bills take <strong>${billsPct.toFixed(0)}%</strong> of monthly income; savings absorb <strong>${savingsPct.toFixed(0)}%</strong>.`;
  }
}

// ---- Tables (kept) ------------------------------------------------------------

function sumNumeric(arr, key) {
  return (arr || []).reduce((s, x) => s + (Number(x[key]) || 0), 0);
}

function renderTable(targetId, rows, columns, totals = null, sparkColumnKey = null, sparkMax = null) {
  const el = $(targetId);
  if (!el) return;
  if (!rows?.length) { el.innerHTML = `<p class="muted">None.</p>`; return; }
  const head = columns.map((c) => `<th${c.numeric ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('');
  const body = rows.map((r) => `
    <tr>${columns.map((c) => {
      const v = c.get(r);
      const formatted = c.format ? c.format(v) : (v ?? '');
      const isSparkCol = (sparkColumnKey && c.key === sparkColumnKey);
      const spark = isSparkCol ? sparkbar(v, sparkMax) : '';
      return `<td${c.numeric ? ' class="num"' : ''}>${esc(formatted)}${spark}</td>`;
    }).join('')}</tr>
  `).join('');
  const foot = totals ? `<tfoot><tr>${columns.map((c) => `<td${c.numeric ? ' class="num"' : ''}><strong>${esc(totals[c.key] ?? '')}</strong></td>`).join('')}</tr></tfoot>` : '';
  el.innerHTML = `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}

function sparkbar(value, max) {
  if (!max || max <= 0) return '';
  const pct = Math.min(100, Math.max(0, (Number(value) / max) * 100));
  return `<span class="sparkbar" aria-hidden="true"><span style="width:${pct.toFixed(1)}%"></span></span>`;
}

function renderBreakdowns() {
  // Ongoing bills — sparkbar on Monthly.
  const billsAnnual = sumNumeric(finData.ongoingBills, 'annual');
  const billsMonthly = sumNumeric(finData.ongoingBills, 'monthly');
  const billsMax = Math.max(...(finData.ongoingBills || []).map((b) => Number(b.monthly) || 0), 1);
  renderTable('tbl-bills', finData.ongoingBills, [
    { label: 'Bill', get: (r) => r.item, key: 'item' },
    { label: 'Annual', get: (r) => r.annual, format: (v) => gbp(v), numeric: true, key: 'annual' },
    { label: 'Monthly', get: (r) => r.monthly, format: (v) => gbpPence(v), numeric: true, key: 'monthly' },
  ], { item: 'Total', annual: gbp(billsAnnual), monthly: gbpPence(billsMonthly) }, 'monthly', billsMax);

  // Expenses — sparkbar on Monthly.
  const expAnnual = sumNumeric(finData.expenses, 'annual');
  const expMonthly = sumNumeric(finData.expenses, 'monthly');
  const expWeekly = sumNumeric(finData.expenses, 'weekly');
  const expMax = Math.max(...(finData.expenses || []).map((b) => Number(b.monthly) || 0), 1);
  renderTable('tbl-expenses', finData.expenses, [
    { label: 'Expense', get: (r) => r.item, key: 'item' },
    { label: 'Annual', get: (r) => r.annual, format: (v) => gbp(v), numeric: true, key: 'annual' },
    { label: 'Monthly', get: (r) => r.monthly, format: (v) => gbp(v), numeric: true, key: 'monthly' },
    { label: 'Weekly', get: (r) => r.weekly, format: (v) => gbpPence(v), numeric: true, key: 'weekly' },
  ], { item: 'Total', annual: gbp(expAnnual), monthly: gbp(expMonthly), weekly: gbpPence(expWeekly) }, 'monthly', expMax);

  // One-time — sparkbar on Cost.
  const oneTimeTotal = sumNumeric(finData.oneTimeCosts, 'cost');
  const oneMax = Math.max(...(finData.oneTimeCosts || []).map((b) => Number(b.cost) || 0), 1);
  renderTable('tbl-onetime', finData.oneTimeCosts, [
    { label: 'Item', get: (r) => r.item, key: 'item' },
    { label: 'Cost', get: (r) => r.cost, format: (v) => gbp(v), numeric: true, key: 'cost' },
    { label: 'Notes', get: (r) => r.notes, key: 'notes' },
  ], { item: 'Total', cost: gbp(oneTimeTotal), notes: '' }, 'cost', oneMax);
  setText('onetime-total', gbp(oneTimeTotal));

  // Shopping list — sparkbar on Cost.
  const shopTotal = sumNumeric(finData.shoppingList, 'cost');
  const shopMax = Math.max(...(finData.shoppingList || []).map((b) => Number(b.cost) || 0), 1);
  renderTable('tbl-shopping', finData.shoppingList, [
    { label: 'Category', get: (r) => r.category, key: 'category' },
    { label: 'Cost', get: (r) => r.cost, format: (v) => gbp(v), numeric: true, key: 'cost' },
    { label: 'Items', get: (r) => r.items, key: 'items' },
  ], { category: 'Total', cost: gbp(shopTotal), items: '' }, 'cost', shopMax);
  setText('shopping-total', gbp(shopTotal));

  // Gift cards — sparkbar on Amount.
  const giftTotal = sumNumeric(finData.giftCards, 'amount');
  const giftMax = Math.max(...(finData.giftCards || []).map((b) => Number(b.amount) || 0), 1);
  renderTable('tbl-giftcards', finData.giftCards, [
    { label: 'Source', get: (r) => r.source, key: 'source' },
    { label: 'Amount', get: (r) => r.amount, format: (v) => gbp(v), numeric: true, key: 'amount' },
    { label: 'Expiry', get: (r) => r.expiry || '—', key: 'expiry' },
  ], { source: 'Total', amount: gbp(giftTotal), expiry: '' }, 'amount', giftMax);
  setText('giftcards-total', gbp(giftTotal));
}

// ============================================================
// LATER — side-by-side flows + unified affordability widget + what-if chart
// ============================================================

function renderLaterFlow(currentPrice) {
  const offer = Number(currentPrice ?? criData?.budget?.offerTarget ?? finData?.goal?.offerTarget ?? 380000);
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

// ---- Unified affordability widget --------------------------------------------

function renderAffordWidget(price) {
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
  if (stressedEl) stressedEl.innerHTML = `${esc(gbp(r.monthlyPIStressed))}<small>+3pp</small>`;
  setText('afford-spare', gbp(r.monthlySpareAfter));

  setHTML('afford-why', r.whyVerdict.map((s) => `<li>${esc(s)}</li>`).join(''));
}

function attachAffordabilityWidget() {
  const slider = $('afford-slider');
  const number = $('afford-price-input');
  const display = $('afford-price-display');
  if (!slider || !number) return;

  const initial = Number(criData?.budget?.offerTarget || finData?.goal?.offerTarget || 380000);
  slider.value = String(initial);
  number.value = String(initial);
  if (display) display.textContent = gbp(initial);

  const update = (raw) => {
    const price = Math.max(100000, Math.min(2000000, Number(raw) || 0));
    if (display) display.textContent = gbp(price);
    if (slider.value !== String(price)) slider.value = String(price);
    if (number.value !== String(price)) number.value = String(price);
    renderAffordWidget(price);
    renderLaterFlow(price);
  };

  slider.addEventListener('input', (e) => update(e.target.value));
  number.addEventListener('input', (e) => update(e.target.value));
  update(initial);
}

// ---- What-if chart -----------------------------------------------------------

let whatIfChart = null;
function renderWhatIfChart() {
  const canvas = $('what-if-canvas');
  if (!canvas || typeof Chart === 'undefined') return;
  const v = getSavingsVelocity(finData);

  // Build a single time axis: months 0..max-eta + a small buffer.
  const allProjections = [v.baseline, ...v.scenarios.filter((s) => Number.isFinite(s.etaMonths))];
  const maxMonths = Math.min(60, Math.ceil(Math.max(...allProjections.map((p) => p.etaMonths || 0)) + 2));
  if (!Number.isFinite(maxMonths) || maxMonths <= 0) return;
  const labels = Array.from({ length: maxMonths + 1 }, (_, i) => `M+${i}`);

  const accent = cssVar('--accent');
  const ink = cssVar('--ink');
  const muted = cssVar('--ink-muted');
  const hairline = cssVar('--hairline');
  const dataFont = cssVar('--font-data');

  // Pick a few interesting scenarios — labels per PLAN.md L82.
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

function extendProjection(projection, maxMonths) {
  const out = projection.map((p) => p.balance);
  if (out.length > maxMonths + 1) return out.slice(0, maxMonths + 1);
  // If the projection ends before maxMonths, repeat the final balance.
  const last = out[out.length - 1] ?? 0;
  while (out.length <= maxMonths) out.push(last);
  return out;
}

// ============================================================
// Init
// ============================================================

async function renderISAAttribution() {
  const el = document.getElementById('isa-attribution');
  if (!el) return;
  let history;
  try { history = await loadJSON('imports/trading212-history'); } catch { return; }
  const perf = analysePerformance(history);
  if (perf.isStub) {
    el.innerHTML = '<p class="muted">ISA history not yet imported — run <code>node scripts/import-trading212.mjs</code> with your T212 export to see the breakdown.</p>';
    return;
  }
  const total = perf.netContributed + perf.dividendsReceived + perf.interestEarned + Math.max(0, perf.unrealisedGain);
  const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;
  el.innerHTML = `
    <dl class="isa-attribution__grid">
      <dt>Contributed</dt><dd>${gbp(perf.netContributed)} <span class="muted">(${pct(perf.netContributed)}%)</span></dd>
      <dt>Dividends received</dt><dd>${gbp(perf.dividendsReceived)}</dd>
      <dt>Interest</dt><dd>${gbp(perf.interestEarned)}</dd>
      <dt>Market growth (unrealised)</dt><dd>${gbp(Math.max(0, perf.unrealisedGain))}</dd>
      <dt>Total return</dt><dd>${perf.totalReturnPct != null ? perf.totalReturnPct.toFixed(2) + '%' : '—'}</dd>
    </dl>
    <div class="isa-attribution__bar" role="img" aria-label="ISA growth breakdown">
      <div class="isa-attribution__seg isa-attribution__seg--contributed" style="flex:${pct(perf.netContributed)}" title="Contributed ${pct(perf.netContributed)}%"></div>
      <div class="isa-attribution__seg isa-attribution__seg--dividends" style="flex:${pct(perf.dividendsReceived)}" title="Dividends ${pct(perf.dividendsReceived)}%"></div>
      <div class="isa-attribution__seg isa-attribution__seg--interest" style="flex:${pct(perf.interestEarned)}" title="Interest ${pct(perf.interestEarned)}%"></div>
      <div class="isa-attribution__seg isa-attribution__seg--growth" style="flex:${pct(Math.max(0, perf.unrealisedGain))}" title="Growth ${pct(Math.max(0, perf.unrealisedGain))}%"></div>
    </div>`;
}

async function renderDepositRiskTile() {
  const svg = document.getElementById('dr-waterfall-svg');
  const badge = document.getElementById('tdr-badge');
  const cap = document.getElementById('dr-waterfall-caption');
  const detailsBody = document.getElementById('dr-waterfall-rows');
  if (!svg) return;

  let investments, goals;
  try {
    investments = await loadJSON('investments');
    goals = await loadJSON('goals');
  } catch { return; }
  const risk = assessDepositRisk(investments, goals);
  const verdictClass = risk.verdict.replace('-', '_');
  if (badge) {
    badge.className = `verdict-badge verdict-badge--${verdictClass}`;
    badge.textContent = risk.verdict.toUpperCase().replace('-', ' ');
  }

  // Waterfall steps: current → after 10% → after 20%.
  const current = Number(risk.currentValue) || 0;
  const monthly = Number(finData?.savings?.monthlyContribution ?? 2000);
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
  // Baseline guide line at current value
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

// Cache the raw investments alongside finances so we can re-derive on background updates.
let rawInvestments = null;

function renderEverything() {
  renderTiles();
  renderNowFlow();
  renderBreakdowns();
  renderLaterFlow();
  attachAffordabilityWidget();
  renderWhatIfChart();
  renderISAAttribution();
  renderDepositRiskTile();
  // v3 visuals — all stub-safe.
  renderSavingsOverTime();
  renderMonthlyDeposits();
  renderISAStackedArea();
  renderDividendsInterest();
  renderEpochComparison();
  renderTickerTreemap();
  renderRealisedUnrealised();
}

// ============================================================
// v3 visuals — savings-over-time + ISA performance suite (stub-safe)
// ============================================================

const SVG_NS_F = 'http://www.w3.org/2000/svg';
const _v3Charts = {};
const STUB_MSG = (id) => `<p class="muted">ISA history not yet imported — run <code>node scripts/import-trading212.mjs</code> to populate this chart.</p>`;

function setStub(sectionId, captionId) {
  const card = document.getElementById(sectionId);
  if (!card) return;
  const wrap = card.querySelector('.chart-wrap') || card.querySelector('svg');
  if (wrap && wrap.tagName === 'DIV') wrap.innerHTML = STUB_MSG();
  if (wrap && wrap.tagName === 'svg') wrap.replaceChildren();
  const cap = document.getElementById(captionId);
  if (cap) cap.textContent = 'Run the Trading 212 importer to see this chart.';
}

function makeRgba(varName, alpha) {
  // Chart.js needs string colours. Compose from a CSS var read at render time.
  // var(--accent) is OKLCH; color-mix is fine inside CSS but Chart.js wants the
  // computed value, so we ship the raw token value and trust Chart's parser.
  return cssVar(varName) || '#000';
}

async function renderSavingsOverTime() {
  const canvas = document.getElementById('savings-over-time-canvas');
  if (!canvas || !finData) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  const goal = Number(finData?.goal?.targetDeposit ?? 0);
  const series = buildSavingsSeries({ history, finances: finData, goal });
  const cap = document.getElementById('sot-caption');

  if (series.isStub || series.points.length === 0) {
    setStub('savings-over-time-card', 'sot-caption');
    return;
  }

  const labels = series.points.map((p) => p.month);
  const actual = series.points.map((p) => p.cumulative);
  const targetVals = labels.map(() => goal);

  if (_v3Charts.savingsOverTime) _v3Charts.savingsOverTime.destroy();
  _v3Charts.savingsOverTime = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Actual cumulative', data: actual, borderColor: cssVar('--accent'), backgroundColor: cssVar('--accent-soft'), fill: true, tension: 0.15, pointRadius: 2 },
        { label: 'Target', data: targetVals, borderColor: cssVar('--ink-muted'), borderDash: [4, 4], pointRadius: 0, fill: false },
      ],
    },
    options: chartOpts({ yLabel: 'Cumulative £' }),
  });

  if (cap) {
    const eta = series.targetLine.etaMonth;
    const last = series.points[series.points.length - 1];
    if (eta) cap.textContent = `At current pace you hit ${gbp(goal)} in ${fmtMonthLabel(eta)} — ${gbp(Math.round(last.cumulative))} saved so far.`;
    else cap.textContent = `${gbp(Math.round(last.cumulative))} saved across ${series.points.length} months.`;
  }
}

async function renderMonthlyDeposits() {
  const canvas = document.getElementById('monthly-deposits-canvas');
  if (!canvas || !finData) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  const series = getMonthlyCumulativeDeposits(history);
  const cap = document.getElementById('md-caption');

  if (series.length === 0) { setStub('monthly-deposits-card', 'md-caption'); return; }

  const labels = series.map((p) => p.month);
  const data = series.map((p) => p.delta);

  if (_v3Charts.monthlyDeposits) _v3Charts.monthlyDeposits.destroy();
  _v3Charts.monthlyDeposits = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Net deposit', data, backgroundColor: cssVar('--accent') }] },
    options: chartOpts({ yLabel: '£ per month' }),
  });

  const goalMo = Number(finData?.savings?.monthlyContribution ?? 2000);
  const avg = data.reduce((s, v) => s + v, 0) / data.length;
  const delta = avg - goalMo;
  if (cap) {
    const dir = delta >= 0 ? 'above' : 'below';
    cap.textContent = `Avg ${gbp(Math.round(avg))}/mo across ${data.length} months — ${gbp(Math.abs(Math.round(delta)))} ${dir} the ${gbp(goalMo)} goal.`;
  }
}

async function renderISAStackedArea() {
  const canvas = document.getElementById('isa-stacked-canvas');
  if (!canvas || !finData) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  if (!Array.isArray(history?.monthlySummary) || history.monthlySummary.length === 0) {
    setStub('isa-stacked-area-card', 'isasa-caption'); return;
  }
  const sorted = [...history.monthlySummary].sort((a, b) => a.month.localeCompare(b.month));
  let cumContrib = 0, cumDiv = 0, cumInt = 0;
  const labels = sorted.map((m) => m.month);
  const contrib = [], divs = [], ints = [];
  sorted.forEach((m) => {
    cumContrib += Number(m.net) || 0;
    cumDiv += Number(m.dividends) || 0;
    cumInt += Number(m.interest) || 0;
    contrib.push(cumContrib); divs.push(cumDiv); ints.push(cumInt);
  });
  // Market growth = currentValue − contributed − dividends − interest, distributed evenly across months.
  const perf = analysePerformance(history);
  const growthEnd = Math.max(0, perf.unrealisedGain);
  const growth = labels.map((_, i) => Math.round((growthEnd * (i + 1) / labels.length)));

  if (_v3Charts.isaStacked) _v3Charts.isaStacked.destroy();
  _v3Charts.isaStacked = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Contributed', data: contrib, borderColor: cssVar('--accent'),                                  backgroundColor: cssVar('--accent-soft'), fill: true, tension: 0.1, pointRadius: 0 },
        { label: 'Dividends',   data: divs,    borderColor: cssVar('--accent-ink'),                              backgroundColor: cssVar('--hairline'),    fill: true, tension: 0.1, pointRadius: 0 },
        { label: 'Interest',    data: ints,    borderColor: cssVar('--ink-muted'),                               backgroundColor: cssVar('--hairline'),    fill: true, tension: 0.1, pointRadius: 0 },
        { label: 'Market growth', data: growth, borderColor: cssVar('--ink-subtle'),                             backgroundColor: cssVar('--hairline-strong'), fill: true, tension: 0.1, pointRadius: 0 },
      ],
    },
    options: chartOpts({ yLabel: '£', stacked: true }),
  });

  const total = perf.netContributed + perf.dividendsReceived + perf.interestEarned + growthEnd;
  const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;
  const cap = document.getElementById('isasa-caption');
  if (cap) cap.textContent = `Of ${gbp(Math.round(total))} balance: ${pct(perf.netContributed)}% contributed, ${pct(perf.dividendsReceived + perf.interestEarned)}% dividends + interest, ${pct(growthEnd)}% market growth.`;
}

async function renderDividendsInterest() {
  const canvas = document.getElementById('div-int-canvas');
  if (!canvas) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  if (!Array.isArray(history?.monthlySummary) || history.monthlySummary.length === 0) {
    setStub('div-int-cumulative-card', 'di-caption'); return;
  }
  const sorted = [...history.monthlySummary].sort((a, b) => a.month.localeCompare(b.month));
  let cumDiv = 0, cumInt = 0;
  const labels = sorted.map((m) => m.month);
  const divs = [], ints = [];
  sorted.forEach((m) => {
    cumDiv += Number(m.dividends) || 0;
    cumInt += Number(m.interest) || 0;
    divs.push(cumDiv); ints.push(cumInt);
  });

  if (_v3Charts.divInt) _v3Charts.divInt.destroy();
  _v3Charts.divInt = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Dividends', data: divs, borderColor: cssVar('--accent'),     pointRadius: 2, tension: 0.15 },
        { label: 'Interest',  data: ints, borderColor: cssVar('--ink-muted'), pointRadius: 2, tension: 0.15 },
      ],
    },
    options: chartOpts({ yLabel: 'Cumulative £' }),
  });

  const totalPassive = divs[divs.length - 1] + ints[ints.length - 1];
  const cap = document.getElementById('di-caption');
  if (cap) cap.textContent = `${gbp(Math.round(totalPassive))} in passive income across ${labels.length} months.`;
}

async function renderEpochComparison() {
  const svg = document.getElementById('epoch-svg');
  if (!svg) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  const epochs = getEpochAttribution(history);
  const cap = document.getElementById('ec-caption');

  if (epochs.length === 0) {
    svg.replaceChildren();
    if (cap) cap.textContent = 'Run the Trading 212 importer to compare strategy epochs.';
    return;
  }

  const W = 600, H = 180, PAD_L = 140, PAD_R = 40, PAD_T = 20, PAD_B = 20;
  const rowH = (H - PAD_T - PAD_B) / epochs.length;
  const maxContrib = Math.max(...epochs.map((e) => e.contributedDuringEpoch), 1);

  svg.replaceChildren();
  epochs.forEach((ep, i) => {
    const y = PAD_T + i * rowH + 4;
    const labelEl = document.createElementNS(SVG_NS_F, 'text');
    labelEl.setAttribute('x', String(PAD_L - 8));
    labelEl.setAttribute('y', String(y + rowH / 2 + 4));
    labelEl.setAttribute('text-anchor', 'end');
    labelEl.setAttribute('class', 'epoch-comparison__label');
    labelEl.textContent = ep.label;
    svg.appendChild(labelEl);

    const barW = ((ep.contributedDuringEpoch / maxContrib) * (W - PAD_L - PAD_R - 80));
    const bar = document.createElementNS(SVG_NS_F, 'rect');
    bar.setAttribute('x', String(PAD_L));
    bar.setAttribute('y', String(y + 8));
    bar.setAttribute('width', String(Math.max(2, barW)));
    bar.setAttribute('height', String(rowH - 24));
    bar.setAttribute('class', 'epoch-comparison__bar');
    svg.appendChild(bar);

    const val = document.createElementNS(SVG_NS_F, 'text');
    val.setAttribute('x', String(PAD_L + barW + 6));
    val.setAttribute('y', String(y + rowH / 2 + 4));
    val.setAttribute('class', 'epoch-comparison__value');
    val.textContent = `${gbp(Math.round(ep.contributedDuringEpoch))}${ep.returnPct != null ? ` · ${ep.returnPct > 0 ? '+' : ''}${ep.returnPct}%/yr est` : ''}`;
    svg.appendChild(val);
  });

  if (cap) {
    const best = [...epochs].filter((e) => e.returnPct != null).sort((a, b) => b.returnPct - a.returnPct)[0];
    if (best) cap.textContent = `${best.label} returned ~${best.returnPct > 0 ? '+' : ''}${best.returnPct}%/yr (estimated, contribution-weighted).`;
    else cap.textContent = `${epochs.length} strategy epochs since opening.`;
  }
}

async function renderTickerTreemap() {
  const svg = document.getElementById('ticker-treemap-svg');
  if (!svg) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  const exposure = history?.tickerExposure;
  const cap = document.getElementById('tt-caption');
  if (!exposure || typeof exposure !== 'object' || Object.keys(exposure).length === 0) {
    svg.replaceChildren();
    if (cap) cap.textContent = 'Run the Trading 212 importer to see your ticker exposure.';
    return;
  }

  const entries = Object.entries(exposure)
    .map(([t, v]) => ({ ticker: t, value: Number(v?.netDeployed ?? v?.value ?? v) || 0 }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total === 0) { svg.replaceChildren(); if (cap) cap.textContent = '—'; return; }

  // Simple slice-and-dice layout: alternating horizontal/vertical splits.
  const W = 600, H = 360;
  svg.replaceChildren();
  function layout(items, x, y, w, h, horizontal) {
    if (items.length === 0) return;
    if (items.length === 1) {
      drawRect(items[0], x, y, w, h);
      return;
    }
    const sum = items.reduce((s, e) => s + e.value, 0);
    const half = sum / 2;
    let acc = 0, splitIdx = 0;
    for (let i = 0; i < items.length; i++) {
      acc += items[i].value;
      if (acc >= half) { splitIdx = i + 1; break; }
    }
    const a = items.slice(0, splitIdx);
    const b = items.slice(splitIdx);
    const aSum = a.reduce((s, e) => s + e.value, 0);
    const aFrac = aSum / sum;
    if (horizontal) {
      const aW = w * aFrac;
      layout(a, x, y, aW, h, !horizontal);
      layout(b, x + aW, y, w - aW, h, !horizontal);
    } else {
      const aH = h * aFrac;
      layout(a, x, y, w, aH, !horizontal);
      layout(b, x, y + aH, w, h - aH, !horizontal);
    }
  }
  function drawRect(item, x, y, w, h) {
    const r = document.createElementNS(SVG_NS_F, 'rect');
    r.setAttribute('x', x.toFixed(1)); r.setAttribute('y', y.toFixed(1));
    r.setAttribute('width', Math.max(0, w - 2).toFixed(1));
    r.setAttribute('height', Math.max(0, h - 2).toFixed(1));
    r.setAttribute('class', 'ticker-treemap__rect');
    svg.appendChild(r);
    if (w > 50 && h > 28) {
      const t = document.createElementNS(SVG_NS_F, 'text');
      t.setAttribute('x', (x + 6).toFixed(1)); t.setAttribute('y', (y + 16).toFixed(1));
      t.setAttribute('class', 'ticker-treemap__ticker');
      t.textContent = item.ticker;
      svg.appendChild(t);
      const v = document.createElementNS(SVG_NS_F, 'text');
      v.setAttribute('x', (x + 6).toFixed(1)); v.setAttribute('y', (y + 32).toFixed(1));
      v.setAttribute('class', 'ticker-treemap__value');
      v.textContent = `${gbp(Math.round(item.value))} · ${Math.round((item.value / total) * 100)}%`;
      svg.appendChild(v);
    }
  }
  layout(entries, 0, 0, W, H, true);

  if (cap) {
    const top = entries[0];
    cap.textContent = `${top.ticker} is your largest holding at ${Math.round((top.value / total) * 100)}% of deployed capital.`;
  }
}

async function renderRealisedUnrealised() {
  const svg = document.getElementById('ru-svg');
  if (!svg) return;
  let history; try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }
  const perf = analysePerformance(history);
  const cap = document.getElementById('ru-caption');

  if (perf.isStub) {
    svg.replaceChildren();
    if (cap) cap.textContent = 'Run the Trading 212 importer to compare realised vs unrealised P&L.';
    return;
  }

  const realised = perf.realisedPnL || 0;
  const unrealised = Math.max(0, perf.unrealisedGain || 0);
  const max = Math.max(Math.abs(realised), Math.abs(unrealised), 1);

  const W = 400, H = 120, PAD_L = 120, PAD_R = 12, ROW_H = 36;
  const barW = (v) => Math.max(2, (Math.abs(v) / max) * (W - PAD_L - PAD_R - 60));

  svg.replaceChildren();
  ['Realised', 'Unrealised'].forEach((label, i) => {
    const v = i === 0 ? realised : unrealised;
    const y = 16 + i * (ROW_H + 12);

    const lbl = document.createElementNS(SVG_NS_F, 'text');
    lbl.setAttribute('x', String(PAD_L - 8)); lbl.setAttribute('y', String(y + ROW_H / 2 + 4));
    lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('class', 'realised-unrealised__label');
    lbl.textContent = label; svg.appendChild(lbl);

    const bar = document.createElementNS(SVG_NS_F, 'rect');
    bar.setAttribute('x', String(PAD_L)); bar.setAttribute('y', String(y));
    bar.setAttribute('width', String(barW(v))); bar.setAttribute('height', String(ROW_H));
    bar.setAttribute('class', `realised-unrealised__bar--${label.toLowerCase()}`);
    svg.appendChild(bar);

    const val = document.createElementNS(SVG_NS_F, 'text');
    val.setAttribute('x', String(PAD_L + barW(v) + 6)); val.setAttribute('y', String(y + ROW_H / 2 + 4));
    val.setAttribute('class', 'realised-unrealised__value');
    val.textContent = gbp(Math.round(v));
    svg.appendChild(val);
  });

  if (cap) {
    cap.textContent = `${gbp(Math.round(realised))} locked in by selling; ${gbp(Math.round(unrealised))} still riding the market.`;
  }
}

// ---- shared helpers --------------------------------------------------------

function fmtMonthLabel(label) {
  if (!label || label.length < 7) return label ?? '';
  const [y, m] = label.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
}

function chartOpts({ yLabel, stacked = false } = {}) {
  const ink = cssVar('--ink-muted');
  const grid = cssVar('--hairline');
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefersReducedMotion() ? false : { duration: 300 },
    plugins: {
      legend: { labels: { color: ink, font: { size: 11 } } },
      tooltip: { mode: 'index', intersect: false },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
    scales: {
      x: { stacked, ticks: { color: ink, font: { size: 10 } }, grid: { color: grid } },
      y: { stacked, ticks: { color: ink, font: { size: 10 }, callback: (v) => '£' + Math.round(v).toLocaleString() }, grid: { color: grid }, title: { display: !!yLabel, text: yLabel, color: ink, font: { size: 10 } } },
    },
  };
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
