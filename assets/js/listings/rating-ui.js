// listing-rating-ui.js — the shared 1–10 priority rating control, used on the
// Saved listings cards and on the dossier for liked listings. A plain labelled
// <select> (accessible, compact, keyboard-native); "—" clears the rating. The
// rating is stored on the shortlist row (storage.setListingRating) and feeds the
// fit score as a positive-only nudge (listing-fit.js).
import { el } from '../dom.js';

/**
 * @param {object} opts
 * @param {number|null} [opts.value]   current rating (1–10) or null/undefined
 * @param {(n:number|null)=>void} opts.onChange  fired with the new rating or null
 * @returns {HTMLElement} a <label> wrapping the select
 */
export function buildRatingControl({ value = null, onChange } = {}) {
  const cur = Number(value);
  const sel = el('select', { class: 'listing-rating', 'aria-label': 'Your priority rating, 1 to 10 (10 = highest)' }, [
    el('option', { value: '', selected: !(cur >= 1) }, 'Rate 1–10'),
    ...Array.from({ length: 10 }, (_, i) => i + 1).map((n) =>
      el('option', { value: String(n), selected: cur === n }, String(n))),
  ]);
  sel.addEventListener('change', () => onChange?.(sel.value === '' ? null : Number(sel.value)));
  return el('label', { class: 'listing-rating-wrap' }, [
    el('span', { class: 'listing-rating__label' }, 'Priority'),
    sel,
  ]);
}
