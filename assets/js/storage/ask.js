// storage/ask.js — persistence for the Ask feature's chat threads
// (ask_conversations table, user-state class per CLAUDE.md §18.1). Unlike the
// blob-cached user-state tables, conversations are individual relational rows,
// so these go straight to Supabase (RLS-scoped) rather than through the
// localStorage write-through cache. Re-exported by storage.js via `export *`.
import { _initSb, _getHid, readLocal, writeLocal, removeLocal } from './core.js';

// Generated row types (9.7 / R4): type-only JSDoc imports from types/supabase.d.ts —
// regenerated from the live schema after every migration (docs/SUPABASE_SYNC.md).
/** @typedef {import('../../../types/supabase.js').Database['public']['Tables']['ask_conversations']} AskConversationsTable */
/** @typedef {AskConversationsTable['Row']} AskConversationRow */
/** @typedef {Pick<AskConversationRow, 'id' | 'title' | 'updated_at'>} AskConversationListItem */
/** @typedef {Pick<AskConversationRow, 'id' | 'title' | 'messages' | 'created_at' | 'updated_at'>} AskConversation */

// Conversation LIST cache (overhaul 9.3 / R3): stale-while-revalidate over the
// id/title/updated_at index ONLY — bounded and cheap. Full message bodies stay
// live-fetch by design: conversations are unbounded relational rows, and caching
// them all risks the localStorage quota for no render-path win (the transcript
// is only ever opened one conversation at a time).
const LIST_KEY = 'ask-conversations-list';
const _invalidateListCache = () => removeLocal(LIST_KEY);

// Network fetch of the list; null means "couldn't fetch" (so callers never
// mistake a failure for an empty list and clobber the cache with []).
/** @returns {Promise<AskConversationListItem[] | null>} */
async function _fetchConversationList() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  try {
    const { data, error } = await sb
      .from('ask_conversations')
      .select('id, title, updated_at')
      .eq('household_id', hid)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } catch (e) {
    console.error('storage: list ask_conversations', e.message);
    return null;
  }
}

// List the household's conversations, newest first (id + title + timestamp only).
// Cache-first: a cached list renders instantly and is revalidated in the
// background; onUpdate(fresh) fires if the server copy differs.
/**
 * @param {(fresh: AskConversationListItem[]) => void} [onUpdate]
 * @returns {Promise<AskConversationListItem[]>}
 */
export async function listAskConversations(onUpdate) {
  const cached = readLocal(LIST_KEY);
  if (cached !== null) {
    _fetchConversationList().then((fresh) => {
      if (fresh === null) return;
      if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
        writeLocal(LIST_KEY, fresh);
        if (onUpdate) onUpdate(fresh);
      }
    }).catch(() => { /* ignore */ });
    return cached;
  }
  const fresh = await _fetchConversationList();
  if (fresh === null) return [];
  writeLocal(LIST_KEY, fresh);
  return fresh;
}

// Fetch one conversation's full record (incl. messages).
/**
 * @param {string} id
 * @returns {Promise<AskConversation | null>}
 */
export async function getAskConversation(id) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid || !id) return null;
  try {
    const { data, error } = await sb
      .from('ask_conversations')
      .select('id, title, messages, created_at, updated_at')
      .eq('household_id', hid)
      .eq('id', id)
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  } catch (e) {
    console.error('storage: get ask_conversation', e.message);
    return null;
  }
}

// Create a new conversation; returns the inserted row (with its generated id) or null.
/**
 * @param {string} [title]
 * @param {AskConversationRow['messages']} [messages]
 * @returns {Promise<AskConversation | null>}
 */
export async function createAskConversation(title = 'New chat', messages = []) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
  _invalidateListCache(); // the cached index is about to be wrong (9.3)
  try {
    const { data, error } = await sb
      .from('ask_conversations')
      .insert({ household_id: hid, title, messages })
      .select('id, title, messages, created_at, updated_at')
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  } catch (e) {
    console.error('storage: create ask_conversation', e.message);
    return null;
  }
}

// Update an existing conversation's title and/or messages.
/**
 * @param {string} id
 * @param {{ title?: string, messages?: AskConversationRow['messages'] }} [changes]
 * @returns {Promise<boolean>}
 */
export async function saveAskConversation(id, { title, messages } = {}) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid || !id) return false;
  /** @type {AskConversationsTable['Update']} */
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (messages !== undefined) patch.messages = messages;
  if (!Object.keys(patch).length) return true;
  _invalidateListCache(); // titles/timestamps in the cached index change (9.3)
  try {
    const { error } = await sb
      .from('ask_conversations')
      .update(patch)
      .eq('household_id', hid)
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('storage: save ask_conversation', e.message);
    return false;
  }
}

// Delete a conversation.
/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteAskConversation(id) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid || !id) return false;
  _invalidateListCache(); // the cached index is about to be wrong (9.3)
  try {
    const { error } = await sb
      .from('ask_conversations')
      .delete()
      .eq('household_id', hid)
      .eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('storage: delete ask_conversation', e.message);
    return false;
  }
}
