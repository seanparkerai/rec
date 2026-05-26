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

const rawFinances = readJson('data/finances.json');
let rawInvestments = null;
try { rawInvestments = readJson('data/investments.json'); } catch { /* optional */ }

const fixtures = {
  finances: deriveFinances(rawFinances, { investments: rawInvestments }),
  rawFinances,
  investments: rawInvestments,
  criteria: readJson('data/criteria.json'),
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

await registerFinanceDerive({ test, assert, assertEqual, fixtures });
await registerAffordability({ test, assert, assertEqual, fixtures });
await registerMoneyFlow({ test, assert, assertEqual, fixtures });
await registerSavingsVelocity({ test, assert, assertEqual, fixtures });
await registerDepositRisk({ test, assert, assertEqual, fixtures });
await registerAffordabilityScenarios({ test, assert, assertEqual, fixtures });
await registerInvestmentPerformance({ test, assert, assertEqual, fixtures });
await registerSavingsSeries({ test, assert, assertEqual, fixtures });
await registerOutreachTemplates({ test, assert, assertEqual, fixtures });

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
      // Parse output to count pass/fail
      const match = output.match(/(\d+) passed, (\d+) failed/);
      if (match) {
        const [, passed, failed] = match;
        for (let i = 0; i < parseInt(passed); i++) {
          results.push({ name: `supabase-sync: (${i + 1}/${passed})`, pass: true });
        }
        for (let i = 0; i < parseInt(failed); i++) {
          results.push({ name: `supabase-sync: (failed ${i + 1}/${failed})`, pass: false, error: 'see above' });
        }
      }
      console.log(output); // print sync test output
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
