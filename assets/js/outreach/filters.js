import { byId as $, on } from '../dom.js';
import { state } from './state.js';
import { renderGrid } from './grid.js';

export function bindFilters() {
  const stageBar = $('stage-filter');
  const roleBar = $('role-filter');

  stageBar?.querySelectorAll('.filter-chip').forEach((btn) => {
    on(btn, 'click', () => {
      stageBar.querySelectorAll('.filter-chip').forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      state.activeStage = btn.dataset.stage;
      renderGrid();
    });
  });

  roleBar?.querySelectorAll('.filter-chip').forEach((btn) => {
    on(btn, 'click', () => {
      roleBar.querySelectorAll('.filter-chip').forEach((b) => {
        b.classList.remove('is-active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
      state.activeRole = btn.dataset.role;
      renderGrid();
    });
  });
}
