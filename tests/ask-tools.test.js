// tests/ask-tools.test.js — pure-logic tests for the Ask edge function's tool
// helpers (supabase/functions/ask/pure.js). Covers listing filter/rank/gating,
// area search, finance-summary shaping, and outreach draft fill. Node-only
// (pure.js is a plain ESM module loadable in both Deno and Node); wired into
// run-intelligence-tests.mjs.
import {
  rankAndFilterListings, buildListingsQuery, scoreListingFit, searchAreasPure,
  shapeFinancesSummary, computeDepositSavings, renderOutreachDraft, bandForScore,
  capToolResult, estimateConvoChars, fitConvoToBudget,
  assembleOutreachBrief, buildDerivedSignals, stripPaths, OUTREACH_NEVER_FOR_NON_BROKER,
} from '../supabase/functions/ask/pure.js';
import { deriveFinances } from '../assets/js/finance-derive.js';

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

  test('ask-tools: finance summary counts the earmarked ISA + surfaces it (the "£0 saved" fix)', () => {
    // £0 cash, deposit lives in a fully-earmarked ISA — Ask previously reported £0 saved.
    const s = shapeFinancesSummary(
      { goal: { targetDeposit: 40000 }, savings: { current: 0, monthlyContribution: 2000 } },
      { trading212ISA: { currentPortfolioValue: 32994.45, earmarkPct: 100 } },
    );
    assertEqual(s.depositSaved, 32994.45);
    assertEqual(s.cashSavings, 0);
    assert(s.earmarkedIsa && s.earmarkedIsa.currentValue === 32994.45, 'ISA surfaced so the model can name it');
    assertEqual(s.earmarkedIsa.earmarkPct, 100);
    assertEqual(s.depositGap, Math.round((40000 - 32994.45) * 100) / 100);
  });

  // ── edge↔browser parity (regression lock, plan §4) ────────────────────────
  test('ask-tools: shapeFinancesSummary.depositSaved === deriveFinances totalSavings across fixtures', () => {
    const cases = [
      // The regression: £0 cash + fully-earmarked ISA.
      { fin: { savings: { current: 0 }, goal: { targetDeposit: 40000 } }, inv: { trading212ISA: { currentPortfolioValue: 32994.45, earmarkPct: 100 } } },
      // Cash buffer + half-earmarked ISA.
      { fin: { savings: { current: 2500 } }, inv: { trading212ISA: { currentPortfolioValue: 50000, earmarkPct: 50 } } },
      // Cash only, no investments record (e.g. household f36e6215 after repair).
      { fin: { savings: { current: 53000 } }, inv: null },
      // ISA present with no earmark → full value counts.
      { fin: { savings: { current: 1000 } }, inv: { trading212ISA: { currentPortfolioValue: 12000 } } },
      // Nothing on record.
      { fin: { savings: {} }, inv: null },
    ];
    for (const c of cases) {
      const edge = shapeFinancesSummary(c.fin, c.inv).depositSaved;
      const browser = deriveFinances(c.fin, { investments: c.inv }).savings.totalSavings;
      assertEqual(edge, browser);
      assertEqual(edge, computeDepositSavings(c.fin, c.inv));
    }
  });

  // ── Context-window guards (prompt-too-long fix) ───────────────────────────
  test('ask-tools: capToolResult passes small results through unchanged', () => {
    const r = { ok: true, n: 3 };
    assertEqual(capToolResult(r, 24_000), JSON.stringify(r));
  });

  test('ask-tools: capToolResult truncates an oversized result with a clear marker', () => {
    const big = { blob: 'x'.repeat(50_000) };
    const out = capToolResult(big, 1_000);
    assert(out.length < 1_200, `expected a bounded string, got ${out.length}`);
    assert(out.startsWith('{"blob":"xxxx'), 'keeps the leading payload');
    assert(/result truncated: \d+ more characters omitted/.test(out), 'marks the truncation');
  });

  test('ask-tools: capToolResult tolerates string input and a zero cap', () => {
    assertEqual(capToolResult('already a string', 0), 'already a string');
    assertEqual(capToolResult(null), 'null');
  });

  test('ask-tools: fitConvoToBudget returns the thread untouched when under budget', () => {
    const convo = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    assertEqual(fitConvoToBudget(convo, 1_000), convo);
  });

  test('ask-tools: fitConvoToBudget drops oldest turns to fit, keeping a clean user-text start', () => {
    const convo = [
      { role: 'user', content: 'q1 ' + 'a'.repeat(5_000) },
      { role: 'assistant', content: 'a1 ' + 'b'.repeat(5_000) },
      { role: 'user', content: 'q2 short' },
      { role: 'assistant', content: 'a2 short' },
    ];
    const out = fitConvoToBudget(convo, 200);
    assert(out.length < convo.length, 'trimmed at least one turn');
    assertEqual(out[0].role, 'user');
    assertEqual(typeof out[0].content, 'string');
    assert(estimateConvoChars(out) <= 200 || out.length === 1, 'fits the budget or is the minimal tail');
    assertEqual(out[0].content, 'q2 short');
  });

  test('ask-tools: fitConvoToBudget never cuts to a tool_result-led user turn (pairing safe)', () => {
    // A loop-appended assistant(tool_use) + user(tool_result) pair must survive intact:
    // the only valid cut point is the plain-text user question before it.
    const convo = [
      { role: 'user', content: 'q1 ' + 'a'.repeat(8_000) },
      { role: 'assistant', content: 'a1 ' + 'b'.repeat(8_000) },
      { role: 'user', content: 'compare these listings' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'query_listings', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"listings":[]}' }] },
    ];
    const out = fitConvoToBudget(convo, 100);
    // Must start on the text question, NOT the tool_result turn (which would orphan t1).
    assertEqual(out[0].role, 'user');
    assertEqual(out[0].content, 'compare these listings');
    // The tool_use/tool_result pair is preserved as a whole.
    assert(Array.isArray(out[out.length - 1].content), 'tool_result turn retained');
    assert(out.some((m) => Array.isArray(m.content) && m.content[0]?.type === 'tool_use'), 'tool_use turn retained');
  });

  test('ask-tools: fitConvoToBudget leaves the thread intact when there is no safe cut point', () => {
    // No plain-text user turn to cut to → return as-is rather than orphan a pairing.
    const convo = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'big'.repeat(5_000) }] },
    ];
    assertEqual(fitConvoToBudget(convo, 10), convo);
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

  // ── assembleOutreachBrief (Compose capability + QoI privacy ladder) ───────────
  const outreachTemplates = [
    { id: 'A1', stage: 'A', stageName: 'Search', recipientRole: 'estate-agent',
      title: 'Estate agent — viewing request', description: 'Arrange a viewing with proceedability signals.',
      subjectTemplate: 'Viewing — {{listing.address}}',
      bodyTemplate: 'Hi {{contact.agentName}},\n\nViewing of {{listing.address}} (ref {{listing.ref}}). '
        + 'Position: first-time buyer, chain-free, AIP for £{{finances.aipAmount}}.\n\n'
        + 'Could {{viewingDateOption1}} or {{viewingDateOption2}} work?\n\n'
        + '{{profile.firstName}} {{profile.lastName}}\n{{profile.mobile}}',
      tone: 'warm-brief', bestPracticeNotes: ['Lead with proceedability'],
      sources: [{ title: 'x', url: 'http://x' }], attachmentsHint: [], dataNeeded: [] },
    { id: 'A5', stage: 'A', stageName: 'Search', recipientRole: 'mortgage-broker',
      title: 'Mortgage broker — initial enquiry', description: 'Full intro to a broker with the numbers.',
      subjectTemplate: 'FTB mortgage enquiry',
      bodyTemplate: 'Hi {{contact.brokerName}}, base £{{finances.income.annualBaseSalary}}.',
      tone: 'warm-complete', bestPracticeNotes: [], sources: [], attachmentsHint: [], dataNeeded: [] },
    { id: 'B1', stage: 'B', stageName: 'Offer', recipientRole: 'estate-agent',
      title: 'Estate agent — make an offer', description: 'Put an offer in.',
      subjectTemplate: 'Offer — {{listing.address}}', bodyTemplate: 'Offer of £{{offerAmount}}.',
      tone: 'warm-brief', bestPracticeNotes: [], sources: [], attachmentsHint: [], dataNeeded: [] },
  ];
  const household = {
    profile: { person: {
      firstName: 'Sam', lastName: 'Jones', mobile: '07700 900000', email: 'sam@example.com',
      household: { livingArrangement: 'renting' },
    } },
    finances: {
      firstTimeBuyer: true, income: { annualBaseSalary: 62000 }, savings: { current: 20000 },
      goal: { targetDeposit: 40000, targetPropertyPrice: 350000 },
      mortgage: { targetMax: 300000, lender: 'Halifax' },
    },
    criteria: {},
    contacts: { agents: [{ name: 'Jane Smith', firm: 'ABC Estates', email: 'jane@abc.co.uk', phone: '01234 567890' }], brokers: [] },
  };

  test('ask-tools: outreach brief picks the exemplar by templateId, then by role + intent', () => {
    const byId = assembleOutreachBrief({ templates: outreachTemplates, recipientRole: 'estate-agent', templateId: 'B1', household });
    assertEqual(byId.exemplar.id, 'B1');
    const offer = assembleOutreachBrief({ templates: outreachTemplates, recipientRole: 'estate-agent', intent: 'make an offer', household });
    assertEqual(offer.exemplar.id, 'B1');
    const viewing = assembleOutreachBrief({ templates: outreachTemplates, recipientRole: 'estate-agent', intent: 'request a viewing', household });
    assertEqual(viewing.exemplar.id, 'A1');
  });

  test('ask-tools: QoI ladder hides salary/savings/deposit from agents AND vendors', () => {
    for (const role of ['estate-agent', 'vendor']) {
      const brief = assembleOutreachBrief({ templates: outreachTemplates, recipientRole: role, household });
      const blob = JSON.stringify(brief.allowedFacts).toLowerCase();
      assert(!blob.includes('62000'), `${role} must not see the salary figure`);
      assert(!blob.includes('20000'), `${role} must not see the savings figure`);
      assert(!blob.includes('40000'), `${role} must not see the deposit target`);
      assert(!/income|savings|creditprofile|debts/.test(blob), `${role} facts must omit sensitive keys`);
      assertEqual(brief.allowedFacts.firstTimeBuyer, true);
      assert(/first-time buyer/.test(brief.allowedFacts.positionSummary || ''), `${role} keeps the proceedability summary`);
    }
  });

  test('ask-tools: the mortgage broker gets the full financial picture', () => {
    const brief = assembleOutreachBrief({ templates: outreachTemplates, recipientRole: 'mortgage-broker', household });
    assertEqual(brief.allowedFacts.finances.income.annualBaseSalary, 62000);
    assert(brief.allowedFacts.depositSaved != null, 'broker sees the derived deposit position');
  });

  test('ask-tools: the never-share backstop strips a planted sensitive field', () => {
    const planted = { profile: { person: { firstName: 'Sam' } }, finances: { income: { annualBaseSalary: 99000 } } };
    stripPaths(planted, OUTREACH_NEVER_FOR_NON_BROKER);
    assertEqual(planted.finances.income, undefined);
    assertEqual(planted.profile.person.firstName, 'Sam');
  });

  test('ask-tools: derived signals reflect whether an AIP figure exists', () => {
    const withAip = buildDerivedSignals(household);
    assertEqual(withAip.aipInPlace, true);
    assertEqual(withAip.aipAmount, 300000);
    assert(/AIP in place/.test(withAip.positionSummary), 'names the AIP when present');
    const noAip = buildDerivedSignals({ ...household, finances: { ...household.finances, mortgage: {} } });
    assertEqual(noAip.aipInPlace, false);
    assert(!/AIP/.test(noAip.positionSummary), 'omits the AIP clause when absent');
  });

  test('ask-tools: missingFacts flags absent specifics but not facts already grounded', () => {
    const brief = assembleOutreachBrief({
      templates: outreachTemplates, recipientRole: 'estate-agent', templateId: 'A1',
      listingRef: '123', listing: { rightmove_id: '123', address: '12 Mill Lane', ref: '123' },
      contactName: 'Jane', household,
    });
    assert(brief.missingFacts.includes('viewingDateOption1'), 'flags missing viewing slot 1');
    assert(brief.missingFacts.includes('viewingDateOption2'), 'flags missing viewing slot 2');
    assert(!brief.missingFacts.includes('profile.firstName'), 'does not flag a held name');
    assert(!brief.missingFacts.includes('listing.address'), 'does not flag the grounded address');
    assert(!brief.missingFacts.includes('contact.agentName'), 'a matched contact satisfies the agent name');
    assertEqual(brief.contact.name, 'Jane Smith');
  });
}
