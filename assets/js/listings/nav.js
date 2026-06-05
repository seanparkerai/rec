// listing-nav.js — tiny shared helper so opening a listing dossier and coming
// back lands you where you were. Two concerns:
//   1. Context-aware back: the dossier's "back" target depends on where you came
//      from (the live feed vs the saved view), carried in a ?from= query param.
//   2. Scroll/focus restore: the originating list records which card you opened
//      (sessionStorage); on return that card is scrolled into view and focused.
// MPA-safe: works for both the in-page back link and the browser Back button,
// since restore runs on list-page load.

const KEY = 'rec:listing-return';

/** Pages the dossier can return to, keyed by the ?from= value. */
export const BACK_TARGETS = {
  listings: { page: 'pages/listings.html',       label: '← Back to listings' },
  saved:    { page: 'pages/saved-listings.html', label: '← Back to saved' },
};

/**
 * Record the card being opened so the originating page can restore to it. `query`
 * is the originating list's filter querystring (location.search) at click time —
 * stored so the in-app back link can return to the SAME filtered/sorted view, not
 * just the scroll position.
 */
export function rememberReturn(from, listingId, query = '') {
  try { sessionStorage.setItem(KEY, JSON.stringify({ from, id: String(listingId), q: query || '' })); } catch { /* private mode */ }
}

function readReturn() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function clearReturn() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

/**
 * Resolve a ?from= value to a back target, defaulting to the live feed. When the
 * originating list stashed its filter querystring (rememberReturn), append it to
 * the target page so the in-app back link returns to the SAME filtered/sorted view
 * — the list controls restore their state from the URL on load (browser-Back does
 * this natively; this gives the explicit "← Back" link the same behaviour). The
 * stored `from` must match the link's ?from= so a stale record left by the other
 * feed is never applied.
 */
export function backTargetFrom(search = location.search) {
  const from = new URLSearchParams(search).get('from');
  const target = BACK_TARGETS[from] || BACK_TARGETS.listings;
  const ret = readReturn();
  const q = ret && ret.from === from && ret.q ? ret.q : '';
  return q ? { ...target, page: target.page + q } : target;
}

const cssEscape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'));

/**
 * Delegate dossier-link clicks within a list so the opened card is remembered.
 * @param {HTMLElement} container the <ol>/<ul> holding the cards (each card [data-id])
 * @param {string} page the `from` token for this page ('listings' | 'saved')
 */
export function wireReturnTracking(container, page) {
  if (!container) return;
  container.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="property.html"]');
    if (!a || !container.contains(a)) return;
    const card = a.closest('[data-id]');
    // Capture the list's current filter querystring (location.search) so the back
    // link can restore the same filtered/sorted view, not just the scroll position.
    if (card) rememberReturn(page, card.getAttribute('data-id'), location.search);
  });
}

/**
 * On list-page load, scroll + focus the card the user came back from. Call after
 * the list has been painted. No-op unless the stored return matches this page.
 */
export function restoreListFocus(container, page) {
  if (!container) return;
  const ret = readReturn();
  if (!ret || ret.from !== page || !ret.id) return;
  clearReturn();
  const card = container.querySelector(`[data-id="${cssEscape(ret.id)}"]`);
  if (!card) return;
  card.scrollIntoView({ block: 'center' });
  const focusable = card.querySelector('a, button, select') || card;
  if (!focusable.hasAttribute('tabindex') && focusable === card) card.setAttribute('tabindex', '-1');
  try { focusable.focus({ preventScroll: true }); } catch { focusable.focus(); }
  card.classList.add('listing-card--returned');
  setTimeout(() => card.classList.remove('listing-card--returned'), 1600);
}
