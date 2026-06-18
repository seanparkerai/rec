# assets/js/storage/

**Domain:** Supabase-backed persistent storage layer — user-state (profile, criteria, finances, goals, investments, shortlist), content (listings, outreach), and refinement data. localStorage write-through cache + background Supabase revalidate.

**Naming:** Modules are domain-scoped: `core.js` (Supabase bootstrap, cached household_id, localStorage helpers, _get/_save pattern), `user-state.js` (profile/criteria/finances/goals), `listings.js`, `outreach.js`, `refinement.js`, `ask.js`. Top-level `assets/js/storage.js` is a thin re-export shim.

**Entry point:** Each domain exports `get<Type>()` / `save<Type>()` pairs. `core.js` owns bootstrap (`_initSb()`, `_getHid()`), the read pattern (`_get()` → localStorage || Supabase), write pattern (`_save()` → localStorage + MCP upsert), and helpers (`_sbGet`, `_sbUpsert`, toast, auth). Siblings call these helpers; storage.js re-exports the 3 public names (supabase, getCurrentUser, signOut).

**Key constraint:** Extend, do not rewrite (CLAUDE.md §16/§17). All writes are localStorage-first (instant render) + Supabase background upsert. Do not call Supabase directly from page modules — go through storage.js. User-state data is never in repo JSON; only Supabase row + localStorage cache (fixtures are redacted sample data for tests).

Run `find assets/js/storage -name '*.js'` for the live file list. See docs/REPO_MAP.md for the whole-repo map.
