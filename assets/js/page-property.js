// page-property.js — v3 L6 per-listing dossier coordinator.
// Renders a single listing (?id=<rightmove_id>) as a considered, reading-first
// dossier: photo gallery, headline + fit verdict, key facts (only the ones we
// actually have — tenure/EPC/council-tax aren't in the source payload, so their
// rows are omitted rather than shown empty), an OPEN "why this verdict", price
// history, area context, the full description, and the reaction/status controls.
// No outreach — that lives elsewhere and is intentionally not joined here.
import {
  getListing, getFinances, getCriteria, getAreas,
  getListingReactions, saveListingReaction,
  getShortlistStatuses, setShortlistStatus,
  getLearnedPreferences, recomputeLearnedPreferences,
} from './storage.js';
import { deriveFinances } from './finance-derive.js';
import { scoreListingFit } from './listing-fit.js';
import { effectiveWeights, listingLearnedPrefs, describeSignal } from './learned-preferences.js';
import { galleryImages, floorplanImages, priceHistorySeries, netPriceChange } from './listing-detail.js';
import { PERSONAL_STATUSES } from './listing-reactions.js';
import { buildReasonPicker } from './listing-reactions-ui.js';
import { url } from './config.js';
import { el, clear, byId } from './dom.js';

const VERDICT_LABELS = { strong: 'Strong match', possible: 'Possible match', stretch: 'Stretch', weak: 'Weak match', reject: 'Reject', unknown: 'Unscored' };
const STATUS_LABELS = { live: 'For sale', under_offer: 'Under offer', sstc: 'Sold STC', withdrawn: 'Withdrawn' };
const PERSONAL_STATUS_LABELS = { new: 'New', saved: 'Saved', viewed: 'Viewed', offered: 'Offered', rejected: 'Rejected' };

const fmtPrice = (n) => (n == null ? '—' : '£' + Math.round(n).toLocaleString('en-GB'));
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

// ── Gallery ──────────────────────────────────────────────────────────────────
// A hero image with prev/next arrows + keyboard stepping, a counter, and a
// wrapping row of small previews below (a true grid of thumbnails, not one
// awkward scroll strip). The active thumb is highlighted and kept in view.
function buildGallery(listing) {
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

  const main = el('div', { class: 'dossier-gallery__main' },
    [mainImg, multi ? prev : null, multi ? next : null, counter].filter(Boolean));
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
function buildHeadline(listing, scored) {
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
    // Stage 6a: the external Rightmove link as the most obvious action, up top.
    listing.url
      ? el('a', { class: 'dossier-head__rm btn-rm btn-rm--primary', href: listing.url, target: '_blank', rel: 'noopener' }, 'View on Rightmove ↗')
      : null,
  ].filter(Boolean));
}

// ── Key facts (only the fields we actually have) ─────────────────────────────
function buildFacts(listing) {
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
function buildFloorplan(listing) {
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
function buildWhy(scored) {
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
function buildPriceHistory(listing) {
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
function buildDescription(listing) {
  if (!listing.description) return null;
  const paras = String(listing.description).split(/\n{2,}|\r\n\r\n/).map((s) => s.trim()).filter(Boolean);
  return el('section', { class: 'dossier-section' }, [
    el('h2', { class: 'dossier-section__label' }, 'Description'),
    el('div', { class: 'dossier-prose' }, (paras.length ? paras : [String(listing.description)]).map((p) => el('p', {}, p))),
  ]);
}

// ── Area context ─────────────────────────────────────────────────────────────
function buildAreaCard(area) {
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

// ── Actions (multi-reason picker + Save + status) ────────────────────────────
// The Rightmove link now lives prominently in the dossier header (buildHeadline),
// not buried here. The shared picker gives the same multi-select reasons +
// sub-reasons + Save as the listings surfaces.
function buildActions(listing, current, onSave, onStatus) {
  const sel = el('select', { class: 'listing-status', 'aria-label': 'Personal status' }, [
    el('option', { value: '' }, 'No status'),
    ...PERSONAL_STATUSES.map((s) => el('option', { value: s, selected: current?.status === s }, PERSONAL_STATUS_LABELS[s])),
  ]);
  sel.addEventListener('change', () => onStatus(sel.value || null));

  return el('div', { class: 'dossier-actions' }, [
    el('p', { class: 'dossier-card__label' }, 'Your call'),
    buildReasonPicker({ variant: 'dossier', current, onSave }),
    el('label', { class: 'listing-status-wrap' }, [el('span', { class: 'listing-status__label' }, 'Status'), sel]),
  ]);
}

function notFound(mount, msg) {
  clear(mount);
  mount.appendChild(el('div', { class: 'dossier-empty' }, [
    el('p', { class: 'dossier-empty__title' }, msg || 'Listing not found'),
    el('p', { class: 'dossier-muted' }, 'It may have been withdrawn, or the link is out of date.'),
    el('a', { class: 'dossier-back', href: url('pages/listings.html') }, '← Back to listings'),
  ]));
}

async function render() {
  const mount = document.querySelector('[data-property]') || byId('main');
  if (!mount) return;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { notFound(mount, 'No listing specified'); return; }

  const listing = await getListing(id);
  if (!listing) { notFound(mount, 'Listing not found'); return; }

  const [rawFinances, criteria, areas, reactions, statuses, learned] = await Promise.all([
    getFinances(), getCriteria(), getAreas(), getListingReactions(), getShortlistStatuses(), getLearnedPreferences(),
  ]);
  const finances = rawFinances ? deriveFinances(rawFinances) : null;
  const area = (areas || []).find((a) => a.id === listing.area_id) || null;
  const effective = effectiveWeights(learned?.derived || {}, learned?.overrides || {});
  const scored = finances
    ? scoreListingFit({ listing, finances, criteria, area, learnedPrefs: listingLearnedPrefs(listing, effective) })
    : { verdict: 'unknown', score: 0, gated: false, contributions: [] };

  const current = {
    reaction: reactions[listing.rightmove_id]?.reaction || null,
    reasons: reactions[listing.rightmove_id]?.reasons || [],
    status: statuses[listing.rightmove_id] || '',
  };
  const snapshotOf = (l) => ({
    rightmove_id: l.rightmove_id, title: l.title, address: l.address, outcode: l.outcode,
    area_id: l.area_id, price: l.price, beds: l.beds, baths: l.baths,
    property_type: l.property_type, status: l.status, url: l.url,
  });
  let retrainTimer = null;
  // Persist on Save (the consolidated decision) — one clean append-only row.
  const onSave = async ({ reaction, reasons }) => {
    await saveListingReaction({ listing_id: listing.rightmove_id, reaction, reasons, listing_snapshot: snapshotOf(listing) });
    if (retrainTimer) clearTimeout(retrainTimer);
    retrainTimer = setTimeout(() => { recomputeLearnedPreferences({ now: new Date() }).catch(() => {}); }, 1500);
  };
  const onStatus = (status) => setShortlistStatus(listing.rightmove_id, status);

  clear(mount);
  mount.appendChild(el('a', { class: 'dossier-back', href: url('pages/listings.html') }, '← Back to listings'));
  mount.appendChild(el('div', { class: 'dossier' }, [
    el('div', { class: 'dossier__main' }, [
      buildGallery(listing),
      buildHeadline(listing, scored),
      buildFacts(listing),
      buildFloorplan(listing),
      buildWhy(scored),
      buildPriceHistory(listing),
      buildDescription(listing),
    ].filter(Boolean)),
    el('aside', { class: 'dossier__rail' }, [
      buildActions(listing, current, onSave, onStatus),
      buildAreaCard(area),
    ].filter(Boolean)),
  ]));
  document.title = `${listing.title || 'Property'} · rec`;
}

render();
