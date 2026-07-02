// tests/contract/tokens-contrast.test.js — the §11 contrast rail (step 3.9e2):
// computes real WCAG contrast ratios from the tokens.css oklch/color-mix
// ladder (both themes) so the palette can never drift below the floor. The
// colour math is the standard OKLab → linear-sRGB pipeline; WCAG relative
// luminance is taken on the linear channels.
//
// Two RATCHET floors (measured 2026-07-02, raise-only — findings recorded):
//   · --accent-contrast on --accent = 4.44 (light) — a hair under the 4.5
//     normal-text line; an accent-lightness nudge is a visible change across
//     every primary button → queued for the post-refactor visual pass.
//   · --ink-subtle on --paper = 2.85 (both themes) — used for placeholders /
//     sub-labels; same visual-pass decision (mix 40% → ~46% fixes it).
// Raising either token's contrast must ALSO raise the floor here.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const css = readFileSync(join(ROOT, 'assets/css/tokens.css'), 'utf8');

function extractBlock(startRe) {
  const m = css.match(startRe);
  if (!m) return null;
  let i = css.indexOf('{', m.index), depth = 0, out = '';
  for (; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (!depth) break; }
    else if (depth === 1) out += ch;
  }
  return out;
}
function parseDecls(block) {
  const map = {};
  for (const m of block.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  return map;
}
const light = parseDecls(extractBlock(/:root\s*/));
const dark = parseDecls(extractBlock(/\[data-theme="dark"\]\s*/));

function resolve(name, scope) {
  const v = scope[name] ?? light[name];
  if (v == null) throw new Error(`undefined token ${name}`);
  return v;
}
function parseColor(str, scope) {
  str = str.trim();
  let m;
  if ((m = str.match(/^var\((--[A-Za-z0-9-]+)\)$/))) return parseColor(resolve(m[1], scope), scope);
  if ((m = str.match(/^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+(.+?)\s*\)$/))) {
    let hue = m[3];
    const hv = hue.match(/^var\((--[A-Za-z0-9-]+)\)$/);
    if (hv) hue = resolve(hv[1], scope);
    return { L: parseFloat(m[1]) / 100, C: parseFloat(m[2]), H: parseFloat(hue) };
  }
  if ((m = str.match(/^color-mix\(in oklch,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+)\)$/))) {
    const a = parseColor(m[1], scope);
    const p = parseFloat(m[2]) / 100;
    const b = parseColor(m[3], scope);
    let dh = b.H - a.H;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    return { L: a.L * p + b.L * (1 - p), C: a.C * p + b.C * (1 - p), H: a.H + dh * (1 - p) };
  }
  throw new Error(`unparseable colour: ${str}`);
}
function luminance({ L, C, H }) {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const R = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const cl = (x) => Math.min(1, Math.max(0, x));
  return 0.2126 * cl(R) + 0.7152 * cl(G) + 0.0722 * cl(B);
}
function ratio(fg, bg, scope) {
  const y1 = luminance(parseColor(`var(${fg})`, scope));
  const y2 = luminance(parseColor(`var(${bg})`, scope));
  const [hi, lo] = y1 > y2 ? [y1, y2] : [y2, y1];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = [['light', light], ['dark', dark]];
// [fg, bg, floor, what it guards]
const FLOORS = [
  ['--ink', '--paper', 4.5, 'body text'],
  ['--ink-muted', '--paper', 4.5, 'secondary text'],
  ['--accent-ink', '--paper', 4.5, 'accent-coloured text/links'],
  ['--accent', '--paper', 3.0, 'UI components + focus outline (SC 1.4.11)'],
  ['--accent-contrast', '--accent', 4.4, 'RATCHET: button text on accent (target 4.5 at the visual pass)'],
  ['--ink-subtle', '--paper', 2.8, 'RATCHET: placeholders/sub-labels (target 3.0+ at the visual pass)'],
];

export async function register({ test, assert }) {
  test('tokens: the colour ladder holds the WCAG floors in both themes (3.9e2 contrast rail)', () => {
    for (const [themeName, scope] of THEMES) {
      for (const [fg, bg, floor, what] of FLOORS) {
        const r = ratio(fg, bg, scope);
        assert(r >= floor,
          `${themeName}: ${fg} on ${bg} = ${r.toFixed(2)} — below the ${floor}:1 floor (${what})`);
      }
    }
  });

  test('tokens: parser sanity — the ladder actually resolves (no silent skips)', () => {
    assert(light['--ink'] && dark['--ink'], 'both theme scopes parsed');
    const inkLight = parseColor('var(--ink)', light);
    assert(inkLight.L < 0.3, 'light ink is dark (parse is not inverted)');
    const inkDark = parseColor('var(--ink)', dark);
    assert(inkDark.L > 0.7, 'dark ink is light (scope chain works)');
    const mixed = parseColor('var(--ink-muted)', light);
    assert(mixed.L > inkLight.L, 'color-mix moves ink toward paper (mix math sane)');
  });
}
