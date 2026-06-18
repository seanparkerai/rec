// outreach/grid.js — renders filtered template tiles (stage + role) and binds generate buttons to open the draft dialog. DOM rendering.

import { esc, byId as $, on } from '../dom.js';
import { state, ROLE_LABELS, STAGE_LABELS } from './state.js';
import { openDialog } from './dialog.js';

export function renderGrid() {
  const grid = $('template-grid');
  const empty = $('template-grid-empty');
  if (!grid) return;

  grid.querySelectorAll('.template-tile').forEach((el) => el.remove());

  const filtered = state.templates.filter((t) => {
    if (state.activeStage && t.stage !== state.activeStage) return false;
    if (state.activeRole && t.recipientRole !== state.activeRole) return false;
    return true;
  });

  if (filtered.length === 0) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  for (const tmpl of filtered) {
    const tile = document.createElement('div');
    tile.className = 'template-tile';
    tile.setAttribute('role', 'listitem');
    tile.dataset.templateId = tmpl.id;
    tile.innerHTML = `
      <div class="template-tile__tags">
        <span class="template-tile__stage">${esc(tmpl.id)} · ${esc(STAGE_LABELS[tmpl.stage] || tmpl.stageName)}</span>
        <span class="template-tile__role">${esc(ROLE_LABELS[tmpl.recipientRole] || tmpl.recipientRole)}</span>
      </div>
      <h3 class="template-tile__title">${esc(tmpl.title)}</h3>
      <p class="template-tile__desc">${esc(tmpl.description)}</p>
      <button type="button" class="template-tile__btn" data-id="${esc(tmpl.id)}">Generate</button>
    `;
    grid.appendChild(tile);
  }

  grid.querySelectorAll('.template-tile__btn').forEach((btn) => {
    on(btn, 'click', (e) => {
      state._returnFocus = e.currentTarget;
      const tmpl = state.templates.find((t) => t.id === e.currentTarget.dataset.id);
      if (tmpl) openDialog(tmpl);
    });
  });
}
