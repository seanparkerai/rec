#!/usr/bin/env node
// run-intelligence-tests.mjs — runs the Phase 2 pure-JS tests in Node so the
// browser harness (tests/tests.html) isn't required in CI / remote envs.
// Mirrors the harness register(...) shape exactly.
//
// Usage:  node tools/run-intelligence-tests.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

const fixtures = {
  finances: readJson('data/finances.json'),
  criteria: readJson('data/criteria.json'),
};

const { register: registerAffordability } = await import('../tests/affordability.test.js');
const { register: registerMoneyFlow }     = await import('../tests/money-flow.test.js');
const { register: registerSavingsVelocity } = await import('../tests/savings-velocity.test.js');

await registerAffordability({ test, assert, assertEqual, fixtures });
await registerMoneyFlow({ test, assert, assertEqual, fixtures });
await registerSavingsVelocity({ test, assert, assertEqual, fixtures });

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
