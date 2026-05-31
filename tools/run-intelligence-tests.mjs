#!/usr/bin/env node
// run-intelligence-tests.mjs — runs the Phase 2 pure-JS tests in Node so the
// browser harness (tests/tests.html) isn't required in CI / remote envs.
// Mirrors the harness register(...) shape exactly.
// Also runs the Supabase sync test (tests/supabase-sync.test.js).
//
// Usage:  node tools/run-intelligence-tests.mjs

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const __root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(__root, p), 'utf8'));

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); }
  catch (e) { results.push({ name, pass: false, error: e?.message || String(e) }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const { deriveFinances } = await import('../assets/js/finance-derive.js');

const rawFinances = readJson('data/fixtures/finances.sample.json');
let rawInvestments = null;
try { rawInvestments = readJson('data/fixtures/investments.sample.json'); } catch { /* optional */ }

const fixtures = {
  finances: deriveFinances(rawFinances, { investments: rawInvestments }),
  rawFinances,
  investments: rawInvestments,
  criteria: readJson('data/fixtures/criteria.sample.json'),
};

const { register: registerFinanceDerive } = await import('../tests/finance-derive.test.js');
const { register: registerAffordability } = await import('../tests/affordability.test.js');
const { register: registerMoneyFlow }     = await import('../tests/money-flow.test.js');
const { register: registerSavingsVelocity } = await import('../tests/savings-velocity.test.js');
const { register: registerDepositRisk } = await import('../tests/deposit-risk.test.js');
const { register: registerAffordabilityScenarios } = await import('../tests/affordability-scenarios.test.js');
const { register: registerInvestmentPerformance } = await import('../tests/investment-performance.test.js');
const { register: registerSavingsSeries } = await import('../tests/savings-series.test.js');
const { register: registerOutreachTemplates } = await import('../tests/outreach-templates.test.js');
const { register: registerListingsNormalise } = await import('../tests/listings-normalise.test.js');
const { register: registerVerifyAreaCoords } = await import('../tests/verify-area-coords.test.js');
const { register: registerListingFit } = await import('../tests/listing-fit.test.js');
const { register: registerListingReactions } = await import('../tests/listing-reactions.test.js');
const { register: registerLearnedPreferences } = await import('../tests/learned-preferences.test.js');
const { register: registerFetchListings } = await import('../tests/fetch-listings.test.js');
const { register: registerMetaObservations } = await import('../tests/meta-observations.test.js');
const { register: registerListingDetail } = await import('../tests/listing-detail.test.js');
const { register: registerDomUtils }                 = await import('../tests/dom-utils.test.js');
const { register: registerCharacterizationHome }     = await import('../tests/characterization-home.test.js');
const { register: registerCharacterizationFinances } = await import('../tests/characterization-finances.test.js');
const { register: registerCharacterizationOutreach } = await import('../tests/characterization-outreach.test.js');

await registerFinanceDerive({ test, assert, assertEqual, fixtures });
await registerAffordability({ test, assert, assertEqual, fixtures });
await registerMoneyFlow({ test, assert, assertEqual, fixtures });
await registerSavingsVelocity({ test, assert, assertEqual, fixtures });
await registerDepositRisk({ test, assert, assertEqual, fixtures });
await registerAffordabilityScenarios({ test, assert, assertEqual, fixtures });
await registerInvestmentPerformance({ test, assert, assertEqual, fixtures });
await registerSavingsSeries({ test, assert, assertEqual, fixtures });
await registerOutreachTemplates({ test, assert, assertEqual, fixtures });
await registerListingsNormalise({ test, assert, assertEqual, fixtures });
await registerVerifyAreaCoords({ test, assert, assertEqual, fixtures });
await registerListingFit({ test, assert, assertEqual, fixtures });
await registerListingReactions({ test, assert, assertEqual, fixtures });
await registerLearnedPreferences({ test, assert, assertEqual, fixtures });
await registerFetchListings({ test, assert, assertEqual, fixtures });
await registerMetaObservations({ test, assert, assertEqual, fixtures });
await registerListingDetail({ test, assert, assertEqual, fixtures });
await registerDomUtils({ test, assert, assertEqual });
await registerCharacterizationHome({ test, assert, assertEqual, fixtures });
await registerCharacterizationFinances({ test, assert, assertEqual, fixtures });
await registerCharacterizationOutreach({ test, assert, assertEqual });

// Run Supabase sync tests
async function runSyncTests() {
  return new Promise((resolve) => {
    const syncTestPath = join(__root, 'tests/supabase-sync.test.js');
    if (!existsSync(syncTestPath)) {
      console.log('ℹ️  sync tests not found, skipping');
      resolve(0); // don't block if sync tests don't exist
      return;
    }

    const proc = spawn('node', [syncTestPath], { stdio: 'pipe' });
    let output = '';
    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', (data) => { output += data.toString(); });
    proc.on('close', (code) => {
      console.log(output); // print sync test output verbatim
      // Record ONE honest result based on the child's exit code. Surface the real
      // passed/failed/skipped numbers in the name; never fabricate per-test lines.
      const match = output.match(/(\d+) passed, (\d+) failed(?:, (\d+) skipped)?/);
      const summary = match
        ? `${match[1]} passed, ${match[2]} failed${match[3] ? `, ${match[3]} skipped` : ''}`
        : 'no summary parsed';
      results.push({
        name: `supabase-sync suite (${summary})`,
        pass: code === 0,
        error: code === 0 ? undefined : 'sync suite exited non-zero — see output above',
      });
      resolve(code);
    });
  });
}

await runSyncTests();

const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
console.log(`\n${failed === 0 ? '✓' : '✗'} ${passed}/${results.length} passed\n`);
for (const r of results) {
  if (r.pass) {
    console.log(`  PASS  ${r.name}`);
  } else {
    console.log(`  FAIL  ${r.name}`);
    console.log(`        ${r.error}`);
  }
}
process.exit(failed === 0 ? 0 : 1);
