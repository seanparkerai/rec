#!/usr/bin/env node
// run-intelligence-tests.mjs — RETIRED as an implementation (overhaul step 1.13).
// Now a thin forwarder to the canonical tiered harness so every documented
// command, skill, and muscle-memory invocation keeps working. The forwarder is
// deleted in the Phase-10 leanness sweep once nothing references it.
//
//   canonical: node tools/run-all-tests.mjs   (npm test)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const runner = join(dirname(fileURLToPath(import.meta.url)), 'run-all-tests.mjs');
console.log('[run-intelligence-tests] forwarding to the tiered harness (tools/run-all-tests.mjs, step 1.13)\n');
const res = spawnSync('node', [runner, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(res.status ?? 1);
