// areas/area-picker.js — reusable "add a search area" component. Generalised from the
// onboarding wizard's area-lookup field so the same lookup → match-or-create → chip UI
// can be mounted anywhere: the areas/map page "Add area" dialog and (Phase 3) the
// profile's Areas section. Browser-only (network via place-lookup.js); the pure
// match/enrich/slug logic it leans on is unit-tested in the Node harness.
//
// On every add or remove it calls the optional onChange callback AND dispatches a
// window 'household-areas-changed' event so independent coordinators (the areas list,
// the map) can refresh live without a page reload.
import { el, on, clear } from '../dom.js';
import { debouncedLookup, selectPlace } from './place-lookup.js';
import { isFetchEligible } from './area-enrich.js';
import { getHouseholdAreas, removeHouseholdArea, setHouseholdAreaOrigin } from '../storage.js';

const HINT = 'Add at least one place you’d like to live. We match it to a researched village where we can, or create a placeholder we can enrich later.';

let _uid = 0;

// Mount the picker into `container`. Returns { refresh } so a host can re-pull the
// chosen list after an external change.
export async function mountAreaPicker(container, { onChange } = {}) {
  clear(container);
  // Unique ids so two pickers can coexist on one page (e.g. profile Areas section).
  const uid = `ap-${++_uid}`;
  const inputId = `${uid}-input`;
  const helpId = `${uid}-help`;

  const input = el('input', {
    id: inputId, type: 'text', autocomplete: 'off',
    placeholder: 'e.g. Alresford or SO24',
    'aria-label': 'Search a village, town or postcode',
    'aria-describedby': helpId,
  });
  const results = el('ul', { class: 'area-picker__results', role: 'listbox', 'aria-label': 'Matching places' });
  const chosen = el('ul', { class: 'area-picker__chips', 'aria-label': 'Your areas' });
  const status = el('p', { class: 'area-picker__help', id: helpId, 'aria-live': 'polite' }, HINT);

  function notifyChanged() {
    if (typeof onChange === 'function') onChange();
    window.dispatchEvent(new CustomEvent('household-areas-changed'));
  }

  async function paintChosen() {
    let areas = [];
    try { areas = await getHouseholdAreas({ includeInactive: true }); } catch (e) { console.error('area-picker load', e); }
    clear(chosen);
    if (!areas.length) {
      chosen.append(el('li', { class: 'area-picker__chips-empty muted' }, 'No areas added yet.'));
      return;
    }
    for (const a of areas) {
      const paused = a._status === 'inactive';
      const isOrigin = !!a._isOrigin;
      const name = a.name || a.id;
      // Origin toggle (step 2.19): "I live/commute here" vs "I want to buy here".
      // An origin area feeds commute math but is EXCLUDED from the property feed
      // and the scrape — state carried in text (aria-pressed + label), never
      // colour alone (§11).
      const home = el('button', {
        type: 'button',
        class: 'area-picker__chip-home',
        'aria-pressed': String(isOrigin),
        'aria-label': isOrigin
          ? `${name} is marked as home or commute base — tap to search it for properties instead`
          : `Mark ${name} as home or commute base (excluded from your property feed)`,
        title: isOrigin ? 'Home/commute base — not searched' : 'Mark as home/commute base',
      }, 'Home');
      on(home, 'click', async () => {
        home.disabled = true;
        const ok = await setHouseholdAreaOrigin(a.id, !isOrigin);
        if (ok) {
          await paintChosen();
          notifyChanged();
          status.textContent = !isOrigin
            ? `${name} marked as home/commute base — it feeds commute context but won’t appear in your property feed.`
            : `${name} is a search area again — its properties return to your feed.`;
        } else { home.disabled = false; }
      });
      const x = el('button', { type: 'button', class: 'area-picker__chip-x', 'aria-label': `Remove ${name}` }, '×');
      on(x, 'click', async () => {
        x.disabled = true;
        const ok = await removeHouseholdArea(a.id);
        if (ok) { await paintChosen(); notifyChanged(); }
        else { x.disabled = false; }
      });
      const label = `${name}${isOrigin ? ' (home)' : ''}${paused ? ' (paused)' : ''}`;
      chosen.append(el('li', {
        class: `area-picker__chip${paused ? ' is-paused' : ''}${isOrigin ? ' is-origin' : ''}`,
      }, [label, home, x]));
    }
  }

  const run = debouncedLookup((candidates) => {
    clear(results);
    for (const place of candidates.slice(0, 8)) {
      const li = el('li', { class: 'area-picker__opt', role: 'option', tabindex: '0' },
        `${place.name}${place.county ? `, ${place.county}` : ''}${place.postcode ? ` (${place.postcode})` : ''}`);
      const choose = async () => {
        status.textContent = 'Adding…';
        // No blocking confirm (§11): matchCatalogArea is conservative, so we auto-link
        // the match and show it as a removable chip — a mismatch is one tap to undo.
        const res = await selectPlace(place);
        if (res.area) {
          input.value = ''; clear(results);
          await paintChosen();
          notifyChanged();
          const name = res.area.name || place.name;
          status.textContent = res.action === 'linked'
            ? `Linked to our researched area: ${name}.`
            : isFetchEligible(res.area)
              ? `Added ${name} — it’s now included in your next property search.`
              : `Added ${name} — we’ll finish locating it shortly.`;
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

  container.append(
    el('div', { class: 'area-picker' }, [
      el('label', { for: inputId, class: 'area-picker__label' }, 'Search a village, town or postcode'),
      input,
      results,
      el('p', { class: 'area-picker__chosen-label' }, 'Your areas'),
      chosen,
      status,
    ]),
  );

  await paintChosen();
  return { refresh: paintChosen };
}
