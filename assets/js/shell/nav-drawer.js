// shell/nav-drawer.js — the burger → native <dialog> drawer wiring (step 3.3b,
// moved verbatim from components.js). Native <dialog> supplies the focus trap;
// this module only opens/closes and mirrors state onto the burger for AT.
/** @param {object} [opts] @param {Document} [opts.doc] */
export function initNavDrawer({ doc = document } = {}) {
  const dialog = /** @type {HTMLDialogElement|null} */ (doc.getElementById('nav-drawer'));
  const toggle = doc.getElementById('nav-toggle');
  if (!dialog || !toggle) return;

  const open = () => { if (!dialog.open) dialog.showModal(); };
  const close = () => { if (dialog.open) dialog.close(); };

  toggle.addEventListener('click', open);
  doc.getElementById('nav-drawer-close')?.addEventListener('click', close);

  // Reflect open state on the burger for assistive tech.
  dialog.addEventListener('close', () => toggle.setAttribute('aria-expanded', 'false'));
  toggle.addEventListener('click', () => toggle.setAttribute('aria-expanded', 'true'));

  // Backdrop click (outside the drawer panel) closes it.
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return; // clicks on inner content bubble with their own target
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) close();
  });

  // Any nav link closes the drawer (covers same-page / hash links that don't navigate away).
  dialog.querySelectorAll('a[data-nav]').forEach((a) => a.addEventListener('click', close));
}
