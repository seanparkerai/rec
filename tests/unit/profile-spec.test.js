// profile-spec.test.js — the pure core of a search profile (Phase 1b).
//
// These are the rules that decide what a profile costs and what it returns, so
// they get pinned hard. In particular: keywords are a HARD filter here because
// Rightmove's own `keywords=` only re-ranks, and an empty keyword list must mean
// "no filtering" rather than "match nothing" — inverting that would silently
// empty a user's feed.
import {
  validateSpec, signatureKey, keywordGate, agedGate, priceGate, isProfileRunnable,
  ALLOWED_PROPERTY_TYPES, MAX_KEYWORDS, VALID_RECENCY_DAYS, SORTS,
} from '../../assets/js/search/profile-spec.js';

const exact = (over = {}) => validateSpec({ priceMode: 'exact', price: 400000, ...over }).spec;

export async function register({ test, assert, assertEqual }) {
  // ── validateSpec ───────────────────────────────────────────────────────────
  test('profile-spec: a new profile must be exact-price, never a range', () => {
    const { errors } = validateSpec({ priceMode: 'range', priceMin: 1, priceMax: 2 });
    assert(errors.some((e) => /legacy-only/.test(e)), 'range must be rejected for new profiles');
    const legacy = validateSpec({ priceMode: 'range', priceMin: 250000, priceMax: 425000 }, { allowLegacyRange: true });
    assertEqual(legacy.errors.length, 0, 'the migrated legacy profiles must still validate');
    assertEqual(legacy.spec.priceMax, 425000, 'legacy band preserved so unpausing reproduces today');
  });

  test('profile-spec: an exact profile needs a positive price', () => {
    assert(validateSpec({ price: 0 }).errors.length, 'zero price rejected');
    assert(validateSpec({ price: -5 }).errors.length, 'negative price rejected');
    assert(validateSpec({}).errors.length, 'missing price rejected');
    assertEqual(validateSpec({ price: 375000 }).errors.length, 0, 'a real price validates');
  });

  test('profile-spec: propertyTypes narrow within the allow-list but can never widen it', () => {
    // The hard allow-list excludes the whole flat family, land and park homes at
    // source. A profile must not be able to re-admit them.
    const { spec } = validateSpec({ price: 400000, propertyTypes: ['detached', 'flat', 'land'] });
    assertEqual(spec.propertyTypes.join(','), 'detached', 'only allowed types survive');
    const none = validateSpec({ price: 400000, propertyTypes: ['flat'] });
    assert(none.errors.some((e) => /matched none/.test(e)), 'an all-excluded list is an error, not a silent full-scope run');
    assertEqual(exact().propertyTypes.length, ALLOWED_PROPERTY_TYPES.length, 'omitted means the full allow-list');
  });

  test('profile-spec: recencyDays is an enum, and null is meaningful', () => {
    // Rightmove returns ZERO results for an off-ladder value, silently — the same
    // failure class as the off-ladder radius that cost 36 of 56 targets (ADR 0011).
    assertEqual(validateSpec({ price: 1, recencyDays: null }).spec.recencyDays, null, 'null = no recency limit at all');
    for (const d of VALID_RECENCY_DAYS) {
      assertEqual(validateSpec({ price: 1, recencyDays: d }).spec.recencyDays, d, `${d} is on the ladder`);
    }
    const bad = validateSpec({ price: 1, recencyDays: 2 });
    assert(bad.errors.some((e) => /zero results/.test(e)), 'off-ladder value must be a loud error');
  });

  test('profile-spec: keywords are capped at Rightmove’s limit of 3, deduped and lowercased', () => {
    const { spec, errors } = validateSpec({ price: 1, keywords: ['Period', 'period', 'Georgian', 'cottage', 'barn'] });
    assertEqual(spec.keywords.length, MAX_KEYWORDS, 'capped at 3');
    assertEqual(spec.keywords.join(','), 'period,georgian,cottage', 'deduped, lowercased, order preserved');
    assert(errors.some((e) => /at most 3/.test(e)), 'dropping keywords must be reported, not silent');
  });

  // ── signatureKey ───────────────────────────────────────────────────────────
  test('profile-spec: identical searches share a signature, different ones do not', () => {
    // Two households wanting the same search must cost the same as one.
    assertEqual(signatureKey(exact()), signatureKey(exact()), 'same spec, same signature');
    assert(signatureKey(exact()) !== signatureKey(exact({ price: 375000 })), 'price changes the signature');
    assert(signatureKey(exact()) !== signatureKey(exact({ sort: 'oldest' })), 'sort changes the signature');
    assert(signatureKey(exact()) !== signatureKey(exact({ recencyDays: null })), 'recency changes the signature');
    assert(signatureKey(exact()) !== signatureKey(exact({ keywords: ['period'] })), 'keywords change the signature');
  });

  test('profile-spec: signature ignores area scope and keyword order', () => {
    // Areas decide WHICH outcodes a signature runs against, not what the search
    // looks like — folding them in would fragment signatures and multiply cost.
    assertEqual(
      signatureKey(exact({ areaScope: { areaIds: ['a'] } })),
      signatureKey(exact({ areaScope: 'household' })),
      'area scope must not fragment the signature');
    assertEqual(
      signatureKey(exact({ keywords: ['cottage', 'period'] })),
      signatureKey(exact({ keywords: ['period', 'cottage'] })),
      'keyword order must not fragment the signature');
  });

  // ── keywordGate ────────────────────────────────────────────────────────────
  test('profile-spec: an empty keyword list filters NOTHING', () => {
    // The owner asked for "3 keywords, or none". Getting this backwards would
    // silently empty every profile that opted out of keyword filtering.
    const r = keywordGate({ title: 'A house' }, exact({ keywords: [] }));
    assert(r.keep, 'no keywords means keep everything');
    assertEqual(r.hits.length, 0, 'and no hits recorded');
  });

  test('profile-spec: keyword matching is whole-word', () => {
    const spec = exact({ keywords: ['period', 'georgian', 'cottage'] });
    assert(!keywordGate({ description: 'a periodic review' }, spec).keep, '"periodic" must not match "period"');
    assert(!keywordGate({ description: 'two cottages' }, spec).keep, '"cottages" must not match "cottage"');
    assert(keywordGate({ description: 'A fine period home' }, spec).keep, 'the real word matches');
    assert(keywordGate({ title: 'Georgian rectory' }, spec).keep, 'case-insensitive across fields');
  });

  test('profile-spec: keyword hits are reported so the filter can be tuned', () => {
    const spec = exact({ keywords: ['period', 'cottage'] });
    const r = keywordGate({ title: 'Period cottage', description: '' }, spec);
    assertEqual(r.hits.sort().join(','), 'cottage,period', 'every matching tag is recorded');
  });

  test('profile-spec: keywordFields limits where we look, and arrays are searched', () => {
    const spec = exact({ keywords: ['cottage'], keywordFields: ['title'] });
    assert(!keywordGate({ title: 'A home', description: 'cottage' }, spec).keep, 'description ignored when not configured');
    const arr = exact({ keywords: ['cottage'], keywordFields: ['keyFeatures'] });
    assert(keywordGate({ keyFeatures: ['Detached cottage', 'Garden'] }, arr).keep, 'array fields are flattened and searched');
  });

  test('profile-spec: a regex-special keyword cannot throw or over-match', () => {
    const spec = exact({ keywords: ['c++'] });
    assert(!keywordGate({ title: 'anything at all' }, spec).keep, 'special chars are escaped, not interpreted');
  });

  // ── agedGate ───────────────────────────────────────────────────────────────
  test('profile-spec: undated listings are KEPT, never silently dropped', () => {
    // We cannot prove a listing is too new; dropping the undated would quietly
    // shrink the feed with no trace.
    assert(agedGate({}, exact({ minAgeDays: 90 })).keep, 'no date means keep');
    assert(agedGate({ added_date: 'not-a-date' }, exact({ minAgeDays: 90 })).keep, 'unparseable date means keep');
  });

  test('profile-spec: the days-on-market floor cuts recent stock only when set', () => {
    const now = new Date('2026-08-27T00:00:00Z');
    const old = { added_date: '2026-01-01T00:00:00Z' };
    const fresh = { added_date: '2026-08-25T00:00:00Z' };
    assert(agedGate(old, exact({ minAgeDays: 90 }), now).keep, '239 days passes a 90-day floor');
    assert(!agedGate(fresh, exact({ minAgeDays: 90 }), now).keep, '2 days fails a 90-day floor');
    assert(agedGate(fresh, exact({}), now).keep, 'no floor set means keep everything');
    assertEqual(agedGate(fresh, exact({}), now).days, 2, 'days-on-market is reported either way');
  });

  // ── priceGate ──────────────────────────────────────────────────────────────
  test('profile-spec: the exact-price gate admits only that price', () => {
    const spec = exact({ price: 400000 });
    assert(priceGate({ price: 400000 }, spec), 'the exact price passes');
    assert(!priceGate({ price: 399999 }, spec), 'a pound under is out');
    assert(!priceGate({ price: 400001 }, spec), 'a pound over is out');
    assert(!priceGate({ price: null }, spec), 'an unpriced listing is out');
  });

  // ── isProfileRunnable ──────────────────────────────────────────────────────
  test('profile-spec: four independent switches, any one of which stops a profile', () => {
    const on = { enabled: true, admin_paused: false };
    assert(isProfileRunnable(on, {}, { fetch_enabled: true }), 'all clear runs');
    assert(!isProfileRunnable({ ...on, enabled: false }, {}, { fetch_enabled: true }), 'household switch off');
    assert(!isProfileRunnable({ ...on, admin_paused: true }, {}, { fetch_enabled: true }), 'admin pause');
    assert(!isProfileRunnable(on, { search_paused: true }, { fetch_enabled: true }), 'per-user pause');
    assert(!isProfileRunnable(on, {}, { fetch_enabled: false }), 'global kill switch');
  });

  test('profile-spec: sort vocabulary matches the confirmed Rightmove values', () => {
    assertEqual(SORTS.newest, 6, 'newest listed');
    assertEqual(SORTS.oldest, 10, 'oldest listed — verified against the live site');
  });
}
