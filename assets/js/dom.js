// dom.js — DOM micro-utilities. Browser-only (uses document).
// Replaces inline copies in page-*.js modules — see REFACTOR_PLAN.md Phase 1.

/**
 * Escape a value for safe insertion into HTML.
 * @param {*} s any value; falsy → empty string.
 * @returns {string}
 */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * Shorthand for getElementById with optional root element.
 * Pass a root (e.g. a shadow root or scoped container) as the second arg;
 * defaults to document for the common case.
 * @param {string} id
 * @param {Document|Element} [root=document]
 * @returns {HTMLElement|null}
 */
export const byId = (id, root = document) =>
  (root === document ? document.getElementById(id) : root.querySelector('#' + id));

/**
 * Set text content of an element by id.
 * Clears the data-loading attribute by default (matches existing page behaviour).
 * @param {string} id
 * @param {string|number|null|undefined} value
 * @param {{ fallback?: string, clearLoading?: boolean }} [opts]
 */
export function setText(id, value, opts = {}) {
  const el = byId(id);
  if (!el) return;
  if (opts.clearLoading !== false) delete el.dataset.loading;
  el.textContent = (value === null || value === undefined || value === '')
    ? (opts.fallback ?? '')
    : String(value);
}

/**
 * Set innerHTML of an element by id.
 * Caller is responsible for escaping user-supplied values — use esc() first.
 * @param {string} id
 * @param {string} html
 * @param {{ clearLoading?: boolean }} [opts]
 */
export function setHTML(id, html, opts = {}) {
  const el = byId(id);
  if (!el) return;
  if (opts.clearLoading !== false) delete el.dataset.loading;
  el.innerHTML = html;
}

/**
 * Add an event listener, no-op if the element is null/undefined.
 * Mirrors the inline `on()` helper used in page-outreach.js.
 * @param {EventTarget|null|undefined} el
 * @param {string} evt
 * @param {EventListenerOrEventListenerObject} fn
 * @param {AddEventListenerOptions|boolean} [opts]
 */
export const on = (el, evt, fn, opts) => el?.addEventListener(evt, fn, opts);
