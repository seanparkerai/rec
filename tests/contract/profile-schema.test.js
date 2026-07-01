// profile-schema.test.js — the canonical profile normaliser maps every historical
// shape (flat-full, nested, summary-only) into one consistent structure, is
// idempotent, exposes the flat outreach mirrors, and never loses data.
// Synthetic fixtures only — no real user data.

import { canonicalProfile, normalizeProfile, employmentDisplay, creditDisplay } from '../../assets/js/profile-schema.js';

// Mirrors the flat-full shape (demo-style): everything at the top level.
const FLAT_FULL = {
  name: 'Sample Person', firstName: 'Sample', lastName: 'Person',
  email: 'sample@example.com', phone: '07000 000000', dateOfBirth: '1990-01-01',
  nationality: 'British', residencyStatus: 'UK Citizen', maritalStatus: 'Single',
  currentAddress: { line1: '1 Test St', town: 'Testville', county: 'Testshire', postcode: 'TT1 1TT', tenure: 'Renting', monthlyRent: 1000 },
  household: 'No dependents', dependents: 0,
  employer: 'Test Co', occupation: 'Engineer', employmentType: 'Permanent', employmentLength: '3 years', workArrangement: 'Remote',
  employment: 'Engineer at Test Co — permanent', creditProfile: 'Excellent (no adverse history)',
  headline: 'A headline', buyers: 'Solo buyer', priorities: ['x'], dealBreakers: ['y'], locationFocus: 'Testshire',
};

// Nested wizard shape (partial).
const NESTED = {
  person: { fullName: 'Nested Name', email: 'n@example.com', address: { town: 'Town', line1: '2 Rd', postcode: 'NN2 2NN' } },
  household: { applicants: 2, livingArrangement: 'own-home' },
  applicant2: { fullName: 'Second Name' },
  employment: { basis: 'retired' },
  buyingSituation: 'home-mover',
};

// Summary-only shape (editorial fields, no structured detail).
const SUMMARY_ONLY = {
  notes: 'n', buyers: 'Solo', headline: 'h', household: 'No dependents', lifestyle: 'l',
  employment: 'Permanent — £64k', priorities: ['a'], dealBreakers: ['b'],
  creditProfile: 'Excellent (no adverse history)', locationFocus: 'Hampshire', movingTimeline: '2026',
};

export async function register({ test, assert, assertEqual }) {
  test('canonical: flat-full folds into nested person/employment/household', () => {
    const c = canonicalProfile(FLAT_FULL);
    assertEqual(c.person.fullName, 'Sample Person');
    assertEqual(c.person.firstName, 'Sample');
    assertEqual(c.person.mobile, '07000 000000');
    assertEqual(c.person.address.postcode, 'TT1 1TT');
    assertEqual(c.household.tenure, 'Renting');
    assertEqual(c.household.monthlyRent, 1000);
    assertEqual(c.household.dependents, 0);
    assertEqual(c.employment.employer, 'Test Co');
    assertEqual(c.employment.role, 'Engineer');
    assertEqual(c.employment.workPattern, 'Remote');
    // The flat prose strings become editorial summaries, not structured-object clobbers.
    assertEqual(c.employmentSummary, 'Engineer at Test Co — permanent');
    assertEqual(c.creditSummary, 'Excellent (no adverse history)');
    assertEqual(c.householdSummary, 'No dependents');
    // A "no adverse" summary derives the adverse-history flag.
    assertEqual(c.creditProfile.adverseHistory, false);
  });

  test('canonical: nested shape is preserved and name is split', () => {
    const c = canonicalProfile(NESTED);
    assertEqual(c.person.fullName, 'Nested Name');
    assertEqual(c.person.firstName, 'Nested');
    assertEqual(c.person.lastName, 'Name');
    assertEqual(c.household.applicants, 2);
    assertEqual(c.applicant2.fullName, 'Second Name');
    assertEqual(c.employment.basis, 'retired');
    assertEqual(c.buyingSituation, 'home-mover');
  });

  test('canonical: summary-only shape keeps editorial strings, leaves structure empty', () => {
    const c = canonicalProfile(SUMMARY_ONLY);
    assertEqual(c.employmentSummary, 'Permanent — £64k');
    assertEqual(c.creditSummary, 'Excellent (no adverse history)');
    assertEqual(c.person.fullName, null);
    assertEqual(c.employment.employer, null);
    assert(Array.isArray(c.priorities) && c.priorities.length === 1, 'priorities preserved');
  });

  test('idempotent: canonical(canonical(x)) deep-equals canonical(x) for every shape', () => {
    for (const raw of [FLAT_FULL, NESTED, SUMMARY_ONLY, {}, null]) {
      const once = canonicalProfile(raw);
      const twice = canonicalProfile(once);
      assertEqual(JSON.stringify(twice), JSON.stringify(once), 'normaliser must be idempotent');
    }
  });

  test('normalizeProfile: adds flat outreach mirrors derived from person', () => {
    const n = normalizeProfile(FLAT_FULL);
    assertEqual(n.firstName, 'Sample');
    assertEqual(n.lastName, 'Person');
    assertEqual(n.mobile, '07000 000000');
    assertEqual(n.email, 'sample@example.com');
    assertEqual(n.postcode, 'TT1 1TT');
    // Mirrors derive even for a nested profile that never had top-level flats.
    const n2 = normalizeProfile(NESTED);
    assertEqual(n2.firstName, 'Nested');
    assertEqual(n2.postcode, 'NN2 2NN');
  });

  test('_SAMPLE marker survives normalisation (data-guard depends on it)', () => {
    const c = canonicalProfile({ _SAMPLE: 'x', name: 'A B' });
    assertEqual(c._SAMPLE, 'x');
  });

  test('display helpers derive a string from structure when no summary exists', () => {
    assertEqual(employmentDisplay(canonicalProfile(NESTED)), 'Retired');
    assertEqual(employmentDisplay(canonicalProfile(FLAT_FULL)), 'Engineer at Test Co — permanent');
    assertEqual(creditDisplay(canonicalProfile({ creditProfile: { adverseHistory: false } })), 'No adverse history');
  });

  test('forward-compat: unconsumed keys pass through untouched', () => {
    const c = canonicalProfile({ name: 'A B', healthFactors: { notes: 'keep me' }, consents: { health: { granted: true } } });
    assertEqual(c.healthFactors.notes, 'keep me');
    assertEqual(c.consents.health.granted, true);
  });
}
