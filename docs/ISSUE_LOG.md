# ISSUE LOG — system audit (wave 1)

> Generated 2026-07-09 by an automated repo + live-Supabase audit on branch
> `claude/system-audit-issues-btv6x9`. Baseline: `node tools/run-all-tests.mjs`
> green (1176/1176) with dev deps installed.
>
> **Update 2026-07-09 — fixes applied.** Every finding below except **M3** (owner
> decision: any signed-in user may keep triggering fetch runs) has been resolved
> in this branch. Each item now carries a **✅ Resolved** / **⏸️ Won't-fix (by
> design)** / **📋 Owner action** line stating exactly what changed. Harness green
> (1176/1176) after the fixes; DB migrations verified live via `execute_sql`.

**Severity key** — 🔴 High (security or data-integrity, act soon) · 🟠 Medium
(correctness/latent bug or real risk) · 🟡 Low (polish, hygiene, docs).

## Resolution summary

| # | Severity | Status | What changed |
|---|----------|--------|--------------|
| H1 | 🔴 | ✅ Resolved | `REVOKE EXECUTE` on `replace_listing_areas` from public/anon/authenticated (migration `revoke_replace_listing_areas_from_public`). |
| H2 | 🔴 | ✅ Resolved | `sync_log` read policy scoped to `listings`/`system` rows (migration `scope_sync_log_public_read`). |
| M1 | 🟠 | ✅ Resolved | Feed RPC now receives the household's live `budget.max` + `size.minBeds` (`storage/listings/feed.js`). |
| M2 | 🟠 | ✅ Resolved | 4 duplicate-postcode village records removed; Charlwood canonicalised to the correct SO24; index/snapshot/test updated. |
| M3 | 🟠 | ⏸️ Won't-fix | Owner decision — any signed-in user may trigger fetch runs. Left as-is. |
| L1 | 🟡 | ✅ Resolved | `areas` high-water mark + note corrected in `sync-state.json`. |
| L2 | 🟡 | 📋 Owner action | One dashboard toggle — no MCP/API surface to set it programmatically. |
| L3 | 🟡 | ⏸️ Won't-fix | `pg_net` is non-relocatable (`extrelocatable=false`); moving it would break the fetch-dispatch pipeline. |
| L4 | 🟡 | ✅ Resolved | README live URL corrected to `georgianrectory.com` (matches CNAME + CORS). |
| L5 | 🟡 | ✅ Resolved (partial) | FK index added + RLS init-plan wrapped; unused indexes intentionally kept (see item). |
| L6 | 🟡 | ✅ Resolved | `controls.js` escapers collapsed to one `esc` with correct semantics. |
| L7 | 🟡 | ⏸️ Won't-fix | Admin nav reveal is tested defense-in-depth; kept, comment already documents it. |
| L8 | 🟡 | ✅ Resolved | Test runner wraps per-file `import()` so an unloadable suite is a counted FAIL. |

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
- **✅ Resolved (2026-07-09):** migration `revoke_replace_listing_areas_from_public`
  ran `REVOKE EXECUTE … FROM public, anon, authenticated`. Verified live: grants are
  now `postgres=EXECUTE, service_role=EXECUTE` only. The fetcher tools
  (`fetch-listings.mjs`, `listing-areas-writer.mjs`, `backfill-listing-areas.mjs`)
  use the service-role key, so they are unaffected. Reference SQL updated in
  `supabase/archive/schema-listings.sql`.

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
- **✅ Resolved (2026-07-09):** migration `scope_sync_log_public_read` dropped the
  `USING (true)` policy and created `sync_log scraper feed public read` with
  `USING (table_name = 'listings' AND actor = 'system')`. `getScraperLog()` filters to
  exactly that slice, so the /live-feed kiosk is unaffected; user-state row ids +
  edit timestamps are no longer world-readable. Reference SQL updated in
  `supabase/schema.sql`.

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
- **✅ Resolved (2026-07-09):** `getListings()` now fetches the household's criteria
  and forwards `budget.max` → `p_price_max` and `size.minBeds` → `p_min_beds` to the
  RPC (`storage/listings/feed.js`). Each is passed only when set (the key is omitted
  otherwise so the SQL default applies — passing `null` would filter out every priced
  row). The permissive `p_price_min` default is deliberately left alone so
  cheaper-than-min listings are still shown; the client fit engine owns affordability.
  Integration + contract tiers stay green.

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
- **Note on discovery:** the "orphaning" turned out to be *documented* — a
  `KNOWN_DEACTIVATED` list in `tests/areas-index-sync.test.js` intentionally kept the
  four variant files out of the index. But it had picked the wrong canonical for
  Charlwood: the household's **active** area is `charlwood-so24`, and the coordinates
  (long ≈ −1.03, the Ropley/Alresford area — not Petersfield) confirm SO24 is the
  correct postcode and the indexed `charlwood-gu34` was mis-coded.
- **✅ Resolved (2026-07-09):** migration `dedupe_four_villages_orphan_ids` cleared the
  stale `listing_areas` m2m rows then deleted the four orphan `areas` rows
  (`charlwood-gu34`, `colemore-gu32`, `flexcombe-gu33`, `froxfield-green-gu32`);
  their inactive/removed `household_areas` rows cascaded away, and the household's
  active Charlwood selection (`charlwood-so24`) is preserved. `villages.csv` now lists
  Charlwood under SO24/Alresford; the DB row's derived fields were aligned; the 4
  orphan per-area files were removed; the parity snapshot and index rebuilt (192 = 192
  = 192); and `KNOWN_DEACTIVATED` is now empty (no more deactivated-but-present files).
  Full harness green.

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
- **⏸️ Won't-fix (owner decision, 2026-07-09):** any signed-in user should be able
  to trigger fetch runs. Left exactly as-is (the 10-minute cooldown + `fetch-spend`
  caps remain the guard rails). Revisit only if sign-up is opened more widely.

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
- **✅ Resolved (2026-07-09):** `areas` high-water bumped to `2026-07-09T14:03:10Z`
  and its `_note` corrected (files + DB mirror = 192 after the M2 dedupe, not 196).

### L2 — Supabase Auth: leaked-password (HIBP) protection disabled
- **Where:** Auth config; advisor
  [password-security](https://supabase.com/docs/guides/auth/password-security).
- **Fix:** Enable "Leaked password protection" in the Supabase Auth dashboard —
  one toggle, no code.
- **📋 Owner action (2026-07-09):** this is an Auth config setting with no MCP/API
  surface available to this session, so it can't be set programmatically. **You**
  toggle it: Supabase dashboard → Authentication → Policies → "Leaked password
  protection" → enable. ~30 seconds; no deploy.

### L3 — `pg_net` extension installed in the `public` schema
- **Where:** advisor
  [lint 0014](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).
- **Fix:** Move it to a dedicated `extensions` schema. Low risk; housekeeping.
- **⏸️ Won't-fix (2026-07-09):** verified `pg_net` is **not relocatable**
  (`pg_extension.extrelocatable = false`), so `ALTER EXTENSION … SET SCHEMA` is
  rejected. The only alternative is drop + recreate, which would break the
  fetch-dispatch pipeline (`request_rightmove_fetch` → `dispatch_fetch_now` uses
  `net.http_post`) and any Supabase webhooks. Relocating a system extension to
  satisfy a WARN lint isn't worth breaking production. Accepted as-is.

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
- **✅ Resolved (2026-07-09):** README "Live" URL updated to
  `https://georgianrectory.com` (the `CNAME` custom domain, which is already in the
  Ask CORS allow-list). If you actually deploy from `*.github.io`, tell me and I'll
  add that origin to `cors.ts` instead — but the CNAME indicates the custom domain
  is canonical.

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
- **✅ Resolved (partial, 2026-07-09):** migration `perf_fk_index_and_rls_initplan`
  added `idx_household_areas_area_id` (FK covering index) and rewrote the
  `areas member stub insert` policy to use `(select auth.uid())` (evaluated once per
  statement). Verified live. **Intentionally NOT dropped:** the four "unused"
  indexes are FK/household-scoped covering indexes that will be exercised the moment
  those tables grow (they read "unused" only because the tables are tiny today) —
  dropping intended access paths to satisfy an INFO lint would be a regression. The
  two `backup.*` tables (no PK) are transient dumps; left as-is.

### L6 — Three separate HTML-escape helpers with different names
- **Where:** `esc` (`assets/js/dom.js`), a local `esc` (`assets/js/ask/transcript.js`),
  and `escHtml` (`assets/js/listings/controls.js`).
- **Impact:** No bug — all three are correct and escaping discipline across the
  `innerHTML` sites is otherwise solid (external listing/area/message data is
  routed through `esc()`, and the Ask markdown renderer is escape-first). Purely a
  consistency/DRY nit: three names for one primitive invites a future omission.
- **Fix:** Standardise on the exported `esc` from `dom.js`.
- **✅ Resolved (2026-07-09):** `controls.js`'s two local helpers (`escHtml`/`escAttr`)
  were collapsed into one `esc` escaping the full `&<>"'` set (same semantics as
  `dom.js`), and all three call sites updated. Kept local — the module is
  deliberately import-free so its pure core stays Node-unit-testable (its old comment
  claimed `dom.js` `esc` is "browser-only", which is inaccurate — `esc` is pure — but
  avoiding the dependency is still the right call). `transcript.js`'s local `esc` is
  the escape-first markdown renderer's own primitive and stays self-contained.

### L7 — Admin "Live feed" nav item is dead in the drawer
- **Where:** `components/nav.html` `<li data-admin-only hidden>` +
  `components.js` reveal.
- **Evidence:** The in-file comment already documents it: the admin account is
  locked to the chrome-less `/live-feed` kiosk by `auth-guard.js`, so it never
  sees the nav drawer that would reveal this item.
- **Fix:** Remove the latent item (and its reveal logic) or drop the comment's
  pretence; no behavioural impact either way.
- **⏸️ Won't-fix (2026-07-09):** on review, kept. The reveal mechanism
  (`shell/header-user.js`) is covered by a passing test
  (`tests/pages/shell-wiring.test.js`) and is correct defense-in-depth: if the
  `auth-guard.js` admin→kiosk lock is ever relaxed, the nav would correctly surface
  the `/live-feed` link. Deleting a tested, harmless safety mechanism to remove one
  latent line is a net negative; the in-file comment already documents the current
  behaviour honestly.

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
- **✅ Resolved (2026-07-09):** the per-file `import()` (and `register()`) in
  `tools/run-all-tests.mjs` are now wrapped — an unloadable suite becomes a single
  counted `✗ … failed to load` result instead of a raw stack that aborts the run.

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
  (membership ∩ active areas ∩ geofence ∩ baseline; the non-origin clause was
  removed 2026-07-09, ADR 0009) and its baseline
  regex/constants are parity-tested against `classify.js`
  (`tests/contract/household-feed.test.js`).
- **Offline write safety:** the storage layer's pending-write journal + drain
  (`storage/core.js`) correctly holds off cache-clobbering revalidation until a
  failed upsert lands.
- **Pages deploy gating:** `pages.yml` deploy `needs: test`; CORS uses an
  allow-list with a safe fallback; workflow secrets are referenced via
  `secrets.*`, never inlined.

---

## Status (2026-07-09)

All findings are actioned. **9 fixed** (H1, H2, M1, M2, L1, L4, L5, L6, L8),
**3 won't-fix with rationale** (M3 owner decision, L3 non-relocatable extension,
L7 tested defense-in-depth), and **1 left for you** (L2 — a 30-second Auth
dashboard toggle with no programmatic surface).

**The one thing still on your plate:** enable *Leaked password protection* in the
Supabase Auth dashboard (L2). Everything else is done, verified, and shipped on
`claude/system-audit-issues-btv6x9` (harness green; DB migrations confirmed live).

DB migrations applied this session: `revoke_replace_listing_areas_from_public`,
`scope_sync_log_public_read`, `dedupe_four_villages_orphan_ids`,
`perf_fk_index_and_rls_initplan`, plus a targeted `areas` derived-field alignment.

---

# Wave 2 — ring-trust audit (2026-07-10)

> Owner directive: "if any single property is covered by a ring and becomes available
> within my limits — it should become visible to me with no exceptions." This wave audited
> every radius/limit consumer against that invariant.

### W2-1 🔴 Learned radius auto-shrink hid 567 in-DB listings under drawn rings — ✅ Resolved (ADR 0010)
- **Where:** `area_search_tuning` (autonomous `radius-tune` writes) vs the map ring
  (`page-map.js`, criteria-driven, default 3 mi — never reads the tuning table).
- **Evidence (live):** four actively-held areas tuned to 0.76 mi (stubbington-hampshire),
  1.44 mi + a 0.55 mi petal (titchfield-common-hampshire), 1.62 mi (titchfield-hampshire),
  2.87 mi (breamore-sp6) with **no user pin and no criteria override** — the only pin in
  `learned_preferences` is a 3 mi *keep* on dundridge-so32. 567 listings already in the DB
  sat inside the drawn 3 mi rings with no `listing_areas` row for those areas, so they never
  reached the feed; the nightly sentinel blessed it because its drift radius used the same
  shrunken values.
- **Fix:** the drawn ring is now the coverage **floor** at three layers — `planRadii`
  (write), `applyRadiusTuning` via `ringFloorInputs` (read: fetcher, backfills, importers),
  and the sentinel's ring-aware drift radius (rail). Tightens below the ring are
  suggestion-only; Apply moves ring + pin together (`tightenRadiusBoth`, unchanged). Live
  tuning rows repaired to 3 mi and the 567 junction rows backfilled via MCP; a scoped
  foundation fetch tops up the never-fetched annulus stock.

### W2-2 🟠 Client radius filter judged listings by PRIMARY area only — ✅ Resolved
- **Where:** `page-listings.js` + `dashboard/tile-review-count.js` (duplicated inline).
- **Impact:** with a per-area override keyed on a primary the household doesn't hold, a
  listing comfortably inside another held ring could be hidden (dormant today — no overrides
  set — but a live trap for the first Apply). Both now share `makeRadiusFilter`
  (`listings/feed-partition.js`): a listing passes if inside ANY member area's ring.

### W2-3 🟠 Purge judged "baseline" with the static £250k–£425k band — ✅ Resolved
- **Where:** `tools/purge-listings.mjs` `purgeDecision` → `passesBaseline(row)` (defaults).
- **Impact:** raise a budget to £500k and the nightly-fetched £425k–£500k listings would be
  deleted as baseline violations. Purge now derives a live union band (`unionBand`, widest
  of live budgets ∪ static band — deletion stays conservative in both directions).

### W2-4 🟡 Fetch pinned `minBedrooms=2` regardless of criteria — ✅ Resolved
- **Where:** `tools/fetch-listings.mjs` `buildSearchUrl`.
- **Impact:** lowering `size.minBeds` below 2 would never widen the search at source (the
  feed RPC + engine already honour it). The per-target band now unions the lowest linked
  minBeds (`priceBandForAreas`), applied to the search URL and the baseline gate.

### W2-5 🟡 Stale `areas` snapshot mark (07-09 stub-row touches) — ✅ Resolved
- High-water bumped to `2026-07-09T19:16:53Z`; the only rows past the old mark were
  household-onboarding stubs (never materialised) — no file drift.

**Verified healthy this wave:** the `household_feed` RPC visibility predicate (membership ∩
active ∩ geofence ∩ baseline, price/beds forwarded from live criteria per wave-1 M1); the
fetch price band already unions live budgets per target; fetch cadence (4 daily slots + 3-day
overlap) and the truncation sentinel; demand gate + zero-demand drop; purge's liked-row
protection; the ALL_ACTIVE freeze for scoped runs (2026-07-09 fix) — no recurrence.
