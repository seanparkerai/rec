// page-profile.js — anchor: Stripe-docs editorial article.
// Read view = article sections with field lists + chip grids.
// Edit = native <dialog> with all fields, save persists via storage.js.
import { getProfile, saveProfile, getCriteria, _internal } from './storage.js';
import { getDerivedFinances } from './finance-load.js';
import { mountSavingsEditor } from './savings-editor.js';
import { normalizeProfile, canonicalProfile, employmentDisplay, creditDisplay, householdDisplay } from './profile-schema.js';
import { esc, byId } from './dom.js';

const gbp = (n) => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
}).format(n || 0);
const ROOT = document.querySelector('[data-page="profile"]') || document;
const $ = (id) => byId(id, ROOT);
const $$ = (sel) => ROOT.querySelectorAll(sel);

let current = null;
const dlg = () => $('edit-dialog');

const TEXT_FIELDS = [
  { key: 'headline',          label: 'Headline (one-line summary)',  type: 'textarea' },
  { key: 'buyers',            label: 'Who is buying',                type: 'text' },
  { key: 'householdSummary',  label: 'Household',                    type: 'text' },
  { key: 'employmentSummary', label: 'Employment',                   type: 'text' },
  { key: 'creditSummary',     label: 'Credit profile',               type: 'text' },
  { key: 'lifestyle',         label: 'Lifestyle',                    type: 'textarea' },
  { key: 'locationFocus',     label: 'Location focus',               type: 'text' },
  { key: 'movingTimeline',    label: 'Moving timeline / window',     type: 'text' },
  { key: 'notes',             label: 'Notes',                        type: 'textarea' },
];
const ARRAY_FIELDS = [
  { key: 'priorities',   label: 'Priorities' },
  { key: 'dealBreakers', label: 'Deal-breakers' },
];

// ---- view rendering -------------------------------------------------
// `finances` here is ALWAYS the enriched object from getDerivedFinances, so
// savings.totalSavings is the canonical cash + earmarked-ISA figure (never the raw,
// underived shape that read £0). A missing figure renders "—", never a misleading £0.
function renderTiles(criteria, finances) {
  const max = criteria?.budget?.max || 0;
  const dep = criteria?.budget?.targetDeposit || 0;
  const saved = finances?.savings?.totalSavings;
  const tb = $('tile-budget'); if (tb) tb.textContent = max ? gbp(max) : '—';
  const td = $('tile-deposit'); if (td) td.textContent = dep ? gbp(dep) : '—';
  const ts = $('tile-saved'); if (ts) ts.textContent = Number.isFinite(saved) ? gbp(saved) : '—';
  const tw = $('tile-window'); if (tw) tw.textContent = current?.movingTimeline || '—';
}

function renderFieldList(container, rows) {
  container.innerHTML = rows.map(([label, value]) => `
    <div class="field-view">
      <dt>${esc(label)}</dt>
      <dd>${value ? esc(value) : '<span class="muted">—</span>'}</dd>
    </div>
  `).join('');
}

function renderChips(container, arr, opts = {}) {
  if (!arr || !arr.length) {
    container.innerHTML = '<li class="chip chip--empty">None added.</li>';
    return;
  }
  const cls = opts.warn ? 'chip is-warn' : 'chip';
  container.innerHTML = arr.map((x) => `<li class="${cls}">${esc(x)}</li>`).join('');
}

function renderAll() {
  const lead = $('headline-lead');
  if (lead) lead.textContent = current.headline || 'Who you are, how you want to live, what you\'re looking for.';
  renderFieldList($('dl-buyer'), [
    ['Buyers', current.buyers],
    ['Household', householdDisplay(current)],
    ['Employment', employmentDisplay(current)],
    ['Credit profile', creditDisplay(current)],
  ]);
  renderFieldList($('dl-lifestyle'), [
    ['Lifestyle', current.lifestyle],
    ['Location focus', current.locationFocus],
    ['Moving timeline', current.movingTimeline],
  ]);
  renderChips($('chips-priorities'), current.priorities, { accent: true });
  renderChips($('chips-dealbreakers'), current.dealBreakers, { warn: true });
  $('p-notes').textContent = current.notes || '—';
  refreshOverlayBadge();
}

function refreshOverlayBadge() {
  const has = !!_internal.readLocal('profile');
  const badge = $('p-overlay-badge');
  if (badge) badge.hidden = !has;
}

// ---- edit dialog ----------------------------------------------------
function buildDialogFields() {
  const html = [];
  for (const f of TEXT_FIELDS) {
    const id = `f-${f.key}`;
    const value = esc(current[f.key] ?? '');
    const input = f.type === 'textarea'
      ? `<textarea id="${id}" name="${f.key}" rows="3">${value}</textarea>`
      : `<input type="text" id="${id}" name="${f.key}" value="${value}" />`;
    html.push(`<label for="${id}" class="edit-field-label">${esc(f.label)}</label>${input}`);
  }
  for (const f of ARRAY_FIELDS) {
    const items = (current[f.key] || []).map((x, i) => `
      <li class="edit-row">
        <span>${esc(x)}</span>
        <button type="button" class="outline secondary chip-x" data-remove="${f.key}" data-index="${i}" aria-label="Remove">×</button>
      </li>
    `).join('');
    html.push(`
      <label class="edit-field-label">${esc(f.label)}</label>
      <ul class="edit-list" id="list-${f.key}">${items}</ul>
      <div class="row add-row">
        <input type="text" id="add-${f.key}" placeholder="Add…" />
        <button type="button" data-add="${f.key}">Add</button>
      </div>
    `);
  }
  $('edit-fields').innerHTML = html.join('');
  attachArrayHandlers();
}

function attachArrayHandlers() {
  $$('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.remove;
      current[f].splice(Number(btn.dataset.index), 1);
      buildDialogFields();
    });
  });
  $$('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.add;
      const input = $(`add-${f}`);
      const v = input.value.trim();
      if (!v) return;
      current[f] = current[f] || [];
      current[f].push(v);
      buildDialogFields();
    });
  });
  $$('input[id^="add-"]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        ROOT.querySelector(`[data-add="${input.id.replace(/^add-/, '')}"]`)?.click();
      }
    });
  });
}

function collectDialog() {
  const next = { ...current };
  for (const f of TEXT_FIELDS) {
    const el = $(`f-${f.key}`);
    if (el) next[f.key] = el.value.trim();
  }
  // Array fields already mutated in `current` by add/remove handlers.
  next.priorities = current.priorities ? [...current.priorities] : [];
  next.dealBreakers = current.dealBreakers ? [...current.dealBreakers] : [];
  return next;
}

function openEdit() {
  buildDialogFields();
  dlg().showModal();
}
function closeEdit() {
  dlg().close();
}

async function saveEdit() {
  current = canonicalProfile(collectDialog());
  saveProfile(current);
  closeEdit();
  renderAll();
  const fin = await getDerivedFinances();
  const crit = await getCriteria();
  renderTiles(crit, fin);
  setStatus('Saved locally.', 'ok');
}

async function resetToDefaults() {
  if (!confirm('Discard local profile edits and reload from your saved data? This cannot be undone.')) return;
  localStorage.removeItem('rec:profile');
  current = normalizeProfile(await getProfile());
  closeEdit();
  renderAll();
  const fin = await getDerivedFinances();
  const crit = await getCriteria();
  renderTiles(crit, fin);
  setStatus('Reset to repo defaults.', 'ok');
}

function setStatus(msg, kind = '') {
  const el = $('p-status');
  if (!el) return;
  el.textContent = msg;
  el.dataset.kind = kind;
}

// ---- init -----------------------------------------------------------
async function init() {
  if (!$('p-btn-edit')) return;
  try {
    current = normalizeProfile(await getProfile());
    const fin = await getDerivedFinances();
    const crit = await getCriteria();
    renderTiles(crit, fin);
    renderAll();
  } catch (e) {
    console.error('profile init error', e);
    setStatus('Failed to load profile data.', 'err');
    return;
  }
  $('p-btn-edit')?.addEventListener('click', openEdit);
  $('dlg-close')?.addEventListener('click', closeEdit);
  $('p-btn-save')?.addEventListener('click', saveEdit);
  $('p-btn-reset')?.addEventListener('click', resetToDefaults);

  // Shared savings editor — updates the "Saved to date" tile (and the deposit
  // total shown elsewhere) on save.
  mountSavingsEditor({
    openerId: 'p-btn-edit-savings',
    onSaved: async () => {
      const fin = await getDerivedFinances();
      const crit = await getCriteria();
      renderTiles(crit, fin);
      setStatus('Savings updated.', 'ok');
    },
  });
}

init();
