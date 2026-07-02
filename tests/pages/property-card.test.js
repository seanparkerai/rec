// tests/pages/property-card.test.js — DOM-tier pins for THE shared property-card
// family (step 3.4b): the one primary design Browse/Saved/Rejected drive from
// (⚙ 3.1 decision 2). Asserts the skeleton anatomy, the a11y contract (labelled
// dossier affordance, decorative img alt, focusable title link), the media
// fallback behaviour, slot composition, and the no-inline-style rule
// (DESIGN.md §6.7) — so surface cutovers (3.4c/d) build on pinned ground.
import { JSDOM } from 'jsdom';

const LISTING = {
  rightmove_id: '123456', title: '3-bed cottage, Church Lane',
  address: 'Church Lane, Swanmore', outcode: 'SO32', price: 385000,
  beds: 3, baths: 1, property_type: 'cottage',
  image_url: 'https://media.example/img.jpg',
};

async function load() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/' });
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  const mod = await import('../../assets/js/listings/property-card.js');
  return { dom, ...mod };
}

export async function register({ test, assert, assertEqual }) {
  test('prop-card: full anatomy — media link, verdict head, mono price, title link, place, meta', async () => {
    const { buildPropertyCard, dom } = await load();
    const card = buildPropertyCard(LISTING, {
      href: '/pages/property.html?id=123456',
      verdict: 'possible', verdictLabel: 'Possible',
    });
    assertEqual(card.tagName, 'ARTICLE');
    assertEqual(card.dataset.id, '123456');
    const mediaLink = card.querySelector('.prop-card__media-link');
    assert(mediaLink && mediaLink.getAttribute('aria-label')?.includes('3-bed cottage'),
      'media is a labelled dossier affordance');
    const img = card.querySelector('.prop-card__img');
    assertEqual(img.getAttribute('alt'), '', 'image inside the labelled link is decorative');
    assertEqual(img.getAttribute('loading'), 'lazy');
    assertEqual(img.getAttribute('referrerpolicy'), 'no-referrer');
    assert(card.querySelector('.prop-card__dot--possible'), 'fit dot carries the verdict tone');
    assertEqual(card.querySelector('.prop-card__verdict').textContent, 'Possible');
    assertEqual(card.querySelector('.prop-card__price').textContent, '£385,000');
    const titleLink = card.querySelector('.prop-card__title-link');
    assertEqual(titleLink.tagName, 'A', 'title is a real link when href is given');
    assertEqual(card.querySelector('.prop-card__place').textContent, 'Church Lane, Swanmore · SO32');
    assertEqual(card.querySelector('.prop-card__meta').textContent, '3 bed · 1 bath · cottage');
    assert(card.querySelector('.prop-card__head').firstElementChild.classList.contains('prop-card__price'),
      'price leads the head (Rightmove register, 3.11)');
    assert(!card.querySelector('[style]'), 'no inline style attributes anywhere (DESIGN.md §6.7)');
    dom.window.close();
  });

  test('prop-card: slots compose — badge, metaExtra, overlay, tags, details, thumb-zone actions, compact', async () => {
    const { buildPropertyCard, dom } = await load();
    const doc = globalThis.document;
    const tag = doc.createElement('span'); tag.textContent = '↓ £10,000';
    const over = doc.createElement('span'); over.textContent = 'New';
    const detail = doc.createElement('details'); detail.className = 'why';
    const actions = doc.createElement('div'); actions.className = 'reactions';
    const card = buildPropertyCard(LISTING, {
      badge: { label: 'Rejected', tone: 'reject' },
      metaExtra: 'Actioned 3 Jun 2026',
      overlay: [over], tags: [tag], details: [detail], actions, compact: true,
    });
    assert(card.classList.contains('prop-card--compact'), 'compact register applies');
    assert(card.querySelector('.prop-card__figure > .prop-card__overlay span'),
      'overlay chips sit in the photo figure, as siblings of the media (outside any link)');
    assert(!card.querySelector('.prop-card__media .prop-card__overlay'),
      'overlay is never nested inside the media box (the labelled link would swallow its text)');
    assertEqual(card.querySelector('.prop-card__badge--reject').textContent, 'Rejected');
    assert(card.querySelector('.prop-card__meta').textContent.endsWith('· Actioned 3 Jun 2026'),
      'metaExtra joins the data line');
    assert(card.querySelector('.prop-card__tags span'), 'caller tags land in the tag row');
    assert(card.querySelector('details.why'), 'caller details land in the body');
    assert(card.querySelector('.prop-card__actions .reactions'), 'actions land in the thumb-zone slot');
    assert(!card.querySelector('.prop-card__dot'), 'no phantom verdict dot without a verdict');
    dom.window.close();
  });

  test('prop-card: media falls back to a monogram — missing image and broken image alike', async () => {
    const { buildPropertyCard, dom } = await load();
    const bare = buildPropertyCard({ ...LISTING, image_url: null }, {});
    assertEqual(bare.querySelector('.prop-card__media--none').textContent, 'C', 'type monogram when no image');
    const broken = buildPropertyCard(LISTING, { href: '/x' });
    broken.querySelector('.prop-card__img').dispatchEvent(new dom.window.Event('error'));
    assert(broken.querySelector('.prop-card__media--none'), 'broken image swaps to the monogram');
    assert(broken.querySelector('.prop-card__media-link'), 'the dossier link survives the swap');
    dom.window.close();
  });

  test('prop-card: image-led at EVERY width pinned at CSS source (3.11 Rightmove register, owner decision)', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../../assets/css/components/property-card.css', import.meta.url), 'utf8');
    // The 560px thumbnail fallback is GONE — the cover photo leads everywhere.
    assert(!css.includes('@container propcard (min-width: 560px)'),
      'no wide-container thumbnail register remains (the "extremely small image" regression)');
    assert(/\.prop-card\s*{[^}]*grid-template-columns:\s*1fr\b/s.test(css),
      'base register is single-column (image leads, content stacks)');
    assert(/inline-size:\s*100%/.test(css) && /aspect-ratio:\s*3\s*\/\s*2/.test(css),
      'media is a full-width 3:2 cover photo with a reserved aspect box (zero-CLS lazy load)');
    // Pico article chrome is flattened — shadow-floated cards are a §3 ban.
    assert(/box-shadow:\s*none/.test(css) && /background:\s*transparent/.test(css),
      'Pico <article> card chrome is reset on .prop-card');
    // Wide screens: the same photo-led card flows into the sanctioned grid.
    assert(/@media \(min-width: 768px\)[\s\S]*?\.prop-list--grid[\s\S]*?repeat\(2, 1fr\)/.test(css),
      '2-up photo grid from tablet portrait (§6.1 canonical breakpoint)');
    assert(/@media \(min-width: 1280px\)[\s\S]*?\.prop-list--grid[\s\S]*?repeat\(3, 1fr\)/.test(css),
      '3-up from 1280');
    // Compact (Rejected/Passed) keeps the dense small-thumb row at every width.
    assert(/\.prop-card--compact\s*{[^}]*grid-template-columns:\s*auto 1fr/s.test(css),
      'compact (Rejected/Passed) register stays a small-thumb row');
    // Overlay chips never intercept the photo's dossier tap target.
    assert(/\.prop-card__overlay\s*{[^}]*pointer-events:\s*none/s.test(css),
      'photo overlay is click-transparent');
  });

  test('prop-card: helpers — title/place/meta fallbacks shared by every surface', async () => {
    const { propertyTitle, propertyPlace, propertyMeta, buildPropertyCard, dom } = await load();
    assertEqual(propertyTitle({ beds: 2, property_type: 'flat' }), '2-bed flat');
    assertEqual(propertyTitle({}), '?-bed property');
    assertEqual(propertyPlace({ outcode: 'SO32' }, 'Swanmore'), 'Swanmore · SO32');
    assertEqual(propertyMeta({ beds: 3 }), '3 bed');
    const noHref = buildPropertyCard({ ...LISTING, image_url: null }, {});
    assertEqual(noHref.querySelector('.prop-card__title-link').tagName, 'SPAN',
      'no href → title renders as text, never a dead link');
    dom.window.close();
  });
}
