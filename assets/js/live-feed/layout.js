// live-feed/layout.js — PURE anti-burn-in layout cycling for the /live-feed kiosk.
// No DOM: returns the next arrangement token + small pixel offsets so the page
// coordinator can apply them and tests can pin the cycle (tests/live-feed-runs.test.js).
//
// The kiosk runs permanently on a landscape iPad, so a static layout risks OLED/LCD
// burn-in. On every refresh the page advances to the next variant (even wear across
// all four), reorders the two user panels, and nudges the whole grid a few pixels.

// Four grid arrangements, implemented purely via CSS grid-template-areas keyed on
// [data-layout]. V1/V2 are vertical scraper columns (left/right); V3/V4 are
// horizontal scraper bands (top/bottom) — so both axes get equal wear.
export const LAYOUTS = ['v1', 'v2', 'v3', 'v4'];

/** True when the scraper region is a horizontal band rather than a side column. */
export function isHorizontal(layout) {
  return layout === 'v3' || layout === 'v4';
}

/**
 * Next layout token in the deterministic cycle (even wear). An unknown/absent
 * `prev` starts at the first variant.
 * @param {string} [prev]
 * @returns {string} one of LAYOUTS
 */
export function nextLayout(prev) {
  const i = LAYOUTS.indexOf(prev);
  return LAYOUTS[(i + 1) % LAYOUTS.length];
}

/**
 * Next user-panel order. The two panels swap on every refresh so neither hero
 * number is pinned to one half of the panel for the screen's whole life.
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
