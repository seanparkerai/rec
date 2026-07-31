// fetch-zero-retry.test.js — the SILENT-EMPTY rail (2026-07-31 audit, wave 3).
//
// The bug this pins: the Apify actor sometimes completes SUCCESSFULLY with an empty
// dataset — no HTTP error, no exception, just nothing. The fetcher only ever caught
// thrown errors, so a silently-failed search landed in the run log as a clean
// `raw 0 → in-buffer 0 → unique 0`, identical to a genuinely quiet rural search, and
// the run still exited green. That is the same silent-hole class as the off-ladder
// radius bug, and unlike a guess it is PROVEN from production:
//
//   target                              1-day run (16:16)   14-day run (17:17)
//   SP4:gomeldon-sp4+1        r=3.7mi         raw 7               raw 0
//   SP3:little-langford-sp3+2 r=4.6mi         raw 5               raw 0
//
// Same target, same identifier, same radius, same band — only the recency window
// differed. A 14-day window is a strict SUPERSET of a 1-day window, so returning
// FEWER results from the wider one is impossible: those calls silently failed.
//
// The rail: a zero-result search is retried once before being believed. A genuinely
// empty search stays empty (so tiny hamlets still report zero honestly); a flaky one
// recovers. It is close to free — the actor bills per RESULT, so this only ever
// re-runs searches that returned none.
//
// APIFY_TOKEN and the retry settings are read at MODULE LOAD, so the fetcher is
// imported dynamically here, after the environment is staged.

export async function register({ test, assert, assertEqual }) {
  const realFetch = globalThis.fetch;
  const realToken = process.env.APIFY_TOKEN;
  const realDelay = process.env.ZERO_RETRY_DELAY_MS;
  const realFlag = process.env.ZERO_RETRY;

  process.env.APIFY_TOKEN = 'test-token';
  process.env.ZERO_RETRY_DELAY_MS = '0';
  delete process.env.ZERO_RETRY;                       // default = ON
  const mod = await import(`../../tools/fetch-listings.mjs?zero-retry=${Date.now()}`);
  const { fetchRawForOutcode, zeroRetryStats } = mod;

  const withStub = async (responses, fn) => {
    let calls = 0;
    globalThis.fetch = async () => {
      const body = responses[Math.min(calls, responses.length - 1)];
      calls += 1;
      return { ok: true, json: async () => body };
    };
    try { return { result: await fn(), calls: () => calls }; }
    finally { globalThis.fetch = realFetch; }
  };

  await test('fetch-zero-retry: a silent empty dataset is retried, and recovers', async () => {
    const before = zeroRetryStats();
    const { result, calls } = await withStub([[], [{ id: 'a' }, { id: 'b' }]],
      () => fetchRawForOutcode('POSTCODE^1'));
    assertEqual(calls(), 2, 'an empty first response must trigger exactly one retry');
    assertEqual(result.length, 2, 'the retry result is what the run uses — this is coverage that was being lost');
    const after = zeroRetryStats();
    assertEqual(after.run - before.run, 1, 'the retry is counted for the run summary');
    assertEqual(after.recovered - before.recovered, 1, 'a recovery is counted so flakiness stays visible');
  });

  await test('fetch-zero-retry: a genuinely empty search stays empty (no false positives)', async () => {
    const before = zeroRetryStats();
    const { result, calls } = await withStub([[], []], () => fetchRawForOutcode('POSTCODE^2'));
    assertEqual(calls(), 2, 'retried once');
    assertEqual(result.length, 0, 'a truly quiet area must still report zero honestly');
    const after = zeroRetryStats();
    assertEqual(after.run - before.run, 1, 'the attempt is counted');
    assertEqual(after.recovered - before.recovered, 0, 'nothing recovered — not a false positive');
  });

  await test('fetch-zero-retry: a non-empty first call is never re-run (no extra spend)', async () => {
    const { result, calls } = await withStub([[{ id: 'a' }], [{ id: 'ignored' }]],
      () => fetchRawForOutcode('POSTCODE^3'));
    assertEqual(calls(), 1, 'a search that returned results must never be billed twice');
    assertEqual(result.length, 1, 'first response is used verbatim');
  });

  await test('fetch-zero-retry: the retry is ON by default, and ZERO_RETRY=0 disables it', async () => {
    // An opt-in guard against a SILENT failure protects nobody, so the default must
    // be on — that is what the three tests above already exercise. The escape hatch
    // exists for a cost emergency; pin that it genuinely switches the retry off.
    process.env.ZERO_RETRY = '0';
    const off = await import(`../../tools/fetch-listings.mjs?zero-off=${Date.now()}`);
    const { calls } = await withStub([[], [{ id: 'a' }]], () => off.fetchRawForOutcode('POSTCODE^4'));
    assertEqual(calls(), 1, 'ZERO_RETRY=0 must skip the retry entirely');
    delete process.env.ZERO_RETRY;
  });

  // Restore the ambient environment for the rest of the suite.
  if (realToken === undefined) delete process.env.APIFY_TOKEN; else process.env.APIFY_TOKEN = realToken;
  if (realDelay === undefined) delete process.env.ZERO_RETRY_DELAY_MS; else process.env.ZERO_RETRY_DELAY_MS = realDelay;
  if (realFlag === undefined) delete process.env.ZERO_RETRY; else process.env.ZERO_RETRY = realFlag;
}
