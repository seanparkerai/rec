# LIVE FEED PLAN — `/live-feed` admin kiosk (landscape iPad)

> **Status:** APPROVED PLAN, not yet implemented. Owner-approved 2026-06-22.
> Implement on a feature branch, run the full harness, sync via MCP, then commit.
> This file is the single source of truth for the build. Read it end-to-end before
> writing any code, then follow the **Order of operations** verbatim.

---

## 0. One-paragraph summary

A permanently-on, landscape-iPad **kiosk view at `/live-feed`**, accessible **only to a
dedicated `admin@gr.com` account**. The left/right of the screen carry (a) a **live
Rightmove-scraper feed** reconstructed from `sync_log`, and (b) **per-user stat panels**
for **Luke** (`My Household`) and **Suzanne** (`Suzanne's Household`) showing live
listings, saved listings, areas, combined deposit/savings, **and rolling averages**. The
page **refreshes read-only on a timer** (it never triggers Apify) and, to prevent OLED/LCD
**screen burn-in**, **rearranges its layout on every refresh** — the scraper column swaps
sides and flips between vertical and horizontal, the user panels move, and a small
periodic pixel-shift is applied.

---

## 1. Confirmed facts (verified against the live DB + codebase, 2026-06-22)

### Households (hardcoded targets)
| Label    | Household name        | `household_id`                          | Owner email                |
|----------|-----------------------|-----------------------------------------|----------------------------|
| Luke     | `My Household`        | `9628b44f-447e-4c5b-bbbc-b2ce51efbbbe`  | seanparker.gb@gmail.com    |
| Suzanne  | `Suzanne's Household` | `f36e6215-7d62-497b-bc15-32a25c63de5b`  | suzannemclifford@gmail.com |

(`Demo Household` / demo@gr.com is ignored.)

### Access model — **ADMIN ONLY**
- New auth user **`admin@gr.com`** / password **`admin`**, **not a member of any
  household** (so Row Level Security grants it no raw private rows — it only ever sees the
  aggregate RPC).
- The admin account is **locked to `/live-feed`** and nothing else; non-admin accounts are
  **redirected away from `/live-feed`**. Luke/owners view the kiosk by signing in as admin.

### Data sources
- **`listings`** — `rls: public read (qual=true)`. 890 rows, all `status='live'`. Columns
  incl. `area_id`, `status`, `geofence_pass`, `rightmove_id`, `first_seen`.
- **`sync_log`** — `rls: public read (qual=true)`. The scraper feed: the fetcher writes
  `table_name='listings', actor='system', action ∈ {insert,update,delete}` with timestamp
  `at`. Clustering these by time-gap reconstructs each fetch "run". Columns:
  `id, table_name, actor, row_id, action, at`.
- **Per-household tables are RLS-locked** to `is_household_member(household_id)`:
  `household_areas` (active areas), `listing_reactions` (append-only; latest-per-listing =
  current reaction; `like` ⇒ "saved"), `finances` (`data` JSONB), `investments_accounts`
  (`data` JSONB). → cross-household reads **must** go through a `SECURITY DEFINER` RPC that
  returns **aggregates only**.
- **Savings = canonical deposit savings** (`assets/js/finance-derive.js#computeDepositSavings`):
  `cash (finances.data.savings.current) + earmarked ISA (investments_accounts.data:
  currentPortfolioValue × earmarkPct/100, or full value if earmarkPct=0)`.
  Current values: **Luke ≈ £32,994.45** (cash £0 + ISA £32,994.45 @ 100%),
  **Suzanne = £53,000** (cash £53,000, no investments). This formula is already mirrored in
  `supabase/functions/ask/pure.js` and pinned by `tests/ask-tools.test.js`; the SQL
  replica below adds a third mirror — **a parity test keeps all three in lockstep**.
- Reference snapshot (will move): Luke 195 active areas; Suzanne 9 active areas.

---

## 2. Database — new migration (apply via `mcp__supabase__apply_migration`)

Migration name: **`live_feed_stats_admin_rpc`**. Creates ONE function. No tables, no DDL on
existing objects, no new tracked table (so `tests/supabase-sync.test.js`'s tracked-table
list is unchanged).

```sql
-- public.live_feed_stats() — admin-only aggregate read for the /live-feed kiosk.
-- SECURITY DEFINER so it can aggregate across the two target households without
-- exposing any raw row. Self-checks the caller is admin@gr.com and returns ONLY
-- counts + a savings total + rolling averages. Read-only.
create or replace function public.live_feed_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := auth.jwt() ->> 'email';
  luke    uuid := '9628b44f-447e-4c5b-bbbc-b2ce51efbbbe';
  suzanne uuid := 'f36e6215-7d62-497b-bc15-32a25c63de5b';
  result  jsonb;
begin
  if v_email is distinct from 'admin@gr.com' then
    raise exception 'live_feed_stats: forbidden';
  end if;

  with hh(id, label) as (
    values (luke, 'Luke'), (suzanne, 'Suzanne')
  ),
  -- Active areas per household.
  areas as (
    select household_id, count(*)::int as n
    from household_areas
    where status = 'active' and household_id in (luke, suzanne)
    group by household_id
  ),
  -- Live listings inside the household's active areas, geofence-passing.
  live as (
    select a.household_id, count(distinct l.rightmove_id)::int as n
    from household_areas a
    join listings l
      on l.area_id = a.area_id
     and l.status = 'live'
     and l.geofence_pass is not false
    where a.status = 'active' and a.household_id in (luke, suzanne)
    group by a.household_id
  ),
  -- Saved = latest reaction per (household, listing) is 'like'.
  latest_reaction as (
    select distinct on (household_id, listing_id)
           household_id, listing_id, reaction
    from listing_reactions
    where household_id in (luke, suzanne)
    order by household_id, listing_id, created_at desc
  ),
  saved as (
    select household_id, count(*) filter (where reaction = 'like')::int as n
    from latest_reaction
    group by household_id
  ),
  -- Like-event averages (append-only events, not distinct listings).
  like_avg as (
    select household_id,
      round(count(*) filter (
        where reaction = 'like' and created_at >= now() - interval '7 days'
      )::numeric / 7.0, 2) as per_day_7,
      round(count(*) filter (
        where reaction = 'like' and created_at >= now() - interval '28 days'
      )::numeric / 4.0, 2) as per_week_4
    from listing_reactions
    where household_id in (luke, suzanne)
    group by household_id
  ),
  -- Canonical deposit savings per household (mirror of computeDepositSavings).
  savings as (
    select f.household_id,
      round(
        coalesce((f.data->'savings'->>'current')::numeric, 0)
        + coalesce((
            select sum(
              case
                when coalesce((i.data->>'earmarkPct')::numeric, 0) > 0
                  then round((i.data->>'currentPortfolioValue')::numeric
                             * (i.data->>'earmarkPct')::numeric / 100.0, 2)
                else coalesce((i.data->>'currentPortfolioValue')::numeric, 0)
              end)
            from investments_accounts i
            where i.household_id = f.household_id
          ), 0)
      , 2) as total
    from finances f
    where f.household_id in (luke, suzanne)
  ),
  -- Global scraper averages from public sync_log (fetcher writes).
  scraper as (
    select
      round(count(*) filter (
        where action = 'insert' and at >= now() - interval '7 days'
      )::numeric / 7.0, 2) as new_per_day_7,
      round(count(*) filter (
        where action = 'insert' and at >= now() - interval '30 days'
      )::numeric / 30.0, 2) as new_per_day_30,
      max(at) as last_write
    from sync_log
    where table_name = 'listings' and actor = 'system'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'scraper', (select to_jsonb(scraper) from scraper),
    'households', (
      select jsonb_agg(jsonb_build_object(
        'id', hh.id,
        'label', hh.label,
        'live_listings', coalesce(live.n, 0),
        'saved', coalesce(saved.n, 0),
        'areas', coalesce(areas.n, 0),
        'savings', coalesce(savings.total, 0),
        'avg_likes_per_day_7', coalesce(like_avg.per_day_7, 0),
        'avg_likes_per_week_4', coalesce(like_avg.per_week_4, 0)
      ) order by hh.label)
      from hh
      left join live    on live.household_id    = hh.id
      left join saved   on saved.household_id   = hh.id
      left join areas   on areas.household_id   = hh.id
      left join savings on savings.household_id = hh.id
      left join like_avg on like_avg.household_id = hh.id
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.live_feed_stats() from public, anon;
grant execute on function public.live_feed_stats() to authenticated;
```

**Verify after applying** (`mcp__supabase__execute_sql`): `select public.live_feed_stats();`
should raise `forbidden` (because the MCP/service context is not admin@gr.com). Parity of
the `savings` numbers is asserted by the JS test (§4) once signed in as admin in a browser,
or by a temporary SQL check that hardcodes the formula against the two rows.

### Admin auth user
Create `admin@gr.com` / `admin`, **no household membership**. Preferred: Supabase
Dashboard → Authentication → Add user (email confirmed). If creating via SQL, insert into
`auth.users` + `auth.identities` with `crypt('admin', gen_salt('bf'))` and a matching
`identity_data` row; **verify login works** before relying on it. Do **not** add the user to
`household_members`.

---

## 3. Storage layer — extend (allowed by CLAUDE.md §16 "extend, do not rewrite")

Add two reader functions to **`assets/js/storage/listings/feed.js`** (already re-exported
wholesale through `storage/listings.js` → `storage.js`, so no shim edits are required):

- `export async function getLiveFeedStats()` — `await sb.rpc('live_feed_stats')`; returns the
  parsed object or `null` on error. No localStorage cache (kiosk wants fresh reads).
- `export async function getScraperLog({ sinceDays = 3, limit = 400 } = {})` — reads public
  `sync_log` where `table_name='listings' and actor='system'`, `at >= now()-sinceDays`,
  ordered `at desc`, capped at `limit`. Returns the raw rows for client-side clustering.

Do **not** call Supabase from the page module directly (CLAUDE.md §17.4) — go through these.

---

## 4. Pure logic + tests

- **`assets/js/live-feed/runs.js`** (new, pure, no DOM/storage):
  - `clusterRuns(rows, { gapMinutes = 20 } = {})` → array of runs, newest first:
    `{ startedAt, finishedAt, added, updated, removed, isLive }`. A new run starts when the
    gap to the previous (older) row exceeds `gapMinutes`. `isLive = (now - finishedAt) <
    liveWindow` (e.g. 3 min) — i.e. the fetcher is actively writing.
  - `dailyAverages(rows, { days })` helper if any averaging is done client-side (the RPC
    already provides the headline averages; this is for the feed's own "runs/day").
  - `nextSlot(now)` → next scheduled London fetch among `08:00/12:00/14:00/18:00`
    (display-only; mirrors `docs/FETCH_SCHEDULE.md`).
- **`assets/js/live-feed/layout.js`** (new, pure): `nextLayout(prev)` cycles the burn-in
  arrangement variants deterministically (even wear), and `burnShift(tick)` returns small
  `{x,y}` pixel offsets. Kept pure so it is unit-testable.
- **Tests:**
  - `tests/live-feed-runs.test.js` (offline) — clustering, isLive, nextSlot, layout cycling.
  - `tests/live-feed-stats.test.js` — **online/MCP, runs at session end**: asserts the RPC's
    `savings` for both households equals `computeDepositSavings(finances, investments)` read
    from the same rows (the third mirror parity, alongside `tests/ask-tools.test.js`).
  - Wire both into `node tools/run-intelligence-tests.mjs` (the unified harness). Online
    assertions are reported skipped offline, per CLAUDE.md §6.

---

## 5. The page (kiosk, minimal chrome)

### Route
- **`live-feed/index.html`** at the repo root → served by GitHub Pages at **`/rec/live-feed/`**.
  (`config.js`'s `url()`/`APP_BASE` resolve correctly from the new depth; `../assets/...`
  paths match the existing one-level-deep `pages/*.html` convention.)
- **No `data-include` header/nav divs** → `components.js` injects no chrome (minimal kiosk),
  but the file still loads `components.js` (so `auth-guard.js` + theme run) and
  `assets/js/page-live-feed.js`.
- `<head>` links: Pico, `fonts.css`, `tokens.css`, `base.css`, and the new
  `assets/css/pages/live-feed.css` (linked directly — **does not** touch the guard-railed
  `dashboard.css` import shell).

### Content / layout
Two logical regions:
1. **Rightmove scraper feed** (`[data-scraper]`): header with a **live pulse** when a run is
   active, "last updated" + "next fetch" line, and a scrollable list of the most recent
   ~12–20 runs. Each run row: time, status chip (`Running` / `Done` — text + icon, never
   colour-only, CLAUDE.md §11), and counts `＋new · ~updated · －gone`. Footer line: rolling
   **avg new listings/day (7d, 30d)** from the RPC `scraper` block.
2. **User panels** (`[data-user="luke"]`, `[data-user="suzanne"]`): each a hero
   **live-listings** number, then stat cards — **Saved**, **Areas**, **Savings (£)** — and an
   **averages** strip: **avg likes/day (7d)** and **avg likes/week**.

### Anti-burn-in (core requirement)
- The container carries `[data-layout]` with ≥4 variants implemented purely via CSS
  `grid-template-areas`:
  - **V1** scraper LEFT (vertical) · users RIGHT (two columns)
  - **V2** scraper RIGHT (vertical) · users LEFT (two columns)
  - **V3** scraper TOP (horizontal band) · users BOTTOM
  - **V4** scraper BOTTOM (horizontal band) · users TOP
- On **every refresh** the page advances to `nextLayout()`, **swaps the order of the two
  user panels**, and applies a periodic `burnShift()` translate (a few px, re-rolled every
  few minutes). Transitions crossfade unless `prefers-reduced-motion` (then snap).
- Heights use `dvh`/`svh` (never raw `vh`); landscape-first; safe-area insets on edges.

### Refresh behaviour (read-only — never triggers Apify)
- `page-live-feed.js` (thin coordinator; split builders into `assets/js/page-live-feed/` if it
  exceeds ~400 lines per CLAUDE.md §19):
  - **Stats**: call `getLiveFeedStats()` on load and **hourly** thereafter.
  - **Scraper feed**: poll `getScraperLog()` + `clusterRuns()` **~every 60s** for liveness.
  - Each stat refresh triggers the **layout rearrange**; the 60s poll updates feed content
    in place. Announce material changes via an `aria-live="polite"` region (cleared between
    announcements, not combined with focus moves — CLAUDE.md §11).
  - No "Fetch now" button (admin kiosk is observe-only; the 4×/day workflow owns triggering).

### Access enforcement
- **`assets/js/auth-guard.js`** (not guard-railed) — after the session is confirmed, read
  `session.user.email`:
  - `admin@gr.com` **and not** under `/live-feed/` → redirect to `url('live-feed/')`.
  - **not** `admin@gr.com` **and** under `/live-feed/` → redirect to `url('index.html')`.
  - Implement as a small `here.includes('/live-feed')` check; keep the existing flash-prevention
    flow intact.
- No nav-link change needed (the view is admin-only and the admin never sees the nav).

---

## 6. Order of operations

1. **DB**: `apply_migration` `live_feed_stats_admin_rpc`; `execute_sql` to confirm it exists
   and that a non-admin caller is rejected. Create the `admin@gr.com` user (dashboard
   preferred); verify login + that it has **no** `household_members` row.
2. **Pure modules**: `assets/js/live-feed/runs.js`, `assets/js/live-feed/layout.js`.
3. **Storage**: add `getLiveFeedStats()` + `getScraperLog()` to
   `assets/js/storage/listings/feed.js`.
4. **CSS**: `assets/css/pages/live-feed.css` (tokens-only; the 4 grid-area variants).
5. **Page**: `live-feed/index.html` + `assets/js/page-live-feed.js` (+ `page-live-feed/`
   builders if needed).
6. **Access**: extend `assets/js/auth-guard.js` with the admin ⇔ `/live-feed` lock.
7. **Tests**: `tests/live-feed-runs.test.js` (+ `tests/live-feed-stats.test.js`); run
   `node tools/run-intelligence-tests.mjs` until green.
8. **Sync ceremony** (CLAUDE.md §18.3): re-SELECT to confirm the RPC; this build writes **no**
   user-state and **no** content rows, so the only DB change is the function + the admin user.
   Update `data/snapshots/sync-state.json` only if a tracked high-water mark changed (it
   should not). Commit + push; footer `Supabase: pushed 0 areas, 0 user-state rows`.
9. **Hand-off**: one-line visual note to the developer (no browser in CI) — verify on an
   actual landscape iPad that the layout rearranges across refreshes and the pulse animates.

---

## 7. Out of scope (do NOT touch)

- Guard-railed files (CLAUDE.md §16): `tokens.css`, `storage.js`/`finances.js`/`config.js`/
  `data-loader.js` cores, `dashboard.css` import shell, `area.schema.json`, `.github/workflows/*`.
- The fetcher/scheduler — **no new Apify triggering**; the hourly refresh is read-only.
- Other pages' layouts, the standard header/nav, and any user-state writes.
- The `Demo Household`. Non-admin UX beyond the redirect.

---

## 8. Acceptance criteria

- Signing in as `admin@gr.com` lands on `/live-feed` and **cannot** navigate elsewhere; any
  other account is bounced **off** `/live-feed`.
- Left/right show the scraper feed and both user panels with correct live numbers; the
  scraper "live pulse" appears while a fetch run is actively writing `sync_log`.
- Savings match `computeDepositSavings` (Luke ≈ £32,994.45, Suzanne = £53,000) — parity test
  green.
- Averages render: new listings/day (7d & 30d) and likes/day (7d) + likes/week per user.
- On each refresh the layout **rearranges** (scraper side + vertical/horizontal flip, user
  panels reorder, pixel-shift) to mitigate burn-in; respects `prefers-reduced-motion`.
- `node tools/run-intelligence-tests.mjs` is green; WCAG 2.2 AA basics hold (text/icon
  status, focus-visible, `aria-live`, ≥44px targets, contrast via tokens).
- The RPC is **admin-only** (`forbidden` for any other authenticated caller).
