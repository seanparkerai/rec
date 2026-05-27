// page-home.js — dashboard (Phase 3 overhaul).
// 7-tile bento: Deposit story · Affordability · Money-flow · Shortlist · Journey · Criteria · Ask placeholder.
// The page-lede strip above the bento is unchanged from Phase 2 (driven by renderLede).
import { getFinances, getShortlist, getAreas, getProfile, getCriteria, _internal } from './storage.js';
import { loadJSON } from './data-loader.js';
import * as fin from './finances.js';
import { gbp, monthsAsDuration } from './format.js';
import { assessAffordability } from './affordability.js';
import { getMoneyFlow, getMoneyFlowPostMove } from './money-flow.js';
import { analysePerformance } from './investment-performance.js';
import { assessDepositRisk } from './deposit-risk.js';
import { assessAffordabilityScenarios } from './affordability.js';
import { deriveFinances } from './finance-derive.js';
import { buildSavingsSeries } from './savings-series.js';
import { getSavingsVelocity } from './savings-velocity.js';
import { esc, byId as $, setText, setHTML } from './dom.js';
import { prefersReducedMotion } from './motion.js';
import { SVG_NS } from './svg.js';
import { LADDER_RANGE, LADDER_TICKS } from './intelligence-constants.js';
import { FLOW_PALETTE } from './flow-constants.js';

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

// ============================================================
// Page-lede (strip above the bento — unchanged from Phase 2)
// ============================================================

function renderLede(profile, criteria, financesData) {
  const max = criteria?.budget?.max || 0;
  const dep = financesData?.goal?.targetDeposit || 0;
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
  setText('td-monthly', `${gbp(monthly)} goal`);
  const avgMo = base.avgMonthly;
  setText('td-monthly-avg', Number.isFinite(avgMo) && avgMo > 0 ? `${gbp(avgMo)} avg` : '');
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
    avgMonthly: Number(financesData?.savings?.avgMonthlyDepositEstimate || 0),
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

function buildLadderSVG(bands, loPrice, hiPrice) {
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

  const lo = clamp(Math.min(loPrice, hiPrice));
  const hi = clamp(Math.max(loPrice, hiPrice));
  const isRange = hi > lo;

  if (isRange) {
    const rx = scale(lo);
    const rw = scale(hi) - rx;
    svg += `<rect class="ladder__range" x="${rx.toFixed(1)}" y="${bandY - 4}" width="${rw.toFixed(1)}" height="${bandH + 8}" rx="3" />`;
  }

  for (const t of LADDER_TICKS) {
    const x = scale(t);
    svg += `<text class="ladder__tick" x="${x.toFixed(1)}" y="${h - 4}" text-anchor="middle">£${(t / 1000).toFixed(0)}k</text>`;
  }

  const drawMarker = (price, anchor) => {
    const mx = scale(clamp(price));
    return `<line class="ladder__marker" x1="${mx.toFixed(1)}" y1="${bandY - 6}" x2="${mx.toFixed(1)}" y2="${bandY + bandH + 6}" />`
      + `<circle class="ladder__marker" cx="${mx.toFixed(1)}" cy="${bandY + bandH + 6}" r="3" />`
      + `<text class="ladder__label" x="${mx.toFixed(1)}" y="${bandY - 10}" text-anchor="${anchor}">${esc(gbp(price))}</text>`;
  };

  if (isRange) {
    svg += drawMarker(lo, 'start');
    svg += drawMarker(hi, 'end');
  } else {
    svg += drawMarker(lo, 'middle');
  }
  return svg;
}

function renderAffordability(financesData, criteria) {
  const offerTarget = Number(criteria?.budget?.offerTarget || financesData?.goal?.offerTarget || 380000);
  const bands = findBands(financesData, criteria);
  const inputA = $('ta-price-a');
  const inputB = $('ta-price-b');
  const verdictLabel = (v) => (v || 'unknown').replace(/-/g, ' ');
  const valid = (n) => Number.isFinite(n) && n >= 100000 && n <= 2000000;

  const update = () => {
    const vals = [Number(inputA?.value), Number(inputB?.value)].filter(valid);
    if (!vals.length) return;
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const svgEl = $('ta-ladder');
    if (svgEl) svgEl.innerHTML = buildLadderSVG(bands, lo, hi);

    const rLo = assessAffordability({ price: lo, finances: financesData, criteria });
    if (hi > lo) {
      const rHi = assessAffordability({ price: hi, finances: financesData, criteria });
      setText('ta-verdict', rLo.verdict === rHi.verdict
        ? `${gbp(lo)}–${gbp(hi)} is ${verdictLabel(rLo.verdict)} across the range.`
        : `${gbp(lo)}–${gbp(hi)}: ${verdictLabel(rLo.verdict)} at the low end, ${verdictLabel(rHi.verdict)} at the top.`);
    } else {
      setText('ta-verdict', rLo.headline);
    }
  };

  // Seed both fields from the saved budget so the range shows immediately.
  const seedLo = Number(criteria?.budget?.min) || offerTarget;
  const seedHi = Number(criteria?.budget?.max) || Math.min(LADDER_RANGE.max, offerTarget + 70000);
  if (inputA && !inputA.value) inputA.value = String(Math.min(seedLo, seedHi));
  if (inputB && !inputB.value) inputB.value = String(Math.max(seedLo, seedHi));

  update();
  [inputA, inputB].forEach((input) => { if (input) input.addEventListener('input', update); });
}

// ============================================================
// Tile 4 — Money-flow (today vs after-move, SVG bars + tap details)
// ============================================================



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
  const targetDeposit = Number(financesData?.goal?.targetDeposit || 0);
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
  const dep = financesData?.goal?.targetDeposit;
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
  let rawFinances = null, rawInvestments = null, profile = null, criteria = null;

  // Load investments once for cross-resource savings totals (ISA earmark).
  try { rawInvestments = await loadJSON('investments'); } catch { rawInvestments = null; }

  const renderAll = (financesData) => {
    renderLede(profile, criteria, financesData);
    if (financesData) {
      renderDeposit(financesData);
      if (criteria) {
        renderAffordability(financesData, criteria);
        renderMoneyFlow(financesData, criteria);
      }
    }
    renderShortlist(financesData, criteria);
    renderJourneyTrack();
    renderCriteriaProse(criteria, profile, financesData);
    renderISAYTD();
    renderReadinessTile(financesData);
    renderDepositRiskTile();
    renderAffordabilityScenariosTile(financesData, criteria);
    // v3 visuals — stub-safe; render last so they never delay the existing tiles.
    renderSavingsSpark(financesData);
    renderScenariosFan(financesData);
    renderNetworthDonut(financesData);
    renderWithdrawalReadiness();
    clearStuckLoading();
  };

  try {
    rawFinances = await getFinances({
      onUpdate: (fresh) => renderAll(deriveFinances(fresh, { investments: rawInvestments })),
    });
  } catch (e) { console.error('finances error', e); }
  try { profile = await getProfile(); } catch (e) { console.error('profile error', e); }
  try { criteria = await getCriteria(); } catch (e) { console.error('criteria error', e); }

  const financesData = deriveFinances(rawFinances, { investments: rawInvestments });
  renderAll(financesData);
}

// --- New Phase 4 tiles ---------------------------------------------------------

const READINESS_PRIORITY = [
  { key: 'experianChecked',              label: 'Check your Experian credit score' },
  { key: 'equifaxChecked',               label: 'Check your Equifax credit score' },
  { key: 'transUnionChecked',            label: 'Check your TransUnion credit score' },
  { key: 'electoralRollRegistered',      label: 'Register on the electoral roll' },
  { key: 'mortgageBrokerConversation',   label: 'Speak to a mortgage broker' },
  { key: 'agreementInPrincipleObtained', label: 'Get an Agreement in Principle' },
  { key: 'conveyancerIdentified',        label: 'Identify a conveyancer' },
];

async function renderReadinessTile(financesData) {
  const elHeadline = document.getElementById('readiness-headline');
  const elStats = document.getElementById('readiness-stats');
  const elNext = document.getElementById('readiness-next-text');
  if (!elHeadline) return;

  let goals;
  try { goals = await loadJSON('goals'); } catch { return; }

  const current = Number(goals?.deposit?.currentSavings ?? financesData?.savings?.totalSavings ?? 0);
  const hoped = Number(goals?.deposit?.hopedFor ?? 50_000);
  const pct = hoped > 0 ? Math.min(100, Math.round((current / hoped) * 100)) : 0;
  if (elHeadline) {
    elHeadline.textContent = `You're ${pct}% of the way to your hoped-for ${gbp(hoped)} deposit.`;
  }

  const monthly = Number(financesData?.savings?.monthlyContribution ?? 2000);
  const gap = Math.max(0, hoped - current);

  function moLabel(mo) {
    if (!Number.isFinite(mo) || mo <= 0) return 'already there';
    return `${Math.ceil(mo)} months`;
  }

  if (elStats) {
    elStats.innerHTML = `
      <div><dt>At current pace</dt><dd>${moLabel(monthly > 0 ? gap / monthly : Infinity)}</dd></div>
      <div><dt>At +£500/mo</dt><dd>${moLabel((monthly + 500) > 0 ? gap / (monthly + 500) : Infinity)}</dd></div>
      <div><dt>At +£1,000/mo</dt><dd>${moLabel((monthly + 1000) > 0 ? gap / (monthly + 1000) : Infinity)}</dd></div>`;
  }

  if (elNext) {
    const checklist = goals?.readiness?.checklist ?? {};
    const nextItem = READINESS_PRIORITY.find((item) => !checklist[item.key]);
    elNext.textContent = nextItem ? nextItem.label : 'All priority actions done.';
  }
}

async function renderDepositRiskTile() {
  const el = document.getElementById('tdr-body');
  const badge = document.getElementById('tdr-badge');
  if (!el) return;

  let investments, goals;
  try {
    investments = await loadJSON('investments');
    goals = await loadJSON('goals');
  } catch { return; }

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

async function renderAffordabilityScenariosTile(financesData, criteria) {
  const el = document.getElementById('tsc-body');
  if (!el || !financesData) return;

  let goals;
  try { goals = await loadJSON('goals'); } catch { goals = null; }

  const sc = assessAffordabilityScenarios({ finances: financesData, criteria, goals });

  function scRow(key, label, sc) {
    const verdictSlug = sc.verdict.replace('-', '_');
    const mo = sc.monthsToReady > 0 ? ` — ~${sc.monthsToReady} months` : ' — available now';
    return `<li class="scenario-row-item">
      <span class="scenario-label">${esc(label)}</span>
      <span class="scenario-detail num">${gbp(sc.price)} at ~${sc.ltvPct.toFixed(0)}% LTV</span>
      <span class="verdict-badge verdict-badge--${esc(verdictSlug)}">${esc(sc.verdict)}</span>
      <span class="scenario-eta muted">${esc(mo)}</span>
    </li>`;
  }

  el.innerHTML = `<ul class="scenario-list" aria-label="Affordability scenarios">
    ${scRow('lower', 'Buy sooner, smaller', sc.buyNowLowerTarget)}
    ${scRow('target', 'Buy at hoped target', sc.buyOnTargetDeposit)}
    ${scRow('higher', 'Stretch to £400k', sc.buyAtHigherTarget)}
  </ul>`;
}

async function renderISAYTD() {
  const el = document.getElementById('isa-ytd-stat');
  if (!el) return;
  try {
    const history = await loadJSON('imports/trading212-history');
    const perf = analysePerformance(history);
    if (perf.isStub) { el.textContent = '—'; return; }
    // YTD = current calendar year contributions.
    const year = new Date().getFullYear().toString();
    const ytd = (history.monthlySummary ?? [])
      .filter((m) => m.month.startsWith(year))
      .reduce((s, m) => s + (Number(m.net) || 0), 0);
    el.textContent = gbp(ytd);
  } catch { el.textContent = '—'; }
}

// --- v3 visual tiles ----------------------------------------------------------


function fmtMonth(label) {
  if (!label || typeof label !== 'string' || label.length < 7) return label ?? '';
  const [y, m] = label.split('-').map(Number);
  if (!y || !m) return label;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
}

async function renderSavingsSpark(financesData) {
  const svg = document.getElementById('td-savings-spark');
  const caption = document.getElementById('td-spark-caption');
  if (!svg || !financesData) return;

  let history;
  try { history = await loadJSON('imports/trading212-history'); } catch { history = null; }

  const goal = Number(financesData?.goal?.targetDeposit ?? 0);
  const series = buildSavingsSeries({ history, finances: financesData, goal });

  if (series.isStub || series.points.length === 0) {
    svg.replaceChildren();
    if (caption) caption.textContent = 'Run the Trading 212 importer to see your savings trajectory.';
    return;
  }

  // Last 12 months (or fewer if newer account).
  const window = series.points.slice(-12);
  const minV = 0;
  const maxV = Math.max(goal, ...window.map((p) => p.cumulative));
  const W = 280, H = 60, PAD_X = 4, PAD_Y = 6;
  const xs = (i) => PAD_X + (i / Math.max(1, window.length - 1)) * (W - 2 * PAD_X);
  const ys = (v) => H - PAD_Y - ((v - minV) / Math.max(1, maxV - minV)) * (H - 2 * PAD_Y);

  // Target hairline.
  const targetY = ys(goal);
  // Line path.
  const linePath = window.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.cumulative).toFixed(1)}`).join(' ');
  // Area fill under line.
  const areaPath = `${linePath} L ${xs(window.length - 1).toFixed(1)} ${(H - PAD_Y).toFixed(1)} L ${xs(0).toFixed(1)} ${(H - PAD_Y).toFixed(1)} Z`;

  svg.replaceChildren();
  // Target line
  const targetLine = document.createElementNS(SVG_NS, 'line');
  targetLine.setAttribute('x1', String(PAD_X));
  targetLine.setAttribute('x2', String(W - PAD_X));
  targetLine.setAttribute('y1', targetY.toFixed(1));
  targetLine.setAttribute('y2', targetY.toFixed(1));
  targetLine.setAttribute('class', 'deposit-sparkline__target');
  svg.appendChild(targetLine);
  // Area
  const area = document.createElementNS(SVG_NS, 'path');
  area.setAttribute('d', areaPath);
  area.setAttribute('class', 'deposit-sparkline__area');
  svg.appendChild(area);
  // Line
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

async function renderScenariosFan(financesData) {
  const svg = document.getElementById('tsf-svg');
  const caption = document.getElementById('tsf-caption');
  if (!svg || !financesData) return;

  const velocity = getSavingsVelocity(financesData);
  if (!velocity || !Number.isFinite(velocity.baseline?.etaMonths)) {
    svg.replaceChildren();
    if (caption) caption.textContent = 'Not enough finance data yet to project scenarios.';
    return;
  }

  // Pick a focused, decision-useful scenario set.
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

async function renderNetworthDonut(financesData) {
  const svg = document.getElementById('tnw-svg');
  const statsEl = document.getElementById('tnw-stats');
  const caption = document.getElementById('tnw-caption');
  if (!svg || !financesData) return;

  // Compose net-worth slices from finances data.
  const isaValue = Number(financesData?.savings?.totalSavings ?? 0)
    - Number(financesData?.savings?.cashSavings ?? 0);
  const cashValue = Number(financesData?.savings?.cashSavings ?? 0);
  // Card debt from outgoings (Barclaycard balance approximated by monthly payment × 12 is wrong;
  // use any explicit debts field if present, else 0).
  const cardDebt = Number(financesData?.debts?.creditCardsBalance ?? 0);

  const total = Math.max(1, isaValue + cashValue);
  const effective = Math.max(0, isaValue + cashValue - cardDebt);

  // Donut geometry.
  const cx = 100, cy = 100, r = 70, stroke = 18;
  const circ = 2 * Math.PI * r;
  const isaFrac = isaValue / total;
  const cashFrac = cashValue / total;
  // Debt shown as inset notch via dasharray offset; if cardDebt > 0, render a small overlap arc.

  svg.replaceChildren();
  // Track
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('cx', String(cx)); track.setAttribute('cy', String(cy)); track.setAttribute('r', String(r));
  track.setAttribute('class', 'networth-donut__track');
  track.setAttribute('stroke-width', String(stroke));
  svg.appendChild(track);
  // ISA slice
  const isaArc = document.createElementNS(SVG_NS, 'circle');
  isaArc.setAttribute('cx', String(cx)); isaArc.setAttribute('cy', String(cy)); isaArc.setAttribute('r', String(r));
  isaArc.setAttribute('class', 'networth-donut__isa');
  isaArc.setAttribute('stroke-width', String(stroke));
  isaArc.setAttribute('stroke-dasharray', `${(circ * isaFrac).toFixed(2)} ${circ.toFixed(2)}`);
  isaArc.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
  svg.appendChild(isaArc);
  // Cash slice (after ISA)
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
  // Centre text
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

async function renderWithdrawalReadiness() {
  const bar = document.getElementById('tws-bar');
  const fill = document.getElementById('tws-fill');
  const marker = document.getElementById('tws-marker');
  const caption = document.getElementById('tws-caption');
  if (!bar) return;

  let goals, investments;
  try { goals = await loadJSON('goals'); } catch { goals = null; }
  try { investments = await loadJSON('investments'); } catch { investments = null; }

  // Mortgage application target = roughly midpoint of moving window.
  const movingWindow = goals?.timeline?.horizon || '3-6 months';
  // Default seasoning: 3 months before mortgage application.
  const SEASONING_MONTHS = 3;
  // Assume application target date = today + 4 months as a midpoint of "3-6 months".
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

function ready(fn) {
  if (document.readyState === 'complete') fn();
  else window.addEventListener('load', fn, { once: true });
}
ready(init);
