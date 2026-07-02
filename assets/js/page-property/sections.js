// page-property/sections.js — builder functions for property dossier sections.
// Self-contained pure functions that take a listing/scored/area/callbacks and return DOM.

import { galleryImages, floorplanImages, priceHistorySeries, netPriceChange } from '../listings/detail.js';
import { PERSONAL_STATUSES } from '../listings/reactions.js';
import { buildReasonPicker } from '../listings/reactions-ui.js';
import { buildRatingControl } from '../listings/rating-ui.js';
import { fmtPrice, fmtDate } from '../listings/format.js';
import { VERDICT_LABELS, STATUS_LABELS, PERSONAL_STATUS_LABELS } from '../listings/labels.js';
import { describeSignal } from '../learned-preferences.js';
import { url } from '../config.js';
import { el } from '../dom.js';

// Reusable Google-Maps button (same idiom as the listings feed). Null unless the
// listing carries coordinates.
export const mapBtn = (listing) => {
  if (listing.lat == null || listing.lng == null) return null;
  const a = el('a', { class: 'btn-map', href: `https://maps.google.com/?q=${listing.lat},${listing.lng}`, target: '_blank', rel: 'noopener', 'aria-label': 'Open location in Google Maps' });
  a.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false"><path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.5 4.5 8.5 4.5 8.5s4.5-5 4.5-8.5C12.5 3.515 10.485 1.5 8 1.5zm0 6.25A1.75 1.75 0 1 1 8 4.25a1.75 1.75 0 0 1 0 3.5z" fill="currentColor"/></svg><span class="btn-map__text">Open maps</span>`;
  return a;
};

// ── Gallery ──────────────────────────────────────────────────────────────────
// A hero image with prev/next arrows + keyboard stepping, a counter, and a
// wrapping row of small previews below (a true grid of thumbnails, not one
// awkward scroll strip). The active thumb is highlighted and kept in view.
export function buildGallery(listing) {
  const imgs = galleryImages(listing);
  if (!imgs.length) {
    return el('div', { class: 'dossier-gallery dossier-gallery--none', 'aria-hidden': 'true' },
      (listing.property_type || '•').slice(0, 1).toUpperCase());
  }

  let i = 0;
  const mainImg = el('img', {
    class: 'dossier-gallery__main-img', src: imgs[0], alt: listing.title || 'Property photo',
    loading: 'eager', decoding: 'async', referrerpolicy: 'no-referrer',
  });
  const counter = el('span', { class: 'dossier-gallery__count num' }, `1 / ${imgs.length}`);

  const prev = el('button', { type: 'button', class: 'dossier-gallery__nav dossier-gallery__nav--prev', 'aria-label': 'Previous photo' }, '‹');
  const next = el('button', { type: 'button', class: 'dossier-gallery__nav dossier-gallery__nav--next', 'aria-label': 'Next photo' }, '›');
  const multi = imgs.length > 1;

  // Full-screen affordance: the hero image and an explicit expand button both
  // open the lightbox (Phase 7). Built lazily on first open.
  const expand = el('button', { type: 'button', class: 'dossier-gallery__expand', 'aria-label': 'View photos full screen' }, '⤢');
  const main = el('div', { class: 'dossier-gallery__main' },
    [mainImg, multi ? prev : null, multi ? next : null, expand, counter].filter(Boolean));
  mainImg.addEventListener('error', () => { main.classList.add('is-broken'); }, { once: true });

  let thumbBtns = [];
  const show = (n) => {
    i = (n + imgs.length) % imgs.length;
    mainImg.src = imgs[i];
    counter.textContent = `${i + 1} / ${imgs.length}`;
    thumbBtns.forEach((b, idx) => {
      b.setAttribute('aria-current', String(idx === i));
      if (idx === i) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };
  prev.addEventListener('click', () => show(i - 1));
  next.addEventListener('click', () => show(i + 1));

  // ── Lightbox (native <dialog>, full-screen) ────────────────────────────────
  let lb = null, lbImg = null, lbCounter = null, lbIdx = 0;
  const lbShow = (n) => {
    lbIdx = (n + imgs.length) % imgs.length;
    lbImg.src = imgs[lbIdx];
    if (lbCounter) lbCounter.textContent = `${lbIdx + 1} / ${imgs.length}`;
  };
  const ensureLightbox = () => {
    if (lb) return lb;
    lbImg = el('img', { class: 'lightbox__img', alt: listing.title || 'Property photo', decoding: 'async', referrerpolicy: 'no-referrer' });
    lbCounter = el('span', { class: 'lightbox__count num' });
    const lbPrev = el('button', { type: 'button', class: 'lightbox__nav lightbox__nav--prev', 'aria-label': 'Previous photo' }, '‹');
    const lbNext = el('button', { type: 'button', class: 'lightbox__nav lightbox__nav--next', 'aria-label': 'Next photo' }, '›');
    const lbClose = el('button', { type: 'button', class: 'lightbox__close', 'aria-label': 'Close full-screen viewer' }, '✕');
    lbPrev.addEventListener('click', () => lbShow(lbIdx - 1));
    lbNext.addEventListener('click', () => lbShow(lbIdx + 1));
    lbClose.addEventListener('click', () => lb.close());
    const stage = el('div', { class: 'lightbox__stage' }, [lbImg, multi ? lbPrev : null, multi ? lbNext : null].filter(Boolean));
    lb = el('dialog', { class: 'lightbox', 'aria-label': `Photos (${imgs.length})` }, [
      el('div', { class: 'lightbox__bar' }, [lbCounter, lbClose]),
      stage,
    ]);
    if (multi) {
      lb.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); lbShow(lbIdx + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); lbShow(lbIdx - 1); }
      });
    }
    // Click the dialog backdrop or the empty stage area (not the image/controls) to close.
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target === stage) lb.close(); });
    // Keep the inline gallery in sync with wherever the lightbox ended.
    lb.addEventListener('close', () => show(lbIdx));
    document.body.appendChild(lb);
    return lb;
  };
  const openLightbox = () => { ensureLightbox(); lbShow(i); lb.showModal(); };
  mainImg.addEventListener('click', openLightbox);
  expand.addEventListener('click', openLightbox);

  // Keyboard arrows when the gallery (or anything inside it) has focus.
  const wrap = el('div', { class: 'dossier-gallery', tabindex: '0', role: 'group', 'aria-label': `Photos (${imgs.length})` });
  if (multi) {
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
    });
  }

  let thumbs = null;
  if (multi) {
    thumbBtns = imgs.map((src, idx) => {
      const t = el('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
      const b = el('button', { type: 'button', class: 'dossier-gallery__thumb', 'aria-label': `Photo ${idx + 1}`, 'aria-current': String(idx === 0) }, [t]);
      b.addEventListener('click', () => show(idx));
      return b;
    });
    thumbs = el('div', { class: 'dossier-gallery__thumbs', role: 'group', 'aria-label': 'Choose a photo' }, thumbBtns);
  }

  wrap.append(...[main, thumbs].filter(Boolean));
  return wrap;
}

// ── Headline ─────────────────────────────────────────────────────────────────
export function buildHeadline(listing, scored) {
  const verdict = scored?.verdict || 'unknown';
  const placeBits = [];
  if (listing.address) placeBits.push(listing.address);
  if (listing.outcode) placeBits.push(listing.outcode);

  const tags = [];
  if (listing.status && listing.status !== 'live') tags.push(el('span', { class: `listing-tag listing-tag--${listing.status}` }, STATUS_LABELS[listing.status] || listing.status));
  const series = priceHistorySeries(listing.price_history);
  const net = netPriceChange(series);
  if (net < 0) tags.push(el('span', { class: 'listing-tag listing-tag--drop' }, `↓ ${fmtPrice(-net)} since listed`));

  return el('header', { class: 'dossier-head' }, [
    el('div', { class: 'dossier-head__verdict' }, [
      el('span', { class: `fit-dot fit-dot--${verdict}`, 'aria-hidden': 'true' }),
      el('span', { class: `verdict verdict--${verdict}` }, VERDICT_LABELS[verdict]),
    ]),
    el('p', { class: 'dossier-head__price num' }, fmtPrice(listing.price)),
    el('h1', { class: 'dossier-head__title' }, listing.title || `${listing.beds ?? '?'}-bed ${listing.property_type || 'property'}`),
    placeBits.length ? el('p', { class: 'dossier-head__place' }, placeBits.join(' · ')) : null,
    tags.length ? el('div', { class: 'listing-tags' }, tags) : null,
    // Stage 6a: the external Rightmove link as the most obvious action, up top,
    // alongside an Open-maps button when the listing has coordinates.
    (listing.url || mapBtn(listing))
      ? el('div', { class: 'dossier-head__actions' }, [
          listing.url
            ? el('a', { class: 'dossier-head__rm btn-rm btn-rm--primary', href: listing.url, target: '_blank', rel: 'noopener' }, 'View on Rightmove ↗')
            : null,
          mapBtn(listing),
        ].filter(Boolean))
      : null,
  ].filter(Boolean));
}

// ── Key facts (only the fields we actually have) ─────────────────────────────
export function buildFacts(listing) {
  const rows = [
    ['Price', fmtPrice(listing.price)],
    ['Bedrooms', listing.beds != null ? String(listing.beds) : null],
    ['Bathrooms', listing.baths != null ? String(listing.baths) : null],
    ['Type', listing.property_type],
    ['Status', STATUS_LABELS[listing.status] || listing.status],
    ['Listed', fmtDate(listing.added_date)],
    ['Outcode', listing.outcode],
    ['Tenure', listing.tenure],          // null in the source payload → omitted
    ['EPC', listing.epc],                // null → omitted
    ['Council tax', listing.council_tax],// null → omitted
  ].filter(([, v]) => v != null && v !== '');

  return el('section', { class: 'dossier-section' }, [
    el('h2', { class: 'dossier-section__label' }, 'Key facts'),
    el('dl', { class: 'dossier-facts' }, rows.flatMap(([k, v]) => [
      el('div', { class: 'dossier-facts__row' }, [
        el('dt', {}, k),
        el('dd', { class: 'num' }, v),
      ]),
    ])),
  ]);
}

// ── Floor plan (its own section — rendered only when the source carried one) ──
// Floor-plan data only exists on detail-page scrapes; if floorplanImages() is
// empty this returns null and the section is dropped (filtered out below).
export function buildFloorplan(listing) {
  const plans = floorplanImages(listing);
  if (!plans.length) return null;
  const frames = plans.map((src, idx) => {
    const img = el('img', {
      class: 'dossier-floorplan__img', src, loading: 'lazy', decoding: 'async',
      referrerpolicy: 'no-referrer',
      alt: plans.length > 1 ? `Floor plan ${idx + 1}` : 'Floor plan',
    });
    const frame = el('a', {
      class: 'dossier-floorplan__frame', href: src, target: '_blank', rel: 'noopener',
      'aria-label': 'Open floor plan full size',
    }, [img]);
    img.addEventListener('error', () => { frame.classList.add('is-broken'); }, { once: true });
    return frame;
  });
  return el('section', { class: 'dossier-section' }, [
    el('h2', { class: 'dossier-section__label' }, 'Floor plan'),
    el('div', { class: 'dossier-floorplan' }, frames),
  ]);
}

// ── Fit "why" (open, not collapsed — this is the dossier) ─────────────────────
export function buildWhy(scored) {
  const items = (scored.contributions || []).slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map((c) => {
    let label = c.label;
    if (typeof c.signal === 'string' && c.signal.startsWith('learned:')) {
      label = `${c.delta > 0 ? 'You tend to like' : 'You tend to pass on'} ${describeSignal(c.signal.slice('learned:'.length))}`;
    }
    return el('li', { class: `listing-why__item listing-why__item--${c.delta > 0 ? 'pos' : 'neg'}` }, [
      el('span', { class: 'listing-why__sign', 'aria-hidden': 'true' }, c.delta > 0 ? '＋' : '－'),
      el('span', { class: 'listing-why__label' }, label),
    ]);
  });
  if (!items.length) items.push(el('li', { class: 'listing-why__item' }, 'No distinguishing signals — a neutral fit.'));
  return el('section', { class: 'dossier-section' }, [
    el('h2', { class: 'dossier-section__label' }, 'Why this verdict'),
    scored.affordability?.headline ? el('p', { class: 'dossier-why__afford' }, scored.affordability.headline) : null,
    el('ul', { class: 'listing-why__list' }, items),
  ].filter(Boolean));
}

// ── Price history ─────────────────────────────────────────────────────────────
export function buildPriceHistory(listing) {
  const series = priceHistorySeries(listing.price_history);
  let body;
  if (series.length <= 1) {
    const only = series[0];
    body = el('p', { class: 'dossier-muted' }, only
      ? `Listed at ${fmtPrice(only.price)}${only.date ? ` on ${fmtDate(only.date)}` : ''} — no changes recorded since.`
      : 'No price history recorded yet.');
  } else {
    body = el('ol', { class: 'dossier-history' }, series.slice().reverse().map((p) => {
      const sign = p.kind === 'reduced' ? '↓' : p.kind === 'increased' ? '↑' : '•';
      const deltaTxt = p.kind === 'listed' ? 'Listed'
        : `${sign} ${fmtPrice(Math.abs(p.delta))} (${(p.pct * 100).toFixed(1)}%)`;
      return el('li', { class: `dossier-history__item dossier-history__item--${p.kind}` }, [
        el('span', { class: 'dossier-history__date' }, fmtDate(p.date)),
        el('span', { class: 'dossier-history__price num' }, fmtPrice(p.price)),
        el('span', { class: 'dossier-history__delta' }, deltaTxt),
      ]);
    }));
  }
  return el('section', { class: 'dossier-section' }, [
    el('h2', { class: 'dossier-section__label' }, 'Price history'),
    body,
  ]);
}

// ── Description ──────────────────────────────────────────────────────────────
export function buildDescription(listing) {
  if (!listing.description) return null;
  const paras = String(listing.description).split(/\n{2,}|\r\n\r\n/).map((s) => s.trim()).filter(Boolean);
  return el('section', { class: 'dossier-section' }, [
    el('h2', { class: 'dossier-section__label' }, 'Description'),
    el('div', { class: 'dossier-prose' }, (paras.length ? paras : [String(listing.description)]).map((p) => el('p', {}, p))),
  ]);
}

// ── Area context ─────────────────────────────────────────────────────────────
export function buildAreaCard(area) {
  if (!area) return null;
  const facts = [];
  if (area.councilTaxBand) facts.push(['Council tax band', area.councilTaxBand]);
  if (area.priceSummary?.avgDetached) facts.push(['Avg detached', fmtPrice(area.priceSummary.avgDetached)]);
  if (area.nearestStation) facts.push(['Nearest station', area.nearestStation]);
  return el('div', { class: 'dossier-card' }, [
    el('h2', { class: 'dossier-card__label' }, 'Area'),
    el('p', { class: 'dossier-card__name' }, area.name || area.id),
    facts.length ? el('dl', { class: 'dossier-facts dossier-facts--tight' }, facts.flatMap(([k, v]) => [
      el('div', { class: 'dossier-facts__row' }, [el('dt', {}, k), el('dd', { class: 'num' }, v)]),
    ])) : null,
    el('a', { class: 'dossier-card__link', href: `${url('pages/area-detail.html')}?id=${encodeURIComponent(area.id)}` }, `Explore ${area.name || 'this area'} →`),
  ].filter(Boolean));
}

// ── Areas within range (the m2m membership — "why this shows") ────────────────
// Every area whose geofence contains this property (nearest first, primary flagged).
// A property surfaces in your feed because it sits within range of an area you hold;
// this makes that explicit and complete, not just the single nearest village.
export function buildAreaMembership(listing) {
  const areas = Array.isArray(listing?.areas) ? listing.areas.slice() : [];
  if (!areas.length) return null;
  areas.sort((a, b) => (a?.distance_mi ?? Infinity) - (b?.distance_mi ?? Infinity));
  return el('section', { class: 'dossier-section' }, [
    el('h2', { class: 'dossier-section__label' }, `Areas within range (${areas.length})`),
    el('p', { class: 'dossier-section__hint' },
      'This property is inside the geofence of these areas — it shows in your feed because you hold at least one of them.'),
    el('ul', { class: 'dossier-areas' }, areas.map((a) => el('li', { class: 'dossier-areas__item' }, [
      el('a', { class: 'dossier-areas__name', href: `${url('pages/area-detail.html')}?id=${encodeURIComponent(a.area_id)}` }, a.name || a.area_id),
      el('span', { class: 'dossier-areas__dist num' },
        a.distance_mi != null ? `${Number(a.distance_mi).toFixed(1)} mi` : '—'),
      a.is_primary ? el('span', { class: 'dossier-areas__primary' }, 'primary') : null,
    ].filter(Boolean)))),
  ]);
}

// ── Actions (multi-reason picker + Save + status) ────────────────────────────
// The Rightmove link now lives prominently in the dossier header (buildHeadline),
// not buried here. The shared picker gives the same multi-select reasons +
// sub-reasons + Save as the listings surfaces.
export function buildActions(listing, current, onSave, onStatus, onRate) {
  const sel = el('select', { class: 'listing-status', 'aria-label': 'Personal status' }, [
    el('option', { value: '' }, 'No status'),
    ...PERSONAL_STATUSES.map((s) => el('option', { value: s, selected: current?.status === s }, PERSONAL_STATUS_LABELS[s])),
  ]);
  sel.addEventListener('change', () => onStatus(sel.value || null));

  return el('div', { class: 'dossier-actions' }, [
    el('p', { class: 'dossier-card__label' }, 'Your call'),
    buildReasonPicker({ variant: 'dossier', current, onSave }),
    el('div', { class: 'dossier-actions__row' }, [
      el('label', { class: 'listing-status-wrap' }, [el('span', { class: 'listing-status__label' }, 'Status'), sel]),
      buildRatingControl({ value: current?.rating ?? null, onChange: onRate }),
    ]),
  ]);
}
