// tests/pages/listings-browse.test.js — DOM-tier pins for the rebuilt Browse
// surface (step 3.4c): listings.html drives from THE shared property-card
// family (⚙ 3.1 decision 2 — one primary design for all three property pages),
// its search/sort/facet controls live in a native <dialog> filter sheet
// (Linear-dense: "full filter sets open in <dialog>", DESIGN.md §1), and the
// feed container is the shared .prop-list register. The feed CONTRACT
// (household_feed RPC, paging) is pinned separately in tests/integration/
// feed-scope.test.js and is untouched by this view-layer cutover.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function pageDom() {
  const html = readFileSync(join(ROOT, 'pages/listings.html'), 'utf8');
  return new JSDOM(html, { url: 'https://example.test/pages/listings.html' });
}

const LISTING = {
  rightmove_id: '9911', title: 'Two-bed cottage', address: 'Mill Lane, Swanmore',
  outcode: 'SO32', price: 350000, beds: 2, baths: 1, property_type: 'cottage',
  image_url: null, status: 'live', url: 'https://rightmove.example/9911',
  lat: 50.95, lng: -1.18, distance_mi: 0.8, area_id: 'swanmore-so32',
  first_seen: '2026-06-28T09:00:00Z',
  areas: [{ area_id: 'swanmore-so32', name: 'Swanmore', distance_mi: 0.8, is_primary: true }],
};
const SCORED = { verdict: 'possible', score: 0.61, gated: false, contributions: [{ delta: 0.2, label: 'Within budget' }] };
const AREA = { id: 'swanmore-so32', name: 'Swanmore' };

async function loadBuilders(dom) {
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  const { buildRow } = await import('../../assets/js/page-listings/row.js');
  return { buildRow };
}

export async function register({ test, assert, assertEqual }) {
  test('browse page: controls live inside a native filter-sheet <dialog>', () => {
    const dom = pageDom();
    const doc = dom.window.document;
    const dlg = doc.getElementById('listings-filter-sheet');
    assert(dlg && dlg.tagName === 'DIALOG' && dlg.classList.contains('filter-sheet'),
      'the filter sheet is a native <dialog class="filter-sheet">');
    for (const k of ['search', 'sort', 'type', 'beds', 'status', 'clear']) {
      assert(dlg.querySelector(`[data-control="${k}"]`), `"${k}" control moved into the sheet`);
    }
    assert(dlg.querySelector('[data-listings-filter]'), 'the controls wrapper (controls.wire seam) is inside the sheet');
    assert(dlg.querySelector('[data-show-oor]') && dlg.querySelector('[data-show-hidden]'),
      'the reveal toggles (out-of-reach / hidden) join the sheet');
    const trigger = doc.querySelector('[data-open-filters]');
    assertEqual(trigger?.getAttribute('aria-haspopup'), 'dialog', 'trigger announces the dialog');
    assertEqual(trigger?.getAttribute('aria-controls'), 'listings-filter-sheet');
    assert(doc.querySelector('[data-active-filters]'), 'active-filter pill region present on the trigger row');
    assert(doc.querySelector('[data-fetch-days]') && !dlg.querySelector('[data-fetch-days]'),
      'the fetch actions stay on the page, not in the filter sheet');
    dom.window.close();
  });

  test('browse page: the feed is the shared prop-list register with static empty states', () => {
    const dom = pageDom();
    const doc = dom.window.document;
    const list = doc.querySelector('[data-listings]');
    assert(list && list.classList.contains('prop-list'), 'feed container is the shared .prop-list register');
    assertEqual(list.getAttribute('role'), 'list', 'div register keeps list semantics');
    assert(!doc.querySelector('.listing-list'), 'the legacy ol.listing-list is gone from Browse');
    const none = doc.querySelector('[data-empty-none]');
    const done = doc.querySelector('[data-empty-done]');
    assert(none?.hidden && done?.hidden, 'both empty states ship hidden as siblings of the list');
    assert(done.querySelector('a[href*="rejected"]') && done.querySelector('a[href*="saved-listings"]'),
      'the all-reviewed state routes to Rejected and Saved');
    assert(!doc.querySelector('[style]'), 'no inline style attributes in the page (DESIGN.md §6.7)');
    dom.window.close();
  });

  test('buildRow: the Rightmove register (3.11) — photo-led card, core data only, dossier owns the rest', async () => {
    const dom = pageDom();
    const { buildRow } = await loadBuilders(dom);
    const row = buildRow(LISTING, 0, SCORED, AREA, {
      reaction: null, status: '', reviewed: false, hiddenRules: [],
      onSave: async () => {}, onStatus: async () => {},
    });
    assert(row.classList.contains('prop-card'), 'the row is the shared prop-card family');
    assertEqual(row.getAttribute('role'), 'listitem', 'article carries listitem inside the div register');
    assertEqual(row.dataset.id, '9911');
    assert(row.querySelector('.prop-card__dot--possible'), 'verdict dot in the shared head');
    assertEqual(row.querySelector('.prop-card__verdict')?.textContent, 'Possible match',
      'the shared head carries the existing verdict vocabulary (listings/labels.js)');
    assertEqual(row.querySelector('.prop-card__price')?.textContent, '£350,000');
    assert(row.querySelector('.prop-card__title-link')?.getAttribute('href')?.includes('property.html?id=9911'),
      'title links to OUR dossier');
    assert(/0\.8 mi from Swanmore/.test(row.querySelector('.prop-card__meta')?.textContent || ''),
      'distance is core data on the mono data line, not a chip');
    assert(!row.querySelector('.listing-tag--geo'), 'no geo chip — distance moved to the data line');
    assert(!row.querySelector('details.listing-areas') && !row.querySelector('details.listing-why'),
      'the membership + why expanders live in the dossier, not on the card');
    const actions = row.querySelector('.prop-card__actions');
    assert(actions?.querySelector('.reaction-picker--row'), 'the reaction picker lands in the thumb-zone slot');
    assert(!actions?.querySelector('select.listing-status'), 'no status select on the card (dossier-only)');
    assert(!row.querySelector('.btn-rm') && !row.querySelector('.btn-map'),
      'no external Rightmove/map links on the card (dossier-only)');
    assert(![...row.querySelectorAll('*')].some((n) => [...n.classList].some((c) => c.startsWith('listing-card'))),
      'no legacy .listing-card__* classes remain in the row');
    assert(!row.querySelector('[style]'), 'no inline styles (DESIGN.md §6.7)');
    dom.window.close();
  });

  test('buildRow: drop/New overlay the photo; reviewed maps to the shared badge', async () => {
    const dom = pageDom();
    const { buildRow } = await loadBuilders(dom);
    const fresh = buildRow({ ...LISTING, update_reason: 'new' }, 0, SCORED, AREA, { reviewed: false, hiddenRules: [] });
    const overlay = fresh.querySelector('.prop-card__figure .prop-card__overlay');
    assert(/New/.test(overlay?.textContent || ''), 'the New chip sits ON the cover photo');
    assert(!/New/.test(fresh.querySelector('.prop-card__tags')?.textContent || ''),
      'the New chip is not duplicated in the tag row');
    const plain = buildRow(LISTING, 0, SCORED, AREA, { reviewed: false, hiddenRules: [] });
    assert(!plain.querySelector('.prop-card__overlay'), 'no overlay wrapper without a signal to show');
    const reviewed = buildRow(LISTING, 0, SCORED, AREA, {
      reviewed: true, reaction: { reaction: 'like' }, hiddenRules: [],
    });
    assert(/Reviewed/.test(reviewed.querySelector('.prop-card__badge')?.textContent || ''),
      'reviewed state renders through the shared badge slot');
    dom.window.close();
  });

  test('reaction picker: progressive reveal — verbs only, then reasons+Save, then the ✓ one-liner', async () => {
    const dom = pageDom();
    const { buildRow } = await loadBuilders(dom);
    // Untouched card: three verbs, nothing else.
    const row = buildRow(LISTING, 0, SCORED, AREA, {
      reaction: null, reviewed: false, hiddenRules: [], onSave: async () => {},
    });
    const picker = row.querySelector('.reaction-picker--row');
    assert(picker && !picker.querySelector('.listing-react').hidden, 'verb row is visible on an untouched card');
    assert(picker.querySelector('.listing-save-row').hidden, 'no Save button before a verb is chosen');
    assert(picker.querySelector('.listing-reasons').hidden, 'no reason chips before a verb is chosen');
    assert(picker.querySelector('.reaction-confirm').hidden, 'no confirmed one-liner before a decision');
    // Tap a verb: reasons + Save appear.
    picker.querySelector('[data-react="like"]').click();
    assert(!picker.querySelector('.listing-save-row').hidden, 'Save appears after a verb tap');
    assert(!picker.querySelector('.listing-reasons').hidden, 'the like-reasons vocabulary appears after a verb tap');
    // A saved decision renders collapsed to the one-liner; tapping re-opens.
    const decided = buildRow(LISTING, 0, SCORED, AREA, {
      reaction: { reaction: 'like', reasons: [] }, reviewed: true, hiddenRules: [], onSave: async () => {},
    });
    const dp = decided.querySelector('.reaction-picker--row');
    const confirm = dp.querySelector('.reaction-confirm');
    assert(!confirm.hidden && /Liked/.test(confirm.textContent), 'decided card collapses to "✓ Liked — change"');
    assert(dp.querySelector('.listing-react').hidden && dp.querySelector('.listing-save-row').hidden,
      'verbs and Save are hidden behind the one-liner');
    confirm.click();
    assert(confirm.hidden && !dp.querySelector('.listing-react').hidden,
      'the one-liner re-opens the picker for a change of mind');
    dom.window.close();
  });

  test('filter-sheet wiring: modal on phones, inline card on desktop, safe pill summary', async () => {
    const dom = pageDom();
    const doc = dom.window.document;
    const { wireFilterSheet } = await import('../../assets/js/filter-sheet.js');
    const dlg = doc.getElementById('listings-filter-sheet');
    // jsdom has no dialog internals — shim the contract the wiring calls.
    let modal = false;
    dlg.showModal = function () { modal = true; this.setAttribute('open', ''); };
    dlg.close = function () { modal = false; this.removeAttribute('open'); };
    dlg.matches = (sel) => (sel === ':modal' ? modal : false);
    dlg.setAttribute('open', ''); // as shipped for the no-JS/desktop default
    let pills = [];
    const listeners = [];
    const mq = { matches: true, addEventListener: (_, fn) => listeners.push(fn) };
    const sheet = wireFilterSheet({
      dlg,
      openBtn: doc.querySelector('[data-open-filters]'),
      closeBtn: doc.querySelector('[data-close-filters]'),
      activeEl: doc.querySelector('[data-active-filters]'),
      describe: () => pills,
      mq,
    });
    assert(!dlg.hasAttribute('open'), 'phone: the shipped inline-open attribute is removed on wire');
    doc.querySelector('[data-open-filters]').click();
    assert(modal && dlg.hasAttribute('open'), 'phone: trigger opens the sheet modally');
    doc.querySelector('[data-close-filters]').click();
    assert(!modal && !dlg.hasAttribute('open'), 'Done closes the sheet');
    mq.matches = false;
    listeners.forEach((fn) => fn());
    assert(dlg.hasAttribute('open') && !modal, 'desktop: the sheet re-opens as an inline card');
    sheet.hide();
    assert(!dlg.hasAttribute('open'), 'hide() (review mode) closes it in either mode');
    const active = doc.querySelector('[data-active-filters]');
    assertEqual(active.textContent, 'No filters set.', 'empty state names itself');
    pills = ['“<img src=x>”', '3+ beds'];
    sheet.refresh();
    const rendered = [...active.querySelectorAll('.filter-pill')];
    assertEqual(rendered.length, 2, 'one pill per active filter');
    assert(!active.querySelector('img'), 'pill text is text — user search terms can never inject markup');
    dom.window.close();
  });
}
