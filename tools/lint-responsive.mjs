#!/usr/bin/env node
// lint-responsive.mjs — responsive-doctrine lint (DESIGN.md §6).
//
// Exports runResponsiveLint() → { violations, regressions } so the intelligence
// harness can assert regressions.length === 0. Run standalone for a human report:
//
//   node tools/lint-responsive.mjs                 # report + exit 1 on regressions
//   node tools/lint-responsive.mjs --write-baseline# (re)snapshot allow.json
//
// ---------------------------------------------------------------------------
// Correctness contract (see the overhaul plan §B — these are NOT optional):
//
//  1. Breakpoint rules parse @media PRELUDES only, never property declarations
//     (`.cell{max-width:42rem}` must be invisible to them).
//  2. r-canonical-bp / r-no-max-width-media are WIDTH-scoped. Preludes whose
//     only relevant features are max-height/min-height/orientation/prefers-*/
//     hover/pointer are exempt — those are the sanctioned short-viewport queries.
//  3. r-undefined-token's "defined" set = every `--name:` declaration under
//     assets/css/ UNION every first-arg literal of `.style.setProperty('--name')`
//     under assets/js/. Without the JS half, runtime tokens (--seasoning-pct,
//     --marker-pct, later --ref-pct) are permanent false positives.
//  4. Baseline is COUNT-based, not set-membership. Fingerprint =
//     rule|file|normalised-snippet → occurrence count. Lint passes iff every
//     live fingerprint count <= its baseline count (totals may only shrink).
//  5. Guard-railed paths (storage/*, config.js, data-loader.js, finances.js,
//     finances/calc-*.js) are SKIPPED by the JS rules — a lint must not demand
//     edits to files the project forbids editing (CLAUDE.md §16).
//  6. r-no-fixed-font-px allows fixed `font-size:Npx` only on SVG <text>: in CSS,
//     a rule that also sets `fill:` (SVG-text styling); in JS, the SVG-drawing
//     modules assets/js/**/section-*.js and *-visuals.js. Everything else flags.
//  7. r-no-style-assign also catches `.style.cssText=` and setAttribute('style');
//     it ALLOWS `.style.setProperty('--`. r-no-100vw flags every 100vw — the
//     sanctioned fix is `100%` (scrollbar-aware), never 100dvw.
//  8. r-tap-target flags interactive selectors carrying a literal size < 44px;
//     recommend var(--tap-min). (Enabled now that P0 has landed the token.)
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, basename } from 'node:path';

const __root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOW_PATH = join(__root, 'tools/lint-responsive.allow.json');

const CANONICAL_BP = new Set([480, 768, 1024, 1280]);

// --- file discovery --------------------------------------------------------

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(__root, full).replaceAll('\\', '/');
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(rel);
  }
  return out;
}

function listFiles(subdir, ext) {
  const base = join(__root, subdir);
  if (!existsSync(base)) return [];
  return walk(base).filter((p) => p.endsWith(ext));
}

const cssFiles = listFiles('assets/css', '.css');
const jsFiles = listFiles('assets/js', '.js');

// Guard-railed JS — never edited (CLAUDE.md §16); JS rules skip these.
function isGuardRailedJs(rel) {
  return (
    rel.includes('/storage/') ||
    rel.endsWith('assets/js/storage.js') ||
    rel.endsWith('assets/js/config.js') ||
    rel.endsWith('assets/js/data-loader.js') ||
    rel.endsWith('assets/js/finances.js') ||
    /\/finances\/calc-[^/]+\.js$/.test(rel)
  );
}

// SVG-drawing JS modules may carry fixed px font-size (drawn in viewBox space).
function isSvgDrawingJs(rel) {
  const b = basename(rel);
  return /^section-.*\.js$/.test(b) || /-visuals\.js$/.test(b);
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

// --pico-* tokens are provided by the vendored Pico CSS framework (loaded via
// CDN, not under assets/), so they are legitimately defined at runtime and are
// exempt from r-undefined-token — they are not the in-repo bug class.
const isKnownToken = (name) => definedTokens.has(name) || name.startsWith('--pico-');

// --- violation collection --------------------------------------------------

const violations = [];
function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}
function add(rule, file, index, text, snippet) {
  violations.push({ rule, file, line: lineOf(text, index), snippet: norm(snippet) });
}

// === defined-token set (CSS declarations ∪ JS setProperty literals) =========

const definedTokens = new Set();
for (const file of cssFiles) {
  const text = readFileSync(join(__root, file), 'utf8');
  for (const m of text.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)) definedTokens.add(m[1]);
}
for (const file of jsFiles) {
  const text = readFileSync(join(__root, file), 'utf8');
  for (const m of text.matchAll(/\.(?:style\.)?setProperty\(\s*['"`](--[A-Za-z0-9-]+)['"`]/g)) {
    definedTokens.add(m[1]);
  }
}

// === @media prelude extraction ============================================
// A width feature is min-width/max-width. A "short-viewport" feature is any
// *-height / orientation / prefers-* / hover / pointer.

function eachMediaPrelude(text, cb) {
  for (const m of text.matchAll(/@media([^{]*)\{/g)) {
    cb(m[1], m.index);
  }
}
const hasMaxWidth = (prelude) => /\bmax-width\s*:/.test(prelude);
const hasShortViewportFeature = (prelude) =>
  /\b(?:min-height|max-height|orientation|prefers-[a-z-]+|hover|pointer)\b/.test(prelude);

// === CSS rules =============================================================

for (const file of cssFiles) {
  const text = readFileSync(join(__root, file), 'utf8');

  // r-no-max-width-media — banned layout max-width query (width-scoped).
  eachMediaPrelude(text, (prelude, idx) => {
    if (hasMaxWidth(prelude) && !hasShortViewportFeature(prelude)) {
      add('r-no-max-width-media', file, idx, text, `@media${prelude}`);
    }
  });

  // r-canonical-bp — non-canonical min/max-width breakpoint value.
  eachMediaPrelude(text, (prelude, idx) => {
    for (const f of prelude.matchAll(/\b(min-width|max-width)\s*:\s*([\d.]+)px/g)) {
      const val = parseFloat(f[2]);
      if (!CANONICAL_BP.has(val)) {
        add('r-canonical-bp', file, idx, text, `${f[1]}: ${f[2]}px`);
      }
    }
  });

  // r-no-100vw — every 100vw (fix is 100%, never 100dvw).
  for (const m of text.matchAll(/100vw\b/g)) add('r-no-100vw', file, m.index, text, m[0]);

  // r-no-raw-vh — raw vh unit (use dvh/svh).
  for (const m of text.matchAll(/\b\d+(?:\.\d+)?(d|s|l)?vh\b/g)) {
    if (!m[1]) add('r-no-raw-vh', file, m.index, text, m[0]);
  }

  // r-no-fixed-font-px — fixed px font-size in CSS. Allowed only on SVG <text>
  // (§B.6(b)): a rule that also sets `fill:` is styling SVG text, so exempt it.
  for (const block of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const body = block[2];
    if (/\bfill\s*:/.test(body)) continue; // SVG-text styling
    for (const m of body.matchAll(/font-size\s*:\s*\d+(?:\.\d+)?px/gi)) {
      add('r-no-fixed-font-px', file, block.index, text, m[0]);
    }
  }

  // r-undefined-token — var(--name) referencing an undefined token.
  for (const m of text.matchAll(/var\(\s*(--[A-Za-z0-9-]+)/g)) {
    if (!isKnownToken(m[1])) add('r-undefined-token', file, m.index, text, `var(${m[1]})`);
  }

  // r-tap-target — interactive selector with a literal size < 44px.
  for (const block of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1];
    const body = block[2];
    // Pseudo-elements (::before/::after) are decorative, never tap targets.
    if (/::(before|after|marker|placeholder|selection|backdrop)\b/.test(selector)) continue;
    const interactive =
      /(?:^|[\s,>+~])(?:button|a|input|select|textarea)(?:[\s.:,\[]|$)/.test(selector) ||
      /\.(?:btn|chip|nav-toggle|tap)\b/.test(selector) ||
      /\[role\s*=\s*["']?button/.test(selector);
    if (!interactive) continue;
    for (const d of body.matchAll(/\b(min-height|height|min-width|width)\s*:\s*(\d+(?:\.\d+)?)px/g)) {
      if (parseFloat(d[2]) < 44) {
        add('r-tap-target', file, block.index, text, `${norm(selector)} { ${d[1]}: ${d[2]}px }`);
      }
    }
  }
}

// === JS rules ==============================================================

for (const file of jsFiles) {
  const text = readFileSync(join(__root, file), 'utf8');
  const guarded = isGuardRailedJs(file);

  // r-undefined-token also covers var() in JS template strings.
  if (!guarded) {
    for (const m of text.matchAll(/var\(\s*(--[A-Za-z0-9-]+)/g)) {
      if (!isKnownToken(m[1])) add('r-undefined-token', file, m.index, text, `var(${m[1]})`);
    }
    // r-no-fixed-font-px — except SVG-drawing modules.
    if (!isSvgDrawingJs(file)) {
      for (const m of text.matchAll(/font-size\s*:\s*\d+(?:\.\d+)?px/gi)) {
        add('r-no-fixed-font-px', file, m.index, text, m[0]);
      }
    }
    // r-no-inline-style-attr — style="..." / style='...' in emitted HTML.
    for (const m of text.matchAll(/style\s*=\s*["'][^"']*["']/g)) {
      add('r-no-inline-style-attr', file, m.index, text, m[0].slice(0, 60));
    }
    // r-no-style-assign — .style.x=, .style.cssText=, setAttribute('style'.
    // Allows .style.setProperty('--…') (the sanctioned dynamic-value idiom).
    for (const m of text.matchAll(/\.style\.([A-Za-z]+)\s*=/g)) {
      add('r-no-style-assign', file, m.index, text, `.style.${m[1]} =`);
    }
    for (const m of text.matchAll(/\.style\.cssText\s*=/g)) {
      add('r-no-style-assign', file, m.index, text, '.style.cssText =');
    }
    for (const m of text.matchAll(/setAttribute\(\s*['"]style['"]/g)) {
      add('r-no-style-assign', file, m.index, text, "setAttribute('style'");
    }
  }
}

// === fingerprint → count ===================================================

function fingerprint(v) {
  return `${v.rule}|${v.file}|${v.snippet}`;
}
function countMap(vios) {
  const map = {};
  for (const v of vios) map[fingerprint(v)] = (map[fingerprint(v)] || 0) + 1;
  return map;
}

const liveCounts = countMap(violations);

// === public API ============================================================

export function runResponsiveLint() {
  const baseline = existsSync(ALLOW_PATH) ? JSON.parse(readFileSync(ALLOW_PATH, 'utf8')) : {};
  const regressions = [];
  for (const [fp, n] of Object.entries(liveCounts)) {
    const allowed = baseline[fp] || 0;
    if (n > allowed) regressions.push({ fingerprint: fp, live: n, baseline: allowed });
  }
  return { violations, regressions };
}

// === CLI ===================================================================

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes('--write-baseline')) {
    const sorted = Object.fromEntries(Object.entries(liveCounts).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(ALLOW_PATH, JSON.stringify(sorted, null, 2) + '\n');
    const total = Object.values(liveCounts).reduce((a, b) => a + b, 0);
    console.log(`wrote baseline: ${Object.keys(sorted).length} fingerprints, ${total} occurrences → ${relative(__root, ALLOW_PATH)}`);
    process.exit(0);
  }

  const { regressions } = runResponsiveLint();
  const byRule = {};
  for (const v of violations) (byRule[v.rule] ||= []).push(v);
  console.log('Responsive lint — live violations by rule:');
  for (const rule of Object.keys(byRule).sort()) {
    console.log(`  ${rule}: ${byRule[rule].length}`);
  }
  console.log(`  TOTAL: ${violations.length}`);

  if (regressions.length) {
    console.error(`\n✗ ${regressions.length} regression(s) above baseline:`);
    for (const r of regressions) console.error(`  ${r.fingerprint}  (live ${r.live} > baseline ${r.baseline})`);
    process.exit(1);
  }
  console.log('\n✓ no regressions vs baseline');
}
