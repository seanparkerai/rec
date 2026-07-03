# 0008. Protect `main`: ruleset against force-push/deletion now; PR-gating only if collaboration grows

Date: 2026-07-03 (step 10.4; owner dashboard action pending)

## Status

Proposed (awaiting the owner's dashboard action — no API surface for branch
protection is available to Claude sessions in this environment)

## State / rail

The `main` branch itself (G1, `plan/02-intake.md` §8.1) and the deploy path
(`.github/workflows/pages.yml`).

## Context

G1 recommends "branch protection + required green CI on `main`, every merge deployable".
Applied literally, GitHub's required-status-checks protection forces a PR-only workflow —
checks cannot run *before* a direct push exists. But this repo's working model (CLAUDE.md §1)
is deliberate trunk-based direct-to-`main` commits by a single owner and Claude sessions;
PR-gating every commit would rewrite that model for no collaborator who needs it. Meanwhile
the real deploy risk is already mitigated: `pages.yml` runs the full harness in its own `test`
job and the deploy job has `needs: test`, so **a red push never deploys** — the site keeps
serving the last green build. The unmitigated risks on `main` are history rewrites
(force-push) and branch deletion.

## Decision

Adopt the protection that fits the workflow: a GitHub **ruleset on `main`** that blocks
force-pushes and branch deletion, while leaving direct pushes allowed. CI remains
post-push-but-pre-deploy (the `needs: test` gate), which satisfies G1's *intent* — no broken
merge ever ships. Full required-status-checks protection (PR-only) is explicitly deferred, to
be revisited if a second regular committer joins.

Owner dashboard steps (≈1 minute):
1. GitHub → `seanparkerai/rec` → **Settings → Rules → Rulesets → New ruleset**.
2. Name `protect-main`, Enforcement **Active**, Target branches → **Include default branch**.
3. Under Rules tick **Block force pushes** and **Restrict deletions**. Leave
   "Require a pull request" and "Require status checks" unticked.
4. Save. (Flip this ADR's Status to Accepted in the same commit that records the action.)

## Consequences

`main`'s history becomes append-only and undeletable; the direct-push working model and the
session ceremonies are untouched; deploys stay gated on green CI. What we give up: nothing
blocks a *red commit from landing on main* (it only blocks it from deploying) — the harness
run before every commit (CLAUDE.md §6) remains the front line. Revisit trigger: a second
committer, or a red-on-main incident that the pre-commit harness discipline failed to catch.
