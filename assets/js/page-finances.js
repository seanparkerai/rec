// page-finances.js — render the full finances dashboard from data/finances.json,
// including read-only summaries, breakdown tables, a savings projection chart, and live calculator tools.
import { getFinances } from './storage.js';
import * as fin from './finances.js';

const gbp = (n) => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
}).format(n || 0);
const gbpPence = (n) => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(n || 0);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const $ = (id) => document.getElementById(id);

let data = null;

function sumNumeric(arr, key) {
  return (arr || []).reduce((s, x) => s + (Number(x[key]) || 0), 0);
}

function renderTiles() {
  const target = data.goal?.targetDeposit || 0;
  const saved = data.savings?.totalSavings || 0;
  const pct = fin.calcDepositProgress(saved, target);
  const months = fin.calcMonthsToTarget(saved, target, data.savings?.monthlyContribution || 0);

  $('tile-progress').textContent = `${pct}%`;
  $('progress-bar').style.width = `${pct}%`;
  $('tile-saved').textContent = gbp(saved);
  $('tile-monthly').textContent = gbp(data.savings?.monthlyContribution || 0);
  $('tile-months').textContent = months === Infinity ? '—' : `${months}`;
  $('tile-months-sub').textContent = months === Infinity ? 'no contribution' : 'at current pace';
}

function renderSummaries() {
  const i = data.income || {};
  const g = data.goal || {};
  const m = data.mortgage || {};
  const s = data.savings || {};

  $('sum-income').innerHTML = `
    <dl class="field-list">
      ${field('Annual base salary', gbp(i.annualBaseSalary))}
      ${field('Annual bonus', gbp(i.annualBonus))}
      ${field('Take-home (monthly)', gbpPence(i.takeHomeMonthly))}
      ${field('Bonus (monthly avg)', gbpPence(i.bonusMonthly))}
      ${field('Total monthly', gbpPence(i.totalMonthly))}
    </dl>
  `;

  $('sum-goal').innerHTML = `
    <dl class="field-list">
      ${field('Target property price', gbp(g.targetPropertyPrice))}
      ${field('Offer target', gbp(g.offerTarget))}
      ${field('Target deposit', gbp(g.targetDeposit))}
      ${field('Deposit %', `${g.depositPct}%`)}
      ${field('Total initial outlay', gbp(g.totalInitialOutlay))}
      ${field('Moving window', g.movingWindow)}
    </dl>
  `;

  $('sum-mortgage').innerHTML = `
    <dl class="field-list">
      ${field('Target max loan', gbp(m.targetMax))}
      ${field('Assumed rate', `${m.ratePctAssumed}%`)}
      ${field('Term', `${m.termYears} years`)}
      ${field('LTV range', m.ltvRange)}
      ${field('Estimated monthly', gbp(m.estimatedMonthlyPayment))}
      ${field('Fixed-rate preference', m.fixedRatePref)}
    </dl>
  `;

  $('sum-savings').innerHTML = `
    <dl class="field-list">
      ${field('Current cash', gbp(s.current))}
      ${field('Gift cards value', gbp(s.giftCardsValue))}
      ${field('Projected compound', gbp(s.projectedCompound))}
      ${field('Total savings', gbp(s.totalSavings))}
      ${field('Savings gap', gbp(s.savingsGap))}
      ${field('Months at current pace', s.monthsToSave != null ? `${s.monthsToSave}` : '—')}
    </dl>
  `;
}

function field(label, value) {
  return `<div class="field-view"><dt>${esc(label)}</dt><dd>${esc(value ?? '—')}</dd></div>`;
}

function renderTable(targetId, rows, columns, totals = null) {
  const el = $(targetId);
  if (!rows?.length) { el.innerHTML = `<p class="muted">None.</p>`; return; }
  const head = columns.map((c) => `<th${c.numeric ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('');
  const body = rows.map((r) => `
    <tr>${columns.map((c) => {
      const v = c.get(r);
      return `<td${c.numeric ? ' class="num"' : ''}>${c.format ? esc(c.format(v)) : esc(v ?? '')}</td>`;
    }).join('')}</tr>
  `).join('');
  const foot = totals ? `<tfoot><tr>${columns.map((c) => `<td${c.numeric ? ' class="num"' : ''}><strong>${esc(totals[c.key] ?? '')}</strong></td>`).join('')}</tr></tfoot>` : '';
  el.innerHTML = `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}

function renderBreakdowns() {
  // One-time costs
  const oneTimeTotal = sumNumeric(data.oneTimeCosts, 'cost');
  renderTable('tbl-onetime', data.oneTimeCosts, [
    { label: 'Item', get: (r) => r.item, key: 'item' },
    { label: 'Cost', get: (r) => r.cost, format: (v) => gbp(v), numeric: true, key: 'cost' },
    { label: 'Notes', get: (r) => r.notes, key: 'notes' },
  ], { item: 'Total', cost: gbp(oneTimeTotal), notes: '' });

  // Ongoing bills
  const billsAnnual = sumNumeric(data.ongoingBills, 'annual');
  const billsMonthly = sumNumeric(data.ongoingBills, 'monthly');
  renderTable('tbl-bills', data.ongoingBills, [
    { label: 'Bill', get: (r) => r.item, key: 'item' },
    { label: 'Annual', get: (r) => r.annual, format: (v) => gbp(v), numeric: true, key: 'annual' },
    { label: 'Monthly', get: (r) => r.monthly, format: (v) => gbpPence(v), numeric: true, key: 'monthly' },
  ], { item: 'Total', annual: gbp(billsAnnual), monthly: gbpPence(billsMonthly) });

  // Expenses
  const expAnnual = sumNumeric(data.expenses, 'annual');
  const expMonthly = sumNumeric(data.expenses, 'monthly');
  const expWeekly = sumNumeric(data.expenses, 'weekly');
  renderTable('tbl-expenses', data.expenses, [
    { label: 'Expense', get: (r) => r.item, key: 'item' },
    { label: 'Annual', get: (r) => r.annual, format: (v) => gbp(v), numeric: true, key: 'annual' },
    { label: 'Monthly', get: (r) => r.monthly, format: (v) => gbp(v), numeric: true, key: 'monthly' },
    { label: 'Weekly', get: (r) => r.weekly, format: (v) => gbpPence(v), numeric: true, key: 'weekly' },
  ], { item: 'Total', annual: gbp(expAnnual), monthly: gbp(expMonthly), weekly: gbpPence(expWeekly) });

  // Shopping list
  const shopTotal = sumNumeric(data.shoppingList, 'cost');
  renderTable('tbl-shopping', data.shoppingList, [
    { label: 'Category', get: (r) => r.category, key: 'category' },
    { label: 'Cost', get: (r) => r.cost, format: (v) => gbp(v), numeric: true, key: 'cost' },
    { label: 'Items', get: (r) => r.items, key: 'items' },
  ], { category: 'Total', cost: gbp(shopTotal), items: '' });

  // Gift cards
  const giftTotal = sumNumeric(data.giftCards, 'amount');
  renderTable('tbl-giftcards', data.giftCards, [
    { label: 'Source', get: (r) => r.source, key: 'source' },
    { label: 'Amount', get: (r) => r.amount, format: (v) => gbp(v), numeric: true, key: 'amount' },
    { label: 'Expiry', get: (r) => r.expiry || '—', key: 'expiry' },
  ], { source: 'Total', amount: gbp(giftTotal), expiry: '' });
}

let chartInstance = null;
function renderSavingsChart() {
  const canvas = $('savings-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const start = data.savings?.totalSavings || 0;
  const monthly = data.savings?.monthlyContribution || 0;
  const target = data.goal?.targetDeposit || 0;
  const months = Math.max(18, Math.ceil(fin.calcMonthsToTarget(start, target, monthly) + 4) || 18);

  const projection = fin.projectSavings(start, monthly, months);
  const labels = projection.map((p) => `M+${p.month}`);
  const balances = projection.map((p) => p.balance);
  const targetLine = projection.map(() => target);

  const accent = getCSSVar('--accent');
  const ink = getCSSVar('--ink');
  const muted = getCSSVar('--ink-muted');
  const hairline = getCSSVar('--hairline');
  const dataFont = getCSSVar('--font-data');

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Projected savings', data: balances, borderColor: accent, backgroundColor: `color-mix(in oklch, ${accent} 14%, transparent)`, borderWidth: 2, tension: 0.25, fill: true, pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Deposit target', data: targetLine, borderColor: muted, borderDash: [4, 6], borderWidth: 1.5, pointRadius: 0, fill: false },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: prefersReducedMotion() ? false : { duration: 450, easing: 'easeOutCubic' },
      plugins: {
        legend: { labels: { color: ink, font: { family: dataFont, size: 11 }, boxWidth: 10, boxHeight: 10 } },
        tooltip: { backgroundColor: ink, titleColor: getCSSVar('--paper'), bodyColor: getCSSVar('--paper'), padding: 8, displayColors: false, callbacks: { label: (ctx) => gbp(ctx.parsed.y) } },
      },
      scales: {
        x: { ticks: { color: muted, maxTicksLimit: 10, font: { family: dataFont, size: 11 } }, grid: { display: false }, border: { color: hairline } },
        y: { ticks: { color: muted, callback: (v) => '£' + (v / 1000).toFixed(0) + 'k', font: { family: dataFont, size: 11 } }, grid: { color: hairline, drawTicks: false }, border: { display: false } },
      },
    },
  });
}

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function prefersReducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// --- Calculator tools (live, drive off the pure functions) ---
function attachCalculators() {
  const update = () => {
    const price = Number($('calc-price').value) || 0;
    const ftb = $('calc-ftb').checked;
    $('calc-sdlt-out').textContent = gbp(fin.calcSDLT(price, { firstTimeBuyer: ftb }));

    const loan = Number($('calc-loan').value) || 0;
    const rate = Number($('calc-rate').value) || 0;
    const term = Number($('calc-term').value) || 0;
    $('calc-mortgage-out').textContent = gbpPence(fin.calcMonthlyMortgage(loan, rate, term));

    const propValue = Number($('calc-value').value) || 0;
    $('calc-ltv-out').textContent = `${fin.calcLTV(loan, propValue)}%`;

    const lisa = Number($('calc-lisa').value) || 0;
    const lb = fin.calcLISABonus(lisa);
    $('calc-lisa-out').textContent = `Eligible: ${gbp(lb.eligible)} · Bonus: ${gbp(lb.bonus)}`;
    $('calc-lisa-eligible').textContent = fin.lisaEligible(price) ? 'Yes' : (price > 0 ? 'No (over £450k cap)' : '—');
  };

  ['calc-price', 'calc-ftb', 'calc-loan', 'calc-rate', 'calc-term', 'calc-value', 'calc-lisa'].forEach((id) => {
    $(id).addEventListener('input', update);
    $(id).addEventListener('change', update);
  });

  // Seed from current data
  $('calc-price').value = data.goal?.offerTarget || 380000;
  $('calc-ftb').checked = true;
  $('calc-loan').value = data.mortgage?.targetMax || 360000;
  $('calc-rate').value = data.mortgage?.ratePctAssumed || 5.35;
  $('calc-term').value = data.mortgage?.termYears || 35;
  $('calc-value').value = data.goal?.offerTarget || 380000;
  $('calc-lisa').value = 4000;
  update();
}

async function init() {
  try {
    data = await getFinances();
    renderTiles();
    renderSummaries();
    renderBreakdowns();
    renderSavingsChart();
    attachCalculators();
  } catch (e) {
    console.error('finances init error', e);
  }
}

init();
