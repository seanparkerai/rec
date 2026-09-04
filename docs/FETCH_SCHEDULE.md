# Rightmove fetch — triggering (manual only since 2026-09-04)

**No Apify run starts by itself.** Owner directive 2026-09-04, recorded as `docs/adr/0012`.
Every fetch (`.github/workflows/fetch-listings.yml` → `tools/fetch-listings.mjs`) begins with a
person pressing a button and confirming. The mechanically enforced rail is
`tests/contract/no-automatic-apify-runs.test.js`.

## 0. How a fetch starts today

| Where | What | Confirmation |
|-------|------|--------------|
| Listings page (`pages/listings.html`) | "Pull listings" 24hr / 3d / 7d / 14d | native `<dialog>` in `assets/js/listings/fetch.js` → RPC `public.request_rightmove_fetch(p_days)` |
| Search profiles page | "Run now" on a profile | native `<dialog>` in `assets/js/page-search-profiles.js` → RPC `public.request_profile_fetch(id)` |
| GitHub → Actions → fetch-listings | "Run workflow" (all inputs) | GitHub's own dispatch form |
| GitHub → Actions → probe-rightmove / foundation-rural-thin / import-apify-runs | "Run workflow" | GitHub's own dispatch form |

The two RPCs are `SECURITY DEFINER`, `authenticated`-only, share a 10-minute cooldown
(`private.fetch_dispatch_state.last_manual_at`), and both call a server-side helper that reads the
GitHub token from **Vault** and `POST`s the workflow's `workflow_dispatch` API via `pg_net`. No
GitHub token ever reaches a browser. `fetch_control.fetch_enabled` (the admin "All searching"
switch) still gates every fetch, manual ones included.

## 1. What was switched off — and how to switch it back on

Before 2026-09-04 fetches ran **six times a day** (08:00, 10:00, 12:00, 14:00, 18:00, 21:00
Europe/London) from two cooperating triggers. Both are now off:

- **Supabase `pg_cron` (the punctual trigger).** The twelve jobs
  `rightmove-fetch-<HHMM>-london-{a,b}` (two per slot, bracketing DST) still exist but are
  **inactive** (`cron.job.active = false`), and their target
  `private.trigger_rightmove_fetch(p_slot)` **refuses to dispatch** while
  `fetch_control.auto_fetch_enabled` is false. Two independent locks; either alone is enough.
- **GitHub `schedule` (the backstop).** Removed from `fetch-listings.yml` along with its
  once-per-slot gate and the `push` trigger on the workflow file. Bringing it back needs an ADR
  superseding 0012 — the rail test fails on any `schedule:` key in an Apify-capable workflow.
- **`push` on `.github/probe-request.txt`.** Removed; that file is now only a fallback for blank
  probe dispatch inputs.

**To re-arm the daily pulls:** admin → `live-feed/search-control.html` → **Automatic fetches →
Switch on** → confirm. That calls `public.admin_set_auto_fetch_enabled(true)`, which sets the flag
**and** re-activates all twelve cron jobs in one transaction. Switch off the same way (no
confirmation needed to stop). Equivalent SQL, for the SQL Editor:

```sql
select public.admin_set_auto_fetch_enabled(true);    -- or false
select auto_fetch_enabled from public.fetch_control;
select jobname, active from cron.job where jobname like 'rightmove-fetch-%-london-%';
```

When re-armed, the pg_cron path behaves exactly as before: each slot fires only in its
Europe/London hour, once per London day (`private.fetch_dispatch_slots`), and lands in GitHub
as a `workflow_dispatch` run.

### The dispatch token (unchanged)

The Vault secret `github_fetch_dispatch_token` is a classic GitHub PAT (`repo` + `workflow`,
no expiration, rotated 2026-07-15). It serves the manual RPCs as well as the (currently
inactive) cron path, so it stays in place. To rotate:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'github_fetch_dispatch_token'),
  new_secret := 'PASTE_TOKEN_HERE',
  new_description := 'GitHub classic PAT (repo+workflow), NO EXPIRATION, rotated YYYY-MM-DD'
);
-- test (a deliberate manual dispatch; p_force bypasses the auto_fetch_enabled lock):
select private.trigger_rightmove_fetch(p_force => true);
select status_code from net._http_response order by id desc limit 1;  -- expect 204
```

## 2. Sentinel

`.github/workflows/dispatch-sentinel.yml` still runs nightly (it is a read-only check, not a
fetch). It first reads `fetch_control.auto_fetch_enabled`; while that is **false** it logs
"automatic fetches are switched off — nothing to guard" and exits green. Only when automatic
fetches are **on** does it fail red if no `workflow_dispatch` fetch ran in the trailing 26 h —
the signal that the pg_cron → GitHub path has died (dead token, pg_cron outage, Vault edit).

## 3. Adjacent, not a fetch (£0)

`.github/workflows/remembership.yml` re-computes stored listings' geofence fields +
`listing_areas` membership after each successful radius-tune run and weekly;
`review-counts.yml` recomputes pending counts hourly and after each fetch. Neither touches Apify.

## Operational notes

- Inspect the cron path any time:
  ```sql
  select jobname, schedule, active from cron.job where jobname like 'rightmove-fetch-%-london-%';
  select * from private.fetch_dispatch_slots order by slot_hour;  -- per-slot last dispatch
  select * from private.fetch_dispatch_state;                     -- manual RPC cooldown state
  select auto_fetch_enabled, fetch_enabled, legacy_enabled from public.fetch_control;
  ```
- Never re-activate the cron jobs by hand with `cron.alter_job` — use the RPC (or the panel) so
  the flag and the jobs stay in lockstep.
