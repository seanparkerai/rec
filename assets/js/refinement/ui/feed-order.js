// refinement/ui/feed-order.js — the "Your feed order" section renderer (Pillar B).
// Shows the type order learned from genuine keep-rates (refinement/type-priority.js)
// with per-type evidence, and — golden rule: engine proposes, user confirms — a one-tap
// "Apply this order" that writes criteria.propertyTypePrefs.priority. Once applied, the
// rows gain accessible Up/Down buttons (manual reorder, WCAG-friendly — no drag) and a
// visible undo ("Back to simple preferences"). Callbacks are injected by the page.
import { esc } from '../../dom.js';
import { ordersDiffer } from '../type-priority.js';

const pctLabel = (row) => `${row.likes} of ${row.judged} liked (${Math.round(row.keepRate * 100)}%)`;

function rowHTML(entry, i, { applied, count }) {
  const stats = entry.judged > 0
    ? `<span class="fo-row__stats">${esc(pctLabel(entry))}${entry.thin ? ' · thin evidence' : ''}</span>`
    : '<span class="fo-row__stats">no judgements yet</span>';
  const move = applied ? `
      <span class="fo-row__move">
        <button type="button" class="ref-action ref-action--ghost fo-btn" data-fo-move="up" data-fo-index="${i}"
          aria-label="Move ${esc(entry.label)} up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="ref-action ref-action--ghost fo-btn" data-fo-move="down" data-fo-index="${i}"
          aria-label="Move ${esc(entry.label)} down" ${i === count - 1 ? 'disabled' : ''}>↓</button>
      </span>` : '';
  return `
    <li class="fo-row${entry.thin ? ' fo-row--thin' : ''}">
      <span class="fo-row__rank">${i + 1}</span>
      <span class="fo-row__type">${esc(entry.label)}</span>
      ${stats}
      ${move}
    </li>`;
}

/**
 * @param {HTMLElement|null} el
 * @param {object} args
 * @param {Array}  args.learned    computeTypePriority() rows, best-first.
 * @param {object} args.prefs      criteria.propertyTypePrefs (may be empty).
 * @param {(order: string[], source: string) => Promise<void>} args.onApply
 * @param {() => Promise<void>} args.onClear
 */
export function renderFeedOrder(el, { learned = [], prefs = {}, onApply, onClear } = {}) {
  if (!el) return;
  const appliedOrder = Array.isArray(prefs.priority) ? prefs.priority : [];
  const applied = appliedOrder.length > 0;
  const learnedOrder = learned.map((r) => r.type);
  const byType = new Map(learned.map((r) => [r.type, r]));

  if (!learned.length && !applied) {
    el.innerHTML = '<p class="ref-empty">React to a few more listings and your property types will rank themselves here by how often you keep each one.</p>';
    return;
  }

  // Rows: the applied order when one is in force (annotated with learned evidence),
  // otherwise the learned proposal.
  const entries = applied
    ? appliedOrder.map((t) => byType.get(t) || { type: t, label: t.replace(/\b[a-z]/g, (c) => c.toUpperCase()), likes: 0, rejects: 0, judged: 0, keepRate: 0, thin: true })
    : learned;

  const differs = ordersDiffer(learnedOrder, appliedOrder);
  const newTypes = applied ? learnedOrder.filter((t) => !appliedOrder.includes(t)) : [];

  const status = applied
    ? `<p class="fo-status">This order drives your feed${prefs.prioritySource === 'manual' ? ' (manually adjusted)' : ''} — best-fit sorting boosts the top types and demotes the bottom ones.</p>`
    : `<p class="fo-status">Learned from your genuine judgements — not applied yet. Your feed currently uses the simple preferred/acceptable tiers.</p>`;

  const applyBtn = !applied
    ? `<button type="button" class="ref-action ref-action--apply" data-fo-action="apply">Apply this order to my feed</button>`
    : (differs
      ? `<button type="button" class="ref-action ref-action--hide" data-fo-action="apply">Update to the latest learned order${newTypes.length ? ` (+${newTypes.length} new type${newTypes.length === 1 ? '' : 's'})` : ''}</button>`
      : '');
  const clearBtn = applied
    ? `<button type="button" class="ref-action ref-action--ghost" data-fo-action="clear">Back to simple preferences</button>`
    : '';

  el.innerHTML = `
    ${status}
    <ol class="fo-list">${entries.map((e, i) => rowHTML(e, i, { applied, count: entries.length })).join('')}</ol>
    <footer class="fo-actions">${applyBtn}${clearBtn}</footer>`;

  // Wiring — direct listeners on the freshly rendered controls.
  el.querySelector('[data-fo-action="apply"]')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    await onApply?.(learnedOrder, 'learned');
  });
  el.querySelector('[data-fo-action="clear"]')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    await onClear?.();
  });
  for (const btn of el.querySelectorAll('[data-fo-move]')) {
    btn.addEventListener('click', async () => {
      const i = Number(btn.dataset.foIndex);
      const j = btn.dataset.foMove === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= appliedOrder.length) return;
      const next = appliedOrder.slice();
      [next[i], next[j]] = [next[j], next[i]];
      btn.disabled = true;
      await onApply?.(next, 'manual');
    });
  }
}
