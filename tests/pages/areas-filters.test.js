// tests/pages/areas-filters.test.js — DOM-tier pins for step 3.7a: the areas
// directory's filter sheet runs on the SHARED wireFilterSheet mechanism (the
// page's inline script — the original the module was extracted from at 3.4c —
// is deleted; one mechanism now serves listings, saved and areas). Pins the
// wiring, the areas-specific pill describe(), the result-count mirror, and the
// injection-safety the inline innerHTML version lacked.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function areasDom() {
  const html = readFileSync(join(ROOT, 'pages/areas.html'), 'utf8');
  return new JSDOM(html, { url: 'https://example.test/pages/areas.html' });
}

function shimDialog(dlg) {
  let modal = false;
  dlg.showModal = function () { modal = true; this.setAttribute('open', ''); };
  dlg.close = function () { modal = false; this.removeAttribute('open'); };
  dlg.matches = (sel) => (sel === ':modal' ? modal : false);
  return () => modal;
}

export async function register({ test, assert, assertEqual }) {
  test('areas page: map-first with a one-tap jump to the directory (step 3.7b)', () => {
    const dom = areasDom();
    const doc = dom.window.document;
    const chip = doc.querySelector('.map-card .map-to-list');
    assertEqual(chip?.getAttribute('href'), '#directory', 'the floating chip jumps to the directory');
    const target = doc.getElementById('directory');
    assert(target, 'the jump target exists');
    assert(doc.querySelector('.map-card').compareDocumentPosition(target) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
      'map leads, directory follows — map-first order');
    assert(!doc.querySelector('[style]'), 'no inline styles (DESIGN.md §6.7)');
    dom.window.close();
  });

  test('areas page: the inline filter-sheet script is gone; the shared module wires it', async () => {
    const dom = areasDom();
    const doc = dom.window.document;
    globalThis.document = doc;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Node = dom.window.Node;
    globalThis.MutationObserver = dom.window.MutationObserver;
    assert(![...doc.querySelectorAll('script:not([src])')].some((s) => /matchMedia|filter-pill/.test(s.textContent)),
      'no inline filter-sheet script remains in the page');
    assert([...doc.querySelectorAll('script[src]')].some((s) => s.getAttribute('src').includes('areas/filter-sheet-init.js')),
      'the page loads the shared-module wiring instead');

    const dlg = doc.getElementById('filter-sheet');
    const isModal = shimDialog(dlg);
    const mod = await import('../../assets/js/areas/filter-sheet-init.js');
    // Re-wire onto this document via the export (the import-time self-run may have
    // consumed a previous suite's document — the export is the test seam).
    const sheet = mod.initAreaFilterSheet(doc);
    assert(sheet, 'initAreaFilterSheet wires the real page markup');

    // The areas describe(): search text renders as a TEXT pill (injection-safe),
    // facets and toggles join it, and the result count mirrors into the footer.
    doc.getElementById('search').value = '<img src=x> winchester';
    doc.getElementById('only-shortlisted').checked = true;
    doc.getElementById('result-count').textContent = '17';
    sheet.refresh();
    const sheetCount = doc.getElementById('filter-sheet-count');
    const active = doc.getElementById('active-filters');
    // refresh() on the returned sheet only redraws pills; the count mirror rides
    // the page-level listeners — fire one as the page would.
    doc.getElementById('search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const pills = [...active.querySelectorAll('.filter-pill')];
    assertEqual(pills.length, 2, 'search + shortlisted read as active filters');
    assert(!active.querySelector('img'), 'search text can never become markup (the inline innerHTML hole is closed)');
    assert(/winchester/.test(pills[0].textContent), 'the search pill carries the raw text');
    assertEqual(sheetCount.textContent, '17', 'the live result count mirrors into the sheet footer');

    // Modal choreography still behaves (shared mechanism).
    doc.getElementById('open-filters').click();
    assert(isModal() && dlg.hasAttribute('open'), 'trigger opens the sheet modally');
    doc.getElementById('filter-sheet-close').click();
    assert(!isModal(), 'Done closes it');
    dom.window.close();
  });
}
