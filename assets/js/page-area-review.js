// page-area-review.js — Step5 area location review coordinator
// The shared shell (header/nav includes + auth guard) is bootstrapped by
// components.js, loaded as a separate <script type="module"> in the HTML — this
// module only owns the page body.
import { getAreaReviewData, getAreaConfirmations, saveAreaConfirmations } from './storage.js';

// ── Flags ────────────────────────────────────────────────────────────────────

function computeFlags(area, dupSet) {
  const flags = [];
  if (!area.active) flags.push('inactive');
  if (dupSet.has(area.id)) flags.push('duplicate');
  if (!area.rightmove?.locationIdentifier) flags.push('no-identifier');
  if (area.status === 'directory') flags.push('directory');
  const src = area.coordsSource;
  if (!src || src === 'postcode-outward-approx') flags.push('coarse-coords');
  return flags;
}

function isProblematic(flags) {
  return flags.some((f) => ['inactive', 'duplicate', 'no-identifier'].includes(f));
}

function hasAnyFlag(flags) {
  return flags.length > 0;
}

// ── Rendering ────────────────────────────────────────────────────────────────

const FLAG_META = {
  inactive:       { label: 'inactive',       css: 'inactive' },
  duplicate:      { label: 'duplicate ID',   css: 'duplicate' },
  'no-identifier':{ label: 'no RM search',   css: 'inactive' },
  unconfirmed:    { label: 'unconfirmed',     css: 'unconfirmed' },
  directory:      { label: 'no research',    css: 'directory' },
  'coarse-coords':{ label: 'coarse location',css: 'coarse' },
};

function coordsLabel(src) {
  if (!src) return 'no coords';
  if (src === 'postcode-outward-approx') return 'postcode-approx';
  if (src.startsWith('os-opendata')) return 'OS place-centre';
  return src;
}

function renderRow(area, flags, isConfirmed) {
  const allFlags = [...flags];
  if (!isConfirmed) allFlags.push('unconfirmed');

  const flagChips = allFlags
    .filter((f) => FLAG_META[f])
    .map((f) => `<span class="review-flag review-flag--${FLAG_META[f].css}">${FLAG_META[f].label}</span>`)
    .join('');

  const btnClass = isConfirmed ? 'review-confirm-btn review-confirm-btn--done' : 'review-confirm-btn';
  const btnLabel = isConfirmed ? 'Confirmed' : 'Confirm';

  const problem = isProblematic(flags);

  return `
<div class="review-row${problem ? ' review-row--problem' : ''}" data-id="${area.id}" data-confirmed="${isConfirmed}">
  <div class="review-row-main">
    <span class="review-name"><a href="area-detail.html?id=${encodeURIComponent(area.id)}">${escHtml(area.name)}</a></span>
    <span class="review-postcode">${escHtml(area.id.split('-').pop().toUpperCase())}</span>
    <span class="review-flags">${flagChips}</span>
  </div>
  <div class="review-row-meta">
    <span class="review-status review-status--${area.status}">${area.status}</span>
    <span class="review-coords">${escHtml(coordsLabel(area.coordsSource))}</span>
  </div>
  <button class="${btnClass}" data-area-id="${area.id}"
    aria-label="${isConfirmed ? 'Location confirmed' : 'Confirm location for'} ${escHtml(area.name)}">
    ${btnLabel}
  </button>
</div>`.trim();
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Sort ──────────────────────────────────────────────────────────────────────

const STATUS_ORDER = { directory: 0, stub: 1, drafted: 2, partial: 3, researched: 4 };
const FLAG_SEVERITY = { inactive: 10, duplicate: 9, 'no-identifier': 8, directory: 3, 'coarse-coords': 2 };

function flagSeverity(flags) {
  return Math.max(0, ...flags.map((f) => FLAG_SEVERITY[f] ?? 0));
}

function sortAreas(areas, flagMap, confirmations) {
  return [...areas].sort((a, b) => {
    const fa = flagMap.get(a.id) ?? [];
    const fb = flagMap.get(b.id) ?? [];
    // Problems first
    const sa = flagSeverity(fa);
    const sb = flagSeverity(fb);
    if (sb !== sa) return sb - sa;
    // Unconfirmed before confirmed (within same severity tier)
    const ca = confirmations?.confirmed?.[a.id] ? 1 : 0;
    const cb = confirmations?.confirmed?.[b.id] ? 1 : 0;
    if (ca !== cb) return ca - cb;
    // Then by status (lower status = more work needed = first)
    const oa = STATUS_ORDER[a.status] ?? 0;
    const ob = STATUS_ORDER[b.status] ?? 0;
    if (oa !== ob) return oa - ob;
    // Finally alphabetical
    return a.name.localeCompare(b.name);
  });
}

// ── State ─────────────────────────────────────────────────────────────────────

let _areas = null;
let _flagMap = null;
let _confirmations = null;
let _activeFilter = 'all';

function applyFilter(areas) {
  if (_activeFilter === 'problems') {
    return areas.filter((a) => isProblematic(_flagMap.get(a.id) ?? []));
  }
  if (_activeFilter === 'confirmed') {
    return areas.filter((a) => _confirmations?.confirmed?.[a.id]);
  }
  return areas;
}

function renderList() {
  const listEl = document.getElementById('review-list');
  if (!listEl) return;

  const filtered = applyFilter(_areas);
  const sorted = sortAreas(filtered, _flagMap, _confirmations);

  if (sorted.length === 0) {
    listEl.innerHTML = '<p class="review-empty">No areas match this filter.</p>';
    return;
  }

  // Group: problems first, then rest
  const problems = sorted.filter((a) => isProblematic(_flagMap.get(a.id) ?? []));
  const rest = sorted.filter((a) => !isProblematic(_flagMap.get(a.id) ?? []));

  const parts = [];

  if (problems.length > 0) {
    parts.push(`<div class="review-section-head">Needs attention (${problems.length})</div>`);
    for (const a of problems) {
      const isConf = !!_confirmations?.confirmed?.[a.id];
      parts.push(renderRow(a, _flagMap.get(a.id) ?? [], isConf));
    }
  }

  if (rest.length > 0 && _activeFilter !== 'problems') {
    const label = problems.length > 0 ? `OK (${rest.length})` : `All areas (${rest.length})`;
    parts.push(`<div class="review-section-head">${label}</div>`);
    for (const a of rest) {
      const isConf = !!_confirmations?.confirmed?.[a.id];
      parts.push(renderRow(a, _flagMap.get(a.id) ?? [], isConf));
    }
  }

  listEl.innerHTML = parts.join('');
}

function renderCounts() {
  const el = document.getElementById('review-counts');
  if (!el || !_areas) return;
  const total = _areas.length;
  const confirmed = Object.keys(_confirmations?.confirmed ?? {}).length;
  const problems = _areas.filter((a) => isProblematic(_flagMap.get(a.id) ?? [])).length;
  const inactive = _areas.filter((a) => !a.active).length;
  el.innerHTML = `
    <span class="review-count-item"><span class="review-count-num">${total}</span> areas</span>
    <span class="review-count-item"><span class="review-count-num review-count-num--warn">${problems}</span> problems</span>
    <span class="review-count-item"><span class="review-count-num">${confirmed}</span> confirmed</span>
    ${inactive > 0 ? `<span class="review-count-item"><span class="review-count-num review-count-num--warn">${inactive}</span> inactive</span>` : ''}
  `.trim();
}

// ── Confirm handler ───────────────────────────────────────────────────────────

async function handleConfirm(areaId) {
  const conf = { ..._confirmations } ?? {};
  if (!conf.confirmed) conf.confirmed = {};

  const already = !!conf.confirmed[areaId];
  if (already) {
    delete conf.confirmed[areaId];
  } else {
    conf.confirmed[areaId] = new Date().toISOString();
  }
  _confirmations = conf;

  renderList();
  renderCounts();

  await saveAreaConfirmations(conf);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const listEl = document.getElementById('review-list');
  if (listEl) listEl.innerHTML = '<p class="review-loading">Loading…</p>';

  // Load in parallel
  const [areas, confirmations] = await Promise.all([
    getAreaReviewData(),
    getAreaConfirmations(),
  ]);

  if (!areas) {
    if (listEl) listEl.innerHTML = '<p class="review-error">Could not load area data. Supabase connection required.</p>';
    return;
  }

  _confirmations = confirmations ?? { confirmed: {} };

  // Build duplicate set: all area IDs that share a rightmove locationIdentifier with another area
  const locToAreas = new Map();
  for (const a of areas) {
    const locId = a.rightmove?.locationIdentifier;
    if (locId) {
      if (!locToAreas.has(locId)) locToAreas.set(locId, []);
      locToAreas.get(locId).push(a.id);
    }
  }
  const dupAreaIds = new Set();
  for (const ids of locToAreas.values()) {
    if (ids.length > 1) ids.forEach((id) => dupAreaIds.add(id));
  }

  // Build flag map
  _flagMap = new Map();
  for (const a of areas) {
    _flagMap.set(a.id, computeFlags(a, dupAreaIds));
  }

  _areas = areas;

  renderCounts();
  renderList();

  // Filter buttons
  document.querySelectorAll('.review-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      _activeFilter = btn.dataset.filter;
      document.querySelectorAll('.review-filter').forEach((b) => b.classList.toggle('active', b === btn));
      renderList();
    });
  });

  // Confirm buttons (delegated)
  document.getElementById('review-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.review-confirm-btn');
    if (!btn) return;
    const areaId = btn.dataset.areaId;
    if (!areaId) return;
    btn.disabled = true;
    await handleConfirm(areaId);
  });
});
