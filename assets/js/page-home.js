// page-home.js — dashboard (Phase 3 overhaul).
// 7-tile bento: Deposit story · Affordability · Money-flow · Shortlist · Journey · Criteria · Ask placeholder.
// The page-lede strip above the bento is unchanged from Phase 2 (driven by renderLede).
import { getFinances, getShortlist, getAreas, getProfile, getCriteria, _internal } from './storage.js';
import { loadJSON } from './data-loader.js';
import * as fin from './finances.js';
import { gbp, monthsAsDuration } from './format.js';
import { assessAffordability } from './affordability.js';
import { getMoneyFlow, getMoneyFlowPostMove } from './money-flow.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const $ = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) { delete el.dataset.loading; el.textContent = v; } };
const setHTML = (id, h) => { const el = $(id); if (el) { delete el.dataset.loading; el.innerHTML = h; } };

// Placeholders that show an animated loading indicator until their render lands.
const LOADING_IDS = ['td-headline', 'tf-headline', 'ta-verdict', 'tj-next-text', 'tc-prose'];
function markLoading() {
  for (const id of LOADING_IDS) {
    const el = $(id);
    if (el) { el.dataset.loading = 'true'; el.textContent = ''; }
  }
}
function clearStuckLoading() {
  for (const id of LOADING_IDS) {
    const el = $(id);
    if (el && el.dataset.loading) { delete el.dataset.loading; if (!el.textContent.trim()) el.textContent = '—'; }
  }
}
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================
// Page-lede (strip above the bento — unchanged from Phase 2)
// ============================================================

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
  if (profile?.headline) { lede.textContent = profile.headline; return; }
  const pref = criteria?.propertyTypePrefs?.preferred?.slice(0, 2).join(' or ');
  const loc = profile?.locationFocus || 'Hampshire & Wiltshire';
  const parts = [`Looking for ${pref ? `a ${pref}` : 'a home'} in ${loc}`];
  if (beds) parts.push(`${ideal && ideal > beds ? `${beds}–${ideal}` : beds}-bed`);
  if (max) parts.push(`around ${gbp(max)}`);
  if (dep) parts.push(`with a ${gbp(dep)} deposit target`);
  lede.textContent = parts.join(' · ') + '.';
}

// ============================================================
// Tile 2 — Deposit story (arc + mini-flow bar + ETA + scenario chips)
// ============================================================

const SCENARIO_DELTAS = {
  baseline: { deltaMonthly: 0,    lumpSum: 0    },
  '+200':   { deltaMonthly: 200,  lumpSum: 0    },
  '+500':   { deltaMonthly: 500,  lumpSum: 0    },
  '+5k':    { deltaMonthly: 0,    lumpSum: 5000 },
};

function setRing(pct) {
  const bar = $('td-ring-bar');
  if (!bar) return;
  const offset = 100 - Math.min(Math.max(0, pct), 100);
  requestAnimationFrame(() => { bar.style.strokeDashoffset = String(offset); });
}

function applyDepositScenario(base, scenarioKey) {
  const delta = SCENARIO_DELTAS[scenarioKey] || SCENARIO_DELTAS.baseline;
  const saved = base.saved + delta.lumpSum;
  const monthly = base.monthly + delta.deltaMonthly;
  const target = base.target;
  const pct = fin.calcDepositProgress(saved, target);
  const monthsTo = fin.calcMonthsToTarget(saved, target, monthly);

  setText('td-saved', gbp(saved));
  setText('td-target', gbp(target));
  setText('td-monthly', gbp(monthly) + '/mo');
  setText('td-ring-pct', String(pct));
  setText('td-headline', `${gbp(saved)} / ${gbp(target)}`);
  setRing(pct);

  const etaEl = $('td-eta');
  if (!etaEl) return;
  if (!Number.isFinite(monthsTo) || target === 0) {
    etaEl.textContent = base.window ? `Moving window: ${base.window}` : 'Set a deposit target on the Finances page.';
    return;
  }
  const eta = new Date();
  eta.setMonth(eta.getMonth() + Math.round(monthsTo));
  const etaLabel = eta.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  etaEl.innerHTML = `Target in <strong>${esc(monthsAsDuration(monthsTo))}</strong> · ${etaLabel}` +
                    (base.window ? ` · window <strong>${esc(base.window)}</strong>` : '');
}

const MINI_FLOW_COLORS = {
  Bills:    'color-mix(in oklch, var(--ink) 14%, var(--paper))',
  Expenses: 'color-mix(in oklch, var(--ink) 28%, var(--paper))',
  Savings:  'color-mix(in oklch, var(--accent) 35%, var(--paper))',
  Spare:    'color-mix(in oklch, var(--accent) 14%, var(--paper))',
};

function renderMiniFlow(financesData) {
  const flow = getMoneyFlow(financesData);
  const total = Math.max(1, flow.income.total || 0);
  const order = ['Bills', 'Expenses', 'Savings', 'Spare'];

  setHTML('td-flow', order.map((name) => {
    const b = flow.buckets.find((x) => x.name === name);
    if (!b || b.amount <= 0) return '';
    const w = (b.amount / total) * 100;
    return `<span style="width:${w.toFixed(2)}%;background:${MINI_FLOW_COLORS[name]}" title="${esc(name)}: ${gbp(b.amount)}"></span>`;
  }).join(''));

  setHTML('td-flow-legend', order.map((name) => {
    const b = flow.buckets.find((x) => x.name === name);
    if (!b) return '';
    return `<li><span class="swatch" style="background:${MINI_FLOW_COLORS[name]}" aria-hidden="true"></span>${esc(name)}<strong>${gbp(b.amount)}</strong></li>`;
  }).join(''));
}

function renderDeposit(financesData) {
  const base = {
    saved:   Number(financesData?.savings?.totalSavings ?? financesData?.savings?.current ?? 0),
    monthly: Number(financesData?.savings?.monthlyContribution || 0),
    target:  Number(financesData?.goal?.targetDeposit || 0),
    window:  financesData?.goal?.movingWindow,
  };

  applyDepositScenario(base, 'baseline');
  renderMiniFlow(financesData);

  document.querySelectorAll('.scenario-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.scenario;
      if (!SCENARIO_DELTAS[key]) return;
      document.querySelectorAll('.scenario-chip').forEach((c) => {
        c.setAttribute('aria-pressed', String(c === chip));
      });
      applyDepositScenario(base, key);
    });
  });
}

// ============================================================
// Tile 3 — Affordability ladder
// ============================================================

const LADDER_RANGE = { min: 250000, max: 500000, step: 2000 };
const LADDER_TICKS = [250000, 300000, 350000, 400000, 450000, 500000];

function findBands(financesData, criteria) {
  const points = [];
  for (let p = LADDER_RANGE.min; p <= LADDER_RANGE.max; p += LADDER_RANGE.step) {
    const v = assessAffordability({ price: p, finances: financesData, criteria }).verdict;
    points.push({ price: p, verdict: v });
  }
  const bands = [];
  let start = points[0].price, current = points[0].verdict;
  for (let i = 1; i < points.length; i++) {
    if (points[i].verdict !== current) {
      bands.push({ verdict: current, start, end: points[i].price });
      current = points[i].verdict;
      start = points[i].price;
    }
  }
  bands.push({ verdict: current, start, end: LADDER_RANGE.max });
  return bands;
}

function buildLadderSVG(bands, markerPrice) {
  const w = 300, h = 80;
  const padX = 8, bandY = 22, bandH = 28;
  const innerW = w - 2 * padX;
  const scale = (price) => padX + ((price - LADDER_RANGE.min) / (LADDER_RANGE.max - LADDER_RANGE.min)) * innerW;
  const clamp = (p) => Math.min(LADDER_RANGE.max, Math.max(LADDER_RANGE.min, p));

  let svg = '';
  for (const b of bands) {
    const x = scale(b.start);
    const bw = scale(b.end) - x;
    svg += `<rect class="ladder__band ladder__band--${b.verdict}" x="${x.toFixed(1)}" y="${bandY}" width="${bw.toFixed(1)}" height="${bandH}" />`;
  }
  for (const t of LADDER_TICKS) {
    const x = scale(t);
    svg += `<text class="ladder__tick" x="${x.toFixed(1)}" y="${h - 4}" text-anchor="middle">£${(t / 1000).toFixed(0)}k</text>`;
  }
  const mx = scale(clamp(markerPrice));
  svg += `<line class="ladder__marker" x1="${mx.toFixed(1)}" y1="${bandY - 6}" x2="${mx.toFixed(1)}" y2="${bandY + bandH + 6}" />`;
  svg += `<circle class="ladder__marker" cx="${mx.toFixed(1)}" cy="${bandY + bandH + 6}" r="3" />`;
  svg += `<text class="ladder__label" x="${mx.toFixed(1)}" y="${bandY - 10}" text-anchor="middle">${esc(gbp(markerPrice))}</text>`;
  return svg;
}

function renderAffordability(financesData, criteria) {
  const offerTarget = Number(criteria?.budget?.offerTarget || financesData?.goal?.offerTarget || 380000);
  const bands = findBands(financesData, criteria);

  const updateAt = (price) => {
    const svgEl = $('ta-ladder');
    if (svgEl) svgEl.innerHTML = buildLadderSVG(bands, price);
    const r = assessAffordability({ price, finances: financesData, criteria });
    setText('ta-verdict', r.headline);
  };

  updateAt(offerTarget);

  ['ta-price-a', 'ta-price-b'].forEach((id) => {
    const input = $(id);
    if (!input) return;
    input.addEventListener('input', (e) => {
      const price = Number(e.target.value);
      if (!Number.isFinite(price) || price < 100000 || price > 2000000) return;
      updateAt(price);
    });
  });
}

// ============================================================
// Tile 4 — Money-flow (today vs after-move, SVG bars + tap details)
// ============================================================

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
    svg += `<rect class="${cls}" x="${x.toFixed(1)}" y="${barY}" width="${bw.toFixed(1)}" height="${barH}" data-bucket="${esc(bucket.kind)}" data-name="${esc(bucket.name)}" />`;
    if (bw > 36) {
      svg += `<text class="flow__seg-label" x="${(x + bw / 2).toFixed(1)}" y="${(barY + barH / 2 + 3).toFixed(1)}" text-anchor="middle" pointer-events="none">${esc(gbp(bucket.amount))}</text>`;
    }
    x += bw;
  }
  // If spare is negative, show a red sliver to flag it.
  if (flow.spare < 0) {
    const sw = scale(Math.abs(flow.spare));
    svg += `<rect class="flow__seg flow__seg--negative" x="${(w - padX - sw).toFixed(1)}" y="${barY}" width="${sw.toFixed(1)}" height="${barH}" data-bucket="negative" data-name="Shortfall" />`;
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

function lineItemsFor(kind, financesData, monthlyMortgage) {
  if (kind === 'bills') return (financesData.ongoingBills || []).map((b) => ({ label: b.item, amount: b.monthly }));
  if (kind === 'expenses') return (financesData.expenses || []).map((b) => ({ label: b.item, amount: b.monthly }));
  if (kind === 'savings') return [{ label: 'Monthly savings contribution', amount: financesData.savings?.monthlyContribution || 0 }];
  if (kind === 'mortgage') {
    const r = financesData.mortgage?.ratePctAssumed;
    const t = financesData.mortgage?.termYears;
    return [{ label: `Mortgage P&I (${r}% over ${t}y)`, amount: monthlyMortgage }];
  }
  if (kind === 'spare') return [{ label: 'Discretionary / unallocated', amount: 0 }];
  return [];
}

function renderMoneyFlow(financesData, criteria) {
  const offerTarget = Number(criteria?.budget?.offerTarget || financesData?.goal?.offerTarget || 380000);
  const targetDeposit = Number(criteria?.budget?.targetDeposit || financesData?.goal?.targetDeposit || 0);
  const loan = Math.max(0, offerTarget - targetDeposit);
  const monthlyMortgage = fin.calcMonthlyMortgage(loan, financesData.mortgage?.ratePctAssumed || 0, financesData.mortgage?.termYears || 0);

  const today = getMoneyFlow(financesData);
  const after = getMoneyFlowPostMove(financesData, monthlyMortgage);

  // Scale both bars to the larger total so widths compare visually.
  const maxTotal = Math.max(
    today.buckets.reduce((s, b) => s + Math.max(0, b.amount), 0),
    after.buckets.reduce((s, b) => s + Math.max(0, b.amount), 0),
  );

  setHTML('tf-flow-today', buildFlowBar(today, maxTotal));
  setHTML('tf-flow-after', buildFlowBar(after, maxTotal));
  setHTML('tf-legend-today', buildFlowLegend(today));
  setHTML('tf-legend-after', buildFlowLegend(after));

  setText('tf-headline', `Spare ${gbp(today.spare)} → ${gbp(after.spare)}/mo`);
  const cap = $('tf-caption');
  if (cap) {
    if (after.spare < 0) {
      cap.innerHTML = `Spare drops from <strong>${esc(gbp(today.spare))}</strong> to <strong>${esc(gbp(after.spare))}/mo</strong> — outgoings exceed take-home at the offer price (${esc(gbp(offerTarget))}).`;
    } else {
      cap.innerHTML = `Spare drops from <strong>${esc(gbp(today.spare))}</strong> to <strong>${esc(gbp(after.spare))}/mo</strong> at the offer price (${esc(gbp(offerTarget))}).`;
    }
  }

  // Tap segment → expand details.
  const detailsEl = $('tf-details');
  const summaryEl = $('tf-details-summary');
  const listEl = $('tf-details-list');
  const openDetails = (kind, name, items) => {
    if (!detailsEl || !summaryEl || !listEl) return;
    detailsEl.hidden = false;
    detailsEl.open = true;
    summaryEl.textContent = `${name} — line items`;
    listEl.innerHTML = items.map((it) => `
      <li><span>${esc(it.label)}</span><span class="num">${esc(gbp(it.amount))}</span></li>
    `).join('');
  };

  ['tf-flow-today', 'tf-flow-after'].forEach((id) => {
    const svg = $(id);
    if (!svg) return;
    svg.addEventListener('click', (e) => {
      const target = e.target.closest('[data-bucket]');
      if (!target) return;
      const kind = target.dataset.bucket;
      const name = target.dataset.name || kind;
      if (kind === 'negative') {
        openDetails(kind, 'Shortfall', [
          { label: `Outgoings exceed take-home by`, amount: Math.abs(after.spare) },
        ]);
        return;
      }
      openDetails(kind, name, lineItemsFor(kind, financesData, monthlyMortgage));
    });
  });
}

// ============================================================
// Tile 5 — Shortlist with fit dots
// ============================================================

function fitDotClass(verdict) {
  if (verdict === 'comfortable') return 'fit-dot fit-dot--comfortable';
  if (verdict === 'stretch')     return 'fit-dot fit-dot--stretch';
  if (verdict === 'tight')       return 'fit-dot fit-dot--tight';
  if (verdict === 'out-of-reach') return 'fit-dot fit-dot--out-of-reach';
  return 'fit-dot fit-dot--unknown';
}

function priceFor(area) {
  return area?.prices?.avg3Bed
      ?? area?.prices?.avgDetached
      ?? area?.prices?.avgSemi
      ?? area?.prices?.median
      ?? null;
}

async function renderShortlist(financesData, criteria) {
  try {
    const shortlist = getShortlist();
    const areas = await getAreas();
    const items = shortlist.length
      ? areas.filter((a) => shortlist.includes(a.id))
      : areas.slice(0, 5);
    setText('ts-count', shortlist.length ? `${shortlist.length} ${shortlist.length === 1 ? 'area' : 'areas'}` : `${items.length} suggested`);
    const ul = $('home-areas');
    if (!ul) return;
    if (!items.length) {
      ul.innerHTML = '<li class="empty-note">No areas yet — open the Areas tab to browse.</li>';
      return;
    }
    ul.innerHTML = items.slice(0, 5).map((a, i) => {
      const price = priceFor(a);
      let dotClass = 'fit-dot fit-dot--unknown';
      let dotTitle = 'No price data for this area';
      if (price && financesData && criteria) {
        const r = assessAffordability({ price, finances: financesData, criteria });
        dotClass = fitDotClass(r.verdict);
        dotTitle = `${r.verdict} at ${esc(gbp(price))}`;
      }
      return `
        <li>
          <span class="sl-index num">${String(i + 1).padStart(2, '0')}</span>
          <span class="${dotClass}" title="${dotTitle}" aria-label="${dotTitle}"></span>
          <span class="sl-name">
            <a href="pages/area-detail.html?id=${encodeURIComponent(a.id)}">${esc(a.name)}</a>
            <small class="sl-place">${esc(a.town || a.subRegion || a.county || '')}</small>
          </span>
          <span class="sl-meta">${esc(a.county || '')}</span>
        </li>
      `;
    }).join('');
  } catch (e) { console.error('shortlist tile error', e); }
}

// ============================================================
// Tile 6 — Journey track + next action
// ============================================================

function journeyState() {
  return _internal.readLocal('journey-checks') || { viewing: {}, process: {}, moving: {} };
}

// Items in checklists.json have no stable id — the journey page uses array index
// as the state key. Match that convention so dashboard state writes/reads
// interoperate with the journey page's ticks.
function itemLabel(section, item) {
  return section === 'moving' ? (item.task || '') : (item.item || '');
}

function findNextAction(checklists, state) {
  const order = ['viewing', 'process', 'moving'];
  for (const key of order) {
    const items = checklists?.[key] || [];
    for (let i = 0; i < items.length; i++) {
      if (!state[key]?.[i]) {
        return { section: key, index: i, title: itemLabel(key, items[i]) };
      }
    }
  }
  return null;
}

async function renderJourneyTrack() {
  try {
    const data = await loadJSON('checklists');
    const state = journeyState();
    const sections = [
      { key: 'viewing', label: 'Viewing' },
      { key: 'process', label: 'Buying process' },
      { key: 'moving',  label: 'Moving' },
    ];
    const stats = sections.map((s) => {
      const items = data[s.key] || [];
      const total = items.length;
      const done = items.reduce((n, _, i) => n + (state[s.key]?.[i] ? 1 : 0), 0);
      return { ...s, total, done, isDone: total > 0 && done >= total };
    });
    const currentIdx = stats.findIndex((s) => !s.isDone);

    $('tj-track').innerHTML = stats.map((s, i) => {
      const mod = s.isDone ? '--done' : (i === currentIdx ? '--current' : '');
      return `
        <li class="journey-track__node ${mod ? 'journey-track__node' + mod : ''}">
          <span class="journey-track__label">${esc(s.label)}</span>
          <span class="journey-track__count">${s.done}/${s.total}</span>
        </li>
      `;
    }).join('');

    const next = findNextAction(data, state);
    const tickBtn = $('tj-next-tick');
    if (!next) {
      setText('tj-next-text', 'All steps ticked off — nice work.');
      if (tickBtn) tickBtn.disabled = true;
      return;
    }
    setText('tj-next-text', next.title);
    if (tickBtn) {
      tickBtn.disabled = false;
      tickBtn.onclick = () => {
        const fresh = journeyState();
        fresh[next.section] = fresh[next.section] || {};
        fresh[next.section][next.index] = true;
        _internal.writeLocal('journey-checks', fresh);
        renderJourneyTrack();
      };
    }
  } catch (e) {
    console.error('journey tile error', e);
    setText('tj-next-text', 'Failed to load journey.');
  }
}

// ============================================================
// Tile 7 — Criteria-as-prose + spec strip
// ============================================================

function buildCriteriaProse(criteria, profile) {
  if (!criteria) return '—';
  const pref = criteria.propertyTypePrefs?.preferred?.slice(0, 2).join(' or ');
  const beds = criteria.size?.minBeds;
  const ideal = criteria.size?.idealBeds;
  const bedsStr = beds ? (ideal && ideal > beds ? `${beds}–${ideal}-bed ` : `${beds}-bed `) : '';
  const tenure = criteria.tenure?.preferred?.[0]?.toLowerCase() || criteria.tenurePref || '';
  const tenureStr = tenure ? `${tenure} ` : '';
  const loc = profile?.locationFocus || 'Hampshire & Wiltshire';
  const min = criteria.budget?.min;
  const max = criteria.budget?.max;
  const budgetStr = (min && max) ? `${gbp(min)}–${gbp(max)}` : (max ? `up to ${gbp(max)}` : '');
  const epc = criteria.epcMin ? `EPC ${criteria.epcMin}+` : '';
  const must = (criteria.features?.mustHave || []).map((s) => s.toLowerCase());
  const mustStr = must.length ? `with ${must.slice(0, 2).join(' and ')}` : '';
  const excludes = (criteria.tenure?.excluded || []).map((s) => s.toLowerCase());
  const excludesStr = excludes.length ? ` Avoiding ${excludes.slice(0, 2).join(' and ')}.` : '';

  const head = `Looking for a ${tenureStr}${bedsStr}${pref || 'home'} in ${loc}`;
  const tail = [budgetStr, epc, mustStr].filter(Boolean).join(', ');
  return `${head}${tail ? ', ' + tail : ''}.${excludesStr}`;
}

function buildSpecStrip(criteria, financesData) {
  const beds = criteria?.size?.minBeds;
  const ideal = criteria?.size?.idealBeds;
  const bedsStr = beds ? (ideal && ideal > beds ? `${beds}–${ideal}` : String(beds)) : '—';
  const min = criteria?.budget?.min, max = criteria?.budget?.max;
  const budgetStr = (min && max) ? `${gbp(min)}–${gbp(max)}` : (max ? gbp(max) : '—');
  const dep = criteria?.budget?.targetDeposit || financesData?.goal?.targetDeposit;
  const epc = criteria?.epcMin || '—';
  const tenure = criteria?.tenure?.preferred?.[0] || '—';
  const win = financesData?.goal?.movingWindow || '—';

  return [
    ['Beds', bedsStr],
    ['Budget', budgetStr],
    ['Deposit', dep ? gbp(dep) : '—'],
    ['EPC', epc],
    ['Tenure', tenure],
    ['Window', win],
  ].map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
}

function renderCriteriaProse(criteria, profile, financesData) {
  setText('tc-prose', buildCriteriaProse(criteria, profile));
  setHTML('tc-strip', buildSpecStrip(criteria, financesData));
}

// ============================================================
// Init
// ============================================================

async function init() {
  markLoading();
  let financesData = null, profile = null, criteria = null;
  try { financesData = await getFinances(); } catch (e) { console.error('finances error', e); }
  try { profile = await getProfile(); } catch (e) { console.error('profile error', e); }
  try { criteria = await getCriteria(); } catch (e) { console.error('criteria error', e); }

  renderLede(profile, criteria, financesData);

  if (financesData) {
    renderDeposit(financesData);
    if (criteria) {
      renderAffordability(financesData, criteria);
      renderMoneyFlow(financesData, criteria);
    }
  }

  await renderShortlist(financesData, criteria);
  await renderJourneyTrack();
  renderCriteriaProse(criteria, profile, financesData);
  clearStuckLoading();
}

function ready(fn) {
  if (document.readyState === 'complete') fn();
  else window.addEventListener('load', fn, { once: true });
}
ready(init);
