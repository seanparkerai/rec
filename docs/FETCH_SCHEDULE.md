# Daily Rightmove fetch — timing & triggering

The fetch (`.github/workflows/fetch-listings.yml` → `tools/fetch-listings.mjs`) runs
**six times a day — 08:00, 10:00, 12:00, 14:00, 18:00, 21:00 Europe/London** (England
local time), DST-safe. Each run is identical: a **24-hour recency window**
(`MAX_DAYS_SINCE_ADDED=1`) that simply covers listings posted since the previous pass.
The slots just give more points in the day; nothing else about the fetch changes.

The 10:00 and 21:00 slots were added 2026-07-15 (owner decision, migration
`rightmove_six_slot_dispatch`): 30 days of `listings.first_seen` data showed manual
evening pulls (19:00–22:15) were the highest-yield fetches of the day — agents keep
publishing after 18:00, which otherwise sat invisible until 08:00 — and near-daily
manual mid-morning pulls filled the 08:00→12:00 gap. The two slots exist to replace
that manual-trigger habit; the "Fetch now" RPC/button (§1b) remains for exceptions.

Adjacent (not a fetch — £0): `.github/workflows/remembership.yml` re-computes the stored
listings' geofence fields + `listing_areas` membership after each successful radius-tune
run and weekly (Sun 05:45 UTC), so area/radius changes never leave stale membership.

There are **two** triggers, by design. They cooperate; they never double-charge Apify
within a slot.

## 1. Primary — Supabase `pg_cron` (punctual, second-accurate)

GitHub's hosted cron is best-effort and on this repo fired **3.5–6.5 h late every day**,
so it cannot hit a target local time. The punctual trigger therefore lives in Supabase,
which runs the schedule on the database itself (no queue backlog).

- **Migrations:** `rightmove_noon_london_dispatch` (original), then
  `rightmove_multi_slot_dispatch` (the four-slot extension), then
  `rightmove_six_slot_dispatch` (added 10:00 + 21:00) — canonical in the MCP
  migration history.
- **What it creates:**
  - `pg_cron` + `pg_net` extensions.
  - `private.trigger_rightmove_fetch(p_slot int default null, p_force boolean default false)`
    — a `SECURITY DEFINER` function in the (REST-hidden) `private` schema. Called with a
    slot hour (8/10/12/14/18/21), it fires only when that **slot hour is the current
    Europe/London hour**, reads a GitHub token from **Vault**, and `POST`s to the
    workflow's `workflow_dispatch` API via `pg_net`.
  - `private.fetch_dispatch_slots` — one row per slot hour, enforcing **at most one
    dispatch per slot per London day** (so the two cron wakeups for a slot can never
    double-fire). The legacy single-row `private.fetch_dispatch_state` is kept current
    for the manual RPC + dashboards.
  - **Twelve** `cron.job`s — two per slot, `rightmove-fetch-<HHMM>-london-{a,b}`:
    | slot (London) | cron `a` (summer/BST) | cron `b` (winter/GMT) |
    |---------------|-----------------------|-----------------------|
    | 08:00         | `0 7 * * *`           | `0 8 * * *`           |
    | 10:00         | `0 9 * * *`           | `0 10 * * *`          |
    | 12:00         | `0 11 * * *`          | `0 12 * * *`          |
    | 14:00         | `0 13 * * *`          | `0 14 * * *`          |
    | 18:00         | `0 17 * * *`          | `0 18 * * *`          |
    | 21:00         | `0 20 * * *`          | `0 21 * * *`          |
    The two UTC times bracket each slot across DST; the function's hour guard fires only
    the in-season one (e.g. summer 11:00 UTC = 12:00 BST; winter 12:00 UTC = 12:00 GMT).

Dispatch runs arrive in GitHub Actions as `workflow_dispatch` events and **bypass the
in-workflow gate**, so they run immediately at the slot time.

### The dispatch token (in place — no action needed)

The Vault secret `github_fetch_dispatch_token` holds a **classic GitHub PAT with
"No expiration"** (scopes `repo` + `workflow`), rotated **2026-07-15** (owner decision —
replacing the 30-day token that triggered an expiry warning). Being non-expiring, the
trigger can never lapse on a calendar; the account-wide scope of a classic token is
mitigated because **it lives only in Supabase Vault (server-side) — it is never sent to a
browser, held on any device, or committed anywhere**. The dispatch function looks the
secret up **by name**, so rotation is invisible to the rest of the machinery. Death of the
token (revocation, GitHub-side reset) is caught within a day by the dispatch sentinel (§3).

**To rotate** (only needed if the token is ever revoked/compromised): create a new classic
PAT (*GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)*,
scopes `repo` + `workflow`, Expiration **No expiration**), then in the Supabase SQL Editor:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'github_fetch_dispatch_token'),
  new_secret := 'PASTE_TOKEN_HERE',
  new_description := 'GitHub classic PAT (repo+workflow), NO EXPIRATION, rotated YYYY-MM-DD'
);
```

**Then test immediately** (forces a dispatch, ignoring the slot guard):

```sql
select private.trigger_rightmove_fetch(p_force => true);
-- expect: dispatched: slot=manual request_id=<n>
select status_code from net._http_response order by id desc limit 1;  -- expect 204
```

and confirm GitHub → *Actions → fetch-listings* shows a new `workflow_dispatch` run within
a few seconds. (Alternatives considered and parked: fine-grained PAT = repo-scoped but
forces an annual repaste; GitHub App = scoped + non-expiring but adds a token-minting
service. The no-expiry classic PAT is the fewest-moving-parts permanent option.)

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

The workflow keeps its own `schedule` — **twelve** UTC ticks, two bracketing each of the
six slots (`0 7`/`0 8`, `0 9`/`0 10`, `0 11`/`0 12`, `0 13`/`0 14`, `0 17`/`0 18`,
`0 20`/`0 21`) — plus a
**delay-tolerant, once-per-slot gate**. The gate reads which cron line fired
(`github.event.schedule`), maps it to its slot, applies a floor at the slot's London hour,
and skips if a real fetch already executed today inside that slot's time window
`[slot, next-slot)`. On a normal day the punctual dispatch has already fetched each slot by
the time GitHub's hours-late tick fires, so the gate skips it. The schedule only does real
work for a slot on a day the punctual dispatch failed — a genuine backstop. Full rationale
is in the header comment of `.github/workflows/fetch-listings.yml`.

## 3. Sentinel — the trigger can never die silently

`.github/workflows/dispatch-sentinel.yml` (added 2026-07-15) runs nightly (22:30 UTC tick;
GitHub cron lateness only delays the alert) and **fails loudly if no
`workflow_dispatch`-triggered fetch ran in the trailing 26 h** — GitHub emails the owner
about any red run automatically. That converts every silent-death mode of the punctual
trigger (revoked/expired token, pg_cron outage, Vault edit, `pg_net` regression) into a
next-day email, while the §2 schedule backstop keeps listings flowing (late) in the
meantime. It uses only the built-in `github.token` — no secrets, nothing that can expire.
Diagnosis recipes live in the workflow's header comment and §1 above.

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
