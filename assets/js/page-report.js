// page-report.js — value-analysis report: fetch live from Supabase and render.
import { getReport } from './storage.js';
import { esc } from './dom.js';
import { gbp, fmtDate, fmtPct, feasBadge, confBadge } from './report/format.js';
import {
  renderHero,
  renderRationale,
  renderKeyPoints,
  renderFeasibility,
  renderSdlt,
  renderMortgage,
  renderTiming,
  renderRiskFlags,
  renderDataQuality,
  renderReferences,
  renderAiNotes,
  renderDisclaimer,
} from './page-report/sections.js';

// Formatters (gbp / fmtDate / fmtPct) now live in ./report/format.js (imported above).

// ── Sort / filter state (village ranking) ─────────────────────────────────────
let _allRankRows    = [];
let _filteredRows   = [];
let _sortCol        = 'composite';
let _sortDir        = -1;   // -1 = descending, 1 = ascending

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
  <p class="muted report-table-hint">Default sort: composite score (highest first). Click any column header to sort.</p>
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
