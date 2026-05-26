// page-profile-detail.js — read-only view of the expanded data/profile.json.
// Renders person, employment, credit, debts, pension + followup checklist.
// Anchor: Stripe-docs editorial article (restrained, field-list layout).

import { loadJSON } from './data-loader.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const $ = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = v || '—'; };
const setHTML = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
const gbp = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n || 0);
const nullish = (v) => v === null || v === undefined;
const orDash = (v) => nullish(v) ? '<span class="muted">not yet captured</span>' : esc(String(v));

async function init() {
  let profile;
  try { profile = await loadJSON('profile'); } catch (e) {
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

function renderPerson(p) {
  const person = p?.person ?? {};
  const addr = person?.address ?? {};
  const hh = person?.household ?? {};

  setText('p-name', person.fullName);
  setText('p-dob', person.dateOfBirth);
  setText('p-email', person.email);
  setText('p-address', [addr.line1, addr.town, addr.county, addr.postcode].filter(Boolean).join(', '));
  setText('p-nationality', person.nationality);
  setText('p-living', hh.livingArrangement);
  setText('p-dependents', String(hh.dependents ?? 0));
  const contrib = hh.monthlyHouseholdContribution;
  setText('p-contribution', contrib ? `${gbp(contrib)}/mo — ${hh.recipientNote || ''}` : '—');
}

function renderEmployment(p) {
  const emp = p?.employment ?? {};
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
  const cr = p?.creditProfile ?? {};

  const note = $(  'p-credit-note');
  if (note) {
    note.textContent = cr._followUp ?? '';
  }

  setHTML('p-experian',   orDash(cr.experianScore));
  setHTML('p-equifax',    orDash(cr.equifaxScore));
  setHTML('p-transunion', orDash(cr.transUnionScore));
  setHTML('p-electoral',  orDash(cr.onElectoralRoll));
  setHTML('p-adverse',    orDash(cr.adverseHistory));
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

  const credit = p?.creditProfile ?? {};
  if (!credit.scoresChecked) {
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
