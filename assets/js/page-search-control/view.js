// page-search-control/view.js — pure view builders for the admin search panel.
//
// Split from the coordinator so tests/pages can import them without storage.js →
// supabase-client.js. Pure DOM, no storage, no module state.

import { el } from '../dom.js';

const gbp = (n) => `£${Number(n).toLocaleString('en-GB')}`;

/** What a profile searches, compressed for a dense admin row. */
export function specSummary(spec) {
  if (!spec) return '—';
  const price = spec.priceMode === 'range'
    ? `${spec.priceMin ? gbp(spec.priceMin) : 'any'}–${spec.priceMax ? gbp(spec.priceMax) : 'any'}`
    : (spec.price ? `${gbp(spec.price)} exact` : '—');
  const when = spec.recencyDays == null ? 'any time' : `${spec.recencyDays}d`;
  const kw = spec.keywords?.length ? ` · ${spec.keywords.join('/')}` : '';
  return `${price} · ${when} · ${spec.sort === 'oldest' ? 'oldest' : 'newest'}${kw}`;
}

/**
 * Effective state of one profile, accounting for every switch above it. The admin
 * needs to see the RESULT, not just this profile's own flag — a profile marked
 * "on" inside a paused household is not running, and a panel that showed it as on
 * would be lying about what the system is doing.
 * @returns {{running: boolean, label: string}}
 */
export function effectiveState(profile, household, control) {
  if (control?.fetch_enabled === false) return { running: false, label: 'Global off' };
  if (household?.search_paused) return { running: false, label: 'User paused' };
  if (profile?.admin_paused) return { running: false, label: 'Admin paused' };
  if (!profile?.enabled) return { running: false, label: 'User off' };
  return { running: true, label: 'Running' };
}

/** One profile row inside a household block. */
export function buildProfileRow(profile, household, control) {
  const st = effectiveState(profile, household, control);
  const row = el('tr', { 'data-profile-id': profile.id, class: st.running ? '' : 'sc-row--off' });
  row.appendChild(el('td', { class: 'sc-name' }, profile.name || 'Untitled'));
  row.appendChild(el('td', { class: 'sc-spec' }, specSummary(profile.spec)));
  row.appendChild(el('td', {}, profile.trigger_mode === 'schedule' ? 'scheduled' : 'manual'));
  // State is text, never colour alone (CLAUDE.md §11).
  row.appendChild(el('td', { class: 'sc-state', 'data-running': st.running ? 'yes' : 'no' }, st.label));
  row.appendChild(el('td', {}, profile.last_run_at ? new Date(profile.last_run_at).toLocaleDateString('en-GB') : 'never'));
  const act = el('td', {});
  act.appendChild(el('button', {
    type: 'button', class: 'sc-btn', 'data-action': 'toggle-profile',
    'data-paused': profile.admin_paused ? 'true' : 'false',
    'aria-pressed': profile.admin_paused ? 'true' : 'false',
  }, profile.admin_paused ? 'Un-pause' : 'Pause'));
  row.appendChild(act);
  return row;
}

/** One household block: its own switch plus a table of its profiles. */
export function buildHouseholdBlock(household, control) {
  const box = el('section', { class: 'sc-household', 'data-household-id': household.id });

  const head = el('header', { class: 'sc-household__head' });
  head.appendChild(el('h2', {}, household.name || 'Household'));
  head.appendChild(el('span', { class: 'sc-household__meta' },
    `${household.active_areas ?? 0} active areas · ${(household.profiles || []).length} profile(s)`));
  head.appendChild(el('button', {
    type: 'button', class: 'sc-btn', 'data-action': 'toggle-household',
    'data-paused': household.search_paused ? 'true' : 'false',
    'aria-pressed': household.search_paused ? 'true' : 'false',
  }, household.search_paused ? 'Resume user' : 'Pause user'));
  box.appendChild(head);

  if (household.search_paused) {
    box.appendChild(el('p', { class: 'sc-note', role: 'note' },
      'All searching is paused for this user — every profile below is inactive regardless of its own switch.'));
  }

  if (!(household.profiles || []).length) {
    box.appendChild(el('p', { class: 'sc-note' }, 'No search profiles.'));
    return box;
  }

  const table = el('table', { class: 'sc-table' });
  const thead = el('thead', {}, el('tr', {}, [
    el('th', {}, 'Search'), el('th', {}, 'Spec'), el('th', {}, 'Trigger'),
    el('th', {}, 'State'), el('th', {}, 'Last run'), el('th', {}, ''),
  ]));
  table.appendChild(thead);
  const tbody = el('tbody', {});
  for (const p of household.profiles) tbody.appendChild(buildProfileRow(p, household, control));
  table.appendChild(tbody);
  box.appendChild(table);
  return box;
}

/**
 * The two global switches. Stated as what they DO rather than as flags, because
 * the two lanes are independent and confusing them is the expensive mistake:
 * switching the legacy lane off does not stop profiles, and vice versa.
 */
export function buildGlobalControls(control) {
  const box = el('section', { class: 'sc-globals' });

  const master = el('div', { class: 'sc-global' });
  master.appendChild(el('h2', {}, 'All searching'));
  master.appendChild(el('p', { class: 'sc-global__state', 'data-state': control?.fetch_enabled ? 'on' : 'off' },
    control?.fetch_enabled ? 'ON — both lanes may run' : 'OFF — nothing runs anywhere'));
  if (control?.paused_reason) master.appendChild(el('p', { class: 'sc-note' }, control.paused_reason));
  master.appendChild(el('button', {
    type: 'button', class: 'sc-btn', 'data-action': 'toggle-global',
    'data-enabled': control?.fetch_enabled ? 'true' : 'false',
  }, control?.fetch_enabled ? 'Stop all searching' : 'Resume all searching'));
  box.appendChild(master);

  const legacy = el('div', { class: 'sc-global' });
  legacy.appendChild(el('h2', {}, 'Legacy criteria search'));
  legacy.appendChild(el('p', { class: 'sc-global__state', 'data-state': control?.legacy_enabled ? 'on' : 'off' },
    control?.legacy_enabled ? 'ON — the original search runs' : 'OFF — only profiles run'));
  legacy.appendChild(el('p', { class: 'sc-note' },
    'Independent of the profile lane. Turning this off leaves profiles running; it does not delete anything and can be turned back on at any time.'));
  legacy.appendChild(el('button', {
    type: 'button', class: 'sc-btn', 'data-action': 'toggle-legacy',
    'data-enabled': control?.legacy_enabled ? 'true' : 'false',
  }, control?.legacy_enabled ? 'Stop legacy search' : 'Resume legacy search'));
  box.appendChild(legacy);

  // The scheduled-dispatch switch (docs/adr/0012). OFF is the resting state: no
  // Apify run starts unless a person presses a button and confirms. ON re-arms the
  // six daily Supabase pg_cron dispatches. Deliberately a third, separate switch:
  // "All searching" gates whether ANY fetch may run; this one gates only whether
  // fetches happen BY THEMSELVES.
  const auto = el('div', { class: 'sc-global' });
  auto.appendChild(el('h2', {}, 'Automatic fetches'));
  auto.appendChild(el('p', { class: 'sc-global__state', 'data-state': control?.auto_fetch_enabled ? 'on' : 'off' },
    control?.auto_fetch_enabled
      ? 'ON — the six daily Rightmove pulls run by themselves'
      : 'OFF — nothing runs unless someone presses a button and confirms'));
  auto.appendChild(el('p', { class: 'sc-note' },
    'Manual pulls (the Listings page buttons and each profile\u2019s Run now) still work either way, subject to the switches above. Switching this on re-arms the scheduled dispatches and costs Apify credit every day.'));
  auto.appendChild(el('button', {
    type: 'button', class: 'sc-btn', 'data-action': 'toggle-auto',
    'data-enabled': control?.auto_fetch_enabled ? 'true' : 'false',
  }, control?.auto_fetch_enabled ? 'Switch off automatic fetches' : 'Switch on automatic fetches'));
  box.appendChild(auto);

  return box;
}

/** Headline counts, so the panel answers "what is running right now?" at a glance. */
export function buildSummary(households, control) {
  let total = 0; let running = 0;
  for (const h of households || []) {
    for (const p of h.profiles || []) {
      total += 1;
      if (effectiveState(p, h, control).running) running += 1;
    }
  }
  return el('p', { class: 'sc-summary', 'data-running-count': String(running) },
    `${running} of ${total} search profile(s) actively running across ${(households || []).length} household(s).`);
}
