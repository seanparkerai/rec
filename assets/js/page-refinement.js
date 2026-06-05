// page-refinement.js — the Refinement control panel coordinator (Stage 4, READ-ONLY).
// Reads engine-derived suggestions + the latest run meta from Supabase (via storage)
// and renders the Section-4 layout: model-confidence meter, suggested-refinements inbox,
// patterns-forming list, and the (currently empty) active / probation / dismissed views.
// No actions this stage — the hide / stop-searching / dismiss levers arrive in Stage 5/6.
import { getRefinementSuggestions, getRefinementMeta } from './storage.js';
import { classifySuggestions, buildConfidenceMeter } from './refinement/view.js';
import { esc, byId as $ } from './dom.js';

function cardHTML(c) {
  const note = c.volumeArtefact ? `<p class="ref-note">${esc(c.artefactNote)}</p>` : '';
  const why = c.whyLines.map((l) => `<li>${esc(l)}</li>`).join('');
  return `
    <article class="ref-card ref-card--${esc(c.tier)}">
      <header class="ref-card__head">
        <span class="ref-chip">${esc(c.dimensionLabel)}</span>
        <h3 class="ref-card__title">${esc(c.label)}</h3>
        <span class="ref-tier ref-tier--${esc(c.tier)}">${esc(c.tierLabel)}</span>
      </header>
      <p class="ref-card__reason">${esc(c.reason)}</p>
      ${note}
      <div class="ref-stats">
        <span class="ref-stat"><span class="ref-stat__n">${c.rejectPct}%</span> rejected</span>
        <span class="ref-stat"><span class="ref-stat__n">${esc(c.liftLabel)}</span> vs usual</span>
        <span class="ref-stat"><span class="ref-stat__n">${c.distinct}</span> listings</span>
      </div>
      <details class="ref-why">
        <summary>Why?</summary>
        <ul class="ref-why__list">${why}</ul>
      </details>
    </article>`;
}

function emptyHTML(text) {
  return `<p class="ref-empty">${esc(text)}</p>`;
}

function renderMeter(meta) {
  const el = $('ref-meter');
  if (!el) return;
  const m = buildConfidenceMeter(meta);
  el.classList.toggle('is-ready', m.ready);
  el.innerHTML = `
    <div class="ref-meter__track"><span class="ref-meter__fill" style="width:${m.pct}%"></span></div>
    <p class="ref-meter__label">${esc(m.label)}</p>`;
}

function renderList(id, cards, emptyText) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = cards.length ? cards.map(cardHTML).join('') : emptyHTML(emptyText);
}

function setCount(id, n) {
  const el = $(id);
  if (el) el.textContent = String(n);
}

async function init() {
  try {
    const [rows, meta] = await Promise.all([getRefinementSuggestions(), getRefinementMeta()]);
    renderMeter(meta);

    const groups = classifySuggestions(rows || []);

    renderList('ref-inbox', groups.inbox,
      "Nothing to confirm yet. The engine is watching your feedback and will only suggest a change when the evidence is strong.");
    renderList('ref-forming', groups.forming,
      "No patterns forming yet — keep reacting to listings and they'll appear here.");
    renderList('ref-active', groups.active, "Nothing hidden. Applied refinements will appear here.");
    renderList('ref-probation', groups.probation, "No areas on probation. Paused searches will appear here.");
    renderList('ref-dismissed', groups.dismissed, "Nothing dismissed.");

    setCount('ref-inbox-count', groups.counts.actionable);
    setCount('ref-forming-count', groups.counts.forming);
  } catch (e) {
    console.error('refinement init error', e);
    const inbox = $('ref-inbox');
    if (inbox) inbox.innerHTML = emptyHTML('Could not load refinements right now.');
  }
}

init();
