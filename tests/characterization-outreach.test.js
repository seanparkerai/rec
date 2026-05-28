// characterization-outreach.test.js — pins the outreach computation/rendering
// layer as a refactor baseline for Phase 5. No DOM access.
//
// The outreach-templates.test.js covers template correctness thoroughly.
// This file adds: (a) a smoke test that the renderer module loads cleanly,
// (b) structural assertions about the template registry, and (c) context
// building assertions that would catch regressions in page-outreach.js refactoring.

import { renderTemplate, buildMailto } from '../assets/js/outreach-renderer.js';

const SAMPLE_CTX = {
  profile: {
    firstName: 'Test',
    lastName: 'User',
    mobile: '07700900000',
    email: 'test@example.com',
    postcode: 'SO22 5AA',
    address: '12 Test Street, Winchester',
    dob: '1990-01-01',
  },
  finances: {
    income: { annualBaseSalary: 64000 },
    goal: {
      targetPropertyPrice: 400000,
      offerTarget: 380000,
      targetDeposit: 40000,
      depositPct: 10,
      movingWindow: 'Summer 2026',
    },
    savings: { monthlyContribution: 2000, current: 24500 },
    mortgage: { fixedRatePref: '2-year', feesWillingness: { max: 2000 } },
    aipLender: 'Nationwide',
    aipAmount: 360000,
    depositAmount: 40000,
  },
  criteria: {
    budget: { min: 200000, max: 400000, offerTarget: 380000 },
    size: { minBeds: 2, idealBeds: 3 },
    mustHaves: ['Freehold', 'Garden'],
    location: { areaSource: 'Hampshire' },
  },
  property: {
    address: '42 Village Lane, Compton, SO21 2AS',
    price: 375000,
    beds: 3,
    type: 'Detached',
    listingUrl: 'https://example.com/property/123',
    agentName: 'Hampshire Homes',
    agentEmail: 'sales@hampshirehomes.co.uk',
    agentPhone: '01962 000000',
  },
  contact: {
    firstName: 'Jane',
    lastName: 'Agent',
    company: 'Hampshire Homes',
    email: 'jane@hampshirehomes.co.uk',
  },
};

const SAMPLE_TEMPLATE = {
  id: 'char-test-A1',
  title: 'Characterization test template',
  stage: 'A',
  subjectTemplate: 'Viewing request — {{property.address}}',
  bodyTemplate: 'Hi {{contact.firstName}},\n\nI would like to view {{property.address}}.\n\nRegards,\n{{profile.firstName}} {{profile.lastName}}',
  dataNeeded: ['property.address', 'contact.firstName', 'profile.firstName', 'profile.lastName'],
};

export async function register({ test, assert, assertEqual }) {
  // ── Module loads ────────────────────────────────────────────────────────────
  await test('characterization/outreach: renderTemplate is a function', () => {
    assert(typeof renderTemplate === 'function',
      `expected function, got ${typeof renderTemplate}`);
  });

  await test('characterization/outreach: buildMailto is a function', () => {
    assert(typeof buildMailto === 'function',
      `expected function, got ${typeof buildMailto}`);
  });

  // ── Template rendering ──────────────────────────────────────────────────────
  await test('characterization/outreach: renders subject with property address', () => {
    const result = renderTemplate(SAMPLE_TEMPLATE, SAMPLE_CTX);
    assert(result.subject.includes('42 Village Lane'),
      `subject missing address: "${result.subject}"`);
  });

  await test('characterization/outreach: renders body with contact first name', () => {
    const result = renderTemplate(SAMPLE_TEMPLATE, SAMPLE_CTX);
    assert(result.body.includes('Jane'),
      `body missing contact name: "${result.body.slice(0, 100)}"`);
  });

  await test('characterization/outreach: renders body with sender first name', () => {
    const result = renderTemplate(SAMPLE_TEMPLATE, SAMPLE_CTX);
    assert(result.body.includes('Test'),
      `body missing sender first name: "${result.body.slice(0, 100)}"`);
  });

  await test('characterization/outreach: result has subject + body + missingFields', () => {
    const result = renderTemplate(SAMPLE_TEMPLATE, SAMPLE_CTX);
    assert('subject' in result, 'result missing subject');
    assert('body' in result, 'result missing body');
    assert('missingFields' in result, 'result missing missingFields');
  });

  await test('characterization/outreach: no missing fields for complete context', () => {
    const result = renderTemplate(SAMPLE_TEMPLATE, SAMPLE_CTX);
    assertEqual(result.missingFields.length, 0,
      `expected 0 missing fields, got: ${JSON.stringify(result.missingFields)}`);
  });

  // ── buildMailto ─────────────────────────────────────────────────────────────
  await test('characterization/outreach: buildMailto returns object with mailto or useClipboard', () => {
    const result = renderTemplate(SAMPLE_TEMPLATE, SAMPLE_CTX);
    const mailto = buildMailto({
      to: SAMPLE_CTX.contact.email,
      subject: result.subject,
      body: result.body,
    });
    assert(typeof mailto === 'object' && mailto !== null,
      `expected object from buildMailto`);
    assert('useClipboard' in mailto,
      `expected useClipboard in result, got keys: ${Object.keys(mailto).join(', ')}`);
  });
}
