// tests/ask-tools.test.js — pure-logic tests for the Ask edge function's tool
// helpers (supabase/functions/ask/pure.js). Covers listing filter/rank/gating,
// area search, finance-summary shaping, and outreach draft fill. Node-only
// (pure.js is a plain ESM module loadable in both Deno and Node); wired into
// run-intelligence-tests.mjs.
import {
  rankAndFilterListings, buildListingsQuery, scoreListingFit, searchAreasPure,
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

  // ── buildListingsQuery (P1-1 push-down) ───────────────────────────────────
  test('ask-tools: buildListingsQuery selects description ONLY on a keyword search', () => {
    const plain = buildListingsQuery({ area: 'winchester' });
    assert(!/description/.test(plain.columns), 'no description without a keyword');
    assertEqual(plain.wantsKeyword, false);
    const kw = buildListingsQuery({ keyword: 'period' });
    assert(/description/.test(kw.columns), 'description requested on keyword search');
    assertEqual(kw.wantsKeyword, true);
  });

  test('ask-tools: buildListingsQuery defaults to live rows and pushes indexed predicates', () => {
    const q = buildListingsQuery({ maxPrice: 400000, minPrice: 250000, area: 'winchester' });
    const eq = q.filters.find((f) => f.kind === 'eq');
    assertEqual(eq.col, 'status');
    assertEqual(eq.value, 'live');
    // Price predicates keep price-NULL rows so unpriced listings survive (parity with pure.js).
    assert(q.filters.some((f) => f.kind === 'or' && f.expr === 'price.lte.400000,price.is.null'), 'maxPrice OR-null');
    assert(q.filters.some((f) => f.kind === 'or' && f.expr === 'price.gte.250000,price.is.null'), 'minPrice OR-null');
    assert(q.filters.some((f) => f.kind === 'or' && /area_id\.ilike\.%winchester%/.test(f.expr)), 'area ilike push-down');
    assertEqual(q.limit, 200);
  });

  test('ask-tools: buildListingsQuery omits the status filter when includeHidden is set', () => {
    const q = buildListingsQuery({ includeHidden: true });
    assert(!q.filters.some((f) => f.kind === 'eq' && f.col === 'status'), 'no live-only filter when includeHidden');
  });

  test('ask-tools: buildListingsQuery sanitises the area term out of the .or() filter', () => {
    // Commas in the expr are legitimate filter separators; the TERM itself must be
    // free of the punctuation that would break PostgREST's .or() grammar.
    const q = buildListingsQuery({ area: 'Mill, (Lane)' });
    const or = q.filters.find((f) => f.kind === 'or' && /ilike/.test(f.expr));
    assert(!/[()]/.test(or.expr), 'no parentheses survive into the filter');
    assert(/%Mill Lane%/.test(or.expr), 'separators collapsed to a single space inside the ilike pattern');
  });

  test('ask-tools: push-down candidate set + ranker yields the same verdicts as filtering the full table', () => {
    // The DB now hands pure.js a pre-narrowed live/in-price candidate window; the
    // ranked verdicts must match ranking the full table with the same filters.
    const candidates = listings.filter((l) => l.status === 'live' && (!l.price || l.price <= 425000));
    const pushed = rankAndFilterListings(candidates, { maxPrice: 425000 }, criteria);
    const whole = rankAndFilterListings(listings, { maxPrice: 425000 }, criteria);
    assertEqual(
      pushed.listings.map((l) => `${l.rightmove_id}:${l.fit}`).join('|'),
      whole.listings.map((l) => `${l.rightmove_id}:${l.fit}`).join('|'),
    );
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
