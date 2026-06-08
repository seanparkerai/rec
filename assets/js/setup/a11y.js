// setup/a11y.js — small accessibility helpers for the wizard (WCAG 2.2): move focus to
// the first field on each step, announce step changes politely, and keep the progressbar
// ARIA in sync. DOM-only (browser); honours prefers-reduced-motion by skipping the rAF
// double-tick when the user asked for reduced motion.

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

export function focusFirst(container) {
  if (!container) return;
  const el = container.querySelector(
    'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  if (el && typeof el.focus === 'function') el.focus();
}

// Re-announce on an aria-live="polite" region. Clearing first guarantees screen readers
// pick up an identical-looking message on a repeated step change.
export function announce(region, message) {
  if (!region) return;
  region.textContent = '';
  const set = () => { region.textContent = message; };
  if (reduceMotion() || typeof requestAnimationFrame !== 'function') set();
  else requestAnimationFrame(() => requestAnimationFrame(set));
}

export function updateProgress(el, current, total) {
  if (!el) return;
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '1');
  el.setAttribute('aria-valuemax', String(total));
  el.setAttribute('aria-valuenow', String(current));
  el.setAttribute('aria-valuetext', `Step ${current} of ${total}`);
}
