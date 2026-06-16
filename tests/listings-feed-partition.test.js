// tests/listings-feed-partition.test.js — the pure Browse-feed partition pipeline
// (assets/js/listings/feed-partition.js, P11c — extracted verbatim from the
// page-listings paint()). Pins the suppression/visibility invariants and the
// summary-count arithmetic: partitionFeed suppresses exactly what its injected
// isDecided reports (deciding now lives upstream — DECIDING covers like/pass/reject,
// and the page pre-filters the decided pile before calling in), decided rows hide
// unless "Show hidden", junk vs refinement never double-counts, unknown verbs fold
// into the Passed group, and no count can go negative.
import { partitionFeed } from '../assets/js/listings/feed-partition.js';

export async function register({ test, assert, assertEqual }) {
  // Distinct addresses → distinct fingerprints (dedupeByFingerprint is exercised
  // explicitly in the duplicate test below).
  const L = (id, over = {}) => ({
    rightmove_id: id, address: `${id} Test Lane, Fordingbridge`, beds: 3,
    property_type: 'Detached', price: 300000, first_seen: '2026-06-01', ...over,
  });

  // Baseline deps: nothing hidden, neutral scores, identity controls.
  const deps = (over = {}) => ({
    scoreOf: () => ({ score: 1, verdict: 'possible', gated: false }),
    ...over,
  });

  test('feed-partition: suppression follows the injected isDecided (stubbed false here)', () => {
    const listings = [L('1'), L('2')];
    const out = partitionFeed(listings, deps({
      isDecided: () => false, // deciding lives upstream (suppress.js DECIDING); stubbed here
      isReviewed: (id) => String(id) === '1',
      reactionOf: (id) => (String(id) === '1' ? { reaction: 'pass' } : null),
    }));
    assertEqual(out.visible.length, 2);
    assertEqual(out.counts.decidedCount, 0, 'nothing is decided when isDecided is false');
    assertEqual(out.byVerb.pass.length, 1, 'the reviewed row groups under its verb');
    assertEqual(out.unreviewed.length, 1);
  });

  test('feed-partition: decided (like/pass/reject) rows are ALWAYS suppressed, even with "Show hidden"', () => {
    const listings = [L('1'), L('2'), L('3')];
    const isDecided = (l) => l.rightmove_id !== '3';
    const hidden = partitionFeed(listings, deps({ isDecided }));
    assertEqual(hidden.visible.length, 1, 'only the undecided row renders');
    assertEqual(hidden.counts.decidedCount, 2);
    // Unlike junk / out-of-reach / refinement, "Show hidden" does NOT bring decided
    // rows back — they are permanently rehomed to the Saved / Rejected pages.
    const shown = partitionFeed(listings, deps({ isDecided, includeHidden: true }));
    assertEqual(shown.visible.length, 1, '"Show hidden" still hides decided rows');
    assertEqual(shown.counts.decidedCount, 2);
  });

  test('feed-partition: junk + refinement-hidden counts once (as junk); gate counted first', () => {
    const listings = [L('1'), L('2'), L('3'), L('4')];
    const out = partitionFeed(listings, deps({
      scoreOf: (l) => ({ score: 1, verdict: 'possible', gated: l.rightmove_id === '1' }),
      isJunk: (l) => l.rightmove_id === '2',
      isRefHidden: (l) => l.rightmove_id === '2' || l.rightmove_id === '3', // 2 is BOTH
    }));
    assertEqual(out.counts.gatedCount, 1);
    assertEqual(out.counts.hiddenJunkCount, 1);
    assertEqual(out.counts.hiddenRefCount, 1, 'the both-junk-and-refinement row counts only as junk');
    assertEqual(out.visible.length, 1);
  });

  test('feed-partition: same-fingerprint duplicates collapse to one and are counted', () => {
    const twin = { address: 'Burgate, FORDINGBRIDGE', beds: 2, property_type: 'Semi-Detached' };
    const listings = [L('1', twin), L('2', { ...twin, first_seen: '2026-06-03' }), L('3')];
    const out = partitionFeed(listings, deps({}));
    assertEqual(out.counts.dupCount, 1, 'the pair merged');
    assertEqual(out.visible.length, 2);
    assert(out.visible.some((r) => r.listing.rightmove_id === '2'), 'the newer twin is the representative');
  });

  test('feed-partition: reviewed split honours isReviewed; an unknown verb folds into Passed', () => {
    const listings = [L('1'), L('2'), L('3')];
    const out = partitionFeed(listings, deps({
      isReviewed: (id) => String(id) !== '3',
      reactionOf: (id) => (String(id) === '1' ? { reaction: 'like' } : null), // 2 reviewed, no stored verb
      includeHidden: true, // keep the liked row visible so the split is observable
    }));
    assertEqual(out.unreviewed.length, 1);
    assertEqual(out.byVerb.like.length, 1);
    assertEqual(out.byVerb.pass.length, 1, 'reviewed row with no verb reads as passed');
    assertEqual(out.byVerb.reject.length, 0);
  });

  test('feed-partition: radius + controls filtering feed the hiddenByFilter remainder; counts never negative', () => {
    const listings = [L('1'), L('2'), L('3'), L('4')];
    const out = partitionFeed(listings, deps({
      passesRadius: (l) => l.rightmove_id !== '4',
      applyControls: (ls) => ls.filter((l) => l.rightmove_id !== '3'), // a search/filter hide
    }));
    assertEqual(out.counts.hiddenByRadiusCount, 1);
    assertEqual(out.counts.hiddenByFilter, 1, 'the controls-hidden row is the remainder');
    assertEqual(out.visible.length, 2);
    for (const [k, v] of Object.entries(out.counts)) assert(v >= 0, `${k} is never negative`);
  });

  test('feed-partition: visible rows preserve the controls ordering and carry {listing, scored, area}', () => {
    const listings = [L('1'), L('2'), L('3')];
    const out = partitionFeed(listings, deps({
      areaOf: (l) => ({ id: 'a', name: `Area of ${l.rightmove_id}` }),
      applyControls: (ls) => [...ls].reverse(),
    }));
    assertEqual(out.visible.map((r) => r.listing.rightmove_id).join(','), '3,2,1', 'controls order is authoritative');
    assert(out.visible.every((r) => r.scored && r.area), 'rows are fully hydrated');
  });
}
