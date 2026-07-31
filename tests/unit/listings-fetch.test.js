// listings-fetch.test.js — unit tests for the "Pull listings" controls
// (assets/js/listings/fetch.js). Covers the pure helpers only; the DOM wiring in
// wireListingsFetch() (which now calls the server-side request_rightmove_fetch RPC
// via storage.js — no in-browser PAT) is exercised by hand / the browser harness.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { windowLabel, isValidWindow } from '../../assets/js/listings/fetch.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function register({ test, assert, assertEqual }) {
  await test('listings-fetch: only Rightmove-valid windows are accepted', () => {
    for (const ok of [1, 3, 7, 14, '1', '3', '7', '14']) {
      assert(isValidWindow(ok), `expected ${ok} to be a valid window`);
    }
    for (const bad of [0, 2, 5, 30, NaN, null, undefined, '']) {
      assert(!isValidWindow(bad), `expected ${bad} to be rejected (Rightmove accepts 1/3/7/14 only)`);
    }
  });

  await test('listings-fetch: the 24hr / 3d / 7d / 14d buttons map to valid windows', () => {
    // The four listings-page buttons (data-fetch-days="1|3|7|14").
    for (const days of [1, 3, 7, 14]) assert(isValidWindow(days), `button window ${days} valid`);
  });

  await test('listings-fetch: the widest window Rightmove accepts has a button', () => {
    // 14 was valid in isValidWindow, in request_rightmove_fetch and in
    // private.dispatch_fetch_now all along, but had no button — so the deepest
    // catch-up the portal could reach was needlessly capped at 7 days. Pin the
    // markup so the widest supported window keeps a way to be triggered.
    const html = readFileSync(resolve(ROOT, 'pages/listings.html'), 'utf8');
    const windows = [...html.matchAll(/data-fetch-days="(\d+)"/g)].map((m) => Number(m[1]));
    assertEqual(windows.join(','), '1,3,7,14', 'listings page must expose every Rightmove-valid window');
    for (const d of windows) assert(isValidWindow(d), `button ${d} would return 0 results`);
    assertEqual(Math.max(...windows), 14, 'the widest Rightmove window must be reachable from the portal');
  });

  await test('listings-fetch: windowLabel reads naturally', () => {
    assertEqual(windowLabel(1), '24-hour');
    assertEqual(windowLabel(3), '3-day');
    assertEqual(windowLabel(7), '7-day');
    assertEqual(windowLabel('14'), '14-day');
  });
}
