// tests/pages/toc-observer.test.js — DOM-tier pins for step 3.9a: the TOC
// scrollspy is ONE shared module (assets/js/toc-observer.js) serving both
// editorial spines (area-detail .area-toc, profile .about-toc); the two
// near-identical page inline scripts are deleted (3.7a precedent). jsdom has
// no IntersectionObserver — a capturing shim drives the callback, so OUR
// wiring (aria-current choreography, spine coverage) is the unit under test.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function pageDom(page) {
  const html = readFileSync(join(ROOT, `pages/${page}`), 'utf8');
  return new JSDOM(html, { url: `https://example.test/pages/${page}` });
}

function shimIO(win) {
  const instances = [];
  win.IntersectionObserver = class {
    constructor(cb, opts) { this.cb = cb; this.opts = opts; this.observed = []; instances.push(this); }
    observe(el) { this.observed.push(el); }
    disconnect() { this.observed = []; }
  };
  return instances;
}

export async function register({ test, assert, assertEqual }) {
  test('toc scrollspy: both pages load the shared module; the inline scripts are gone', () => {
    for (const page of ['area-detail.html', 'profile.html']) {
      const dom = pageDom(page);
      const doc = dom.window.document;
      assert(![...doc.querySelectorAll('script:not([src])')].some((s) => /IntersectionObserver/.test(s.textContent)),
        `${page}: no inline scrollspy script remains`);
      assert([...doc.querySelectorAll('script[src]')].some((s) => s.getAttribute('src').includes('toc-observer.js')),
        `${page}: the shared module is loaded instead`);
      dom.window.close();
    }
  });

  test('toc scrollspy: observes every section and moves aria-current with the viewport', async () => {
    const dom = pageDom('area-detail.html');
    const doc = dom.window.document;
    const instances = shimIO(dom.window);
    const { initTocObserver } = await import('../../assets/js/toc-observer.js');

    const io = initTocObserver('.area-toc', doc);
    assert(io, 'the spine wires up');
    assertEqual(instances.length, 1, 'one observer per spine');
    const links = [...doc.querySelectorAll('.area-toc a')];
    assertEqual(instances[0].observed.length, links.length, 'every TOC-linked section is observed');

    const secOverview = doc.getElementById('section-overview');
    const secPrices = doc.getElementById('section-prices');
    instances[0].cb([{ target: secOverview, isIntersecting: true }]);
    assertEqual(doc.querySelector('.area-toc a[aria-current="true"]')?.getAttribute('href'), '#section-overview',
      'the in-view section marks its link');
    instances[0].cb([{ target: secPrices, isIntersecting: true }, { target: secOverview, isIntersecting: false }]);
    const current = [...doc.querySelectorAll('.area-toc a[aria-current="true"]')];
    assertEqual(current.length, 1, 'exactly one current link at a time');
    assertEqual(current[0].getAttribute('href'), '#section-prices', 'aria-current follows the viewport');
    dom.window.close();
  });

  test('toc scrollspy: profile spine wires on the same mechanism', async () => {
    const dom = pageDom('profile.html');
    const doc = dom.window.document;
    const instances = shimIO(dom.window);
    const { initTocObserver } = await import('../../assets/js/toc-observer.js');
    const io = initTocObserver('.about-toc', doc);
    assert(io, 'profile spine wires up');
    assert(instances[0].observed.length >= 3, 'profile sections observed');
    dom.window.close();
  });
}
