// ask-conversations-cache.test.js — overhaul 9.3 (R3): the conversation-LIST
// stale-while-revalidate cache in storage/ask.js, through the real module via
// the __REC_TEST_SB__ seam. The cache covers ONLY the id/title/updated_at index
// (bounded); message bodies stay live-fetch by design (unbounded rows).
import { MockSupabaseClient } from '../mocks/supabase-client.js';

const HID = 'house-001';
const SESSION = { user: { id: 'user-001', email: 'test@example.com' }, access_token: 't' };

const tick = () => new Promise((r) => setTimeout(r, 0));

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

function convo(id, title, updated_at) {
  return { household_id: HID, id, title, updated_at, messages: [] };
}

async function load({ conversations = [], session = SESSION } = {}) {
  installLocalStorage();
  const core = await import('../../assets/js/storage/core.js');
  core._resetStorageForTests();
  core._internal.removeLocal('ask-conversations-list');
  core._internal.removeLocal('pending-writes');
  globalThis.__REC_TEST_SB__ = new MockSupabaseClient({
    household_members: [{ user_id: 'user-001', household_id: HID }],
    ask_conversations: conversations,
  }, { session });
  const ask = await import('../../assets/js/storage/ask.js');
  return { core, ask };
}

export async function register({ test, assert, assertEqual }) {
  test('ask-cache (9.3): first list fetches, returns rows, and seeds the cache', async () => {
    const { core, ask } = await load({ conversations: [convo('c1', 'Chat one', '2026-07-01')] });
    const list = await ask.listAskConversations();
    assertEqual(list.length, 1);
    assertEqual(list[0].title, 'Chat one');
    const cached = core._internal.readLocal('ask-conversations-list');
    assertEqual(cached?.[0]?.id, 'c1', 'list cached after first fetch');
  });

  test('ask-cache (9.3): cached list served instantly; onUpdate fires when the server copy differs', async () => {
    const { core, ask } = await load({ conversations: [convo('c1', 'Renamed on server', '2026-07-02')] });
    core._internal.writeLocal('ask-conversations-list', [{ id: 'c1', title: 'Old title', updated_at: '2026-07-01' }]);
    let updated = null;
    const list = await ask.listAskConversations((fresh) => { updated = fresh; });
    assertEqual(list[0].title, 'Old title', 'cache served first');
    await tick(); await tick();
    assertEqual(updated?.[0]?.title, 'Renamed on server', 'onUpdate delivered the fresh list');
    assertEqual(core._internal.readLocal('ask-conversations-list')[0].title, 'Renamed on server', 'cache refreshed');
  });

  test('ask-cache (9.3): fetch failure (no session) serves the cache and never clobbers it with []', async () => {
    const { core, ask } = await load({ session: null });
    core._internal.writeLocal('ask-conversations-list', [{ id: 'c1', title: 'Kept', updated_at: '2026-07-01' }]);
    let updated = null;
    const list = await ask.listAskConversations((fresh) => { updated = fresh; });
    assertEqual(list[0].title, 'Kept');
    await tick(); await tick();
    assertEqual(core._internal.readLocal('ask-conversations-list')[0].title, 'Kept', 'cache intact after failed revalidation');
    assertEqual(updated, null, 'no onUpdate on failure');
  });

  test('ask-cache (9.3): no cache + no session returns [] (legacy failure shape preserved)', async () => {
    const { ask } = await load({ session: null });
    const list = await ask.listAskConversations();
    assertEqual(Array.isArray(list), true);
    assertEqual(list.length, 0);
  });

  test('ask-cache (9.3): create/rename/delete invalidate the cached list', async () => {
    const { core, ask } = await load({ conversations: [convo('c1', 'Chat', '2026-07-01')] });
    // create
    core._internal.writeLocal('ask-conversations-list', [{ id: 'c1' }]);
    await ask.createAskConversation('New chat', []);
    assertEqual(core._internal.readLocal('ask-conversations-list'), null, 'create invalidates');
    // rename/save
    core._internal.writeLocal('ask-conversations-list', [{ id: 'c1' }]);
    await ask.saveAskConversation('c1', { title: 'Renamed' });
    assertEqual(core._internal.readLocal('ask-conversations-list'), null, 'save invalidates');
    // delete
    core._internal.writeLocal('ask-conversations-list', [{ id: 'c1' }]);
    await ask.deleteAskConversation('c1');
    assertEqual(core._internal.readLocal('ask-conversations-list'), null, 'delete invalidates');
  });

  test('ask-cache (9.3): message bodies stay live-fetch — getAskConversation never reads or writes the list cache', async () => {
    const { core, ask } = await load({ conversations: [convo('c1', 'Chat', '2026-07-01')] });
    const got = await ask.getAskConversation('c1');
    assertEqual(got?.id, 'c1');
    assertEqual(core._internal.readLocal('ask-conversations-list'), null, 'no cache side effects from a body fetch');
  });
}
