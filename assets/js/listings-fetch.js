// listings-fetch.js — "Pull listings" controls for the Live Listings page.
//
// The fetcher (tools/fetch-listings.mjs) needs the Apify token AND the Supabase
// service-role key, so it CANNOT run in the browser — it runs on a GitHub
// runner. These buttons therefore TRIGGER the fetch-listings workflow remotely
// via GitHub's workflow_dispatch API, reusing the user-provided PAT that the
// Data-sync page (§03) already stores in localStorage under `rec:gh-pat`.
//
// Each button pins an explicit Rightmove recency window. Rightmove only honours
// maxDaysSinceAdded ∈ {1, 3, 7, 14}; we expose the two used day to day:
//   "Pull listings: 24hr"  → 1 day   (same window as the 06:00 UTC scheduled run)
//   "Pull listings: 3 days" → 3 days  (catch-up after a gap)
// Re-pulling the same window is always safe: dedup is guaranteed downstream by
// the `rightmove_id` UNIQUE constraint + UPSERT merge, independent of timing.

import { byId, el } from './dom.js';

const GH_PAT_KEY = 'rec:gh-pat';
const GH_REPO    = 'seanparkerai/rec';
const GH_WF_FILE = 'fetch-listings.yml';
const GH_REF     = 'main';

/** Recency windows Rightmove accepts (days). Any other value returns 0 results. */
const VALID_WINDOWS = [1, 3, 7, 14];

/** Human label for a window, e.g. 1 → "24-hour", 3 → "3-day". */
export function windowLabel(days) {
  return Number(days) === 1 ? '24-hour' : `${Number(days)}-day`;
}

/** Build the workflow_dispatch request body for a recency window (days).
 *  Pure + exported for unit tests. Throws on a window Rightmove would reject. */
export function buildDispatchBody(days) {
  const d = Number(days);
  if (!VALID_WINDOWS.includes(d)) {
    throw new Error(`Invalid recency window: ${days} (Rightmove accepts 1, 3, 7, 14)`);
  }
  return {
    ref: GH_REF,
    inputs: {
      dry_run: 'false',
      foundation_mode: 'false',
      search_mode: 'cluster',
      max_days_since_added: String(d),
    },
  };
}

/** True for a syntactically valid GitHub personal access token. */
export function isValidPat(token) {
  const t = (token || '').trim();
  return t.startsWith('ghp_') || t.startsWith('github_pat_');
}

function loadPat()  { try { return localStorage.getItem(GH_PAT_KEY) || ''; } catch { return ''; } }
function savePat(t) { try { localStorage.setItem(GH_PAT_KEY, t); } catch { /* private mode */ } }

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
        el('p', {}, `This starts the ${label} Rightmove pull on GitHub Actions. New listings appear within a few minutes once the run finishes — refresh the page to see them.`),
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
  const buttons  = [...root.querySelectorAll('[data-fetch-days]')];
  if (!buttons.length) return; // not on this page

  const statusEl = root.querySelector('[data-fetch-status]');
  const tokenBox = root.querySelector('[data-fetch-token]');
  const tokenIn  = root.querySelector('[data-fetch-token-input]');
  const tokenBtn = root.querySelector('[data-fetch-token-save]');

  function setStatus(msg, kind = 'info') {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-ok',  kind === 'ok');
    statusEl.classList.toggle('is-err', kind === 'err');
  }

  function revealToken(reveal) {
    if (tokenBox) tokenBox.hidden = !reveal;
    if (reveal && tokenIn) tokenIn.focus();
  }

  async function dispatch(days) {
    const pat = loadPat();
    if (!pat) {
      setStatus('A GitHub token is needed to run the fetch — paste one below (one-time).', 'err');
      revealToken(true);
      return;
    }
    const label = windowLabel(days);
    let body;
    try { body = buildDispatchBody(days); }
    catch (e) { setStatus(e.message, 'err'); return; }

    buttons.forEach((b) => { b.disabled = true; });
    setStatus(`Dispatching the ${label} pull…`, 'info');
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WF_FILE}/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${pat}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify(body),
        },
      );
      if (res.status === 204) {
        setStatus(`✓ ${label} pull dispatched. New listings land in a few minutes — refresh this page to see them.`, 'ok');
      } else if (res.status === 401 || res.status === 403) {
        setStatus(`GitHub rejected the token (${res.status}). It needs Actions: write on ${GH_REPO}. Re-enter it below.`, 'err');
        revealToken(true);
      } else {
        const text = await res.text().catch(() => String(res.status));
        setStatus(`GitHub API error ${res.status}: ${text}`, 'err');
      }
    } catch (e) {
      setStatus(`Network error: ${e.message}`, 'err');
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  buttons.forEach((b) => b.addEventListener('click', async () => {
    const days = Number(b.dataset.fetchDays);
    if (await confirmFetch(days)) dispatch(days);
  }));

  tokenBtn?.addEventListener('click', () => {
    const val = (tokenIn?.value || '').trim();
    if (!isValidPat(val)) {
      setStatus('That does not look like a GitHub token (it should start with ghp_ or github_pat_).', 'err');
      return;
    }
    savePat(val);
    if (tokenIn) tokenIn.value = '';
    revealToken(false);
    setStatus('Token saved. Press a “Pull listings” button to run the fetch.', 'ok');
  });

  // If a token is already saved (e.g. set on the Data-sync page), keep the token
  // box hidden — the buttons just work.
  revealToken(false);
}
