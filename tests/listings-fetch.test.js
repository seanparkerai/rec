// listings-fetch.test.js — unit tests for the "Pull listings" controls
// (assets/js/listings/fetch.js). Covers the pure helpers only; the DOM wiring in
// wireListingsFetch() (which now calls the server-side request_rightmove_fetch RPC
// via storage.js — no in-browser PAT) is exercised by hand / the browser harness.

import { windowLabel, isValidWindow } from '../assets/js/listings/fetch.js';

export async function register({ test, assert, assertEqual }) {
  await test('listings-fetch: only Rightmove-valid windows are accepted', () => {
    for (const ok of [1, 3, 7, 14, '1', '3', '7', '14']) {
      assert(isValidWindow(ok), `expected ${ok} to be a valid window`);
    }
    for (const bad of [0, 2, 5, 30, NaN, null, undefined, '']) {
      assert(!isValidWindow(bad), `expected ${bad} to be rejected (Rightmove accepts 1/3/7/14 only)`);
    }
  });

  await test('listings-fetch: the 24hr / 3d / 7d buttons map to valid windows', () => {
    // The three listings-page buttons (data-fetch-days="1|3|7").
    for (const days of [1, 3, 7]) assert(isValidWindow(days), `button window ${days} valid`);
  });

  await test('listings-fetch: windowLabel reads naturally', () => {
    assertEqual(windowLabel(1), '24-hour');
    assertEqual(windowLabel(3), '3-day');
    assertEqual(windowLabel(7), '7-day');
    assertEqual(windowLabel('14'), '14-day');
  });
}
