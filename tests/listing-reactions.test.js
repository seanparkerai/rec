// tests/listing-reactions.test.js — v3 L3 reaction-log pure-logic tests.
// Verifies the reaction vocabulary / validation / normalise / latest-per-listing
// reduction with no network or DB.
import {
  REACTIONS,
  GRADED_REACTIONS,
  REJECT_REASONS,
  REJECT_SUBREASONS,
  LIKE_REASONS,
  LIKE_SUBREASONS,
  PERSONAL_STATUSES,
  isReaction,
  isPersonalStatus,
  isRejectReasonKey,
  isReasonKey,
  isSubReasonKey,
  subReasonsFor,
  validateReaction,
  normaliseReaction,
  normaliseReasons,
  primaryReasonKey,
  latestPerListing,
} from '../assets/js/listing-reactions.js';

export async function register({ test, assert, assertEqual }) {
  test('reactions: vocabulary is locked (like/pass/reject)', () => {
    assertEqual(REACTIONS.join(','), 'like,pass,reject');
    // Only like + reject are graded training signals; pass is a soft skip.
    assertEqual(GRADED_REACTIONS.join(','), 'like,reject');
    assert(!GRADED_REACTIONS.includes('pass'), 'pass must not be a graded signal');
  });

  test('reactions: personal-status lifecycle is distinct from reactions', () => {
    assertEqual(PERSONAL_STATUSES.join(','), 'new,saved,viewed,offered,rejected');
    assert(isPersonalStatus('offered'), 'offered is a status');
    assert(!isPersonalStatus('like'), 'a reaction is not a status');
    assert(!isReaction('offered'), 'a status is not a reaction');
  });

  test('reactions: reject reason chips are well-formed', () => {
    assert(REJECT_REASONS.length >= 3, 'need a useful set of reject reasons');
    for (const r of REJECT_REASONS) {
      assert(typeof r.key === 'string' && r.key, 'chip needs a key');
      assert(typeof r.label === 'string' && r.label, 'chip needs a label');
    }
    assert(isRejectReasonKey('too_expensive'), 'known chip key');
    assert(!isRejectReasonKey('other'), 'other removed from vocabulary');
    assert(!isRejectReasonKey('nope'), 'unknown chip key rejected');
  });

  test('reactions: validateReaction accepts a valid reject with reason', () => {
    assert(validateReaction({ listing_id: '123', reaction: 'reject', reason: 'too_expensive' }));
    assert(validateReaction({ listing_id: '123', reaction: 'like' }));
  });

  test('reactions: validateReaction rejects bad input', () => {
    let threw = false;
    try { validateReaction({ listing_id: '123', reaction: 'love' }); } catch { threw = true; }
    assert(threw, 'unknown reaction must throw');

    threw = false;
    try { validateReaction({ reaction: 'like' }); } catch { threw = true; }
    assert(threw, 'missing listing_id must throw');

    threw = false;
    try { validateReaction({ listing_id: '1', reaction: 'reject', reason: '   ' }); } catch { threw = true; }
    assert(threw, 'blank reason must throw');
  });

  test('reactions: normaliseReaction drops reason for non-reject', () => {
    const liked = normaliseReaction({ listing_id: '1', reaction: 'like', reason: 'too_expensive' });
    assertEqual(liked.reason, null, 'reason only applies to reject');
    const rejected = normaliseReaction({ listing_id: '1', reaction: 'reject', reason: 'too_small' });
    assertEqual(rejected.reason, 'too_small');
    assert(normaliseReaction({ listing_id: '1', reaction: 'nope' }) === null, 'invalid reaction normalises to null');
  });

  // ── multi-reason vocabulary + sub-reasons ───────────────────────────────────
  test('reactions: every primary reason has a (possibly empty) sub-reason list', () => {
    for (const r of REJECT_REASONS) {
      assert(Array.isArray(REJECT_SUBREASONS[r.key]), `reject ${r.key} has a sub-reason array`);
    }
    assert(LIKE_REASONS.length >= 4, 'positive-reason vocabulary exists');
    assert(isReasonKey('too_small'), 'reject key recognised');
    assert(isReasonKey('great_area'), 'like key recognised');
    assert(!isReasonKey('nope'), 'unknown key rejected');
  });

  test('reactions: sub-reasons validate against their own parent only', () => {
    assert(isSubReasonKey('too_small', 'beds'), 'beds is a too_small sub-reason');
    assert(!isSubReasonKey('too_small', 'commute'), 'commute belongs to wrong_area, not too_small');
    assert(isSubReasonKey('wrong_area', 'commute'), 'commute is a wrong_area sub-reason');
    // like sub-reasons exist where defined
    assert(isSubReasonKey('right_size', 'beds'), 'like right_size has a beds sub-reason');
    assert(Array.isArray(LIKE_SUBREASONS.great_area), 'great_area sub-reasons present');
  });

  test('reactions: like vocabulary covers feature-level positives + sub-reasons', () => {
    // The positive-feedback overhaul adds feature-level like chips so the user can
    // call out the specific elements they love.
    for (const k of ['kitchen', 'light', 'parking']) {
      assert(isReasonKey(k), `${k} is a recognised like reason`);
      assert(subReasonsFor(k).length > 0, `${k} has feature sub-reasons`);
    }
    assert(isSubReasonKey('kitchen', 'island'), 'island is a kitchen sub-reason');
    assert(!isSubReasonKey('kitchen', 'garden'), 'garden belongs to outdoor_space, not kitchen');
    const r = normaliseReaction({
      listing_id: '1', reaction: 'like',
      reasons: [{ key: 'kitchen', detail: 'island' }, { key: 'light', detail: 'south_facing' }],
    });
    assertEqual(r.reasons.length, 2, 'feature positives captured');
    assert(r.reasons.some((x) => x.key === 'kitchen' && x.detail === 'island'), 'kitchen sub-reason kept');
  });

  // ── normaliseReasons ────────────────────────────────────────────────────────
  test('reactions: normaliseReasons cleans, validates, and de-dups', () => {
    const out = normaliseReasons([
      'too_small',                                   // bare key string
      { key: 'too_small', detail: 'beds' },          // valid sub-reason
      { key: 'too_small', detail: 'beds' },          // exact dup → dropped
      { key: 'wrong_area', detail: 'beds' },          // sub belongs to too_small → detail nulled
      { key: 'made_up' },                             // unknown key → dropped
      { key: 'busy_road', note: '  loud  ' },         // note trimmed
    ]);
    // 'too_small' (no detail), 'too_small::beds', 'wrong_area' (detail nulled), 'busy_road'
    assertEqual(out.length, 4, 'kept 4 distinct, dropped dup + unknown');
    assert(out.some((r) => r.key === 'too_small' && r.detail === 'beds'), 'sub-reason kept');
    assert(out.some((r) => r.key === 'wrong_area' && r.detail === null), 'mismatched sub-reason nulled');
    assert(out.some((r) => r.key === 'busy_road' && r.note === 'loud'), 'note trimmed');
    assertEqual(normaliseReasons(null).length, 0, 'non-array tolerated');
    assertEqual(normaliseReasons('nope').length, 0, 'string tolerated');
  });

  test('reactions: primaryReasonKey returns the first key or null', () => {
    assertEqual(primaryReasonKey([{ key: 'wrong_area' }, { key: 'too_small' }]), 'wrong_area');
    assertEqual(primaryReasonKey([]), null);
    assertEqual(primaryReasonKey(null), null);
  });

  // ── multi-reason on normaliseReaction ───────────────────────────────────────
  test('reactions: a reject carries a multi-reason array + a primary scalar', () => {
    const r = normaliseReaction({
      listing_id: '1', reaction: 'reject',
      reasons: [{ key: 'wrong_area', detail: 'commute' }, { key: 'too_small' }],
    });
    assertEqual(r.reason, 'wrong_area', 'scalar = primary (first) reason key');
    assertEqual(r.reasons.length, 2, 'both reasons kept');
    assertEqual(r.reasons[0].detail, 'commute', 'sub-reason preserved');
  });

  test('reactions: a like may carry POSITIVE reasons (scalar reason stays null)', () => {
    const r = normaliseReaction({
      listing_id: '1', reaction: 'like',
      reasons: [{ key: 'great_area', detail: 'quiet' }, { key: 'good_value' }],
    });
    assertEqual(r.reason, null, 'scalar reason is reject-only');
    assertEqual(r.reasons.length, 2, 'positive reasons captured on the array');
    assert(r.reasons.some((x) => x.key === 'great_area' && x.detail === 'quiet'), 'positive sub-reason kept');
  });

  test('reactions: a legacy reject with only a scalar reason synthesises reasons[]', () => {
    const r = normaliseReaction({ listing_id: '1', reaction: 'reject', reason: 'too_small' });
    assertEqual(r.reason, 'too_small');
    assertEqual(r.reasons.length, 1, 'one-element array synthesised for back-compat');
    assertEqual(r.reasons[0].key, 'too_small');
  });

  test('reactions: a pass never carries reasons', () => {
    const r = normaliseReaction({ listing_id: '1', reaction: 'pass', reasons: [{ key: 'too_small' }] });
    assertEqual(r.reason, null);
    assertEqual(r.reasons.length, 0, 'pass is unlabelled — no reasons');
  });

  test('reactions: validateReaction validates a reasons array', () => {
    assert(validateReaction({ listing_id: '1', reaction: 'reject', reasons: [{ key: 'too_small' }] }));
    let threw = false;
    try { validateReaction({ listing_id: '1', reaction: 'reject', reasons: [{ key: 'bogus' }] }); } catch { threw = true; }
    assert(threw, 'unknown reason key in array must throw');
    threw = false;
    try { validateReaction({ listing_id: '1', reaction: 'reject', reasons: 'not-an-array' }); } catch { threw = true; }
    assert(threw, 'non-array reasons must throw');
  });

  test('reactions: normaliseReaction carries the listing snapshot', () => {
    const snap = { rightmove_id: '1', price: 395000 };
    const r = normaliseReaction({ listing_id: '1', reaction: 'like', listing_snapshot: snap });
    assertEqual(r.listing_snapshot.price, 395000);
  });

  test('reactions: latestPerListing keeps the most-recent reaction per listing', () => {
    const rows = [
      { listing_id: 'A', reaction: 'like',   created_at: '2026-05-01T10:00:00Z' },
      { listing_id: 'A', reaction: 'reject', created_at: '2026-05-02T10:00:00Z' }, // newer wins
      { listing_id: 'B', reaction: 'pass',   created_at: '2026-05-01T10:00:00Z' },
    ];
    const latest = latestPerListing(rows);
    assertEqual(latest.get('A').reaction, 'reject');
    assertEqual(latest.get('B').reaction, 'pass');
    assertEqual(latest.size, 2);
  });

  test('reactions: latestPerListing tolerates empty / malformed input', () => {
    assertEqual(latestPerListing(null).size, 0);
    assertEqual(latestPerListing([{ reaction: 'like' }]).size, 0); // no listing_id → skipped
  });
}
