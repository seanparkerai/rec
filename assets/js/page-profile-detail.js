// page-profile-detail.js — read-only view of the profile (from Supabase via storage.js).
// Renders person, employment, credit, debts, pension + followup checklist.
// Anchor: Stripe-docs editorial article (restrained, field-list layout).

import { getProfile } from './storage.js';
import { esc, byId as $, setText as _setText, setHTML } from './dom.js';

const setText = (id, v) => _setText(id, v, { fallback: '—' });
const gbp = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n || 0);
const nullish = (v) => v === null || v === undefined;
const orDash = (v) => nullish(v) ? '<span class="muted">not yet captured</span>' : esc(String(v));

async function init() {
  let profile;
  try { profile = await getProfile(); } catch (e) {
    console.error('profile load error', e);
    return;
  }

  renderPerson(profile);
  renderEmployment(profile);
  renderCredit(profile);
  renderDebts(profile);
  renderPension(profile);
  renderFollowUp(profile);
}

// The profile blob comes in two shapes: the nested test/wizard fixture
// ({ person, employment: {…}, creditProfile: {…} }) and the flat shape the
// live portal actually stores ({ name, currentAddress, employer, creditProfile: "…" }).
// Every field below reads nested-first, then falls back to the flat key, so a
// real Supabase profile maps correctly without breaking the fixture path.
function renderPerson(p) {
  const person = p?.person ?? {};
  const addr = person?.address ?? p?.currentAddress ?? {};
  const hh = person?.household ?? {};

  const fullName = person.fullName
    ?? p?.name
    ?? ([p?.firstName, p?.lastName].filter(Boolean).join(' ') || null);
  setText('p-name', fullName);
  setText('p-dob', person.dateOfBirth ?? p?.dateOfBirth);
  setText('p-email', person.email ?? p?.email);
  setText('p-address', [addr.line1, addr.town, addr.county, addr.postcode].filter(Boolean).join(', '));
  setText('p-nationality', person.nationality ?? p?.nationality ?? p?.residencyStatus);
  setText('p-living', hh.livingArrangement ?? p?.currentAddress?.tenure ?? p?.maritalStatus);

  const dependents = hh.dependents ?? p?.dependents;
  setText('p-dependents', dependents != null ? String(dependents) : null);

  const contrib = hh.monthlyHouseholdContribution;
  const rent = p?.currentAddress?.monthlyRent;
  if (contrib) {
    setText('p-contribution', `${gbp(contrib)}/mo${hh.recipientNote ? ` — ${hh.recipientNote}` : ''}`);
  } else if (rent) {
    setText('p-contribution', `${gbp(rent)}/mo — current rent`);
  } else {
    setText('p-contribution', null);
  }
}

function renderEmployment(p) {
  // Nested shape stores an `employment` object; the flat shape stores a one-line
  // `employment` string plus discrete top-level keys (employer/occupation/…).
  const emp = (p?.employment && typeof p.employment === 'object') ? p.employment : {};
  setText('p-employer', emp.employer ?? p?.employer);
  setText('p-role', emp.role ?? p?.occupation);
  setText('p-startdate', emp.startDate);
  setText('p-emptype', emp.type ?? p?.employmentType);

  const prob = emp.probationStatus
    ? `${emp.probationStatus}${emp.probationEndDate ? ` (ended ${emp.probationEndDate})` : ''}`
    : null;
  setText('p-probation', prob);
  setText('p-workpattern', emp.workPattern ?? p?.workArrangement);
  setText('p-stability', emp.jobStability);
  const years = emp.yearsInField != null ? String(emp.yearsInField) : (p?.employmentLength ?? null);
  setText('p-yearsfield', years);
}

function renderCredit(p) {
  // Nested shape: a creditProfile object with per-bureau scores. Flat shape: a
  // single creditProfile summary string (e.g. "Excellent (no adverse history)").
  const raw = p?.creditProfile;
  const cr = (raw && typeof raw === 'object') ? raw : {};
  const summary = (typeof raw === 'string' && raw.trim()) ? raw.trim() : null;

  const note = $('p-credit-note');
  if (note) {
    note.textContent = cr._followUp ?? summary ?? '';
  }

  // With only a summary string, derive the adverse-history line from it and leave
  // the per-bureau scores as not-yet-captured.
  const adverse = cr.adverseHistory != null
    ? cr.adverseHistory
    : (summary && /no adverse|excellent|clean/i.test(summary) ? 'None reported' : null);

  setHTML('p-experian',   orDash(cr.experianScore));
  setHTML('p-equifax',    orDash(cr.equifaxScore));
  setHTML('p-transunion', orDash(cr.transUnionScore));
  setHTML('p-electoral',  orDash(cr.onElectoralRoll));
  setHTML('p-adverse',    orDash(adverse));
}

function renderDebts(p) {
  const debts = p?.debts ?? {};

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
  const pen = p?.pension ?? {};
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

  // Only the nested (object) credit shape carries follow-up state; a flat summary
  // string means scores were captured, so it raises no follow-up.
  const credit = (p?.creditProfile && typeof p.creditProfile === 'object') ? p.creditProfile : null;
  if (credit && !credit.scoresChecked) {
    items.push(credit._followUp ?? 'Check credit scores (Experian, Equifax, TransUnion)');
  }

  const debts = p?.debts ?? {};
  const sl = debts?.studentLoan;
  if (sl && sl.balance === null && sl._followUp) items.push(sl._followUp);

  const pen = p?.pension ?? {};
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
