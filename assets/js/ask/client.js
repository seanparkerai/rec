// ask/client.js — transport for the Ask Edge Function. Sends the prior
// user/assistant TEXT turns + the new question, parses the SSE response into an
// async iterator of lifecycle events ({ type:'text'|'tool'|'done'|'error' }),
// and exposes an AbortController-driven stop. No Anthropic key here — the call
// is authenticated with the user's Supabase session JWT (Ask plan §7).
import { supabase } from '../supabase-client.js';

const FN_URL = 'https://qxmyrahqsopmaeokxdub.supabase.co/functions/v1/ask';

/**
 * Stream an answer for `messages` (array of { role:'user'|'assistant', content }).
 * Yields events: {type:'text',text} · {type:'tool',name} · {type:'done',usage} ·
 * {type:'error',message}. The caller may pass an AbortSignal to stop early.
 */
export async function* askStream(messages, { model, signal } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { yield { type: 'error', message: 'You are signed out — please sign in again.' }; return; }

  let res;
  try {
    res = await fetch(FN_URL, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages, ...(model ? { model } : {}) }),
    });
  } catch (e) {
    if (e?.name === 'AbortError') return;
    yield { type: 'error', message: 'Could not reach the assistant. Check your connection.' };
    return;
  }

  if (!res.ok || !res.body) {
    let message = `The assistant returned an error (${res.status}).`;
    try { const j = await res.json(); if (j?.error) message = j.error; } catch { /* not JSON */ }
    yield { type: 'error', message };
    return;
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try { yield JSON.parse(payload); } catch { /* skip malformed frame */ }
      }
    }
  } catch (e) {
    if (e?.name !== 'AbortError') yield { type: 'error', message: 'The connection was interrupted.' };
  }
}
