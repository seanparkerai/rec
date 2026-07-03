// schema-reference-only.test.js — overhaul 9.5 (R6): one schema truth.
// The live schema is the MCP migration history (CLAUDE.md §18.5); every .sql
// file under supabase/ is reference DDL only and must SAY so mechanically —
// a first-line `-- REFERENCE ONLY` marker naming what it corresponds to.
// This rail fails if a new .sql file lands without the marker (an unstamped
// slice is one dashboard paste away from becoming a second schema truth).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const supabaseDir = resolve(root, 'supabase');

function sqlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sqlFiles(p));
    else if (name.endsWith('.sql')) out.push(p);
  }
  return out;
}

export async function register({ test, assert, assertEqual }) {
  const files = sqlFiles(supabaseDir);

  test('schema-reference-only (9.5): the supabase/ tree contains the expected reference slices', () => {
    assert(files.length >= 6, `expected at least the 6 known .sql slices, found ${files.length}`);
    const names = files.map((f) => relative(root, f));
    assert(names.includes('supabase/schema.sql'), 'schema.sql present');
  });

  test('schema-reference-only (9.5): every .sql under supabase/ opens with the REFERENCE ONLY marker', () => {
    for (const f of files) {
      const firstLine = readFileSync(f, 'utf8').split('\n', 1)[0];
      assert(/^--\s*REFERENCE ONLY\b/.test(firstLine),
        `${relative(root, f)} first line must start with "-- REFERENCE ONLY" (got: ${JSON.stringify(firstLine.slice(0, 80))})`);
    }
  });

  test('schema-reference-only (9.5): no file instructs a dashboard/SQL-editor run', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      assert(!/SQL Editor/i.test(src),
        `${relative(root, f)} must not tell anyone to paste into the dashboard SQL editor (CLAUDE.md §18.5)`);
    }
  });
}
