// tests/pages/journey.test.js — DOM-tier pins for step 3.9c: the ⚙ 3.1
// wireframe for Journey ("vertical timeline, current stage pinned; ticks
// write journey_progress as today"). The timeline + tick behaviour is
// JS/storage-driven and covered at its own tiers; the page contract — the
// pinned "where you are" line ahead of the timeline, native dialogs, the
// polite live region — is the unit here. (Stickiness itself is CSS,
// verified in code per DESIGN.md §4.)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export async function register({ test, assert, assertEqual }) {
  test('journey: pinned progress line leads the timeline; dialogs + live region native (3.9c)', () => {
    const html = readFileSync(join(ROOT, 'pages/journey.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'https://example.test/pages/journey.html' });
    const doc = dom.window.document;
    const { Node } = dom.window;
    const progress = doc.querySelector('.tl-progress');
    assert(progress, 'the "where you are" progress line exists');
    assert(progress.querySelector('#tl-current'), 'it carries the current-stage readout');
    const timeline = doc.getElementById('timeline');
    assertEqual(timeline?.tagName, 'OL', 'the timeline is an ordered list (vertical rail)');
    assert(progress.compareDocumentPosition(timeline) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the progress line precedes the timeline — the sticky pin has something to ride over');
    assertEqual(doc.getElementById('tl-status-live')?.getAttribute('aria-live'), 'polite',
      'tick announcements go through the polite live region (§11)');
    for (const id of ['step-modal', 'reset-modal']) {
      assertEqual(doc.getElementById(id)?.tagName, 'DIALOG', `#${id} is a native <dialog> (§11)`);
    }
    assert(!doc.querySelector('[style]'), 'no inline styles (DESIGN.md §6.7)');
    dom.window.close();
  });

  // The sticky treatment mirrors the finance-toc/area-toc register — pin the
  // mechanism at source so a CSS rebuild can't silently unpin the wireframe's
  // "current stage pinned" requirement.
  test('journey: the progress line is the sticky spine at source (CSS pin)', () => {
    const css = readFileSync(join(ROOT, 'assets/css/pages/journey.css'), 'utf8');
    const block = css.match(/\.tl-progress\s*\{[^}]*\}/)?.[0] || '';
    assert(/position:\s*sticky/.test(block), '.tl-progress is position: sticky');
    assert(/top:\s*var\(--header-h/.test(block), 'pinned under the sticky header (token-driven)');
  });
}
