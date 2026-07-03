// fetch-spend.test.js — the Apify spend rail (step 10.3; docs/archive/plan-2026-07-overhaul/04-program.md §4
// "MISSING RAIL: Apify/fetch spend"). Real money: the fetcher bills per result.
// This suite makes every spend parameter a LOUD diff — a refactor or env-default
// change that uncaps the budget, raises the per-target result cap, or drops the
// hard cap from the actor input fails the harness instead of the bank account.
// Demand gating (the other spend lever) is pinned in tests/unit/fetch-listings
// and tests/characterization/fetch-targets; the origin/active-link gates live in
// network functions, so they are pinned here at source level.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildActorInput, APIFY_MAX_BUDGET_USD, RESULTS_PER_OUTCODE } from '../../tools/fetch-listings.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOOL = resolve(ROOT, 'tools/fetch-listings.mjs');
const src = readFileSync(TOOL, 'utf8');

export async function register({ test, assert, assertEqual }) {
  test('fetch-spend: default hard budget cap is $25 and per-target cap is 50', () => {
    // The harness runs without these env vars, so the module-load values ARE the defaults.
    assertEqual(APIFY_MAX_BUDGET_USD, 25, 'APIFY_MAX_BUDGET_USD default changed — deliberate spend decision required');
    assertEqual(RESULTS_PER_OUTCODE, 50, 'RESULTS_PER_OUTCODE default changed — deliberate spend decision required');
  });

  test('fetch-spend: every actor input carries both cost levers', () => {
    const input = buildActorInput('OUTCODE^123');
    assertEqual(input.maxBudget, APIFY_MAX_BUDGET_USD, 'maxBudget must be the hard USD cap');
    assertEqual(input.maxItems, RESULTS_PER_OUTCODE, 'maxItems must be the per-target cap');
    assertEqual(input.monitoringMode, false, 'monitoringMode must stay off (it re-bills)');
    assertEqual(input.includePriceHistory, false, 'includePriceHistory must stay off (it re-bills)');
    assert(Array.isArray(input.listUrls) && input.listUrls.length === 1, 'one search URL per target');
  });

  test('fetch-spend: env overrides reach the constants (real subprocess import)', () => {
    const res = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import('${TOOL.replace(/\\/g, '/')}').then(m => console.log(m.APIFY_MAX_BUDGET_USD, m.RESULTS_PER_OUTCODE));`,
    ], { encoding: 'utf8', env: { ...process.env, APIFY_MAX_BUDGET_USD: '7', RESULTS_PER_OUTCODE: '10' } });
    assertEqual(res.status, 0, `subprocess failed: ${res.stderr}`);
    assertEqual(res.stdout.trim(), '7 10', 'env overrides must reach APIFY_MAX_BUDGET_USD / RESULTS_PER_OUTCODE');
  });

  test('fetch-spend: demand-set gates are present at source (origin + active-only)', () => {
    // These live inside network functions (household_areas fetch + demand-set
    // builder), so pin the load-bearing lines textually: origin areas are never
    // scraped, and only active household links create demand.
    assert(/if \(l\.is_origin\) continue;/.test(src),
      'origin-area exclusion missing from the demand-set builder — the fetcher would scrape home/commute catchments');
    assert(/household_areas\?status=eq\.active/.test(src),
      'household_areas read no longer filters status=eq.active — paused areas would stay in the demand set');
  });

  test('fetch-spend: the hard cap is documented as env-tunable, not hardcoded elsewhere', () => {
    // Exactly one derivation site for each constant (the `|| default` expression).
    assertEqual([...src.matchAll(/APIFY_MAX_BUDGET_USD\) \|\| \d+/g)].length, 1, 'one derivation site for APIFY_MAX_BUDGET_USD');
    assertEqual([...src.matchAll(/RESULTS_PER_OUTCODE\) \|\| \d+/g)].length, 1, 'one derivation site for RESULTS_PER_OUTCODE');
  });
}
