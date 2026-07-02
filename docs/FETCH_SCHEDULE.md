# Daily Rightmove fetch — timing & triggering

The fetch (`.github/workflows/fetch-listings.yml` → `tools/fetch-listings.mjs`) runs
**four times a day — 08:00, 12:00, 14:00, 18:00 Europe/London** (England local time),
DST-safe. Each run is identical: a **24-hour recency window** (`MAX_DAYS_SINCE_ADDED=1`)
that simply covers listings posted since the previous pass. The slots just give more
points in the day; nothing else about the fetch changes.

Adjacent (not a fetch — £0): `.github/workflows/remembership.yml` re-computes the stored
listings' geofence fields + `listing_areas` membership after each successful radius-tune
run and weekly (Sun 05:45 UTC), so area/radius changes never leave stale membership.

There are **two** triggers, by design. They cooperate; they never double-charge Apify
within a slot.

## 1. Primary — Supabase `pg_cron` (punctual, second-accurate)

GitHub's hosted cron is best-effort and on this repo fired **3.5–6.5 h late every day**,
so it cannot hit a target local time. The punctual trigger therefore lives in Supabase,
which runs the schedule on the database itself (no queue backlog).

- **Migrations:** `rightmove_noon_london_dispatch` (original) then
  `rightmove_multi_slot_dispatch` (the four-slot extension) — canonical in the MCP
  migration history.
- **What it creates:**
  - `pg_cron` + `pg_net` extensions.
  - `private.trigger_rightmove_fetch(p_slot int default null, p_force boolean default false)`
    — a `SECURITY DEFINER` function in the (REST-hidden) `private` schema. Called with a
    slot hour (8/12/14/18), it fires only when that **slot hour is the current
    Europe/London hour**, reads a GitHub token from **Vault**, and `POST`s to the
    workflow's `workflow_dispatch` API via `pg_net`.
  - `private.fetch_dispatch_slots` — one row per slot hour, enforcing **at most one
    dispatch per slot per London day** (so the two cron wakeups for a slot can never
    double-fire). The legacy single-row `private.fetch_dispatch_state` is kept current
    for the manual RPC + dashboards.
  - **Eight** `cron.job`s — two per slot, `rightmove-fetch-<HHMM>-london-{a,b}`:
    | slot (London) | cron `a` (summer/BST) | cron `b` (winter/GMT) |
    |---------------|-----------------------|-----------------------|
    | 08:00         | `0 7 * * *`           | `0 8 * * *`           |
    | 12:00         | `0 11 * * *`          | `0 12 * * *`          |
    | 14:00         | `0 13 * * *`          | `0 14 * * *`          |
    | 18:00         | `0 17 * * *`          | `0 18 * * *`          |
    The two UTC times bracket each slot across DST; the function's hour guard fires only
    the in-season one (e.g. summer 11:00 UTC = 12:00 BST; winter 12:00 UTC = 12:00 GMT).

Dispatch runs arrive in GitHub Actions as `workflow_dispatch` events and **bypass the
in-workflow gate**, so they run immediately at the slot time.

### One-time setup you must do (storing the token)

The function dispatches nothing until a GitHub token is in Vault. The token is a secret —
create and store it yourself; never paste it into chat or commit it. **It lives only in
Supabase Vault (server-side) — it is never sent to a browser or held on any device.**

1. **Create a GitHub Personal Access Token.** Pick ONE of:

   - **Classic PAT — recommended for "always in place" (never expires).**
     GitHub → *Settings → Developer settings → Personal access tokens → Tokens (classic)
     → Generate new token (classic)*.
     - **Scopes:** `workflow` + `repo` (`repo` is needed to dispatch on a private repo; if
       `seanparkerai/rec` is public, `public_repo` + `workflow` suffices).
     - **Expiration:** **No expiration** — so the trigger never lapses.
     - Trade-off: classic tokens are account-wide in scope; this is mitigated by the token
       living only in Vault.

   - **Fine-grained PAT — more locked-down, but expires (≤ 366 days).**
     GitHub → *…Personal access tokens → Fine-grained tokens → Generate new token*.
     - **Resource owner:** `seanparkerai`; **Repository access:** *Only select repositories*
       → `seanparkerai/rec`.
     - **Permissions → Repository → Actions:** **Read and write**.
     - Set a calendar reminder to rotate before it expires (re-run step 2 to update Vault),
       or the trigger silently stops.

   - **GitHub App — never expires AND repo-scoped (gold standard, more setup).** Ask if you
     want this; it stores an App private key in Vault and mints short-lived tokens on demand.

2. **Store it in Supabase Vault** — Supabase dashboard → *SQL Editor*, run (paste your
   token in place of `PASTE_TOKEN_HERE`):
   ```sql
   select vault.create_secret(
     'PASTE_TOKEN_HERE',
     'github_fetch_dispatch_token',
     'GitHub fine-grained PAT (Actions: read+write) used by pg_cron to dispatch fetch-listings'
   );
   ```
   The function looks the secret up **by name** (`github_fetch_dispatch_token`), so the name
   must match exactly.

3. **Test it immediately** (forces a dispatch, ignoring the slot guard) — SQL Editor:
   ```sql
   select private.trigger_rightmove_fetch(p_force => true);
   ```
   Expect `dispatched: slot=manual request_id=…`. Then check GitHub → *Actions → fetch-listings* for a
   new run triggered by `workflow_dispatch` within a few seconds.

   To rotate the token later, re-run step 2 with `vault.update_secret` (or delete + recreate).

## 1b. Manual trigger from any device — `public.request_rightmove_fetch()`

You can also fire a fetch on demand from **any device**, without a GitHub token on that
device and without opening GitHub at all — you only need to be signed in to the portal
(your normal Supabase login, available on any device).

- **What it is:** a `SECURITY DEFINER` RPC, `public.request_rightmove_fetch()`, executable
  **only by the `authenticated` role** (anon is denied). It reuses the same server-side
  `private.dispatch_fetch_now()` helper, so the GitHub token never leaves Vault.
- **Spam guard:** a 10-minute cooldown (tracked in `private.fetch_dispatch_state.last_manual_at`).
- **Returns:** JSON `{ ok, status, request_id?, retry_after_seconds?, message }`.

Call it from the browser via the Supabase client:
```js
const { data, error } = await supabase.rpc('request_rightmove_fetch');
// data => { ok:true, status:'dispatched', request_id: …, message:'Fetch triggered…' }
```
A friendly "Fetch now" button wired to this RPC (through `storage.js`) is the intended
front-end; until that ships you can call the RPC directly as above.

## 2. Backstop — GitHub `schedule` (free, imprecise)

The workflow keeps its own `schedule` — **eight** UTC ticks, two bracketing each of the
four slots (`0 7`/`0 8`, `0 11`/`0 12`, `0 13`/`0 14`, `0 17`/`0 18`) — plus a
**delay-tolerant, once-per-slot gate**. The gate reads which cron line fired
(`github.event.schedule`), maps it to its slot, applies a floor at the slot's London hour,
and skips if a real fetch already executed today inside that slot's time window
`[slot, next-slot)`. On a normal day the punctual dispatch has already fetched each slot by
the time GitHub's hours-late tick fires, so the gate skips it. The schedule only does real
work for a slot on a day the punctual dispatch failed — a genuine backstop. Full rationale
is in the header comment of `.github/workflows/fetch-listings.yml`.

## Operational notes

- The schedule (and the dispatch endpoint's `ref`) target **`main`** — scheduled GitHub
  workflows only run from the default branch, so the timing changes take effect once merged.
- Inspect the punctual trigger any time:
  ```sql
  select * from cron.job where jobname like 'rightmove-fetch-%-london-%';
  select * from cron.job_run_details where jobid in
    (select jobid from cron.job where jobname like 'rightmove-fetch-%-london-%')
    order by start_time desc limit 20;
  select * from private.fetch_dispatch_slots order by slot_hour;  -- per-slot last_dispatch_on / _at
  select * from private.fetch_dispatch_state;                     -- legacy single-row (manual RPC)
  ```
- Pause the punctual trigger without dropping it (all slots):
  ```sql
  select cron.unschedule(jobid) from cron.job where jobname like 'rightmove-fetch-%-london-%';
  ```
  Or pause a single slot, e.g. 18:00:
  ```sql
  select cron.unschedule('rightmove-fetch-1800-london-a');
  select cron.unschedule('rightmove-fetch-1800-london-b');
  ```
