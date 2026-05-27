// page-journey.js — three interactive checklists (viewing, buying process, moving & packing).
// Checked state is persisted in localStorage separately from the canonical data/checklists.json.
import { loadJSON } from './data-loader.js';
import { _internal } from './storage.js';
import { esc, byId as $ } from './dom.js';

const STATE_KEY = 'journey-checks'; // namespace handled by storage._internal

let state = { viewing: {}, process: {}, moving: {} };
let data = null;

function loadState() {
  const s = _internal.readLocal(STATE_KEY);
  if (s && typeof s === 'object') state = { viewing: {}, process: {}, moving: {}, ...s };
}

function saveState() {
  _internal.writeLocal(STATE_KEY, state);
}

function labelFor(section, item) {
  return section === 'moving' ? (item.task || '') : (item.item || '');
}

function outreachFor(item) {
  if (!item.outreachTemplateId) return '';
  return `<a href="outreach.html?templateId=${item.outreachTemplateId}" data-nav="pages/outreach.html?templateId=${item.outreachTemplateId}" class="journey-outreach-link" aria-label="Open email template for this step">&rarr; Email</a>`;
}

function metaFor(item) {
  const bits = [];
  if (item.timing) bits.push(`<span class="meta-chip meta-timing">${esc(item.timing)}</span>`);
  if (item.importance) bits.push(`<span class="meta-chip">${esc(item.importance)}</span>`);
  if (item.notes) bits.push(`<span class="muted">${esc(item.notes)}</span>`);
  return bits.length ? `<p class="check-meta">${bits.join(' ')}</p>` : '';
}

function renderSection(section) {
  const items = data[section] || [];
  const checks = state[section] || {};
  const html = items.map((item, i) => {
    const id = `${section}-${i}`;
    const checked = !!checks[i];
    const label = labelFor(section, item);
    return `
      <li class="check-row-item${checked ? ' is-done' : ''}">
        <label class="check-row" for="${id}">
          <input type="checkbox" id="${id}" data-section="${section}" data-index="${i}" ${checked ? 'checked' : ''} />
          <span class="check-label">
            <span class="check-title">${esc(label)}</span>
            ${metaFor(item)}
          </span>
          ${outreachFor(item)}
        </label>
      </li>
    `;
  }).join('');
  return html;
}

function progress(section) {
  const total = (data[section] || []).length;
  const done = Object.values(state[section] || {}).filter(Boolean).length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function nextItem(section) {
  const items = data[section] || [];
  const checks = state[section] || {};
  for (let i = 0; i < items.length; i++) {
    if (!checks[i]) return { item: items[i], index: i };
  }
  return null;
}

function renderNextHint(section) {
  const el = $(`next-${section}`);
  if (!el) return;
  const total = (data[section] || []).length;
  if (!total) { el.hidden = true; return; }
  const next = nextItem(section);
  if (!next) {
    el.hidden = false;
    el.classList.add('is-done');
    el.innerHTML = `<span class="next-key">All done</span>Nothing left in this section — well played.`;
    return;
  }
  el.hidden = false;
  el.classList.remove('is-done');
  const label = labelFor(section, next.item);
  const timing = next.item.timing ? ` <span class="muted">· ${esc(next.item.timing)}</span>` : '';
  el.innerHTML = `<span class="next-key">Unlocks next</span>${esc(label)}${timing}`;
}

function renderTopTrack() {
  const trackEl = $('journey-track');
  const overall = $('journey-overall');
  const nextText = $('journey-next-text');
  const nextTick = $('journey-next-tick');
  if (!trackEl) return;

  const sections = [
    { key: 'viewing', label: 'Viewing' },
    { key: 'process', label: 'Buying process' },
    { key: 'moving',  label: 'Moving' },
  ];
  const stats = sections.map((s) => ({ ...s, ...progress(s.key) }));
  const totalDone = stats.reduce((n, s) => n + s.done, 0);
  const totalAll  = stats.reduce((n, s) => n + s.total, 0);
  if (overall) overall.textContent = `${totalDone}/${totalAll} done`;
  const currentIdx = stats.findIndex((s) => s.pct < 100);

  trackEl.innerHTML = stats.map((s, i) => {
    const mod = s.pct >= 100 && s.total > 0 ? '--done'
              : i === currentIdx ? '--current' : '';
    return `
      <li class="journey-track__node ${mod ? 'journey-track__node' + mod : ''}">
        <span class="journey-track__label">${esc(s.label)}</span>
        <span class="journey-track__count">${s.done}/${s.total}</span>
      </li>
    `;
  }).join('');

  // Next action across sections (priority: viewing → process → moving).
  let next = null;
  for (const s of sections) {
    const n = nextItem(s.key);
    if (n) { next = { section: s.key, ...n }; break; }
  }
  if (!next) {
    if (nextText) nextText.textContent = 'All steps ticked off — nice work.';
    if (nextTick) nextTick.disabled = true;
    return;
  }
  if (nextText) nextText.textContent = labelFor(next.section, next.item);
  if (nextTick) {
    nextTick.disabled = false;
    nextTick.onclick = () => {
      state[next.section] = state[next.section] || {};
      state[next.section][next.index] = true;
      saveState();
      renderAll();
    };
  }
}

function renderAll() {
  ['viewing', 'process', 'moving'].forEach((section) => {
    $(`list-${section}`).innerHTML = renderSection(section);
    const p = progress(section);
    $(`progress-${section}`).textContent = `${p.done} / ${p.total} done`;
    $(`bar-${section}`).style.width = `${p.pct}%`;
    renderNextHint(section);
  });

  renderTopTrack();

  document.querySelectorAll('input[type="checkbox"][data-section]').forEach((box) => {
    box.addEventListener('change', (e) => {
      const section = box.dataset.section;
      const i = Number(box.dataset.index);
      state[section] = state[section] || {};
      if (box.checked) state[section][i] = true; else delete state[section][i];
      saveState();
      renderAll();
    });
  });
}

function attachActions() {
  $('btn-reset-all').addEventListener('click', () => {
    if (!confirm('Clear all checked items across viewing, buying process, and moving?')) return;
    state = { viewing: {}, process: {}, moving: {} };
    saveState();
    renderAll();
  });
}

async function init() {
  try {
    data = await loadJSON('checklists');
    loadState();
    renderAll();
    attachActions();
  } catch (e) {
    console.error('journey init error', e);
    $('list-viewing').innerHTML = '<p class="muted">Failed to load checklists.</p>';
  }
}

init();
