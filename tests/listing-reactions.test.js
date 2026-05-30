// tests/listing-reactions.test.js — v3 L3 reaction-log pure-logic tests.
// Verifies the reaction vocabulary / validation / normalise / latest-per-listing
// reduction with no network or DB.
import {
  REACTIONS,
  GRADED_REACTIONS,
  REJECT_REASONS,
  PERSONAL_STATUSES,
  isReaction,
  isPersonalStatus,
  isRejectReasonKey,
  validateReaction,
  normaliseReaction,
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

  test('reactions: reject reason chips are well-formed and include other', () => {
    assert(REJECT_REASONS.length >= 3, 'need a useful set of reject reasons');
    for (const r of REJECT_REASONS) {
      assert(typeof r.key === 'string' && r.key, 'chip needs a key');
      assert(typeof r.label === 'string' && r.label, 'chip needs a label');
    }
    assert(isRejectReasonKey('too_expensive'), 'known chip key');
    assert(isRejectReasonKey('other'), 'other is a valid chip key');
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
