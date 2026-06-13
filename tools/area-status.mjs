// area-status.mjs — print a progress report across all areas.
//
// Use this at the start of any work session (and inside CI/tests) to see
// which areas are researched, which are partial, and which fields are
// missing per area. Designed so a fresh AI session can read the output and
// know exactly where to resume.
//
// Usage:
//   node tools/area-status.mjs              # summary + grouped breakdown
//   node tools/area-status.mjs --missing    # only show areas with missing fields
//   node tools/area-status.mjs --json       # machine-readable
//   node tools/area-status.mjs --id beech-gu34

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeness, deriveStatus, CONTENT_FIELDS } from './area-fields.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AREAS_DIR = path.join(ROOT, 'data', 'areas');
const INDEX     = path.join(ROOT, 'data', 'areas.json');

const args = process.argv.slice(2);
const ONLY_MISSING = args.includes('--missing');
const AS_JSON      = args.includes('--json');
const idIdx        = args.indexOf('--id');
const ONLY_ID      = idIdx >= 0 ? args[idIdx + 1] : null;

if (!fs.existsSync(AREAS_DIR)) {
  console.error(`No data/areas/ directory — run: node tools/sync-areas-from-supabase.mjs`);
  process.exit(1);
}

const indexById = new Map(JSON.parse(fs.readFileSync(INDEX, 'utf8')).map((a) => [a.id, a]));

const files = fs.readdirSync(AREAS_DIR).filter((f) => f.endsWith('.json')).sort();
const report = [];

for (const f of files) {
  const id = f.replace(/\.json$/, '');
  if (ONLY_ID && id !== ONLY_ID) continue;
  const detail = JSON.parse(fs.readFileSync(path.join(AREAS_DIR, f), 'utf8'));
  const c = completeness(detail);
  const idx = indexById.get(id) || {};
  report.push({
    id,
    name: detail.name || id,
    town: detail.town || idx.town || '',
    county: detail.county || idx.county || '',
    status: detail.status || deriveStatus(c),
    percent: c.percent,
    filled: c.filled,
    total: c.total,
    missing: c.missing,
  });
}

if (AS_JSON) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const ICON = { researched: 'OK ', partial: '~  ', drafted: '~  ', stub: '.. ', directory: '.. ' };
const counts = { researched: 0, partial: 0, drafted: 0, stub: 0, directory: 0 };
for (const r of report) counts[r.status] = (counts[r.status] || 0) + 1;

console.log(`Area research status — ${report.length} areas`);
console.log(`  researched: ${counts.researched || 0}`);
console.log(`  partial:    ${counts.partial || 0}`);
console.log(`  drafted:    ${counts.drafted || 0}`);
console.log(`  stub:       ${counts.stub || 0}`);
console.log(`  directory:  ${counts.directory || 0}`);
console.log(`  total content fields per area: ${CONTENT_FIELDS.length}`);
console.log('');

const byCounty = {};
for (const r of report) (byCounty[r.county || 'Unknown'] ||= []).push(r);

for (const county of Object.keys(byCounty).sort()) {
  const rows = byCounty[county].sort((a, b) => b.percent - a.percent || a.id.localeCompare(b.id));
  console.log(`## ${county} (${rows.length})`);
  for (const r of rows) {
    if (ONLY_MISSING && r.missing.length === 0) continue;
    const pct = String(r.percent).padStart(3, ' ');
    const status = (r.status || '').padEnd(10);
    const name = (r.name + ' ' + (r.town ? `(${r.town})` : '')).padEnd(40);
    const miss = r.missing.length ? `  missing: ${r.missing.join(', ')}` : '';
    console.log(`  ${ICON[r.status] || '?  '} ${pct}%  ${status}  ${r.id.padEnd(28)} ${name}${miss}`);
  }
  console.log('');
}
