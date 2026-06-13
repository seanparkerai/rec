// docs-consistency.test.js — anti-rot guard for the instruction files (2026-06-12).
// The 2026-06 docs audit found CLAUDE.md claiming CSS files that didn't exist, a
// 4-module storage shim that was actually 5, and three conflicting tracked-table
// counts across two docs. This suite makes each of those drift classes fail the
// harness instead of waiting for the next manual audit. Pure Node + fs — offline,
// deterministic. Inventories each have ONE source of truth: the filesystem for
// paths and shims, data/snapshots/sync-state.json for the tracked-table set.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// Instruction/contract docs whose factual claims are checked. CHECKLIST.md is
// covered separately (its planned "(to write)" tools are deliberate futures).
const SCANNED_DOCS = [
  'CLAUDE.md',
  'DESIGN.md',
  'README.md',
  'docs/README.md',
  'docs/SUPABASE_SYNC.md',
  'docs/REFINEMENT_README.md',
];

// Deliberate mentions of paths that do not exist (historical references,
// documented deletions, examples). Keep this set SMALL and justified.
const PATH_EXCEPTIONS = new Set([
  // none currently
]);

export async function register({ test, assert, assertEqual }) {
  // ── 1. Every repo path mentioned in an instruction doc exists ─────────────
  test('docs-consistency: every repo path named in the instruction docs exists', () => {
    const pathRe = /(?:assets|data|docs|pages|tools|tests|components|supabase)\/[\w\-./]+\.(?:json|mjs|js|css|html|md|sql|csv|pmtiles)(?![\w-])/g;
    const missing = [];
    for (const doc of SCANNED_DOCS) {
      const src = read(doc);
      for (const m of src.matchAll(pathRe)) {
        const p = m[0].replace(/\.+$/, ''); // strip sentence-final dots
        if (PATH_EXCEPTIONS.has(p)) continue;
        if (!existsSync(join(ROOT, p))) missing.push(`${doc} → ${p}`);
      }
    }
    assert(missing.length === 0,
      `instruction docs name paths that don't exist (fix the doc or move it to PATH_EXCEPTIONS with a reason):\n  ${missing.join('\n  ')}`);
  });

  // ── 2. Brace-list shim claims in CLAUDE.md match the filesystem ───────────
  test('docs-consistency: CLAUDE.md storage/{...} shim list equals assets/js/storage/', () => {
    const claims = [...read('CLAUDE.md').matchAll(/storage\/\{([\w,-]+)\}\.js/g)];
    assert(claims.length > 0, 'CLAUDE.md no longer documents the storage shim modules');
    const actual = readdirSync(join(ROOT, 'assets/js/storage'))
      .filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, '')).sort().join(',');
    for (const c of claims) {
      assertEqual(c[1].split(',').sort().join(','), actual,
        `CLAUDE.md claims storage/{${c[1]}}.js but assets/js/storage/ contains {${actual}}.js`);
    }
  });

  test('docs-consistency: CLAUDE.md calc-{...} shim list equals finances/calc-*.js', () => {
    const claims = [...read('CLAUDE.md').matchAll(/calc-\{([\w,-]+)\}/g)];
    assert(claims.length > 0, 'CLAUDE.md no longer documents the finances calc modules');
    const actual = readdirSync(join(ROOT, 'assets/js/finances'))
      .filter((f) => /^calc-.+\.js$/.test(f)).map((f) => f.slice(5, -3)).sort().join(',');
    for (const c of claims) {
      assertEqual(c[1].split(',').sort().join(','), actual,
        `CLAUDE.md claims calc-{${c[1]}} but assets/js/finances/ contains calc-{${actual}}`);
    }
  });

  // ── 3. Tracked-table claims agree with the snapshot ───────────────────────
  test('docs-consistency: every "N tracked" literal equals the snapshot-derived count', () => {
    const snapshot = JSON.parse(read('data/snapshots/sync-state.json'));
    const tracked = Object.keys(snapshot).filter((t) => t !== 'listings');
    for (const doc of ['CLAUDE.md', 'docs/SUPABASE_SYNC.md']) {
      const src = read(doc);
      for (const m of src.matchAll(/(\d+)\s+(?:of the \d+\s+)?(?:are\s+)?["“*]*tracked/gi)) {
        assertEqual(Number(m[1]), tracked.length,
          `${doc} says "${m[0].trim()}" but sync-state.json derives ${tracked.length} tracked tables`);
      }
    }
  });

  test('docs-consistency: SUPABASE_SYNC.md §0 names every tracked table', () => {
    const snapshot = JSON.parse(read('data/snapshots/sync-state.json'));
    const tracked = Object.keys(snapshot).filter((t) => t !== 'listings');
    const src = read('docs/SUPABASE_SYNC.md');
    const missing = tracked.filter((t) => !src.includes(`\`${t}\``));
    assert(missing.length === 0,
      `tracked tables absent from docs/SUPABASE_SYNC.md: ${missing.join(', ')}`);
  });

  // ── 4. No hardcoded progress counts in the live checklist ─────────────────
  test('docs-consistency: CHECKLIST.md carries no hardcoded area-status counts', () => {
    const hits = [...read('docs/CHECKLIST.md').matchAll(/\d+\s+`?(researched|directory|stub|partial)\b/g)];
    assert(hits.length === 0,
      `docs/CHECKLIST.md hardcodes progress counts (${hits.map((h) => `"${h[0]}"`).join(', ')}) — point to \`node tools/area-status.mjs\` instead`);
  });

  // ── 5. docs/README.md index is complete and link-valid ────────────────────
  test('docs-consistency: every live doc is indexed in docs/README.md and every index link resolves', () => {
    const index = read('docs/README.md');
    const live = readdirSync(join(ROOT, 'docs'))
      .filter((f) => f.endsWith('.md') && f !== 'README.md');
    const unindexed = live.filter((f) => !index.includes(`](${f})`));
    assert(unindexed.length === 0,
      `live docs missing from the docs/README.md index: ${unindexed.join(', ')}`);
    const broken = [...index.matchAll(/\]\(([^)#\s]+)\)/g)]
      .map((m) => m[1]).filter((t) => !/^https?:/.test(t))
      .filter((t) => !existsSync(join(ROOT, 'docs', t)));
    assert(broken.length === 0, `docs/README.md links to missing targets: ${broken.join(', ')}`);
  });
}
