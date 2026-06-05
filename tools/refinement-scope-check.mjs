#!/usr/bin/env node
// refinement-scope-check.mjs — Stage 8 invariant check for the scrape-scope lever
// (docs/REFINEMENT_PLAN.md §8). Re-derives scope correctness from the source of truth
// (active areas in data/areas/*.json MINUS scrape_probation) and reports drift:
//   • probationedButActive — areas the user paused that the scraper would still pull
//     (the scraper MUST drop these; expected EMPTY once §6 enforcement is live & ran);
//   • probationedNotActive — stale probation rows whose area is already inactive.
// Read-only: no DDL/DML, no Apify. Exits non-zero when probationedButActive is non-empty
// (so CI/a scheduled run can alert), unless --warn-only is passed.
//
// MODES (mirror tools/refinement-run.mjs):
//   File mode (sandbox; probation bundle produced via MCP execute_sql):
//     node tools/refinement-scope-check.mjs --probation-file /tmp/probation.json
//   REST mode (CI / service-role key): reads scrape_probation via PostgREST.
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scopeInvariant } from '../assets/js/refinement/scope.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

async function loadAreas() {
  const dir = resolve(root, 'data/areas');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  const areas = [];
  for (const f of files) areas.push(JSON.parse(await readFile(resolve(dir, f), 'utf8')));
  return areas;
}

async function loadProbation() {
  const fromFile = arg('--probation-file');
  if (fromFile) return JSON.parse(await readFile(fromFile, 'utf8'));
  if (!SERVICE_KEY) throw new Error('no service key — use --probation-file <rows.json> (build via MCP) for the sandbox path');
  const url = `${SUPABASE_URL}/rest/v1/scrape_probation?select=dimension,value,status,reprobe_every_runs,last_reprobe_run`;
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok) throw new Error(`GET scrape_probation failed: ${res.status}`);
  return res.json();
}

async function main() {
  const areas = await loadAreas();
  const probation = await loadProbation();
  const inv = scopeInvariant(areas, probation);

  process.stdout.write(
    `\n  Refinement scope check (${areas.length} area files · ${probation.length} probation rows)\n`
    + `  probationedButActive: ${inv.probationedButActive.length}${inv.probationedButActive.length ? ` → ${inv.probationedButActive.join(', ')}` : ''}\n`
    + `  probationedNotActive: ${inv.probationedNotActive.length}${inv.probationedNotActive.length ? ` → ${inv.probationedNotActive.join(', ')}` : ''}\n\n`,
  );

  const warnOnly = process.argv.includes('--warn-only');
  if (inv.probationedButActive.length && !warnOnly) {
    process.stderr.write('  DRIFT: paused areas still in the active scrape set — enforce or bring them back.\n');
    process.exit(1);
  }
}

main().catch((e) => { process.stderr.write(`scope-check failed: ${e.message}\n`); process.exit(1); });
