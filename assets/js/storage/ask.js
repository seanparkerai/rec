// storage/ask.js — persistence for the Ask feature's chat threads
// (ask_conversations table, user-state class per CLAUDE.md §18.1). Unlike the
// blob-cached user-state tables, conversations are individual relational rows,
// so these go straight to Supabase (RLS-scoped) rather than through the
// localStorage write-through cache. Re-exported by storage.js via `export *`.
import { _initSb, _getHid } from './core.js';

// List the household's conversations, newest first (id + title + timestamp only).
export async function listAskConversations() {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return [];
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
    return [];
  }
}

// Fetch one conversation's full record (incl. messages).
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
export async function createAskConversation(title = 'New chat', messages = []) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return null;
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
export async function saveAskConversation(id, { title, messages } = {}) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid || !id) return false;
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (messages !== undefined) patch.messages = messages;
  if (!Object.keys(patch).length) return true;
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
export async function deleteAskConversation(id) {
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid || !id) return false;
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
