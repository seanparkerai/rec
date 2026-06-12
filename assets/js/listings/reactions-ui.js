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
import { el } from '../dom.js';
import {
  REACTIONS, REJECT_REASONS, LIKE_REASONS, subReasonsFor,
} from './reactions.js';
import {
  draftFromDecision, applyVerb, togglePrimary, toggleSub, reasonsArray, isDirty,
} from './picker-state.js';

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
 * @param {object} [opts.draft]  an in-progress draft (picker-state.js shape) to rehydrate —
 *   how a coordinator preserves un-saved taps across an async repaint
 * @param {(draft:object|null)=>void} [opts.onDraftChange]  fired after every verb/chip tap
 *   with the new draft, and with null once the draft is saved (no longer in progress)
 * @returns {HTMLElement}
 */
export function buildReasonPicker({ variant = 'row', current = null, onReact, onSave, draft: initialDraft = null, onDraftChange = null } = {}) {
  const deck = variant === 'deck';
  const V = deck
    ? { wrap: 'deck-react-wrap', verbWrap: 'deck-react', verbBtn: 'deck-react__btn' }
    : { wrap: 'listing-react-wrap', verbWrap: 'listing-react', verbBtn: 'listing-react__btn' };

  // ── local in-progress state (pure draft, see picker-state.js) ──────────────
  // Hydrate from a coordinator-stashed draft when one exists (an async repaint
  // rebuilt this card mid-edit), else from the saved decision.
  let draft = initialDraft ?? draftFromDecision(current);
  const setDraft = (next) => {
    draft = next;
    onDraftChange?.(draft);
  };

  // ── verb buttons (single-select) ───────────────────────────────────────────
  const verbBtns = REACTIONS.map((rx) => el('button', {
    type: 'button',
    class: `${V.verbBtn}${deck ? ` ${V.verbBtn}--${rx}` : ''}`,
    'data-react': rx,
    'aria-pressed': String(draft.verb === rx),
  }, REACTION_LABELS[rx]));
  const verbGroup = el('div', { class: V.verbWrap, role: 'group', 'aria-label': 'Your reaction' }, verbBtns);
  const setVerbPressed = () => verbBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.react === draft.verb)));

  // ── reasons (multi-select primaries + optional sub-reason rows) ─────────────
  const reasonsEl = el('div', { class: 'listing-reasons', role: 'group', 'aria-label': 'Why? (optional — a tagged reason trains far better)' });

  function renderReasons() {
    reasonsEl.replaceChildren();
    const vocab = reasonsForVerb(draft.verb);
    reasonsEl.hidden = vocab.length === 0;
    if (!vocab.length) return;
    reasonsEl.setAttribute('aria-label', draft.verb === 'like' ? 'What did you like? (optional)' : 'Why reject? (optional)');
    for (const r of vocab) {
      const on = draft.primary.includes(r.key);
      const chip = el('button', {
        type: 'button', class: 'listing-chip', 'data-reason': r.key, 'aria-pressed': String(on),
      }, r.label);
      const subs = subReasonsFor(r.key);
      let subRow = null;
      if (on && subs.length) {
        const active = draft.subs[r.key] || [];
        const subChips = subs.map((s) => el('button', {
          type: 'button', class: 'listing-subchip', 'data-sub': s.key, 'data-parent': r.key,
          'aria-pressed': String(active.includes(s.key)),
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
      setDraft(toggleSub(draft, parent, key));
      sub.setAttribute('aria-pressed', String((draft.subs[parent] || []).includes(key)));
      markDirty();
      return;
    }
    const chip = e.target.closest('[data-reason]');
    if (!chip) return;
    setDraft(togglePrimary(draft, chip.dataset.reason));
    renderReasons();
    markDirty();
  });

  // ── Save (the consolidated decision) ───────────────────────────────────────
  const saveBtn = el('button', {
    type: 'button', class: deck ? 'deck-save' : 'listing-save', 'data-save': '',
    'aria-label': 'Save your decision for this property',
  }, 'Save decision');
  const errorMsg = el('span', { class: 'listing-save-error', hidden: true, role: 'alert' });
  const saveRow = el('div', { class: 'listing-save-row' }, [saveBtn, errorMsg]);

  const refreshSaveState = () => {
    saveBtn.disabled = !draft.verb;
    saveBtn.setAttribute('aria-disabled', String(!draft.verb));
  };
  // After a save, show a confirmed state until the user changes something.
  function markSaved() {
    wrap.classList.add('is-saved');
    wrap.classList.remove('is-save-error');
    saveBtn.textContent = 'Saved ✓';
    saveBtn.setAttribute('aria-pressed', 'true');
    errorMsg.hidden = true;
    errorMsg.textContent = '';
    onDraftChange?.(null); // persisted — no in-progress draft to preserve any more
  }
  function markDirty() {
    if (!wrap.classList.contains('is-saved')) return;
    wrap.classList.remove('is-saved');
    saveBtn.textContent = 'Save decision';
    saveBtn.removeAttribute('aria-pressed');
    errorMsg.hidden = true;
  }
  function markError(err) {
    wrap.classList.add('is-save-error');
    wrap.classList.remove('is-saved');
    saveBtn.textContent = 'Save failed — try again';
    saveBtn.removeAttribute('aria-pressed');
    errorMsg.hidden = false;
    errorMsg.textContent = err?.message || 'Failed to save. Check your connection and try again.';
  }

  saveBtn.addEventListener('click', async () => {
    if (!draft.verb) return;
    const reasons = reasonsArray(draft);
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      // A coordinator that signals failure by returning false (rather than
      // throwing) must still land in the error state — never a false "Saved ✓".
      const res = await onSave?.({ reaction: draft.verb, reasons });
      if (res === false) throw new Error('Failed to save. Check your connection and try again.');
      markSaved();
    } catch (e) {
      markError(e);
      saveBtn.disabled = false;
    }
  });

  // ── verb interaction ───────────────────────────────────────────────────────
  verbGroup.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-react]');
    if (!b) return;
    // Switching verb (e.g. reject → like) clears the other vocabulary's reasons
    // (applyVerb); re-tapping the same verb keeps them.
    setDraft(applyVerb(draft, b.dataset.react));
    setVerbPressed();
    renderReasons();
    refreshSaveState();
    markDirty();
    await onReact?.(draft.verb); // append-only in-progress capture (verb only)
  });

  renderReasons();
  refreshSaveState();

  const wrap = el('div', { class: `${V.wrap} reaction-picker reaction-picker--${variant}` }, [
    verbGroup, reasonsEl, saveRow,
  ]);
  // A saved decision with NO divergent in-progress draft renders as confirmed; a
  // rehydrated dirty draft stays editable (Save enabled, not "Saved ✓").
  if (current?.reaction && !isDirty(draft, current)) markSaved();
  return wrap;
}
