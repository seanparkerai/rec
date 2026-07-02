// Contract (step 3.2 / C1): the OKLCH + color-mix token system must carry a
// complete sRGB fallback. Custom properties are not parse-time validated — a
// browser without oklch()/color-mix() fails at USAGE time (property unsets),
// which would blank the palette — so tokens.css ends with an
// `@supports not (color: oklch(…))` override block. This rail keeps that block
// COMPLETE: every colour token whose modern value uses oklch()/color-mix()
// must be re-declared in the fallback block for the same theme scope, and the
// fallback block itself must contain no modern colour functions.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const css = readFileSync(join(ROOT, 'assets/css/tokens.css'), 'utf8');

// Split the file at the fallback gate: everything before is the modern
// definition; everything after is the legacy override.
const gate = css.indexOf('@supports not');
const head = gate === -1 ? css : css.slice(0, gate);
const tail = gate === -1 ? '' : css.slice(gate);

// All `--prop: value;` declarations in a chunk, as [name, value] pairs.
const decls = (chunk) => [...chunk.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2]]);
const MODERN = /oklch\(|color-mix\(/;

export async function register({ test, assert }) {
  test('tokens: the @supports-not fallback block exists and is itself legacy-safe', () => {
    assert(gate !== -1, 'tokens.css must end with an @supports not (color: oklch(…)) fallback block');
    const offenders = decls(tail).filter(([, v]) => MODERN.test(v)).map(([n]) => n);
    assert(offenders.length === 0,
      `fallback block must not use oklch/color-mix itself: ${offenders.join(', ')}`);
  });

  test('tokens: every modern colour token has a fallback declaration', () => {
    const needed = new Set(decls(head).filter(([, v]) => MODERN.test(v)).map(([n]) => n));
    const provided = new Set(decls(tail).map(([n]) => n));
    const missing = [...needed].filter((n) => !provided.has(n));
    assert(missing.length === 0,
      `tokens using oklch/color-mix with no sRGB fallback: ${missing.join(', ')}`);
  });

  test('tokens: dark-scope fallbacks cover both the forced and the system-auto path', () => {
    // The head dark override ([data-theme="dark"]) and the auto block
    // (prefers-color-scheme) re-declare the same tokens; the fallback must do
    // the same in BOTH scopes or a legacy browser flips to the wrong theme in
    // one of the two paths.
    const darkNeeded = new Set(
      [...(head.match(/\[data-theme="dark"\]\s*{[^}]+}/s)?.[0] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
        .filter((m) => MODERN.test(m[2])).map((m) => m[1]),
    );
    const forced = tail.match(/\[data-theme="dark"\]\s*{[^}]+}/s)?.[0] ?? '';
    const auto = tail.match(/@media \(prefers-color-scheme: dark\)\s*{\s*:root:not\(\[data-theme\]\)\s*{[^}]+}/s)?.[0] ?? '';
    for (const n of darkNeeded) {
      assert(forced.includes(`${n}:`), `dark fallback (forced) missing ${n}`);
      assert(auto.includes(`${n}:`), `dark fallback (system-auto) missing ${n}`);
    }
  });
}
