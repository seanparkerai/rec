// page-search-profiles/view.js — pure view builders for the Search profiles page.
//
// Split out from the coordinator so tests/pages can import these directly: the
// coordinator pulls in storage.js → supabase-client.js, a CDN import Node cannot
// resolve. Same reason page-listings/row.js exists.
//
// Everything here is a pure function of its arguments — no storage, no fetch, no
// module state. DOM only.

import { el } from '../dom.js';
import { SORTS } from '../search/profile-spec.js';

const gbp = (n) => `£${Number(n).toLocaleString('en-GB')}`;

/** The price a profile searches, as a person would say it. */
export function priceLabel(spec) {
  if (!spec) return '—';
  if (spec.priceMode === 'range') {
    const lo = spec.priceMin ? gbp(spec.priceMin) : 'any';
    const hi = spec.priceMax ? gbp(spec.priceMax) : 'any';
    return `${lo} – ${hi}`;
  }
  return spec.price ? `${gbp(spec.price)} exactly` : '—';
}

/** The recency window in words. `null` means no limit, which is a real setting
 *  (the all-time back-catalogue sweep), not a missing one. */
export function recencyLabel(spec) {
  const d = spec?.recencyDays;
  if (d == null) return 'listed any time';
  return Number(d) === 1 ? 'added in the last 24 hours' : `added in the last ${d} days`;
}

/** A one-line human summary of what this profile actually searches for. */
export function summaryLine(spec) {
  const bits = [priceLabel(spec), recencyLabel(spec)];
  if (spec?.minBeds) bits.push(`${spec.minBeds}+ beds`);
  bits.push(spec?.sort === 'oldest' ? 'oldest first' : 'newest first');
  if (spec?.minAgeDays) bits.push(`on the market ${spec.minAgeDays}+ days`);
  return bits.join(' · ');
}

/**
 * Why a profile will not run, or null if it will. Order matters: report the
 * outermost blocker first, because switching a profile on while searching is
 * globally paused would change nothing and look broken.
 * @param {object} profile @param {{fetch_enabled?: boolean}} control
 * @param {{search_paused?: boolean}} [household]
 * @returns {string|null}
 */
export function blockedReason(profile, control, household = {}) {
  if (control?.fetch_enabled === false) return 'Searching is switched off for the whole system';
  if (household?.search_paused) return 'Searching is paused for your household';
  if (profile?.admin_paused) return 'Paused by the administrator';
  if (!profile?.enabled) return 'Switched off';
  return null;
}

/** Keyword chips. Text nodes only — a keyword is user input and must never be
 *  able to inject markup. */
export function keywordChips(keywords) {
  const wrap = el('div', { class: 'sp-card__keywords' });
  if (!keywords?.length) {
    wrap.appendChild(el('span', { class: 'sp-card__nokw' }, 'No keyword filter — every match is kept'));
    return wrap;
  }
  wrap.appendChild(el('span', { class: 'sp-card__kwlabel' }, 'Must mention:'));
  for (const k of keywords) wrap.appendChild(el('span', { class: 'chip sp-card__kw' }, k));
  return wrap;
}

/**
 * One profile card.
 *
 * The on/off state is carried by TEXT and an icon as well as position — never by
 * colour alone (CLAUDE.md §11). The Run button is only rendered for a manual
 * profile, and is disabled with a stated reason whenever the profile cannot run,
 * so a press never silently does nothing.
 *
 * @param {object} profile
 * @param {object} control  fetch_control state
 * @param {object} [household]
 * @returns {HTMLElement}
 */
export function buildProfileCard(profile, control, household = {}) {
  const spec = profile.spec || {};
  const blocked = blockedReason(profile, control, household);
  const card = el('article', {
    class: `card sp-card${blocked ? ' sp-card--off' : ''}`,
    'data-profile-id': profile.id,
    role: 'listitem',
  });

  const head = el('header', { class: 'sp-card__head' });
  head.appendChild(el('h3', { class: 'sp-card__name' }, profile.name || 'Untitled search'));
  head.appendChild(el('span', {
    class: `sp-card__state sp-card__state--${blocked ? 'off' : 'on'}`,
    'data-state': blocked ? 'off' : 'on',
  }, blocked ? '● Not running' : '● Running'));
  card.appendChild(head);

  card.appendChild(el('p', { class: 'sp-card__summary' }, summaryLine(spec)));
  card.appendChild(keywordChips(spec.keywords));

  const meta = el('p', { class: 'sp-card__meta' });
  meta.appendChild(el('span', {}, profile.trigger_mode === 'schedule' ? 'Runs on a schedule' : 'Runs only when you press Run'));
  if (profile.last_run_at) {
    meta.appendChild(el('span', {}, ` · last run ${new Date(profile.last_run_at).toLocaleString('en-GB')}`));
  }
  card.appendChild(meta);

  if (blocked) card.appendChild(el('p', { class: 'sp-card__blocked', role: 'note' }, blocked));

  const actions = el('div', { class: 'sp-card__actions' });
  const toggle = el('button', {
    type: 'button',
    class: profile.enabled ? 'secondary' : '',
    'data-action': 'toggle',
    'aria-pressed': profile.enabled ? 'true' : 'false',
  }, profile.enabled ? 'Switch off' : 'Switch on');
  // A profile the admin paused must not look switchable to its owner — the admin
  // panel is authoritative, and the DB trigger would reject the write anyway.
  if (profile.admin_paused) toggle.disabled = true;
  actions.appendChild(toggle);

  if (profile.trigger_mode !== 'schedule') {
    const run = el('button', { type: 'button', 'data-action': 'run' }, 'Run now');
    if (blocked) { run.disabled = true; run.title = blocked; }
    actions.appendChild(run);
  }
  card.appendChild(actions);
  return card;
}

/**
 * The banner above the list. States the lane position plainly, because "nothing is
 * happening" has several different causes and the user should never have to guess
 * which one they are looking at.
 */
export function buildLaneBanner(control) {
  if (control?.fetch_enabled === false) {
    return el('p', { class: 'sp-banner sp-banner--warn', role: 'status' },
      `Searching is switched off for the whole system${control.paused_reason ? ` — ${control.paused_reason}` : ''}. Nothing will run until it is switched back on.`);
  }
  if (control?.legacy_enabled === false) {
    return el('p', { class: 'sp-banner', role: 'status' },
      'Your original criteria-based search is switched off. Only the searches below run.');
  }
  return el('p', { class: 'sp-banner', role: 'status' },
    'Your original criteria-based search is still running as well. The searches below are additional.');
}

/** Empty state. Says what a profile IS, since the concept is new to the user. */
export function buildEmptyState() {
  const box = el('div', { class: 'sp-empty' });
  box.appendChild(el('p', {}, 'No search profiles yet.'));
  box.appendChild(el('p', { class: 'sp-empty__hint' },
    'A search profile is one way of looking for a house — an exact price, your areas, '
    + 'and optionally up to three words a listing must mention. You can have several, '
    + 'and switch each on or off independently.'));
  return box;
}

export { SORTS };
