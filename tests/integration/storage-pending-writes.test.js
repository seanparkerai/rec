// storage-pending-writes.test.js — overhaul 9.1 (R2a): the failed-write journal
// + the revalidation clobber guard, exercised through the REAL core.js paths
// under Node via the __REC_TEST_SB__ seam.
//
// The defect this pins against (found at Phase-9 entry): _save() writes
// localStorage then fires-and-forgets _sbUpsert. When that upsert failed, the
// newest value existed ONLY in the local cache — and the next _get()
// revalidation overwrote the cache with the stale Supabase row, silently
// reverting the user's edit on screen. The journal records unconfirmed writes
// per table; revalidation holds off while one exists. Draining (retry) is 9.2.
import { MockSupabaseClient } from '../mocks/supabase-client.js';

const HID = 'house-001';
const SESSION = { user: { id: 'user-001', email: 'test@example.com' }, access_token: 't' };

const tick = () => new Promise((r) => setTimeout(r, 0));

// Map-backed localStorage shim (Node has no DOM) — same pattern as
// characterization-storage.test.js; installed before core.js helpers run.
function installLocalStorage() {
  if (globalThis.localStorage?.__recShim) return;
  const store = new Map();
  globalThis.localStorage = {
    __recShim: true,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
  };
}

async function loadCore({ serverProfile = null, failWrites = [], session = SESSION } = {}) {
  installLocalStorage();
  const core = await import('../../assets/js/storage/core.js');
  core._resetStorageForTests();
  core._internal.removeLocal('profile');
  core._internal.removeLocal('pending-writes');
  const tables = { household_members: [{ user_id: 'user-001', household_id: HID }] };
  if (serverProfile !== null) tables.profile = [{ household_id: HID, data: serverProfile }];
  globalThis.__REC_TEST_SB__ = new MockSupabaseClient(tables, { session, failWrites });
  return core;
}

export async function register({ test, assert, assertEqual }) {
  test('pending-writes (9.1): successful save — local write, upsert recorded, journal stays empty', async () => {
    const core = await loadCore();
    await core._save('profile', 'profile', { v: 'local' });
    await tick(); await tick(); // let the fire-and-forget upsert settle
    assertEqual(core._internal.readLocal('profile').v, 'local');
    const up = globalThis.__REC_TEST_SB__.writes.find((w) => w.table === 'profile' && w.op === 'upsert');
    assert(up, 'upsert reached the client');
    assertEqual(Object.keys(core._internal.readPendingWrites()).length, 0, 'no journal entry on success');
  });

  test('pending-writes (9.1): failed upsert journals {table, value, queuedAt}; _save still returns true (fire-and-forget pinned)', async () => {
    const core = await loadCore({ failWrites: ['profile'] });
    const ok = await core._save('profile', 'profile', { v: 'edited' });
    assertEqual(ok, true, '_save stays fire-and-forget: local write succeeds even when sync fails');
    await tick(); await tick();
    assertEqual(core._internal.readLocal('profile').v, 'edited', 'localStorage keeps the edit');
    const entry = core._internal.readPendingWrites().profile;
    assert(entry, 'failed write journalled under its table name');
    assertEqual(entry.value.v, 'edited');
    assert(typeof entry.queuedAt === 'string' && !Number.isNaN(Date.parse(entry.queuedAt)), 'queuedAt is a timestamp');
  });

  test('pending-writes (9.1): revalidation does NOT clobber the cache while a write is pending (the silent-revert fix)', async () => {
    const core = await loadCore({ serverProfile: { v: 'stale-server' }, failWrites: ['profile'] });
    await core._save('profile', 'profile', { v: 'newest-local' });
    await tick(); await tick(); // journal the failed upsert
    let updated = null;
    const got = await core._get('profile', 'profile', null, (fresh) => { updated = fresh; });
    assertEqual(got.v, 'newest-local', 'cache is returned');
    await tick(); await tick(); // let revalidation settle
    assertEqual(core._internal.readLocal('profile').v, 'newest-local', 'stale server row must not overwrite the pending edit');
    assertEqual(updated, null, 'onUpdate must not fire with the stale row');
  });

  test('pending-writes (9.1): without a pending write, revalidation still updates the cache from the server (existing behaviour preserved)', async () => {
    const core = await loadCore({ serverProfile: { v: 'server-fresh' } });
    core._internal.writeLocal('profile', { v: 'older-cache' });
    let updated = null;
    const got = await core._get('profile', 'profile', null, (fresh) => { updated = fresh; });
    assertEqual(got.v, 'older-cache', 'cache served first');
    await tick(); await tick();
    assertEqual(core._internal.readLocal('profile').v, 'server-fresh', 'divergent server row refreshes the cache');
    assertEqual(updated?.v, 'server-fresh', 'onUpdate fires with the fresh row');
  });

  test('pending-writes (9.1): a later successful write clears the table’s journal entry (latest value per table wins)', async () => {
    const core = await loadCore();
    core._internal.writeLocal('pending-writes', { profile: { value: { v: 'old-failed' }, queuedAt: '2026-07-03T00:00:00Z' } });
    await core._sbUpsert('profile', { v: 'newer-succeeds' });
    assertEqual(Object.keys(core._internal.readPendingWrites()).length, 0, 'journal cleared by the successful write');
  });

  test('pending-writes (9.1): no session (offline bootstrap) — the write is journalled, not dropped', async () => {
    const core = await loadCore({ session: null });
    await core._sbUpsert('profile', { v: 'offline-edit' });
    const entry = core._internal.readPendingWrites().profile;
    assert(entry, 'write held in the journal when household_id is unavailable');
    assertEqual(entry.value.v, 'offline-edit');
  });

  // ── 9.2 — the retry drain ──────────────────────────────────────────────────

  test('pending-writes (9.2): drain flushes journalled writes and empties the journal (offline → online round trip)', async () => {
    // Go "offline": journal two failed writes.
    let core = await loadCore({ failWrites: ['profile', 'criteria'] });
    await core._sbUpsert('profile', { v: 'edit-1' });
    await core._sbUpsert('criteria', { v: 'edit-2' });
    assertEqual(Object.keys(core._internal.readPendingWrites()).length, 2, 'both writes journalled while offline');
    // Come back "online": same journal (shared localStorage), a client that accepts writes.
    globalThis.__REC_TEST_SB__ = new MockSupabaseClient(
      { household_members: [{ user_id: 'user-001', household_id: HID }] }, { session: SESSION });
    core._resetStorageForTests();
    const { attempted, remaining } = await core.drainPendingWrites();
    assertEqual(attempted, 2);
    assertEqual(remaining, 0, 'journal empty after the drain');
    const drained = globalThis.__REC_TEST_SB__.writes.filter((w) => w.op === 'upsert').map((w) => w.table).sort();
    assertEqual(drained.join(','), 'criteria,profile', 'both journalled values reached the client');
  });

  test('pending-writes (9.2): still-failing writes stay journalled (drain is safe to repeat)', async () => {
    const core = await loadCore({ failWrites: ['profile'] });
    await core._sbUpsert('profile', { v: 'edit' });
    const { attempted, remaining } = await core.drainPendingWrites();
    assertEqual(attempted, 1);
    assertEqual(remaining, 1, 'failed retry keeps the entry for the next drain');
    assertEqual(core._internal.readPendingWrites().profile.value.v, 'edit');
  });

  test('pending-writes (9.2): drain is single-flight — concurrent calls share one pass', async () => {
    const core = await loadCore({ failWrites: ['profile'] });
    await core._sbUpsert('profile', { v: 'edit' });
    const [a, b] = await Promise.all([core.drainPendingWrites(), core.drainPendingWrites()]);
    assert(a === b || (a.attempted === b.attempted && a.remaining === b.remaining),
      'concurrent drains resolve to the same pass');
  });

  test('pending-writes (9.2): drain with an empty journal is a no-op', async () => {
    const core = await loadCore();
    const { attempted, remaining } = await core.drainPendingWrites();
    assertEqual(attempted, 0);
    assertEqual(remaining, 0);
    assertEqual(globalThis.__REC_TEST_SB__.writes.length, 0, 'no writes fired');
  });
}
