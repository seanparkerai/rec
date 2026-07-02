// page-listings/row.js — pure view-builders for a single listing: the feed row
// (buildRow) and the review-deck card (buildDeckCard), plus their shared low-level
// pieces (media well, geo/flag chips, the explainable "why" details).
// Builders take data + handler callbacks and return DOM nodes; they hold no page
// state. Split from page-listings.js; imported by it.
import { el } from '../dom.js';
import { url } from '../config.js';
import { fmtPrice, fmtAgo, fmtDate, fmtAreaMembership, lastPriceDrop } from '../listings/format.js';
import { classifyListing, HIDE_LABELS } from '../listings/flags.js';
import { matchingHideRule } from '../refinement/view.js';
import { describeSignal } from '../learned-preferences.js';
import { buildReasonPicker } from '../listings/reactions-ui.js';
import { VERDICT_LABELS, STATUS_LABELS } from '../listings/labels.js';
import { buildPropertyCard } from '../listings/property-card.js';

const dossierHref = (listing) => `${url('pages/property.html')}?id=${encodeURIComponent(listing.rightmove_id)}&from=listings`;

const mapBtn = (listing) => {
  if (listing.lat == null || listing.lng == null) return null;
  const a = el('a', { class: 'btn-map', href: `https://maps.google.com/?q=${listing.lat},${listing.lng}`, target: '_blank', rel: 'noopener', 'aria-label': 'Open location in Google Maps' });
  a.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.5 4.5 8.5 4.5 8.5s4.5-5 4.5-8.5C12.5 3.515 10.485 1.5 8 1.5zm0 6.25A1.75 1.75 0 1 1 8 4.25a1.75 1.75 0 0 1 0 3.5z" fill="currentColor"/></svg>`;
  return a;
};

// Build the geofence chips (distance · village, and the ⚠ flag for an unconfirmed
// location). Shared by the row and the deck card. `area` is the matched area record.
function geoChips(listing, area) {
  const chips = [];
  if (listing.distance_mi != null && listing.area_id) {
    const village = area?.name || listing.area_id;
    chips.push(el('span', { class: 'listing-tag listing-tag--geo' }, `${Number(listing.distance_mi).toFixed(1)} mi · ${village}`));
  }
  if (listing.corroborated === false) {
    chips.push(el('span', { class: 'listing-tag listing-tag--warn', title: 'The map position and the address text disagree on the village' }, '⚠ location unconfirmed'));
  }
  return chips;
}

// The full m2m area membership — every area whose geofence contains this listing,
// nearest first, primary flagged. This is the explicit "why is this showing for me"
// answer the feed owes the user: a listing surfaces because it sits within range of
// (an) area you hold. Collapsed by default (a card can be a member of many areas) so
// the feed stays scannable on a phone; the count is in the summary. Falls back to the
// single primary area when membership hasn't been attached (older/uncached reads).
function buildAreaMembership(listing, area) {
  const areas = Array.isArray(listing.areas) ? listing.areas : [];
  if (!areas.length) {
    if (listing.area_id == null || listing.distance_mi == null) return null;
    const name = area?.name || listing.area_id;
    return el('p', { class: 'listing-areas listing-areas--single' },
      `Within range of ${name} — ${Number(listing.distance_mi).toFixed(1)} mi`);
  }
  const n = areas.length;
  return el('details', { class: 'listing-areas' }, [
    el('summary', { class: 'listing-areas__summary' },
      `Within range of ${n} area${n === 1 ? '' : 's'} — why this shows`),
    el('p', { class: 'listing-areas__list' }, fmtAreaMembership(areas)),
  ]);
}

// The date the property was added to Rightmove (the source's addedOn), shown
// explicitly. Falls back to when we first saw it if the source omitted a date.
function addedText(listing) {
  if (listing.added_date) { const d = fmtDate(listing.added_date); if (d) return `Added ${d}`; }
  if (listing.first_seen) { const a = fmtAgo(listing.first_seen); if (a) return `First seen ${a}`; }
  return '';
}

// Post-fetch classifier chips (listing-flags.js). FLAG chips (new build, condition
// red-flags) are always shown — they're judgement calls you still want to see. The
// HIDE-reason chip only renders when a hidden listing is on screen (i.e. the user
// turned on "Show hidden"), labelling WHY it was hidden. Shared by row + deck card.
function flagChips(listing, hiddenRules = []) {
  const { hide, hideReasons, flags } = classifyListing(listing);
  const chips = flags.map((f) => el('span', { class: 'listing-tag listing-tag--flag' }, f.label));
  if (hide) {
    for (const r of hideReasons) {
      chips.push(el('span', {
        class: 'listing-tag listing-tag--hidden',
        title: 'Normally hidden — showing because “Show hidden” is on',
      }, `🚫 ${HIDE_LABELS[r] || r}`));
    }
  }
  // Stage 5: a listing hidden by a confirmed refinement (a value the user chose to
  // hide from the feed) only renders when "Show hidden" is on; label WHY it's hidden.
  const refRule = matchingHideRule(listing, hiddenRules);
  if (refRule) {
    chips.push(el('span', {
      class: 'listing-tag listing-tag--hidden',
      title: 'Hidden by a refinement you confirmed — showing because “Show hidden” is on',
    }, `🚫 Hidden by refinement: ${refRule.label}`));
  }
  return chips;
}

function buildWhy(scored, listing = null, area = null) {
  // L7 location context (never silent): surface the geofence distance and, when
  // the two location signals disagree, an explicit caution.
  const context = [];
  if (listing && listing.corroborated === false) {
    const mi = listing.distance_mi != null ? `${Number(listing.distance_mi).toFixed(1)} mi from ${area?.name || 'the nearest village'}` : `near ${area?.name || 'the nearest village'}`;
    context.push(el('li', { class: 'listing-why__item listing-why__item--warn' }, [
      el('span', { class: 'listing-why__sign', 'aria-hidden': 'true' }, '⚠'),
      el('span', { class: 'listing-why__label' }, `Coordinates place this ${mi}, but the listing's address text reads differently — check the location before trusting.`),
    ]));
  } else if (listing && listing.distance_mi != null && area) {
    context.push(el('li', { class: 'listing-why__item listing-why__item--context' }, [
      el('span', { class: 'listing-why__sign', 'aria-hidden': 'true' }, '📍'),
      el('span', { class: 'listing-why__label' }, `${Number(listing.distance_mi).toFixed(1)} mi from ${area.name}.`),
    ]));
  }
  const items = (scored.contributions || [])
    .slice()
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .map((c) => {
      const sign = c.delta > 0 ? '＋' : '－';
      // Prettify the L4 learned-preference contributions (the scoring seam labels
      // them "Learned preference: <signal>"); keep everything else verbatim.
      let label = c.label;
      if (typeof c.signal === 'string' && c.signal.startsWith('learned:')) {
        const verb = c.delta > 0 ? 'You tend to like' : 'You tend to pass on';
        label = `${verb} ${describeSignal(c.signal.slice('learned:'.length))}`;
      }
      return el('li', { class: `listing-why__item listing-why__item--${c.delta > 0 ? 'pos' : 'neg'}` }, [
        el('span', { class: 'listing-why__sign', 'aria-hidden': 'true' }, sign),
        el('span', { class: 'listing-why__label' }, label),
      ]);
    });
  if (!items.length) items.push(el('li', { class: 'listing-why__item' }, 'No distinguishing signals — neutral fit.'));
  return el('details', { class: 'listing-why' }, [
    el('summary', {}, 'Why this verdict'),
    el('ul', { class: 'listing-why__list' }, [...context, ...items]),
  ]);
}

// Shared media well with graceful fallback: a broken/blocked image swaps to a
// monogram so a card never shows a stretched or empty box. `base` is the BEM block.
// When `href` is given (Stage 6b), the media is a keyboard-accessible link that
// opens OUR dossier (distinct from the external Rightmove button) — the whole
// image becomes the affordance, not a bare click handler on an <img>.
function buildMedia(listing, base, href) {
  const title = listing.title || `${listing.beds ?? '?'}-bed ${listing.property_type || 'property'}`;
  const monogram = () => el('div', { class: `${base} ${base}--none`, 'aria-hidden': 'true' },
    (listing.property_type || '•').slice(0, 1).toUpperCase());
  const inner = listing.image_url
    ? (() => {
        const img = el('img', {
          // Inside the labelled dossier link the image is decorative (alt="" avoids
          // a double announcement); standalone it carries the property as its alt.
          class: `${base}__img`, src: listing.image_url, alt: href ? '' : `Photo of ${title}`,
          loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
        });
        const box = el('div', { class: base }, [img]);
        // Replace only the inner box on error; any wrapping link stays in place.
        img.addEventListener('error', () => box.replaceWith(monogram()), { once: true });
        return box;
      })()
    : monogram();
  function wrapLink(node) {
    return el('a', {
      class: `${base}-link`, href, 'aria-label': `Open dossier for ${title}`,
    }, [node]);
  }
  return href ? wrapLink(inner) : inner;
}

// The Browse feed row IS the shared property-card (step 3.4c; slimmed to the
// Rightmove register 3.11, owner decision 2026-07-02): a big cover photo, then
// price · verdict / data line / address, with exception chips only. Recency and
// price-drop signals overlay the photo; distance is core data on the meta line;
// the why/membership expanders, external links and status control all live in
// the dossier (one tap away via photo or title). Actions = the reaction picker
// alone. Rows sit as role="listitem" articles inside the page's .prop-list
// register.
export function buildRow(listing, idx, scored, area, ctx = {}) {
  const verdict = scored?.verdict || 'unknown';

  // Photo overlay: the two "look now" signals sit on the cover image.
  const overlay = [];
  const drop = lastPriceDrop(listing);
  if (drop) overlay.push(el('span', { class: 'listing-tag listing-tag--drop' }, `↓ ${fmtPrice(drop)}`));
  if (listing.update_reason === 'new') overlay.push(el('span', { class: 'listing-tag listing-tag--new' }, 'New'));

  // Exception chips only: sale status, the location caution, classifier flags.
  const tags = [];
  if (listing.status && listing.status !== 'live') {
    tags.push(el('span', { class: `listing-tag listing-tag--${listing.status}` }, STATUS_LABELS[listing.status] || listing.status));
  }
  if (listing.corroborated === false) {
    tags.push(el('span', { class: 'listing-tag listing-tag--warn', title: 'The map position and the address text disagree on the village' }, '⚠ location unconfirmed'));
  }
  tags.push(...flagChips(listing, ctx.hiddenRules));

  // Distance is core scan-time data — it joins the mono data line.
  const distance = listing.distance_mi != null && (area?.name || listing.area_id)
    ? `${Number(listing.distance_mi).toFixed(1)} mi from ${area?.name || listing.area_id}`
    : '';

  const actions = ctx.onSave
    ? buildReasonPicker({
        variant: 'row',
        current: ctx.reaction,
        draft: ctx.draft || null,
        onDraftChange: ctx.onDraftChange || null,
        onSave: (d) => ctx.onSave(listing, d),
      })
    : null;

  const card = buildPropertyCard(listing, {
    href: dossierHref(listing),
    areaName: area?.name || '',
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    badge: ctx.reviewed
      ? { label: '✓ Reviewed', tone: REVIEWED_MOD[ctx.reaction?.reaction] || 'neutral' }
      : null,
    metaExtra: distance,
    overlay,
    tags,
    actions,
  });
  card.setAttribute('role', 'listitem');
  return card;
}

// Reaction verb → reviewed-card modifier (green "actioned" tint, distinct per verb).
export const REVIEWED_MOD = { like: 'liked', reject: 'rejected', pass: 'passed' };

export function buildDeckCard(listing, scored, area, handlers) {
  const verdict = scored?.verdict || 'unknown';
  const media = buildMedia(listing, 'deck-media', dossierHref(listing));

  const tags = [];
  if (listing.status && listing.status !== 'live') tags.push(el('span', { class: `listing-tag listing-tag--${listing.status}` }, STATUS_LABELS[listing.status] || listing.status));
  const drop = lastPriceDrop(listing);
  if (drop) tags.push(el('span', { class: 'listing-tag listing-tag--drop' }, `↓ ${fmtPrice(drop)}`));
  tags.push(...geoChips(listing, area));
  tags.push(...flagChips(listing, handlers.hiddenRules));

  const placeBits = [];
  if (listing.address) placeBits.push(listing.address);
  else if (area?.name) placeBits.push(area.name);
  if (listing.outcode) placeBits.push(listing.outcode);

  const metaBits = [
    listing.beds != null ? `${listing.beds} bed` : '',
    listing.baths != null ? `${listing.baths} bath` : '',
    listing.property_type || '',
    addedText(listing),
  ].filter(Boolean);

  const body = el('div', { class: 'deck-card__body' }, [
    el('div', { class: 'deck-card__head' }, [
      el('span', { class: `fit-dot fit-dot--${verdict}`, 'aria-hidden': 'true' }),
      el('span', { class: `verdict verdict--${verdict}` }, VERDICT_LABELS[verdict]),
      el('span', { class: 'deck-card__price num' }, fmtPrice(listing.price)),
    ]),
    el('p', { class: 'deck-card__title' }, listing.title || `${listing.beds ?? '?'}-bed ${listing.property_type || 'property'}`),
    el('p', { class: 'deck-card__place' }, placeBits.join(' · ')),
    el('p', { class: 'deck-card__meta num' }, metaBits.join(' · ')),
    tags.length ? el('div', { class: 'listing-tags' }, tags) : null,
    buildAreaMembership(listing, area),
    buildWhy(scored, listing, area),
    el('div', { class: 'deck-card__links' }, [
      el('a', { class: 'deck-card__open', href: dossierHref(listing) }, 'Full details →'),
      listing.url ? el('a', { class: 'deck-card__rm btn-rm', href: listing.url, target: '_blank', rel: 'noopener' }, 'View on Rightmove ↗') : null,
      mapBtn(listing),
    ].filter(Boolean)),
    buildReasonPicker({
      variant: 'deck',
      current: handlers.current || null,
      draft: handlers.draft || null,
      onDraftChange: handlers.onDraftChange || null,
      onSave: (d) => handlers.onSave(d),
    }),
  ].filter(Boolean));

  return el('article', { class: 'deck-card', 'data-id': listing.rightmove_id }, [media, body]);
}
