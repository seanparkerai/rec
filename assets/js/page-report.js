// page-report.js — value-analysis report: fetch live from Supabase and render.
import { getReport } from './storage.js';
import { esc } from './dom.js';

// ── Formatters ────────────────────────────────────────────────────────────────
const gbp = (n) => n == null
  ? '—'
  : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);

const fmtDate = (s) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return String(s); }
};

const fmtPct = (n) => n == null ? '—' : `${Number(n).toFixed(1)}%`;

// ── Sort / filter state (village ranking) ─────────────────────────────────────
let _allRankRows    = [];
let _filteredRows   = [];
let _sortCol        = 'composite';
let _sortDir        = -1;   // -1 = descending, 1 = ascending

// ── Badge helpers ─────────────────────────────────────────────────────────────
function feasBadge(f) {
  const map = {
    realistic:    ['report-badge--realistic', 'Realistic'],
    stretch:      ['report-badge--stretch',   'Stretch'],
    out_of_reach: ['report-badge--outofreach','Out of reach'],
  };
  const [cls, label] = map[f] ?? ['', esc(f ?? '—')];
  return `<span class="report-badge ${cls}">${label}</span>`;
}

function confBadge(c) {
  const map = {
    high:   'report-badge--conf-high',
    medium: 'report-badge--conf-med',
    low:    'report-badge--conf-low',
  };
  const cls   = map[c] ?? '';
  const label = c ? String(c).charAt(0).toUpperCase() + String(c).slice(1) : '—';
  return `<span class="report-badge ${cls}">${label}</span>`;
}

// ── Section renderers ─────────────────────────────────────────────────────────

function renderHero(report) {
  const { band, oneLiner } = report.data.headline ?? {};
  return `
<section class="report-hero" aria-labelledby="rpt-hero-h">
  <p class="eyebrow">Value band</p>
  <p class="report-band num" id="rpt-hero-h">${esc(band ?? '—')}</p>
  <p class="report-one-liner">${esc(oneLiner ?? '')}</p>
  <p class="report-generated">Generated ${fmtDate(report.data.generatedAt ?? report.created_at)}</p>
</section>`;
}

function renderRationale(d) {
  if (!d.rationaleParagraph) return '';
  return `
<section class="report-section report-rationale">
  <p class="report-lead">${esc(d.rationaleParagraph)}</p>
</section>`;
}

function renderKeyPoints(d) {
  const pts = d.keyPoints;
  if (!Array.isArray(pts) || pts.length === 0) return '';
  const items = pts.map((kp, i) => `
  <li class="kp-item">
    <span class="kp-n num">${i + 1}</span>
    <div>
      <p class="kp-point">${esc(kp.point ?? '')}</p>
      ${kp.evidence ? `<p class="kp-evidence">${esc(kp.evidence)}</p>` : ''}
    </div>
  </li>`).join('');
  return `
<section class="report-section" aria-labelledby="rpt-kp-h">
  <h2 id="rpt-kp-h">Key findings</h2>
  <ol class="kp-list">${items}</ol>
</section>`;
}

function renderFeasibility(d) {
  const f = d.feasibility;
  if (!f) return '';

  const achievable = Array.isArray(f.achievableVillages) ? f.achievableVillages : [];
  const outOfReach = Array.isArray(f.outOfReachVillages)
    ? [...f.outOfReachVillages].sort((a, b) => (a.gapToCeiling ?? 0) - (b.gapToCeiling ?? 0))
    : [];
  const tradeOffs = Array.isArray(f.tradeOffs) ? f.tradeOffs : [];

  const achievableHtml = achievable.length ? `
  <div class="feas-achievable">
    <p class="feas-label">${achievable.length} achievable areas</p>
    <div class="chip-wrap">
      ${achievable.map(id => `<span class="chip chip--sm">${esc(id)}</span>`).join('')}
    </div>
  </div>` : '';

  const oorRows = outOfReach.map(v => `
  <tr>
    <td>${esc(v.area ?? v.areaId ?? '—')}</td>
    <td class="num">${gbp(v.gapToCeiling)}</td>
    <td class="muted">${esc(v.note ?? '')}</td>
  </tr>`).join('');

  const oorHtml = outOfReach.length ? `
  <div class="feas-oor">
    <p class="feas-label">${outOfReach.length} out-of-reach areas — sorted by gap to ceiling (ascending)</p>
    <div class="table-wrap">
      <table class="report-table">
        <thead><tr><th>Area</th><th>Gap to ceiling</th><th>Note</th></tr></thead>
        <tbody>${oorRows}</tbody>
      </table>
    </div>
  </div>` : '';

  const tradeHtml = tradeOffs.length ? `
  <ul class="tradeoff-list">${tradeOffs.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '';

  return `
<section class="report-section" aria-labelledby="rpt-feas-h">
  <h2 id="rpt-feas-h">Feasibility</h2>
  ${f.summary ? `<p>${esc(f.summary)}</p>` : ''}
  ${achievableHtml}
  ${oorHtml}
  ${tradeHtml}
</section>`;
}

// ── Village ranking table ─────────────────────────────────────────────────────

const RANK_COLS = [
  { key: 'name',               label: 'Village / Town' },
  { key: 'county',             label: 'County'          },
  { key: 'feasibility',        label: 'Feasibility'     },
  { key: 'cheapestAchievable', label: 'Cheapest'        },
  { key: 'overallAvg',         label: 'Overall avg'     },
  { key: 'composite',          label: 'Score'           },
  { key: 'priceConfidence',    label: 'Confidence'      },
];

function buildRankTable() {
  const sorted = [..._filteredRows].sort((a, b) => {
    const av = a[_sortCol], bv = b[_sortCol];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return typeof av === 'string' ? av.localeCompare(bv) * _sortDir : (av - bv) * _sortDir;
  });

  const headCells = RANK_COLS.map(c => {
    const active = c.key === _sortCol;
    const arrow  = active ? (` <span aria-hidden="true">${_sortDir === -1 ? '▼' : '▲'}</span>`) : '';
    return `<th class="sort-col${active ? ' sort-active' : ''}" data-sort="${c.key}" scope="col" aria-sort="${active ? (_sortDir === -1 ? 'descending' : 'ascending') : 'none'}" tabindex="0">${esc(c.label)}${arrow}</th>`;
  }).join('');

  const bodyRows = sorted.map(r => `
  <tr>
    <td>${esc(r.name ?? '—')}</td>
    <td>${esc(r.county ?? '—')}</td>
    <td>${feasBadge(r.feasibility)}</td>
    <td class="num">${gbp(r.cheapestAchievable)}</td>
    <td class="num">${gbp(r.overallAvg)}</td>
    <td class="num">${r.composite != null ? Number(r.composite).toFixed(1) : '—'}</td>
    <td>${confBadge(r.priceConfidence)}</td>
  </tr>`).join('');

  return `
<div class="table-wrap">
  <table class="report-table" aria-label="Village ranking, ${_filteredRows.length} rows">
    <thead><tr>${headCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</div>`;
}

function renderVillageRanking(d) {
  const rows = d.villageRanking;
  if (!Array.isArray(rows) || rows.length === 0) return '';
  _allRankRows  = rows;
  _filteredRows = rows;

  return `
<section class="report-section" aria-labelledby="rpt-rank-h">
  <h2 id="rpt-rank-h">Village ranking <span class="chip num">${rows.length}</span></h2>
  <p class="muted" style="font-size:var(--text-sm)">Default sort: composite score (highest first). Click any column header to sort.</p>
  <div class="rank-filters">
    <label class="rank-filter-label" for="rank-search">Filter</label>
    <input type="search" id="rank-search" class="rank-search" placeholder="Village or county…" autocomplete="off" />
    <label class="rank-filter-label" for="rank-feas">Feasibility</label>
    <select id="rank-feas" class="rank-feas">
      <option value="">All</option>
      <option value="realistic">Realistic</option>
      <option value="stretch">Stretch</option>
      <option value="out_of_reach">Out of reach</option>
    </select>
  </div>
  <div id="rank-table-wrap">${buildRankTable()}</div>
</section>`;
}

function renderSdlt(d) {
  const rows = d.sdltTable;
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const bodyRows = rows.map(r => `
  <tr>
    <td class="num">${gbp(r.price)}</td>
    <td class="num">${gbp(r.ftbSdlt)}</td>
    <td class="num">${gbp(r.standardSdlt)}</td>
  </tr>`).join('');
  return `
<section class="report-section" aria-labelledby="rpt-sdlt-h">
  <h2 id="rpt-sdlt-h">Stamp duty (SDLT)</h2>
  <div class="table-wrap">
    <table class="report-table">
      <thead><tr><th>Purchase price</th><th>First-time buyer SDLT</th><th>Standard SDLT</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>
</section>`;
}

function renderMortgage(d) {
  const rows = d.mortgageTable;
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const bodyRows = rows.map(r => `
  <tr>
    <td>${esc(r.lender ?? '—')}</td>
    <td>${esc(r.product ?? '—')}</td>
    <td class="num">${r.ltv != null ? `${r.ltv}%` : '—'}</td>
    <td class="num">${r.ratePct != null ? `${r.ratePct}%` : '—'}</td>
    <td class="num">${r.feeFree ? 'Fee-free' : gbp(r.fee)}</td>
    <td class="num">${gbp(r.estMonthly)}/mo</td>
    <td class="num">${gbp(r.assumesLoan)}</td>
    <td class="num">${r.assumesTermYears != null ? `${r.assumesTermYears}yr` : '—'}</td>
  </tr>`).join('');
  return `
<section class="report-section" aria-labelledby="rpt-mtg-h">
  <h2 id="rpt-mtg-h">Indicative mortgage products</h2>
  <div class="table-wrap">
    <table class="report-table">
      <caption><span class="report-table-caption">Indicative figures dated ${fmtDate(d.generatedAt)}. Not live quotes or specific lender recommendations.</span></caption>
      <thead><tr><th>Lender</th><th>Product</th><th>LTV</th><th>Rate</th><th>Fee</th><th>Est. monthly</th><th>Loan assumed</th><th>Term</th></tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>
</section>`;
}

function renderTiming(d) {
  const t = d.timingAndNegotiation;
  if (!t) return '';
  const fields = [];
  if (t.bestWindow) fields.push(`<dt>Best window</dt><dd>${esc(t.bestWindow)}</dd>`);
  if (t.note)       fields.push(`<dt>Note</dt><dd>${esc(t.note)}</dd>`);
  fields.push(t.avgDaysOnMarket != null
    ? `<dt>Avg. days on market</dt><dd class="num">${t.avgDaysOnMarket}</dd>`
    : `<dt>Avg. days on market</dt><dd class="muted">not collected</dd>`);
  fields.push(t.reductionFreqPct != null
    ? `<dt>Reduction frequency</dt><dd class="num">${fmtPct(t.reductionFreqPct)}</dd>`
    : `<dt>Reduction frequency</dt><dd class="muted">not collected</dd>`);
  fields.push(t.offerVsAskingByArea != null
    ? `<dt>Offer vs. asking by area</dt><dd>${esc(String(t.offerVsAskingByArea))}</dd>`
    : `<dt>Offer vs. asking by area</dt><dd class="muted">not collected</dd>`);
  if (!fields.length) return '';
  return `
<section class="report-section" aria-labelledby="rpt-timing-h">
  <h2 id="rpt-timing-h">Timing &amp; negotiation</h2>
  <dl class="report-dl">${fields.join('')}</dl>
</section>`;
}

function renderRiskFlags(d) {
  const flags = d.riskFlags;
  if (!Array.isArray(flags) || flags.length === 0) return '';
  const items = flags.map(f => `<li>${esc(f)}</li>`).join('');
  return `
<section class="report-section" aria-labelledby="rpt-risk-h">
  <h2 id="rpt-risk-h">Risk flags</h2>
  <ul class="report-risk-list">${items}</ul>
</section>`;
}

function renderDataQuality(d) {
  const dq = d.dataQualityNotes;
  if (!dq) return '';

  const contradictions = Array.isArray(dq.bandContradictions) ? dq.bandContradictions : [];
  const lowConf        = Array.isArray(dq.lowConfidenceAreas)  ? dq.lowConfidenceAreas  : [];
  const nullFig        = Array.isArray(dq.nullFigureAreas)     ? dq.nullFigureAreas     : [];

  const contraHtml = contradictions.length ? `
  <div class="dq-section">
    <p class="dq-label">Band contradictions (${contradictions.length})</p>
    <ul class="dq-contra-list">
      ${contradictions.map(c => `<li><strong>${esc(c.area ?? c.areaId ?? '—')}</strong>: ${esc(c.issue ?? '')}${c.gap != null ? ` (gap: ${esc(String(c.gap))})` : ''}</li>`).join('')}
    </ul>
  </div>` : '';

  const expandable = (label, ids) => !ids.length
    ? `<p><span class="muted">${label}: none</span></p>`
    : `<details class="dq-expand">
        <summary>${label}: <strong>${ids.length}</strong> areas</summary>
        <p class="dq-ids">${ids.map(id => esc(String(id))).join(', ')}</p>
      </details>`;

  return `
<section class="report-section report-dq" aria-labelledby="rpt-dq-h">
  <h2 id="rpt-dq-h">Data quality notes</h2>
  ${dq.fieldCoverageWarning ? `<p class="dq-coverage">${esc(dq.fieldCoverageWarning)}</p>` : ''}
  ${contraHtml}
  ${expandable('Low-confidence areas', lowConf)}
  ${expandable('Areas with null figures', nullFig)}
</section>`;
}

function renderReferences(d) {
  const refs = d.references;
  if (!Array.isArray(refs) || refs.length === 0) return '';
  const items = refs.map(r => {
    const isSupabase = String(r.url ?? '').startsWith('supabase://');
    const link = isSupabase
      ? `<span class="ref-url muted">${esc(r.label ?? r.url ?? '—')}</span>`
      : `<a href="${esc(r.url ?? '#')}" target="_blank" rel="noopener noreferrer">${esc(r.label ?? r.url ?? '—')}</a>`;
    return `<li>${link}${r.accessed ? ` <span class="muted">· accessed ${esc(r.accessed)}</span>` : ''}</li>`;
  }).join('');
  return `
<section class="report-section" aria-labelledby="rpt-refs-h">
  <h2 id="rpt-refs-h">References</h2>
  <ul class="report-refs">${items}</ul>
</section>`;
}

function renderAiNotes(d) {
  const ai = d.aiTrainingNotes;
  if (!ai) return '';

  const cs        = ai.compositeScoringFormula ?? {};
  const seeds     = Array.isArray(ai.perVillageSeeds) ? ai.perVillageSeeds : [];
  const hardF     = Array.isArray(ai.hardFilters) ? ai.hardFilters : [];
  const recal     = ai.recalibrationProtocol ?? '';
  const provObj   = ai.fieldProvenance && typeof ai.fieldProvenance === 'object' ? ai.fieldProvenance : null;
  const softW     = ai.softPriceBandWeights ?? null;

  const seedSample = seeds.slice(0, 3).map(s =>
    `<li><code>${esc(String(s.areaId ?? '—'))}</code> → joinKey: <code>${esc(String(s.joinKey ?? '—'))}</code></li>`
  ).join('');

  const provHtml = provObj
    ? `<ul>${Object.entries(provObj).map(([k, v]) => `<li><code>${esc(k)}</code>: ${esc(String(v))}</li>`).join('')}</ul>`
    : '';

  return `
<section class="report-section">
  <details class="report-ai-details">
    <summary><h2 class="report-ai-summary-h">Scoring methodology &amp; AI tuning (advanced)</h2></summary>
    <div class="report-ai-body">
      ${cs.formula ? `<h3>Composite scoring formula</h3><p><code>${esc(cs.formula)}</code></p>` : ''}
      ${cs.weights ? `<pre class="report-pre">${esc(JSON.stringify(cs.weights, null, 2))}</pre>` : ''}
      ${cs.componentDefinitions ? `<pre class="report-pre">${esc(JSON.stringify(cs.componentDefinitions, null, 2))}</pre>` : ''}
      ${hardF.length ? `<h3>Hard filters</h3><ul>${hardF.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      ${softW ? `<h3>Soft price-band weights</h3><pre class="report-pre">${esc(JSON.stringify(softW, null, 2))}</pre>` : ''}
      ${recal ? `<h3>Recalibration protocol</h3><p>${esc(recal)}</p>` : ''}
      ${provHtml ? `<h3>Field provenance</h3>${provHtml}` : ''}
      <h3>Per-village seeds</h3>
      <p>${seeds.length} entries — each seed joins to <code>areas.id</code> via <code>joinKey</code>. Sample (first 3):</p>
      ${seedSample ? `<ul>${seedSample}</ul>` : '<p class="muted">No seeds present.</p>'}
    </div>
  </details>
</section>`;
}

function renderDisclaimer(d) {
  if (!d.disclaimer) return '';
  return `<div class="report-disclaimer" role="note"><p>${esc(d.disclaimer)}</p></div>`;
}

// ── Main render ───────────────────────────────────────────────────────────────
function render(report, el) {
  const d = report.data ?? {};
  el.innerHTML = [
    renderHero(report),
    renderRationale(d),
    renderKeyPoints(d),
    renderFeasibility(d),
    renderVillageRanking(d),
    renderSdlt(d),
    renderMortgage(d),
    renderTiming(d),
    renderRiskFlags(d),
    renderDataQuality(d),
    renderReferences(d),
    renderAiNotes(d),
    renderDisclaimer(d),
  ].join('');

  wireRankInteractions();
}

// ── Village ranking: sort + filter interactions ───────────────────────────────
function wireRankInteractions() {
  const wrap    = document.getElementById('rank-table-wrap');
  const searchEl = document.getElementById('rank-search');
  const feasEl  = document.getElementById('rank-feas');
  if (!wrap) return;

  function applyFilter() {
    const q = (searchEl?.value ?? '').toLowerCase().trim();
    const f = feasEl?.value ?? '';
    _filteredRows = _allRankRows.filter(r => {
      if (q && !String(r.name ?? '').toLowerCase().includes(q) && !String(r.county ?? '').toLowerCase().includes(q)) return false;
      if (f && r.feasibility !== f) return false;
      return true;
    });
    wrap.innerHTML = buildRankTable();
    wireTableHeaderClicks();
  }

  function wireTableHeaderClicks() {
    wrap.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (col === _sortCol) _sortDir *= -1;
        else { _sortCol = col; _sortDir = -1; }
        wrap.innerHTML = buildRankTable();
        wireTableHeaderClicks();
      });
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); th.click(); }
      });
    });
  }

  wireTableHeaderClicks();
  searchEl?.addEventListener('input', applyFilter);
  feasEl?.addEventListener('change', applyFilter);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  const loadingEl = document.getElementById('report-loading');
  const errorEl   = document.getElementById('report-error');
  const errorMsg  = document.getElementById('report-error-msg');
  const emptyEl   = document.getElementById('report-empty');
  const contentEl = document.getElementById('report-content');
  const retryBtn  = document.getElementById('btn-retry');

  async function load() {
    loadingEl.hidden = false;
    errorEl.hidden   = true;
    emptyEl.hidden   = true;
    contentEl.hidden = true;

    try {
      const report = await getReport();
      loadingEl.hidden = true;
      if (!report) { emptyEl.hidden = false; return; }
      render(report, contentEl);
      contentEl.hidden = false;
    } catch (e) {
      loadingEl.hidden = true;
      if (errorMsg) errorMsg.textContent = `Unable to load report: ${e.message ?? 'unknown error'}`;
      errorEl.hidden = false;
    }
  }

  retryBtn?.addEventListener('click', load);
  load();
}

document.addEventListener('DOMContentLoaded', init);
