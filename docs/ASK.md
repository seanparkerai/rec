# ASK.md — the Ask assistant (operating guide)

The **Ask** page (`pages/ask.html`) is a natural-language assistant over the household's own data:
finances, budget, saved homes, live listings, areas, trends, and outreach-message drafting. Answers
are produced by **Claude (Anthropic API)**, called from a **Supabase Edge Function** so the API key
never reaches the browser. This doc explains how it fits together, how to deploy it, and the cost /
safety envelope. Build plan of record: the "Ask" implementation plan (handed to Claude Code).

---

## 1. Architecture (how a question is answered)

```
Browser (pages/ask.html)            Edge Function "ask"                 Anthropic API
 ───────────────────────            ───────────────────                 ─────────────
 user types a question
   → POST /functions/v1/ask         1. verify the user's JWT (401 if none)
     Authorization: Bearer <JWT>    2. resolve household_id (RLS-scoped)
     body { messages, model }       3. build prompt-cached system prompt
                                     4. call Claude with read-only tools + stream
   ← SSE: {type:text|tool|done}     5. tool loop (≤6): run RLS-scoped tool,
 render streamed markdown              feed tool_result back, continue
 persist thread → ask_conversations  6. relay text deltas as SSE; terminal done/error
```

- **Stateless function.** The browser sends the prior user/assistant **text** turns + the new
  question each request; the function stores no conversation state and re-runs tools per turn, so
  answers always reflect current data.
- **The browser owns persistence** (`assets/js/storage/ask.js` → `ask_conversations`), exactly like
  every other user-state write (CLAUDE.md §18.4). The function only **reads**.
- **Tools, not a context dump.** Claude fetches just what a question needs (e.g. filtered listings),
  keeping cost down and stopping the model inventing figures.

## 2. Files

| File | Role |
|---|---|
| `supabase/functions/ask/index.ts` | Edge Function: CORS, JWT verify, household resolve, system-prompt build, Anthropic call, tool loop, SSE relay. |
| `supabase/functions/ask/tools.ts` | Tool **definitions** + **executors** (RLS-scoped Supabase queries over the pure helpers). |
| `supabase/functions/ask/pure.js` | **Pure** helpers (listing filter/rank/gate, area search, finance summary, outreach fill). Imported by both Deno (tools.ts) and Node (`tests/ask-tools.test.js`). |
| `supabase/functions/ask/prompt.ts` | System-prompt builder: cached static domain block + dynamic always-on context. |
| `supabase/functions/_shared/cors.ts` | Origin allow-list. |
| `assets/js/page-ask.js` | Page coordinator (boots on `shell:ready`). |
| `assets/js/ask/client.js` | Calls the function; parses the SSE stream into an async iterator. |
| `assets/js/ask/transcript.js` | Renders bubbles; escape-first markdown; "sources used" line; live region. |
| `assets/js/ask/composer.js` | Input box: autosize, Enter-to-send, Send/Stop, chips, offline guard. |
| `assets/js/ask/history.js` | Conversation list (new / switch / rename / delete) via `<dialog>`. |
| `assets/js/storage/ask.js` | `list/get/create/save/delete AskConversation` (re-exported by `storage.js`). |
| `assets/css/pages/ask.css` | Chat UI (tokens only; imported by `dashboard.css`). |
| `tests/ask-tools.test.js` | Unit tests for the pure helpers. |
| `tests/ask-storage.test.js` | Offline `ask_conversations` snapshot-shape test. |

## 3. The tool catalogue

All tools are **read-only** and **household-scoped** (RLS + an explicit `household_id` filter, except
the global public-read `listings` table). Defined in `tools.ts`; pure logic in `pure.js`.

`get_finances_detail` · `get_budget_breakdown` · `query_listings` (ranked, with fit verdicts —
never the whole table) · `get_listing` · `get_saved_properties` · `get_reactions_summary` ·
`search_areas` · `get_area` · `get_household_areas` · `get_trends` · `get_journey_status` ·
`get_outreach_templates` · `draft_outreach` (returns text only — never sends).

The small, always-relevant context (criteria, finances summary, profile basics, shortlist size,
selected areas) is injected into the system prompt so trivial questions need zero tool calls.

## 4. Deploy / redeploy (admin)

The function source is version-controlled here; **do not hand-edit it in the Supabase dashboard**
(the dashboard editor has no version control). Deploy from the repo.

1. **Anthropic key** — create an API key in the Anthropic Console; set a monthly spend cap + alert.
2. **Set the secret** (never commit it):
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
   # optional: override where templates are fetched from
   supabase secrets set OUTREACH_TEMPLATES_URL=https://georgianrectory.com/data/outreach-templates.json
   ```
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided to the function automatically.
3. **Deploy:**
   ```bash
   supabase functions deploy ask
   ```
   (or, from Claude Code, the Supabase MCP `deploy_edge_function`.)
4. **Smoke test** — from the browser console on the live, signed-in site:
   ```js
   const { data:{ session } } = await (await import('/assets/js/supabase-client.js')).supabase.auth.getSession();
   const r = await fetch('https://qxmyrahqsopmaeokxdub.supabase.co/functions/v1/ask', {
     method:'POST',
     headers:{ Authorization:'Bearer '+session.access_token, 'Content-Type':'application/json' },
     body: JSON.stringify({ messages:[{ role:'user', content:'What is my deposit gap?' }] }),
   });
   console.log(r.status); // 200; signed-out → 401
   ```

## 5. Cost & safety envelope

- **Auth required** — anonymous calls get 401; only household members can ask, only about their own
  household (RLS forwards the caller's JWT).
- **Read-only** — no tool mutates user state; `draft_outreach` returns text only.
- **Secret hygiene** — `ANTHROPIC_API_KEY` is a Supabase secret; never in the repo, browser, or a URL.
- **Prompt-injection** — listing/area text is treated as data, not instructions; tools are read-only,
  so injection cannot escalate to writes or key exposure. Streamed markdown is rendered through an
  escape-first sanitiser (`transcript.js#mdToSafeHtml`).
- **Spend bounds** — `MAX_TOKENS` (1024, a runaway backstop behind the system-prompt brevity
  contract), tool-loop cap (6), history cap (24 turns) + per-turn char cap (16k), prompt caching on
  the static block (~90% cheaper repeats), token-usage logging (now incl. `cache_read` / `cache_write`
  / `thinking` so the cache hit-rate is visible), plus the Anthropic Console hard cap. A typical data
  Q&A turn is a fraction of a cent on Haiku. Haiku 4.5 ≈ $1/$5 per 1M in/out tokens; Sonnet 4.6 ≈ $3/$15.
- **Model** — default `claude-haiku-4-5` (this is a constrained tool-routing + short-narration
  workload — the cheapest tier — and the deterministic work lives in `pure.js`, not the model). No
  `thinking` parameter is sent, so thinking stays off (zero thinking tokens). `claude-sonnet-4-6`
  remains an optional, non-default manual step-up; **`claude-opus-4-8` is removed from the allow-list**
  (its default-on thinking against a shared `max_tokens` ceiling is the wrong shape for a lookup
  front-end). A request for any other model falls back to the Haiku default.
- **Strict tool use** — the fully-specified tools (`query_listings`, `get_listing`, `search_areas`,
  `get_area`) set `strict: true` + `additionalProperties: false`, so the model's tool arguments are
  schema-valid by construction. `draft_outreach` stays non-strict (its `listing`/`contact`/`extra`
  params are intentionally free-form). Smoke-test after deploy to confirm the current API line needs
  no beta header for `strict`.

## 6. Gotchas

- **Streaming + tool loop**: the SSE is **not** closed on `tool_use` — only on `end_turn`/error. A
  terminal `done`/`error` event is always emitted so the client never hangs.
- **History growth**: persist + send only the final user/assistant **text** turns, not intermediate
  tool blocks; tools re-run each turn (small payloads, fresh answers).
- **Model strings drift**: confirm current model ids before launch; `claude-haiku-4-5` is the
  intended default, with `claude-sonnet-4-6` as the optional manual step-up.
- **Listings query push-down**: `query_listings` now narrows the candidate set in Postgres (live
  status, indexed price/area predicates, bounded `.limit(200)`) and only selects `description` on a
  keyword search; `pure.js` still does all ranking/gating, so the model boundary is unchanged. Price
  predicates keep `price IS NULL` rows so unpriced listings survive exactly as before.
