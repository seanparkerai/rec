#!/usr/bin/env node
// run-all-tests.mjs — the tiered test runner (Phase 1 of the overhaul, §5 blueprint;
// see plan/segments/10.10-tooling-tests.md). Stood up BESIDE the legacy runner
// (tools/run-intelligence-tests.mjs), which stays the canonical commit gate until
// step 1.13 cuts over — both must be green during the strangler migration.
//
// Discovery: tests/<tier>/**/*.test.js for tiers unit → contract → characterization
// → integration → pages. Every suite keeps the legacy contract:
//   export async function register({ test, assert, assertEqual, fixtures }) { … }
// so files port by MOVING them, not rewriting them.
//
// Full runs also execute the responsive lint and spawn the Supabase sync suite
// (tests/supabase-sync.test.js), whose online assertions report as SKIPPED when
// unrun — never as passing (§5.2 "gated honestly").
//
// Usage:
//   node tools/run-all-tests.mjs                 # all tiers + lint + sync suite
//   node tools/run-all-tests.mjs --tier unit     # a single tier, fast iteration

import { readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const __root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const TIERS = ['unit', 'contract', 'characterization', 'integration', 'pages'];

// ---- CLI ------------------------------------------------------------------
const args = process.argv.slice(2);
const tierArgIdx = args.indexOf('--tier');
const onlyTier = tierArgIdx !== -1 ? args[tierArgIdx + 1] : null;
if (onlyTier && !TIERS.includes(onlyTier)) {
  console.error(`Unknown tier "${onlyTier}". Tiers: ${TIERS.join(', ')}`);
  process.exit(2);
}

// ---- assertion helpers (identical contract to the legacy runner) -----------
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---- shared fixtures (tests/fixtures.mjs — the single source, step 1.3) ----
const { getFixtures } = await import('../tests/fixtures.mjs');

// ---- discovery --------------------------------------------------------------
function discover(tier) {
  const dir = join(__root, 'tests', tier);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { recursive: true })) {
    const p = join(dir, String(entry));
    if (p.endsWith('.test.js') && statSync(p).isFile()) out.push(p);
  }
  return out.sort();
}

// ---- run ---------------------------------------------------------------------
const byTier = new Map();
let failedTotal = 0;
let passedTotal = 0;

const fixtures = await getFixtures();

for (const tier of TIERS) {
  if (onlyTier && tier !== onlyTier) continue;
  const files = discover(tier);
  const results = [];
  const pending = [];
  // register() calls test(name, fn) without awaiting — collect every returned
  // promise and drain them before reporting, so genuinely async tests (the DOM
  // tier) are counted. The legacy runner tolerates floating promises only
  // because its suites are effectively synchronous.
  const test = (name, fn) => {
    const p = (async () => {
      try { await fn(); results.push({ name, pass: true }); }
      catch (e) { results.push({ name, pass: false, error: e?.message || String(e) }); }
    })();
    pending.push(p);
    return p;
  };
  const t0 = Date.now();
  for (const file of files) {
    const mod = await import(pathToFileURL(file).href);
    if (typeof mod.register !== 'function') {
      results.push({ name: `${file} exports register()`, pass: false, error: 'no register() export' });
      continue;
    }
    await mod.register({ test, assert, assertEqual, fixtures });
    await Promise.all(pending.splice(0));
  }
  byTier.set(tier, { files: files.length, results, ms: Date.now() - t0 });
}

// Full runs (no --tier) also carry the lint + the spawned sync suite, so the
// single-command invariant (§3.6) holds from day one.
const extras = [];
if (!onlyTier) {
  const lintResults = [];
  const test = async (name, fn) => {
    try { await fn(); lintResults.push({ name, pass: true }); }
    catch (e) { lintResults.push({ name, pass: false, error: e?.message || String(e) }); }
  };
  const { runResponsiveLint } = await import('./lint-responsive.mjs');
  await test('responsive lint (no new violations vs baseline)', () => {
    const { regressions, stale } = runResponsiveLint();
    assert(
      regressions.length === 0 && stale.length === 0,
      `responsive lint:\n${regressions.map((r) => `  NEW ${r.fingerprint} (live ${r.live} > baseline ${r.baseline})`).join('\n')}${stale.map((r) => `  STALE ${r.fingerprint} (live ${r.live} < baseline ${r.baseline}) — run --tighten-baseline`).join('\n')}`,
    );
  });
  extras.push(...lintResults);

  await new Promise((resolve) => {
    const syncTestPath = join(__root, 'tests/supabase-sync.test.js');
    if (!existsSync(syncTestPath)) { resolve(0); return; }
    const proc = spawn('node', [syncTestPath], { stdio: 'pipe' });
    let output = '';
    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { output += d.toString(); });
    proc.on('close', (code) => {
      const match = output.match(/(\d+) passed, (\d+) failed(?:, (\d+) skipped)?/);
      const summary = match
        ? `${match[1]} passed, ${match[2]} failed${match[3] ? `, ${match[3]} skipped (online — unrun, NOT passing)` : ''}`
        : 'no summary parsed';
      extras.push({
        name: `supabase-sync suite (${summary})`,
        pass: code === 0,
        error: code === 0 ? undefined : `sync suite exited non-zero:\n${output}`,
      });
      resolve(code);
    });
  });
}

// ---- report ------------------------------------------------------------------
console.log('run-all-tests — tiered harness (strangler; legacy runner remains the gate until cut-over)\n');
for (const tier of TIERS) {
  if (!byTier.has(tier)) continue;
  const { files, results, ms } = byTier.get(tier);
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  passedTotal += pass; failedTotal += fail;
  const status = fail > 0 ? '✗' : files === 0 ? '·' : '✓';
  console.log(`${status} ${tier.padEnd(16)} ${files} suite file(s), ${pass}/${results.length} passed (${ms}ms)`);
  for (const r of results.filter((x) => !x.pass)) {
    console.log(`    FAIL  ${r.name}\n          ${r.error}`);
  }
}
for (const r of extras) {
  passedTotal += r.pass ? 1 : 0; failedTotal += r.pass ? 0 : 1;
  console.log(`${r.pass ? '✓' : '✗'} ${r.name}`);
  if (!r.pass) console.log(`    ${r.error}`);
}
const ported = [...byTier.values()].reduce((n, t) => n + t.files, 0);
if (ported === 0) console.log('\n(no suites ported into tests/<tier>/ yet — porting begins at step 1.4)');
console.log(`\n${failedTotal === 0 ? '✓' : '✗'} ${passedTotal}/${passedTotal + failedTotal} passed`);
process.exit(failedTotal === 0 ? 0 : 1);
