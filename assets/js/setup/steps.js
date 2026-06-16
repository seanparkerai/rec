// setup/steps.js — declarative step + field definitions for the onboarding wizard,
// plus the branching logic. PURE DATA + pure predicates (no DOM, no IO), so the branch
// matrix, required gate and completeness are all unit-testable in the Node harness.
//
// A field's `path` is dotted and BLOB-PREFIXED: its first segment selects the target
// user-state blob (`profile` | `criteria` | `finances` | `goals`), the rest is the
// nested path within it (e.g. 'profile.person.fullName'). The wizard reads/writes the
// blob via the matching storage accessor (getProfile/saveProfile, …). The `areas` step
// is special — it writes household_areas via place-lookup, not a blob path.

// ── Axis A — buying situation. Drives which money/mortgage questions appear. ──
export const BUYING_SITUATIONS = [
  { value: 'first-time-buyer',  label: 'First-time buyer' },
  { value: 'home-mover',        label: 'Home mover (selling to buy)' },
  { value: 'existing-mortgage', label: 'Porting / remortgaging' },
  { value: 'later-life',        label: 'Later-life / retirement purchase' },
  { value: 'cash-buyer',        label: 'Cash buyer (no mortgage)' },
  { value: 'investor',          label: 'Buy-to-let / investor' },
];

// ── Axis B — employment basis. Drives income evidence + self-employed sub-branch. ──
export const EMPLOYMENT_BASES = [
  { value: 'employed',      label: 'Employed (PAYE)' },
  { value: 'self-employed', label: 'Self-employed' },
  { value: 'retired',       label: 'Retired' },
  { value: 'not-working',   label: 'Not currently working' },
];

export const SELF_EMPLOYMENT_STRUCTURES = [
  { value: 'sole-trader',   label: 'Sole trader' },
  { value: 'partnership',   label: 'Partnership' },
  { value: 'ltd-director',  label: 'Ltd company director' },
  { value: 'contractor',    label: 'Contractor / day-rate' },
];

const isCashBuyer = (s) => s?.profile?.buyingSituation === 'cash-buyer';
const isJoint = (s) => s?.profile?.household?.applicants === 2 || s?.profile?.household?.applicants === '2';
const basis = (s) => s?.profile?.employment?.basis;
const isEmployed = (s) => basis(s) === 'employed';
const isSelfEmployed = (s) => basis(s) === 'self-employed';
const worksForIncome = (s) => isEmployed(s) || isSelfEmployed(s);

// Each step: { id, title, intro?, fields, include?(state), sensitive? }.
// A field: { path, label, type, options?, inputmode?, help?, required?, placeholder?, when?(state) }.
export const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome',
    intro: 'A few questions so the app can tailor your search and your mortgage picture. Only your name, email, one area and a maximum budget are required — everything else is optional and you can stop and come back any time.',
    fields: [
      { path: 'profile.buyingSituation', label: 'Which best describes you?', type: 'select', options: BUYING_SITUATIONS, help: 'Shapes the money questions you’ll be asked.' },
    ],
  },
  {
    id: 'about-you',
    title: 'About you',
    fields: [
      { path: 'profile.person.fullName', label: 'Full name', type: 'text', required: true, placeholder: 'First and last name' },
      { path: 'profile.person.email', label: 'Email', type: 'email', required: true, inputmode: 'email', placeholder: 'you@example.com' },
      { path: 'profile.person.dateOfBirth', label: 'Date of birth', type: 'date' },
      { path: 'profile.person.nationality', label: 'Nationality', type: 'text' },
      { path: 'profile.person.address.line1', label: 'Current address', type: 'text', placeholder: 'House / street' },
      { path: 'profile.person.address.town', label: 'Town', type: 'text' },
      { path: 'profile.person.address.postcode', label: 'Postcode', type: 'text' },
      { path: 'profile.household.applicants', label: 'Buying with someone?', type: 'select', options: [{ value: 1, label: 'Just me' }, { value: 2, label: 'Joint application' }] },
      { path: 'profile.household.livingArrangement', label: 'Current living arrangement', type: 'select', options: [
        { value: 'renting', label: 'Renting' }, { value: 'with-family', label: 'Living with family' },
        { value: 'own-home', label: 'Own my home' }, { value: 'other', label: 'Other' }] },
      { path: 'profile.household.dependents', label: 'Dependents', type: 'number', inputmode: 'numeric' },
      // Joint applicant 2 — only when a joint application is selected.
      { path: 'profile.applicant2.fullName', label: 'Second applicant — full name', type: 'text', when: isJoint },
      { path: 'profile.applicant2.email', label: 'Second applicant — email', type: 'email', inputmode: 'email', when: isJoint },
    ],
  },
  {
    id: 'work',
    title: 'Work',
    fields: [
      { path: 'profile.employment.basis', label: 'Employment basis', type: 'select', options: EMPLOYMENT_BASES },
      { path: 'profile.employment.employer', label: 'Employer', type: 'text', when: isEmployed },
      { path: 'profile.employment.role', label: 'Job title', type: 'text', when: isEmployed },
      { path: 'profile.employment.startDate', label: 'Start date', type: 'date', when: isEmployed },
      { path: 'profile.employment.probationStatus', label: 'Probation', type: 'select', when: isEmployed, options: [
        { value: 'passed', label: 'Passed' }, { value: 'in-progress', label: 'In progress' }, { value: 'n/a', label: 'Not applicable' }] },
      // Self-employed sub-branch.
      { path: 'profile.selfEmployment.structure', label: 'Business structure', type: 'select', options: SELF_EMPLOYMENT_STRUCTURES, when: isSelfEmployed },
      { path: 'profile.selfEmployment.yearsTrading', label: 'Years trading', type: 'number', inputmode: 'numeric', when: isSelfEmployed, help: 'Most lenders want 2+ years of accounts / SA302s.' },
      { path: 'profile.selfEmployment.accountsPrepared', label: 'Accountant-prepared accounts?', type: 'select', when: isSelfEmployed, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
    ],
  },
  {
    id: 'income',
    title: 'Income',
    include: (s) => !isCashBuyer(s),
    fields: [
      { path: 'finances.income.grossAnnual', label: 'Gross annual income', type: 'currency', inputmode: 'numeric', help: 'Before tax. Used for an indicative borrowing estimate only.' },
      { path: 'finances.income.netMonthly', label: 'Net monthly income', type: 'currency', inputmode: 'numeric', when: worksForIncome },
      { path: 'finances.income.bonusAnnual', label: 'Annual bonus / overtime', type: 'currency', inputmode: 'numeric', when: worksForIncome },
      { path: 'finances.income.pensionAnnual', label: 'Pension income (annual)', type: 'currency', inputmode: 'numeric', when: (s) => basis(s) === 'retired' || s?.profile?.buyingSituation === 'later-life' },
      { path: 'finances.income.applicant2GrossAnnual', label: 'Second applicant — gross annual', type: 'currency', inputmode: 'numeric', when: isJoint },
    ],
  },
  {
    id: 'outgoings-debts',
    title: 'Outgoings & debts',
    fields: [
      // money-line fields land in the arrays the app actually sums (finances.expenses /
      // ongoingBills as { item, monthly, annual }), as a single re-editable labelled entry —
      // NOT the dead scalar keys (monthlyEssentials/rentOrMortgage) no reader consumed.
      { path: 'finances.expenses', type: 'money-line', lineId: 'onboarding-essentials', lineLabel: 'Essential outgoings', label: 'Monthly essential outgoings', inputmode: 'numeric', help: 'Bills, food, transport, childcare.' },
      { path: 'finances.ongoingBills', type: 'money-line', lineId: 'onboarding-housing', lineLabel: 'Current rent / mortgage', label: 'Current rent / mortgage (monthly)', inputmode: 'numeric' },
      { path: 'profile.debts.studentLoan.plan', label: 'Student loan plan', type: 'select', options: [
        { value: '', label: 'None' }, { value: 'Plan 1', label: 'Plan 1' }, { value: 'Plan 2', label: 'Plan 2' },
        { value: 'Plan 4', label: 'Plan 4' }, { value: 'Plan 5', label: 'Plan 5' }, { value: 'Postgraduate', label: 'Postgraduate' }] },
      { path: 'profile.debts.creditCardsBalance', label: 'Total credit-card balance', type: 'currency', inputmode: 'numeric' },
      { path: 'profile.debts.carFinance', label: 'Car finance (monthly)', type: 'currency', inputmode: 'numeric' },
      { path: 'profile.debts.regularOverdraft', label: 'Regularly use an overdraft?', type: 'select', options: [{ value: false, label: 'No' }, { value: true, label: 'Yes' }] },
    ],
  },
  {
    id: 'savings-deposit',
    title: 'Savings & deposit',
    fields: [
      // Raw cash savings → savings.current (the canonical key deriveFinances reads).
      // totalSavings is DERIVED (cash + earmarked ISA) and must never be written as input,
      // or it is silently overwritten on the next read. An ISA deposit is captured separately.
      { path: 'finances.savings.current', label: 'Total cash savings to date', type: 'currency', inputmode: 'numeric', help: 'Cash held outside investment accounts. ISA/investment savings are captured separately.' },
      { path: 'finances.savings.monthlyContribution', label: 'Saving per month', type: 'currency', inputmode: 'numeric' },
      // Single source for the deposit target — finances.goal.targetDeposit (finance-derive.js).
      { path: 'finances.goal.targetDeposit', label: 'Deposit target', type: 'currency', inputmode: 'numeric', help: 'How much you’re aiming to put down.' },
      { path: 'finances.savings.lisaBalance', label: 'Lifetime ISA balance', type: 'currency', inputmode: 'numeric', when: (s) => s?.profile?.buyingSituation === 'first-time-buyer' },
    ],
  },
  {
    id: 'mortgage',
    title: 'Mortgage & affordability',
    include: (s) => !isCashBuyer(s),
    intro: 'These figures produce an INDICATIVE borrowing range only (roughly 4–4.5× income, stress-tested ~3% above the rate). It is an estimate to orient your search — not mortgage advice.',
    fields: [
      { path: 'criteria.mortgage.ratePctAssumed', label: 'Assumed interest rate (%)', type: 'number', inputmode: 'decimal' },
      { path: 'criteria.mortgage.termYears', label: 'Term (years)', type: 'number', inputmode: 'numeric' },
      { path: 'criteria.mortgage.ltvRange', label: 'Target LTV', type: 'text', placeholder: 'e.g. 90%' },
      { path: 'goals.mortgage.depositPct', label: 'Deposit as % of price', type: 'number', inputmode: 'numeric' },
    ],
  },
  {
    id: 'ideal-home',
    title: 'Your ideal home',
    fields: [
      { path: 'criteria.budget.max', label: 'Maximum budget', type: 'currency', inputmode: 'numeric', required: true, help: 'Hard ceiling — listings above this are cut.' },
      { path: 'criteria.budget.min', label: 'Minimum budget', type: 'currency', inputmode: 'numeric' },
      { path: 'criteria.size.minBeds', label: 'Minimum bedrooms', type: 'number', inputmode: 'numeric' },
      { path: 'criteria.size.idealBeds', label: 'Ideal bedrooms', type: 'number', inputmode: 'numeric' },
      { path: 'criteria.propertyTypePrefs.preferred', label: 'Preferred property types', type: 'list', help: 'Detached, semi, bungalow, cottage…' },
      { path: 'criteria.features.mustHave', label: 'Must-have features (deal-breakers)', type: 'list', help: 'Garden, parking, garage, home office…' },
      { path: 'criteria.features.niceToHave', label: 'Nice-to-have features', type: 'list' },
    ],
  },
  {
    id: 'areas',
    title: 'Areas',
    intro: 'Add at least one place you’d like to live. We match it to our researched villages where we can, or create a placeholder we can enrich later.',
    fields: [
      { path: '@areas', label: 'Search a village, town or postcode', type: 'area-lookup', required: true },
      { path: 'criteria.areaCriteria.maxCommuteMins', label: 'Max commute (minutes)', type: 'number', inputmode: 'numeric' },
    ],
  },
  {
    id: 'sensitive',
    title: 'Credit, pension & protection',
    sensitive: true,
    intro: 'All optional and grouped here so you can skip it. Sensitive figures are minimised and never required to finish.',
    fields: [
      { path: 'profile.creditProfile.onElectoralRoll', label: 'On the electoral roll?', type: 'select', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }] },
      { path: 'profile.creditProfile.adverseHistory', label: 'Any adverse credit history?', type: 'select', options: [{ value: false, label: 'No' }, { value: true, label: 'Yes' }] },
      { path: 'profile.pension.workplacePensionStatus', label: 'Workplace pension', type: 'select', when: (s) => !isCashBuyer(s), options: [
        { value: 'enrolled', label: 'Enrolled' }, { value: 'opted-out', label: 'Opted out' }, { value: 'none', label: 'None' }] },
      { path: 'profile.insuranceAndProtection.lifeCover', label: 'Have life cover / protection?', type: 'select', options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }] },
      // Special-category health data: behind explicit, withdrawable consent (UK GDPR).
      { path: '@health-consent', label: 'Share health factors that affect protection/mortgage? (optional, special-category data)', type: 'consent' },
      { path: 'profile.healthFactors.notes', label: 'Health factors (only if relevant)', type: 'textarea', when: (s) => s?.profile?.consents?.health?.granted === true },
    ],
  },
  {
    id: 'review',
    title: 'Review & finish',
    intro: 'Here’s what you’ve captured. Anything left blank is fine — fill gaps now or later from Your Profile.',
    fields: [],
  },
];

// The steps included for the current state (axes drive inclusion).
export function includedSteps(state) {
  return STEPS.filter((step) => (typeof step.include === 'function' ? step.include(state) : true));
}

// The fields shown for a step given the current state (per-field `when` predicate).
export function visibleFields(step, state) {
  return (step.fields || []).filter((f) => (typeof f.when === 'function' ? f.when(state) : true));
}
