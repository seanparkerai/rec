// tests/listing-flags.test.js — review-screen post-fetch classifier.
// Asserts the HIDE tier (auction, over-55 / retirement) and the FLAG tier (new
// build, condition red-flags), plus the conservative guards that stop a benign
// phrase from tripping a hide.
import { classifyListing, HIDE_LABELS } from '../assets/js/listings/flags.js';

export async function register({ test, assert, assertEqual }) {
  const mk = (over = {}) => ({ rightmove_id: 'x', title: '', description: '', ...over });
  const flagKeys = (c) => c.flags.map((f) => f.key);

  // ── HIDE: auction ──────────────────────────────────────────────────────────
  test('listing-flags: "for sale by auction" is hidden', () => {
    const c = classifyListing(mk({ title: '3 bed house', description: 'For sale by auction, guide price £200,000.' }));
    assertEqual(c.hide, true);
    assert(c.hideReasons.includes('auction'), 'auction reason present');
  });

  test('listing-flags: "modern method of auction" is hidden', () => {
    assertEqual(classifyListing(mk({ description: 'Sold via the modern method of auction.' })).hide, true);
  });

  test('listing-flags: a plain sale is NOT hidden', () => {
    const c = classifyListing(mk({ title: '3 bedroom detached house', description: 'A lovely family home with garden and driveway.' }));
    assertEqual(c.hide, false);
    assertEqual(c.flags.length, 0);
  });

  // ── HIDE: over-55 / retirement ──────────────────────────────────────────────
  test('listing-flags: retirement property is hidden', () => {
    const c = classifyListing(mk({ title: '2 bed retirement apartment', description: 'A McCarthy Stone retirement development.' }));
    assertEqual(c.hide, true);
    assert(c.hideReasons.includes('over-55'), 'over-55 reason present');
  });

  test('listing-flags: "over 55s only" is hidden', () => {
    assertEqual(classifyListing(mk({ description: 'This development is for the over 55s only.' })).hide, true);
  });

  test('listing-flags: age-negation guard keeps a normal home visible', () => {
    // "no age restriction" must NOT trip the over-55 rule.
    const c = classifyListing(mk({ description: 'Spacious bungalow with no age restriction — open to all buyers.' }));
    assertEqual(c.hide, false);
  });

  // ── FLAG: new build (visible, labelled) ─────────────────────────────────────
  test('listing-flags: new build is flagged, not hidden', () => {
    const c = classifyListing(mk({ title: 'New build 4 bed detached', description: 'Brand new home on a new development.' }));
    assertEqual(c.hide, false);
    assert(flagKeys(c).includes('new-build'), 'new-build flag present');
  });

  test('listing-flags: raw_json newHome flag is honoured', () => {
    const c = classifyListing(mk({ description: 'A detached house.', raw_json: { newHome: true } }));
    assert(flagKeys(c).includes('new-build'), 'raw newHome flag surfaces');
    assertEqual(c.hide, false);
  });

  // ── FLAG: condition red-flags (visible, labelled) ───────────────────────────
  test('listing-flags: "needs modernisation" is flagged, not hidden', () => {
    const c = classifyListing(mk({ description: 'A project that needs modernisation throughout.' }));
    assertEqual(c.hide, false);
    assert(flagKeys(c).includes('needs-work'), 'needs-work flag present');
  });

  test('listing-flags: "cash buyers only" and "investment opportunity" flag', () => {
    assert(flagKeys(classifyListing(mk({ description: 'Cash buyers only please.' }))).includes('cash-only'), 'cash-only flag');
    assert(flagKeys(classifyListing(mk({ description: 'A great investment opportunity.' }))).includes('investment'), 'investment flag');
  });

  // ── shape ────────────────────────────────────────────────────────────────────
  test('listing-flags: HIDE_LABELS cover every emitted reason', () => {
    const c = classifyListing(mk({ description: 'Retirement apartment, for sale by auction.' }));
    for (const r of c.hideReasons) assert(HIDE_LABELS[r], `label exists for reason "${r}"`);
  });
}
