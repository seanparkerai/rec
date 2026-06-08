// setup/wizard.js — the branching onboarding state machine + DOM. Renders one step at a
// time from the declarative steps.js, autosaves each edit through the matching storage
// accessor (never clobbering other sections), keeps the required-gate + completeness live,
// and is keyboard- + screen-reader-operable. Browser-only; the pure logic it leans on
// (steps/validate/completeness/autosave) is unit-tested separately.
import { el, on, clear, esc } from '../dom.js';
import { includedSteps, visibleFields } from './steps.js';
import { validateField, requiredGate } from './validate.js';
import { stepCompleteness, overallCompleteness, fieldValue } from './completeness.js';
import { makeAutosaver, getNested, setNested } from './autosave.js';
import { focusFirst, announce, updateProgress } from './a11y.js';
import { debouncedLookup, selectPlace } from '../areas/place-lookup.js';
import { isFetchEligible } from '../areas/area-enrich.js';

const BLOBS = ['profile', 'criteria', 'finances', 'goals'];
const coerce = (type, raw) => {
  if (raw === '' || raw == null) return null;
  if (type === 'number' || type === 'currency') { const n = Number(raw); return Number.isFinite(n) ? n : null; }
  return raw;
};

export function createWizard(root, { state, accessors, areaApi, onFinish }) {
  const saver = makeAutosaver({
    profile: accessors.saveProfile, criteria: accessors.saveCriteria,
    finances: accessors.saveFinances, goals: accessors.saveGoals,
  });
  let stepIndex = 0;

  // ── chrome (built once) ────────────────────────────────────────────────────
  const live = el('p', { class: 'wiz__live', 'aria-live': 'polite' });
  const progress = el('div', { class: 'wiz__progress' }, el('span', { class: 'wiz__progress-fill' }));
  const meter = el('p', { class: 'wiz__meter', 'aria-live': 'polite' });
  const form = el('form', { class: 'wiz__form', novalidate: true });
  const backBtn = el('button', { type: 'button', class: 'secondary', 'data-back': true }, 'Back');
  const nextBtn = el('button', { type: 'button', 'data-next': true }, 'Next');
  const finishBtn = el('button', { type: 'button', 'data-finish': true, hidden: true }, 'Finish');
  const barStatus = el('span', { class: 'wiz__bar-status' });
  const bar = el('div', { class: 'wiz__bar' }, [backBtn, barStatus, nextBtn, finishBtn]);

  clear(root);
  root.append(
    el('div', { class: 'wiz__head' }, [progress, meter]),
    live, form, bar,
  );

  on(backBtn, 'click', () => { saver.flushAll(); go(stepIndex - 1); });
  on(nextBtn, 'click', () => { saver.flushAll(); go(stepIndex + 1); });
  on(finishBtn, 'click', () => finish());
  on(form, 'submit', (e) => e.preventDefault());

  // ── per-step render ────────────────────────────────────────────────────────
  function go(next) {
    const steps = includedSteps(state);
    stepIndex = Math.max(0, Math.min(next, steps.length - 1));
    render(true);
  }

  function render(focusStep = false) {
    const steps = includedSteps(state);
    const step = steps[stepIndex];
    clear(form);

    const heading = el('h2', { class: 'wiz__title', id: 'wiz-step-title', tabindex: '-1' }, step.title);
    form.append(heading);
    if (step.intro) form.append(el('p', { class: 'wiz__intro' }, step.intro));

    if (step.id === 'review') {
      form.append(renderReview(steps));
    } else {
      const wrap = el('div', { class: 'wiz__fields' });
      for (const field of visibleFields(step, state)) wrap.append(renderField(field));
      form.append(wrap);
    }

    // progress + chrome
    updateProgress(progress, stepIndex + 1, steps.length);
    progress.style.setProperty('--wiz-fill', `${Math.round(((stepIndex + 1) / steps.length) * 100)}%`);
    const oc = overallCompleteness(state);
    meter.textContent = `${oc.percent}% of optional detail captured`;
    const onReview = step.id === 'review';
    nextBtn.hidden = onReview;
    finishBtn.hidden = !onReview;
    backBtn.disabled = stepIndex === 0;
    refreshGateUI();
    // Announce + move focus only on a genuine step change — an in-step branching
    // re-render (revealing/hiding conditional fields) must not yank focus or re-announce.
    if (focusStep) {
      announce(live, `Step ${stepIndex + 1} of ${steps.length}: ${step.title}`);
      focusFirst(form);
    }
  }

  // ── field renderers ──────────────────────────────────────────────────────────
  function renderField(field) {
    if (field.path === '@areas') return renderAreaLookup(field);
    if (field.path === '@health-consent') return renderConsent(field);
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
      const inputType = field.type === 'currency' || field.type === 'number' ? 'number'
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
    const onChange = () => {
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
      // Fields that change which steps/fields are shown re-render the step.
      if (['profile.buyingSituation', 'profile.household.applicants', 'profile.employment.basis'].includes(field.path)) {
        render();
      }
    };
    on(control, field.type === 'select' ? 'change' : 'input', onChange);

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
        chips.append(el('li', { class: 'wiz-chip' }, [esc(item), x]));
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
      render(); // reveal/hide the dependent health-notes field
    });
    return el('div', { class: 'wiz-field wiz-field--consent' }, [
      el('label', { for: id, class: 'wiz-consent' }, [box, el('span', {}, field.label)]),
      el('p', { class: 'wiz-field__help' }, 'You can withdraw this any time from Your Profile. Health data is excluded from scoring by default and never required to finish.'),
    ]);
  }

  // Area lookup → writes household_areas (catalog match or stub) via areaApi; tracks the
  // chosen list + areaCount for the required gate.
  function renderAreaLookup(field) {
    const id = 'f-area-lookup';
    const input = el('input', { id, type: 'text', placeholder: 'e.g. Alresford or SO24', autocomplete: 'off', 'aria-label': field.label, 'aria-describedby': 'area-help' });
    const results = el('ul', { class: 'wiz-lookup__results', role: 'listbox', 'aria-label': 'Matching places' });
    const chosen = el('ul', { class: 'wiz-chips', 'aria-label': 'Chosen areas' });
    const status = el('p', { class: 'wiz-field__help', id: 'area-help', 'aria-live': 'polite' }, 'Add at least one area. *');

    const paintChosen = () => {
      clear(chosen);
      (state.areas || []).forEach((a) => {
        const x = el('button', { type: 'button', class: 'wiz-chip__x', 'aria-label': `Remove ${a.name}` }, '×');
        on(x, 'click', async () => {
          await areaApi.remove(a.id);
          state.areas = (state.areas || []).filter((z) => z.id !== a.id);
          state.areaCount = state.areas.length;
          paintChosen(); refreshGateUI();
        });
        chosen.append(el('li', { class: 'wiz-chip' }, [esc(a.name || a.id), x]));
      });
    };

    const run = debouncedLookup((candidates) => {
      clear(results);
      for (const place of candidates.slice(0, 8)) {
        const li = el('li', { class: 'wiz-lookup__opt', role: 'option', tabindex: '0' },
          `${place.name}${place.county ? `, ${place.county}` : ''}${place.postcode ? ` (${place.postcode})` : ''}`);
        const choose = async () => {
          status.textContent = 'Adding…';
          // No blocking confirm (§11): matchCatalogArea is conservative (name+county AND
          // within ~1.5km OR same postcode district), so we auto-link the match and show
          // it as a removable chip — the user can undo a mismatch in one tap.
          const res = await selectPlace(place);
          if (res.area) {
            const a = { id: res.area.id, name: res.area.name || place.name };
            if (!(state.areas || []).some((z) => z.id === a.id)) { state.areas = [...(state.areas || []), a]; }
            state.areaCount = state.areas.length;
            input.value = ''; clear(results); paintChosen(); refreshGateUI();
            status.textContent = res.action === 'linked'
              ? `Linked to our researched area: ${a.name}.`
              : isFetchEligible(res.area)
                ? `Added ${a.name} — it’s now included in your next property search.`
                : `Added ${a.name} — we’ll finish locating it shortly.`;
          } else {
            status.textContent = 'Could not add that place — please try again.';
          }
        };
        on(li, 'click', choose);
        on(li, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
        results.append(li);
      }
    }, 300);
    on(input, 'input', () => run(input.value));

    paintChosen();
    return el('div', { class: 'wiz-field wiz-field--lookup' }, [
      el('label', { for: id }, field.label + ' *'),
      input, results, chosen, status,
    ]);
  }

  // ── review step ──────────────────────────────────────────────────────────────
  function renderReview(steps) {
    const oc = overallCompleteness(state);
    const wrap = el('div', { class: 'wiz-review' });
    wrap.append(el('p', { class: 'wiz-review__meter' }, `You’ve captured ${oc.percent}% of the optional detail (${oc.filled}/${oc.total} fields).`));
    const list = el('ul', { class: 'wiz-review__list' });
    for (const s of steps) {
      if (s.id === 'welcome' || s.id === 'review') continue;
      const c = stepCompleteness(s, state);
      const jump = el('button', { type: 'button', class: 'link' }, s.title);
      on(jump, 'click', () => { const idx = includedSteps(state).findIndex((x) => x.id === s.id); if (idx >= 0) go(idx); });
      list.append(el('li', { class: `wiz-review__row is-${c.status}` }, [
        el('span', { class: `wiz-review__dot is-${c.status}` }),
        jump,
        el('span', { class: 'wiz-review__count' }, c.total ? `${c.filled}/${c.total}` : '—'),
      ]));
    }
    wrap.append(list);
    wrap.append(el('p', { class: 'wiz-review__gate', id: 'wiz-gate', role: 'status', 'aria-live': 'polite' }));
    return wrap;
  }

  // ── helpers ───────────────────────────────────────────────────────────────────
  function writeField(field, value) {
    const [head, ...rest] = field.path.split('.');
    if (!BLOBS.includes(head)) return;
    setNested(state[head], rest.join('.'), value);
    saver.queue(head, state[head]);
    refreshGateUI();
    // keep the meter honest as the user types
    const oc = overallCompleteness(state);
    meter.textContent = `${oc.percent}% of optional detail captured`;
  }

  function refreshGateUI() {
    const gate = requiredGate(state);
    finishBtn.disabled = !gate.ok;
    barStatus.textContent = gate.ok ? 'Ready to finish' : `Still needed: ${gate.missing.map((m) => m.label).join(', ')}`;
    const gateEl = form.querySelector('#wiz-gate');
    if (gateEl) {
      if (gate.ok) gateEl.textContent = 'All required items captured — press Finish.';
      else {
        clear(gateEl);
        gateEl.append('Before finishing, add: ');
        gate.missing.forEach((m, i) => {
          const b = el('button', { type: 'button', class: 'link' }, m.label);
          on(b, 'click', () => { const idx = includedSteps(state).findIndex((x) => x.id === m.stepId); if (idx >= 0) go(idx); });
          gateEl.append(b);
          if (i < gate.missing.length - 1) gateEl.append(', ');
        });
      }
    }
  }

  async function finish() {
    const gate = requiredGate(state);
    if (!gate.ok) { refreshGateUI(); return; }
    saver.flushAll();
    if (typeof onFinish === 'function') await onFinish();
  }

  // initial paint
  render(true);
  return { destroy() { saver.flushAll(); clear(root); } };
}
