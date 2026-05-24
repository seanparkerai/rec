// page-home.js — dashboard (anchor: Linear-dense, bento layout).
// Hero progress ring + savings projection chart + shortlist preview + journey step strip.
import { getFinances, getShortlist, getAreas, getProfile, getCriteria, _internal } from './storage.js';
import { loadJSON } from './data-loader.js';
import * as fin from './finances.js';

const gbp = (n) => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
}).format(n || 0);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const $ = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };

let chartInstance = null;
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function renderHero(financesData) {
  const saved = financesData.savings?.totalSavings ?? financesData.savings?.current ?? 0;
  const target = financesData.goal?.targetDeposit || 0;
  const monthly = financesData.savings?.monthlyContribution || 0;
  const pct = fin.calcDepositProgress(saved, target);
  const monthsTo = fin.calcMonthsToTarget(saved, target, monthly);

  setText('hero-saved', gbp(saved));
  setText('hero-target', gbp(target));
  setText('hero-monthly', gbp(monthly) + '/mo');
  setText('ring-pct', String(pct));

  const bar = $('ring-bar');
  if (bar) {
    // pathLength="100" — offset directly maps to percentage.
    requestAnimationFrame(() => { bar.style.strokeDashoffset = String(100 - Math.min(pct, 100)); });
  }

  const window = financesData.goal?.movingWindow;
  if (monthsTo === Infinity || target === 0) {
    setText('hero-eta', window ? `Moving window: ${window}` : 'Set a deposit target on the Finances page.');
  } else {
    const eta = new Date();
    eta.setMonth(eta.getMonth() + monthsTo);
    const etaLabel = eta.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    const el = $('hero-eta');
    if (el) el.innerHTML = `Target in <strong class="num">${monthsTo} months</strong> · ${etaLabel}` +
                          (window ? ` · window <strong>${esc(window)}</strong>` : '');
  }
}

function renderSavingsChart(financesData) {
  const canvas = $('home-savings-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const start = financesData.savings?.totalSavings ?? financesData.savings?.current ?? 0;
  const monthly = financesData.savings?.monthlyContribution || 0;
  const target = financesData.goal?.targetDeposit || 0;
  const months = Math.max(12, Math.ceil(fin.calcMonthsToTarget(start, target, monthly) + 2) || 12);

  const projection = fin.projectSavings(start, monthly, months);
  const labels = projection.map((p) => `M+${p.month}`);
  const balances = projection.map((p) => p.balance);
  const targetLine = projection.map(() => target);

  const accent = cssVar('--accent');
  const ink = cssVar('--ink');
  const muted = cssVar('--ink-muted');
  const hairline = cssVar('--hairline');

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Projected', data: balances,
          borderColor: accent,
          backgroundColor: `color-mix(in oklch, ${accent} 14%, transparent)`,
          borderWidth: 2, tension: 0.3, fill: true, pointRadius: 0, pointHoverRadius: 4,
        },
        {
          label: 'Target', data: targetLine,
          borderColor: muted, borderDash: [4, 6], borderWidth: 1.5, pointRadius: 0, fill: false,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: prefersReducedMotion() ? false : { duration: 450, easing: 'easeOutCubic' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: ink, titleColor: cssVar('--paper'), bodyColor: cssVar('--paper'),
          padding: 8, displayColors: false, callbacks: { label: (ctx) => gbp(ctx.parsed.y) },
        },
      },
      scales: {
        x: { ticks: { color: muted, maxTicksLimit: 6, font: { family: cssVar('--font-data'), size: 11 } }, grid: { display: false }, border: { color: hairline } },
        y: { ticks: { color: muted, callback: (v) => '£' + (v / 1000).toFixed(0) + 'k', font: { family: cssVar('--font-data'), size: 11 } }, grid: { color: hairline, drawTicks: false }, border: { display: false } },
      },
    },
  });

  const monthsTo = fin.calcMonthsToTarget(start, target, monthly);
  const monthsLabel = monthsTo === Infinity ? '—' : `${monthsTo} mo`;
  setText('home-savings-sub', `${gbp(start)} → ${gbp(target)} · +${gbp(monthly)}/mo · ${monthsLabel}`);
}

async function renderShortlist() {
  try {
    const shortlist = getShortlist();
    const areas = await getAreas();
    const items = shortlist.length
      ? areas.filter((a) => shortlist.includes(a.id))
      : areas.slice(0, 5);
    setText('sl-count', shortlist.length ? `${shortlist.length} ${shortlist.length === 1 ? 'area' : 'areas'}` : `${items.length} suggested`);
    const ul = $('home-areas');
    if (!ul) return;
    if (!items.length) {
      ul.innerHTML = '<li class="empty-note">No areas yet — open the Areas tab to browse.</li>';
      return;
    }
    ul.innerHTML = items.slice(0, 5).map((a, i) => `
      <li>
        <span class="sl-index num">${String(i + 1).padStart(2, '0')}</span>
        <span class="sl-name">
          <a href="pages/area-detail.html?id=${encodeURIComponent(a.id)}">${esc(a.name)}</a>
          <small class="sl-place">${esc(a.town || a.subRegion || a.county || '')}</small>
        </span>
        <span class="sl-meta">${esc(a.county || '')}</span>
      </li>
    `).join('');
  } catch (e) { console.error('shortlist tile error', e); }
}

async function renderJourney() {
  try {
    const data = await loadJSON('checklists');
    const state = _internal.readLocal('journey-checks') || { viewing: {}, process: {}, moving: {} };
    const sections = [
      { label: 'Viewing',         key: 'viewing', total: data.viewing?.length || 0 },
      { label: 'Buying process',  key: 'process', total: data.process?.length || 0 },
      { label: 'Moving',          key: 'moving',  total: data.moving?.length  || 0 },
    ];
    const html = sections.map((s, i) => {
      const done = Object.values(state[s.key] || {}).filter(Boolean).length;
      const pct = s.total ? Math.round((done / s.total) * 100) : 0;
      const cls = pct === 100 ? 'is-done' : (pct > 0 ? 'is-active' : '');
      return `
        <div class="step ${cls}">
          <span class="step-num">PHASE ${String(i + 1).padStart(2, '0')}</span>
          <div class="step-head">
            <span class="step-label">${esc(s.label)}</span>
            <span class="step-count num">${done} / ${s.total}</span>
          </div>
          <div class="step-bar"><span style="width:${pct}%"></span></div>
        </div>
      `;
    }).join('');
    $('home-journey').innerHTML = html;
  } catch (e) {
    console.error('journey tile error', e);
    $('home-journey').innerHTML = '<p class="empty-note">Failed to load journey.</p>';
  }
}

function renderLede(profile, criteria, financesData) {
  const max = criteria?.budget?.max || 0;
  const dep = criteria?.budget?.targetDeposit || 0;
  const beds = criteria?.size?.minBeds;
  const ideal = criteria?.size?.idealBeds;
  const win = financesData?.goal?.movingWindow || profile?.movingTimeline;
  setText('lede-budget', max ? gbp(max) : '—');
  setText('lede-deposit', dep ? gbp(dep) : '—');
  setText('lede-beds', beds ? (ideal && ideal > beds ? `${beds}–${ideal}` : String(beds)) : '—');
  setText('lede-window', win || '—');

  const lede = $('lede-prose');
  if (!lede) return;
  if (profile?.headline) {
    lede.textContent = profile.headline;
    return;
  }
  const pref = criteria?.propertyTypePrefs?.preferred?.slice(0, 2).join(' or ');
  const loc = profile?.locationFocus || 'Hampshire & Wiltshire';
  const parts = [];
  parts.push(`Looking for ${pref ? `a ${pref}` : 'a home'} in ${loc}`);
  if (beds) parts.push(`${ideal && ideal > beds ? `${beds}–${ideal}` : beds}-bed`);
  if (max) parts.push(`around ${gbp(max)}`);
  if (dep) parts.push(`with a ${gbp(dep)} deposit target`);
  lede.textContent = parts.join(' · ') + '.';
}

async function renderAboutCell(profile) {
  const chips = $('home-priorities');
  if (chips) {
    const prio = (profile?.priorities || []).slice(0, 5);
    chips.innerHTML = prio.length
      ? prio.map((p) => `<li class="chip">${esc(p)}</li>`).join('')
      : '<li class="empty-note">No priorities yet — open About to add some.</li>';
  }
  setText('home-buyers', profile?.buyers || profile?.household || '');
}

function joinList(arr, n = 3) {
  if (!arr || !arr.length) return '—';
  const head = arr.slice(0, n).join(', ');
  return arr.length > n ? `${head} +${arr.length - n}` : head;
}

function renderFiltersCell(criteria) {
  const types = criteria?.propertyTypePrefs?.preferred;
  const must = criteria?.features?.mustHave?.length
    ? criteria.features.mustHave
    : (criteria?.mustHaves || []);
  const tenure = criteria?.tenure?.preferred;
  const epc = criteria?.epcMin;
  setText('hf-types', joinList(types));
  setText('hf-must', joinList(must, 4));
  setText('hf-tenure', joinList(tenure, 2));
  setText('hf-epc', epc || '—');
}

async function init() {
  let financesData = null;
  let profile = null;
  let criteria = null;
  try { financesData = await getFinances(); } catch (e) { console.error('finances error', e); }
  try { profile = await getProfile(); } catch (e) { console.error('profile error', e); }
  try { criteria = await getCriteria(); } catch (e) { console.error('criteria error', e); }
  if (financesData) {
    renderHero(financesData);
    renderSavingsChart(financesData);
  }
  renderLede(profile, criteria, financesData);
  await renderAboutCell(profile);
  renderFiltersCell(criteria);
  await renderShortlist();
  await renderJourney();
}

function ready(fn) {
  if (document.readyState === 'complete') fn();
  else window.addEventListener('load', fn, { once: true });
}
ready(init);
