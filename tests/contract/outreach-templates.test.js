// outreach-templates.test.js — Phase 1/2 tests for the template registry and renderer.
// Runs via tools/run-intelligence-tests.mjs (Node, no DOM).
import { validateOutreachTemplate } from '../schemas.js';

// Sample context used for renderer and leak tests.
const SAMPLE_CTX = {
  profile: {
    firstName: 'Alex',
    lastName: 'Smith',
    mobile: '07700900000',
    email: 'alex@example.com',
    postcode: 'AA1 1AA',
    address: '12 Test Street, Sample Town, AA1 1AA',
    dob: '1990-01-15',
  },
  finances: {
    income: { annualBaseSalary: 60000, annualBonus: 2000 },
    goal: {
      targetPropertyPrice: 350000,
      offerTarget: 330000,
      targetDeposit: 35000,
      depositPct: 10,
      movingWindow: 'sample window',
    },
    savings: { monthlyContribution: 1500, current: 20000 },
    mortgage: { fixedRatePref: '2-year', feesWillingness: { max: 1500 } },
    aipLender: 'Example Lender',
    aipAmount: 300000,
    aipExpiryDate: '2026-08-01',
    depositAmount: 35000,
    depositSource: 'Cash ISA — Example Bank',
  },
  criteria: {
    areaFocus: 'Hampshire / Wiltshire',
    beds: '2–3',
    propertyType: 'detached or semi-detached',
    budget: 400000,
    mustHaves: 'garden, parking, EPC C+',
  },
  contact: {
    agentName: 'Jane Doe',
    agentEmail: 'jane@example-estate.co.uk',
    agentPhone: '01962000001',
    brokerName: 'Tom Broker',
    brokerEmail: 'tom@broker.co.uk',
    brokerPhone: '07700900001',
    solicitorName: 'Sarah Law',
    solicitorFirm: 'Smith & Co Solicitors',
    solicitorEmail: 'sarah@smithco.co.uk',
    solicitorPhone: '01962000002',
    surveyorName: 'John Survey',
  },
  listing: {
    address: '10 Cottage Lane, Sparsholt, Winchester, SO21 2NX',
    askingPrice: 390000,
    offerAmount: 375000,
    offerAsPctOfAsking: 96,
    agreedPrice: 375000,
    portal: 'Rightmove',
    ref: 'RM123456',
    tenure: 'Freehold',
    propertyType: 'Detached cottage',
    beds: 3,
    isNewBuild: 'No',
    age: 'c.1890',
    construction: 'Stone and brick',
    url: 'https://www.rightmove.co.uk/properties/123456789',
    rebuildCost: 280000,
    counterOfferAmount: 382000,
    revisedOfferAmount: 368000,
    sellerSolicitor: 'Not yet provided',
  },
  vendor: { streetName: 'Cottage Lane', areaName: 'Sparsholt' },
  // Sentinel for leak detection — should NEVER appear in templates that don't list it in dataNeeded.
  _sentinel: { SENSITIVE_SALARY_MARKER: 'SENSITIVE-SALARY-MARKER-DO-NOT-LEAK' },
  // Extra free-text fields captured in the UI.
  viewingDateOption1: 'Saturday 7 June, morning',
  viewingDateOption2: 'Tuesday 10 June, 5:30pm',
  offerDeadline: 'Friday 6 June at 5pm',
  offerDate: '2 June 2026',
  offerAcceptedDate: '3 June 2026',
  withdrawalReason: 'Survey revealed significant subsidence requiring underpinning',
  counterOfferResponse: 'I am able to increase my offer to £378,000 — this is my final position.',
  surveyConcerns: 'damp near north-facing wall, visible crack above bay window lintel',
  surveyQuestions: '- What does the amber rating on the bay window mean in practice?\n- Should I get a structural engineer for the north-wall damp?',
  surveyFindings: '- Bay window lintel cracked (RICS amber)\n- Damp penetration on north wall (RICS amber)',
  surveyRemediationCost: 8000,
  surveyFee: 450,
  surveyDateOption1: 'Monday 9 June',
  surveyDateOption2: 'Wednesday 11 June',
  surveyTurnaround: 5,
  targetExchangeDate: '2026-07-15',
  targetCompletionDate: '2026-07-29',
  removalsVolume: '2-bed house worth of furniture',
  removalsRooms: 2,
  removalsSpecialItems: 'Piano (upright), wardrobe (requires disassembly)',
  removalsPackingReq: 'Self-pack, just transport',
  meterReadingGas: '01234',
  meterReadingElec: '56789',
  meterReadingWater: '11111',
};

export async function register({ test, assert, assertEqual, fixtures }) {
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const templates = JSON.parse(readFileSync(join(root, 'data/outreach-templates.json'), 'utf8'));

  // ── Schema validation ─────────────────────────────────────────────────

  test('outreach-templates: all 24 templates present', () => {
    assertEqual(templates.length, 24, `Expected 24 templates, got ${templates.length}`);
  });

  test('outreach-templates: unique IDs', () => {
    const ids = templates.map((t) => t.id);
    const unique = new Set(ids);
    assert(unique.size === ids.length, `Duplicate template IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  });

  for (const tmpl of templates) {
    test(`outreach-templates: schema valid — ${tmpl.id}`, () => {
      const errors = validateOutreachTemplate(tmpl);
      assert(errors.length === 0, `${tmpl.id} schema errors: ${errors.join('; ')}`);
    });
  }

  test('outreach-templates: stages cover A/B/C/D', () => {
    const stages = new Set(templates.map((t) => t.stage));
    for (const s of ['A', 'B', 'C', 'D']) assert(stages.has(s), `Missing stage ${s}`);
  });

  test('outreach-templates: all templates have ≥1 bestPracticeNote', () => {
    for (const t of templates) {
      assert(t.bestPracticeNotes.length >= 1, `${t.id} has no bestPracticeNotes`);
    }
  });

  test('outreach-templates: subject templates are ≤80 chars (raw, before substitution)', () => {
    for (const t of templates) {
      assert(t.subjectTemplate.length <= 80, `${t.id} subject too long: ${t.subjectTemplate.length} chars`);
    }
  });

  test('outreach-templates: {{#if}} blocks are balanced', () => {
    const openRe = /\{\{#if [^}]+\}\}/g;
    const closeRe = /\{\{\/if\}\}/g;
    for (const t of templates) {
      const body = t.bodyTemplate;
      const opens = (body.match(openRe) || []).length;
      const closes = (body.match(closeRe) || []).length;
      assertEqual(opens, closes, `${t.id}: unbalanced {{#if}}/{{/if}} (${opens} open, ${closes} close)`);
    }
  });

  // ── dataNeeded ↔ placeholder parity rail (step 8.2) ───────────────────
  // dataNeeded is hand-written per template; a body referencing {{a.path}}
  // that dataNeeded omits renders as a silent blank/literal in a real email.
  // Both directions are drift: an undeclared USED path breaks rendering, an
  // unused DECLARED path is a stale requirement that over-gates the template.
  // A mismatch here is fixed in data/outreach-templates.json, never by
  // relaxing this rail. Today (2026-07-03) all 24 templates are clean.
  const placeholderPaths = (t) => {
    const text = `${t.subjectTemplate || ''}\n${t.bodyTemplate || ''}`;
    const used = new Set();
    for (const m of text.matchAll(/\{\{#if ([^}]+)\}\}/g)) used.add(m[1].trim());
    for (const m of text.matchAll(/\{\{([^#/}][^}]*)\}\}/g)) used.add(m[1].trim());
    return used;
  };

  for (const tmpl of templates) {
    test(`outreach-templates: dataNeeded ≡ placeholders — ${tmpl.id}`, () => {
      const used = placeholderPaths(tmpl);
      assert(used.size > 0, `${tmpl.id}: parser found no placeholders — the rail regex went stale`);
      const declared = new Set(tmpl.dataNeeded || []);
      const missing = [...used].filter((p) => !declared.has(p));
      const unused = [...declared].filter((p) => !used.has(p));
      assert(missing.length === 0,
        `${tmpl.id}: body/subject use paths dataNeeded omits (would render blank): ${missing.join(', ')}`);
      assert(unused.length === 0,
        `${tmpl.id}: dataNeeded declares paths the template never uses: ${unused.join(', ')}`);
    });
  }

  // ── Renderer tests ────────────────────────────────────────────────────
  // Import the renderer dynamically. This requires the file to exist (Phase 2).
  let renderer = null;
  try {
    renderer = await import('../../assets/js/outreach-renderer.js');
  } catch {
    // Renderer not yet built — skip renderer tests gracefully.
  }

  if (renderer) {
    const { resolvePath, renderTemplate, buildMailto, assembleContext } = renderer;

    test('outreach-renderer: resolvePath returns value for existing path', () => {
      const ctx = { profile: { firstName: 'Alex' } };
      assertEqual(resolvePath(ctx, 'profile.firstName'), 'Alex');
    });

    test('outreach-renderer: resolvePath returns undefined for missing path (no throw)', () => {
      const ctx = {};
      let result;
      let threw = false;
      try { result = resolvePath(ctx, 'profile.firstName'); } catch { threw = true; }
      assert(!threw, 'resolvePath should not throw on missing path');
      assert(result === undefined, 'resolvePath should return undefined for missing path');
    });

    test('outreach-renderer: resolvePath handles deeply nested paths', () => {
      const ctx = { a: { b: { c: 42 } } };
      assertEqual(resolvePath(ctx, 'a.b.c'), 42);
    });

    test('outreach-renderer: renderTemplate substitutes known paths', () => {
      const tmpl = templates.find((t) => t.id === 'A1');
      const ctx = assembleContext({ profile: SAMPLE_CTX.profile, finances: SAMPLE_CTX.finances, contact: SAMPLE_CTX.contact, listing: SAMPLE_CTX.listing, extras: { viewingDateOption1: SAMPLE_CTX.viewingDateOption1, viewingDateOption2: SAMPLE_CTX.viewingDateOption2 } });
      const { subject, body } = renderTemplate(tmpl, ctx);
      assert(subject.includes('10 Cottage Lane'), `A1 subject should include address, got: ${subject}`);
      assert(body.includes('Alex'), `A1 body should include first name`);
    });

    test('outreach-renderer: renderTemplate leaves missing {{path}} literal and adds to missingFields', () => {
      const tmpl = { ...templates.find((t) => t.id === 'A1'), bodyTemplate: 'Hello {{profile.firstName}} {{unknown.field}}' };
      const ctx = assembleContext({ profile: SAMPLE_CTX.profile, extras: {} });
      const { body, missingFields } = renderTemplate(tmpl, ctx);
      assert(body.includes('{{unknown.field}}'), 'Missing field should remain literal in body');
      assert(missingFields.includes('unknown.field'), 'Missing field should appear in missingFields array');
    });

    test('outreach-renderer: {{#if}} block removed when condition missing/falsy', () => {
      const tmpl = {
        ...templates[0],
        bodyTemplate: 'Hello{{#if listing.offerAsPctOfAsking}} ({{listing.offerAsPctOfAsking}}%){{/if}} world',
        subjectTemplate: 'Test',
        dataNeeded: ['listing.offerAsPctOfAsking'],
      };
      const ctx = assembleContext({ extras: {} }); // no listing
      const { body } = renderTemplate(tmpl, ctx);
      assert(!body.includes('{{#if'), 'Unresolved {{#if}} should be removed');
      assert(!body.includes('{{/if}}'), '{{/if}} should be removed');
      assert(body.includes('Hello world') || body.includes('Hello  world'), `body should be: Hello world, got: ${body}`);
    });

    test('outreach-renderer: {{#if}} block included when condition truthy', () => {
      const tmpl = {
        ...templates[0],
        bodyTemplate: 'Hello{{#if profile.firstName}} {{profile.firstName}}{{/if}} world',
        subjectTemplate: 'Test',
        dataNeeded: ['profile.firstName'],
      };
      const ctx = assembleContext({ profile: SAMPLE_CTX.profile, extras: {} });
      const { body } = renderTemplate(tmpl, ctx);
      assert(body.includes('Alex'), `body should include first name, got: ${body}`);
    });

    test('outreach-renderer: buildMailto returns encoded string for short content', () => {
      const result = buildMailto({ to: 'test@example.com', subject: 'Hello', body: 'World' });
      assert(result.mailto !== null, 'Short mailto should not be null');
      assert(result.mailto.startsWith('mailto:'), 'mailto should start with mailto:');
      assert(result.useClipboard === false, 'useClipboard should be false for short content');
    });

    test('outreach-renderer: buildMailto returns useClipboard:true over 1800 chars', () => {
      const longBody = 'x'.repeat(1900);
      const result = buildMailto({ to: 'test@example.com', subject: 'Test', body: longBody });
      assert(result.useClipboard === true, 'useClipboard should be true when URL exceeds 1800 chars');
    });

    // ── Quantity-of-information leak tests ────────────────────────────
    test('outreach-renderer: estate-agent viewing request (A1) does not leak salary', () => {
      const tmpl = templates.find((t) => t.id === 'A1');
      // Plant salary in context but A1.dataNeeded doesn't include it.
      const fullCtx = assembleContext({
        profile: SAMPLE_CTX.profile,
        finances: { ...SAMPLE_CTX.finances, _sentinel: 'SENSITIVE-SALARY-MARKER' },
        contact: SAMPLE_CTX.contact,
        listing: SAMPLE_CTX.listing,
        extras: { viewingDateOption1: 'Saturday', viewingDateOption2: 'Tuesday' },
      });
      const { body } = renderTemplate(tmpl, fullCtx);
      assert(!body.includes('SENSITIVE-SALARY-MARKER'), 'A1 should not include salary in output');
      assert(!body.includes('60000'), 'A1 should not include raw salary figure');
    });

    test('outreach-renderer: broker enquiry (A5) includes salary in output', () => {
      const tmpl = templates.find((t) => t.id === 'A5');
      const fullCtx = assembleContext({
        profile: SAMPLE_CTX.profile,
        finances: SAMPLE_CTX.finances,
        contact: SAMPLE_CTX.contact,
        extras: {},
      });
      const { body } = renderTemplate(tmpl, fullCtx);
      assert(body.includes('60000'), 'A5 should include salary for broker');
    });

    // ── dataNeeded vs body placeholder consistency ────────────────────
    test('outreach-renderer: filterContextByDataNeeded strips paths not in dataNeeded', () => {
      const { filterContextByDataNeeded: fctx } = renderer;
      const ctx = { profile: { firstName: 'Alex', sensitive: 'SECRET' }, finances: { income: { annualBaseSalary: 60000 } } };
      const filtered = fctx(ctx, ['profile.firstName']);
      assert(filtered.profile.firstName === 'Alex', 'Allowed field should be present');
      assert(filtered.profile.sensitive === undefined, 'Not-in-dataNeeded field should be stripped');
      assert(filtered.finances === undefined, 'Entire finances branch should be stripped when not needed');
    });

    test('outreach-renderer: A1 filtered context never contains salary even when full context has it', () => {
      const { filterContextByDataNeeded: fctx } = renderer;
      const tmpl = templates.find((t) => t.id === 'A1');
      const fullCtx = assembleContext({ finances: SAMPLE_CTX.finances, profile: SAMPLE_CTX.profile, contact: SAMPLE_CTX.contact, listing: SAMPLE_CTX.listing, extras: {} });
      const filtered = fctx(fullCtx, tmpl.dataNeeded);
      // finances.income.annualBaseSalary should not be reachable.
      const leaked = renderer.resolvePath(filtered, 'finances.income.annualBaseSalary');
      assert(leaked === undefined, 'Salary should not be accessible in filtered A1 context');
    });

    test('outreach-templates: no body placeholder outside dataNeeded', () => {
      const placeholderRe = /\{\{(?!#if|\/if)([^}]+)\}\}/g;
      for (const tmpl of templates) {
        const bodyPlaceholders = [];
        let m;
        while ((m = placeholderRe.exec(tmpl.bodyTemplate)) !== null) bodyPlaceholders.push(m[1].trim());
        placeholderRe.lastIndex = 0;
        const subjectPlaceholders = [];
        while ((m = placeholderRe.exec(tmpl.subjectTemplate)) !== null) subjectPlaceholders.push(m[1].trim());
        placeholderRe.lastIndex = 0;
        const allPlaceholders = [...new Set([...bodyPlaceholders, ...subjectPlaceholders])];
        for (const ph of allPlaceholders) {
          assert(
            tmpl.dataNeeded.includes(ph),
            `${tmpl.id}: placeholder {{${ph}}} not listed in dataNeeded`
          );
        }
      }
    });
  }
}
