// page-criteria.js — render the editable search criteria form with all filters.
import { getCriteria, saveCriteria, _internal } from './storage.js';
import { loadJSON } from './data-loader.js';

const gbp = (n) => new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: 'GBP', maximumFractionDigits: 0,
}).format(n || 0);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const $ = (id) => document.getElementById(id);

let current = null;
let baseline = null;
let editing = false;

function listView(arr) {
  if (!arr?.length) return '<p class="muted mb-0">None.</p>';
  return `<ul class="mini-list">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

function listEdit(arr, fieldId) {
  const items = (arr || []).map((x, i) => `
    <li class="edit-row">
      <span>${esc(x)}</span>
      <button type="button" class="outline secondary chip-x" data-remove="${fieldId}" data-index="${i}" aria-label="Remove">×</button>
    </li>
  `).join('');
  return `
    <ul class="edit-list" id="list-${fieldId}">${items}</ul>
    <div class="row add-row">
      <input type="text" id="add-${fieldId}" placeholder="Add…" />
      <button type="button" data-add="${fieldId}">Add</button>
    </div>
  `;
}

function fieldView(label, value, type = 'text') {
  let display = value;
  if (type === 'currency' && typeof value === 'number') display = gbp(value);
  return `<div class="field-view"><dt>${esc(label)}</dt><dd>${display ? esc(String(display)) : '<span class="muted">—</span>'}</dd></div>`;
}

function fieldEdit(label, name, value, type = 'text') {
  const id = `f-${name}`;
  const input = type === 'textarea'
    ? `<textarea id="${id}" name="${name}" rows="3">${esc(value)}</textarea>`
    : `<input type="${type}" id="${id}" name="${name}" value="${esc(value)}" />`;
  return `<div class="field-edit"><label for="${id}">${esc(label)}</label>${input}</div>`;
}

function renderTiles() {
  $('tile-max-price').textContent = gbp(current?.budget?.max || 0);
  $('tile-min-beds').textContent = current?.size?.minBeds || '—';
  $('tile-must-count').textContent = current?.mustHaves?.length || 0;
  $('tile-nice-count').textContent = current?.niceToHaves?.length || 0;
}

function renderBudget() {
  const el = $('card-budget');
  const b = current.budget || {};
  const items = [
    ['Min price', 'budget.min', b.min, 'currency'],
    ['Max price', 'budget.max', b.max, 'currency'],
    ['Offer target', 'budget.offerTarget', b.offerTarget, 'currency'],
    ['Deposit target', 'budget.targetDeposit', b.targetDeposit, 'currency'],
    ['Offer strategy', 'budget.offerStrategy', b.offerStrategy, 'text'],
  ];
  if (editing) {
    el.innerHTML = `<h2>Budget & offer</h2>${items.map(([l, n, v]) => fieldEdit(l, n, v, 'text')).join('')}`;
  } else {
    el.innerHTML = `<h2>Budget & offer</h2><dl class="field-list">${items.map(([l, , v, t]) => fieldView(l, v, t)).join('')}</dl>`;
  }
}

function renderSize() {
  const el = $('card-size');
  const s = current.size || {};
  const items = [
    ['Min bedrooms', 'size.minBeds', s.minBeds],
    ['Ideal bedrooms', 'size.idealBeds', s.idealBeds],
    ['Min bathrooms', 'size.minBaths', s.minBaths],
    ['Ideal bathrooms', 'size.idealBaths', s.idealBaths],
  ];
  if (editing) {
    el.innerHTML = `<h2>Size</h2>${items.map(([l, n, v]) => fieldEdit(l, n, v, 'number')).join('')}`;
  } else {
    el.innerHTML = `<h2>Size</h2><dl class="field-list">${items.map(([l, , v]) => fieldView(l, v)).join('')}</dl>`;
  }
}

function renderPropertyTypes() {
  const el = $('card-types');
  const pt = current.propertyTypePrefs || {};
  const pref = pt.preferred || [];
  const acc = pt.acceptable || [];
  const excl = pt.excluded || [];
  if (editing) {
    el.innerHTML = `
      <h2>Property types</h2>
      <h3>Preferred</h3>${listEdit(pref, 'preferred')}
      <h3>Acceptable</h3>${listEdit(acc, 'acceptable')}
      <h3>Excluded</h3>${listEdit(excl, 'excluded')}
    `;
  } else {
    el.innerHTML = `
      <h2>Property types</h2>
      <h3>Preferred</h3>${listView(pref)}
      <h3>Acceptable</h3>${listView(acc)}
      <h3>Excluded</h3>${listView(excl)}
    `;
  }
}

function renderTenure() {
  const el = $('card-tenure');
  const t = current.tenure || {};
  const pref = t.preferred || [];
  const excl = t.excluded || [];
  if (editing) {
    el.innerHTML = `
      <h2>Tenure</h2>
      <h3>Preferred</h3>${listEdit(pref, 'tenure-preferred')}
      <h3>Excluded</h3>${listEdit(excl, 'tenure-excluded')}
    `;
  } else {
    el.innerHTML = `
      <h2>Tenure</h2>
      <h3>Preferred</h3>${listView(pref)}
      <h3>Excluded</h3>${listView(excl)}
    `;
  }
}

function renderFeatures() {
  const el = $('card-features');
  const f = current.features || {};
  const must = f.mustHave || [];
  const nice = f.niceToHave || [];
  if (editing) {
    el.innerHTML = `
      <h2>Features</h2>
      <h3>Must-have</h3>${listEdit(must, 'features-must')}
      <h3>Nice-to-have</h3>${listEdit(nice, 'features-nice')}
    `;
  } else {
    el.innerHTML = `
      <h2>Features</h2>
      <h3>Must-have</h3>${listView(must)}
      <h3>Nice-to-have</h3>${listView(nice)}
    `;
  }
}

function renderCondition() {
  const el = $('card-condition');
  const items = [
    ['EPC minimum', 'epcMin', current.epcMin],
    ['Condition', 'condition', current.condition],
  ];
  if (editing) {
    el.innerHTML = `<h2>Condition & EPC</h2>${items.map(([l, n, v]) => fieldEdit(l, n, v, 'text')).join('')}`;
  } else {
    el.innerHTML = `<h2>Condition & EPC</h2><dl class="field-list">${items.map(([l, , v]) => fieldView(l, v)).join('')}</dl>`;
  }
}

function renderFreshness() {
  const el = $('card-freshness');
  const f = current.listingFreshness || {};
  const items = [['Added within (hours)', 'listingFreshness.addedWithinHours', f.addedWithinHours]];
  if (editing) {
    el.innerHTML = `<h2>Listing freshness</h2>${items.map(([l, n, v]) => fieldEdit(l, n, v, 'number')).join('')}`;
  } else {
    el.innerHTML = `<h2>Listing freshness</h2><dl class="field-list">${items.map(([l, , v]) => fieldView(l, v)).join('')}</dl>`;
  }
}

function renderKeywords() {
  const el = $('card-keywords');
  const k = current.keywords || {};
  const inc = k.include || [];
  const exc = k.exclude || [];
  if (editing) {
    el.innerHTML = `
      <h2>Keywords</h2>
      <h3>Include</h3>${listEdit(inc, 'keywords-include')}
      <h3>Exclude</h3>${listEdit(exc, 'keywords-exclude')}
    `;
  } else {
    el.innerHTML = `
      <h2>Keywords</h2>
      <h3>Include</h3>${listView(inc)}
      <h3>Exclude</h3>${listView(exc)}
    `;
  }
}

function renderMortgage() {
  const el = $('card-mortgage');
  const m = current.mortgage || {};
  const items = [
    ['Target max', 'mortgage.targetMax', m.targetMax, 'currency'],
    ['Rate (% assumed)', 'mortgage.ratePctAssumed', m.ratePctAssumed],
    ['Term (years)', 'mortgage.termYears', m.termYears],
    ['LTV range', 'mortgage.ltvRange', m.ltvRange],
    ['Fixed rate pref', 'mortgage.fixedRatePref', m.fixedRatePref],
  ];
  if (editing) {
    el.innerHTML = `<h2>Mortgage</h2>${items.map(([l, n, v]) => fieldEdit(l, n, v, 'text')).join('')}`;
  } else {
    el.innerHTML = `<h2>Mortgage</h2><dl class="field-list">${items.map(([l, , v, t]) => fieldView(l, v, t)).join('')}</dl>`;
  }
}

function renderPriorities() {
  const el = $('card-priorities');
  const must = current.mustHaves || [];
  const nice = current.niceToHaves || [];
  if (editing) {
    el.innerHTML = `
      <h2>Priorities</h2>
      <h3>Must-haves</h3>${listEdit(must, 'mustHaves')}
      <h3>Nice-to-haves</h3>${listEdit(nice, 'niceToHaves')}
    `;
  } else {
    el.innerHTML = `
      <h2>Priorities</h2>
      <h3>Must-haves</h3>${listView(must)}
      <h3>Nice-to-haves</h3>${listView(nice)}
    `;
  }
}

function renderAll() {
  renderBudget();
  renderSize();
  renderPropertyTypes();
  renderTenure();
  renderFeatures();
  renderCondition();
  renderFreshness();
  renderKeywords();
  renderMortgage();
  renderPriorities();
  renderTiles();
  refreshActionButtons();
  refreshOverlayBadge();
  if (editing) attachEditHandlers();
}

function refreshActionButtons() {
  $('btn-edit').hidden = editing;
  $('btn-save').hidden = !editing;
  $('btn-cancel').hidden = !editing;
}

function refreshOverlayBadge() {
  const overlay = _internal.readLocal('criteria');
  const badge = $('overlay-badge');
  const reset = $('btn-reset');
  const has = !!overlay;
  badge.hidden = !has;
  reset.hidden = !has || editing;
}

function attachEditHandlers() {
  document.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.remove;
      const i = Number(btn.dataset.index);
      const [obj, key] = fieldPath(field);
      if (obj && key && obj[key]) {
        obj[key].splice(i, 1);
      }
      renderAll();
    });
  });

  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.add;
      const input = $(`add-${field}`);
      const v = input.value.trim();
      if (!v) return;
      const [obj, key] = fieldPath(field);
      if (obj) {
        obj[key] = obj[key] || [];
        obj[key].push(v);
        input.value = '';
        renderAll();
      }
    });
  });

  document.querySelectorAll('input[id^="add-"]').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const field = input.id.replace(/^add-/, '');
        document.querySelector(`[data-add="${field}"]`)?.click();
      }
    });
  });
}

function fieldPath(field) {
  // Maps field IDs like "keywords-include" to [object, key] paths.
  const map = {
    'preferred': [current.propertyTypePrefs, 'preferred'],
    'acceptable': [current.propertyTypePrefs, 'acceptable'],
    'excluded': [current.propertyTypePrefs, 'excluded'],
    'tenure-preferred': [current.tenure, 'preferred'],
    'tenure-excluded': [current.tenure, 'excluded'],
    'features-must': [current.features, 'mustHave'],
    'features-nice': [current.features, 'niceToHave'],
    'keywords-include': [current.keywords, 'include'],
    'keywords-exclude': [current.keywords, 'exclude'],
    'mustHaves': [current, 'mustHaves'],
    'niceToHaves': [current, 'niceToHaves'],
  };
  return map[field] || [null, null];
}

function collectForm() {
  const next = JSON.parse(JSON.stringify(current));
  // Collect simple fields (budget, size, etc.)
  const flatFields = [
    ['budget.min', 'f-budget.min'],
    ['budget.max', 'f-budget.max'],
    ['budget.offerTarget', 'f-budget.offerTarget'],
    ['budget.targetDeposit', 'f-budget.targetDeposit'],
    ['budget.offerStrategy', 'f-budget.offerStrategy'],
    ['size.minBeds', 'f-size.minBeds'],
    ['size.idealBeds', 'f-size.idealBeds'],
    ['size.minBaths', 'f-size.minBaths'],
    ['size.idealBaths', 'f-size.idealBaths'],
    ['epcMin', 'f-epcMin'],
    ['condition', 'f-condition'],
    ['listingFreshness.addedWithinHours', 'f-listingFreshness.addedWithinHours'],
    ['mortgage.targetMax', 'f-mortgage.targetMax'],
    ['mortgage.ratePctAssumed', 'f-mortgage.ratePctAssumed'],
    ['mortgage.termYears', 'f-mortgage.termYears'],
    ['mortgage.ltvRange', 'f-mortgage.ltvRange'],
    ['mortgage.fixedRatePref', 'f-mortgage.fixedRatePref'],
  ];
  flatFields.forEach(([path, id]) => {
    const el = document.querySelector(`[name="${path}"]`);
    if (el) {
      const val = el.value.trim();
      setNestedValue(next, path, val === '' ? null : (path.includes('Pct') || path.includes('Beds') || path.includes('Baths') || path.includes('Hours') || path.includes('Years') ? Number(val) || null : val));
    }
  });
  // Arrays handled in-place during edit, just copy them.
  return next;
}

function setNestedValue(obj, path, val) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = val;
}

function enterEdit() {
  baseline = JSON.parse(JSON.stringify(current));
  editing = true;
  renderAll();
  setStatus('Editing — Save to persist locally.');
}

function cancelEdit() {
  current = JSON.parse(JSON.stringify(baseline));
  editing = false;
  renderAll();
  setStatus('Edit cancelled.');
}

function saveEdit() {
  const next = collectForm();
  current = next;
  saveCriteria(current);
  editing = false;
  renderAll();
  setStatus('Saved locally.', 'ok');
}

async function resetToDefaults() {
  if (!confirm('Reset criteria to the repo defaults? Your local edits will be cleared.')) return;
  localStorage.removeItem('rec:criteria');
  current = await loadJSON('criteria');
  renderAll();
  setStatus('Reset to repo defaults.', 'ok');
}

function setStatus(msg, kind = '') {
  const el = $('status');
  el.textContent = msg;
  el.dataset.kind = kind;
}

async function init() {
  try {
    current = await getCriteria();
    renderAll();
  } catch (e) {
    console.error('criteria init error', e);
    setStatus('Failed to load criteria data.', 'err');
    return;
  }

  $('btn-edit').addEventListener('click', enterEdit);
  $('btn-cancel').addEventListener('click', cancelEdit);
  $('btn-save').addEventListener('click', saveEdit);
  $('btn-reset').addEventListener('click', resetToDefaults);
}

init();
