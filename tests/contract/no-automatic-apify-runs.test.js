// no-automatic-apify-runs.test.js — the rail for docs/adr/0012 (owner directive
// 2026-09-04): NO Apify run may start by itself. Every run needs a button press
// AND a confirmation.
//
// Three things must stay true, and each is pinned mechanically here so a future
// edit cannot quietly re-arm a schedule:
//   1. Every workflow that can spend Apify credit (the ones handed APIFY_TOKEN)
//      has exactly ONE trigger — workflow_dispatch. No schedule, no push, no
//      workflow_run, no repository_dispatch.
//   2. Every front-end path that dispatches a fetch goes through a native
//      <dialog> confirmation first (Listings "Pull", profile "Run now"), and the
//      admin switch that re-arms the scheduled dispatches (a) exists, (b) rests
//      OFF, and (c) confirms before switching ON.
//   3. The sentinel that would page the owner about "no automatic fetch ran"
//      reads the auto_fetch_enabled flag and stands down while it is off.
// The DB half (pg_cron jobs inactive, trigger_rightmove_fetch refusing while the
// flag is off, admin_set_auto_fetch_enabled) lives in migration history and is
// checked online at session start/end per CLAUDE.md §18.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const WF_DIR = join(ROOT, '.github/workflows');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** The `on:` block of a workflow, comments stripped: from the top-level `on:` line
 *  up to the next top-level key. Trigger names are the keys nested directly under it. */
function triggerKeys(src) {
  const lines = src.split('\n').map((l) => l.replace(/\s#.*$/, '').replace(/^#.*$/, ''));
  const start = lines.findIndex((l) => /^on:\s*(\[.*\])?\s*$/.test(l));
  if (start === -1) return null;
  const inline = lines[start].match(/^on:\s*\[(.*)\]/);
  if (inline) return inline[1].split(',').map((s) => s.trim()).filter(Boolean);
  const keys = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l)) break;                 // next top-level key
    const m = l.match(/^  ([A-Za-z_]+):/);    // exactly two-space indent = a trigger
    if (m) keys.push(m[1]);
  }
  return keys;
}

export async function register({ test, assert, assertEqual }) {
  const apifyWorkflows = readdirSync(WF_DIR)
    .filter((f) => f.endsWith('.yml'))
    .filter((f) => /APIFY_TOKEN/.test(readFileSync(join(WF_DIR, f), 'utf8')));

  test('no-auto-apify: at least the fetch + probe workflows are under this rail', () => {
    for (const f of ['fetch-listings.yml', 'probe-rightmove.yml', 'foundation-rural-thin.yml', 'import-apify-runs.yml']) {
      assert(apifyWorkflows.includes(f), `${f} must be handed APIFY_TOKEN and therefore be under this rail`);
    }
  });

  test('no-auto-apify: every Apify-capable workflow has workflow_dispatch as its ONLY trigger', () => {
    for (const f of apifyWorkflows) {
      const keys = triggerKeys(readFileSync(join(WF_DIR, f), 'utf8'));
      assert(keys, `${f}: could not find its on: block`);
      assertEqual(keys.join(','), 'workflow_dispatch',
        `${f}: triggers must be exactly [workflow_dispatch], found [${keys.join(', ')}] — no schedule/push/workflow_run may start an Apify run (docs/adr/0012)`);
    }
  });

  test('no-auto-apify: fetch-listings carries no schedule block and no slot gate at all', () => {
    const src = read('.github/workflows/fetch-listings.yml').replace(/^\s*#.*$/gm, '');
    assert(!/^\s*schedule:/m.test(src), 'a schedule: key anywhere in fetch-listings.yml re-arms automatic runs');
    assert(!/cron:/.test(src), 'no cron lines');
    assert(!/github\.event\.schedule/.test(src), 'the once-per-slot gate went with the schedule; do not resurrect one half');
  });

  test('no-auto-apify: pushing .github/probe-request.txt fires nothing', () => {
    const src = read('.github/workflows/probe-rightmove.yml').replace(/^\s*#.*$/gm, '');
    assert(!/paths:/.test(src) && !/^\s*push:/m.test(src), 'the probe workflow must not have a push/path trigger');
    assert(/fires NOTHING/.test(read('.github/probe-request.txt')), 'the request file must say so, or the next agent will "commit to run"');
  });

  test('no-auto-apify: the dispatch sentinel stands down while auto_fetch_enabled is false', () => {
    const src = read('.github/workflows/dispatch-sentinel.yml');
    assert(/fetch_control\?select=auto_fetch_enabled/.test(src), 'the sentinel must read fetch_control.auto_fetch_enabled');
    assert(/if: steps\.flag\.outputs\.auto == 'true'/.test(src), 'the 26h check runs only when automatic fetches are ON');
    assert(!/APIFY_TOKEN/.test(src), 'the sentinel never touches Apify');
  });

  test('no-auto-apify: every front-end dispatch path confirms first (native <dialog>)', () => {
    const pull = read('assets/js/listings/fetch.js');
    assert(/dlg\.showModal\(\)/.test(pull) && /if \(await confirmFetch\(days\)\) dispatch\(days\)/.test(pull),
      'Listings "Pull" buttons must dispatch only after the confirm dialog resolves true');
    const prof = read('assets/js/page-search-profiles.js');
    const runIdx = prof.indexOf("dataset.action === 'run'");
    assert(runIdx !== -1, 'profile page handles the run action');
    assert(/confirmDialog\(/.test(prof.slice(runIdx, runIdx + 600)), 'profile "Run now" must confirm before requesting a fetch');
  });

  test('no-auto-apify: the admin re-arm switch exists, rests OFF, and confirms before switching ON', () => {
    const view = read('assets/js/page-search-control/view.js');
    assert(/'data-action': 'toggle-auto'/.test(view), 'the Automatic fetches switch renders in the admin panel');
    assert(/control\?\.auto_fetch_enabled \? 'on' : 'off'/.test(view), 'OFF is the state whenever the flag is absent/false');
    const coord = read('assets/js/page-search-control.js');
    const at = coord.indexOf("action === 'toggle-auto'");
    assert(at !== -1, 'coordinator handles toggle-auto');
    const block = coord.slice(at, at + 900);
    assert(/if \(next && !\(await confirmDialog\(/.test(block), 'switching ON must ask; it is the spend decision');
    assert(/adminSetAutoFetchEnabled\(next\)/.test(block), 'and then call the RPC wrapper');
    const storage = read('assets/js/storage/user-state/search-profiles.js');
    assert(/rpc\('admin_set_auto_fetch_enabled', \{ p_enabled: enabled \}\)/.test(storage),
      'the wrapper targets the RPC that flips the flag AND the cron jobs together');
  });

  test('no-auto-apify: the fetcher itself still fails closed on the global gate', () => {
    // Belt and braces: even a manual dispatch is refused when fetch_enabled is off.
    const src = read('tools/fetch-listings.mjs');
    assert(/refusing to fetch \(spend gate fails closed\)/.test(src), 'fetch_control read failure must refuse, never proceed');
  });
}
