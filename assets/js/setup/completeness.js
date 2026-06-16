// setup/completeness.js — pure per-section + overall completeness, computed against the
// fields actually VISIBLE for the current state (branch-aware). Never faked: a section is
// 'complete' only when every visible data field is filled, 'partial' when some are,
// 'not-started' when none. Drives the global meter, per-step chips and the Review summary.
import { visibleFields, includedSteps } from './steps.js';
import { getNested, getLineValue } from './autosave.js';

// Resolve a field's current value from the state, handling the special @-paths.
export function fieldValue(state, field) {
  if (field.path === '@areas') return Number(state.areaCount) >= 1 ? state.areaCount : '';
  if (field.path === '@health-consent') return state?.profile?.consents?.health?.granted ? true : '';
  const [head, ...rest] = field.path.split('.');
  // money-line fields live as a labelled entry inside an array (e.g. finances.expenses);
  // read back the entry tagged with this field's lineId so re-renders show the value.
  if (field.type === 'money-line') return getLineValue(state[head], rest.join('.'), field.lineId);
  return getNested(state[head], rest.join('.'));
}

const isFilled = (v) => {
  if (v == null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
};

// Fields that count toward completeness: visible, and not pure-consent toggles.
const countableFields = (step, state) =>
  visibleFields(step, state).filter((f) => f.type !== 'consent');

export function stepCompleteness(step, state) {
  const fields = countableFields(step, state);
  if (fields.length === 0) return { filled: 0, total: 0, status: 'complete' };
  let filled = 0;
  for (const f of fields) if (isFilled(fieldValue(state, f))) filled += 1;
  const status = filled === 0 ? 'not-started' : (filled === fields.length ? 'complete' : 'partial');
  return { filled, total: fields.length, status };
}

// Overall meter — excludes the welcome + review chrome steps.
export function overallCompleteness(state) {
  const steps = includedSteps(state).filter((s) => s.id !== 'welcome' && s.id !== 'review');
  let filled = 0;
  let total = 0;
  for (const s of steps) {
    const c = stepCompleteness(s, state);
    filled += c.filled;
    total += c.total;
  }
  return { filled, total, percent: total ? Math.round((filled / total) * 100) : 0 };
}
