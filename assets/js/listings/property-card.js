// listings/property-card.js — THE shared property-card family (step 3.4b).
// The ⚙ 3.1 owner decision: the three property surfaces (Browse, Saved,
// Rejected/Passed) stay separate pages but drive from ONE primary design.
// This module is that design's skeleton: a pure, slot-based builder that owns
// the shared anatomy — media well · headline (verdict + price) · title link ·
// place · meta — while each surface composes its own chrome (reaction rows,
// status controls, verdict badges) into the named slots. Pure DOM building,
// no page state, no storage; styled by components/property-card.css
// (Linear-dense anchor; the rejected page's row-on-hairline cleanliness is
// the calibration bar).
//
// Strangler note: built beside the legacy listing-card/deck-card/rejected-row
// builders; pages cut over at 3.4c/3.4d, after which the bespoke builders die.
import { el } from '../dom.js';
import { fmtPrice } from './format.js';

/** Display title shared by every surface (same fallback the legacy builders used). */
export function propertyTitle(listing) {
  return listing.title || `${listing.beds ?? '?'}-bed ${listing.property_type || 'property'}`;
}

/** "Address · OUTCODE" place line; area name stands in when the address is missing. */
export function propertyPlace(listing, areaName = '') {
  const bits = [];
  if (listing.address) bits.push(listing.address);
  else if (areaName) bits.push(areaName);
  if (listing.outcode) bits.push(listing.outcode);
  return bits.join(' · ');
}

/** "3 bed · 2 bath · detached" data line (monospace in CSS). */
export function propertyMeta(listing) {
  return [
    listing.beds != null ? `${listing.beds} bed` : '',
    listing.baths != null ? `${listing.baths} bath` : '',
    listing.property_type || '',
  ].filter(Boolean).join(' · ');
}

// Shared media well: lazy, async-decoded, referrer-stripped, with a monogram
// fallback swapped in on load error so a card never shows a broken box. When a
// dossier href is given the whole image is the (labelled) affordance.
function buildMedia(listing, href) {
  const title = propertyTitle(listing);
  const monogram = () => el('div', { class: 'prop-card__media prop-card__media--none', 'aria-hidden': 'true' },
    (listing.property_type || '•').slice(0, 1).toUpperCase());
  const inner = listing.image_url
    ? (() => {
        const img = el('img', {
          class: 'prop-card__img', src: listing.image_url, alt: href ? '' : `Photo of ${title}`,
          loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
        });
        const box = el('div', { class: 'prop-card__media' }, [img]);
        img.addEventListener('error', () => box.replaceWith(monogram()), { once: true });
        return box;
      })()
    : monogram();
  return href
    ? el('a', { class: 'prop-card__media-link', href, 'aria-label': `Open dossier for ${title}` }, [inner])
    : inner;
}

/**
 * Build one property card.
 *
 * @param {object} listing  the listing row / reaction snapshot (rightmove_id,
 *                          title, address, outcode, price, beds, baths,
 *                          property_type, image_url).
 * @param {object} [opts]
 * @param {string}  [opts.href]         dossier link — wraps media + title.
 * @param {string}  [opts.areaName]     place fallback when address is missing.
 * @param {string}  [opts.verdict]      fit-verdict key (strong|possible|stretch|weak|reject|unknown).
 * @param {string}  [opts.verdictLabel] display label for the verdict (caller owns vocab).
 * @param {{label:string, tone?:string}} [opts.badge]  surface badge (e.g. Rejected/Passed/Saved).
 * @param {string}  [opts.metaExtra]    appended data-line text (e.g. "Actioned 3 Jun 2026").
 * @param {Node[]}  [opts.overlay]      chip nodes laid OVER the cover photo (price drop, New).
 * @param {Node[]}  [opts.tags]         chip nodes (caller-built; exception chips — status, flags).
 * @param {Node[]}  [opts.details]      expandable/why/membership nodes (caller-built).
 * @param {Node}    [opts.actions]      the thumb-zone action row (reactions, status, links).
 * @param {boolean} [opts.compact]      dense list-row variant (the Rejected-page register).
 * @returns {HTMLElement} <article class="prop-card" data-id="…">
 */
export function buildPropertyCard(listing, opts = {}) {
  const href = opts.href || null;
  const title = propertyTitle(listing);
  const meta = [propertyMeta(listing), opts.metaExtra || ''].filter(Boolean).join(' · ');

  // Price leads the head (the Rightmove register, owner decision 2026-07-02);
  // the verdict follows it, the badge sits at the far edge.
  const head = el('div', { class: 'prop-card__head' }, [
    el('span', { class: 'prop-card__price' }, fmtPrice(listing.price)),
    opts.verdict ? el('span', { class: `prop-card__dot prop-card__dot--${opts.verdict}`, 'aria-hidden': 'true' }) : null,
    opts.verdictLabel ? el('span', { class: `prop-card__verdict prop-card__verdict--${opts.verdict || 'unknown'}` }, opts.verdictLabel) : null,
    opts.badge ? el('span', { class: `prop-card__badge prop-card__badge--${opts.badge.tone || 'neutral'}` }, opts.badge.label) : null,
  ].filter(Boolean));

  const body = el('div', { class: 'prop-card__body' }, [
    head,
    el('p', { class: 'prop-card__title' }, [
      href
        ? el('a', { class: 'prop-card__title-link', href }, title)
        : el('span', { class: 'prop-card__title-link' }, title),
    ]),
    (() => { const p = propertyPlace(listing, opts.areaName || ''); return p ? el('p', { class: 'prop-card__place' }, p) : null; })(),
    meta ? el('p', { class: 'prop-card__meta' }, meta) : null,
    Array.isArray(opts.tags) && opts.tags.length ? el('div', { class: 'prop-card__tags' }, opts.tags) : null,
    ...(Array.isArray(opts.details) ? opts.details : []),
    opts.actions ? el('div', { class: 'prop-card__actions' }, [opts.actions]) : null,
  ].filter(Boolean));

  // Overlay chips sit OVER the photo but OUTSIDE the labelled dossier link —
  // pointer-events pass through to the photo, and the chip text stays in the
  // accessibility tree (the link's aria-label would otherwise swallow it).
  const media = buildMedia(listing, href);
  const figure = Array.isArray(opts.overlay) && opts.overlay.length
    ? el('div', { class: 'prop-card__figure' }, [
        media,
        el('div', { class: 'prop-card__overlay' }, opts.overlay),
      ])
    : media;

  return el('article', {
    class: `prop-card${opts.compact ? ' prop-card--compact' : ''}`,
    'data-id': listing.rightmove_id,
  }, [figure, body]);
}
