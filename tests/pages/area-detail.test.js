// tests/pages/area-detail.test.js — DOM-tier pins for step 3.7d: the area
// dossier's above-the-fold contract (the matched-price verdict strip leads),
// the sticky mini-TOC's anchor parity with the article sections, and the 3.5d
// dossier-fold shell shared onto the four colour tail sections (native
// <details>, OPEN by default — nothing ever hidden; the heading IS the
// summary; TOC anchors keep landing on the section wrappers).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const FOLDED = ['section-things', 'section-eat', 'section-proscons', 'section-suits'];
const UNFOLDED = ['section-overview', 'section-amenities', 'section-schools', 'section-transport', 'section-prices'];

function detailDom() {
  const html = readFileSync(join(ROOT, 'pages/area-detail.html'), 'utf8');
  return new JSDOM(html, { url: 'https://example.test/pages/area-detail.html?id=x' });
}

export async function register({ test, assert, assertEqual }) {
  test('area detail: the matched-price verdict strip leads — above-the-fold order (⚙ 3.1 wireframe)', () => {
    const dom = detailDom();
    const doc = dom.window.document;
    const { Node } = dom.window;
    const strip = doc.getElementById('area-verdict');
    assert(strip, 'the affordability verdict strip exists');
    assert(strip.querySelector('#area-verdict-num'), 'the strip carries the matched price + monthly P&I slot');
    const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert(follows(doc.querySelector('.page-head'), strip), 'the strip sits directly under the page head');
    assert(follows(strip, doc.querySelector('.stat-strip')), 'key-facts follow the verdict, never precede it');
    assert(follows(strip, doc.querySelector('.area-toc')), 'the TOC follows the verdict');
    assert(follows(strip, doc.querySelector('article.article')), 'the article body follows the verdict');
    dom.window.close();
  });

  test('area detail: sticky mini-TOC anchors resolve to the article sections, in document order', () => {
    const dom = detailDom();
    const doc = dom.window.document;
    const links = [...doc.querySelectorAll('.area-toc a')];
    assert(links.length >= 9, 'the TOC covers the nine-section framework');
    const targets = links.map((a) => a.getAttribute('href').slice(1));
    for (const id of targets) assert(doc.getElementById(id), `TOC anchor #${id} resolves to a section`);
    const sectionIds = [...doc.querySelectorAll('article.article > .article-section')].map((s) => s.id);
    assertEqual(JSON.stringify(targets), JSON.stringify(sectionIds), 'TOC order mirrors the article order exactly');
    dom.window.close();
  });

  test('area detail: the colour tail shares the 3.5d dossier-fold shell, open by default', () => {
    const dom = detailDom();
    const doc = dom.window.document;
    for (const id of FOLDED) {
      const sec = doc.getElementById(id);
      const fold = sec.querySelector(':scope > details.dossier-fold');
      assert(fold, `#${id} folds behind the shared shell`);
      assert(fold.hasAttribute('open'), `#${id} is OPEN by default — nothing hidden`);
      const summary = fold.querySelector(':scope > summary.dossier-fold__summary');
      assert(summary && summary.querySelector('h2'), `#${id}'s heading IS the summary`);
      assert(fold.querySelector(`#sec-${id.replace('section-', '')}`), `#${id}'s render slot lives inside the fold`);
    }
    dom.window.close();
  });

  test('area detail: the research-status cue slot sits under key-facts, hidden until JS proves incompleteness (6.4)', () => {
    const dom = detailDom();
    const doc = dom.window.document;
    const { Node } = dom.window;
    const cue = doc.getElementById('research-status');
    assert(cue, 'the research-status cue element exists');
    assert(cue.hasAttribute('hidden'), 'the cue ships hidden — a complete dossier never shows it');
    assertEqual(cue.textContent.trim(), '', 'the cue ships empty — copy comes from the shared researchStatusLine()');
    const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert(follows(doc.querySelector('.stat-strip'), cue), 'the cue follows the key-facts strip');
    assert(follows(cue, doc.querySelector('.area-toc')), 'the cue precedes the TOC + article body');
    dom.window.close();
  });

  test('area detail: primary sections stay unfolded editorial; no inline styles (DESIGN.md §6.7)', () => {
    const dom = detailDom();
    const doc = dom.window.document;
    for (const id of UNFOLDED) {
      const sec = doc.getElementById(id);
      assert(sec, `#${id} exists`);
      assert(!sec.querySelector('details'), `#${id} (decision content) is never folded`);
    }
    assert(!doc.querySelector('[style]'), 'no inline style attributes in the page');
    dom.window.close();
  });
}
