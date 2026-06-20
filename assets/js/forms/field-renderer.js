// forms/field-renderer.js — the shared, declarative field-rendering engine. Extracted
// verbatim from setup/wizard.js so the SAME field definitions (setup/steps.js) can be
// rendered both as the onboarding wizard's gated flow and as the profile page's
// inline-editable sections. PURE-ish browser DOM: it reads/writes a state bag of
// blob objects (profile | criteria | finances | goals) and queues saves through the
// caller-supplied autosaver — it owns no storage or gate logic of its own.
//
// A field's `path` is dotted and BLOB-PREFIXED (e.g. 'profile.person.fullName'); the
// first segment selects the blob. Two special paths are handled by injected hooks so
// hosts can present them differently: '@areas' (an area picker) and '@health-consent'
// (special-category consent).
import { el, on, clear } from '../dom.js';
import { validateField } from '../setup/validate.js';
import { fieldValue } from '../setup/completeness.js';
import { setNested, setLineValue } from '../setup/autosave.js';

const BLOBS = ['profile', 'criteria', 'finances', 'goals'];

// Coerce a raw control value into the typed value the blob should store.
export const coerce = (type, raw) => {
  if (raw === '' || raw == null) return null;
  if (type === 'number' || type === 'currency' || type === 'money-line') { const n = Number(raw); return Number.isFinite(n) ? n : null; }
  return raw;
};

// Build a field renderer bound to a state bag + autosaver.
//   state          — { profile, criteria, finances, goals, ... }
//   saver          — makeAutosaver(...) instance (queue/flushAll)
//   onChange()     — called after every committed write (host updates gate/meter)
//   onBranchChange()— called when a branch-controlling field changes (host re-renders)
//   branchPaths    — field paths that drive which steps/fields are shown
//   renderArea(field)    — host hook for the '@areas' / 'area-lookup' field (optional)
export function createFieldRenderer({
  state,
  saver,
  onChange = () => {},
  onBranchChange = () => {},
  branchPaths = ['profile.buyingSituation', 'profile.household.applicants', 'profile.employment.basis'],
  renderArea = null,
} = {}) {
  function writeField(field, value) {
    const [head, ...rest] = field.path.split('.');
    if (!BLOBS.includes(head)) return;
    if (field.type === 'money-line') {
      // Capture into the array the app actually sums (e.g. finances.expenses), as a
      // single labelled, re-editable entry — not a dead scalar key.
      setLineValue(state[head], rest.join('.'), { lineId: field.lineId, label: field.lineLabel, value });
    } else {
      setNested(state[head], rest.join('.'), value);
    }
    saver.queue(head, state[head]);
    onChange();
  }

  function renderField(field) {
    if (field.path === '@areas' || field.type === 'area-lookup') return renderArea ? renderArea(field) : el('div');
    if (field.path === '@health-consent' || field.type === 'consent') return renderConsent(field);
    if (field.type === 'list') return renderList(field);

    const id = `f-${field.path.replace(/[^\w]+/g, '-')}`;
    const helpId = `${id}-help`;
    const errId = `${id}-err`;
    const value = fieldValue(state, field) ?? '';
    const describedby = [field.help ? helpId : null, errId].filter(Boolean).join(' ');

    let control;
    if (field.type === 'select') {
      control = el('select', { id, name: field.path, 'aria-describedby': describedby });
      control.append(el('option', { value: '' }, '—'));
      (field.options || []).forEach((opt, i) => {
        const o = el('option', { value: String(i) }, opt.label);
        if (String(opt.value) === String(value)) o.selected = true;
        control.append(o);
      });
    } else if (field.type === 'textarea') {
      control = el('textarea', { id, name: field.path, rows: '3', 'aria-describedby': describedby }, String(value));
    } else {
      const inputType = field.type === 'currency' || field.type === 'number' || field.type === 'money-line' ? 'number'
        : (field.type === 'email' ? 'email' : (field.type === 'date' ? 'date' : 'text'));
      control = el('input', {
        id, name: field.path, type: inputType,
        value: value === null ? '' : String(value),
        inputmode: field.inputmode || null,
        placeholder: field.placeholder || null,
        'aria-required': field.required ? 'true' : null,
        'aria-describedby': describedby,
      });
    }

    const errEl = el('p', { class: 'wiz-field__err', id: errId, role: 'alert' });
    const handler = () => {
      let raw;
      if (field.type === 'select') {
        const idx = control.value === '' ? -1 : Number(control.value);
        raw = idx >= 0 ? field.options[idx].value : null;
      } else {
        raw = coerce(field.type, control.value);
      }
      const v = validateField(field, control.value === '' ? null : raw);
      errEl.textContent = v.ok ? '' : v.error;
      control.setAttribute('aria-invalid', v.ok ? 'false' : 'true');
      writeField(field, raw);
      // Fields that change which steps/fields are shown trigger a host re-render.
      if (branchPaths.includes(field.path)) onBranchChange();
    };
    on(control, field.type === 'select' ? 'change' : 'input', handler);

    return el('div', { class: 'wiz-field' }, [
      el('label', { for: id }, field.label + (field.required ? ' *' : '')),
      field.help ? el('p', { class: 'wiz-field__help', id: helpId }, field.help) : null,
      control,
      errEl,
    ]);
  }

  // List (chip) editor → writes a string[] at the field path.
  function renderList(field) {
    const id = `f-${field.path.replace(/[^\w]+/g, '-')}`;
    const current = () => (fieldValue(state, field) || []).slice();
    const chips = el('ul', { class: 'wiz-chips', 'aria-label': field.label });
    const input = el('input', { id, type: 'text', placeholder: 'Type and press Enter', 'aria-label': field.label });

    const paint = () => {
      clear(chips);
      current().forEach((item, i) => {
        const x = el('button', { type: 'button', class: 'wiz-chip__x', 'aria-label': `Remove ${item}` }, '×');
        on(x, 'click', () => { const arr = current(); arr.splice(i, 1); writeField(field, arr); paint(); });
        chips.append(el('li', { class: 'wiz-chip' }, [item, x]));
      });
    };
    const add = () => {
      const v = input.value.trim();
      if (!v) return;
      const arr = current(); arr.push(v); writeField(field, arr);
      input.value = ''; paint(); input.focus();
    };
    on(input, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    paint();
    const addBtn = el('button', { type: 'button', class: 'secondary' }, 'Add');
    on(addBtn, 'click', add);
    return el('div', { class: 'wiz-field' }, [
      el('label', { for: id }, field.label),
      field.help ? el('p', { class: 'wiz-field__help' }, field.help) : null,
      chips,
      el('div', { class: 'wiz-addrow' }, [input, addBtn]),
    ]);
  }

  // Explicit, withdrawable special-category consent (UK GDPR). Writes
  // profile.consents.health = { granted, at }.
  function renderConsent(field) {
    const id = `f-${field.path.replace(/[^\w]+/g, '-')}`;
    const granted = state?.profile?.consents?.health?.granted === true;
    const box = el('input', { id, type: 'checkbox' });
    box.checked = granted;
    on(box, 'change', () => {
      setNested(state.profile, 'consents.health', box.checked ? { granted: true, at: new Date().toISOString() } : { granted: false, at: new Date().toISOString() });
      saver.queue('profile', state.profile);
      onChange();
      onBranchChange(); // reveal/hide the dependent health-notes field
    });
    return el('div', { class: 'wiz-field wiz-field--consent' }, [
      el('label', { for: id, class: 'wiz-consent' }, [box, el('span', {}, field.label)]),
      el('p', { class: 'wiz-field__help' }, 'You can withdraw this any time from Your Profile. Health data is excluded from scoring by default and never required to finish.'),
    ]);
  }

  return { renderField, writeField };
}
