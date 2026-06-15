// suggestions/confirm.js — the shared "removes N listings" confirm dialog for the
// higher-stakes Apply actions (Stop searching an area / Hide a property type). Extracted
// from page-refinement.js so the Listings page can reuse the exact same native <dialog>
// (#ref-confirm) markup + copy. The OK button runs an injected onConfirm() so this module
// stays decoupled from the specific storage writer.
import { byId as $, on } from '../dom.js';
import { countMatchingListings } from '../storage.js';

const COPY = {
  hide: {
    title: (label) => `Hide ${label}?`,
    confirm: 'Hide from view',
    busy: 'Hiding…',
    message: (label, n) => `This removes ${n} matching ${n === 1 ? 'listing' : 'listings'} from your feed. You can undo anytime — nothing is deleted.`,
  },
  stop: {
    title: (label) => `Stop searching ${label}?`,
    confirm: 'Stop searching',
    busy: 'Pausing…',
    message: (label, n, reprobe) => `You'll stop receiving new listings in ${label} (${n} ${n === 1 ? 'listing' : 'listings'} currently shown). We'll quietly re-check it every ${reprobe} scraper runs in case it's worth bringing back. You can undo anytime.`,
  },
};

/**
 * Create a confirm-dialog controller bound to the #ref-confirm dialog on the page.
 * @param {{ reprobeRuns?: number }} opts
 * @returns {{ open, wire, close }}
 */
export function createConfirm({ reprobeRuns = 6 } = {}) {
  let pending = null;

  function close() {
    $('ref-confirm')?.close();
    pending = null;
  }

  // action: 'hide' | 'stop'; dimension/value drive the live count; onConfirm does the work.
  async function open({ action, dimension, value, label, onConfirm }) {
    const dlg = $('ref-confirm');
    const copy = COPY[action];
    // No dialog on this page (or unknown action) — run the action directly.
    if (!dlg || !copy) { if (onConfirm) await onConfirm(); return; }
    pending = { action, dimension, value, label, onConfirm };
    $('ref-confirm-title').textContent = copy.title(label);
    const msg = $('ref-confirm-msg');
    msg.textContent = 'Counting matching listings…';
    const okBtn = $('ref-confirm-ok');
    if (okBtn) { okBtn.disabled = true; okBtn.textContent = copy.confirm; }
    dlg.classList.toggle('ref-dialog--danger', action === 'stop');
    dlg.showModal();
    const n = await countMatchingListings({ dimension, value });
    if (!pending || pending.value !== value || pending.dimension !== dimension || pending.action !== action) return;
    msg.textContent = copy.message(label, n, reprobeRuns);
    if (okBtn) okBtn.disabled = false;
  }

  function wire() {
    const dlg = $('ref-confirm');
    if (!dlg) return;
    on($('ref-confirm-cancel'), 'click', close);
    on(dlg, 'click', (e) => { if (e.target === dlg) close(); });
    on(dlg, 'cancel', () => { pending = null; }); // native Escape
    on($('ref-confirm-ok'), 'click', async () => {
      if (!pending) return;
      const { action, onConfirm } = pending;
      const btn = $('ref-confirm-ok');
      if (btn) { btn.disabled = true; btn.textContent = COPY[action].busy; }
      if (onConfirm) await onConfirm();
      close();
    });
  }

  return { open, wire, close };
}
