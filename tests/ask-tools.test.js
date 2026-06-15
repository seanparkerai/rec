// tests/ask-tools.test.js — pure-logic tests for the Ask edge function's tool
// helpers (supabase/functions/ask/pure.js). Covers listing filter/rank/gating,
// area search, finance-summary shaping, and outreach draft fill. Node-only
// (pure.js is a plain ESM module loadable in both Deno and Node); wired into
// run-intelligence-tests.mjs.
import {
  rankAndFilterListings, scoreListingFit, searchAreasPure,
  shapeFinancesSummary, renderOutreachDraft, bandForScore,
} from '../supabase/functions/ask/pure.js';

export async function register({ test, assert, assertEqual }) {
  // A small synthetic listings set (inline — there is no listings fixture file).
  const listings = [
    { rightmove_id: 'a1', address: 'Mill Lane, Winchester', area_id: 'winchester-so23',
      postcode: 'SO23 1AB', outcode: 'SO23', price: 380000, beds: 3, baths: 2,
      property_type: 'Detached house', tenure: 'Freehold', status: 'live',
      title: 'Charming cottage', description: 'A lovely period home with garden' },
    { rightmove_id: 'a2', address: 'High Street, Romsey', area_id: 'romsey-so51',
      postcode: 'SO51 8AA', outcode: 'SO51', price: 290000, beds: 2, baths: 1,
      property_type: 'Terraced house', tenure: 'Freehold', status: 'live',
      title: 'Town terrace', description: 'Close to amenities' },
    { rightmove_id: 'a3', address: 'Manor Park, Winchester', area_id: 'winchester-so23',
      postcode: 'SO23 9ZZ', outcode: 'SO23', price: 520000, beds: 4, baths: 3,
      property_type: 'Detached house', tenure: 'Freehold', status: 'live',
      title: 'Large family home', description: 'Spacious detached' },
    { rightmove_id: 'a4', address: 'Old Road, Andover', area_id: 'andover-sp10',
      postcode: 'SP10 1AA', outcode: 'SP10', price: 250000, beds: 3, baths: 1,
      property_type: 'Semi-detached house', tenure: 'Freehold', status: 'hidden',
      title: 'Hidden one', description: 'Should be excluded by status' },
  ];
  const criteria = {
    budget: { min: 250000, max: 425000 },
    size: { minBeds: 2, idealBeds: 3 },
    propertyTypePrefs: { preferred: ['Detached'], acceptable: ['Semi-detached'], excluded: ['Flat'] },
  };

  // ── scoreListingFit ───────────────────────────────────────────────────────
  test('ask-tools: a known price over the ceiling gates to reject', () => {
    const fit = scoreListingFit(listings[2], criteria); // £520k > £425k
    assertEqual(fit.gated, true);
    assertEqual(fit.verdict, 'reject');
  });

  test('ask-tools: an in-budget preferred-type ideal-bed home scores strong', () => {
    const fit = scoreListingFit(listings[0], criteria); // £380k, 3-bed detached
    assertEqual(fit.gated, false);
    assert(fit.score >= 0.75, `expected strong score, got ${fit.score}`);
    assertEqual(fit.verdict, 'strong');
    assert(fit.reasons.some((r) => /budget window/i.test(r)), 'should cite budget window');
  });

  test('ask-tools: bandForScore maps thresholds to verdicts', () => {
    assertEqual(bandForScore(0.8), 'strong');
    assertEqual(bandForScore(0.6), 'possible');
    assertEqual(bandForScore(0.45), 'stretch');
    assertEqual(bandForScore(0.25), 'weak');
    assertEqual(bandForScore(0.1), 'reject');
  });

  // ── rankAndFilterListings ─────────────────────────────────────────────────
  test('ask-tools: ranker drops gated + hidden rows and respects the limit', () => {
    const out = rankAndFilterListings(listings, { limit: 10 }, criteria);
    const ids = out.listings.map((l) => l.rightmove_id);
    assert(!ids.includes('a3'), 'over-budget a3 must be gated out');
    assert(!ids.includes('a4'), 'hidden a4 must be excluded');
    assert(ids.includes('a1') && ids.includes('a2'), 'in-budget live rows kept');
    assertEqual(out.returned, out.listings.length);
  });

  test('ask-tools: area + maxPrice filters narrow the result set', () => {
    const out = rankAndFilterListings(listings, { area: 'winchester', maxPrice: 400000 }, criteria);
    assertEqual(out.listings.length, 1);
    assertEqual(out.listings[0].rightmove_id, 'a1');
  });

  test('ask-tools: keyword filter matches title/description', () => {
    const out = rankAndFilterListings(listings, { keyword: 'period' }, criteria);
    assertEqual(out.listings.length, 1);
    assertEqual(out.listings[0].rightmove_id, 'a1');
  });

  test('ask-tools: ranker never returns the whole table (limit clamps to <=25)', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      rightmove_id: `m${i}`, price: 300000, beds: 3, property_type: 'Detached house', status: 'live',
    }));
    const out = rankAndFilterListings(many, { limit: 999 }, criteria);
    assert(out.listings.length <= 25, `expected <=25, got ${out.listings.length}`);
  });

  // ── searchAreasPure ───────────────────────────────────────────────────────
  test('ask-tools: area search matches name + county filter, flattens data blob', () => {
    const areas = [
      { id: 'winchester-so23', data: { name: 'Winchester', county: 'Hampshire', town: 'Winchester', overview: 'Cathedral city.' } },
      { id: 'salisbury-sp1', name: 'Salisbury', county: 'Wiltshire', town: 'Salisbury', overview: 'Market city.' },
    ];
    const hants = searchAreasPure(areas, { county: 'hampshire' });
    assertEqual(hants.length, 1);
    assertEqual(hants[0].name, 'Winchester');
    const byText = searchAreasPure(areas, { query: 'salisbury' });
    assertEqual(byText.length, 1);
    assertEqual(byText[0].id, 'salisbury-sp1');
  });

  // ── shapeFinancesSummary ──────────────────────────────────────────────────
  test('ask-tools: finance summary computes deposit gap + months-to-target', () => {
    const s = shapeFinancesSummary({
      currency: 'GBP', firstTimeBuyer: true,
      goal: { targetDeposit: 40000, targetPropertyPrice: 350000 },
      savings: { current: 10000, monthlyContribution: 1500 },
    });
    assertEqual(s.depositGap, 30000);
    assertEqual(s.monthsToTarget, 20);
    assertEqual(s.targetPropertyPrice, 350000);
  });

  test('ask-tools: finance summary handles zero contribution (no division by zero)', () => {
    const s = shapeFinancesSummary({ goal: { targetDeposit: 40000 }, savings: { current: 0, monthlyContribution: 0 } });
    assertEqual(s.monthsToTarget, null);
    assertEqual(s.depositGap, 40000);
  });

  // ── renderOutreachDraft ───────────────────────────────────────────────────
  test('ask-tools: outreach draft fills placeholders and reports missing ones', () => {
    const template = {
      id: 'A1', recipientRole: 'estate-agent',
      subjectTemplate: 'Viewing — {{listing.address}}',
      bodyTemplate: 'Hi {{contact.agentName}}, re {{listing.address}}. From {{profile.firstName}}.',
    };
    const draft = renderOutreachDraft(template, {
      listing: { address: '12 Mill Lane' },
      profile: { firstName: 'Sam' },
      // contact.agentName intentionally omitted
    });
    assertEqual(draft.subject, 'Viewing — 12 Mill Lane');
    assert(draft.body.includes('Hi {{contact.agentName}}'), 'unresolved placeholder preserved');
    assert(draft.missingFields.includes('contact.agentName'), 'missing field reported');
    assertEqual(draft.templateId, 'A1');
  });
}
