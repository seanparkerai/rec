// tests/unit/weights-signals-hardening.test.js — mutation-hardening anchors for the
// learned-preferences layer (step 4.10b). Kills the 2026-07-03 survivors in weights.js
// (recency/cold-start/milestone boundaries, derive-weight edges, effective-weight
// guards) and signals.js. The signal tables (price bands, reason→kind attribution,
// label vocab) are SEMANTICS, not copy — mutating an entry changes which features get
// credited/discounted — so they are pinned verbatim: a diff here is a deliberate model
// change made in its own commit, never silenced.
import {
  isRecent, gradedCount, isColdStart, trainingProgress, deriveWeights,
  effectiveWeights, listingLearnedPrefs, REASON_COUNTS_KEY,
} from '../../assets/js/learned-preferences/weights.js';
import {
  priceBand, bedBucket, signalsForListing, inferOutdoorSpace, inferParking,
  describeSignal, implicatedKinds, REASON_SIGNAL_KINDS, SUBREASON_SIGNAL_KINDS,
} from '../../assets/js/learned-preferences/signals.js';
import { shortLabel, topDrivers, reasonCounts, coverage } from '../../assets/js/refinement/trends-glance.js';
import { LEARNED_PREF, TRAINING_MILESTONES, RECENCY_DAYS } from '../../assets/js/intelligence-constants.js';

export async function register({ test, assert, assertEqual }) {
  const DAY = 86_400_000;
  const NOW = new Date('2026-07-03T00:00:00Z');
  const deepEq = (a, b, msg) => assertEqual(JSON.stringify(a), JSON.stringify(b), msg);

  // ── isRecent boundaries ──────────────────────────────────────────────────────
  test('hardening: isRecent — inclusive at the window edge, ~1d future skew, honest failures', () => {
    const at = (days) => ({ added_date: new Date(NOW.getTime() - days * DAY).toISOString() });
    assertEqual(isRecent(at(RECENCY_DAYS), NOW), true, 'exactly RECENCY_DAYS old is recent');
    assertEqual(isRecent(at(RECENCY_DAYS + 0.001), NOW), false, 'just past the window is not');
    assertEqual(isRecent(at(-1), NOW), true, 'exactly one day future (clock skew) allowed');
    assertEqual(isRecent(at(-1.001), NOW), false, 'beyond the skew allowance is not');
    assertEqual(isRecent({}, NOW), false, 'undated never recent');
    assertEqual(isRecent({ added_date: 'not-a-date' }, NOW), false, 'unparsable never recent');
  });

  // ── cold start + milestones ──────────────────────────────────────────────────
  const graded = (likes, rejects, reasons = [{ key: 'great_area' }]) => [
    ...Array.from({ length: likes }, (_, i) => ({
      id: `l${i}`, listing_id: `l${i}`, reaction: 'like', reasons,
      created_at: NOW.toISOString(), listing_snapshot: { property_type: 'flat' },
    })),
    ...Array.from({ length: rejects }, (_, i) => ({
      id: `r${i}`, listing_id: `r${i}`, reaction: 'reject', reasons: [{ key: 'too_small' }],
      created_at: NOW.toISOString(), listing_snapshot: { property_type: 'house' },
    })),
  ];

  test('hardening: isColdStart is exclusive at the minimum (== COLD_START_MIN is warm)', () => {
    assertEqual(isColdStart(graded(LEARNED_PREF.COLD_START_MIN, 0)), false, '== min is warm');
    assertEqual(isColdStart(graded(LEARNED_PREF.COLD_START_MIN - 1, 0)), true, 'one under is cold');
    assertEqual(gradedCount(graded(3, 2)), 5, 'graded counts likes + attributed rejects');
  });

  test('hardening: trainingProgress milestone boundaries are inclusive, strength math exact', () => {
    const M = TRAINING_MILESTONES;
    const p = (l, r) => trainingProgress(graded(l, r));
    assertEqual(p(M.usable / 2, M.usable / 2).milestone, 'usable', '== usable');
    assertEqual(p(M.usable / 2, M.usable / 2 - 1).milestone, 'learning', 'one under usable');
    assertEqual(p(M.solid / 2, M.solid / 2).milestone, 'solid', '== solid');
    assertEqual(p(M.mature / 2, M.mature / 2).milestone, 'mature', '== mature');
    // Balanced 50/50 at mature: balanceFactor exactly 1, volume capped at 1 → strength 100.
    const full = p(M.mature, M.mature);
    assertEqual(full.balanceFactor, 1, '50/50 → balance 1');
    assertEqual(full.volumePct, 1, 'volume capped at 1 past mature');
    assertEqual(full.strengthPct, 100, 'strength = volume × balance × 100');
    assertEqual(p(0, 0).balanceFactor, 0, 'no reactions → balance 0');
  });

  test('hardening: imbalance trigger is strict (< 0.2) and each nextAction names its step', () => {
    const M = TRAINING_MILESTONES;
    // likeShare exactly 0.2 (1 like : 4 rejects × scale) is NOT imbalanced.
    const atShare = trainingProgress(graded(4, 16));
    assertEqual(atShare.imbalanced, false, 'likeShare == 0.2 not imbalanced');
    assertEqual(atShare.nextAction, `Review ${M.usable - 20} more for a meaningful re-rank.`,
      'sub-usable copy quotes the remaining count');
    const cold = trainingProgress(graded(2, 2));
    assertEqual(cold.nextAction, `Review ${LEARNED_PREF.COLD_START_MIN - 4} more to start tuning your feed.`,
      'cold-start copy quotes the remaining count');
    const imb = trainingProgress(graded(2, 28));
    assertEqual(imb.imbalanced, true, 'likeShare 1/15 imbalanced');
    assert(imb.nextAction.includes('now like a few'), 'imbalance copy asks for likes');
    // "Solid start" shows for usable ≤ graded < solid (at == solid the mature copy takes over).
    const solid = trainingProgress(graded(M.usable / 2 + 5, M.usable / 2 + 5));
    assertEqual(solid.nextAction, 'Solid start — keep reacting to sharpen the ranking.', 'solid copy');
    const mature = trainingProgress(graded(M.mature / 2, M.mature / 2));
    assertEqual(mature.nextAction, 'Your feed is tuned — run a fresh fetch to pull more homes like your likes.', 'mature copy');
  });

  // ── deriveWeights edges ──────────────────────────────────────────────────────
  test('hardening: deriveWeights — MIN_SIGNAL_N inclusive, per-signal counts, decay in mass', () => {
    // 6 likes flat + 6 rejects house (attributed elsewhere) — signals clear minN.
    const rows = graded(6, 6);
    const { derived, meta } = deriveWeights(rows, { now: NOW, coldStartMin: 1 });
    assertEqual(derived['type:flat'].n_liked, 6, 'n_liked counted per signal');
    assertEqual(derived['type:house'].n_rejected, 6, 'n_rejected counted per signal');
    assertEqual(meta.likedMass, 6, 'fresh likes carry weight 1 each');
    // A signal on exactly MIN_SIGNAL_N reactions is kept; below is dropped.
    const two = deriveWeights(graded(LEARNED_PREF.MIN_SIGNAL_N, 4), { now: NOW, coldStartMin: 1 });
    assert('type:flat' in two.derived, 'n == MIN_SIGNAL_N kept');
    const one = deriveWeights(graded(1, 5), { now: NOW, coldStartMin: 1 });
    assert(!('type:flat' in one.derived), 'n below MIN_SIGNAL_N dropped');
    // Half-life-old reactions weigh exactly 0.5 in the mass.
    const old = graded(4, 4).map((r) => ({
      ...r, created_at: new Date(NOW.getTime() - LEARNED_PREF.HALF_LIFE_DAYS * DAY).toISOString(),
    }));
    assertEqual(deriveWeights(old, { now: NOW, coldStartMin: 1 }).meta.likedMass, 2, '4 likes × 0.5');
  });

  test('hardening: pass penalty — local, subtractive, capped at exactly 0.5', () => {
    // 2 UNATTRIBUTED likes (no reasons → full weight on every signal) + 2 attributed
    // rejects on a disjoint signal, then a flood of passes on the liked signal.
    const rows = graded(2, 2).map((r) => (r.reaction === 'like' ? { ...r, reasons: [] } : r));
    const passes = Array.from({ length: 40 }, (_, i) => ({
      id: `p${i}`, listing_id: `p${i}`, reaction: 'pass',
      created_at: NOW.toISOString(), listing_snapshot: { property_type: 'flat' },
    }));
    const base = deriveWeights(rows, { now: NOW, coldStartMin: 1 }).derived['type:flat'];
    const hit = deriveWeights([...rows, ...passes], { now: NOW, coldStartMin: 1 }).derived['type:flat'];
    assertEqual(hit.n_pass, 40, 'passes counted on the signal');
    // discrimination = pLiked − pRejected − min(passMass/gradedMass, 0.5) = 1 − 0 − 0.5 (capped).
    assertEqual(hit.discrimination, 0.5, 'penalty capped at 0.5 exactly');
    assertEqual(base.discrimination, 1, 'sanity: undamped discrimination is 1');
    // A pass on a signal with no graded evidence creates nothing.
    const orphan = deriveWeights([...rows, { ...passes[0], listing_snapshot: { property_type: 'bungalow' } }],
      { now: NOW, coldStartMin: 1 });
    assert(!('type:bungalow' in orphan.derived), 'passes never create a signal');
  });

  test('hardening: reaction id fallback + viewed multiplier are applied', () => {
    const noId = graded(2, 2).map(({ id, ...r }) => r);
    const d = deriveWeights(noId, { now: NOW, coldStartMin: 1 }).derived['type:flat'];
    deepEq(d.reaction_ids.slice().sort(),
      [`l0@${NOW.toISOString()}`, `l1@${NOW.toISOString()}`],
      'id falls back to listing_id@created_at');
    const boosted = deriveWeights(graded(2, 2), {
      now: NOW, coldStartMin: 1, statusMap: { l0: 'viewed' },
    }).meta;
    assertEqual(boosted.likedMass, 1 + LEARNED_PREF.VIEWED_MULTIPLIER, 'viewed like earns the multiplier');
  });

  test('hardening: effectiveWeights guards — null entries, non-finite, zero-weight listing prefs', () => {
    const eff = effectiveWeights(
      { 'type:flat': { weight: 0.2 }, broken: null, nan: { weight: 'x' }, [REASON_COUNTS_KEY]: { reject: [] } },
      { 'type:flat': { weight: -0.1 } },
    );
    deepEq(eff, { 'type:flat': -0.1 }, 'override wins; null/NaN/reserved keys inert');
    const lp = listingLearnedPrefs({ property_type: 'flat', outcode: 'SP2' },
      { 'type:flat': 0, 'outcode:sp2': 0.3, 'beds:2': 0.5 });
    deepEq(lp, { 'outcode:sp2': 0.3 }, 'zero weights and absent signals excluded');
  });

  // ── signals.js: band edges, buckets, signal emission ─────────────────────────
  test('hardening: priceBand — every band edge exact (upper bounds exclusive)', () => {
    const grid = [
      [249_999, '<250k'], [250_000, '250-300k'], [299_999, '250-300k'], [300_000, '300-350k'],
      [350_000, '350-400k'], [400_000, '400-450k'], [450_000, '450-500k'], [500_000, '500-600k'],
      [599_999, '500-600k'], [600_000, '600-800k'], [799_999, '600-800k'], [800_000, '800k+'],
    ];
    for (const [price, band] of grid) assertEqual(priceBand(price), band, `£${price}`);
    assertEqual(priceBand(0), null, 'zero → null');
    assertEqual(priceBand('380000'), '350-400k', 'string coerced');
  });

  test('hardening: bed/bath buckets and the full signal set for a rich listing', () => {
    assertEqual(bedBucket(5), '5+', '5 collapses');
    assertEqual(bedBucket(4), '4', '4 stays');
    assertEqual(bedBucket(''), null, 'empty null');
    deepEq(signalsForListing({
      property_type: ' Detached ', beds: 3, baths: 3, outcode: 'SP2', area_id: 'Wilton-SP2',
      price: 425_000, outdoor_space: true, has_parking: false,
    }), ['type:detached', 'beds:3', 'baths:3+', 'outcode:sp2', 'area:wilton-sp2',
      'price-band:400-450k', 'outdoor:yes', 'parking:no'],
    'exact signal vector: trims, lowers, buckets, stored booleans win');
    deepEq(signalsForListing(null), [], 'null listing → no signals');
  });

  test('hardening: outdoor inference — every positive keyword, negations, abstention', () => {
    for (const word of ['garden', 'patio', 'terrace', 'balcony', 'courtyard',
      'outdoor space', 'outside space', 'decking']) {
      assertEqual(inferOutdoorSpace(`Benefits from a lovely ${word}.`), true, `+${word}`);
    }
    assertEqual(inferOutdoorSpace('There is no garden.'), false, 'plain negation');
    assertEqual(inferOutdoorSpace('No private garden here.'), false, 'qualified negation');
    assertEqual(inferOutdoorSpace('Offered without a garden.'), false, 'without-a form');
    assertEqual(inferOutdoorSpace('No garden, but a large balcony.'), true, 'positive survives negation strip');
    assertEqual(inferOutdoorSpace('A charming period home.'), null, 'no mention → abstain');
    assertEqual(inferOutdoorSpace(''), null, 'empty → abstain');
  });

  test('hardening: parking inference — every positive keyword, negations, abstention', () => {
    // NOTE: the positive regex requires "off-street"/"offstreet" (hyphen optional, no
    // space form) — the spaced "off street parking" abstains today; that is the pinned
    // behaviour, not an oversight to fix silently.
    for (const word of ['driveway', 'garage', 'off-street parking', 'offstreet parking',
      'allocated parking', 'private parking', 'parking space', 'car port', "residents' parking"]) {
      assertEqual(inferParking(`Includes ${word}.`), true, `+${word}`);
    }
    for (const neg of ['There is no allocated parking.', 'No off-street parking.', 'no parking',
      'No garage.', 'No driveway.', 'Street parking only.', 'Permit parking only.', 'permit only']) {
      assertEqual(inferParking(neg), false, `-${neg}`);
    }
    assertEqual(inferParking('No garage, but a driveway.'), true, 'positive survives negation strip');
    assertEqual(inferParking('A charming period home.'), null, 'no mention → abstain');
  });

  // ── attribution tables pinned verbatim (semantics, not copy) ─────────────────
  test('hardening: REASON_SIGNAL_KINDS pinned — reason → implicated signal kinds', () => {
    deepEq(REASON_SIGNAL_KINDS, {
      too_small: ['beds'],
      wrong_area: ['outcode', 'area'],
      too_expensive: ['price-band'],
      busy_road: ['outcode', 'area'],
      poor_layout: ['baths'],
      needs_work: ['type'],
      no_outdoor: ['outdoor'],
      wrong_house_type: ['type'],
      removed_area: [],
      great_area: ['outcode', 'area'],
      good_value: ['price-band'],
      right_size: ['beds'],
      good_layout: ['baths'],
      kitchen: [],
      light: [],
      parking: ['parking'],
      move_in_ready: ['type'],
      outdoor_space: ['outdoor'],
      character: ['type'],
    }, 'primary attribution table (deliberate change = new commit + this pin regenerated)');
  });

  test('hardening: SUBREASON_SIGNAL_KINDS pinned + implicatedKinds composition', () => {
    // Spot-pin the semantically loaded rows (the full table is exercised through these).
    deepEq(SUBREASON_SIGNAL_KINDS.too_expensive,
      { over_budget: ['price-band'], poor_value: ['price-band', 'type'] }, 'poor_value adds type');
    deepEq(SUBREASON_SIGNAL_KINDS.too_small,
      { beds: ['beds'], reception: [], plot: ['outdoor'], storage: [] }, 'small plot → outdoor');
    deepEq(SUBREASON_SIGNAL_KINDS.no_outdoor,
      { no_garden: ['outdoor'], no_parking: ['parking'] }, 'no_parking detail crosses to parking');
    deepEq(SUBREASON_SIGNAL_KINDS.busy_road.parking, [], 'road parking ≠ property parking');
    assertEqual(implicatedKinds([]), null, 'no reasons → null (undiscounted everywhere)');
    assertEqual(implicatedKinds(undefined), null, 'missing reasons → null');
    deepEq([...implicatedKinds([{ key: 'kitchen' }])], [], 'uncaptured reason → empty set');
    deepEq([...implicatedKinds([{ key: 'too_expensive', detail: 'poor_value' }])].sort(),
      ['price-band', 'type'], 'detail unions onto the parent');
    deepEq([...implicatedKinds([{ key: 'too_small' }, { key: 'wrong_area' }])].sort(),
      ['area', 'beds', 'outcode'], 'multiple reasons union');
  });

  test('hardening: describeSignal + shortLabel vocab pinned per kind', () => {
    assertEqual(describeSignal('type:flat'), 'property type "flat"');
    assertEqual(describeSignal('beds:3'), '3-bed homes');
    assertEqual(describeSignal('baths:2'), '2-bath homes');
    assertEqual(describeSignal('outcode:sp2'), 'the SP2 area');
    assertEqual(describeSignal('area:wilton-sp2'), 'the wilton-sp2 area');
    assertEqual(describeSignal('price-band:350-400k'), 'the 350-400k price band');
    assertEqual(describeSignal('outdoor:yes'), 'homes with outdoor space');
    assertEqual(describeSignal('parking:no'), 'homes without parking');
    assertEqual(describeSignal('mystery:x'), 'mystery:x', 'unknown passes through');
    assertEqual(shortLabel('type:mid-terrace'), 'Mid Terrace');
    assertEqual(shortLabel('beds:1'), '1 bed');
    assertEqual(shortLabel('beds:3'), '3 beds');
    assertEqual(shortLabel('baths:1'), '1 bath');
    assertEqual(shortLabel('outcode:sp2'), 'SP2');
    assertEqual(shortLabel('area:great-wishford'), 'Great Wishford');
    assertEqual(shortLabel('price-band:350-400k'), '£350-400k');
    assertEqual(shortLabel('outdoor:yes'), 'Has outdoor');
    assertEqual(shortLabel('outdoor:no'), 'No outdoor');
    assertEqual(shortLabel('parking:yes'), 'Has parking');
    assertEqual(shortLabel('mystery:x'), 'mystery:x', 'unknown passes through');
  });

  // ── trends-glance pure half (the render half is excised from mutation scope) ──
  test('hardening: topDrivers — zero weights dropped, abs-sorted, sliced, labelled', () => {
    const derived = {
      'type:flat': { weight: -0.3, n_liked: 0, n_rejected: 9 },
      'beds:3': { weight: 0.1, n_liked: 4 },
      'outcode:sp2': { weight: 0 },
      [REASON_COUNTS_KEY]: { reject: [] },
      'parking:yes': { weight: 0.2 },
    };
    const rows = topDrivers(derived, 2);
    deepEq(rows.map((r) => r.signal), ['type:flat', 'parking:yes'], 'abs desc, zero dropped, top-2');
    assertEqual(rows[0].label, 'Flat', 'labels via shortLabel');
    assertEqual(rows[0].n_rejected, 9, 'counts carried');
  });

  test('hardening: reasonCounts — string/object items, unknown keys skipped, ranked, sliced', () => {
    const log = [
      { reaction: 'reject', reasons: ['too_small', { key: 'too_small' }, { key: 'nonsense' }] },
      { reaction: 'reject', reasons: [{ key: 'too_expensive' }] },
      { reaction: 'like', reasons: [{ key: 'great_area' }] },
      { reaction: 'like', reasons: null },
    ];
    const { reject, like } = reasonCounts(log, 1);
    deepEq(reject, [{ key: 'too_small', label: 'Too small', count: 2 }], 'ranked + sliced + labelled');
    assertEqual(like[0].key, 'great_area', 'like lane separate');
  });

  test('hardening: coverage — liked iff a type: signal has n_liked > 0, case-folded', () => {
    const rows = coverage(
      { propertyTypes: ['Detached', 'Flat'] },
      { 'type:detached': { n_liked: 2 }, 'type:flat': { n_liked: 0 } },
    );
    deepEq(rows, [{ type: 'Detached', liked: true }, { type: 'Flat', liked: false }],
      'n_liked 0 is never-picked');
  });
}
