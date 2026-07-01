// tests/fixtures.mjs — the single source of test fixtures (Phase 1 step 1.3).
// Memoised loaders over data/fixtures/*.sample.json (redacted sample data —
// never real household values). Both runners consume this module; suites
// receive the result as the `fixtures` argument of register().

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(__root, p), 'utf8'));

let _fixtures = null;

/**
 * The canonical fixture bundle handed to every suite's register().
 * Shape (kept byte-compatible with the legacy runner's inline build):
 *   { finances, rawFinances, investments, criteria }
 */
export async function getFixtures() {
  if (_fixtures) return _fixtures;
  const { deriveFinances } = await import('../assets/js/finance-derive.js');
  const rawFinances = readJson('data/fixtures/finances.sample.json');
  let rawInvestments = null;
  try { rawInvestments = readJson('data/fixtures/investments.sample.json'); } catch { /* optional */ }
  _fixtures = {
    finances: deriveFinances(rawFinances, { investments: rawInvestments }),
    rawFinances,
    investments: rawInvestments,
    criteria: readJson('data/fixtures/criteria.sample.json'),
  };
  return _fixtures;
}

/** Raw sample-file loader for suites that need an untouched fixture file. */
export function loadSample(name) {
  return readJson(`data/fixtures/${name}.sample.json`);
}
