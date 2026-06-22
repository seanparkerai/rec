// live-feed/layout.js — PURE anti-burn-in helpers for the /live-feed kiosk.
// No DOM: returns the next user-panel order + small pixel offsets so the page
// coordinator can apply them and tests can pin them (tests/live-feed-runs.test.js).
//
// The kiosk runs permanently on a landscape iPad in a FIXED 2×2 layout (U F / U F:
// the two users stacked in the left column, the feed a full-height column on the
// right). To mitigate OLED/LCD burn-in, on every refresh the page swaps the two
// user panels (top↔bottom) and nudges the whole grid a few pixels.

/**
 * Next user-panel order. The two panels swap on every refresh so neither hero
 * number is pinned to one half of the left column for the screen's whole life.
 * @param {string[]} [prev] e.g. ['luke','suzanne']
 * @returns {string[]} the reversed pair (defaults to ['luke','suzanne'] → reversed)
 */
export function nextUserOrder(prev) {
  const base = Array.isArray(prev) && prev.length === 2 ? prev : ['luke', 'suzanne'];
  return [base[1], base[0]];
}

// A small ring of pixel offsets — large enough to move static pixels, small enough
// to stay imperceptible. Re-rolled every few minutes by the page (the `tick`).
const SHIFTS = [
  { x: 0, y: 0 }, { x: 3, y: 1 }, { x: -2, y: 3 }, { x: 2, y: -3 },
  { x: -3, y: -1 }, { x: 1, y: 2 }, { x: -1, y: -2 }, { x: 3, y: -2 },
];

/**
 * Deterministic small {x,y} pixel offset for a given integer tick. Pure so the
 * page can drive it off a monotonic counter and tests can pin the ring.
 * @param {number} tick
 * @returns {{ x:number, y:number }}
 */
export function burnShift(tick) {
  const n = Number.isFinite(tick) ? Math.trunc(tick) : 0;
  const i = ((n % SHIFTS.length) + SHIFTS.length) % SHIFTS.length;
  return SHIFTS[i];
}
