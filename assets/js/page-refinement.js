// page-refinement.js — the Refinement control panel coordinator.
// Reads engine-derived suggestions + the latest run meta + scrape-probation rows from
// Supabase (via storage) and renders the Section-4 layout: model-confidence meter,
// suggested-refinements inbox, patterns-forming list, and the active / probation /
// dismissed views.
//
// User actions (golden rule: the engine proposes, the user confirms; everything undoes):
//   • Stage 5 — display-hide lever. Inbox cards get "Hide these from view" → a confirm
//     <dialog> stating listings affected → hideSuggestion() (overrides rule + status
//     confirmed_hide). Active cards get a one-tap "Restore to feed" undo.
//   • Stage 6 — scrape lever (portal side). Area inbox cards also get "Stop searching
//     this area" → a stronger confirm modal → stopSearchingArea() (scrape_probation row
//     + status confirmed_scrape). On-probation cards get a one-tap "Bring back". The
//     scraper-side enforcement (subtract probation + re-probe) is a separate change.
// Forming cards stay read-only.
import {
  getRefinementSuggestions, getRefinementMeta, getScrapeProbation,
  hideSuggestion, unhideSuggestion, countMatchingListings,
  stopSearchingArea, bringBackArea,
} from './storage.js';
import { classifySuggestions, buildConfidenceMeter, probationStatusLabel } from './refinement/view.js';
import { resolveConfig } from './refinement/config.js';
import { esc, byId as $, on } from './dom.js';

const cfg = resolveConfig();

// `variant` controls the per-card action footer: 'inbox' → Hide (+ Stop for areas),
// 'active' → Restore, 'probation' → re-probe status + Bring back, else read-only.
// `extra` carries per-card context (e.g. the probation re-probe label).
function cardHTML(c, variant, extra = {}) {
  const note = c.volumeArtefact ? `<p class="ref-note">${esc(c.artefactNote)}</p>` : '';
  const why = c.whyLines.map((l) => `<li>${esc(l)}</li>`).join('');
  const data = `data-dim="${esc(c.dimension)}" data-value="${esc(c.value)}" data-count="${c.nRaw}" data-label="${esc(c.label)}"`;
  let actions = '';
  if (variant === 'inbox') {
    // "Stop searching" is area-only — the scraper searches by area/outcode.
    const stop = c.dimension === 'area'
      ? `<button type="button" class="ref-action ref-action--stop" data-action="stop" ${data}>Stop searching this area</button>` : '';
    actions = `<footer class="ref-card__actions">
        <button type="button" class="ref-action ref-action--hide" data-action="hide" ${data}>Hide these from view</button>
        ${stop}
      </footer>`;
  } else if (variant === 'active') {
    actions = `<footer class="ref-card__actions">
        <span class="ref-action__state">Hidden from your feed</span>
        <button type="button" class="ref-action ref-action--undo" data-action="unhide" ${data}>Restore to feed</button>
      </footer>`;
  } else if (variant === 'probation') {
    const rp = extra.reprobeLabel ? `<p class="ref-action__reprobe">${esc(extra.reprobeLabel)}</p>` : '';
    actions = `${rp}<footer class="ref-card__actions">
        <span class="ref-action__state">Paused — new listings not being searched</span>
        <button type="button" class="ref-action ref-action--undo" data-action="bringback" ${data}>Bring back</button>
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

function renderList(id, cards, emptyText, variant, extraFor = () => ({})) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = cards.length ? cards.map((c) => cardHTML(c, variant, extraFor(c))).join('') : emptyHTML(emptyText);
}

function setCount(id, n) {
  const el = $(id);
  if (el) el.textContent = String(n);
}

// ── confirm dialog (hide + stop-searching) ───────────────────────────────────
// Native <dialog>: showModal() + close(), Escape, and click-outside (CLAUDE.md §11).
// `pending.action` ('hide' | 'stop') routes the confirm button to the right writer.
let pending = null;

const COPY = {
  hide: {
    title: (label) => `Hide ${label}?`,
    confirm: 'Hide from view',
    busy: 'Hiding…',
    message: (label, n) => {
      const noun = n === 1 ? 'listing' : 'listings';
      return `This removes ${n} matching ${noun} from your feed. You can undo anytime — nothing is deleted.`;
    },
  },
  stop: {
    title: (label) => `Stop searching ${label}?`,
    confirm: 'Stop searching',
    busy: 'Pausing…',
    message: (label, n) => {
      const noun = n === 1 ? 'listing' : 'listings';
      return `You'll stop receiving new listings in ${label} (${n} ${noun} currently shown). We'll quietly re-check it every ${cfg.PROBATION_REPROBE_RUNS} scraper runs in case it's worth bringing back. You can undo anytime.`;
    },
  },
};

function closeConfirm() {
  $('ref-confirm')?.close();
  pending = null;
}

async function openConfirm({ action, dimension, value, label }) {
  const dlg = $('ref-confirm');
  const copy = COPY[action];
  if (!dlg || !copy) return;
  pending = { action, dimension, value, label };
  $('ref-confirm-title').textContent = copy.title(label);
  const msg = $('ref-confirm-msg');
  msg.textContent = 'Counting matching listings…';
  const okBtn = $('ref-confirm-ok');
  if (okBtn) { okBtn.disabled = true; okBtn.textContent = copy.confirm; }
  dlg.classList.toggle('ref-dialog--danger', action === 'stop');
  dlg.showModal();
  // For "stop" the relevant count is the area's current listings; for "hide" it's the
  // matching property-type/area listings — both via countMatchingListings.
  const n = await countMatchingListings({ dimension, value });
  if (!pending || pending.value !== value || pending.dimension !== dimension || pending.action !== action) return;
  msg.textContent = copy.message(label, n);
  if (okBtn) okBtn.disabled = false;
}

function wireDialog(refresh) {
  const dlg = $('ref-confirm');
  if (!dlg) return;
  on($('ref-confirm-cancel'), 'click', closeConfirm);
  on(dlg, 'click', (e) => { if (e.target === dlg) closeConfirm(); });
  on(dlg, 'cancel', () => { pending = null; }); // native Escape
  on($('ref-confirm-ok'), 'click', async () => {
    if (!pending) return;
    const { action, dimension, value, label } = pending;
    const btn = $('ref-confirm-ok');
    if (btn) { btn.disabled = true; btn.textContent = COPY[action].busy; }
    const ok = action === 'stop'
      ? await stopSearchingArea({ value, reprobeEveryRuns: cfg.PROBATION_REPROBE_RUNS })
      : await hideSuggestion({ dimension, value, count: 0 });
    closeConfirm();
    if (ok) { announce(action === 'stop' ? `Stopped searching ${label}.` : `${label} hidden from your feed.`); await refresh(); }
    else announce('Could not apply that right now — please try again.');
  });
}

function announce(text) {
  const region = $('ref-live');
  if (region) { region.textContent = ''; region.textContent = text; }
}

// Delegated action handler for the per-card buttons (hide / stop / restore / bring-back).
function wireActions(refresh) {
  const main = document.querySelector('#main') || document.body;
  on(main, 'click', async (e) => {
    const btn = e.target.closest?.('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const dimension = btn.dataset.dim;
    const value = btn.dataset.value;
    const label = btn.dataset.label || value;
    if (action === 'hide' || action === 'stop') {
      openConfirm({ action, dimension, value, label });
      return;
    }
    // One-tap, reversible undos (two-way doors — no confirm needed).
    btn.disabled = true;
    const ok = action === 'unhide'
      ? await unhideSuggestion({ dimension, value })
      : action === 'bringback'
        ? await bringBackArea({ value })
        : false;
    if (ok) { announce(action === 'bringback' ? `${label} back in your search.` : `${label} restored to your feed.`); await refresh(); }
    else { btn.disabled = false; announce('Could not undo that right now — please try again.'); }
  });
}

async function refresh() {
  const [rows, meta, probation] = await Promise.all([
    getRefinementSuggestions(), getRefinementMeta(), getScrapeProbation(),
  ]);
  renderMeter(meta);

  const groups = classifySuggestions(rows || []);
  const probByKey = new Map((probation || []).map((p) => [`${p.dimension}:${String(p.value).trim().toLowerCase()}`, p]));

  renderList('ref-inbox', groups.inbox,
    "Nothing to confirm yet. The engine is watching your feedback and will only suggest a change when the evidence is strong.", 'inbox');
  renderList('ref-forming', groups.forming,
    "No patterns forming yet — keep reacting to listings and they'll appear here.", 'forming');
  renderList('ref-active', groups.active,
    "Nothing hidden. Refinements you apply will appear here, with a one-tap restore.", 'active');
  renderList('ref-probation', groups.probation,
    "No areas paused. Areas you stop searching will appear here, with a one-tap bring-back.", 'probation',
    (c) => ({ reprobeLabel: probationStatusLabel(probByKey.get(`${c.dimension}:${c.value}`) || {}, cfg) }));
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
