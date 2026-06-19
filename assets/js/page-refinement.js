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
  getRefinementMeta, getScrapeProbation,
  hideSuggestion, unhideSuggestion,
  stopSearchingArea, bringBackArea,
  dismissSuggestion, undismissSuggestion, snoozeSuggestion, unsnoozeSuggestion,
  getRefinementPreset, setRefinementPreset, resetTraining,
  getReactionLog, getLearnedPreferences, getCriteria,
} from './storage.js';
import { renderTrendsGlance } from './refinement/trends-glance.js';
import { loadCombinedSuggestions } from './suggestions/sources.js';
import { suggestionListHTML } from './suggestions/card.js';
import { applySuggestion, snoozeSuggestionUnified, dismissSuggestionUnified } from './suggestions/apply.js';
import { createConfirm } from './suggestions/confirm.js';
import { buildConfidenceMeter, probationStatusLabel, presetNudge, PRESET_OPTIONS } from './refinement/view.js';
import { provenanceSummary } from './listings/reaction-provenance.js';
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
        <button type="button" class="ref-action ref-action--ghost" data-action="snooze" ${data}>Snooze 30 days</button>
        <button type="button" class="ref-action ref-action--ghost" data-action="dismiss" ${data}>Dismiss</button>
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
  } else if (variant === 'dismissed') {
    actions = `<footer class="ref-card__actions">
        <span class="ref-action__state">Dismissed — won't be suggested again</span>
        <button type="button" class="ref-action ref-action--undo" data-action="undismiss" ${data}>Bring back</button>
      </footer>`;
  } else if (variant === 'snoozed') {
    const left = c.snoozeDaysLeft ?? 0;
    actions = `<footer class="ref-card__actions">
        <span class="ref-action__state">Snoozed · ${left} day${left === 1 ? '' : 's'} left</span>
        <button type="button" class="ref-action ref-action--undo" data-action="unsnooze" ${data}>Resume now</button>
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

// Honest engagement summary ("Your reactions"): how many homes were judged one at a time
// vs filtered en masse. The findings below are built ONLY from the genuine, one-at-a-time
// reactions — the bulk area/price sweeps + whole-area removals are excluded so they can't
// make a favourite type look "99% rejected". Numbers are pure (reaction-provenance.js).
function renderReactions(log) {
  const el = $('ref-reactions');
  if (!el) return;
  const s = provenanceSummary(log || []);
  const i = s.individual;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  el.innerHTML = `
    <p class="ref-reactions__lead">
      <strong class="ref-reactions__headline">${i.total}</strong>
      <span class="ref-reactions__cap">homes you've reviewed one at a time</span>
    </p>
    <ul class="ref-reactions__split">
      <li><span class="ref-reactions__n">${i.likes}</span> liked</li>
      <li><span class="ref-reactions__n">${i.rejects}</span> rejected individually</li>
      <li><span class="ref-reactions__n">${i.passes}</span> skipped</li>
    </ul>
    <p class="ref-reactions__note">
      Your findings below are based on these <strong>${s.genuineGraded}</strong> genuine judgements.
      ${plural(s.bulk, 'bulk filter action')} and ${plural(s.admin, 'whole-area removal')}
      are set aside — they tidied your feed but don't shape what the engine thinks you like.
    </p>`;
}

function renderMeter(meta) {
  const el = $('ref-meter');
  if (!el) return;
  const m = buildConfidenceMeter(meta);
  el.classList.toggle('is-ready', m.ready);
  el.innerHTML = `
    <div class="ref-meter__track"><span class="ref-meter__fill"></span></div>
    <p class="ref-meter__label">${esc(m.label)}</p>`;
  el.querySelector('.ref-meter__fill')?.style.setProperty('--ref-pct', `${m.pct}%`);
}

// Sensitivity nudge (§4.6): shown only when the gate is open and strong patterns are
// forming but nothing is actionable because the user is on the strict Cautious preset.
// The CTA flips the preset to the recommended one via the existing setRefinementPreset().
function renderNudge(meta, groups, preset) {
  const el = $('ref-nudge');
  if (!el) return;
  const n = presetNudge(meta, groups, preset);
  if (!n) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `
    <p class="ref-nudge__text">${esc(n.label)}</p>
    <button type="button" class="ref-action ref-action--hide" data-action="apply-preset" data-preset="${esc(n.recommend)}">${esc(n.cta)}</button>`;
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

// ── confirm dialog (shared with the Listings page — suggestions/confirm.js) ───
// Native <dialog> #ref-confirm: the "removes N listings" modal for the higher-stakes
// Apply actions (Stop searching an area / Hide a property type). The OK button runs an
// injected onConfirm(), so this page supplies the writer + refresh.
const confirm = createConfirm({ reprobeRuns: cfg.PROBATION_REPROBE_RUNS });
// The shared inbox's NormalizedSuggestions, by id — looked up on a card-action click.
let suggestionsById = new Map();

function announce(text) {
  const region = $('ref-live');
  if (region) { region.textContent = ''; region.textContent = text; }
}

// The shared inbox card's Apply / Snooze / Dismiss (cards carry data-sug-id). Apply on a
// stop-area or hide-type routes through the confirm modal; everything else is one-tap.
async function handleInboxAction(btn, refresh) {
  const n = suggestionsById.get(btn.dataset.sugId);
  if (!n) return;
  const action = btn.dataset.action;
  if (action === 'apply') {
    const run = async () => {
      const ok = await applySuggestion(n);
      if (ok) { announce(`Applied: ${n.label}.`); await refresh(); }
      else announce('Could not apply that right now — please try again.');
      return ok;
    };
    if (n.confirm) confirm.open({ action: n.confirmAction, dimension: n.dimension, value: n.value || n.areaId, label: n.label, onConfirm: run });
    else { btn.disabled = true; await run(); }
    return;
  }
  btn.disabled = true;
  const ok = action === 'snooze' ? await snoozeSuggestionUnified(n) : await dismissSuggestionUnified(n);
  if (ok) { announce(action === 'snooze' ? `Snoozed ${n.label} for 30 days.` : `Dismissed ${n.label}.`); await refresh(); }
  else { btn.disabled = false; announce('Could not do that right now — please try again.'); }
}

// Delegated action handler for the per-card buttons (hide / stop / restore / bring-back).
function wireActions(refresh) {
  const main = document.querySelector('#main') || document.body;
  on(main, 'click', async (e) => {
    const btn = e.target.closest?.('[data-action]');
    if (!btn) return;
    // Shared inbox cards (combined live + engine) carry data-sug-id → unified router.
    if (btn.dataset.sugId) { await handleInboxAction(btn, refresh); return; }
    // Sensitivity nudge CTA — flip the preset to the recommended one (same writer the
    // training control uses; applies on the next engine evaluation).
    if (btn.dataset.action === 'apply-preset') {
      btn.disabled = true;
      const preset = btn.dataset.preset || 'balanced';
      const ok = await setRefinementPreset(preset);
      announce(ok
        ? `Sensitivity set to ${preset}. Your forming patterns will surface as suggestions on the next evaluation.`
        : 'Could not save that setting — please try again.');
      if (ok) await refresh(); else btn.disabled = false;
      return;
    }
    const action = btn.dataset.action;
    const dimension = btn.dataset.dim;
    const value = btn.dataset.value;
    const label = btn.dataset.label || value;
    if (action === 'hide' || action === 'stop') {
      confirm.open({ action, dimension, value, label, onConfirm: async () => {
        const ok = action === 'stop'
          ? await stopSearchingArea({ value, reprobeEveryRuns: cfg.PROBATION_REPROBE_RUNS })
          : await hideSuggestion({ dimension, value, count: 0 });
        if (ok) { announce(action === 'stop' ? `Stopped searching ${label}.` : `${label} hidden from your feed.`); await refresh(); }
        else announce('Could not apply that right now — please try again.');
      } });
      return;
    }
    // One-tap, reversible actions (two-way doors — no confirm needed).
    btn.disabled = true;
    const ONE_TAP = {
      unhide: { fn: () => unhideSuggestion({ dimension, value }), msg: `${label} restored to your feed.` },
      bringback: { fn: () => bringBackArea({ value }), msg: `${label} back in your search.` },
      snooze: { fn: () => snoozeSuggestion({ dimension, value, days: 30 }), msg: `Snoozed ${label} for 30 days.` },
      dismiss: { fn: () => dismissSuggestion({ dimension, value }), msg: `Dismissed ${label}.` },
      undismiss: { fn: () => undismissSuggestion({ dimension, value }), msg: `${label} back in your suggestions.` },
      unsnooze: { fn: () => unsnoozeSuggestion({ dimension, value }), msg: `${label} resumed.` },
    };
    const h = ONE_TAP[action];
    const ok = h ? await h.fn() : false;
    if (ok) { announce(h.msg); await refresh(); }
    else { btn.disabled = false; announce('Could not do that right now — please try again.'); }
  });
}

// ── Stage 7: training controls (preset + reset) ──────────────────────────────
function renderPresets(current) {
  const el = $('ref-presets');
  if (!el) return;
  el.innerHTML = PRESET_OPTIONS.map((p) => `
    <button type="button" class="ref-preset" data-preset="${esc(p.id)}" aria-pressed="${p.id === current}">
      <span class="ref-preset__label">${esc(p.label)}</span>
      <span class="ref-preset__blurb">${esc(p.blurb)}</span>
    </button>`).join('');
}

function wireTraining() {
  // Preset selection — persisted; applies on the next engine evaluation.
  on($('ref-presets'), 'click', async (e) => {
    const btn = e.target.closest?.('[data-preset]');
    if (!btn || btn.getAttribute('aria-pressed') === 'true') return;
    const preset = btn.dataset.preset;
    renderPresets(preset); // optimistic
    const ok = await setRefinementPreset(preset);
    announce(ok
      ? `Sensitivity set to ${preset}. This applies the next time the engine evaluates your feedback.`
      : 'Could not save that setting — please try again.');
    if (!ok) renderPresets(await getRefinementPreset());
  });

  // Reset training — strong confirm, scoped.
  const dlg = $('ref-reset-dialog');
  on($('ref-reset-btn'), 'click', () => dlg?.showModal());
  on($('ref-reset-cancel'), 'click', () => dlg?.close());
  on(dlg, 'click', (e) => { if (e.target === dlg) dlg.close(); });
  on($('ref-reset-ok'), 'click', async () => {
    const picked = dlg?.querySelector('input[name="ref-reset-scope"]:checked')?.value || 'all';
    const args = picked === 'all' ? { scope: 'all' } : { scope: 'dimension', dimension: picked };
    const btn = $('ref-reset-ok');
    if (btn) { btn.disabled = true; btn.textContent = 'Resetting…'; }
    const ok = await resetTraining(args);
    if (btn) { btn.disabled = false; btn.textContent = 'Reset'; }
    dlg?.close();
    announce(ok ? 'Training reset. The engine will rebuild suggestions on its next run.' : 'Could not reset right now — please try again.');
    if (ok) await refresh();
  });
}

async function refresh() {
  const [{ combined, groups }, meta, probation, preset, reactionLog, prefs, criteria] = await Promise.all([
    loadCombinedSuggestions({ now: new Date() }),
    getRefinementMeta(), getScrapeProbation(), getRefinementPreset(), getReactionLog(),
    getLearnedPreferences(), getCriteria(),
  ]);
  // The top "Trends at a glance" band — never let a glance failure blank the page.
  try { renderTrendsGlance({ reactionLog, prefs, criteria }); }
  catch (e) { console.error('trends glance render error', e); }
  renderReactions(reactionLog);
  renderMeter(meta);
  renderPresets(preset);
  renderNudge(meta, groups, preset);

  // The inbox is the SHARED, combined set (engine actionable + live conflicts) — the
  // same cards the Listings page shows. The other buckets stay engine-only.
  suggestionsById = new Map(combined.map((n) => [n.id, n]));
  const inboxEl = $('ref-inbox');
  if (inboxEl) {
    inboxEl.innerHTML = combined.length
      ? suggestionListHTML(combined)
      : emptyHTML("Nothing to confirm yet. The engine is watching your feedback and will only suggest a change when the evidence is strong.");
  }

  const probByKey = new Map((probation || []).map((p) => [`${p.dimension}:${String(p.value).trim().toLowerCase()}`, p]));
  renderList('ref-forming', groups.forming,
    "No patterns forming yet — keep reacting to listings and they'll appear here.", 'forming');
  renderList('ref-active', groups.active,
    "Nothing hidden. Refinements you apply will appear here, with a one-tap restore.", 'active');
  renderList('ref-probation', groups.probation,
    "No areas paused. Areas you stop searching will appear here, with a one-tap bring-back.", 'probation',
    (c) => ({ reprobeLabel: probationStatusLabel(probByKey.get(`${c.dimension}:${c.value}`) || {}, cfg) }));
  renderList('ref-snoozed', groups.snoozed, "Nothing snoozed.", 'snoozed');
  renderList('ref-dismissed', groups.dismissed, "Nothing dismissed.", 'dismissed');

  setCount('ref-inbox-count', combined.length);
  setCount('ref-forming-count', groups.counts.forming);
}

async function init() {
  confirm.wire();
  wireActions(refresh);
  wireTraining();
  try {
    await refresh();
  } catch (e) {
    console.error('refinement init error', e);
    const inbox = $('ref-inbox');
    if (inbox) inbox.innerHTML = emptyHTML('Could not load refinements right now.');
  }
}

init();
