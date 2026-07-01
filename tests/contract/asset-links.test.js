// asset-links.test.js — static reference-integrity smoke check (REFACTOR P10).
// Catches dangling references introduced by file moves / import rewrites: every local
// JS import/export specifier, CSS @import, and pages/root HTML <link>/<script>/<a> ref
// must point at a file that exists. Pure Node + fs — no browser, no network. Runs inside
// the harness, which CI invokes on every push/PR (ci.yml) and before each Pages deploy
// (pages.yml), so a broken path fails CI instead of shipping a 404.
//
// Scope notes: component partials (components/*.html) are fetch-injected into pages at
// runtime, so their relative refs resolve against the consuming page (not the partial's
// own path) and are intentionally NOT scanned here. Bare/URL/anchor specifiers are skipped.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir, ext, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, acc);
    else if (e.name.endsWith(ext)) acc.push(p);
  }
  return acc;
}

const isExternal = (s) => /^(https?:)?\/\//.test(s) || /^(data:|mailto:|tel:|javascript:|#)/.test(s);
const clean = (s) => s.split('#')[0].split('?')[0];

export async function register({ test, assert }) {
  // ── JS module specifiers (static import/export + dynamic import()) ──────────
  test('asset-links: every relative JS import/export specifier resolves', () => {
    const missing = [];
    const files = walk(join(ROOT, 'assets/js'), '.js');
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const specs = [
        ...src.matchAll(/(?:^|[^.\w])(?:import|export)\b[^'"]*?\bfrom\s*["']([^"']+)["']/g),
        ...src.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
      ].map((m) => m[1]);
      for (const spec of specs) {
        if (!spec.startsWith('.')) continue; // bare + URL specifiers (e.g. CDN) are out of scope
        if (!existsSync(resolve(dirname(file), clean(spec)))) missing.push(`${relative(ROOT, file)} → ${spec}`);
      }
    }
    assert(files.length > 0, 'expected to scan at least one JS module');
    assert(missing.length === 0, `JS imports pointing at missing files:\n  ${missing.join('\n  ')}`);
  });

  // ── CSS @import targets ─────────────────────────────────────────────────────
  test('asset-links: every CSS @import target exists', () => {
    const missing = [];
    const files = walk(join(ROOT, 'assets/css'), '.css');
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const specs = [...src.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)].map((m) => m[1]);
      for (const spec of specs) {
        if (isExternal(spec)) continue;
        if (!existsSync(resolve(dirname(file), clean(spec)))) missing.push(`${relative(ROOT, file)} → ${spec}`);
      }
    }
    assert(files.length > 0, 'expected to scan at least one CSS file');
    assert(missing.length === 0, `CSS @imports pointing at missing files:\n  ${missing.join('\n  ')}`);
  });

  // ── HTML href/src in real pages (pages/*.html + repo-root *.html) ───────────
  test('asset-links: every local HTML href/src target exists', () => {
    const htmlFiles = walk(join(ROOT, 'pages'), '.html');
    for (const f of readdirSync(ROOT)) { if (f.endsWith('.html')) htmlFiles.push(join(ROOT, f)); }
    const missing = [];
    for (const file of htmlFiles) {
      const src = readFileSync(file, 'utf8');
      const refs = [...src.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
      for (const ref of refs) {
        if (isExternal(ref)) continue;
        const c = clean(ref);
        if (!c || c.endsWith('/')) continue; // directory refs / empty are not file targets
        if (!existsSync(resolve(dirname(file), c))) missing.push(`${relative(ROOT, file)} → ${ref}`);
      }
    }
    assert(htmlFiles.length > 0, 'expected to scan at least one HTML page');
    assert(missing.length === 0, `HTML href/src pointing at missing files:\n  ${missing.join('\n  ')}`);
  });
}
