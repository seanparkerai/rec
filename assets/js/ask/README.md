# ask/ — Ask AI-assistant page support

**Domain:** Chat UI, transcript rendering, message composition, and conversation history management for the Ask feature (Claude via Edge Function).

**Naming convention:** Each module owns one UI surface: `client.js` (streaming transport), `transcript.js` (bubble rendering + live-update), `composer.js` (input box), `history.js` (conversation list dialog).

**Entry points & architecture:**
- `client.js` — sends messages to the Edge Function, returns an async event iterator (`type: 'text' | 'tool' | 'done' | 'error'`). Authenticated via Supabase JWT; no Anthropic key in the browser.
- `transcript.js` — renders user/assistant bubbles, streams token insertion into the assistant's live region, shows tool-use status. Uses ESCAPE-FIRST markdown rendering (mdToSafeHtml) so streamed model output cannot inject HTML.
- `composer.js` — textarea with auto-size, Enter-to-send (Shift+Enter = newline), send/stop toggle, and suggestion chips. Respects offline state.
- `history.js` — opens a native `<dialog>` listing saved threads, switch/rename/delete actions, and "New chat" button.

**Key constraint:** Page coordinator wires these together and manages the session. All modules assume Supabase auth is active and the Edge Function URL is live.

**Live file list:** `find assets/js/ask -name '*.js' | sort`

See docs/REPO_MAP.md for the whole-repo map.
