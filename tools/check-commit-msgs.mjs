#!/usr/bin/env node
// check-commit-msgs.mjs — the conventional-commit rail (overhaul step 10.2; G3,
// docs/archive/plan-2026-07-overhaul/02-intake.md §8.1). Dependency-free by design — see docs/adr/0007: the
// grammar below IS the contract, pinned by tests/contract/commit-lint.test.js,
// so drift is a test failure rather than a transitive-dependency surprise.
//
// Grammar (first line only): type(scope)!: subject
//   - type   ∈ TYPES (the set this repo actually uses — includes `data` for
//     DB-first content batches);
//   - (scope) optional: word chars, dots, slashes, hyphens;
//   - !       optional (breaking change);
//   - subject non-empty after ": ".
//   Merge/revert/fixup/squash machinery lines are exempt (git authors them).
//
// Usage:  node tools/check-commit-msgs.mjs [--range A..B]
//   Default range HEAD~1..HEAD (the commit being made/pushed). CI passes the
//   push range. A shallow/first-push range that git can't resolve is reported
//   as SKIPPED, never as passing (§5.2 "gated honestly").

import { spawnSync } from 'node:child_process';

export const TYPES = ['feat', 'fix', 'docs', 'test', 'refactor', 'perf', 'ci', 'chore', 'build', 'style', 'revert', 'data'];

export const HEADER_RE = new RegExp(`^(?:${TYPES.join('|')})(?:\\([\\w./-]+\\))?!?: \\S.*$`);

// Lines git itself authors — not held to the grammar.
const EXEMPT_RE = /^(Merge |Revert "|fixup! |squash! )/;

export function checkMessages(messages) {
  const problems = [];
  for (const msg of messages) {
    const header = String(msg).split('\n')[0].trim();
    if (!header || EXEMPT_RE.test(header)) continue;
    if (!HEADER_RE.test(header)) {
      problems.push(`"${header}" — expected type(scope): subject with type ∈ {${TYPES.join(', ')}}`);
    }
  }
  return { status: problems.length ? 'fail' : 'pass', problems };
}

export function checkRange({ range = 'HEAD~1..HEAD', exec = spawnSync } = {}) {
  const res = exec('git', ['log', '--no-merges', '--format=%s', range], { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    return { status: 'skipped', problems: [], message: `SKIPPED — could not read range ${range} (${(res.stderr || res.error?.message || '').trim()}); commit lint unrun (NOT passing)` };
  }
  const messages = res.stdout.split('\n').filter(Boolean);
  const r = checkMessages(messages);
  return {
    ...r,
    message: r.status === 'pass'
      ? `${messages.length} commit message(s) in ${range} conform`
      : `non-conventional commit message(s) in ${range}:\n  ${r.problems.join('\n  ')}`,
  };
}

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) {
  const i = process.argv.indexOf('--range');
  const r = checkRange(i > -1 ? { range: process.argv[i + 1] } : {});
  console.log(`[check-commit-msgs] ${r.message}`);
  process.exit(r.status === 'fail' ? 1 : 0);
}
