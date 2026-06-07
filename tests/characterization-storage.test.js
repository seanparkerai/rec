// characterization-storage.test.js — pins the observable, OFFLINE cache contract
// of storage.js (the Supabase + localStorage write-through layer). Regression
// baseline for the Phase 8 split: storage.js will be broken into storage/core.js
// + storage/<domain>.js behind a re-export shim, and these assertions must stay green.
//
// Network-free by construction: supabase-client.js is imported lazily and its CDN
// import fails under Node, so _initSb() resolves the client to `undefined` and every
// Supabase path no-ops (the background revalidation in _get is .catch()-guarded; the
// upsert in _save is try/catch-guarded internally). We therefore characterize only
// what is observable WITHOUT a network: key derivation, the localStorage
// read/write/remove round-trip, and the cache-first behaviour of the get/save pairs.

import { STORAGE_NS } from '../assets/js/config.js';

export async function register({ test, assert, assertEqual }) {
  // A Map-backed localStorage shim (Node has no DOM). Installed BEFORE importing
  // storage.js so its module-level helpers bind to it.
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
  };

  const S = await import('../assets/js/storage.js');
  const { key, readLocal, writeLocal, removeLocal } = S._internal;

  // ── _internal surface ───────────────────────────────────────────────────────
  await test('characterization/storage _internal exposes key/readLocal/writeLocal/removeLocal', () => {
    for (const fn of ['key', 'readLocal', 'writeLocal', 'removeLocal']) {
      assert(typeof S._internal[fn] === 'function', `_internal.${fn} should be a function`);
    }
  });

  // ── key derivation (namespacing) ────────────────────────────────────────────
  await test('characterization/storage key() namespaces as `${STORAGE_NS}:${k}`', () => {
    assertEqual(key('profile'), `${STORAGE_NS}:profile`);
  });

  await test('characterization/storage key() is deterministic and injective', () => {
    assertEqual(key('a'), key('a'));
    assert(key('a') !== key('b'), 'distinct inputs must yield distinct keys');
  });

  // ── localStorage round-trip ─────────────────────────────────────────────────
  await test('characterization/storage writeLocal→readLocal round-trips a structured value', () => {
    const val = { name: 'x', nested: [1, 2, { z: true }] };
    assertEqual(writeLocal('rt', val), true);
    assertEqual(JSON.stringify(readLocal('rt')), JSON.stringify(val));
  });

  await test('characterization/storage writeLocal stores under the namespaced key', () => {
    writeLocal('nskey', 123);
    assert(store.has(key('nskey')), 'raw store should hold an entry at key(nskey)');
  });

  await test('characterization/storage readLocal returns null for an unknown key', () => {
    assertEqual(readLocal('never-written'), null);
  });

  await test('characterization/storage readLocal tolerates corrupt JSON (returns null)', () => {
    store.set(key('bad'), '{ not valid json');
    assertEqual(readLocal('bad'), null);
  });

  await test('characterization/storage removeLocal clears the cached value', () => {
    writeLocal('temp', { a: 1 });
    removeLocal('temp');
    assertEqual(readLocal('temp'), null);
  });

  // ── write-through cache: save→get and cache-first get ───────────────────────
  // Supabase is unavailable under Node, so these exercise the localStorage path only.
  await test('characterization/storage saveProfile→getProfile round-trips via the cache', async () => {
    const profile = { name: 'Test', value: 42 };
    assertEqual(await S.saveProfile(profile), true);
    assertEqual(JSON.stringify(await S.getProfile()), JSON.stringify(profile));
  });

  await test('characterization/storage getFinances returns the cached value (cache-first)', async () => {
    writeLocal('finances', { spare: 7 });
    assertEqual(JSON.stringify(await S.getFinances()), JSON.stringify({ spare: 7 }));
  });

  await test('characterization/storage saveCriteria→getCriteria round-trips via the cache', async () => {
    const criteria = { beds: 3, areas: ['x', 'y'] };
    assertEqual(await S.saveCriteria(criteria), true);
    assertEqual(JSON.stringify(await S.getCriteria()), JSON.stringify(criteria));
  });

  // journey_progress has no seed JSON: empty cache + no Supabase → defaults to { tasks: {} }.
  await test('characterization/storage getJourneyProgress defaults to { tasks: {} } when empty', async () => {
    removeLocal('journey-progress');
    assertEqual(JSON.stringify(await S.getJourneyProgress()), JSON.stringify({ tasks: {} }));
  });

  await test('characterization/storage saveJourneyProgress→getJourneyProgress round-trips via the cache', async () => {
    const prog = { tasks: { 'finances.budget.1': true } };
    assertEqual(await S.saveJourneyProgress(prog), true);
    assertEqual(JSON.stringify(await S.getJourneyProgress()), JSON.stringify(prog));
  });
}
