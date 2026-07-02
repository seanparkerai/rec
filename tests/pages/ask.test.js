// tests/pages/ask.test.js — DOM-tier pins for step 3.9d: the ⚙ 3.1 wireframe
// for Ask ("chat column, composer pinned above the keyboard (dvh), Messages
// dialog unchanged") was verified ALREADY LIVE on entry — ask.css is
// explicitly iPhone-first (dvh/svh, safe-area insets, sticky composer).
// These pins lock the page contract + the pinning mechanism at source.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export async function register({ test, assert, assertEqual }) {
  test('ask: chat column order + native dialogs hold (3.9d verify+pin)', () => {
    const html = readFileSync(join(ROOT, 'pages/ask.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'https://example.test/pages/ask.html' });
    const doc = dom.window.document;
    const { Node } = dom.window;
    const transcript = doc.getElementById('ask-transcript');
    const composer = doc.getElementById('ask-composer');
    assert(transcript && composer, 'transcript + composer exist');
    assertEqual(composer.tagName, 'FORM', 'the composer is a real form (Enter-to-send semantics)');
    assert(transcript.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the transcript precedes the composer — the sticky bottom edge reads as a chat window');
    for (const id of ['ask-history', 'ask-compose', 'ask-messages']) {
      assertEqual(doc.getElementById(id)?.tagName, 'DIALOG', `#${id} is a native <dialog> (§11) — Messages surface unchanged`);
    }
    assert(!doc.querySelector('[style]'), 'no inline styles (DESIGN.md §6.7)');
    dom.window.close();
  });

  test('ask: the composer pin + viewport fill are dvh/svh at source (CSS pin)', () => {
    const css = readFileSync(join(ROOT, 'assets/css/pages/ask.css'), 'utf8');
    const composerBlock = css.match(/\.ask-composer\s*\{[^}]*\}/)?.[0] || '';
    assert(/position:\s*sticky/.test(composerBlock) && /bottom:\s*0/.test(composerBlock),
      'the composer is pinned to the bottom edge (sticky, thumb-zone)');
    assert(/100dvh/.test(css), 'the chat column fills the live viewport via dvh');
    assert(!/\d(vh)\b/.test(css.replace(/dvh|svh|lvh/g, '')), 'no raw vh anywhere in ask.css');
  });
}
