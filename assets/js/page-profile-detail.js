// page-profile-detail.js — read-only view of the profile (from Supabase via storage.js).
// Renders person, employment, credit, debts, pension + followup checklist.
// Anchor: Stripe-docs editorial article (restrained, field-list layout).

import { getProfile } from './storage.js';
import { normalizeProfile } from './profile-schema.js';
import { esc, byId as $, setText as _setText, setHTML } from './dom.js';

const setText = (id, v) => _setText(id, v, { fallback: '—' });
const gbp = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n || 0);
const nullish = (v) => v === null || v === undefined;
const orDash = (v) => nullish(v) ? '<span class="muted">not yet captured</span>' : esc(String(v));

const LIVING = { renting: 'Renting', 'with-family': 'Living with family', 'own-home': 'Own home', other: 'Other' };

async function init() {
  let profile;
  try { profile = await getProfile(); } catch (e) {
    console.error('profile load error', e);
    return;
  }

  // One canonical shape (profile-schema.js) — every historical layout is folded in,
  // so each renderer reads a single, predictable structure.
  profile = normalizeProfile(profile);

  renderPerson(profile);
  renderEmployment(profile);
  renderCredit(profile);
  renderDebts(profile);
  renderPension(profile);
  renderFollowUp(profile);
}

function renderPerson(p) {
  const person = p.person ?? {};
  const addr = person.address ?? {};
  const hh = p.household ?? {};

  setText('p-name', person.fullName);
  setText('p-dob', person.dateOfBirth);
  setText('p-email', person.email);
  setText('p-address', [addr.line1, addr.town, addr.county, addr.postcode].filter(Boolean).join(', '));
  setText('p-nationality', person.nationality ?? person.residencyStatus);
  setText('p-living', LIVING[hh.livingArrangement] ?? hh.livingArrangement ?? hh.tenure ?? person.maritalStatus);

  setText('p-dependents', hh.dependents != null ? String(hh.dependents) : null);

  const contrib = hh.monthlyHouseholdContribution;
  if (contrib) {
    setText('p-contribution', `${gbp(contrib)}/mo${hh.recipientNote ? ` — ${hh.recipientNote}` : ''}`);
  } else if (hh.monthlyRent) {
    setText('p-contribution', `${gbp(hh.monthlyRent)}/mo — current rent`);
  } else {
    setText('p-contribution', null);
  }
}

function renderEmployment(p) {
  const emp = p.employment ?? {};
  setText('p-employer', emp.employer);
  setText('p-role', emp.role);
  setText('p-startdate', emp.startDate);
  setText('p-emptype', emp.type);

  const prob = emp.probationStatus
    ? `${emp.probationStatus}${emp.probationEndDate ? ` (ended ${emp.probationEndDate})` : ''}`
    : null;
  setText('p-probation', prob);
  setText('p-workpattern', emp.workPattern);
  setText('p-stability', emp.jobStability);
  setText('p-yearsfield', emp.yearsInField != null ? String(emp.yearsInField) : null);
}

function renderCredit(p) {
  const cr = p.creditProfile ?? {};
  const summary = p.creditSummary || null;

  const note = $('p-credit-note');
  if (note) {
    note.textContent = cr._followUp ?? summary ?? '';
  }

  // adverseHistory is a boolean when captured; render it as words. Fall back to the
  // editorial summary's derived flag.
  const adverse = cr.adverseHistory === true ? 'Adverse history present'
    : cr.adverseHistory === false ? 'None reported'
    : null;

  setHTML('p-experian',   orDash(cr.experianScore));
  setHTML('p-equifax',    orDash(cr.equifaxScore));
  setHTML('p-transunion', orDash(cr.transUnionScore));
  setHTML('p-electoral',  orDash(cr.onElectoralRoll));
  setHTML('p-adverse',    orDash(adverse));
}

function renderDebts(p) {
  const debts = p.debts ?? {};

  const cards = debts.creditCards ?? [];
  if (cards.length === 0) {
    setHTML('p-creditcards', '<span class="muted">none</span>');
  } else {
    setHTML('p-creditcards', cards.map((c) =>
      `${esc(c.provider)} ${esc(c.cardName)} — balance ${gbp(c.currentBalance)} / limit ${gbp(c.creditLimit)} (${c.utilisationPct}% utilisation). <em>${esc(c.intendedAction)}</em>`
    ).join('<br>'));
  }

  const sl = debts.studentLoan;
  if (sl) {
    const bal = sl.balance ? gbp(sl.balance) : 'balance unknown';
    setText('p-studentloan', `${sl.plan} — ${gbp(sl.monthlyDeduction)}/mo — ${bal}`);
  } else {
    setHTML('p-studentloan', '<span class="muted">none</span>');
  }

  setHTML('p-carfinance', orDash(debts.carFinance));
  setText('p-overdraft', debts.regularOverdraft ? 'Yes' : 'No');
}

function renderPension(p) {
  const pen = p.pension ?? {};
  setText('p-pension-status', pen.workplacePensionStatus);
  const ee = pen.employeeContributionPct != null
    ? `${pen.employeeContributionPct}% (${gbp(pen.employeeContributionMonthly)}/mo)`
    : null;
  const er = pen.employerContributionPct != null
    ? `${pen.employerContributionPct}% (${gbp(pen.employerContributionMonthly)}/mo)`
    : null;
  setText('p-pension-ee', ee);
  setText('p-pension-er', er);
  setHTML('p-pension-pot', orDash(pen.currentPotValue));
}

function renderFollowUp(p) {
  const items = [];

  // Raise the credit follow-up only when scores are explicitly marked unchecked. A
  // profile carrying just an editorial credit summary (scoresChecked null) doesn't.
  const credit = p.creditProfile ?? {};
  if (credit.scoresChecked === false) {
    items.push(credit._followUp ?? 'Check credit scores (Experian, Equifax, TransUnion)');
  }

  const debts = p.debts ?? {};
  const sl = debts?.studentLoan;
  if (sl && sl.balance === null && sl._followUp) items.push(sl._followUp);

  const pen = p.pension ?? {};
  if (pen.currentPotValue === null && pen._followUp) items.push(pen._followUp);

  const el = $('p-followup-list');
  if (!el) return;

  if (items.length === 0) {
    el.innerHTML = '<li>No outstanding follow-up items.</li>';
  } else {
    el.innerHTML = items.map((item) => `<li>${esc(item)}</li>`).join('');
  }
}

init();
