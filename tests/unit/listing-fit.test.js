// tests/listing-fit.test.js — v3 L2 listing fit-score tests.
// Uses the shared finances/criteria fixtures. Asserts the hard affordability
// gate, the explainable contributions[] contract, and relative ordering that
// holds regardless of the exact calibrated thresholds.
import { scoreListingFit } from '../../assets/js/listings/fit.js';

export async function register({ test, assert, assertEqual, fixtures }) {
  const { finances, criteria } = fixtures;

  const mk = (over = {}) => ({
    rightmove_id: 't', price: 300000, beds: 3, baths: 2,
    property_type: 'Detached', epc: null, council_tax: null, ...over,
  });

  test('listing-fit: out-of-reach price is gated to reject', () => {
    const r = scoreListingFit({ listing: mk({ price: 3_000_000 }), finances, criteria });
    assertEqual(r.verdict, 'reject');
    assertEqual(r.gated, true);
    assert(r.affordability, 'affordability surfaced even when gated');
  });

  test('listing-fit: a price below budget.min is gated to reject', () => {
    // fixture budget.min is 180000; a known sub-minimum price gates out of the feed.
    const r = scoreListingFit({ listing: mk({ price: 150000 }), finances, criteria });
    assertEqual(r.verdict, 'reject');
    assertEqual(r.gated, true);
    assert(r.contributions.some((c) => c.signal === 'budget-floor'), 'below-min reason surfaced');
  });

  test('listing-fit: a price above budget.max is gated to reject', () => {
    // fixture budget.max is 350000; an affordable price above it gates out of the feed.
    const r = scoreListingFit({ listing: mk({ price: 360000 }), finances, criteria });
    assertEqual(r.verdict, 'reject');
    assertEqual(r.gated, true);
    assert(r.contributions.some((c) => c.signal === 'budget-ceiling'), 'over-max reason surfaced');
  });

  test('listing-fit: a price exactly at budget.max is in budget and not gated', () => {
    // The ceiling is inclusive — price === budget.max (350000) must not gate.
    const r = scoreListingFit({ listing: mk({ price: 350000 }), finances, criteria });
    assertEqual(r.gated, false);
  });

  test('listing-fit: an unknown (zero/absent) price does not trip the below-min gate', () => {
    const r = scoreListingFit({ listing: mk({ price: 0 }), finances, criteria });
    assertEqual(r.gated, false);
  });

  test('listing-fit: an affordable, in-criteria home is not gated and is scored', () => {
    const r = scoreListingFit({ listing: mk(), finances, criteria });
    assertEqual(r.gated, false);
    assert(['strong', 'possible', 'stretch', 'weak'].includes(r.verdict), `got ${r.verdict}`);
    assert(typeof r.score === 'number' && r.score >= 0 && r.score <= 1, 'score in 0..1');
  });

  test('listing-fit: every verdict ships an explainable contributions[]', () => {
    const r = scoreListingFit({ listing: mk(), finances, criteria });
    assert(Array.isArray(r.contributions) && r.contributions.length > 0, 'contributions present');
    for (const c of r.contributions) {
      assert('signal' in c && 'label' in c && 'delta' in c, 'each contribution names signal/label/delta');
    }
  });

  test('listing-fit: an excluded type scores no higher than a preferred type (same price)', () => {
    const preferred = scoreListingFit({ listing: mk({ property_type: 'Detached' }), finances, criteria });
    const excluded = scoreListingFit({ listing: mk({ property_type: 'Flat / Apartment' }), finances, criteria });
    assert(excluded.score <= preferred.score, `excluded ${excluded.score} <= preferred ${preferred.score}`);
  });

  // ── Ranked type feed order (propertyTypePrefs.priority, 2026-07-05) ──────────
  test('listing-fit: an applied priority order grades types — top rank above bottom rank', () => {
    const cri = { ...criteria, propertyTypePrefs: { ...(criteria.propertyTypePrefs || {}), priority: ['cottage', 'detached', 'terraced'] } };
    const top = scoreListingFit({ listing: mk({ property_type: 'Cottage' }), finances, criteria: cri });
    const mid = scoreListingFit({ listing: mk({ property_type: 'Detached' }), finances, criteria: cri });
    const bottom = scoreListingFit({ listing: mk({ property_type: 'Terraced' }), finances, criteria: cri });
    assert(top.score > bottom.score, `rank 1 ${top.score} > last rank ${bottom.score}`);
    assert(top.score > mid.score || top.score === mid.score + 0, 'rank 1 at least matches mid');
    assert(top.contributions.some((c) => c.signal === 'type' && /#1 in your feed order/.test(c.label)),
      'contribution names the rank');
  });

  test('listing-fit: priority replaces preferred/acceptable, but excluded still wins', () => {
    const cri = {
      ...criteria,
      propertyTypePrefs: {
        excluded: ['terraced'],
        preferred: ['terraced'], // deliberately contradictory — excluded must win
        priority: ['terraced', 'detached'],
      },
    };
    const r = scoreListingFit({ listing: mk({ property_type: 'Terraced' }), finances, criteria: cri });
    assert(r.contributions.some((c) => c.signal === 'type' && /excluded/.test(c.label)),
      'excluded branch taken despite rank 1');
  });

  test('listing-fit: absent/empty priority keeps the legacy 3-tier behaviour bit-identical', () => {
    const legacy = scoreListingFit({ listing: mk({ property_type: 'Detached' }), finances, criteria });
    const emptyPriority = scoreListingFit({
      listing: mk({ property_type: 'Detached' }), finances,
      criteria: { ...criteria, propertyTypePrefs: { ...(criteria.propertyTypePrefs || {}), priority: [] } },
    });
    assertEqual(emptyPriority.score, legacy.score, 'empty priority → legacy scoring');
    // A type not in the applied order gets no type contribution at all (delta 0).
    const unranked = scoreListingFit({
      listing: mk({ property_type: 'Detached' }), finances,
      criteria: { ...criteria, propertyTypePrefs: { priority: ['cottage', 'bungalow'] } },
    });
    assert(!unranked.contributions.some((c) => c.signal === 'type'), 'unranked type → no type contribution');
  });

  test('listing-fit: below-minimum beds scores below an ideal-beds home (same price)', () => {
    const ideal = scoreListingFit({ listing: mk({ beds: 3 }), finances, criteria });
    const tooSmall = scoreListingFit({ listing: mk({ beds: 1 }), finances, criteria });
    assert(tooSmall.score < ideal.score, `tooSmall ${tooSmall.score} < ideal ${ideal.score}`);
  });

  test('listing-fit: learned-preference weights feed through as contributions', () => {
    const base = scoreListingFit({ listing: mk(), finances, criteria });
    const boosted = scoreListingFit({ listing: mk(), finances, criteria, learnedPrefs: { 'quiet-edge-of-village': 0.2 } });
    assert(boosted.score >= base.score, 'positive learned weight does not lower the score');
    assert(boosted.contributions.some((c) => c.signal.startsWith('learned:')), 'learned contribution surfaced');
  });

  test('listing-fit: a rating of 1 adds no contribution (positive-only floor)', () => {
    const base = scoreListingFit({ listing: mk(), finances, criteria });
    const rated = scoreListingFit({ listing: mk(), finances, criteria, rating: 1 });
    assertEqual(rated.score, base.score);
    assert(!rated.contributions.some((c) => c.signal === 'rating'), 'no rating contribution at rating 1');
  });

  test('listing-fit: a rating of 10 adds the full positive rating contribution', () => {
    const base = scoreListingFit({ listing: mk(), finances, criteria });
    const rated = scoreListingFit({ listing: mk(), finances, criteria, rating: 10 });
    assert(rated.score >= base.score, 'a top rating never lowers the score');
    const c = rated.contributions.find((x) => x.signal === 'rating');
    assert(c && c.delta === 0.2, `rating 10 contributes ratingMax, got ${c && c.delta}`);
  });

  test('listing-fit: a mid rating boosts less than a top rating, never negative', () => {
    const mid = scoreListingFit({ listing: mk(), finances, criteria, rating: 5 });
    const top = scoreListingFit({ listing: mk(), finances, criteria, rating: 10 });
    const midC = mid.contributions.find((x) => x.signal === 'rating');
    assert(midC && midC.delta > 0 && midC.delta < 0.2, `mid rating between 0 and max, got ${midC && midC.delta}`);
    assert(top.score >= mid.score, 'higher rating ranks at least as high');
  });

  test('listing-fit: an absent rating leaves the score unchanged', () => {
    const base = scoreListingFit({ listing: mk(), finances, criteria });
    const noRating = scoreListingFit({ listing: mk(), finances, criteria, rating: undefined });
    assertEqual(noRating.score, base.score);
  });
}
