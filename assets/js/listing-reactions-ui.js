// listing-reactions-ui.js — the shared multi-select reaction picker used by ALL
// three reaction surfaces (browse rows, review deck, dossier). One builder, not
// three copies. Pure-ish DOM builder: it owns its LOCAL in-progress state and
// calls back; it never touches storage / DB / network (that stays in the
// page-*.js coordinators and storage.js).
//
// Log discipline (the chosen append-only design — see Stage 2 brief):
//   • A VERB tap (like/pass/reject) fires onReact immediately → the coordinator
//     appends a row, exactly as before (instant feedback + snapshot durability).
//     This is the "in-progress" capture.
//   • Reason / sub-reason toggles DO NOT write — they only mutate local state,
//     so intermediate taps never spam the log.
//   • SAVE fires onSave with the consolidated { reaction, reasons } → the
//     coordinator appends one final row carrying the full reasons array. The
//     latest-per-listing reducer naturally makes that row the current reaction,
//     and the coordinator marks the property reviewed (Stage 4).
import { el } from './dom.js';
import {
  REACTIONS, REJECT_REASONS, LIKE_REASONS, subReasonsFor,
} from './listing-reactions.js';

const REACTION_LABELS = { like: 'Like', pass: 'Pass', reject: 'Reject' };

/** The primary-reason vocabulary for a verb ([] for pass — no reasons). */
function reasonsForVerb(verb) {
  if (verb === 'reject') return REJECT_REASONS;
  if (verb === 'like') return LIKE_REASONS;
  return [];
}

/**
 * Build the reaction picker.
 * @param {object} opts
 * @param {'row'|'deck'|'dossier'} [opts.variant]  styling family (class prefixes only)
 * @param {object} [opts.current]   { reaction, reasons } — pre-fills a saved decision
 * @param {(reaction:string)=>void} [opts.onReact]   fired on a verb tap (append-only log)
 * @param {(d:{reaction:string,reasons:Array})=>(void|Promise)} [opts.onSave]  consolidated save
 * @returns {HTMLElement}
 */
export function buildReasonPicker({ variant = 'row', current = null, onReact, onSave } = {}) {
  const deck = variant === 'deck';
  const V = deck
    ? { wrap: 'deck-react-wrap', verbWrap: 'deck-react', verbBtn: 'deck-react__btn' }
    : { wrap: 'listing-react-wrap', verbWrap: 'listing-react', verbBtn: 'listing-react__btn' };

  // ── local in-progress state ────────────────────────────────────────────────
  const state = { verb: current?.reaction || null };
  const activePrimary = new Set();
  const activeSub = new Map(); // primaryKey → Set<detailKey>
  for (const r of (Array.isArray(current?.reasons) ? current.reasons : [])) {
    if (!r?.key) continue;
    activePrimary.add(r.key);
    if (r.detail) {
      if (!activeSub.has(r.key)) activeSub.set(r.key, new Set());
      activeSub.get(r.key).add(r.detail);
    }
  }

  const buildReasonsArray = () => {
    const out = [];
    for (const key of activePrimary) {
      const subs = activeSub.get(key);
      if (subs && subs.size) for (const d of subs) out.push({ key, detail: d, note: null });
      else out.push({ key, detail: null, note: null });
    }
    return out;
  };

  // ── verb buttons (single-select) ───────────────────────────────────────────
  const verbBtns = REACTIONS.map((rx) => el('button', {
    type: 'button',
    class: `${V.verbBtn}${deck ? ` ${V.verbBtn}--${rx}` : ''}`,
    'data-react': rx,
    'aria-pressed': String(state.verb === rx),
  }, REACTION_LABELS[rx]));
  const verbGroup = el('div', { class: V.verbWrap, role: 'group', 'aria-label': 'Your reaction' }, verbBtns);
  const setVerbPressed = () => verbBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.react === state.verb)));

  // ── reasons (multi-select primaries + optional sub-reason rows) ─────────────
  const reasonsEl = el('div', { class: 'listing-reasons', role: 'group', 'aria-label': 'Why? (optional — a tagged reason trains far better)' });

  function renderReasons() {
    reasonsEl.replaceChildren();
    const vocab = reasonsForVerb(state.verb);
    reasonsEl.hidden = vocab.length === 0;
    if (!vocab.length) return;
    reasonsEl.setAttribute('aria-label', state.verb === 'like' ? 'What did you like? (optional)' : 'Why reject? (optional)');
    for (const r of vocab) {
      const on = activePrimary.has(r.key);
      const chip = el('button', {
        type: 'button', class: 'listing-chip', 'data-reason': r.key, 'aria-pressed': String(on),
      }, r.label);
      const subs = subReasonsFor(r.key);
      let subRow = null;
      if (on && subs.length) {
        const set = activeSub.get(r.key) || new Set();
        const subChips = subs.map((s) => el('button', {
          type: 'button', class: 'listing-subchip', 'data-sub': s.key, 'data-parent': r.key,
          'aria-pressed': String(set.has(s.key)),
        }, s.label));
        subRow = el('div', { class: 'listing-subreasons', role: 'group', 'aria-label': `Refine: ${r.label}` }, subChips);
      }
      reasonsEl.append(el('div', { class: 'listing-reason' }, [chip, subRow].filter(Boolean)));
    }
  }

  reasonsEl.addEventListener('click', (e) => {
    const sub = e.target.closest('[data-sub]');
    if (sub) {
      const parent = sub.dataset.parent;
      const key = sub.dataset.sub;
      if (!activeSub.has(parent)) activeSub.set(parent, new Set());
      const set = activeSub.get(parent);
      if (set.has(key)) set.delete(key); else set.add(key);
      sub.setAttribute('aria-pressed', String(set.has(key)));
      markDirty();
      return;
    }
    const chip = e.target.closest('[data-reason]');
    if (!chip) return;
    const key = chip.dataset.reason;
    if (activePrimary.has(key)) { activePrimary.delete(key); activeSub.delete(key); }
    else { activePrimary.add(key); }
    renderReasons();
    markDirty();
  });

  // ── Save (the consolidated decision) ───────────────────────────────────────
  const saveBtn = el('button', {
    type: 'button', class: deck ? 'deck-save' : 'listing-save', 'data-save': '',
    'aria-label': 'Save your decision for this property',
  }, 'Save decision');
  const saveRow = el('div', { class: 'listing-save-row' }, [saveBtn]);

  const refreshSaveState = () => {
    saveBtn.disabled = !state.verb;
    saveBtn.setAttribute('aria-disabled', String(!state.verb));
  };
  // After a save, show a confirmed state until the user changes something.
  function markSaved() {
    wrap.classList.add('is-saved');
    saveBtn.textContent = 'Saved ✓';
    saveBtn.setAttribute('aria-pressed', 'true');
  }
  function markDirty() {
    if (!wrap.classList.contains('is-saved')) return;
    wrap.classList.remove('is-saved');
    saveBtn.textContent = 'Save decision';
    saveBtn.removeAttribute('aria-pressed');
  }

  saveBtn.addEventListener('click', async () => {
    if (!state.verb) return;
    const reasons = buildReasonsArray();
    markSaved();
    try { await onSave?.({ reaction: state.verb, reasons }); }
    catch { markDirty(); }
  });

  // ── verb interaction ───────────────────────────────────────────────────────
  verbGroup.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-react]');
    if (!b) return;
    const rx = b.dataset.react;
    if (state.verb !== rx) {
      // Switching verb (e.g. reject → like) invalidates the other vocabulary's reasons.
      activePrimary.clear();
      activeSub.clear();
    }
    state.verb = rx;
    setVerbPressed();
    renderReasons();
    refreshSaveState();
    markDirty();
    await onReact?.(rx); // append-only in-progress capture (verb only)
  });

  renderReasons();
  refreshSaveState();

  const wrap = el('div', { class: `${V.wrap} reaction-picker reaction-picker--${variant}` }, [
    verbGroup, reasonsEl, saveRow,
  ]);
  if (current?.reaction) markSaved();
  return wrap;
}
