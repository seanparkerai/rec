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

  test('ask: Compose a11y contract (step 8.5) — every control labelled, output announced', () => {
    const html = readFileSync(join(ROOT, 'pages/ask.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'https://example.test/pages/ask.html' });
    const doc = dom.window.document;
    const compose = doc.getElementById('ask-compose');
    assert(compose?.tagName === 'DIALOG' && compose.getAttribute('aria-label'),
      'Compose is a named native dialog');
    // §11: every form control programmatically labelled — a wrapping <label>,
    // an aria-label, an aria-labelledby, or an id another label points at.
    for (const el of compose.querySelectorAll('input, select, textarea')) {
      const labelled = el.closest('label')
        || el.getAttribute('aria-label')
        || el.getAttribute('aria-labelledby')
        || (el.id && doc.querySelector(`label[for="${el.id}"]`));
      assert(labelled, `compose control ${el.id || el.name || el.type} has a programmatic label`);
    }
    // The drafted message is ANNOUNCED: it streams into the transcript, whose
    // assistant bubbles are aria-live regions (transcript.js), and the draft
    // action bar carries its own polite status region for copy/log feedback.
    const draftTpl = [...doc.querySelectorAll('template')]
      .find((t) => t.content.querySelector('.ask-draft__status'));
    assert(draftTpl?.content.querySelector('.ask-draft__status[role="status"][aria-live="polite"]'),
      'the draft card template carries a polite live status region');
    const transcriptSrc = readFileSync(join(ROOT, 'assets/js/ask/transcript.js'), 'utf8');
    assert(/setAttribute\('aria-live',\s*'polite'\)/.test(transcriptSrc),
      'assistant bubbles are aria-live polite (the drafted email is announced as it streams)');
    dom.window.close();
  });
}
