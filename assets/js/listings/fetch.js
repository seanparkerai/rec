// listings-fetch.js — "Pull listings" controls for the Live Listings page.
//
// The fetcher (tools/fetch-listings.mjs) needs the Apify token AND the Supabase
// service-role key, so it CANNOT run in the browser — it runs on a GitHub runner.
// These buttons therefore TRIGGER the fetch-listings workflow SERVER-SIDE: they
// call the `request_rightmove_fetch` Supabase RPC (via storage.js), which holds the
// GitHub token in Supabase Vault and dispatches workflow_dispatch on the server. No
// GitHub token ever touches the browser — a signed-in portal user is all that's
// needed, from any device. (Same mechanism the noon pg_cron job uses; see
// docs/FETCH_SCHEDULE.md.)
//
// Each button pins an explicit Rightmove recency window. Rightmove only honours
// maxDaysSinceAdded ∈ {1, 3, 7, 14}, and the row now exposes ALL FOUR:
//   "24hr" → 1 day    (same window as the scheduled runs)
//   "3d"   → 3 days   (catch-up after a short gap)
//   "7d"   → 7 days   (catch-up after a longer gap)
//   "14d"  → 14 days  (the widest window Rightmove accepts — the deepest catch-up
//                      available without a FOUNDATION_MODE standing-stock pull)
// 14 was valid in isValidWindow, in the request_rightmove_fetch RPC and in
// private.dispatch_fetch_now all along, but had no button — so the deepest catch-up
// the portal could reach was needlessly capped at 7 days (2026-07-31 audit).
//
// NOTE on what a recency window can and cannot do: maxDaysSinceAdded filters on when
// a property was FIRST LISTED on Rightmove, not on whether we have seen it. Even the
// 14-day button therefore cannot recover older standing stock — 96% of live listings
// in this patch were added more than 7 days ago. Only FOUNDATION_MODE (omits the
// recency filter entirely) does that, and it is deliberately not reachable from the
// portal; see docs/adr/0011.
//
// Re-pulling a wider window is always safe: dedup is guaranteed downstream by the
// `rightmove_id` UNIQUE constraint + UPSERT merge, independent of timing.

import { el } from '../dom.js';
import { requestListingsFetch } from '../storage.js';

/** Recency windows Rightmove accepts (days). Any other value returns 0 results. */
const VALID_WINDOWS = [1, 3, 7, 14];

/** True for a recency window Rightmove will honour. Pure + exported for tests. */
export function isValidWindow(days) {
  return VALID_WINDOWS.includes(Number(days));
}

/** Human label for a window, e.g. 1 → "24-hour", 3 → "3-day". */
export function windowLabel(days) {
  return Number(days) === 1 ? '24-hour' : `${Number(days)}-day`;
}

/** The window as a duration reads better mid-sentence: 1 → "24 hours", 7 → "7 days". */
export function labelDays(days) {
  return Number(days) === 1 ? '24 hours' : `${Number(days)} days`;
}

/** Native-<dialog> confirmation before dispatching a pull. Resolves true only if
 *  the user confirms (Cancel, Escape and backdrop click all resolve false). */
function confirmFetch(days) {
  const label = windowLabel(days);
  return new Promise((resolve) => {
    const cancelBtn = el('button', { type: 'button', class: 'outline secondary' }, 'Cancel');
    const okBtn = el('button', { type: 'button' }, `Pull ${label}`);
    const dlg = el('dialog', { class: 'confirm-dialog', 'aria-labelledby': 'confirm-fetch-title' }, [
      el('article', {}, [
        el('header', { class: 'dialog-head' }, el('h2', { id: 'confirm-fetch-title' }, 'Pull new listings?')),
        // Say plainly what a recency window does. "Pull the last 7 days" reads as
        // "fetch everything I might have missed", but maxDaysSinceAdded filters on
        // when a property was FIRST LISTED — an older listing still on the market is
        // out of scope for every window. Stating it here stops a wider button being
        // mistaken for a backfill (2026-07-31 audit).
        el('p', {}, `Searches every one of your areas for properties first listed on Rightmove in the last ${labelDays(days)}, within your saved radius and price range.`),
        el('p', { class: 'dialog-note' }, 'Properties listed earlier and still for sale are not returned by any window — only newly listed ones.'),
        el('p', {}, 'The run takes a few minutes; refresh the page once it finishes.'),
        el('footer', { class: 'dialog-foot' }, [cancelBtn, okBtn]),
      ]),
    ]);
    let done = false;
    const finish = (val) => { if (done) return; done = true; resolve(val); dlg.close(); };
    cancelBtn.addEventListener('click', () => finish(false));
    okBtn.addEventListener('click', () => finish(true));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(false); }); // backdrop
    dlg.addEventListener('close', () => { if (!done) resolve(false); dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    okBtn.focus();
  });
}

// ── DOM wiring ──────────────────────────────────────────────────────────────
export function wireListingsFetch(root = document) {
  const buttons = [...root.querySelectorAll('[data-fetch-days]')];
  if (!buttons.length) return; // not on this page

  const statusEl = root.querySelector('[data-fetch-status]');

  function setStatus(msg, kind = 'info') {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-ok',  kind === 'ok');
    statusEl.classList.toggle('is-err', kind === 'err');
  }

  async function dispatch(days) {
    const label = windowLabel(days);
    if (!isValidWindow(days)) {
      setStatus(`Invalid recency window: ${days} (Rightmove accepts 1, 3, 7, 14).`, 'err');
      return;
    }

    buttons.forEach((b) => { b.disabled = true; });
    setStatus(`Dispatching the ${label} pull…`, 'info');
    try {
      const res = await requestListingsFetch(days);
      if (res?.ok) {
        setStatus(`✓ ${label} pull dispatched. New listings land in a few minutes — refresh this page to see them.`, 'ok');
      } else if (res?.status === 'cooldown') {
        const secs = Number(res.retry_after_seconds) || 0;
        const wait = secs > 60 ? `${Math.ceil(secs / 60)} min` : `${secs}s`;
        setStatus(`A pull was just triggered — please wait ~${wait} before pulling again.`, 'err');
      } else {
        setStatus(res?.message || 'Could not trigger the fetch. Are you signed in?', 'err');
      }
    } catch (e) {
      setStatus(`Could not trigger the fetch: ${e.message}`, 'err');
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  buttons.forEach((b) => b.addEventListener('click', async () => {
    const days = Number(b.dataset.fetchDays);
    if (await confirmFetch(days)) dispatch(days);
  }));
}
