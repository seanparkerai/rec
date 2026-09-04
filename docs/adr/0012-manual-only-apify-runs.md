# 0012. Apify runs start only from a confirmed button press — never on a schedule

Date: 2026-09-04

## Status

Accepted

## State / rail

- `.github/workflows/fetch-listings.yml`, `probe-rightmove.yml`, `foundation-rural-thin.yml`,
  `import-apify-runs.yml` — every workflow handed `APIFY_TOKEN` (§16 guard-railed files).
- `.github/workflows/dispatch-sentinel.yml` — the punctual-trigger watchdog.
- Supabase: `fetch_control.auto_fetch_enabled`, `private.trigger_rightmove_fetch`,
  `public.admin_set_auto_fetch_enabled`, the twelve `rightmove-fetch-*-london-*` pg_cron jobs
  (migrations `disable_automatic_rightmove_fetch_cron`, `auto_fetch_kill_switch`).
- Front end: `live-feed/search-control.html` → "Automatic fetches" switch.
- New rail: `tests/contract/no-automatic-apify-runs.test.js`.

## Context

Until today a Rightmove fetch (an Apify actor run, billed per result) could start four ways
without anyone pressing anything: twelve Supabase `pg_cron` jobs dispatching six daily slots,
twelve GitHub `schedule` ticks as a backstop, a `push` trigger on the fetch workflow file itself,
and a `push` trigger on `.github/probe-request.txt` that could fire a *paid* probe from a commit.
The owner directed that every Apify run must now require a deliberate button press and a
confirmation, with the ability to switch the automation back on from the portal.

## Decision

We will remove every non-manual trigger from every Apify-capable workflow: each keeps exactly
one trigger, `workflow_dispatch`. The GitHub `schedule` backstop and its once-per-slot gate are
deleted rather than commented out, so a stale gate cannot outlive its schedule.

We will keep the twelve `pg_cron` jobs but **deactivate** them, and make their target function
refuse to dispatch while `fetch_control.auto_fetch_enabled` is false (default). The function's
`p_force` path — a human typing SQL — is exempt. One admin RPC,
`admin_set_auto_fetch_enabled(bool)`, flips the flag and the cron jobs' `active` state together,
so the two can never disagree.

We will expose that RPC as a third global switch on the admin Search-control panel, "Automatic
fetches", resting OFF. Switching it **on** confirms (it is the spend decision); switching off
does not. The existing manual paths — the Listings "Pull" buttons and each profile's "Run now",
both behind native `<dialog>` confirmations — are unchanged and remain the only way a fetch starts.

The dispatch sentinel will read the flag and stand down (green, with a notice) while automatic
fetches are off, so the owner is not emailed nightly about an absence that is intended.

## Consequences

- No fetch runs unless a person confirms one. Listings go stale between manual pulls; the
  14-day "Pull" window is the catch-up.
- Re-arming is one confirmed press in the admin panel. It restores the punctual pg_cron path
  only; the GitHub schedule backstop is gone and would need its own ADR to return.
- `tests/contract/no-automatic-apify-runs.test.js` fails `npm test` if any Apify-capable
  workflow regains a `schedule`/`push`/`workflow_run` trigger, if a front-end dispatch path loses
  its confirmation, or if the sentinel stops honouring the flag.
- Revisit if the owner wants scheduled pulls back as the default (supersede this ADR) or if a
  cheaper "monitoring" fetch mode makes unattended runs worth their cost again.
