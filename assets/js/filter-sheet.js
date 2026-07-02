// filter-sheet.js — filter controls in a native <dialog>: a modal bottom-sheet
// on phones, an inline card at ≥768px (components/filter-sheet.css gates the
// presentation; this module only manages the open/modal state). Extracted from
// the areas page's inline script at 3.4c for Browse/Saved; promoted to a flat
// shared utility at 3.7a when areas itself folded back onto it (one mechanism,
// three surfaces). Pure DOM wiring — no storage, no page state; the caller
// supplies `describe()` for the active-filter pills (rendered as TEXT — raw
// user search terms can never become markup).

/**
 * @param {object} opts
 * @param {HTMLDialogElement} opts.dlg      the <dialog class="filter-sheet">
 * @param {HTMLElement} [opts.openBtn]      phone trigger ("Filters")
 * @param {HTMLElement} [opts.closeBtn]     the sheet's Done button
 * @param {HTMLElement} [opts.activeEl]     pill region mirroring active filters
 * @param {() => string[]} [opts.describe]  labels for the active filters (text-only)
 * @param {{matches: boolean, addEventListener?: Function}} [opts.mq]
 *        injected media query (default: phone = max-width 767.98px)
 * @returns {{ sync, hide, refresh } | null}
 */
export function wireFilterSheet({ dlg, openBtn, closeBtn, activeEl, describe, mq } = {}) {
  if (!dlg) return null;
  const media = mq
    || (typeof matchMedia === 'function' ? matchMedia('(max-width: 767.98px)') : { matches: false });
  const isModal = () => { try { return dlg.matches(':modal'); } catch { return false; } };
  const close = () => { try { dlg.close(); } catch { /* not open */ } };

  // Phone: the sheet stays closed until the trigger opens it modally.
  // Desktop: it sits open as an inline card (non-modal `open` attribute).
  function sync() {
    if (media.matches) {
      if (dlg.hasAttribute('open') && !isModal()) dlg.removeAttribute('open');
    } else if (!dlg.hasAttribute('open')) {
      dlg.setAttribute('open', '');
    }
  }

  // Fully close in either mode (e.g. the listings page's review mode, where the
  // filter surface leaves entirely). The caller re-enters via sync().
  function hide() {
    close();
    dlg.removeAttribute('open');
  }

  // Mirror the active filters as pills on the trigger row. textContent only —
  // labels include raw user search terms, which must never become markup.
  function refresh() {
    if (!activeEl) return;
    const labels = (describe ? describe() : []).filter(Boolean);
    activeEl.replaceChildren();
    if (!labels.length) { activeEl.textContent = 'No filters set.'; return; }
    for (const label of labels) {
      const pill = dlg.ownerDocument.createElement('span');
      pill.className = 'filter-pill';
      pill.textContent = label;
      activeEl.appendChild(pill);
    }
  }

  openBtn?.addEventListener('click', () => {
    if (dlg.hasAttribute('open')) close(); // re-base a stray inline-open before going modal
    dlg.showModal();
  });
  closeBtn?.addEventListener('click', close);
  media.addEventListener?.('change', sync);
  sync();
  refresh();
  return { sync, hide, refresh };
}
