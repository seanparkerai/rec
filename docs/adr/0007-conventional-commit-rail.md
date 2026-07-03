# 0007. Enforce Conventional Commits with a dependency-free checker, not commitlint

Date: 2026-07-03 (step 10.2)

## Status

Accepted

## State / rail

Commit-message discipline (G3, `plan/02-intake.md` §8.1): `tools/check-commit-msgs.mjs` +
`tests/contract/commit-lint.test.js` + the `commit-lint` job in `.github/workflows/ci.yml`.

## Context

G3 recommended "add commitlint in CI". The repo already writes conventional commits by
convention; what was missing was the mechanical check. commitlint-the-package brings a large
transitive dependency tree into a repo whose doctrine is zero-build leanness (§2.7) and whose
devDependencies are deliberately minimal (jsdom, typescript, opt-in stryker). The needed
grammar — `type(scope)!: subject` over a known type vocabulary — is a one-regex problem.

## Decision

We wrote `tools/check-commit-msgs.mjs`: a dependency-free checker exporting the type
vocabulary (including the repo-specific `data` type used by DB-first content batches), the
header regex, and a git-range runner that reports an unresolvable range as SKIPPED, never as
passing. The grammar is pinned by `tests/contract/commit-lint.test.js` inside the harness, and
an additive `commit-lint` CI job lints the push/PR range. Git-authored machinery lines
(merge/revert/fixup/squash) are exempt. This deviates from G3's literal "commitlint" wording;
the intent — a mechanical Conventional Commits gate in CI — is fully met.

## Consequences

Commit grammar is now a loud diff: extending the type vocabulary means editing the tool AND its
contract test. No new dependencies to audit or update. Cost: we own the grammar edge cases
ourselves; anything genuinely exotic (footers, breaking-change body syntax) is out of scope
until a real need appears.
