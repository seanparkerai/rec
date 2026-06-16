// page-areas.js — areas directory: search, filter, sort, shortlist toggle, fit verdict.
import { getHouseholdAreas, setHouseholdAreaStatus, getShortlist, saveShortlist, getFinances, getCriteria, saveCriteria } from './storage.js';
import { url } from './config.js';
import { assessAffordability } from './affordability.js';
import { gbp } from './format.js';
import { esc, byId as $ } from './dom.js';

let areas = [];
let shortlist = new Set();
let finData = null;
let criData = null;
let searchRadiusMi = 3; // household preference; persisted via criteria.location.searchRadiusMi

const state = {
  search: '',
  county: 'all',
  subRegion: 'all',
  sort: 'name',
  fit: 'all',
  onlyShortlisted: false,
  showPaused: false,   // paused (inactive) areas are hidden until the user opts in
};

// ---- URL <-> state sync (shareable filter links) -------------------
const URL_KEYS = { search: 'q', county: 'county', subRegion: 'sub', sort: 'sort', fit: 'fit', onlyShortlisted: 'starred', showPaused: 'paused' };
const URL_DEFAULTS = { search: '', county: 'all', subRegion: 'all', sort: 'name', fit: 'all', onlyShortlisted: false, showPaused: false };
const BOOL_KEYS = new Set(['onlyShortlisted', 'showPaused']);

function readStateFromURL() {
  const p = new URLSearchParams(location.search);
  if (p.has('q')) state.search = p.get('q') || '';
  if (p.has('county')) state.county = p.get('county') || 'all';
  if (p.has('sub')) state.subRegion = p.get('sub') || 'all';
  if (p.has('sort')) state.sort = p.get('sort') || 'name';
  if (p.has('fit')) state.fit = p.get('fit') || 'all';
  if (p.has('starred')) state.onlyShortlisted = p.get('starred') === '1';
  if (p.has('paused')) state.showPaused = p.get('paused') === '1';
}

function writeStateToURL() {
  const p = new URLSearchParams();
  for (const [k, urlKey] of Object.entries(URL_KEYS)) {
    const v = state[k];
    if (v === URL_DEFAULTS[k]) continue;                 // omit defaults
    if (BOOL_KEYS.has(k)) { if (v) p.set(urlKey, '1'); continue; }
    if (v) p.set(urlKey, v);
  }
  const qs = p.toString();
  const url = location.pathname + (qs ? `?${qs}` : '') + location.hash;
  history.replaceState(null, '', url);
}

function uniq(arr) { return [...new Set(arr.filter(Boolean))].sort(); }

function populateFilters() {
  const counties = uniq(areas.map((a) => a.county));
  $('filter-county').innerHTML = `<option value="all">All counties</option>` +
    counties.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

function updateSubRegions({ preserve = false } = {}) {
  const filtered = state.county === 'all' ? areas : areas.filter((a) => a.county === state.county);
  const subs = uniq(filtered.map((a) => a.subRegion));
  $('filter-subregion').innerHTML = `<option value="all">All sub-regions</option>` +
    subs.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  // Reset unless the caller is restoring from URL state and the current
  // sub-region is still valid for the active county.
  if (!preserve || !subs.includes(state.subRegion)) state.subRegion = 'all';
}

// ---- Fit / price helpers (Phase 4b) --------------------------------

const VERDICT_ORDER = { comfortable: 0, stretch: 1, tight: 2, 'out-of-reach': 3, unknown: 4 };

// Pick the most relevant average for an area: match the user's preferred
// property type if a price exists, else fall back through the list.
function matchedPrice(area, criteria) {
  const ps = area?.priceSummary;
  if (!ps) return { price: null, label: null };
  const PROP_TO_KEY = {
    Detached: 'avgDetached',
    Bungalow: 'avgDetached',        // bungalows priced like detacheds in the dataset
    'Semi-detached': 'avgSemi',
    Terraced: 'avgTerraced',
    'Flat / Apartment': 'avgFlat',
  };
  const preferred = criteria?.propertyTypePrefs?.preferred || [];
  for (const t of preferred) {
    const k = PROP_TO_KEY[t];
    if (k && ps[k] != null) return { price: ps[k], label: t };
  }
  // Fall back: cheapest available avg (so verdict tends toward "best case").
  for (const [k, label] of [['avgSemi', 'Semi'], ['avgTerraced', 'Terraced'], ['avgDetached', 'Detached'], ['avgFlat', 'Flat']]) {
    if (ps[k] != null) return { price: ps[k], label };
  }
  return { price: null, label: null };
}

function verdictFor(area) {
  if (!finData || !criData) return 'unknown';
  const { price } = matchedPrice(area, criData);
  if (!price) return 'unknown';
  return assessAffordability({ price, finances: finData, criteria: criData }).verdict;
}

function applyFilters() {
  const s = state.search.toLowerCase();
  let out = areas.filter((a) => {
    if (!state.showPaused && a._status === 'inactive') return false;  // paused areas hidden by default
    if (state.county !== 'all' && a.county !== state.county) return false;
    if (state.subRegion !== 'all' && a.subRegion !== state.subRegion) return false;
    if (state.onlyShortlisted && !shortlist.has(a.id)) return false;
    if (state.fit !== 'all' && verdictFor(a) !== state.fit) return false;
    if (!s) return true;
    return [a.name, a.village, a.town, a.postcode, a.subRegion].some((f) =>
      String(f || '').toLowerCase().includes(s));
  });

  const priceOf = (a) => matchedPrice(a, criData).price ?? Number.POSITIVE_INFINITY;
  const ctOrder = (b) => (b ? b.charCodeAt(0) : 999);

  const sortFns = {
    name: (a, b) => a.name.localeCompare(b.name),
    town: (a, b) => a.town.localeCompare(b.town) || a.name.localeCompare(b.name),
    postcode: (a, b) => a.postcode.localeCompare(b.postcode) || a.name.localeCompare(b.name),
    status: (a, b) => (b.status || '').localeCompare(a.status || '') || a.name.localeCompare(b.name),
    fit: (a, b) => (VERDICT_ORDER[verdictFor(a)] - VERDICT_ORDER[verdictFor(b)]) || a.name.localeCompare(b.name),
    price: (a, b) => priceOf(a) - priceOf(b) || a.name.localeCompare(b.name),
    counciltax: (a, b) => ctOrder(a.councilTaxBand) - ctOrder(b.councilTaxBand) || a.name.localeCompare(b.name),
  };
  out.sort(sortFns[state.sort] || sortFns.name);
  return out;
}

function renderCards(list) {
  const grid = $('areas-grid');
  if (!list.length) {
    grid.innerHTML = `<li class="areas-empty">No areas match those filters.</li>`;
    return;
  }
  grid.innerHTML = list.map((a, i) => {
    const starred = shortlist.has(a.id);
    const paused = a._status === 'inactive';
    const detailUrl = url('pages/area-detail.html') + `?id=${encodeURIComponent(a.id)}`;
    const statusBadge = a.status && a.status !== 'directory'
      ? `<span class="badge-status">${esc(a.status)}</span>`
      : '';
    const pausedBadge = paused ? `<span class="badge-status badge-status--paused">Paused</span>` : '';
    const fit = verdictFor(a);
    const fitDot = `<span class="fit-dot fit-dot--${fit}" title="Affordability fit: ${fit}" aria-label="Affordability fit: ${fit}"></span>`;
    const { price, label } = matchedPrice(a, criData);
    const bedFit = price ? `<span class="bed-fit"><span class="bed-fit-type">${esc(label || '—')}</span> <span class="num">${esc(gbp(price))}</span></span>` : '<span class="bed-fit bed-fit--empty">—</span>';
    const ctBand = a.councilTaxBand ? `<span class="ct-band">${esc(a.councilTaxBand)}</span>` : '<span class="ct-band ct-band--empty">—</span>';
    return `
      <li class="area-row area-row--v2 ${paused ? 'area-row--paused' : ''}">
        <span class="area-index">${String(i + 1).padStart(3, '0')}</span>
        ${fitDot}
        <div class="area-row__main">
          <p class="area-name"><a href="${detailUrl}">${esc(a.name)}</a>${statusBadge}${pausedBadge}</p>
          <p class="area-place">
            <span>${esc(a.town)}</span>
            <span class="sep">·</span>
            <span>${esc(a.subRegion || a.county)}</span>
            <span class="sep">·</span>
            <span class="num">${esc(a.postcode)}</span>
          </p>
        </div>
        ${bedFit}
        ${ctBand}
        <div class="area-row__actions">
          <button type="button" class="area-status-btn ${paused ? 'is-paused' : ''}"
                  data-status-id="${esc(a.id)}"
                  aria-pressed="${paused}"
                  aria-label="${paused ? `Reactivate ${esc(a.name)}` : `Pause ${esc(a.name)}`}">
            ${paused ? 'Resume' : 'Pause'}
          </button>
          <button type="button" class="star-btn ${starred ? 'is-starred' : ''}"
                  data-id="${esc(a.id)}"
                  aria-pressed="${starred}"
                  aria-label="${starred ? 'Remove from shortlist' : 'Add to shortlist'}">
            ${starred ? '★' : '☆'}
          </button>
        </div>
      </li>
    `;
  }).join('');

  grid.querySelectorAll('.star-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleShortlist(btn.dataset.id));
  });
  grid.querySelectorAll('.area-status-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleAreaStatus(btn.dataset.statusId));
  });

  // Named view transition: tag the title of the row being navigated to so
  // it morphs into the area-detail h1 in the next document.
  grid.querySelectorAll('.area-name a').forEach((a) => {
    a.addEventListener('click', () => {
      const el = a.closest('.area-name');
      if (el && 'startViewTransition' in document) el.style.viewTransitionName = 'area-title';
    });
  });
}

function toggleShortlist(id) {
  if (shortlist.has(id)) shortlist.delete(id); else shortlist.add(id);
  saveShortlist([...shortlist]);
  rerender();
  updateCounts();
}

// Pause/resume an area for the household. Optimistic: flip the local _status and
// re-render immediately (a pause drops the row out of the default view), then
// persist; revert on failure (storage surfaces its own error toast).
async function toggleAreaStatus(id) {
  const area = areas.find((a) => a.id === id);
  if (!area) return;
  const prev = area._status === 'inactive' ? 'inactive' : 'active';
  const next = prev === 'inactive' ? 'active' : 'inactive';
  area._status = next;
  rerender();
  updateCounts();
  const ok = await setHouseholdAreaStatus(id, next);
  if (!ok) { area._status = prev; rerender(); updateCounts(); }
}

function updateCounts() {
  $('shortlist-count').textContent = shortlist.size;
  const pausedCount = areas.filter((a) => a._status === 'inactive').length;
  const pausedEl = $('paused-count');
  if (pausedEl) pausedEl.textContent = pausedCount;
}

function rerender() {
  const list = applyFilters();
  $('result-count').textContent = list.length;
  renderCards(list);
  writeStateToURL();
}

function applyStateToControls() {
  if ($('search')) $('search').value = state.search;
  if ($('filter-county')) $('filter-county').value = state.county;
  if ($('filter-subregion')) $('filter-subregion').value = state.subRegion;
  if ($('sort')) $('sort').value = state.sort;
  if ($('filter-fit')) $('filter-fit').value = state.fit;
  if ($('only-shortlisted')) $('only-shortlisted').checked = state.onlyShortlisted;
  if ($('show-paused')) $('show-paused').checked = state.showPaused;
  if ($('search-radius')) $('search-radius').value = String(searchRadiusMi);
}

function attachControls() {
  $('search').addEventListener('input', (e) => {
    state.search = e.target.value;
    // A search should always reveal its matches: auto-expand the collapsed list.
    if (state.search.trim()) {
      const disclosure = document.getElementById('area-disclosure');
      if (disclosure) disclosure.open = true;
    }
    rerender();
  });
  $('filter-county').addEventListener('change', (e) => {
    state.county = e.target.value;
    updateSubRegions();
    rerender();
  });
  $('filter-subregion').addEventListener('change', (e) => { state.subRegion = e.target.value; rerender(); });
  $('sort').addEventListener('change', (e) => { state.sort = e.target.value; rerender(); });
  $('filter-fit')?.addEventListener('change', (e) => { state.fit = e.target.value; rerender(); });
  $('only-shortlisted').addEventListener('change', (e) => { state.onlyShortlisted = e.target.checked; rerender(); });
  $('show-paused')?.addEventListener('change', (e) => { state.showPaused = e.target.checked; rerender(); });
  $('search-radius')?.addEventListener('change', async (e) => {
    searchRadiusMi = Number(e.target.value);
    const next = { ...(criData || {}), location: { ...(criData?.location || {}), searchRadiusMi } };
    criData = next;
    saveCriteria(next);
    window.dispatchEvent(new CustomEvent('search-radius-changed', { detail: { searchRadiusMi } }));
  });
  $('btn-clear').addEventListener('click', () => {
    Object.assign(state, URL_DEFAULTS);
    searchRadiusMi = 3;
    const next = { ...(criData || {}), location: { ...(criData?.location || {}), searchRadiusMi: 3 } };
    criData = next;
    saveCriteria(next);
    window.dispatchEvent(new CustomEvent('search-radius-changed', { detail: { searchRadiusMi: 3 } }));
    updateSubRegions();
    applyStateToControls();
    rerender();
  });
  window.addEventListener('popstate', () => {
    readStateFromURL();
    updateSubRegions();
    applyStateToControls();
    rerender();
  });
}

async function init() {
  try {
    // includeInactive so paused areas remain listed (behind the "Show paused"
    // filter) and can be reactivated; the map + listings still read the default
    // active-only path so a paused area drops off them immediately.
    areas = await getHouseholdAreas({ includeInactive: true });
    shortlist = new Set(await getShortlist());
    try { finData = await getFinances(); } catch (e) { console.error('finances fetch', e); }
    try {
      criData = await getCriteria();
      searchRadiusMi = Number(criData?.location?.searchRadiusMi ?? 3);
    } catch (e) { console.error('criteria fetch', e); }
    $('total-count').textContent = areas.filter((a) => a._status !== 'inactive').length;
    readStateFromURL();
    populateFilters();
    updateSubRegions({ preserve: true });
    applyStateToControls();
    updateCounts();
    attachControls();
    rerender();
  } catch (e) {
    console.error('areas init error', e);
    $('areas-grid').innerHTML = `<p class="muted">Failed to load areas.</p>`;
  }
}

init();
