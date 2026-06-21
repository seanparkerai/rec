// page-ask.js — Ask page coordinator (mirrors page-outreach.js). Boots on
// shell:ready, wires the transcript / composer / history modules, owns the
// in-memory message thread, streams answers via ask/client.js, and persists each
// completed exchange to Supabase via storage/ask.js. Read-only assistant.
import { askStream } from './ask/client.js';
import { createTranscript } from './ask/transcript.js';
import { createComposer } from './ask/composer.js';
import { createHistory } from './ask/history.js';
import { createCompose } from './ask/compose.js';
import { createMessages } from './ask/messages.js';
import { getAskConversation, createAskConversation, saveAskConversation } from './storage.js';

const $ = (id) => document.getElementById(id);

const state = {
  messages: [],        // [{ role:'user'|'assistant', content }]
  conversationId: null,
  controller: null,
};

let transcript;
let composer;
let compose;
let emptyEl;
// When a compose turn ends with a clarifying question (no draft yet), carry the
// compose model onto the user's next reply so the draft itself lands on Sonnet.
let composeCarry = null;

function setEmptyVisible(visible) {
  if (emptyEl) emptyEl.hidden = !visible;
}

function resetThread() {
  state.messages = [];
  state.conversationId = null;
  composeCarry = null;
  if (state.controller) { state.controller.abort(); state.controller = null; }
  transcript.clear();
  setEmptyVisible(true);
  composer.setStreaming(false);
  composer.focus();
}

async function loadConversation(id) {
  const convo = await getAskConversation(id);
  if (!convo) return;
  state.conversationId = convo.id;
  state.messages = Array.isArray(convo.messages)
    ? convo.messages.filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    : [];
  transcript.clear();
  setEmptyVisible(state.messages.length === 0);
  for (const m of state.messages) {
    if (m.role === 'user') { transcript.appendUser(m.content); continue; }
    const node = transcript.appendAssistant(m.content, m.tools || []);
    // Re-hydrate a saved outreach draft as an actionable card.
    compose?.maybeRenderDraft({ ...node, text: m.content });
  }
}

async function persist() {
  const title = deriveTitle();
  if (!state.conversationId) {
    const row = await createAskConversation(title, state.messages);
    if (row?.id) state.conversationId = row.id;
  } else {
    await saveAskConversation(state.conversationId, { title, messages: state.messages });
  }
}

function deriveTitle() {
  const firstUser = state.messages.find((m) => m.role === 'user');
  const t = (firstUser?.content || 'New chat').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

async function send(text, opts = {}) {
  setEmptyVisible(false);
  // A plain typed reply inherits the carried compose model (clarifying-question round).
  const carried = composeCarry;
  composeCarry = null;
  const model = opts.model || carried?.model;
  const maxTokens = opts.maxTokens || carried?.maxTokens;

  state.messages.push({ role: 'user', content: text });
  transcript.appendUser(text);

  const assistant = transcript.beginAssistant();
  composer.setStreaming(true);
  state.controller = new AbortController();

  // The stream is stateless: send only the text turns (no stored tool blocks).
  const wire = state.messages.map((m) => ({ role: m.role, content: m.content }));

  let finished = null;
  try {
    for await (const ev of askStream(wire, { signal: state.controller.signal, model, max_tokens: maxTokens })) {
      if (ev.type === 'text') assistant.token(ev.text);
      else if (ev.type === 'tool') assistant.tool(ev.name);
      else if (ev.type === 'done') finished = assistant.end();
      else if (ev.type === 'error') finished = assistant.error(ev.message);
    }
  } catch {
    finished = assistant.error('Something went wrong. Please try again.');
  }

  if (!finished) finished = assistant.end(); // stream closed without an explicit terminal event
  composer.setStreaming(false);
  state.controller = null;

  // Upgrade an outreach-draft block to an actionable, editable card.
  const rendered = compose?.maybeRenderDraft(finished);
  // Compose turn but no draft yet (the model asked something) → keep Sonnet next turn.
  if (model && !rendered) composeCarry = { model, maxTokens };

  // Record the assistant turn (text + the tools it used) and persist the thread.
  if (finished.text.trim() || finished.tools.length) {
    state.messages.push({ role: 'assistant', content: finished.text, tools: finished.tools });
    await persist();
  }
}

function stop() {
  if (state.controller) { state.controller.abort(); state.controller = null; }
  composer.setStreaming(false);
}

function init() {
  const transcriptEl = $('ask-transcript');
  if (!transcriptEl) return; // not the Ask page
  emptyEl = $('ask-empty');

  transcript = createTranscript(transcriptEl);
  composer = createComposer(
    { form: $('ask-composer'), textarea: $('ask-input'), sendBtn: $('ask-send'), stopBtn: $('ask-stop'), chips: $('ask-empty') },
    { onSubmit: send, onStop: stop },
  );
  createHistory(
    { openBtn: $('ask-history-open'), dialog: $('ask-history'), listEl: $('ask-history-list'), newBtn: $('ask-new'), closeBtn: $('ask-history-close') },
    { onSwitch: loadConversation, onNew: resetThread, getCurrentId: () => state.conversationId },
  );

  const composeDialog = $('ask-compose');
  if (composeDialog) {
    compose = createCompose(
      {
        dialog: composeDialog,
        form: $('ask-compose-form'),
        openButtons: [$('ask-compose-open'), $('ask-compose-open-empty')],
        draftTemplate: $('ask-draft-card'),
      },
      send,
    );
  }

  const messagesDialog = $('ask-messages');
  if (messagesDialog) {
    createMessages({
      dialog: messagesDialog,
      logEl: $('ask-messages-log'),
      contactsEl: $('ask-messages-contacts'),
      openButtons: [$('ask-messages-open')],
      closeBtn: $('ask-messages-close'),
    });
  }

  setEmptyVisible(true);
  composer.focus();
}

document.addEventListener('shell:ready', init);
if (document.readyState !== 'loading') {
  setTimeout(init, 0);
} else {
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
}
