// tests/unit/field-engine-branch-matrix.test.js — step 8.4: the field engine's FULL
// branch matrix made executable. setup/steps.js drives both onboarding and the live
// profile page (page-profile-detail.js renders these same steps through the shared
// field engine), so "which fields does state X see" is a product behaviour, not a
// wizard leftover. The existing setup-wizard suite spot-pins four branches; this suite
// sweeps every buying-situation × employment-basis combination and asserts the exact
// conditional inventory, so a predicate edit that silently widens or narrows a branch
// fails by name.
//
// Observed-and-accepted (documented, not asserted): hiding a field does NOT purge its
// previously-saved value from the blob — autosave writes only dirty paths, so a user
// who flips employment basis keeps their old self-employment answers in Supabase,
// invisible but persisted. That is data-safety by design (flip back = answers return);
// any future "purge on hide" is a deliberate product change, not a bug fix here.
import {
  STEPS, includedSteps, visibleFields, BUYING_SITUATIONS, EMPLOYMENT_BASES,
} from '../../assets/js/setup/steps.js';

export async function register({ test, assert, assertEqual }) {
  const SITUATIONS = BUYING_SITUATIONS.map((o) => o.value);
  const BASES = EMPLOYMENT_BASES.map((o) => o.value);
  const state = ({ situation, basisValue, applicants = 1, healthConsent = false } = {}) => ({
    profile: {
      ...(situation ? { buyingSituation: situation } : {}),
      ...(basisValue ? { employment: { basis: basisValue } } : {}),
      household: { applicants },
      consents: { health: { granted: healthConsent } },
    },
  });
  const stepById = (id) => STEPS.find((s) => s.id === id);
  const visiblePaths = (id, s) => visibleFields(stepById(id), s).map((f) => f.path);

  test('branch-matrix: step inclusion — income + mortgage vanish for cash buyers ONLY', () => {
    for (const situation of SITUATIONS) {
      const ids = includedSteps(state({ situation })).map((s) => s.id);
      const expectGone = situation === 'cash-buyer';
      assertEqual(!ids.includes('income'), expectGone, `${situation}: income inclusion`);
      assertEqual(!ids.includes('mortgage'), expectGone, `${situation}: mortgage inclusion`);
      for (const always of ['welcome', 'about-you', 'work', 'outgoings-debts', 'savings-deposit',
        'ideal-home', 'areas', 'sensitive', 'review']) {
        assert(ids.includes(always), `${situation}: ${always} always included`);
      }
    }
    // No situation set at all → everything included (cold start sees the full flow).
    assertEqual(includedSteps(state()).length, STEPS.length, 'cold start includes every step');
  });

  test('branch-matrix: work step — employed and self-employed sub-branches are exclusive', () => {
    const EMPLOYED_ONLY = ['profile.employment.employer', 'profile.employment.role',
      'profile.employment.startDate', 'profile.employment.probationStatus'];
    const SELF_ONLY = ['profile.selfEmployment.structure', 'profile.selfEmployment.yearsTrading',
      'profile.selfEmployment.accountsPrepared'];
    for (const basisValue of BASES) {
      const paths = visiblePaths('work', state({ basisValue }));
      for (const p of EMPLOYED_ONLY) {
        assertEqual(paths.includes(p), basisValue === 'employed', `${basisValue}: ${p}`);
      }
      for (const p of SELF_ONLY) {
        assertEqual(paths.includes(p), basisValue === 'self-employed', `${basisValue}: ${p}`);
      }
      assert(paths.includes('profile.employment.basis'), `${basisValue}: the axis field itself always shows`);
    }
  });

  test('branch-matrix: income step — earned/pension/joint fields across every situation × basis', () => {
    for (const situation of SITUATIONS.filter((s) => s !== 'cash-buyer')) {
      for (const basisValue of BASES) {
        const paths = visiblePaths('income', state({ situation, basisValue }));
        const works = basisValue === 'employed' || basisValue === 'self-employed';
        assertEqual(paths.includes('finances.income.netMonthly'), works,
          `${situation}/${basisValue}: netMonthly iff working`);
        assertEqual(paths.includes('finances.income.bonusAnnual'), works,
          `${situation}/${basisValue}: bonus iff working`);
        const pension = basisValue === 'retired' || situation === 'later-life';
        assertEqual(paths.includes('finances.income.pensionAnnual'), pension,
          `${situation}/${basisValue}: pension iff retired basis OR later-life purchase`);
        assert(paths.includes('finances.income.grossAnnual'),
          `${situation}/${basisValue}: gross annual always asked`);
        assert(!paths.includes('finances.income.applicant2GrossAnnual'),
          `${situation}/${basisValue}: no applicant-2 income when buying alone`);
      }
    }
  });

  test('branch-matrix: joint application — applicant-2 fields track applicants (2 and "2" alike)', () => {
    for (const applicants of [2, '2']) {
      const s = state({ situation: 'first-time-buyer', basisValue: 'employed', applicants });
      assert(visiblePaths('about-you', s).includes('profile.applicant2.fullName'),
        `applicants=${JSON.stringify(applicants)}: applicant-2 name shows`);
      assert(visiblePaths('about-you', s).includes('profile.applicant2.email'),
        `applicants=${JSON.stringify(applicants)}: applicant-2 email shows`);
      assert(visiblePaths('income', s).includes('finances.income.applicant2GrossAnnual'),
        `applicants=${JSON.stringify(applicants)}: applicant-2 income shows`);
    }
    const solo = state({ situation: 'first-time-buyer', applicants: 1 });
    assert(!visiblePaths('about-you', solo).includes('profile.applicant2.fullName'),
      'solo application hides applicant-2');
  });

  test('branch-matrix: LISA balance is a first-time-buyer-only field', () => {
    for (const situation of SITUATIONS) {
      const paths = visiblePaths('savings-deposit', state({ situation }));
      assertEqual(paths.includes('finances.savings.lisaBalance'), situation === 'first-time-buyer',
        `${situation}: LISA field`);
      assert(paths.includes('finances.savings.current'), `${situation}: cash savings always asked`);
    }
  });

  test('branch-matrix: sensitive step — pension hidden for cash buyers; health notes gated on consent', () => {
    for (const situation of SITUATIONS) {
      const paths = visiblePaths('sensitive', state({ situation }));
      assertEqual(paths.includes('profile.pension.workplacePensionStatus'), situation !== 'cash-buyer',
        `${situation}: workplace pension iff a mortgage is in play`);
      assert(!paths.includes('profile.healthFactors.notes'), `${situation}: health notes need consent`);
    }
    const consented = state({ situation: 'first-time-buyer', healthConsent: true });
    assert(visiblePaths('sensitive', consented).includes('profile.healthFactors.notes'),
      'granted consent reveals the health-notes field');
    assert(visiblePaths('sensitive', consented).includes('@health-consent'),
      'the consent control itself is always visible (withdrawable, UK GDPR)');
  });
}
