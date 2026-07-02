// tests/pages/dossier.test.js — DOM-tier pins for the property-dossier rebuild
// (step 3.5, Stripe-docs anchor). 3.5b: the m2m area membership renders as
// linked "why am I seeing this" chips — the same explicit answer the feed
// gives, in the dossier's editorial register.
import { JSDOM } from 'jsdom';

async function load() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/pages/property.html' });
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  const mod = await import('../../assets/js/page-property/sections.js');
  return { dom, ...mod };
}

export async function register({ test, assert, assertEqual }) {
  test('dossier membership: linked area chips with mono distance and text-marked primary', async () => {
    const { buildAreaMembership, dom } = await load();
    const section = buildAreaMembership({
      areas: [
        { area_id: 'wickham-po17', name: 'Wickham', distance_mi: 1.4, is_primary: true },
        { area_id: 'shedfield-so32', name: 'Shedfield', distance_mi: 0.6, is_primary: false },
      ],
    });
    const chips = [...section.querySelectorAll('a.chip')];
    assertEqual(chips.length, 2, 'one linked chip per member area');
    assert(chips[0].getAttribute('href').includes('area-detail.html?id=shedfield-so32'),
      'chips sort nearest-first and link to the area dossier');
    assertEqual(chips[0].querySelector('.num')?.textContent, '0.6 mi', 'distance in mono');
    assert(/primary/.test(chips[1].textContent), 'primary flagged in TEXT, never colour alone (§11)');
    assert(!/primary/.test(chips[0].textContent), 'non-primary chips carry no marker');
    assert(section.querySelector('ul.chip-grid'), 'chips sit in the shared chip-grid register');
    assert(!section.querySelector('[style]'), 'no inline styles (DESIGN.md §6.7)');
    dom.window.close();
  });

  test('dossier folds: Description and Price history collapse behind open-by-default <details>', async () => {
    const { buildDescription, buildPriceHistory, dom } = await load();
    const desc = buildDescription({ description: 'First paragraph.\n\nSecond paragraph.' });
    const fold = desc.querySelector('details.dossier-fold');
    assert(fold && fold.hasAttribute('open'), 'description folds behind an OPEN-by-default details');
    assertEqual(fold.querySelector('summary h2.dossier-section__label')?.textContent, 'Description',
      'the section label IS the summary (one heading, one disclosure)');
    assertEqual(fold.querySelectorAll('.dossier-prose p').length, 2, 'paragraph splitting preserved');
    const hist = buildPriceHistory({ price_history: null });
    assert(hist.querySelector('details.dossier-fold[open] summary h2')?.textContent === 'Price history',
      'price history uses the same fold shell');
    assertEqual(buildDescription({}), null, 'no description → no section at all');
    dom.window.close();
  });

  test('dossier membership: null when no membership is attached (section drops out)', async () => {
    const { buildAreaMembership, dom } = await load();
    assertEqual(buildAreaMembership({ areas: [] }), null);
    assertEqual(buildAreaMembership({}), null);
    dom.window.close();
  });
}
