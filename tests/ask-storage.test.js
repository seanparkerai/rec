// tests/ask-storage.test.js — offline shape test for the ask_conversations
// user-state table (Ask feature). Mirrors the sync-test pattern: it asserts the
// table is registered + classified in the sync snapshot, and that the schema
// validator (tests/schemas.js#validateAskConversation) enforces the persisted
// message shape. Node-only; wired into run-intelligence-tests.mjs.
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAskConversation } from './schemas.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function register({ test, assert, assertEqual }) {
  test('ask-storage: ask_conversations is tracked + classified user-state in the snapshot', async () => {
    const snap = JSON.parse(await readFile(resolve(root, 'data/snapshots/sync-state.json'), 'utf8'));
    assert('ask_conversations' in snap, 'snapshot missing ask_conversations');
    assertEqual(snap.ask_conversations._class, 'user-state');
    assert('count' in snap.ask_conversations, 'ask_conversations missing count');
  });

  test('ask-storage: a well-formed conversation row passes the validator', () => {
    const row = {
      id: 'c-123', title: 'Affordability near Winchester',
      messages: [
        { role: 'user', content: 'What is my stretch payment?', ts: '2026-06-15T08:00:00Z' },
        { role: 'assistant', content: 'Your stretch monthly payment is about £1,850.', ts: '2026-06-15T08:00:04Z' },
      ],
    };
    assertEqual(validateAskConversation(row).length, 0);
  });

  test('ask-storage: a bad role / non-string content is rejected', () => {
    const bad = {
      id: 'c-9', title: 'x',
      messages: [{ role: 'tool', content: { blocks: [] } }],
    };
    const errors = validateAskConversation(bad);
    assert(errors.length >= 2, `expected role + content errors, got ${JSON.stringify(errors)}`);
  });

  test('ask-storage: a missing id is rejected', () => {
    const errors = validateAskConversation({ title: 'x', messages: [] });
    assert(errors.some((e) => /id/.test(e)), 'should flag missing id');
  });
}
