// tests/pages/saved-rejected.test.js — DOM-tier pins for step 3.4d: Saved and
// Rejected/Passed become thin compositions of THE shared property-card family
// (⚙ 3.1 decision 2 — three pages, one primary design; the old Rejected table's
// cleanliness is the calibration bar, now expressed as the compact register).
// Pure view-builders live in page-<name>/ subfolders (§19) so jsdom can drive
// them without the storage-touching coordinators.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function pageDom(page) {
  const html = readFileSync(join(ROOT, `pages/${page}`), 'utf8');
  return new JSDOM(html, { url: `https://example.test/pages/${page}` });
}

const LISTING = {
  rightmove_id: '7711', title: 'Thatched cottage, The Green',
  address: 'The Green, Shedfield', outcode: 'SO32', price: 425000,
  beds: 3, baths: 2, property_type: 'cottage',
  image_url: null, url: 'https://rightmove.example/7711',
};

function withDom(dom) {
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  return dom;
}

export async function register({ test, assert, assertEqual }) {
  test('saved page: prop-list register + filter sheet, no legacy ol/listing-list', () => {
    const dom = pageDom('saved-listings.html');
    const doc = dom.window.document;
    const list = doc.querySelector('[data-saved-listings]');
    assert(list?.classList.contains('prop-list') && list.getAttribute('role') === 'list',
      'saved list is the shared .prop-list register');
    assert(!doc.querySelector('.listing-list'), 'legacy ol.listing-list gone');
    const dlg = doc.getElementById('saved-filter-sheet');
    assert(dlg?.tagName === 'DIALOG' && dlg.classList.contains('filter-sheet'),
      'saved controls live in the shared filter-sheet dialog');
    assert(dlg.querySelector('[data-listings-filter]'), 'controls wrapper inside the sheet');
    assertEqual(doc.querySelector('[data-open-filters]')?.getAttribute('aria-controls'), 'saved-filter-sheet');
    assert(doc.querySelector('[data-empty-saved]')?.hidden, 'static empty state ships hidden beside the list');
    dom.window.close();
  });

  test('saved card: a thin composition of the shared family — badge, positives, edit/rate/link actions', async () => {
    const dom = withDom(pageDom('saved-listings.html'));
    const { buildSavedCard } = await import('../../assets/js/page-saved-listings/card.js');
    const card = buildSavedCard(LISTING, {
      reaction: { reaction: 'like', reasons: [{ key: 'kerb', label: 'Kerb appeal' }] },
      rating: 7, onSave: async () => {}, onRate: async () => {},
    });
    assert(card.classList.contains('prop-card'), 'saved card IS the shared prop-card');
    assertEqual(card.getAttribute('role'), 'listitem');
    assert(/Liked/.test(card.querySelector('.prop-card__badge')?.textContent || ''),
      'the ♥ Liked state renders through the shared badge slot');
    assertEqual(card.querySelector('.prop-card__price')?.textContent, '£425,000');
    assert(card.querySelector('.prop-card__title-link')?.getAttribute('href')?.includes('property.html?id=7711'),
      'title links to the dossier with from=saved context');
    assert(card.querySelector('.listing-positives'), '"why you liked it" chips compose into the body');
    const actions = card.querySelector('.prop-card__actions');
    assert(actions?.querySelector('.listing-react-toggle'), 'collapsed reaction editor in the thumb zone');
    assert(actions?.querySelector('.listing-rating-wrap, [class*="rating"]'), 'rating control in the thumb zone');
    assert(actions?.querySelector('.btn-rm'), 'Rightmove link in the thumb zone');
    assert(![...card.querySelectorAll('*')].some((n) => [...n.classList].some((c) => c.startsWith('listing-card'))),
      'no legacy .listing-card__* classes remain');
    assert(!card.querySelector('[style]'), 'no inline styles (DESIGN.md §6.7)');
    dom.window.close();
  });

  test('rejected page: the table is now the compact prop-list register; search/pager/empty stay', () => {
    const dom = pageDom('rejected.html');
    const doc = dom.window.document;
    assert(!doc.querySelector('table'), 'the bespoke table is gone');
    const list = doc.querySelector('[data-rejected-list]');
    assert(list?.classList.contains('prop-list') && list.getAttribute('role') === 'list',
      'rejected renders into the shared .prop-list register');
    assert(doc.querySelector('[data-control="search"]'), 'search survives');
    assert(doc.querySelector('[data-rejected-pager]') && doc.querySelector('[data-rejected-prev]')
      && doc.querySelector('[data-rejected-next]'), '50-per-page pagination survives');
    assert(doc.querySelector('[data-rejected-empty]'), 'empty state container survives');
    dom.window.close();
  });

  test('rejected card: compact register row — verdict badge, actioned date, area place fallback', async () => {
    const dom = withDom(pageDom('rejected.html'));
    const { buildRejectedCard } = await import('../../assets/js/page-rejected/row.js');
    const rejected = buildRejectedCard({
      listing: LISTING, reaction: 'reject', reasons: [], created_at: '2026-06-03T10:00:00Z', areaName: 'Shedfield',
    });
    assert(rejected.classList.contains('prop-card') && rejected.classList.contains('prop-card--compact'),
      'rejected rows use the compact register — the density the old table had');
    assertEqual(rejected.getAttribute('role'), 'listitem');
    assertEqual(rejected.querySelector('.prop-card__badge')?.textContent, 'Rejected');
    assert(rejected.querySelector('.prop-card__badge--reject'), 'reject tone on the badge');
    assert(/Actioned 3 Jun 2026/.test(rejected.querySelector('.prop-card__meta')?.textContent || ''),
      'the actioned date joins the mono data line');
    assert(rejected.querySelector('.prop-card__title-link')?.getAttribute('href')?.includes('from=rejected'),
      'dossier link keeps the rejected back-context');
    const passed = buildRejectedCard({
      listing: { ...LISTING, address: null }, reaction: 'pass', reasons: [], created_at: '2026-06-03T10:00:00Z', areaName: 'Shedfield',
    });
    assertEqual(passed.querySelector('.prop-card__badge')?.textContent, 'Passed');
    assert((passed.querySelector('.prop-card__place')?.textContent || '').includes('Shedfield'),
      'area name stands in for a missing address (snapshot-durable rows)');
    assert(!rejected.querySelector('[style]') && !passed.querySelector('[style]'), 'no inline styles');
    dom.window.close();
  });
}
