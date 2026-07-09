# ISSUE LOG — system audit (wave 1)

> Generated 2026-07-09 by an automated repo + live-Supabase audit on branch
> `claude/system-audit-issues-btv6x9`. Baseline: `node tools/run-all-tests.mjs`
> green (1176/1176) with dev deps installed.
>
> This is a findings register, **not** a set of applied changes — nothing in the
> app was modified. Each item has a severity, evidence, impact, and a concrete
> recommendation so you can decide what to action. Guard-railed files (CLAUDE.md
> §16) and schema/RLS changes (§16 mechanical rails) are called out as needing
> their own named phase.

**Severity key** — 🔴 High (security or data-integrity, act soon) · 🟠 Medium
(correctness/latent bug or real risk) · 🟡 Low (polish, hygiene, docs).

**Wave-1 scope covered:** every HTML page + shell partials; dashboard tiles;
storage layer (`storage/**`); Supabase schema, RLS policies, SECURITY DEFINER
functions, advisors; the Ask edge function; feature coordinators (listings,
areas, criteria, ask); CI workflows; data/index integrity; CSS token discipline.

---

## 🔴 High severity

### H1 — `replace_listing_areas()` is an unauthenticated write bypass
- **Where:** Postgres function `public.replace_listing_areas(text, jsonb)`
  (SECURITY DEFINER); Supabase security advisor
  [lint 0028](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
- **Evidence:** The advisor reports it is executable by the **`anon`** role via
  `/rest/v1/rpc/replace_listing_areas`. The function body (read via `execute_sql`)
  has **no caller-authorization check** — unlike its siblings, which all gate
  (`household_feed` → `is_household_member`; `live_feed_stats` → admin email;
  `request_rightmove_fetch` → `auth.uid() is not null`). Because it is
  SECURITY DEFINER it runs as the owner and **bypasses RLS**, then it
  `DELETE`s + re-`INSERT`s `listing_areas` rows and can `UPDATE listings.area_id`.
- **Impact:** Anyone holding the public anon key (it ships in the browser bundle,
  by design) can rewrite which areas any listing belongs to and flip its primary
  `area_id`. That corrupts the feed's membership/geofence truth for every
  household. No auth required.
- **Fix:** `REVOKE EXECUTE ... FROM anon, authenticated;` so only the service
  role (the fetcher tools) can call it — those callers use the service key. If a
  signed-in caller ever needs it, add an explicit `is_household_member`/role
  check inside the function first. This is a schema/permission change → its own
  named phase + ADR per §16 mechanical rails.

### H2 — `sync_log` (internal activity ledger, ~21.5k rows) is world-readable
- **Where:** RLS policy `sync_log public read` (`USING (true)`), table
  `public.sync_log` (columns: `table_name, actor, row_id, action, at`).
- **Evidence:** `pg_policies` shows `qual = true` for role `public`; the table
  has 21,483 rows spanning 2026-05-26 → now.
- **Impact:** Any unauthenticated visitor can read the full operational timeline —
  every table name, row id, actor (`system`/user), and action (insert/update) —
  via the anon key. It exposes user-state table **row ids and edit timestamps**
  (when a user last changed finances/criteria/etc.), which is a privacy leak even
  though the row *contents* stay RLS-protected.
- **Note:** Only `getScraperLog()` (the admin kiosk) reads `sync_log`, and it
  filters to `table_name='listings', actor='system'` — so a tightened policy
  needn't break the app.
- **Fix:** Replace the `true` policy with one scoped to
  `table_name = 'listings' AND actor = 'system'` (what the app actually needs) or
  gate the whole table behind the admin/service role and expose the scraper feed
  through a SECURITY DEFINER function like `live_feed_stats`. Schema/RLS change →
  named phase + ADR.

---

## 🟠 Medium severity

### M1 — The feed's price/beds gate is hardcoded in the DB, decoupled from the user's criteria
- **Where:** `public.household_feed(...)` defaults `p_price_min=250000`,
  `p_price_max=425000`, `p_min_beds=2`; caller
  `assets/js/storage/listings/feed.js:132` passes **only** `p_household_id`,
  `p_status`, `p_include_out_of_area`, `p_limit`, `p_offset` — never the price or
  beds params.
- **Evidence:** Current criteria (`execute_sql` on `criteria`) are max £425k /
  2 beds for all three households, so the hardcoded window *happens* to match
  today — no visible harm. But the DB gate and the user's live criteria are two
  independent sources of truth for the same rule.
- **Impact:** If a user raises their budget (e.g. to £500k) or min beds in the
  profile, the feed RPC silently keeps filtering at £425k / 2 beds and those
  listings never reach the client — a latent, silent correctness bug. Also
  `p_price_min=250000` is below every household's min budget (£300k–£350k), so
  sub-budget listings are returned and only caught by the client-side re-filter.
- **Fix:** Pass `criteria.budget.min/max` and `criteria.size.minBeds` from
  `_householdFeed()` into the RPC call, or drop the price/bed gate from the RPC
  and let the client fit-engine own it (it already re-filters). Client-only change
  (no schema edit) if you pass the params through.

### M2 — Duplicate area records for 4 villages under two outcodes each; 4 are orphaned from the index
- **Where:** `data/areas/` + the `areas` DB table + `household_areas`.
- **Evidence:** Eight per-area files exist for four villages —
  `charlwood-so24`/`charlwood-gu34`, `colemore-gu32`/`colemore-gu34`,
  `flexcombe-gu32`/`flexcombe-gu33`, `froxfield-green-gu32`/`froxfield-green-gu34`.
  `data/source/villages.csv` lists only one outcode per village (Charlwood GU34,
  Colemore GU34, Froxfield Green GU34, Flexcombe GU32), so `build-areas.mjs`
  builds an index of **192** while **196** files exist. The four not in the index
  (`charlwood-so24`, `colemore-gu32`, `flexcombe-gu33`, `froxfield-green-gu32`)
  still exist as files, as DB rows, and are referenced by `household_areas`
  (status `inactive`/`removed`).
- **Impact:** Leftovers from an id/postcode migration (CLAUDE.md §2/§18.5 warn
  about exactly this). They're invisible on the Areas page (built from the index)
  but linger in the DB and in the household's area list, so they can still surface
  in membership joins and clutter reconciliation. Two records per real village is
  a data-integrity hazard.
- **Fix:** Decide the canonical outcode per village, then per §18.5: fix the DB
  row + `villages.csv`, migrate any `household_areas`/`area_confirmations`
  references, delete the stale id, re-run `sync-areas-from-supabase` →
  `build-areas`, and confirm the parity test. Data migration → its own phase.

### M3 — `request_rightmove_fetch()` lets any signed-in user trigger paid Apify scrapes
- **Where:** `public.request_rightmove_fetch(int)`; advisor
  [lint 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- **Evidence:** The only guard is `auth.uid() is null → raise`; any authenticated
  user passes it. It dispatches the GitHub fetch workflow (spends Apify budget).
- **Impact:** Cost-abuse vector. Mitigated by a 10-minute cooldown and a 3-user
  private app today, but any future signup inherits the ability to burn scrape
  budget.
- **Fix:** Additionally gate on household membership (or an allow-list), and/or
  rely on the app-level `fetch-spend` caps. Low urgency while the user base is
  closed, but worth locking before any wider sign-up.

---

## 🟡 Low severity

### L1 — Stale sync snapshot makes the §8 freshness check cry wolf every session
- **Where:** `data/snapshots/sync-state.json` vs the live `areas` table.
- **Evidence:** Snapshot high-water for `areas` is `2026-07-02T22:22:36Z`, but the
  DB `MAX(updated_at)` is `2026-07-03T11:05:39Z`. Spot-checked `wilton-sp2` /
  `worthy-down-so21`: the **repo per-area files already contain the 07-03 content**
  (e.g. the `rightmove.resolvedAt: 2026-07-03T11:05:33Z` block), so the data is in
  sync — only the snapshot marker is behind.
- **Impact:** Every data session's session-start freshness check falsely flags
  `areas` as "DB is fresher" and burns a reconciliation cycle chasing a non-diff.
- **Fix:** Bump the `areas` high-water mark in `sync-state.json` to the current DB
  max (a one-line snapshot update; no content change).

### L2 — Supabase Auth: leaked-password (HIBP) protection disabled
- **Where:** Auth config; advisor
  [password-security](https://supabase.com/docs/guides/auth/password-security).
- **Fix:** Enable "Leaked password protection" in the Supabase Auth dashboard —
  one toggle, no code.

### L3 — `pg_net` extension installed in the `public` schema
- **Where:** advisor
  [lint 0014](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).
- **Fix:** Move it to a dedicated `extensions` schema. Low risk; housekeeping.

### L4 — README's "Live" URL contradicts the CNAME and the Ask CORS allow-list
- **Where:** `README.md:15` says live at `https://seanparkerai.github.io/rec/`;
  `CNAME` is `georgianrectory.com`; `supabase/functions/_shared/cors.ts` allow-lists
  only `georgianrectory.com` / `www.` / `localhost:8000`.
- **Impact:** If production actually serves from the custom domain, the README is
  stale. If it serves from `*.github.io`, the Ask edge function's CORS check
  rejects the origin (falls back to `Allow-Origin: georgianrectory.com`, which
  won't match the browser origin) and **Ask breaks in the browser**. Ambiguous
  production origin is the real issue.
- **Fix:** Confirm the canonical production origin, update the README to match,
  and ensure that origin is in the CORS allow-list.

### L5 — Performance advisors (indexes)
- **Where:** Supabase performance advisors.
- **Findings:** `household_areas.household_areas_area_id_fkey` has no covering
  index; the `areas member stub insert` RLS policy re-evaluates `auth.*()` per row
  (wrap as `(select auth.uid())`); several unused indexes
  (`idx_debts_credit_cards_household`, `idx_household_members_user`,
  `idx_investments_accounts_household`, `idx_investments_history_account`); two
  `backup.*` tables lack primary keys.
- **Fix:** Add the FK index, apply the `(select auth.…())` RLS rewrite, and drop
  the unused indexes once confirmed. Schema changes → named phase. Immaterial at
  current row counts; worth doing before scale.

### L6 — Three separate HTML-escape helpers with different names
- **Where:** `esc` (`assets/js/dom.js`), a local `esc` (`assets/js/ask/transcript.js`),
  and `escHtml` (`assets/js/listings/controls.js`).
- **Impact:** No bug — all three are correct and escaping discipline across the
  `innerHTML` sites is otherwise solid (external listing/area/message data is
  routed through `esc()`, and the Ask markdown renderer is escape-first). Purely a
  consistency/DRY nit: three names for one primitive invites a future omission.
- **Fix:** Standardise on the exported `esc` from `dom.js`.

### L7 — Admin "Live feed" nav item is dead in the drawer
- **Where:** `components/nav.html` `<li data-admin-only hidden>` +
  `components.js` reveal.
- **Evidence:** The in-file comment already documents it: the admin account is
  locked to the chrome-less `/live-feed` kiosk by `auth-guard.js`, so it never
  sees the nav drawer that would reveal this item.
- **Fix:** Remove the latent item (and its reveal logic) or drop the comment's
  pretence; no behavioural impact either way.

### L8 — Test runner aborts the whole suite on one unloadable tier file
- **Where:** `tools/run-all-tests.mjs:88` — `await import(file)` is not wrapped,
  so a top-level import failure (e.g. `jsdom` missing before `npm ci`) throws a
  raw stack and kills the run.
- **Clarification (not a false-green):** the process still exits **non-zero** in
  that case — it fails loud, which is correct. (An earlier reading of "exit 0"
  was an artefact of piping through `| tail`, whose exit code masked node's.) The
  only nit is ergonomics: a missing dev dep surfaces as an unhandled
  `ERR_MODULE_NOT_FOUND` rather than a clean `✗ pages — failed to load` line.
- **Fix (optional):** wrap the per-file `import()` in try/catch and record it as a
  failed result so the summary stays readable. CI (`npm ci` first) never hits this.

---

## Verified healthy (checked, no action)

- **RLS coverage:** all 33 public tables have RLS enabled; user-state tables are
  correctly scoped by `is_household_member(household_id)` for select/insert/update.
- **XSS surface:** the 118 `innerHTML` sites were swept — external data
  (listings, areas, contacts, Ask messages) is consistently escaped via `esc()`;
  the Ask assistant-markdown renderer (`mdToSafeHtml`) is escape-first with a
  fixed safe-tag set and http(s)-only links.
- **Auth flow:** `auth-guard.js` hides the page until the session resolves,
  redirects unauthenticated users with a `next=` return path, and the admin⇔kiosk
  lock is enforced both client-side and in the DB (`live_feed_stats` admin check).
- **Feed correctness:** `household_feed` centralises the visibility predicate
  (membership ∩ active non-origin areas ∩ geofence ∩ baseline) and its baseline
  regex/constants are parity-tested against `classify.js`
  (`tests/contract/household-feed.test.js`).
- **Offline write safety:** the storage layer's pending-write journal + drain
  (`storage/core.js`) correctly holds off cache-clobbering revalidation until a
  failed upsert lands.
- **Pages deploy gating:** `pages.yml` deploy `needs: test`; CORS uses an
  allow-list with a safe fallback; workflow secrets are referenced via
  `secrets.*`, never inlined.

---

## Suggested action order
1. **H1** (revoke `replace_listing_areas` from anon) — smallest change, highest
   risk removed.
2. **H2** (scope `sync_log` read policy) — privacy leak, self-contained.
3. **M1** (pass criteria into the feed RPC) — client-only, prevents a silent
   correctness bug the moment a budget changes.
4. **M2** (de-duplicate the 4 villages) — data hygiene, one migration phase.
5. **L1 / L2 / L4** — quick wins (snapshot bump, auth toggle, README/CORS
   reconciliation).
6. Remaining L items as housekeeping.
