// page-areas.js — areas directory: search, filter, sort, shortlist toggle.
import { getAreas, getShortlist, saveShortlist } from './storage.js';
import { url } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const $ = (id) => document.getElementById(id);

let areas = [];
let shortlist = new Set();

const state = {
  search: '',
  county: 'all',
  subRegion: 'all',
  sort: 'name',
  onlyShortlisted: false,
};

function uniq(arr) { return [...new Set(arr.filter(Boolean))].sort(); }

function populateFilters() {
  const counties = uniq(areas.map((a) => a.county));
  $('filter-county').innerHTML = `<option value="all">All counties</option>` +
    counties.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

  updateSubRegions();
}

function updateSubRegions() {
  const filtered = state.county === 'all' ? areas : areas.filter((a) => a.county === state.county);
  const subs = uniq(filtered.map((a) => a.subRegion));
  $('filter-subregion').innerHTML = `<option value="all">All sub-regions</option>` +
    subs.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  state.subRegion = 'all';
}

function applyFilters() {
  const s = state.search.toLowerCase();
  let out = areas.filter((a) => {
    if (state.county !== 'all' && a.county !== state.county) return false;
    if (state.subRegion !== 'all' && a.subRegion !== state.subRegion) return false;
    if (state.onlyShortlisted && !shortlist.has(a.id)) return false;
    if (!s) return true;
    return [a.name, a.village, a.town, a.postcode, a.subRegion].some((f) =>
      String(f || '').toLowerCase().includes(s));
  });

  const sortFns = {
    name: (a, b) => a.name.localeCompare(b.name),
    town: (a, b) => a.town.localeCompare(b.town) || a.name.localeCompare(b.name),
    postcode: (a, b) => a.postcode.localeCompare(b.postcode) || a.name.localeCompare(b.name),
    status: (a, b) => (b.status || '').localeCompare(a.status || '') || a.name.localeCompare(b.name),
  };
  out.sort(sortFns[state.sort] || sortFns.name);
  return out;
}

function renderCards(list) {
  const grid = $('areas-grid');
  if (!list.length) {
    grid.innerHTML = `<li style="padding:var(--space-6) 0;color:var(--ink-muted);text-align:center;">No areas match those filters.</li>`;
    return;
  }
  grid.innerHTML = list.map((a, i) => {
    const starred = shortlist.has(a.id);
    const detailUrl = url('pages/area-detail.html') + `?id=${encodeURIComponent(a.id)}`;
    const statusBadge = a.status && a.status !== 'directory'
      ? `<span class="badge-status">${esc(a.status)}</span>`
      : '';
    return `
      <li class="area-row">
        <span class="area-index">${String(i + 1).padStart(3, '0')}</span>
        <div>
          <p class="area-name"><a href="${detailUrl}">${esc(a.name)}</a>${statusBadge}</p>
          <p class="area-place">
            <span>${esc(a.town)}</span>
            <span class="sep">·</span>
            <span>${esc(a.subRegion || a.county)}</span>
            <span class="sep">·</span>
            <span class="num">${esc(a.postcode)}</span>
          </p>
        </div>
        <span class="area-meta">${esc(a.county || '')}</span>
        <button type="button" class="star-btn ${starred ? 'is-starred' : ''}"
                data-id="${esc(a.id)}"
                aria-pressed="${starred}"
                aria-label="${starred ? 'Remove from shortlist' : 'Add to shortlist'}">
          ${starred ? '★' : '☆'}
        </button>
      </li>
    `;
  }).join('');

  grid.querySelectorAll('.star-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleShortlist(btn.dataset.id));
  });
}

function toggleShortlist(id) {
  if (shortlist.has(id)) shortlist.delete(id); else shortlist.add(id);
  saveShortlist([...shortlist]);
  rerender();
  updateCounts();
}

function updateCounts() {
  $('shortlist-count').textContent = shortlist.size;
}

function rerender() {
  const list = applyFilters();
  $('result-count').textContent = list.length;
  renderCards(list);
}

function attachControls() {
  $('search').addEventListener('input', (e) => { state.search = e.target.value; rerender(); });
  $('filter-county').addEventListener('change', (e) => {
    state.county = e.target.value;
    updateSubRegions();
    rerender();
  });
  $('filter-subregion').addEventListener('change', (e) => { state.subRegion = e.target.value; rerender(); });
  $('sort').addEventListener('change', (e) => { state.sort = e.target.value; rerender(); });
  $('only-shortlisted').addEventListener('change', (e) => { state.onlyShortlisted = e.target.checked; rerender(); });
  $('btn-clear').addEventListener('click', () => {
    state.search = ''; state.county = 'all'; state.subRegion = 'all'; state.sort = 'name'; state.onlyShortlisted = false;
    $('search').value = ''; $('filter-county').value = 'all'; $('sort').value = 'name';
    $('only-shortlisted').checked = false;
    updateSubRegions();
    rerender();
  });
}

async function init() {
  try {
    areas = await getAreas();
    shortlist = new Set(getShortlist());
    $('total-count').textContent = areas.length;
    populateFilters();
    updateCounts();
    attachControls();
    rerender();
  } catch (e) {
    console.error('areas init error', e);
    $('areas-grid').innerHTML = `<p class="muted">Failed to load areas.</p>`;
  }
}

init();
