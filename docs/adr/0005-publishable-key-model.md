# 0005. Commit the publishable key; retire legacy JWT keys in a fixed order

Date: 2026-07-03 (step 9.6; backfilled same day, Phase 10.1)

## Status

Accepted (owner dashboard action outstanding — see Consequences)

## State / rail

`assets/js/supabase-client.js` (committed client credentials) and the platform key model
(docs/SUPABASE_SYNC.md §7).

## Context

Supabase is retiring legacy anon/`service_role` JWT keys in favour of `sb_publishable_*`
(client-safe) and revocable `sb_secret_*` (server-only). The committed client key is safe in a
public repo **iff** RLS is enforced on every table. Verification (9.6) found the client already
on the modern publishable key and the RLS sweep clean — but the legacy anon JWT key still
ENABLED, and injected by the platform as the `SUPABASE_ANON_KEY` that the `ask` edge function
reads, so disabling it immediately would break Ask.

## Decision

The publishable key stays committed (deliberately not gitignored), justified by the
mechanically-verified RLS floor: the sweep
(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity` → must be
empty) is step 1 of the §18.2 session ceremony, and `tools/check-rls.mjs` runs the same
assertion in CI. No secret key is committed anywhere; the only `service_role` consumer reads it
from the environment. Legacy-key retirement follows a fixed order recorded in
docs/SUPABASE_SYNC.md §7: (1) point `ask` at the publishable key via a function secret,
redeploy, smoke-test; (2) only then disable legacy JWT keys.

## Consequences

The client key model matches the platform's target state and any RLS regression is a
stop-everything finding, not a note. Outstanding: the two-step owner dashboard action in
§7 — until it is done, the legacy key remains enabled and this ADR is not fully realised.

**Update 2026-07-03 (later the same day):** the owner disabled the legacy JWT keys ahead of
step 1, temporarily breaking Ask. `index.ts` was repointed the same day (prefers the
`SB_PUBLISHABLE_KEY` function secret, falls back to the committed publishable key) and
redeployed via the new `deploy-ask` CI workflow the same evening — the ADR is fully realised
(owner browser smoke test outstanding; SUPABASE_SYNC.md §7).
