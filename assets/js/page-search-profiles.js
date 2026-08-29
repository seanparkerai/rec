// page-search-profiles.js — coordinator for pages/search-profiles.html.
//
// Thin by design (CLAUDE.md §19): every pure view builder lives in
// page-search-profiles/view.js so the jsdom tests can import them without pulling
// in storage.js → supabase-client.js, which Node cannot resolve.
//
// What this page is FOR: profiles are an ADDITIONAL way of searching. The legacy
// criteria-driven search keeps running alongside them unless it is deliberately
// switched off, and the banner says so plainly — a user must never be left guessing
// whether anything is searching on their behalf.

import { getSearchProfiles, setSearchProfileEnabled, runSearchProfile, getFetchControl } from './storage.js';
import { buildProfileCard, buildLaneBanner, buildEmptyState } from './page-search-profiles/view.js';
import { confirmDialog } from './confirm-dialog.js';

const $ = (sel) => document.querySelector(sel);

let control = { fetch_enabled: true, legacy_enabled: true, paused_reason: null };
let profiles = [];

function say(msg) {
  const node = $('[data-profile-status]');
  if (!node) return;
  // Clear before writing: an aria-live region that never empties re-announces
  // stale text on the next update (CLAUDE.md §11).
  node.textContent = '';
  if (msg) node.textContent = msg;
}

function render() {
  const list = $('[data-profile-list]');
  const empty = $('[data-profile-empty]');
  const banner = $('[data-lane-banner]');
  if (!list) return;

  if (banner) { banner.textContent = ''; banner.appendChild(buildLaneBanner(control)); }

  list.textContent = '';
  if (!profiles.length) {
    if (empty) { empty.hidden = false; empty.textContent = ''; empty.appendChild(buildEmptyState()); }
    return;
  }
  if (empty) empty.hidden = true;
  for (const p of profiles) list.appendChild(buildProfileCard(p, control));
}

async function onClick(ev) {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const card = btn.closest('[data-profile-id]');
  const id = card?.dataset.profileId;
  const profile = profiles.find((p) => p.id === id);
  if (!profile) return;

  if (btn.dataset.action === 'toggle') {
    const next = !profile.enabled;
    btn.disabled = true;
    const ok = await setSearchProfileEnabled(id, next);
    btn.disabled = false;
    if (!ok) { say('Could not change that search — please try again.'); return; }
    profile.enabled = next;
    render();
    say(next ? `“${profile.name}” is on.` : `“${profile.name}” is off.`);
    return;
  }

  if (btn.dataset.action === 'run') {
    const go = await confirmDialog({
      title: `Run “${profile.name}”?`,
      body: 'This starts a live search of Rightmove for this profile. Results appear within a few minutes.',
      confirmLabel: 'Run now',
    });
    if (!go) return;
    btn.disabled = true;
    say('Starting…');
    const res = await runSearchProfile(id);
    btn.disabled = false;
    // The RPC re-checks every switch server-side, so its message is authoritative
    // even when this page's cached view thought the run was allowed.
    say(res?.message || (res?.ok ? 'Search triggered.' : 'Could not start that search.'));
    if (res?.ok) { profile.last_run_at = new Date().toISOString(); render(); }
  }
}

async function init() {
  const list = $('[data-profile-list]');
  if (!list) return;
  list.addEventListener('click', onClick);

  [control, profiles] = await Promise.all([
    getFetchControl(),
    getSearchProfiles({ onUpdate: (rows) => { profiles = rows; render(); } }),
  ]);
  render();
}

document.addEventListener('shell:ready', init, { once: true });
