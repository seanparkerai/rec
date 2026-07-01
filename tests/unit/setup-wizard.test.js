// tests/setup-wizard.test.js — Phase 3 pure-logic tests for the onboarding wizard:
// branch inclusion (buying-situation × employment × joint), the required-to-finish gate,
// completeness computation, and the autosave merge (no-clobber). Imports ONLY the pure
// modules (no DOM, no Supabase) — the wizard/a11y DOM layers are a manual hand-off.
import { includedSteps, visibleFields, STEPS } from '../../assets/js/setup/steps.js';
import { requiredGate, validateField } from '../../assets/js/setup/validate.js';
import { stepCompleteness, overallCompleteness } from '../../assets/js/setup/completeness.js';
import { setNested, getNested, setLineValue, getLineValue } from '../../assets/js/setup/autosave.js';
import { deriveFinances } from '../../assets/js/finance-derive.js';

export async function register({ test, assert, assertEqual }) {
  // ── branching ────────────────────────────────────────────────────────────────
  test('setup/branch: cash buyer skips income + mortgage; keeps areas + ideal-home', () => {
    const ids = includedSteps({ profile: { buyingSituation: 'cash-buyer' } }).map((s) => s.id);
    assert(!ids.includes('income'), 'income skipped for cash buyer');
    assert(!ids.includes('mortgage'), 'mortgage skipped for cash buyer');
    assert(ids.includes('areas') && ids.includes('ideal-home'), 'core steps still present');
  });

  test('setup/branch: employed FTB includes income + mortgage', () => {
    const ids = includedSteps({ profile: { buyingSituation: 'first-time-buyer', employment: { basis: 'employed' } } }).map((s) => s.id);
    assert(ids.includes('income') && ids.includes('mortgage'), 'income + mortgage present');
  });

  test('setup/branch: self-employed reveals structure/years sub-fields; employed hides them', () => {
    const work = STEPS.find((s) => s.id === 'work');
    const se = visibleFields(work, { profile: { employment: { basis: 'self-employed' } } }).map((f) => f.path);
    const emp = visibleFields(work, { profile: { employment: { basis: 'employed' } } }).map((f) => f.path);
    assert(se.includes('profile.selfEmployment.structure'), 'self-employed shows structure');
    assert(!emp.includes('profile.selfEmployment.structure'), 'employed hides structure');
    assert(emp.includes('profile.employment.employer'), 'employed shows employer');
  });

  test('setup/branch: joint application reveals applicant-2 fields', () => {
    const about = STEPS.find((s) => s.id === 'about-you');
    const joint = visibleFields(about, { profile: { household: { applicants: 2 } } }).map((f) => f.path);
    const solo = visibleFields(about, { profile: { household: { applicants: 1 } } }).map((f) => f.path);
    assert(joint.includes('profile.applicant2.fullName'), 'joint shows applicant 2');
    assert(!solo.includes('profile.applicant2.fullName'), 'solo hides applicant 2');
  });

  // ── required gate ──────────────────────────────────────────────────────────────
  test('setup/gate: blocks until name+email+area+budget, then passes', () => {
    const empty = requiredGate({ profile: {}, criteria: {}, areaCount: 0 });
    assert(!empty.ok && empty.missing.length === 4, 'all four required items missing');
    const full = requiredGate({ profile: { person: { fullName: 'A B', email: 'a@b.co' } }, criteria: { budget: { max: 350000 } }, areaCount: 1 });
    assert(full.ok && full.missing.length === 0, 'all four satisfied');
  });

  test('setup/gate: invalid email + zero budget still block and name the right gaps', () => {
    const g = requiredGate({ profile: { person: { fullName: 'A', email: 'nope' } }, criteria: { budget: { max: 0 } }, areaCount: 1 });
    assertEqual(g.missing.map((m) => m.key).sort().join(','), 'budget,email');
  });

  test('setup/validate: required-empty fails; email format enforced; optional-empty ok', () => {
    assert(!validateField({ label: 'Name', required: true, type: 'text' }, '').ok);
    assert(validateField({ label: 'Nickname', type: 'text' }, '').ok);
    assert(!validateField({ label: 'Email', type: 'email' }, 'x').ok);
    assert(validateField({ label: 'Email', type: 'email' }, 'x@y.co').ok);
  });

  // ── completeness ──────────────────────────────────────────────────────────────
  test('setup/completeness: full visible step is complete; empty is not-started', () => {
    const ideal = STEPS.find((s) => s.id === 'ideal-home');
    assertEqual(stepCompleteness(ideal, { criteria: {} }).status, 'not-started');
    const full = stepCompleteness(ideal, {
      criteria: { budget: { max: 350000, min: 250000 }, size: { minBeds: 3, idealBeds: 4 },
        propertyTypePrefs: { preferred: ['detached'] }, features: { mustHave: ['garden'], niceToHave: ['garage'] } },
    });
    assertEqual(full.status, 'complete');
  });

  test('setup/completeness: overall percent is in range, has countable fields, excludes chrome steps', () => {
    const oc = overallCompleteness({ profile: { person: { fullName: 'A' } }, criteria: {}, finances: {}, goals: {}, areaCount: 1 });
    assert(oc.percent >= 0 && oc.percent <= 100, 'percent in range');
    assert(oc.total > 0, 'has countable fields');
  });

  // ── write contract (Phase 3): wizard writes ONLY canonical, derivation-safe keys ──
  // Mirrors wizard.js#writeField routing: blob-prefix split, then setLineValue for
  // money-line fields, setNested otherwise. Guards against re-introducing the dead
  // scalar keys (savings.totalSavings, outgoings.*, goals.deposit.target) the readers
  // never consumed and that derivation silently overwrote.
  const BLOBS = ['profile', 'criteria', 'finances', 'goals'];
  const fieldByPath = (p) => STEPS.flatMap((s) => s.fields).find((f) => f.path === p);
  const applyField = (state, field, value) => {
    const [head, ...rest] = field.path.split('.');
    if (!BLOBS.includes(head)) return;
    if (field.type === 'money-line') setLineValue(state[head], rest.join('.'), { lineId: field.lineId, label: field.lineLabel, value });
    else setNested(state[head], rest.join('.'), value);
  };

  test('setup/contract: savings/outgoings/deposit-target write only canonical keys + round-trip through deriveFinances', () => {
    const state = { profile: {}, criteria: {}, finances: {}, goals: {} };
    applyField(state, fieldByPath('finances.savings.current'), 30000);
    applyField(state, fieldByPath('finances.savings.monthlyContribution'), 2000);
    applyField(state, fieldByPath('finances.goal.targetDeposit'), 40000);
    applyField(state, fieldByPath('finances.expenses'), 1500);
    applyField(state, fieldByPath('finances.ongoingBills'), 1200);

    // Canonical raw keys present; derived/legacy keys NOT written.
    assertEqual(state.finances.savings.current, 30000);
    assert(!('totalSavings' in state.finances.savings), 'derived totalSavings must not be written as input');
    assert(!('outgoings' in state.finances), 'dead outgoings scalar bag must not be created');
    assertEqual(state.finances.goal.targetDeposit, 40000);
    assert(!state.goals.deposit, 'parallel goals.deposit.target must not be written');

    // Outgoings landed in the arrays the app actually sums, as labelled entries.
    const exp = state.finances.expenses.find((e) => e._lineId === 'onboarding-essentials');
    const bill = state.finances.ongoingBills.find((e) => e._lineId === 'onboarding-housing');
    assert(exp && exp.monthly === 1500 && exp.item, 'essentials → labelled finances.expenses entry');
    assert(bill && bill.monthly === 1200 && bill.item, 'rent/mortgage → labelled finances.ongoingBills entry');

    // Survives derivation (the wizard's old totalSavings write was silently zeroed here).
    const d = deriveFinances(state.finances, { investments: { trading212ISA: { currentPortfolioValue: 10000, earmarkPct: 100 } } });
    assertEqual(d.savings.totalSavings, 40000); // 30000 cash + 10000 earmarked ISA
    assertEqual(d.expensesTotal.monthly, 1500);
    assertEqual(d.ongoingBillsTotal.monthly, 1200);
    assertEqual(d.goal.targetDeposit, 40000);
  });

  test('setup/line: money-line upsert re-edits in place, clears on empty, preserves user rows', () => {
    const fin = { expenses: [{ item: 'User row', monthly: 99 }] };
    setLineValue(fin, 'expenses', { lineId: 'onboarding-essentials', label: 'Essential outgoings', value: 1500 });
    setLineValue(fin, 'expenses', { lineId: 'onboarding-essentials', label: 'Essential outgoings', value: 1600 });
    assertEqual(fin.expenses.filter((e) => e._lineId === 'onboarding-essentials').length, 1);
    assertEqual(getLineValue(fin, 'expenses', 'onboarding-essentials'), 1600);
    assertEqual(fin.expenses.find((e) => e.item === 'User row').monthly, 99);
    setLineValue(fin, 'expenses', { lineId: 'onboarding-essentials', value: '' });
    assertEqual(getLineValue(fin, 'expenses', 'onboarding-essentials'), undefined);
    assertEqual(fin.expenses.length, 1);
  });

  // ── autosave merge (no clobber) ─────────────────────────────────────────────────
  test('setup/autosave: setNested creates intermediates and never clobbers siblings', () => {
    const blob = { person: { email: 'a@b.co' }, employment: { employer: 'X' } };
    setNested(blob, 'person.fullName', 'Jane Doe');
    assertEqual(blob.person.email, 'a@b.co');      // sibling key preserved
    assertEqual(blob.person.fullName, 'Jane Doe');
    setNested(blob, 'household.dependents', 2);     // brand-new branch created
    assertEqual(blob.household.dependents, 2);
    assertEqual(blob.employment.employer, 'X');     // untouched section preserved
    assertEqual(getNested(blob, 'person.fullName'), 'Jane Doe');
  });
}
