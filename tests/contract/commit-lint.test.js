// commit-lint.test.js — pins the conventional-commit rail's grammar (step 10.2, G3).
// The checker is dependency-free (docs/adr/0007), so this suite IS the spec: any
// change to the accepted grammar or the type vocabulary must show up here as a
// deliberate diff. Pure Node; the git-range reader is exercised with a stubbed exec.
import { TYPES, checkMessages, checkRange } from '../../tools/check-commit-msgs.mjs';

export async function register({ test, assert, assertEqual }) {
  test('commit-lint: type vocabulary is pinned (incl. the repo-specific `data`)', () => {
    assertEqual(TYPES.sort().join(','), 'build,chore,ci,data,docs,feat,fix,perf,refactor,revert,style,test');
  });

  test('commit-lint: real house-style headers pass', () => {
    const r = checkMessages([
      'feat(types): 9.7 — generated Supabase row types wired into tier-0 (R4/E4)',
      'docs(plan): Phase 10 expanded on entry (§0.2 mode-2) — reality-checked backlog 10.1-10.7',
      'data(areas): 6.6 missing-field sweep — 16× schools researched',
      'fix(ask): 8.5 — Compose a11y pass: label the free-text address input',
      'refactor!: drop the legacy outreach grid',
      'ci: bump runners',
    ]);
    assertEqual(r.status, 'pass', r.problems.join('; '));
  });

  test('commit-lint: bad headers fail and are named', () => {
    const r = checkMessages([
      'L7.3: resolve per-village Rightmove identifiers (CI) [skip ci]', // legacy style
      'update stuff',                 // no type
      'feat:missing space',           // no space after colon
      'feat(): empty scope',          // empty scope
      'unknown(scope): not a type',   // type outside vocabulary
      'feat(scope):   ',              // empty subject
    ]);
    assertEqual(r.status, 'fail');
    assertEqual(r.problems.length, 6);
    assert(r.problems[0].includes('L7.3'), 'names the offending header');
  });

  test('commit-lint: git-authored machinery lines are exempt', () => {
    const r = checkMessages([
      'Merge branch \'claude/foo\' into main',
      'Revert "feat(x): thing"',
      'fixup! feat(x): thing',
      'squash! feat(x): thing',
      '', // empty line from log parsing
    ]);
    assertEqual(r.status, 'pass', r.problems.join('; '));
  });

  test('commit-lint: unreadable range → honest skip (never reported as passing)', () => {
    const exec = () => ({ status: 128, stdout: '', stderr: 'fatal: bad revision' });
    const r = checkRange({ range: 'deadbeef..HEAD', exec });
    assertEqual(r.status, 'skipped');
    assert(/NOT passing/.test(r.message), 'skip message says unrun ≠ passing');
  });

  test('commit-lint: range reader feeds messages through the grammar', () => {
    const exec = () => ({ status: 0, stdout: 'feat(a): good\nbad message\n', stderr: '' });
    const r = checkRange({ range: 'HEAD~2..HEAD', exec });
    assertEqual(r.status, 'fail');
    assertEqual(r.problems.length, 1);
  });
}
