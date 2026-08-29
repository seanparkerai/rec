// page-search-control.js — coordinator for live-feed/search-control.html.
//
// The admin control plane. The admin account is a member of no household, so RLS
// cannot serve it; every read and write here goes through a SECURITY DEFINER RPC
// that self-checks the caller's email, the same pattern live_feed_stats() uses.
//
// Thin by design — the view builders are in page-search-control/view.js so the
// jsdom tests can import them without storage.js → supabase-client.js.

import {
  adminListSearchProfiles, adminSetProfilePaused, adminSetHouseholdPaused,
  adminSetFetchEnabled, adminSetLegacyEnabled,
} from './storage.js';
import { buildGlobalControls, buildHouseholdBlock, buildSummary } from './page-search-control/view.js';
import { confirmDialog } from './confirm-dialog.js';

const $ = (s) => document.querySelector(s);
let control = null;
let households = [];

function say(msg) {
  const n = $('[data-sc-status]');
  if (!n) return;
  n.textContent = '';           // clear first: a live region that never empties re-announces stale text
  if (msg) n.textContent = msg;
}

function render() {
  const g = $('[data-sc-globals]');
  const s = $('[data-sc-summary]');
  const h = $('[data-sc-households]');
  if (g) { g.textContent = ''; g.appendChild(buildGlobalControls(control)); }
  if (s) { s.textContent = ''; s.appendChild(buildSummary(households, control)); }
  if (h) {
    h.textContent = '';
    if (!households.length) { h.appendChild(document.createTextNode('No households.')); return; }
    for (const hh of households) h.appendChild(buildHouseholdBlock(hh, control));
  }
}

async function reload(msg) {
  const res = await adminListSearchProfiles();
  if (!res.ok) { say(res.message || 'Could not load.'); return; }
  control = res.control;
  households = res.households;
  render();
  if (msg) say(msg);
}

async function onClick(ev) {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  btn.disabled = true;
  let res;

  if (action === 'toggle-global') {
    const next = btn.dataset.enabled !== 'true';
    // Stopping everything is the one destructive-feeling action here, so it asks.
    // Resuming does not — the cost of an accidental resume is bounded by every
    // other switch still standing between it and a paid search.
    if (!next && !(await confirmDialog({
      title: 'Stop all searching?',
      body: 'This stops both lanes for every household. Nothing will run until it is switched back on.',
      confirmLabel: 'Stop everything',
      destructive: true,
    }))) { btn.disabled = false; return; }
    res = await adminSetFetchEnabled(next, next ? null : 'Paused from the admin panel');
  } else if (action === 'toggle-legacy') {
    res = await adminSetLegacyEnabled(btn.dataset.enabled !== 'true');
  } else if (action === 'toggle-household') {
    const id = btn.closest('[data-household-id]')?.dataset.householdId;
    res = await adminSetHouseholdPaused(id, btn.dataset.paused !== 'true');
  } else if (action === 'toggle-profile') {
    const id = btn.closest('[data-profile-id]')?.dataset.profileId;
    res = await adminSetProfilePaused(id, btn.dataset.paused !== 'true');
  } else {
    btn.disabled = false; return;
  }

  btn.disabled = false;
  if (!res?.ok) { say(res?.message || 'That change did not apply.'); return; }
  // Re-read rather than patching locally: these switches interact, and a stale
  // panel that misreports what is running is worse than a slower one.
  await reload('Updated.');
}

async function init() {
  const root = $('#main');
  if (!root) return;
  root.addEventListener('click', onClick);
  await reload();
}

document.addEventListener('shell:ready', init, { once: true });
