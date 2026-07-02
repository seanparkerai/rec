// tests/pages/profile.test.js — DOM-tier pins for step 3.9b: the ⚙ 3.1
// wireframe for Profile ("inline-edit field groups; Areas section = the
// shared picker; first-run banner until real data") was verified ALREADY
// LIVE on entry — these pins lock that state so a rebuild can't lose it
// silently. Behaviour (field engine, picker, banner logic) is JS-driven and
// covered at its own tiers; the page contract is the unit here.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function profileDom() {
  const html = readFileSync(join(ROOT, 'pages/profile.html'), 'utf8');
  return new JSDOM(html, { url: 'https://example.test/pages/profile.html' });
}

export async function register({ test, assert, assertEqual }) {
  test('profile: the wireframe contract holds — banner, picker mount, spine, inline-edit shell', () => {
    const dom = profileDom();
    const doc = dom.window.document;
    const banner = doc.getElementById('first-run-banner');
    assert(banner && banner.hidden, 'first-run banner ships hidden — JS reveals it only without real data');
    assert(doc.getElementById('areas-mount'), 'the Areas section is the shared picker mount (one component, both surfaces)');
    assert(doc.getElementById('edit-dialog')?.tagName === 'DIALOG', 'inline editing uses a native <dialog> (§11)');
    assert(doc.querySelector('.criteria-save-bar'), 'the save bar shell exists for the field engine');
    assert(!doc.querySelector('[style]'), 'no inline styles (DESIGN.md §6.7)');
    dom.window.close();
  });

  test('profile: the about-toc spine anchors resolve to the about-sections, in order', () => {
    const dom = profileDom();
    const doc = dom.window.document;
    const targets = [...doc.querySelectorAll('.about-toc a')].map((a) => a.getAttribute('href').slice(1));
    assert(targets.length >= 4, 'the spine covers the four field groups');
    for (const id of targets) {
      const sec = doc.getElementById(id);
      assert(sec, `spine anchor #${id} resolves`);
      assert(sec.classList.contains('about-section'), `#${id} is an about-section (scroll-margin + scrollspy contract)`);
    }
    const sectionIds = [...doc.querySelectorAll('.about-section')].map((s) => s.id);
    assertEqual(JSON.stringify(targets), JSON.stringify(sectionIds), 'spine order mirrors the page order exactly');
    dom.window.close();
  });
}
