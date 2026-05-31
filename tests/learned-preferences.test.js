// tests/learned-preferences.test.js — v3 L4 learning-core tests.
// Exercises the pure module in isolation: base-rate discrimination, recency
// decay, override precedence, cold start, the train-only-on-graded guardrail,
// signal extraction, traceability, diversification, and the search spec.
import {
  signalsForListing, priceBand, isRecent,
  deriveWeights, effectiveWeights, listingLearnedPrefs,
  gradedCount, isColdStart, diversifySelection, listingBucketKey,
  deriveSearchSpec, implicatedKinds, REASON_SIGNAL_KINDS,
} from '../assets/js/learned-preferences.js';
import { LEARNED_PREF, RECENCY_DAYS } from '../assets/js/intelligence-constants.js';

export async function register({ test, assert, assertEqual }) {
  const DAY = 86_400_000;
  const NOW = new Date('2026-05-31T00:00:00Z');
  const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();

  // Snapshot factory.
  const snap = (over = {}) => ({
    rightmove_id: over.id || 'x', property_type: 'Detached', beds: 3,
    outcode: 'SO21', area_id: 'abbotstone-so21', price: 350_000, ...over,
  });
  const react = (reaction, over = {}, days = 1, id = Math.random().toString(36).slice(2)) => ({
    id, listing_id: over.id || id, reaction, created_at: ago(days),
    listing_snapshot: snap(over),
  });

  // Build a set of N graded reactions cheaply (default likes of the base snapshot).
  const many = (n, reaction, over = {}) =>
    Array.from({ length: n }, (_, i) => react(reaction, { ...over, id: `${reaction}-${i}` }, 1, `${reaction}-${i}`));

  // ── signal extraction ──────────────────────────────────────────────────────
  test('learned-prefs: signalsForListing extracts type/beds/outcode/area/price-band', () => {
    const sigs = signalsForListing(snap());
    assert(sigs.includes('type:detached'), 'type signal');
    assert(sigs.includes('beds:3'), 'beds signal');
    assert(sigs.includes('outcode:so21'), 'outcode signal');
    assert(sigs.includes('area:abbotstone-so21'), 'area signal');
    assert(sigs.includes('price-band:350-400k'), 'price-band signal');
  });

  test('learned-prefs: 5+ beds collapse to one bucket; priceBand is coarse', () => {
    assert(signalsForListing(snap({ beds: 7 })).includes('beds:5+'), 'beds 5+ bucket');
    assertEqual(priceBand(425_000), '400-450k');
    assertEqual(priceBand(0), null);
  });

  // ── recency ────────────────────────────────────────────────────────────────
  test('learned-prefs: isRecent honours the window and rejects undated', () => {
    assert(isRecent({ added_date: '2026-05-25' }, NOW, 14), 'within 14d');
    assert(!isRecent({ added_date: '2026-04-01' }, NOW, 14), 'outside 14d');
    assert(!isRecent({ added_date: null }, NOW, 14), 'undated is never recent');
  });

  // ── cold start ─────────────────────────────────────────────────────────────
  test('learned-prefs: below COLD_START_MIN graded reactions derives nothing', () => {
    const rs = many(LEARNED_PREF.COLD_START_MIN - 1, 'like');
    assert(isColdStart(rs), 'flagged cold start');
    const { derived, meta } = deriveWeights(rs, { now: NOW });
    assertEqual(Object.keys(derived).length, 0);
    assertEqual(meta.coldStart, true);
  });

  // ── train only on graded ───────────────────────────────────────────────────
  test('learned-prefs: pass/viewed never train (absence is unlabelled)', () => {
    // 30 passes carrying a snapshot must NOT cross the cold-start threshold or
    // produce any weight — only like/reject count.
    const passes = many(30, 'pass');
    assertEqual(gradedCount(passes), 0, 'passes are not graded');
    const { derived, meta } = deriveWeights(passes, { now: NOW });
    assertEqual(meta.coldStart, true);
    assertEqual(Object.keys(derived).length, 0);
  });

  // ── base-rate / discrimination ─────────────────────────────────────────────
  test('learned-prefs: a signal present in EVERYTHING earns ~0 (no re-learning criteria)', () => {
    // Every reaction (10 like, 10 reject) is a Detached home, but beds split the
    // set: liked are 4-bed, rejected are 2-bed. "type:detached" is ubiquitous →
    // ~0; "beds:4" (liked) positive; "beds:2" (rejected) negative.
    const rs = [
      ...many(10, 'like', { beds: 4 }),
      ...many(10, 'reject', { beds: 2 }),
    ];
    const { derived } = deriveWeights(rs, { now: NOW });
    assert(Math.abs(derived['type:detached']?.weight ?? 0) < 0.05, 'ubiquitous signal ~0');
    assert((derived['beds:4']?.weight ?? 0) > 0.05, 'liked-only bed bucket positive');
    assert((derived['beds:2']?.weight ?? 0) < -0.05, 'rejected-only bed bucket negative');
  });

  test('learned-prefs: a discriminating positive signal stays within the weight ceiling', () => {
    const rs = [...many(12, 'like', { outcode: 'GU35' }), ...many(12, 'reject', { outcode: 'SP5' })];
    const w = deriveWeights(rs, { now: NOW }).derived['outcode:gu35']?.weight ?? 0;
    assert(w > 0, 'liked outcode positive');
    assert(w <= LEARNED_PREF.MAX_LEARNED_WEIGHT + 1e-9, 'within ceiling');
  });

  // ── recency ordering ───────────────────────────────────────────────────────
  test('learned-prefs: a recently-liked signal outweighs an equally-counted old one', () => {
    // Two liked bed buckets of equal raw count — one recent, one old — against a
    // common rejected baseline. Recency decay gives the recent bucket the larger
    // share of the liked mass, so it earns the stronger derived weight.
    const rs = [
      ...many(6, 'like', { beds: 4 }).map((r) => ({ ...r, created_at: ago(1) })),
      ...many(6, 'like', { beds: 3 }).map((r) => ({ ...r, created_at: ago(220) })),
      ...many(12, 'reject', { beds: 2 }).map((r) => ({ ...r, created_at: ago(1) })),
    ];
    const d = deriveWeights(rs, { now: NOW }).derived;
    const wRecent = d['beds:4']?.weight ?? 0;
    const wOld = d['beds:3']?.weight ?? 0;
    assert(wRecent > wOld, `recent ${wRecent} > old ${wOld}`);
    assert(wRecent > 0.05, 'the recently-liked signal earns real weight');
  });

  // ── traceability ───────────────────────────────────────────────────────────
  test('learned-prefs: each derived weight records its reaction_ids and counts', () => {
    const rs = [...many(10, 'like', { beds: 4 }), ...many(10, 'reject', { beds: 2 })];
    const d = deriveWeights(rs, { now: NOW }).derived['beds:4'];
    assert(d && Array.isArray(d.reaction_ids) && d.reaction_ids.length === 10, 'reaction_ids traced');
    assertEqual(d.n_liked, 10);
    assertEqual(d.n_rejected, 0);
  });

  test('learned-prefs: a signal below MIN_SIGNAL_N is dropped', () => {
    // 11 likes of Detached + a single 1-off Cottage like → cottage appears once.
    const rs = [...many(11, 'like'), react('like', { property_type: 'Cottage', id: 'c1' }, 1, 'c1')];
    const { derived } = deriveWeights(rs, { now: NOW });
    assert(!('type:cottage' in derived), 'single-occurrence signal dropped');
  });

  // ── new signal: baths ───────────────────────────────────────────────────────
  test('learned-prefs: signalsForListing extracts a bucketed baths signal', () => {
    assert(signalsForListing(snap({ baths: 2 })).includes('baths:2'), 'baths signal');
    assert(signalsForListing(snap({ baths: 4 })).includes('baths:3+'), 'baths 3+ bucket');
    assert(!signalsForListing(snap({ baths: null })).some((s) => s.startsWith('baths:')), 'missing baths → no signal');
  });

  // ── reason-aware causal attribution (v3 L4) ─────────────────────────────────
  const withReasons = (rows, reasons) => rows.map((r) => ({ ...r, reasons }));

  test('learned-prefs: implicatedKinds maps reasons to signal kinds (null when none)', () => {
    assert(implicatedKinds([]) === null, 'empty reasons → null (full contribution)');
    assert(implicatedKinds(null) === null, 'no reasons → null (full contribution)');
    assert(implicatedKinds([{ key: 'wrong_area' }]).has('outcode'), 'wrong_area → outcode');
    assert(implicatedKinds([{ key: 'wrong_area' }]).has('area'), 'wrong_area → area');
    assert(!implicatedKinds([{ key: 'wrong_area' }]).has('beds'), 'wrong_area does not implicate beds');
    assertEqual(implicatedKinds([{ key: 'other' }]).size, 0, 'unmappable reason → empty set (generic discount)');
    assert(Array.isArray(REASON_SIGNAL_KINDS.too_small), 'attribution map is exported');
  });

  test('learned-prefs: wrong_area rejects sharpen outcode/area, NOT beds/price (attribution)', () => {
    // 14 rejects, all in the same (bad) outcode/area, all 2-bed at the same price.
    // Tagged "wrong area" ⇒ only outcode/area should earn strong negative weight;
    // beds/price-band are unattributed and must be discounted to ~0.35× strength.
    const base = { outcode: 'SP5', area_id: 'cann-sp5', beds: 2, price: 360_000 };
    const rejects = many(14, 'reject', base);
    const tagged = withReasons(rejects, [{ key: 'wrong_area', detail: null, note: null }]);
    const d = deriveWeights(tagged, { now: NOW }).derived;

    const wOutcode = d['outcode:sp5']?.weight ?? 0;
    const wArea = d['area:cann-sp5']?.weight ?? 0;
    const wBeds = d['beds:2']?.weight ?? 0;
    const wPrice = d['price-band:350-400k']?.weight ?? 0;

    assert(wOutcode < -0.15, `outcode strongly negative (${wOutcode})`);
    assert(wArea < -0.15, `area strongly negative (${wArea})`);
    // Unattributed signals are heavily suppressed vs the attributed ones.
    assert(Math.abs(wBeds) < Math.abs(wOutcode) * 0.5, `beds suppressed (${wBeds} vs ${wOutcode})`);
    assert(Math.abs(wPrice) < Math.abs(wOutcode) * 0.5, `price suppressed (${wPrice} vs ${wOutcode})`);
  });

  test('learned-prefs: the SAME rejects WITHOUT reasons move all signals equally (back-compat)', () => {
    const base = { outcode: 'SP5', area_id: 'cann-sp5', beds: 2, price: 360_000 };
    const d = deriveWeights(many(14, 'reject', base), { now: NOW }).derived;
    const wOutcode = d['outcode:sp5']?.weight ?? 0;
    const wBeds = d['beds:2']?.weight ?? 0;
    assert(wOutcode < -0.15 && wBeds < -0.15, 'all signals negative');
    assert(Math.abs(wOutcode - wBeds) < 0.01, `equal without attribution (${wOutcode} vs ${wBeds})`);
  });

  test('learned-prefs: the unattributed discount scales the weight by exactly d', () => {
    const base = { outcode: 'SP5', area_id: 'cann-sp5', beds: 2, price: 360_000 };
    const tagged = withReasons(many(14, 'reject', base), [{ key: 'wrong_area' }]);
    const d = deriveWeights(tagged, { now: NOW }).derived;
    const wOutcode = d['outcode:sp5'].weight;       // attributed (full)
    const wBeds = d['beds:2'].weight;                // unattributed (discounted)
    const expected = wOutcode * LEARNED_PREF.UNATTRIBUTED_DISCOUNT;
    assert(Math.abs(wBeds - expected) < 0.01, `beds(${wBeds}) ≈ outcode(${wOutcode})×${LEARNED_PREF.UNATTRIBUTED_DISCOUNT} = ${expected}`);
    // discrimination is scaled by the same factor
    assert(Math.abs(d['beds:2'].discrimination - d['outcode:sp5'].discrimination * LEARNED_PREF.UNATTRIBUTED_DISCOUNT) < 0.02, 'discrimination scaled by d');
  });

  test('learned-prefs: a like tagged right_size produces a positive beds weight', () => {
    const likes = withReasons(many(12, 'like', { beds: 4, outcode: 'GU35' }), [{ key: 'right_size' }]);
    const rejects = many(12, 'reject', { beds: 2, outcode: 'SP5' });
    const d = deriveWeights([...likes, ...rejects], { now: NOW }).derived;
    assert((d['beds:4']?.weight ?? 0) > 0.05, `right_size like lifts beds:4 (${d['beds:4']?.weight})`);
  });

  test('learned-prefs: guardrail holds — reasons on a pass never train', () => {
    // A pass carrying reasons (shouldn't happen, but be defensive) is still
    // unlabelled: it must not cross cold-start or earn any weight.
    const passes = withReasons(many(30, 'pass', { outcode: 'SP5' }), [{ key: 'wrong_area' }]);
    const { derived, meta } = deriveWeights(passes, { now: NOW });
    assertEqual(meta.coldStart, true, 'passes never graduate cold start');
    assertEqual(Object.keys(derived).length, 0, 'no weights from passes');
  });

  // ── override precedence ────────────────────────────────────────────────────
  test('learned-prefs: effectiveWeights lets a Layer-3 override win', () => {
    const derived = { 'type:detached': { weight: 0.2 }, 'beds:4': { weight: 0.1 } };
    const overrides = { 'type:detached': { weight: -0.3, derived_weight_at_set: 0.2 } };
    const eff = effectiveWeights(derived, overrides);
    assertEqual(eff['type:detached'], -0.3, 'override replaces derived');
    assertEqual(eff['beds:4'], 0.1, 'untouched derived survives');
  });

  test('learned-prefs: listingLearnedPrefs selects only the signals a listing has', () => {
    const eff = { 'type:detached': 0.2, 'type:flat': -0.3, 'outcode:so21': 0.1 };
    const prefs = listingLearnedPrefs(snap(), eff);
    assertEqual(prefs['type:detached'], 0.2);
    assertEqual(prefs['outcode:so21'], 0.1);
    assert(!('type:flat' in prefs), 'unrelated signal excluded');
  });

  // ── diversification ────────────────────────────────────────────────────────
  test('learned-prefs: diversifySelection spreads buckets so neighbours differ', () => {
    const items = [
      ...Array.from({ length: 4 }, () => ({ property_type: 'Detached', price: 350_000, beds: 3 })),
      ...Array.from({ length: 4 }, () => ({ property_type: 'Flat', price: 200_000, beds: 1 })),
    ];
    const out = diversifySelection(items, listingBucketKey);
    assertEqual(out.length, 8, 'lossless reorder');
    assert(out[0].property_type !== out[1].property_type, 'first two differ by bucket');
  });

  // ── search spec ────────────────────────────────────────────────────────────
  test('learned-prefs: deriveSearchSpec carries criteria and STRONG learned focus only', () => {
    const criteria = { budget: { min: 250_000, max: 450_000 }, size: { minBeds: 3 }, propertyTypePrefs: { excluded: ['Flat'] } };
    const eff = {
      'type:detached': LEARNED_PREF.MAX_LEARNED_WEIGHT,        // strong + → focus
      'type:bungalow': -LEARNED_PREF.MAX_LEARNED_WEIGHT,       // strong − → exclude
      'outcode:gu35': LEARNED_PREF.MAX_LEARNED_WEIGHT,         // strong + → focus outcode
      'type:cottage': 0.02,                                    // weak → ignored
    };
    const spec = deriveSearchSpec(eff, criteria, { now: NOW });
    assertEqual(spec.priceMin, 250_000);
    assertEqual(spec.priceMax, 450_000);
    assertEqual(spec.minBeds, 3);
    assertEqual(spec.recencyDays, RECENCY_DAYS, 'recency carried');
    assert(spec.excludeTypes.includes('flat'), 'criteria exclusion kept');
    assert(spec.excludeTypes.includes('bungalow'), 'strong negative learned type excluded');
    assert(spec.focusTypes.includes('detached'), 'strong positive learned type focused');
    assert(spec.focusOutcodes.includes('gu35'), 'strong positive outcode focused');
    assert(!spec.focusTypes.includes('cottage'), 'weak learned signal ignored');
  });
}
