// tests/listing-detail.test.js — v3 L6 dossier pure helpers.
import { galleryImages, floorplanImages, priceHistorySeries, netPriceChange } from '../../assets/js/listings/detail.js';

export async function register({ test, assert, assertEqual }) {
  test('listing-detail: galleryImages reads raw_json.images[].url + dedupes the primary', () => {
    const listing = {
      image_url: 'https://media.rightmove.co.uk/a.jpeg',
      raw_json: { images: [
        { url: 'https://media.rightmove.co.uk/a.jpeg', caption: null }, // same as primary
        { url: 'https://media.rightmove.co.uk/b.jpeg', caption: 'Kitchen' },
        { url: '', caption: null },                                     // skipped
        'https://media.rightmove.co.uk/c.jpeg',                         // bare string
      ] },
    };
    const imgs = galleryImages(listing);
    assertEqual(imgs.length, 3, 'deduped + filtered');
    assertEqual(imgs[0], 'https://media.rightmove.co.uk/a.jpeg');
    assert(imgs.includes('https://media.rightmove.co.uk/c.jpeg'), 'bare-string url kept');
  });

  test('listing-detail: galleryImages falls back to image_url when no gallery', () => {
    assertEqual(galleryImages({ image_url: 'https://x/y.jpeg', raw_json: {} }).length, 1);
    assertEqual(galleryImages({ image_url: null, raw_json: { images: [] } }).length, 0);
  });

  test('listing-detail: floorplanImages reads floorplans[] (objects + bare strings), deduped', () => {
    const listing = {
      floorplan_url: 'https://media.rightmove.co.uk/fp0.gif',
      raw_json: { floorplans: [
        { url: 'https://media.rightmove.co.uk/fp0.gif', caption: 'Ground floor' }, // dupes typed
        { url: 'https://media.rightmove.co.uk/fp1.gif' },
        { src: 'https://media.rightmove.co.uk/fp2.png' },                          // .src variant
        'https://media.rightmove.co.uk/fp3.jpeg',                                  // bare string
        { url: '' },                                                               // skipped
      ] },
    };
    const fps = floorplanImages(listing);
    assertEqual(fps.length, 4, 'typed + 3 distinct, deduped & filtered');
    assertEqual(fps[0], 'https://media.rightmove.co.uk/fp0.gif', 'typed column first');
    assert(fps.includes('https://media.rightmove.co.uk/fp2.png'), '.src variant kept');
    assert(fps.includes('https://media.rightmove.co.uk/fp3.jpeg'), 'bare string kept');
  });

  test('listing-detail: floorplanImages is empty when the source carried none', () => {
    assertEqual(floorplanImages({ raw_json: { images: ['https://x/a.jpeg'] } }).length, 0);
    assertEqual(floorplanImages({ floorplan_url: null, raw_json: {} }).length, 0);
    assertEqual(floorplanImages(null).length, 0);
  });

  test('listing-detail: floorplanImages accepts a single raw_json.floorplan', () => {
    assertEqual(floorplanImages({ raw_json: { floorplan: 'https://x/fp.gif' } })[0], 'https://x/fp.gif');
    assertEqual(floorplanImages({ raw_json: { floorplan: { url: 'https://x/fp2.gif' } } })[0], 'https://x/fp2.gif');
  });

  test('listing-detail: priceHistorySeries sorts, flags listed/reduced, computes delta', () => {
    const s = priceHistorySeries([
      { date: '2026-03-01', price: 400000 },
      { date: '2026-01-01', price: 425000 },
      { date: '2026-04-01', price: 400000 },
    ]);
    assertEqual(s.length, 3);
    assertEqual(s[0].kind, 'listed');
    assertEqual(s[0].price, 425000, 'earliest first');
    assertEqual(s[1].kind, 'reduced');
    assertEqual(s[1].delta, -25000);
    assertEqual(s[2].kind, 'unchanged');
  });

  test('listing-detail: a single price point is just "listed"', () => {
    const s = priceHistorySeries([{ date: '2026-05-01', price: 350000 }]);
    assertEqual(s.length, 1);
    assertEqual(s[0].kind, 'listed');
    assertEqual(netPriceChange(s), 0);
  });

  test('listing-detail: netPriceChange is last − first', () => {
    const s = priceHistorySeries([
      { date: '2026-01-01', price: 500000 },
      { date: '2026-05-01', price: 460000 },
    ]);
    assertEqual(netPriceChange(s), -40000);
  });

  test('listing-detail: an increase is flagged', () => {
    const s = priceHistorySeries([
      { date: '2026-01-01', price: 300000 },
      { date: '2026-02-01', price: 310000 },
    ]);
    assertEqual(s[1].kind, 'increased');
    assertEqual(s[1].delta, 10000);
  });
}
