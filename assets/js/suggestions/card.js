// suggestions/card.js — the shared suggestion-card renderer (HTML-string), used by BOTH
// the Listings page and the Trends page so a refinement looks and behaves identically
// everywhere. Reuses the .ref-card* classes (pages/refinement.css, loaded on both pages
// via dashboard.css) plus a .ref-card--live modifier for real-time observations. Buttons
// carry data-action + data-sug-id; the page looks the NormalizedSuggestion up by id and
// routes the click through suggestions/apply.js.
import { esc } from '../dom.js';

const SECONDARY_LABEL = { snooze: 'Snooze 30 days', dismiss: 'Dismiss' };

function actionButton(n, action) {
  if (action === 'apply') {
    return `<button type="button" class="ref-action ref-action--apply" data-action="apply" data-sug-id="${esc(n.id)}">${esc(n.applyLabel || 'Apply')}</button>`;
  }
  return `<button type="button" class="ref-action ref-action--ghost" data-action="${esc(action)}" data-sug-id="${esc(n.id)}">${esc(SECONDARY_LABEL[action] || action)}</button>`;
}

/** Render one NormalizedSuggestion as an inbox card. */
export function suggestionCardHTML(n) {
  const mod = n.source === 'live' ? ' ref-card--live' : ` ref-card--${esc(n.tier)}`;
  const tierBadge = n.source === 'live'
    ? '<span class="ref-tier ref-tier--live">Observed</span>'
    : `<span class="ref-tier ref-tier--${esc(n.tier)}">${esc(n.tierLabel)}</span>`;
  const detail = n.detail ? `<p class="ref-card__hint">${esc(n.detail)}</p>` : '';
  const note = n.volumeArtefact ? `<p class="ref-note">${esc(n.artefactNote)}</p>` : '';
  const stats = (n.source === 'engine' && n.rejectPct != null) ? `
      <div class="ref-stats">
        <span class="ref-stat"><span class="ref-stat__n">${n.rejectPct}%</span> rejected</span>
        <span class="ref-stat"><span class="ref-stat__n">${esc(n.liftLabel)}</span> vs usual</span>
        <span class="ref-stat"><span class="ref-stat__n">${n.distinct}</span> listings</span>
      </div>` : '';
  const why = (n.whyLines && n.whyLines.length) ? `
      <details class="ref-why"><summary>Why?</summary>
        <ul class="ref-why__list">${n.whyLines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      </details>` : '';
  // Live-computed engine cards (no server row yet) say so — the daily job will pick
  // the same pattern up on its next run; the maths is identical either way.
  const origin = (n.source === 'engine' && n.origin === 'live')
    ? '<p class="ref-card__origin">Computed live from your latest reactions</p>' : '';
  const actions = (n.actions || []).map((a) => actionButton(n, a)).join('');
  return `
    <article class="ref-card${mod}" data-sug-card="${esc(n.id)}">
      <header class="ref-card__head">
        <span class="ref-chip">${esc(n.dimensionLabel)}</span>
        <h3 class="ref-card__title">${esc(n.label)}</h3>
        ${tierBadge}
      </header>
      <p class="ref-card__reason">${esc(n.message)}</p>
      ${detail}
      ${note}
      ${stats}
      ${why}
      ${origin}
      <footer class="ref-card__actions">${actions}</footer>
    </article>`;
}

/** Render a list of suggestions, with an optional empty-state line. */
export function suggestionListHTML(list, { empty = '' } = {}) {
  if (!list || !list.length) return empty ? `<p class="ref-empty">${esc(empty)}</p>` : '';
  return list.map(suggestionCardHTML).join('');
}
