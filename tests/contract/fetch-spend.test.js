// fetch-spend.test.js — the Apify spend rail (step 10.3; docs/archive/plan-2026-07-overhaul/04-program.md §4
// "MISSING RAIL: Apify/fetch spend"). Real money: the fetcher bills per result.
// This suite makes every spend parameter a LOUD diff — a refactor or env-default
// change that uncaps the budget, raises the per-target result cap, or drops the
// hard cap fails the harness instead of the bank account.
//
// 2026-08-27: rewritten after probe H read the LIVE actor schema. This rail spent
// its whole life pinning `maxItems` and `maxBudget`, neither of which exists on
// the actor — it was green while guarding two no-ops. Assertions now pin the real
// fields (maxProperties, fullPropertyDetails) and the real run option
// (maxTotalChargeUsd). See docs/PHASE0-PROBE-FINDINGS.md.
// Demand gating (the other spend lever) is pinned in tests/unit/fetch-listings
// and tests/characterization/fetch-targets; the active-link gate lives in
// network functions, so it is pinned here at source level.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildActorInput, roundMaxProperties, APIFY_MAX_BUDGET_USD, RESULTS_PER_OUTCODE } from '../../tools/fetch-listings.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = resolve(ROOT, 'tools/fetch-listings.mjs');
const src = readFileSync(TOOL, 'utf8');

export async function register({ test, assert, assertEqual }) {
  test('fetch-spend: default hard budget cap is $25 and per-target cap is 50', () => {
    // The harness runs without these env vars, so the module-load values ARE the defaults.
    assertEqual(APIFY_MAX_BUDGET_USD, 25, 'APIFY_MAX_BUDGET_USD default changed — deliberate spend decision required');
    assertEqual(RESULTS_PER_OUTCODE, 50, 'RESULTS_PER_OUTCODE default changed — deliberate spend decision required');
  });

  // REWRITTEN 2026-08-27 (docs/PHASE0-PROBE-FINDINGS.md). This suite previously
  // pinned `maxItems` and `maxBudget` as "the two cost levers". Probe H read the
  // live actor's input schema: NEITHER FIELD EXISTS on it. Both were silently
  // ignored, so this rail was guarding two no-ops while the actor ran at its own
  // maxProperties default of 1000 and no USD cap applied at all. The rail was
  // green throughout. A test that pins the wrong field is worse than no test —
  // it manufactures confidence. These assertions pin the fields the actor and
  // platform actually honour.
  test('fetch-spend: every actor input carries the levers the actor really reads', () => {
    const input = buildActorInput('OUTCODE^123');
    assertEqual(input.maxProperties, 50, 'maxProperties must be the per-target cap (maxItems is not in the actor schema)');
    assertEqual(input.fullPropertyDetails, false, 'fullPropertyDetails must stay off — it is a 5x CHARGE multiplier');
    assertEqual(input.includePriceHistory, false, 'includePriceHistory must stay off (it re-bills)');
    assert(!('maxItems' in input), 'maxItems is not in the actor schema — sending it is a silent no-op that reads as a cap');
    assert(!('maxBudget' in input), 'maxBudget is not an actor field nor a run option — the real cap is maxTotalChargeUsd');
    assert(Array.isArray(input.listUrls) && input.listUrls.length === 1, 'one search URL per target');
  });

  test('fetch-spend: maxProperties is rounded to the actor grain of 50', () => {
    // The actor rounds to the nearest 50 internally. If we do not round too, the
    // cap we log is not the cap that applies, and an unpredictable cap is not one.
    assertEqual(roundMaxProperties(50), 50, 'exact grain unchanged');
    assertEqual(roundMaxProperties(1000), 1000, 'exact grain unchanged');
    assertEqual(roundMaxProperties(74), 50, 'rounds to nearest 50');
    assertEqual(roundMaxProperties(76), 100, 'rounds to nearest 50');
    assertEqual(roundMaxProperties(0), 50, 'never 0 — the actor would read that as unlimited');
    assertEqual(roundMaxProperties(-5), 50, 'never negative');
    assertEqual(roundMaxProperties(NaN), 50, 'never NaN');
  });

  test('fetch-spend: the hard USD cap is a RUN OPTION on the request URL, not an input field', () => {
    // maxTotalChargeUsd caps the total charged across every pricing model;
    // maxItems only ever applied to pay-per-result actors, and this one is
    // pay-per-event. Pinned textually because it lives inside a network function.
    assert(/maxTotalChargeUsd=\$\{encodeURIComponent\(APIFY_MAX_BUDGET_USD\)\}/.test(src),
      'apifyCall must pass maxTotalChargeUsd as a run option — without it there is NO hard spend cap');
    assert(/[?&]memory=256/.test(src),
      'memory must be pinned at 256MB — above that the charge multiplier scales');
  });

  test('fetch-spend: a failed Apify call carries the response body', () => {
    // Discarding the body is why three weeks of total failure presented as an
    // opaque `apify HTTP 403` instead of "Monthly usage hard limit exceeded".
    assert(/apify HTTP \$\{res\.status\}\$\{detail\}/.test(src),
      'the thrown error must include the response body — the cause lives in it');
  });

  test('fetch-spend: PLAN_ONLY returns BEFORE any Apify call', () => {
    // DRY_RUN is not a free mode — it fetches for real and skips only the writes,
    // which cost 155 attempted billable calls when a "dry run" was assumed free.
    // PLAN_ONLY is the mode that genuinely spends nothing, so its early return
    // must stay ahead of the fetch loop.
    const planIdx = src.indexOf('PLAN ONLY — stopping before any Apify call');
    const fetchIdx = src.indexOf('await fetchRawForOutcode(');
    assert(planIdx > 0, 'PLAN_ONLY must announce itself');
    assert(planIdx < fetchIdx, 'the PLAN_ONLY return must come before the first fetch call');
    assert(!/DRY RUN — no Apify calls/.test(src),
      'the old banner claimed DRY_RUN made no Apify calls; it does make them');
  });

  test('fetch-spend: the global kill switch fails CLOSED', () => {
    // Opposite latch to householdAreasOk on purpose: a demand-gate outage must
    // not zero a run, but a spend-gate outage must not authorise one.
    assert(/fetch_control\?select=fetch_enabled/.test(src), 'fetchEnabled must read the fetch_control singleton');
    assert(/spend gate fails closed/.test(src), 'the fail-closed behaviour must stay documented at the point it happens');
    assert(/if \(!\(await fetchEnabled\(\)\)\)/.test(src), 'main() must consult the kill switch before spending');
  });

  test('fetch-spend: env overrides reach the constants (real subprocess import)', () => {
    const res = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import('${TOOL.replace(/\\/g, '/')}').then(m => console.log(m.APIFY_MAX_BUDGET_USD, m.RESULTS_PER_OUTCODE));`,
    ], { encoding: 'utf8', env: { ...process.env, APIFY_MAX_BUDGET_USD: '7', RESULTS_PER_OUTCODE: '10' } });
    assertEqual(res.status, 0, `subprocess failed: ${res.stderr}`);
    assertEqual(res.stdout.trim(), '7 10', 'env overrides must reach APIFY_MAX_BUDGET_USD / RESULTS_PER_OUTCODE');
  });

  test('fetch-spend: demand-set gate is present at source (active-only)', () => {
    // This lives inside network functions (household_areas fetch + demand-set
    // builder), so pin the load-bearing line textually: only active household
    // links create demand. The old origin-area exclusion was REMOVED (ADR 0009)
    // — every active link is demand; a reappearing is_origin gate is a regression.
    assert(/household_areas\?status=eq\.active/.test(src),
      'household_areas read no longer filters status=eq.active — paused areas would stay in the demand set');
    assert(!/is_origin/.test(src),
      'is_origin resurfaced in the fetcher — the origin mechanic was removed (ADR 0009)');
  });

  test('fetch-spend: the hard cap is documented as env-tunable, not hardcoded elsewhere', () => {
    // Exactly one derivation site for each constant (the `|| default` expression).
    assertEqual([...src.matchAll(/APIFY_MAX_BUDGET_USD\) \|\| \d+/g)].length, 1, 'one derivation site for APIFY_MAX_BUDGET_USD');
    assertEqual([...src.matchAll(/RESULTS_PER_OUTCODE\) \|\| \d+/g)].length, 1, 'one derivation site for RESULTS_PER_OUTCODE');
  });
}
