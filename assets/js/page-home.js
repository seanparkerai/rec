// page-home.js — dashboard aggregates: headline tiles, savings projection sparkline,
// shortlisted areas snippet, journey progress, quick links.
import { getFinances, getShortlist, getAreas, _internal } from './storage.js';
import { loadJSON } from './data-loader.js';
import * as fin from './finances.js';

const gbp = (n) => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
}).format(n || 0);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
const $ = (id) => document.getElementById(id);

let chartInstance = null;

async function renderTiles(financesData) {
  const fin1 = financesData;
  const saved = fin1.savings?.totalSavings ?? fin1.savings?.current ?? 0;
  const target = fin1.goal?.targetDeposit || 0;
  const pct = fin.calcDepositProgress(saved, target);
  setText('tile-saved', gbp(saved));
  setText('tile-target', gbp(target));
  setText('tile-progress', `${pct}%`);
  setText('tile-target-sub', fin1.goal?.movingWindow || '');
  const bar = $('progress-bar');
  if (bar) bar.style.width = `${pct}%`;
}

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function prefersReducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function renderSavingsChart(financesData) {
  const canvas = $('home-savings-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const start = financesData.savings?.totalSavings || 0;
  const monthly = financesData.savings?.monthlyContribution || 0;
  const target = financesData.goal?.targetDeposit || 0;
  const months = Math.max(12, Math.ceil(fin.calcMonthsToTarget(start, target, monthly) + 2) || 12);

  const projection = fin.projectSavings(start, monthly, months);
  const labels = projection.map((p) => `M+${p.month}`);
  const balances = projection.map((p) => p.balance);
  const targetLine = projection.map(() => target);

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Projected', data: balances, borderColor: getCSSVar('--accent'), backgroundColor: getCSSVar('--accent') + '20', tension: 0.25, fill: true, pointRadius: 1 },
        { label: 'Target', data: targetLine, borderColor: getCSSVar('--pico-muted-color'), borderDash: [5, 5], pointRadius: 0, fill: false },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: prefersReducedMotion() ? false : { duration: 350 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: getCSSVar('--pico-muted-color'), maxTicksLimit: 8 }, grid: { display: false } },
        y: { ticks: { color: getCSSVar('--pico-muted-color'), callback: (v) => '£' + (v / 1000).toFixed(0) + 'k' }, grid: { color: getCSSVar('--pico-muted-border-color') } },
      },
    },
  });

  const monthsTo = fin.calcMonthsToTarget(start, target, monthly);
  const monthsLabel = monthsTo === Infinity ? '—' : `${monthsTo} months`;
  setText('home-savings-sub', `${gbp(start)} now · +${gbp(monthly)}/mo · target ${gbp(target)} in ${monthsLabel}.`);
}

async function renderAreas() {
  try {
    const shortlist = getShortlist();
    setText('tile-shortlist', String(shortlist.length));
    const areas = await getAreas();
    const ul = $('home-areas');
    if (!ul) return;
    const items = shortlist.length
      ? areas.filter((a) => shortlist.includes(a.id)).slice(0, 6)
      : areas.slice(0, 6);
    if (!items.length) {
      ul.innerHTML = '<li class="muted">No areas yet — open the Areas tab.</li>';
      return;
    }
    const heading = shortlist.length
      ? '' // (header card already labelled "Shortlisted areas")
      : '<li class="muted" style="font-size: var(--text-xs);">Showing first 6 — star areas to shortlist.</li>';
    ul.innerHTML = heading + items.map((a) =>
      `<li><strong>${esc(a.name)}</strong> <span class="muted">· ${esc(a.town)}</span></li>`
    ).join('');
  } catch (e) { console.error('areas tile error', e); }
}

async function renderJourney() {
  try {
    const data = await loadJSON('checklists');
    const state = _internal.readLocal('journey-checks') || { viewing: {}, process: {}, moving: {} };
    const sections = [
      ['Viewing', 'viewing', data.viewing?.length || 0],
      ['Buying process', 'process', data.process?.length || 0],
      ['Moving', 'moving', data.moving?.length || 0],
    ];
    const html = sections.map(([label, key, total]) => {
      const done = Object.values(state[key] || {}).filter(Boolean).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return `
        <div class="journey-row">
          <div class="journey-row-head">
            <span>${esc(label)}</span>
            <span class="muted">${done} / ${total}</span>
          </div>
          <div class="progress small"><span style="width: ${pct}%"></span></div>
        </div>
      `;
    }).join('');
    $('home-journey').innerHTML = html;
  } catch (e) {
    console.error('journey tile error', e);
    $('home-journey').innerHTML = '<p class="muted">Failed to load journey.</p>';
  }
}

async function init() {
  try {
    const financesData = await getFinances();
    await renderTiles(financesData);
    renderSavingsChart(financesData);
  } catch (e) {
    console.error('finances tile error', e);
  }
  await renderAreas();
  await renderJourney();
}

// Wait for Chart.js to load before rendering chart.
function ready(fn) {
  if (document.readyState === 'complete') fn();
  else window.addEventListener('load', fn, { once: true });
}
ready(init);
