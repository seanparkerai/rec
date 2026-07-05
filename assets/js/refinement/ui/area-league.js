// refinement/ui/area-league.js — "Where your areas stand" renderer (Pillar C).
// Semantic <table> (Linear-dense) inside an overflow container. DOM cap: worst 15
// evidenced rows on first paint; a search filter + one-shot "Show all N" batch expand
// reach the rest. Row actions reuse the page's existing delegated data-action routes
// (stop → confirm modal → stopSearchingArea; bringback; apply-radius both-levers), so
// this module renders markup only — no storage imports.
import { esc } from '../../dom.js';

const DEFAULT_VISIBLE = 15;

const trendLabel = { worsening: '↑ worsening', improving: '↓ improving', flat: '→ flat' };

function radiusCell(r) {
  if (r.radiusMi == null && r.overrideMi == null) return '—';
  const base = r.overrideMi != null ? r.overrideMi : r.radiusMi;
  const suffix = r.overrideMi != null ? ' (yours)' : '';
  return `${Number(base).toFixed(1)} mi${suffix}`;
}

function actionsCell(r) {
  if (r.paused) {
    return `<button type="button" class="ref-action ref-action--undo" data-action="bringback"
      data-dim="area" data-value="${esc(r.areaId)}" data-label="${esc(r.name)}">Bring back</button>`;
  }
  const stop = `<button type="button" class="ref-action ref-action--stop" data-action="stop"
    data-dim="area" data-value="${esc(r.areaId)}" data-count="0" data-label="${esc(r.name)}">Stop searching</button>`;
  const canTighten = r.recommendedMi != null && r.radiusMi != null && r.recommendedMi < r.radiusMi - 0.4;
  const tighten = canTighten
    ? `<button type="button" class="ref-action ref-action--ghost" data-action="apply-radius"
        data-dim="area_radius" data-value="${esc(r.areaId)}" data-area="${esc(r.areaId)}"
        data-current="${r.radiusMi}" data-recommended="${r.recommendedMi}" data-label="${esc(r.name)}">Tighten to ${Number(r.recommendedMi).toFixed(1)} mi</button>`
    : '';
  return stop + tighten;
}

function rowHTML(r) {
  const keep = `${Math.round(r.keepRate * 100)}%`;
  const reason = r.topReason ? `${esc(r.topReason.label)} (${r.topReason.pct}%)` : '—';
  const trend = r.trend ? trendLabel[r.trend] : '—';
  const zero = r.likes === 0 && r.judged >= 5;
  return `
    <tr class="lg-row${r.paused ? ' lg-row--paused' : ''}${zero ? ' lg-row--zero' : ''}">
      <td class="lg-cell lg-cell--name">
        <span class="lg-name">${esc(r.name)}</span>
        ${r.paused ? '<span class="lg-badge">paused</span>' : ''}
        ${zero && !r.paused ? '<span class="lg-badge lg-badge--zero">no likes yet</span>' : ''}
      </td>
      <td class="lg-cell lg-cell--num">${r.judged}</td>
      <td class="lg-cell lg-cell--num">${keep} <span class="lg-sub">(${r.likes}/${r.judged})</span></td>
      <td class="lg-cell lg-cell--reason">${reason}</td>
      <td class="lg-cell lg-cell--trend">${esc(trend)}</td>
      <td class="lg-cell lg-cell--num">${esc(radiusCell(r))}</td>
      <td class="lg-cell lg-cell--actions">${actionsCell(r)}</td>
    </tr>`;
}

/**
 * Render the league. Internal view state (search query, expanded) lives per call —
 * refresh() re-renders the whole section, which resets to the worst-first summary.
 * @param {HTMLElement|null} el
 * @param {{ rows: Array, headline: string }} args
 */
export function renderAreaLeague(el, { rows = [], headline = '' } = {}) {
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = '<p class="ref-empty">No area evidence yet — judge a few listings and your areas will rank themselves here.</p>';
    return;
  }
  const state = { query: '', showAll: false };

  const visibleRows = () => {
    const q = state.query.trim().toLowerCase();
    let list = rows;
    if (q) list = rows.filter((r) => r.name.toLowerCase().includes(q) || r.areaId.includes(q));
    else if (!state.showAll) list = rows.filter((r) => r.evidence !== 'thin').slice(0, DEFAULT_VISIBLE);
    return list;
  };

  const paint = () => {
    const list = visibleRows();
    const hiddenCount = rows.length - list.length;
    const expand = (!state.query && !state.showAll && hiddenCount > 0)
      ? `<button type="button" class="ref-action ref-action--ghost" data-lg-action="all">Show all ${rows.length} areas</button>` : '';
    el.innerHTML = `
      ${headline ? `<p class="lg-headline">${esc(headline)}</p>` : ''}
      <p class="lg-controls">
        <label class="lg-search"><span class="ref-sr-only">Filter areas</span>
          <input type="search" data-lg-search placeholder="Filter ${rows.length} areas…" value="${esc(state.query)}" />
        </label>
      </p>
      <div class="lg-scroll">
        <table class="lg-table">
          <thead>
            <tr>
              <th scope="col">Area</th><th scope="col">Judged</th><th scope="col">Keep</th>
              <th scope="col">Top reason</th><th scope="col">Trend</th><th scope="col">Radius</th>
              <th scope="col"><span class="ref-sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>${list.map(rowHTML).join('')}</tbody>
        </table>
      </div>
      ${list.length === 0 ? '<p class="ref-empty">No areas match that filter.</p>' : ''}
      <footer class="lg-footer">${expand}</footer>`;

    el.querySelector('[data-lg-action="all"]')?.addEventListener('click', () => {
      state.showAll = true;
      paint();
    });
    const search = el.querySelector('[data-lg-search]');
    search?.addEventListener('input', () => {
      state.query = search.value || '';
      const keep = search.selectionStart;
      paint();
      const next = el.querySelector('[data-lg-search]');
      if (next) { next.focus(); next.setSelectionRange(keep, keep); }
    });
  };

  paint();
}
