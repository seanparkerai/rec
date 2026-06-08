// setup/validate.js — pure inline validation + the required-to-finish gate.
// Owner decision: ONLY name, email, ≥1 area and a maximum budget block "Finish";
// everything else is optional and partial completion is first-class.
import { getNested } from './autosave.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Per-field validation as the user types. Empty is valid unless the field is required.
export function validateField(field, value) {
  const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
  if (empty) return field.required ? { ok: false, error: `${field.label} is required` } : { ok: true };
  if (field.type === 'email' && !EMAIL_RE.test(String(value))) return { ok: false, error: 'Enter a valid email address' };
  if ((field.type === 'number' || field.type === 'currency') && !Number.isFinite(Number(value))) {
    return { ok: false, error: 'Enter a number' };
  }
  return { ok: true };
}

// The hard gate. `state` = { profile, criteria, finances, goals, areaCount }.
// Returns { ok, missing:[{key,label,stepId}] } so the Review step can deep-link each gap.
export function requiredGate(state) {
  const missing = [];
  const name = getNested(state.profile, 'person.fullName');
  const email = getNested(state.profile, 'person.email');
  const budgetMax = getNested(state.criteria, 'budget.max');
  if (!name || !String(name).trim()) {
    missing.push({ key: 'name', label: 'Your name', stepId: 'about-you' });
  }
  if (!email || !EMAIL_RE.test(String(email))) {
    missing.push({ key: 'email', label: 'A valid email address', stepId: 'about-you' });
  }
  if (!(Number(state.areaCount) >= 1)) {
    missing.push({ key: 'areas', label: 'At least one area', stepId: 'areas' });
  }
  if (!(Number(budgetMax) > 0)) {
    missing.push({ key: 'budget', label: 'A maximum budget', stepId: 'ideal-home' });
  }
  return { ok: missing.length === 0, missing };
}
