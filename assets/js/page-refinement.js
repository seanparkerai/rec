// page-refinement.js — the Refinement control panel coordinator.
// Reads engine-derived suggestions + the latest run meta from Supabase (via storage)
// and renders the Section-4 layout: model-confidence meter, suggested-refinements inbox,
// patterns-forming list, and the active / probation / dismissed views.
//
// Stage 5 adds the FIRST user action — the display-hide lever (§4.1/§4.2):
//   • inbox cards (actionable) get a "Hide these from view" button → a confirm <dialog>
//     stating how many live listings it removes → hideSuggestion() (writes an overrides
//     rule + flips status → confirmed_hide) → re-render.
//   • active cards (confirmed_hide) get a one-tap "Restore to feed" undo →
//     unhideSuggestion() → re-render.
// Forming cards stay read-only (the golden rule: the engine proposes, it never hides
// without a strong, actionable suggestion the user confirms).
import {
  getRefinementSuggestions, getRefinementMeta,
  hideSuggestion, unhideSuggestion, countMatchingListings,
} from './storage.js';
import { classifySuggestions, buildConfidenceMeter } from './refinement/view.js';
import { esc, byId as $, on } from './dom.js';

// `variant` controls the per-card action footer: 'inbox' → Hide, 'active' → Restore,
// anything else (forming / dismissed) → read-only.
function cardHTML(c, variant) {
  const note = c.volumeArtefact ? `<p class="ref-note">${esc(c.artefactNote)}</p>` : '';
  const why = c.whyLines.map((l) => `<li>${esc(l)}</li>`).join('');
  const data = `data-dim="${esc(c.dimension)}" data-value="${esc(c.value)}" data-count="${c.nRaw}" data-label="${esc(c.label)}"`;
  let actions = '';
  if (variant === 'inbox') {
    actions = `<footer class="ref-card__actions">
        <button type="button" class="ref-action ref-action--hide" data-action="hide" ${data}>Hide these from view</button>
      </footer>`;
  } else if (variant === 'active') {
    actions = `<footer class="ref-card__actions">
        <span class="ref-action__state">Hidden from your feed</span>
        <button type="button" class="ref-action ref-action--undo" data-action="unhide" ${data}>Restore to feed</button>
      </footer>`;
  }
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
      ${actions}
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

function renderList(id, cards, emptyText, variant) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = cards.length ? cards.map((c) => cardHTML(c, variant)).join('') : emptyHTML(emptyText);
}

function setCount(id, n) {
  const el = $(id);
  if (el) el.textContent = String(n);
}

// ── confirm dialog (display-hide) ────────────────────────────────────────────
// Native <dialog>: showModal() + close(), Escape, and click-outside (CLAUDE.md §11).
let pending = null; // { dimension, value, label } awaiting confirmation

function closeConfirm() {
  const dlg = $('ref-confirm');
  dlg?.close();
  pending = null;
}

async function openConfirm({ dimension, value, label }) {
  const dlg = $('ref-confirm');
  if (!dlg) return;
  pending = { dimension, value, label };
  $('ref-confirm-title').textContent = `Hide ${label}?`;
  const msg = $('ref-confirm-msg');
  msg.textContent = `Counting matching listings…`;
  const confirmBtn = $('ref-confirm-ok');
  if (confirmBtn) confirmBtn.disabled = true;
  dlg.showModal();
  // Look up how many live, feed-visible listings this removes (best-effort).
  const n = await countMatchingListings({ dimension, value });
  // Guard against a second open racing this await.
  if (!pending || pending.value !== value || pending.dimension !== dimension) return;
  const noun = n === 1 ? 'listing' : 'listings';
  msg.textContent = `This removes ${n} matching ${noun} from your feed. You can undo anytime — nothing is deleted.`;
  if (confirmBtn) confirmBtn.disabled = false;
}

function wireDialog(refresh) {
  const dlg = $('ref-confirm');
  if (!dlg) return;
  on($('ref-confirm-cancel'), 'click', closeConfirm);
  on(dlg, 'click', (e) => { if (e.target === dlg) closeConfirm(); });
  on(dlg, 'cancel', () => { pending = null; }); // native Escape
  on($('ref-confirm-ok'), 'click', async () => {
    if (!pending) return;
    const { dimension, value, label } = pending;
    const btn = $('ref-confirm-ok');
    if (btn) { btn.disabled = true; btn.textContent = 'Hiding…'; }
    const ok = await hideSuggestion({ dimension, value, count: 0 });
    if (btn) btn.textContent = 'Hide from view';
    closeConfirm();
    if (ok) await refresh();
    else announce('Could not hide that right now — please try again.');
  });
}

function announce(text) {
  const region = $('ref-live');
  if (region) { region.textContent = ''; region.textContent = text; }
}

// Delegated action handler for the per-card buttons (hide / restore).
function wireActions(refresh) {
  const main = document.querySelector('#main') || document.body;
  on(main, 'click', async (e) => {
    const btn = e.target.closest?.('[data-action]');
    if (!btn) return;
    const dimension = btn.dataset.dim;
    const value = btn.dataset.value;
    const label = btn.dataset.label || value;
    if (btn.dataset.action === 'hide') {
      openConfirm({ dimension, value, label });
    } else if (btn.dataset.action === 'unhide') {
      btn.disabled = true;
      const ok = await unhideSuggestion({ dimension, value });
      if (ok) { announce(`${label} restored to your feed.`); await refresh(); }
      else { btn.disabled = false; announce('Could not restore that right now — please try again.'); }
    }
  });
}

async function refresh() {
  const [rows, meta] = await Promise.all([getRefinementSuggestions(), getRefinementMeta()]);
  renderMeter(meta);

  const groups = classifySuggestions(rows || []);

  renderList('ref-inbox', groups.inbox,
    "Nothing to confirm yet. The engine is watching your feedback and will only suggest a change when the evidence is strong.", 'inbox');
  renderList('ref-forming', groups.forming,
    "No patterns forming yet — keep reacting to listings and they'll appear here.", 'forming');
  renderList('ref-active', groups.active,
    "Nothing hidden. Refinements you apply will appear here, with a one-tap restore.", 'active');
  renderList('ref-probation', groups.probation, "No areas on probation. Paused searches will appear here.", 'probation');
  renderList('ref-dismissed', groups.dismissed, "Nothing dismissed.", 'dismissed');

  setCount('ref-inbox-count', groups.counts.actionable);
  setCount('ref-forming-count', groups.counts.forming);
}

async function init() {
  wireDialog(refresh);
  wireActions(refresh);
  try {
    await refresh();
  } catch (e) {
    console.error('refinement init error', e);
    const inbox = $('ref-inbox');
    if (inbox) inbox.innerHTML = emptyHTML('Could not load refinements right now.');
  }
}

init();
