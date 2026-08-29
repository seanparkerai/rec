// confirm-dialog.js — a native <dialog> confirmation.
//
// CLAUDE.md §11 bans window.confirm/alert/prompt in production UI: they are not
// themeable, not focus-trapped consistently, and on iOS they can be suppressed.
// This is the one shared implementation, extracted when the search-profiles and
// admin search-control pages both needed it.
//
// (assets/js/listings/fetch.js still carries its own older private copy. It works
// and is well covered, so it is left alone rather than refactored here — adopting
// this helper there is a tidy-up for its own change, not a rider on this one.)

import { el } from './dom.js';

/**
 * Ask the user to confirm. Resolves true ONLY on an explicit confirm — Cancel,
 * Escape and a backdrop dismissal all resolve false, so an interrupted gesture is
 * never read as consent.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.body]
 * @param {string} [opts.confirmLabel]
 * @param {boolean} [opts.destructive] styles the confirm button as a warning
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, body = '', confirmLabel = 'Confirm', destructive = false }) {
  return new Promise((resolve) => {
    const cancel = el('button', { type: 'button', class: 'outline secondary' }, 'Cancel');
    const ok = el('button', { type: 'button', class: destructive ? 'contrast' : '' }, confirmLabel);

    const children = [el('h3', {}, title)];
    if (body) children.push(el('p', {}, body));
    children.push(el('footer', {}, [cancel, ok]));

    // el() takes ONE children argument (an array is fine) — extra positional args
    // are silently dropped, which is a quiet way to lose half a dialog.
    const dlg = el('dialog', { class: 'confirm-dialog' }, [el('article', {}, children)]);

    let settled = false;
    const done = (v) => {
      if (settled) return;          // close() fires 'close', which would re-enter
      settled = true;
      resolve(v);
      try { dlg.close(); } catch { /* already closed */ }
      dlg.remove();
    };
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    dlg.addEventListener('close', () => done(false));

    document.body.appendChild(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    ok.focus();
  });
}
