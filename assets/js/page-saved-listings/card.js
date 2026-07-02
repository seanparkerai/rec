// page-saved-listings/card.js — pure view-builder for one saved (liked) card:
// a thin composition of THE shared property-card family (step 3.4d). The shared
// builder owns the anatomy (media well · badge + mono price · title/place/meta);
// Saved composes its own chrome into the slots — the "why you liked it" positive
// chips, the collapsed reaction editor, the 1–10 rating control, and the external
// Rightmove link. No page state, no storage; imported by page-saved-listings.js.
import { el } from '../dom.js';
import { url } from '../config.js';
import { LIKE_REASONS, LIKE_SUBREASONS } from '../listings/reactions.js';
import { buildReasonPicker } from '../listings/reactions-ui.js';
import { buildRatingControl } from '../listings/rating-ui.js';
import { buildPropertyCard } from '../listings/property-card.js';

const dossierHref = (id) => `${url('pages/property.html')}?id=${encodeURIComponent(id)}&from=saved`;

// like key → label, and parent → { sub key → label }, for the read-only positives.
const LIKE_LABELS = Object.fromEntries(LIKE_REASONS.map((r) => [r.key, r.label]));
const SUB_LABELS = Object.fromEntries(
  Object.entries(LIKE_SUBREASONS).map(([k, subs]) => [k, Object.fromEntries(subs.map((s) => [s.key, s.label]))]),
);

/** Human labels for the captured like-reasons (chip text on the saved card). */
export function positiveLabels(reasons) {
  const out = [];
  for (const r of Array.isArray(reasons) ? reasons : []) {
    if (!r?.key) continue;
    const base = LIKE_LABELS[r.key] || r.key;
    const sub = r.detail ? SUB_LABELS[r.key]?.[r.detail] : null;
    out.push(sub ? `${base}: ${sub}` : base);
    if (r.note) out.push(r.note); // free-text note (rendered if any was ever captured)
  }
  return out;
}

function buildPositives(reasons) {
  const labels = positiveLabels(reasons);
  if (!labels.length) return null;
  return el('div', { class: 'listing-positives', 'aria-label': 'Why you liked it' },
    labels.map((t) => el('span', { class: 'listing-positives__chip' }, t)));
}

/**
 * One saved card. `listing` is the live row or the durable reaction snapshot.
 * @param {object} listing
 * @param {object} ctx  { reaction, rating, onSave(listing, draft), onRate(listing, n) }
 */
export function buildSavedCard(listing, ctx = {}) {
  const controls = el('div', { class: 'listing-controls' }, [
    // The like/reasons/Save controls are collapsed by default on Saved — the
    // "why you liked it" chips above already summarise the decision, and the
    // full editor also lives in the dossier. A native <details> keeps it
    // editable here without the buttons crowding every card on load
    // (keyboard- and reduced-motion-friendly; no JS).
    el('details', { class: 'listing-react-toggle' }, [
      el('summary', { class: 'listing-react-toggle__summary' }, 'Edit reaction'),
      buildReasonPicker({ variant: 'row', current: ctx.reaction, onSave: (d) => ctx.onSave(listing, d) }),
    ]),
    buildRatingControl({ value: ctx.rating, onChange: (n) => ctx.onRate(listing, n) }),
  ]);
  const rmLink = listing.url
    ? el('a', { class: 'btn-rm', href: listing.url, target: '_blank', rel: 'noopener' }, 'View on Rightmove ↗')
    : null;
  const actions = el('div', { class: 'listing-row-actions' }, [
    controls,
    rmLink ? el('div', { class: 'listing-links' }, [rmLink]) : null,
  ].filter(Boolean));

  const card = buildPropertyCard(listing, {
    href: dossierHref(listing.rightmove_id),
    badge: { label: '♥ Liked', tone: 'liked' },
    details: [buildPositives(ctx.reaction?.reasons)].filter(Boolean),
    actions,
  });
  card.setAttribute('role', 'listitem');
  return card;
}
