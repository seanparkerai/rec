# Daily Rightmove fetch — timing & triggering

The daily fetch (`.github/workflows/fetch-listings.yml` → `tools/fetch-listings.mjs`)
is meant to run **once a day at 12:00 noon Europe/London** (England local time), DST-safe.

There are **two** triggers, by design. They cooperate; they never double-charge Apify.

## 1. Primary — Supabase `pg_cron` (punctual, second-accurate)

GitHub's hosted cron is best-effort and on this repo fired **3.5–6.5 h late every day**,
so it cannot hit noon. The punctual trigger therefore lives in Supabase, which runs the
schedule on the database itself (no queue backlog).

- **Migration:** `rightmove_noon_london_dispatch` (canonical in the MCP migration history).
- **What it creates:**
  - `pg_cron` + `pg_net` extensions.
  - `private.trigger_rightmove_fetch(p_force boolean default false)` — a `SECURITY DEFINER`
    function in the (REST-hidden) `private` schema. It fires only in the **noon hour
    Europe/London**, reads a GitHub token from **Vault**, and `POST`s to the workflow's
    `workflow_dispatch` API via `pg_net`.
  - `private.fetch_dispatch_state` — a single-row table enforcing **at most one dispatch
    per London day** (so the two cron wakeups can never double-fire).
  - Two `cron.job`s — `rightmove-fetch-noon-london-a` (`0 11 * * *`) and
    `-b` (`0 12 * * *`). These UTC times bracket noon London across DST; the function's
    hour guard fires only the in-season one (summer 11:00 UTC = 12:00 BST; winter
    12:00 UTC = 12:00 GMT).

Dispatch runs arrive in GitHub Actions as `workflow_dispatch` events and **bypass the
in-workflow gate**, so they run immediately at noon.

### One-time setup you must do (storing the token)

The function dispatches nothing until a GitHub token is in Vault. The token is a secret —
create and store it yourself; never paste it into chat or commit it.

1. **Create a fine-grained GitHub Personal Access Token**
   GitHub → *Settings → Developer settings → Personal access tokens → Fine-grained tokens
   → Generate new token*.
   - **Resource owner:** `seanparkerai`
   - **Repository access:** *Only select repositories* → `seanparkerai/rec`
   - **Permissions → Repository → Actions:** **Read and write** (this is what allows
     `workflow_dispatch`).
   - **Expiration:** your choice (note the renewal date; the trigger stops when it expires).
   - Generate and copy the token (starts `github_pat_…`).

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

3. **Test it immediately** (forces a dispatch, ignoring the noon guard) — SQL Editor:
   ```sql
   select private.trigger_rightmove_fetch(true);
   ```
   Expect `dispatched: request_id=…`. Then check GitHub → *Actions → fetch-listings* for a
   new run triggered by `workflow_dispatch` within a few seconds.

   To rotate the token later, re-run step 2 with `vault.update_secret` (or delete + recreate).

## 2. Backstop — GitHub `schedule` (free, imprecise)

The workflow keeps its own `schedule` (`0 11` + `0 12` UTC) plus a **delay-tolerant,
once-per-day gate**. On a normal day the punctual dispatch has already fetched by the time
GitHub's hours-late schedule tick fires, so the gate skips it. The schedule only does real
work on a day the punctual dispatch failed — a genuine backstop. Full rationale is in the
header comment of `.github/workflows/fetch-listings.yml`.

## Operational notes

- The schedule (and the dispatch endpoint's `ref`) target **`main`** — scheduled GitHub
  workflows only run from the default branch, so the timing changes take effect once merged.
- Inspect the punctual trigger any time:
  ```sql
  select * from cron.job where jobname like 'rightmove-fetch-noon-london%';
  select * from cron.job_run_details where jobid in
    (select jobid from cron.job where jobname like 'rightmove-fetch-noon-london%')
    order by start_time desc limit 10;
  select * from private.fetch_dispatch_state;   -- last_dispatch_on / _at
  ```
- Pause the punctual trigger without dropping it:
  ```sql
  select cron.unschedule('rightmove-fetch-noon-london-a');
  select cron.unschedule('rightmove-fetch-noon-london-b');
  ```
