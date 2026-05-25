// page-finances.js — finances page (Phase 4a overhaul).
// NOW: deposit hero (with LISA band) + full-width money-flow + bills/expenses tables (sparkbars).
// LATER: side-by-side flow today vs after-move + unified affordability widget + "What if" chart + collapsible cards.
import { getFinances, getCriteria } from './storage.js';
import * as fin from './finances.js';
import { gbp, gbpPence, monthsAsDuration } from './format.js';
import { assessAffordability, BANDS } from './affordability.js';
import { getMoneyFlow, getMoneyFlowPostMove } from './money-flow.js';
import { getSavingsVelocity } from './savings-velocity.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const $ = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const setHTML = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  setText('tile-monthly', gbp(finData.savings?.monthlyContribution || 0) + '/mo');
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

async function init() {
  try {
    finData = await getFinances();
    try { criData = await getCriteria(); } catch (e) { console.error('criteria fetch failed', e); criData = null; }
    renderTiles();
    renderNowFlow();
    renderBreakdowns();
    renderLaterFlow();
    attachAffordabilityWidget();
    renderWhatIfChart();
  } catch (e) {
    console.error('finances init error', e);
  }
}

init();
