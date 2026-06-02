// listings-fetch.test.js — unit tests for the "Pull listings" dispatch logic
// (assets/js/listings-fetch.js). Covers the pure helpers only; the DOM wiring in
// wireListingsFetch() is exercised by hand / the browser harness.

import { buildDispatchBody, windowLabel, isValidPat } from '../assets/js/listings-fetch.js';

export async function register({ test, assert, assertEqual }) {
  await test('listings-fetch: 24hr button maps to maxDaysSinceAdded=1', () => {
    const body = buildDispatchBody(1);
    assertEqual(body.inputs.max_days_since_added, '1');
    assertEqual(body.ref, 'main');
    // A real pull, not a dry run or foundation backfill.
    assertEqual(body.inputs.dry_run, 'false');
    assertEqual(body.inputs.foundation_mode, 'false');
    assertEqual(body.inputs.search_mode, 'cluster');
  });

  await test('listings-fetch: 3-day button maps to maxDaysSinceAdded=3', () => {
    assertEqual(buildDispatchBody(3).inputs.max_days_since_added, '3');
  });

  await test('listings-fetch: string input is coerced to a number-string', () => {
    assertEqual(buildDispatchBody('3').inputs.max_days_since_added, '3');
  });

  await test('listings-fetch: only Rightmove-valid windows are accepted', () => {
    // 7 and 14 are valid even though no button uses them yet.
    assertEqual(buildDispatchBody(7).inputs.max_days_since_added, '7');
    assertEqual(buildDispatchBody(14).inputs.max_days_since_added, '14');
    for (const bad of [0, 2, 5, 30, NaN, null]) {
      let threw = false;
      try { buildDispatchBody(bad); } catch { threw = true; }
      assert(threw, `expected ${bad} to be rejected (Rightmove accepts 1/3/7/14 only)`);
    }
  });

  await test('listings-fetch: windowLabel reads naturally', () => {
    assertEqual(windowLabel(1), '24-hour');
    assertEqual(windowLabel(3), '3-day');
  });

  await test('listings-fetch: PAT prefixes are validated', () => {
    assert(isValidPat('ghp_abc123'), 'classic PAT accepted');
    assert(isValidPat('github_pat_abc123'), 'fine-grained PAT accepted');
    assert(isValidPat('  ghp_trimmed  '), 'surrounding whitespace tolerated');
    assert(!isValidPat(''), 'empty rejected');
    assert(!isValidPat('xoxb-not-github'), 'non-GitHub token rejected');
  });
}
