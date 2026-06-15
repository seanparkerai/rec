// profile-schema.js — the SINGLE canonical shape of the `profile` user-state blob,
// plus one tolerant normaliser that every reader/writer flows through.
//
// History: the profile blob was written and read in three incompatible ways —
//   • the onboarding wizard + the Application-detail card used a nested, structured
//     shape ({ person, employment:{…}, creditProfile:{…}, debts, pension });
//   • the "About you" editorial card used flat prose strings
//     ({ employment:"…", creditProfile:"…", household:"…", headline, … });
//   • outreach templates resolved flat convenience paths
//     (profile.firstName / lastName / mobile / email / postcode).
// Three live profiles each ended up in a different shape, so whichever reader
// disagreed with how a given profile was stored rendered blanks.
//
// This module unifies them. There is now ONE canonical schema (nested structured
// objects + a handful of editorial summary strings). Two entry points:
//   • canonicalProfile(raw)  → the STORAGE shape. Idempotent: canonical in ⇒ identical
//     out. Used by writers and by the data migration so every stored row is uniform.
//   • normalizeProfile(raw)  → canonicalProfile(raw) PLUS the flat convenience mirrors
//     (firstName/lastName/mobile/email/postcode) consumers like outreach expect.
//     Used by READERS.
//
// Tolerant of every historical shape, so it renders correctly even before a row is
// migrated. Pure (no DOM, no IO) so it runs in the Node test harness.

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const clean = (v) => (v === undefined || v === '' ? null : v);
const firstDefined = (...xs) => {
  for (const x of xs) if (x !== undefined && x !== null && x !== '') return x;
  return null;
};
const asArray = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : []);

function splitName(full) {
  const s = String(full || '').trim();
  if (!s) return { firstName: null, lastName: null };
  const parts = s.split(/\s+/);
  return { firstName: parts[0] || null, lastName: parts.length > 1 ? parts.slice(1).join(' ') : null };
}

// Flat keys the normaliser explicitly folds into the canonical structure. Anything
// NOT listed here (e.g. selfEmployment, insuranceAndProtection, healthFactors,
// consents, or future additions) is passed through verbatim so no data is lost.
const CONSUMED = new Set([
  '_SAMPLE', 'person', 'household', 'applicant2', 'employment', 'creditProfile', 'debts', 'pension',
  'name', 'firstName', 'lastName', 'email', 'mobile', 'phone', 'age', 'dateOfBirth', 'nationality',
  'residencyStatus', 'maritalStatus', 'currentAddress', 'dependents',
  'occupation', 'employer', 'employmentType', 'employmentLength', 'workArrangement', 'industry',
  'householdSummary', 'employmentSummary', 'creditSummary',
  'headline', 'buyers', 'lifestyle', 'notes', 'locationFocus', 'movingTimeline', 'currentLocation',
  'buyingSituation', 'priorities', 'dealBreakers',
]);

export function canonicalProfile(raw) {
  const p = isObj(raw) ? raw : {};
  const out = {};
  if (p._SAMPLE) out._SAMPLE = p._SAMPLE;

  // ── Editorial summary (freeform; no structured equivalent) ──
  out.headline = clean(p.headline);
  out.buyers = clean(p.buyers);
  out.lifestyle = clean(p.lifestyle);
  out.locationFocus = clean(p.locationFocus);
  out.movingTimeline = clean(p.movingTimeline);
  out.notes = clean(p.notes);
  out.currentLocation = clean(p.currentLocation);
  out.buyingSituation = clean(p.buyingSituation);
  out.priorities = asArray(p.priorities);
  out.dealBreakers = asArray(p.dealBreakers);

  // ── Person ──
  const rawPerson = isObj(p.person) ? p.person : {};
  const rawAddr = isObj(rawPerson.address) ? rawPerson.address
    : isObj(p.currentAddress) ? p.currentAddress : {};
  const fullName = firstDefined(rawPerson.fullName, p.name,
    [p.firstName, p.lastName].filter(Boolean).join(' ') || null);
  const named = splitName(fullName);
  out.person = {
    fullName,
    firstName: firstDefined(rawPerson.firstName, p.firstName, named.firstName),
    lastName: firstDefined(rawPerson.lastName, p.lastName, named.lastName),
    email: firstDefined(rawPerson.email, p.email),
    mobile: firstDefined(rawPerson.mobile, p.mobile, p.phone),
    dateOfBirth: firstDefined(rawPerson.dateOfBirth, p.dateOfBirth),
    age: firstDefined(rawPerson.age, p.age),
    nationality: firstDefined(rawPerson.nationality, p.nationality),
    residencyStatus: firstDefined(rawPerson.residencyStatus, p.residencyStatus),
    maritalStatus: firstDefined(rawPerson.maritalStatus, p.maritalStatus),
    address: {
      line1: firstDefined(rawAddr.line1),
      town: firstDefined(rawAddr.town),
      county: firstDefined(rawAddr.county),
      postcode: firstDefined(rawAddr.postcode),
    },
  };

  // ── Household ── (a flat `household` string is editorial → householdSummary)
  const rawHh = isObj(p.household) ? p.household : {};
  out.householdSummary = firstDefined(
    p.householdSummary,
    typeof p.household === 'string' ? p.household : null,
  );
  out.household = {
    applicants: firstDefined(rawHh.applicants),
    livingArrangement: firstDefined(rawHh.livingArrangement),
    dependents: firstDefined(rawHh.dependents, p.dependents),
    monthlyHouseholdContribution: firstDefined(rawHh.monthlyHouseholdContribution),
    recipientNote: firstDefined(rawHh.recipientNote),
    tenure: firstDefined(rawHh.tenure, rawAddr.tenure),
    monthlyRent: firstDefined(rawHh.monthlyRent, rawAddr.monthlyRent),
    livedSince: firstDefined(rawHh.livedSince, rawAddr.livedSince),
  };

  // ── Second applicant ──
  const rawA2 = isObj(p.applicant2) ? p.applicant2 : {};
  out.applicant2 = {
    fullName: firstDefined(rawA2.fullName),
    email: firstDefined(rawA2.email),
  };

  // ── Employment ── (a flat `employment` string is editorial → employmentSummary)
  const rawEmp = isObj(p.employment) ? p.employment : {};
  out.employmentSummary = firstDefined(
    p.employmentSummary,
    typeof p.employment === 'string' ? p.employment : null,
  );
  out.employment = {
    basis: firstDefined(rawEmp.basis),
    employer: firstDefined(rawEmp.employer, p.employer),
    role: firstDefined(rawEmp.role, p.occupation),
    type: firstDefined(rawEmp.type, p.employmentType),
    startDate: firstDefined(rawEmp.startDate),
    probationStatus: firstDefined(rawEmp.probationStatus),
    probationEndDate: firstDefined(rawEmp.probationEndDate),
    workPattern: firstDefined(rawEmp.workPattern, p.workArrangement),
    jobStability: firstDefined(rawEmp.jobStability),
    yearsInField: firstDefined(rawEmp.yearsInField, rawEmp.tenureYears, p.employmentLength),
    industry: firstDefined(rawEmp.industry, p.industry),
  };

  // ── Credit ── (a flat `creditProfile` string is editorial → creditSummary)
  const rawCr = isObj(p.creditProfile) ? p.creditProfile : {};
  out.creditSummary = firstDefined(
    p.creditSummary,
    typeof p.creditProfile === 'string' ? p.creditProfile : null,
  );
  const adverseFromSummary = out.creditSummary && /no adverse|excellent|clean/i.test(out.creditSummary)
    ? false : null;
  out.creditProfile = {
    scoresChecked: firstDefined(rawCr.scoresChecked),
    experianScore: firstDefined(rawCr.experianScore),
    equifaxScore: firstDefined(rawCr.equifaxScore),
    transUnionScore: firstDefined(rawCr.transUnionScore),
    experianCheckDate: firstDefined(rawCr.experianCheckDate),
    equifaxCheckDate: firstDefined(rawCr.equifaxCheckDate),
    transUnionCheckDate: firstDefined(rawCr.transUnionCheckDate),
    onElectoralRoll: firstDefined(rawCr.onElectoralRoll),
    adverseHistory: rawCr.adverseHistory != null ? rawCr.adverseHistory : adverseFromSummary,
    oldestActiveCreditYears: firstDefined(rawCr.oldestActiveCreditYears),
    _followUp: firstDefined(rawCr._followUp),
  };

  // ── Debts ── (passthrough-structured; tolerant of a missing object)
  const rawDebts = isObj(p.debts) ? p.debts : {};
  out.debts = {
    creditCards: asArray(rawDebts.creditCards),
    studentLoan: rawDebts.studentLoan ?? null,
    carFinance: firstDefined(rawDebts.carFinance),
    creditCardsBalance: firstDefined(rawDebts.creditCardsBalance),
    personalLoans: asArray(rawDebts.personalLoans),
    buyNowPayLater: asArray(rawDebts.buyNowPayLater),
    regularOverdraft: rawDebts.regularOverdraft === true,
  };

  // ── Pension ──
  out.pension = isObj(p.pension) ? { ...p.pension } : {};

  // ── Forward-compatible passthrough for any unconsumed keys (selfEmployment,
  //    insuranceAndProtection, healthFactors, consents, future fields). ──
  for (const k of Object.keys(p)) {
    if (!CONSUMED.has(k) && out[k] === undefined) out[k] = p[k];
  }

  return out;
}

/**
 * Reader-facing normaliser: canonical shape + flat convenience mirrors that
 * outreach templates and other flat consumers resolve (profile.firstName, …).
 */
export function normalizeProfile(raw) {
  const c = canonicalProfile(raw);
  c.firstName = c.person.firstName;
  c.lastName = c.person.lastName;
  c.mobile = c.person.mobile;
  c.email = c.person.email;
  c.postcode = c.person.address?.postcode ?? null;
  return c;
}

// ── Display helpers — derive a human string for the "About you" editorial rows
//    from the structured data when no freeform summary was entered. ──
export function employmentDisplay(p) {
  if (!isObj(p)) return null;
  if (p.employmentSummary) return p.employmentSummary;
  const e = p.employment || {};
  if (e.role || e.employer) {
    return [e.role, e.employer && `at ${e.employer}`, e.type && `— ${e.type}`].filter(Boolean).join(' ');
  }
  const BASIS = { employed: 'Employed', 'self-employed': 'Self-employed', retired: 'Retired', 'not-working': 'Not currently working' };
  return e.basis ? (BASIS[e.basis] || e.basis) : null;
}

export function creditDisplay(p) {
  if (!isObj(p)) return null;
  if (p.creditSummary) return p.creditSummary;
  const c = p.creditProfile || {};
  const scores = [c.experianScore && `Experian ${c.experianScore}`, c.equifaxScore && `Equifax ${c.equifaxScore}`, c.transUnionScore && `TransUnion ${c.transUnionScore}`].filter(Boolean);
  if (scores.length) return scores.join(' · ');
  if (c.adverseHistory === false) return 'No adverse history';
  if (c.adverseHistory === true) return 'Adverse history present';
  return null;
}

export function householdDisplay(p) {
  if (!isObj(p)) return null;
  if (p.householdSummary) return p.householdSummary;
  const h = p.household || {};
  const bits = [];
  if (h.applicants === 2 || h.applicants === '2') bits.push('Joint application');
  else if (h.applicants === 1 || h.applicants === '1') bits.push('Solo application');
  const LIVING = { renting: 'Renting', 'with-family': 'Living with family', 'own-home': 'Own home', other: 'Other' };
  if (h.livingArrangement) bits.push(LIVING[h.livingArrangement] || h.livingArrangement);
  if (h.dependents != null) bits.push(`${h.dependents} dependent${Number(h.dependents) === 1 ? '' : 's'}`);
  return bits.length ? bits.join(' · ') : null;
}
