// tests/learned-preferences.test.js — v3 L4 learning-core tests.
// Exercises the pure module in isolation: base-rate discrimination, recency
// decay, override precedence, cold start, the train-only-on-graded guardrail,
// signal extraction, traceability, diversification, and the search spec.
import {
  signalsForListing, priceBand, isRecent,
  deriveWeights, effectiveWeights, listingLearnedPrefs,
  gradedCount, isColdStart, diversifySelection, listingBucketKey,
  deriveSearchSpec, implicatedKinds, REASON_SIGNAL_KINDS, SUBREASON_SIGNAL_KINDS, trainingProgress,
  inferOutdoorSpace, inferParking,
} from '../../assets/js/learned-preferences.js';
import { LEARNED_PREF, RECENCY_DAYS, TRAINING_MILESTONES } from '../../assets/js/intelligence-constants.js';

export async function register({ test, assert, assertEqual }) {
  const DAY = 86_400_000;
  const NOW = new Date('2026-05-31T00:00:00Z');
  const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();

  // Snapshot factory.
  const snap = (over = {}) => ({
    rightmove_id: over.id || 'x', property_type: 'Detached', beds: 3,
    outcode: 'SO24', area_id: 'abbotstone-so24', price: 350_000, ...over,
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
    assert(sigs.includes('outcode:so24'), 'outcode signal');
    assert(sigs.includes('area:abbotstone-so24'), 'area signal');
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
  test('learned-prefs: removed_area rejects are excluded from all training', () => {
    // A pile of administrative `removed_area` rejects must behave like they were
    // never in the log: no graded count, no derived weights, no training progress.
    const removed = many(40, 'reject').map((r) => ({ ...r, reason: 'removed_area', reasons: [{ key: 'removed_area', detail: null, note: null }] }));
    assertEqual(gradedCount(removed), 0, 'administrative rejects are not graded');
    assert(isColdStart(removed), 'cannot cross cold start on administrative rejects alone');
    const { derived } = deriveWeights(removed, { now: NOW });
    assertEqual(Object.keys(derived).length, 0, 'no signal learned from a removed area');
    const tp = trainingProgress(removed);
    assertEqual(tp.rejects, 0, 'training progress ignores administrative rejects');

    // And they do not pollute a genuine signal: likes of the base snapshot vs
    // rejects of a 2-bed Flat should still learn type/beds, unchanged by adding
    // 40 removed_area rejects of detached homes alongside.
    const genuine = [...many(15, 'like'), ...many(15, 'reject', { property_type: 'Flat', beds: 2 }).map((r) => ({ ...r, reason: 'wrong_house_type', reasons: [{ key: 'wrong_house_type', detail: null, note: null }] }))];
    const base = deriveWeights(genuine, { now: NOW }).derived;
    const withNoise = deriveWeights([...genuine, ...removed], { now: NOW }).derived;
    assertEqual(JSON.stringify(withNoise), JSON.stringify(base), 'removed_area rejects leave the model identical');
  });

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
    // Both sides attributed to beds (right_size / too_small) so the BEDS contrast is the
    // training signal; type:detached, ubiquitous and discounted symmetrically, still cancels.
    const rs = [
      ...many(10, 'like', { beds: 4 }).map((r) => ({ ...r, reasons: [{ key: 'right_size', detail: null, note: null }] })),
      ...many(10, 'reject', { beds: 2 }).map((r) => ({ ...r, reason: 'too_small', reasons: [{ key: 'too_small', detail: null, note: null }] })),
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
    // wrong_house_type (primary and each sub-chip) attributes to the property type signal.
    assert(implicatedKinds([{ key: 'wrong_house_type' }]).has('type'), 'wrong_house_type → type');
    assert(implicatedKinds([{ key: 'wrong_house_type', detail: 'maisonette' }]).has('type'), 'wrong_house_type:maisonette → type');
    assert(!implicatedKinds([{ key: 'wrong_house_type' }]).has('area'), 'wrong_house_type does not implicate area');
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

  test('learned-prefs: an unattributed reject (no reason) does NOT train — a reason is required', () => {
    // CHANGED CONTRACT (2026-06): a reject carrying no reason at all is UNATTRIBUTED — it
    // hides the listing but carries no causal information, so it must not move any weight.
    // Crediting unattributed rejects at full weight against every feature is exactly what
    // poisoned the live model (in-budget detached homes quick-rejected for their LOCATION
    // read as "dislikes detached"). It now behaves like an absent training signal. A
    // REASONED reject of the same home still trains — proving the gate is the missing
    // reason, not the reject verb.
    const base = { outcode: 'SP5', area_id: 'cann-sp5', beds: 2, price: 360_000 };
    const bare = many(14, 'reject', base);
    assertEqual(gradedCount(bare), 0, 'unattributed rejects are not graded');
    assert(isColdStart(bare), 'unattributed rejects cannot cross cold start');
    assertEqual(Object.keys(deriveWeights(bare, { now: NOW }).derived).length, 0, 'no weights from unattributed rejects');
    assertEqual(trainingProgress(bare).rejects, 0, 'training progress ignores unattributed rejects');
    // The same rejects, now reasoned "wrong area", DO train (attributed to outcode/area).
    const d = deriveWeights(withReasons(bare, [{ key: 'wrong_area', detail: null, note: null }]), { now: NOW }).derived;
    assert((d['outcode:sp5']?.weight ?? 0) < -0.15, 'a reasoned reject of the same home trains');
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
    // A pass carrying reasons is still unlabelled: cold-start fires first so passes
    // alone produce no weights and never graduate cold start.
    const passes = withReasons(many(30, 'pass', { outcode: 'SP5' }), [{ key: 'wrong_area' }]);
    const { derived, meta } = deriveWeights(passes, { now: NOW });
    assertEqual(meta.coldStart, true, 'passes never graduate cold start');
    assertEqual(Object.keys(derived).length, 0, 'passes alone produce no weights (cold start guard)');
  });

  // ── sub-reason attribution (v3 L4 refinement) ──────────────────────────────
  test('learned-prefs: too_expensive→poor_value adds type signal to price-band', () => {
    const kinds = implicatedKinds([{ key: 'too_expensive', detail: 'poor_value' }]);
    assert(kinds.has('price-band'), 'price-band from parent too_expensive');
    assert(kinds.has('type'), 'type added by poor_value sub-reason');
  });

  test('learned-prefs: right_size→plot adds outdoor signal to beds', () => {
    const kinds = implicatedKinds([{ key: 'right_size', detail: 'plot' }]);
    assert(kinds.has('beds'), 'beds from parent right_size');
    assert(kinds.has('outdoor'), 'outdoor added by plot sub-reason');
  });

  test('learned-prefs: no_outdoor→no_parking adds parking signal', () => {
    const kinds = implicatedKinds([{ key: 'no_outdoor', detail: 'no_parking' }]);
    assert(kinds.has('outdoor'), 'outdoor from parent no_outdoor');
    assert(kinds.has('parking'), 'parking added by no_parking sub-reason');
  });

  // ── outdoor / parking signals ───────────────────────────────────────────────
  test('learned-prefs: signalsForListing extracts outdoor and parking signals', () => {
    assert(signalsForListing(snap({ outdoor_space: true })).includes('outdoor:yes'), 'outdoor yes');
    assert(signalsForListing(snap({ outdoor_space: false })).includes('outdoor:no'), 'outdoor no');
    assert(signalsForListing(snap({ has_parking: true })).includes('parking:yes'), 'parking yes');
    assert(signalsForListing(snap({ has_parking: false })).includes('parking:no'), 'parking no');
    assert(!signalsForListing(snap()).some((s) => s.startsWith('outdoor:')), 'null outdoor_space → no signal');
    assert(!signalsForListing(snap()).some((s) => s.startsWith('parking:')), 'null has_parking → no signal');
  });

  test('learned-prefs: signalsForListing infers outdoor/parking from description (live↔snapshot symmetry)', () => {
    // A live listings row carries `description` but no outdoor_space/has_parking
    // column; it must score on the same signal its snapshot was trained on.
    const live = { property_type: 'Detached', beds: 3, outcode: 'SO24', price: 350_000,
      description: 'A lovely home with a large rear garden and a private driveway.' };
    const sigs = signalsForListing(live);
    assert(sigs.includes('outdoor:yes'), 'garden in description → outdoor:yes');
    assert(sigs.includes('parking:yes'), 'driveway in description → parking:yes');
    // A stored boolean still wins over the description (snapshot path).
    assert(signalsForListing({ ...live, outdoor_space: false }).includes('outdoor:no'),
      'stored boolean overrides description inference');
  });

  // ── pass weak-negative (once cold-start cleared) ────────────────────────────
  test('learned-prefs: passes on a liked signal dampen its positive weight', () => {
    // Mathematically: passes add passW to rejectedMass but only passW*discount to
    // rejectedW, so pRejected grows → discrimination shrinks for a liked signal.
    // 10 likes on SO24 clears cold start; 15 passes on SO24 create doubt.
    const likes  = many(10, 'like', { outcode: 'SO24' });
    const passes = many(15, 'pass', { outcode: 'SO24' });
    const { derived: withPasses }    = deriveWeights([...likes, ...passes], { now: NOW });
    const { derived: withoutPasses } = deriveWeights(likes,                  { now: NOW });
    const wWith    = withPasses['outcode:so24']?.weight    ?? 0;
    const wWithout = withoutPasses['outcode:so24']?.weight ?? 0;
    assert(wWithout > wWith, `passes reduce SO24 confidence: without=${wWithout}, with=${wWith}`);
    assert(wWith > 0, 'SO24 stays positive despite passes');
  });

  test('learned-prefs: passes alone never cross cold-start or create signal', () => {
    // 30 passes, 0 graded → cold start fires, acc is never populated, derived = {}
    const { derived, meta } = deriveWeights(many(30, 'pass'), { now: NOW });
    assertEqual(meta.coldStart, true, 'passes do not count toward cold start');
    assertEqual(Object.keys(derived).length, 0, 'no signal created by passes alone');
  });

  test('learned-prefs: passes on listing A never dilute an unrelated reject on B', () => {
    // The contamination guard: passes apply a LOCAL penalty only, so a real reject
    // of type:flat must score IDENTICALLY whether or not 200 unrelated detached
    // listings were passed. (A shared rejected denominator would have diluted it.)
    const likes   = many(10, 'like',   { property_type: 'Detached' });
    const rejects = withReasons(many(4, 'reject', { property_type: 'Flat' }), [{ key: 'wrong_house_type', detail: null, note: null }]);
    const passes  = many(200, 'pass',  { property_type: 'Detached' });
    const wWithout = deriveWeights([...likes, ...rejects],          { now: NOW }).derived['type:flat']?.weight ?? 0;
    const wWith    = deriveWeights([...likes, ...rejects, ...passes], { now: NOW }).derived['type:flat']?.weight ?? 0;
    assert(wWithout < -0.01, 'flat is genuinely rejected');
    assertEqual(wWith, wWithout, 'unrelated passes leave the flat rejection untouched');
  });

  // ── feature inference from description text (conservative, abstaining) ───────
  test('learned-prefs: inferOutdoorSpace detects gardens, abstains when unclear', () => {
    assertEqual(inferOutdoorSpace('Lovely home with a large rear garden'), true, 'garden → true');
    assertEqual(inferOutdoorSpace('Apartment with no garden'), false, 'no garden → false');
    assertEqual(inferOutdoorSpace('No garden but a lovely patio'), true, 'patio still counts as outdoor');
    assertEqual(inferOutdoorSpace('A bright two-bed flat near the station'), null, 'no mention → abstain');
    assertEqual(inferOutdoorSpace(null), null, 'no text → abstain');
  });

  test('learned-prefs: inferParking detects driveways/garages, abstains when unclear', () => {
    assertEqual(inferParking('Detached house with driveway and garage'), true, 'driveway → true');
    assertEqual(inferParking('Flat with no allocated parking'), false, 'no allocated parking → false');
    assertEqual(inferParking('Street parking only in this area'), false, 'street parking only → false');
    assertEqual(inferParking('No garage, but a generous driveway'), true, 'driveway overrides no garage');
    assertEqual(inferParking('Charming cottage with open views'), null, 'no mention → abstain');
  });

  // ── viewed / offered multiplier ─────────────────────────────────────────────
  test('learned-prefs: viewed listings earn a stronger positive weight than unviewed', () => {
    // Build two like sets with NON-COLLIDING listing IDs (both use 'like' reaction so
    // many() would produce identical ids like-0…like-5 for each batch).
    const ts = ago(1);
    const mkLike = (outcode, prefix) => Array.from({ length: 6 }, (_, i) => ({
      id: `${prefix}-${i}`, listing_id: `${prefix}-${i}`, reaction: 'like', created_at: ts,
      listing_snapshot: snap({ outcode, id: `${prefix}-${i}` }),
    }));
    const likesGU35 = mkLike('GU35', 'gu');
    const likesSO24 = mkLike('SO24', 'so');
    const rejects   = many(12, 'reject', { outcode: 'SP5' });
    const statusMap = {};
    for (const r of likesSO24) statusMap[r.listing_id] = 'viewed';
    const { derived } = deriveWeights([...likesGU35, ...likesSO24, ...rejects], { now: NOW, statusMap });
    const wGU35 = derived['outcode:gu35']?.weight ?? 0;
    const wSO24 = derived['outcode:so24']?.weight ?? 0;
    assert(wSO24 > wGU35, `viewed SO24 (${wSO24}) outweighs unviewed GU35 (${wGU35})`);
    assert(wSO24 > 0.05, 'viewed signal earns real weight');
  });

  // ── training progress (balance-aware) ───────────────────────────────────────
  // A reject must carry a reason to count as training signal (unattributed rejects are
  // excluded), so reject fixtures get a representative reason; likes / passes stay bare.
  const reacts = (n, reaction) => Array.from({ length: n }, () => (
    reaction === 'reject' ? { reaction, reasons: [{ key: 'wrong_area', detail: null, note: null }] } : { reaction }
  ));

  test('learned-prefs: trainingProgress flags cold start below COLD_START_MIN', () => {
    const p = trainingProgress(reacts(5, 'like'));
    assert(p.cold, 'cold');
    assertEqual(p.graded, 5);
    assertEqual(p.milestone, 'warming-up');
    assert(/Review 5 more/.test(p.nextAction), 'guidance counts the gap');
  });

  test('learned-prefs: trainingProgress penalises a one-sided feed (the real bottleneck)', () => {
    const p = trainingProgress([...reacts(4, 'like'), ...reacts(80, 'reject')]);
    assertEqual(p.graded, 84);
    assert(p.imbalanced, 'flagged imbalanced (<20% likes)');
    assert(p.likeShare < 0.1, 'tiny like share');
    assert(p.strengthPct < 20, `effective strength suppressed by imbalance (${p.strengthPct})`);
    assert(/like a few/.test(p.nextAction), 'headline guidance is add-more-likes');
  });

  test('learned-prefs: trainingProgress rewards a balanced, mature feed', () => {
    const p = trainingProgress([...reacts(80, 'like'), ...reacts(80, 'reject')]);
    assertEqual(p.milestone, 'mature');
    assert(Math.abs(p.balanceFactor - 1) < 1e-9, 'perfectly balanced → factor 1');
    assertEqual(p.strengthPct, 100, 'full effective strength');
    assert(!p.imbalanced, 'not imbalanced');
  });

  test('learned-prefs: trainingProgress ignores pass (unlabelled)', () => {
    const p = trainingProgress(reacts(50, 'pass'));
    assertEqual(p.graded, 0, 'passes are not graded');
    assertEqual(p.strengthPct, 0);
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
    const eff = { 'type:detached': 0.2, 'type:flat': -0.3, 'outcode:so24': 0.1 };
    const prefs = listingLearnedPrefs(snap(), eff);
    assertEqual(prefs['type:detached'], 0.2);
    assertEqual(prefs['outcode:so24'], 0.1);
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

  test('learned-prefs: deriveSearchSpec surfaces strong-negative area/outcode prune candidates', () => {
    const eff = {
      'area:hatherden-sp11': -LEARNED_PREF.MAX_LEARNED_WEIGHT,   // strong − → drop candidate
      'outcode:gu35': -LEARNED_PREF.MAX_LEARNED_WEIGHT,          // strong − → drop candidate
      'area:wherwell-sp11': LEARNED_PREF.MAX_LEARNED_WEIGHT,     // strong + → NOT a drop
      'area:weak-sp11': -0.02,                                   // weak → ignored
    };
    const spec = deriveSearchSpec(eff, {}, { now: NOW });
    assert(spec.dropAreas.includes('hatherden-sp11'), 'strong negative area is a prune candidate');
    assert(spec.dropOutcodes.includes('gu35'), 'strong negative outcode is a prune candidate');
    assert(!spec.dropAreas.includes('wherwell-sp11'), 'a liked area is never a prune candidate');
    assert(!spec.dropAreas.includes('weak-sp11'), 'weak negative ignored (asymmetric caution)');
  });
}
