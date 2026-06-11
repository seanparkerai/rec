// page-saved-listings.js — the consolidated "Saved listings" surface (v3).
// One focused home for every listing whose CURRENT reaction is a Like, with the
// specific positives you tagged surfaced as chips. The read model derives from the
// append-only reaction log (latest-per-listing), so a liked home survives delisting
// via its stored snapshot. Reuses the .listing-card idiom from pages/listings.css —
// no new tokens, no new CSS file. Editing a card's reaction here (e.g. switching it
// off Like) re-saves through storage and drops it from the page on the next paint.
import {
  getListings, getReactionLog, getCriteria, getFinances, getHouseholdAreas,
  getLearnedPreferences, saveListingReaction,
  getListingRatings, setListingRating,
} from './storage.js';
import { deriveFinances } from './finance-derive.js';
import { scoreListingFit } from './listings/fit.js';
import { effectiveWeights, listingLearnedPrefs } from './learned-preferences.js';
import { latestPerListing, LIKE_REASONS, LIKE_SUBREASONS } from './listings/reactions.js';
import { dedupeNewestByFingerprint } from './listings/suppress.js';
import { buildReasonPicker } from './listings/reactions-ui.js';
import { createListingsControls } from './listings/controls.js';
import { buildRatingControl } from './listings/rating-ui.js';
import { wireReturnTracking, restoreListFocus } from './listings/nav.js';
import { url } from './config.js';
import { el, clear } from './dom.js';

const dossierHref = (id) => `${url('pages/property.html')}?id=${encodeURIComponent(id)}&from=saved`;
const fmtPrice = (n) => (n == null ? '—' : '£' + Math.round(n).toLocaleString('en-GB'));

// like key → label, and parent → { sub key → label }, for the read-only positives.
const LIKE_LABELS = Object.fromEntries(LIKE_REASONS.map((r) => [r.key, r.label]));
const SUB_LABELS = Object.fromEntries(
  Object.entries(LIKE_SUBREASONS).map(([k, subs]) => [k, Object.fromEntries(subs.map((s) => [s.key, s.label]))]),
);

/** Human labels for the captured like-reasons (chip text on the saved card). */
function positiveLabels(reasons) {
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

// Cover-cropped media with a monogram fallback (same classes as the Listings feed).
function buildMedia(listing) {
  const base = 'listing-media';
  const monogram = () => el('div', { class: `${base} ${base}--none`, 'aria-hidden': 'true' },
    (listing.property_type || '•').slice(0, 1).toUpperCase());
  let inner;
  if (listing.image_url) {
    const img = el('img', {
      class: `${base}__img`, src: listing.image_url, alt: '',
      loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
    });
    const box = el('div', { class: base }, [img]);
    img.addEventListener('error', () => box.replaceWith(monogram()), { once: true });
    inner = box;
  } else {
    inner = monogram();
  }
  return el('a', { class: `${base}-link`, href: dossierHref(listing.rightmove_id), 'aria-label': 'Open dossier' }, [inner]);
}

function metaLine(listing) {
  return [
    listing.beds != null ? `${listing.beds} bed` : '',
    listing.baths != null ? `${listing.baths} bath` : '',
    listing.property_type || '',
  ].filter(Boolean).join(' · ');
}

function buildCard(listing, { reaction, rating, onSave, onRate }) {
  const place = [listing.address, listing.outcode].filter(Boolean).join(' · ');
  const meta = metaLine(listing);
  const content = el('div', { class: 'listing-card__content' }, [
    el('div', { class: 'listing-card__head' }, [
      el('span', { class: 'listing-card__reviewed-tag' }, '♥ Liked'),
      el('span', { class: 'listing-card__price num' }, fmtPrice(listing.price)),
    ]),
    el('p', { class: 'listing-card__title' }, [
      el('a', { class: 'listing-card__title-link', href: dossierHref(listing.rightmove_id) },
        listing.title || `${listing.beds ?? '?'}-bed ${listing.property_type || 'property'}`),
    ]),
    place ? el('p', { class: 'listing-card__place' }, place) : null,
    meta ? el('p', { class: 'listing-card__meta num' }, meta) : null,
    buildPositives(reaction?.reasons),
    el('div', { class: 'listing-controls' }, [
      // The like/reasons/Save controls are collapsed by default on Saved — the
      // "why you liked it" chips above already summarise the decision, and the
      // full editor also lives in the dossier. A native <details> keeps it
      // editable here without the buttons crowding every card on load
      // (keyboard- and reduced-motion-friendly; no JS).
      el('details', { class: 'listing-react-toggle' }, [
        el('summary', { class: 'listing-react-toggle__summary' }, 'Edit reaction'),
        buildReasonPicker({ variant: 'row', current: reaction, onSave: (d) => onSave(listing, d) }),
      ]),
      buildRatingControl({ value: rating, onChange: (n) => onRate(listing, n) }),
    ]),
    listing.url
      ? el('a', { class: 'listing-card__rm btn-rm', href: listing.url, target: '_blank', rel: 'noopener' }, 'View on Rightmove ↗')
      : null,
  ].filter(Boolean));
  return el('li', { class: 'listing-card listing-card--reviewed listing-card--liked', 'data-id': listing.rightmove_id }, [
    buildMedia(listing),
    content,
  ]);
}

async function render() {
  const main = document.querySelector('#main') || document.body;
  const listEl = main.querySelector('[data-saved-listings]');
  const summaryEl = main.querySelector('[data-saved-summary]');
  if (!listEl) return;

  const filterBar = main.querySelector('[data-listings-filter]');

  const [listings, log, criteria, rawFinances, areas, learned, ratings] = await Promise.all([
    // includeOutOfArea + scopeToHousehold:false — a listing you deliberately saved
    // must resolve to its live row (cover photo, fresh price) even if it sits
    // outside the discovery geofence OR in an area you have since deselected; your
    // saved list is keyed off your own reactions, not the feed's area scope.
    getListings({ limit: null, includeOutOfArea: true, scopeToHousehold: false }), getReactionLog(), getCriteria(), getFinances(), getHouseholdAreas(), getLearnedPreferences(),
    getListingRatings(),
  ]);
  const finances = rawFinances ? deriveFinances(rawFinances) : null;
  const areasById = new Map((areas || []).map((a) => [a.id, a]));
  const effective = effectiveWeights(learned?.derived || {}, learned?.overrides || {});
  const liveById = new Map((listings || []).map((l) => [String(l.rightmove_id), l]));

  // Latest reaction per listing → keep the Likes. Prefer the live row; fall back to
  // the durable snapshot so a liked home that has since delisted still shows.
  const reactions = {};
  let liked = [];
  for (const [id, row] of latestPerListing(log || [])) {
    if (row.reaction !== 'like') continue;
    const key = String(id);
    reactions[key] = {
      reaction: row.reaction,
      reason: row.reason ?? null,
      reasons: Array.isArray(row.reasons) ? row.reasons : [],
      created_at: row.created_at,
    };
    const listing = liveById.get(key) || row.listing_snapshot;
    if (listing && listing.rightmove_id) liked.push({ listing, created_at: row.created_at });
  }
  // Collapse same-physical-property saves (a re-list liked again under a new id) to a
  // single card — keep the most-recently-liked. Coarse-address saves never merge.
  liked = dedupeNewestByFingerprint(liked, (x) => x.listing, (x) => x.created_at);

  const areaOf = (l) => (l.area_id ? areasById.get(l.area_id) : null);
  const scoreOf = (l) => (finances
    ? scoreListingFit({ listing: l, finances, criteria, area: areaOf(l), learnedPrefs: listingLearnedPrefs(l, effective), rating: ratings[l.rightmove_id] })
    : null);

  // Shared search/sort/filter — same module as the live feed. The saved view
  // defaults to "Your rating" so the prioritisation you set drives the order.
  const controls = createListingsControls({
    scoreOf: (l) => scoreOf(l)?.score ?? 0,
    ratingOf: (l) => Number(ratings[l.rightmove_id]) || 0,
    areaNameOf: (l) => areaOf(l)?.name || '',
    defaults: { sort: 'rating' },
    onChange: () => paint(),
  });

  const snapshotOf = (l) => ({
    rightmove_id: l.rightmove_id, title: l.title, address: l.address, outcode: l.outcode,
    area_id: l.area_id, price: l.price, beds: l.beds, baths: l.baths,
    property_type: l.property_type, status: l.status, url: l.url,
    image_url: l.image_url ?? null,   // cover photo persists once the live row is withdrawn
  });

  const onSave = async (listing, { reaction, reasons }) => {
    const ok = await saveListingReaction({
      listing_id: listing.rightmove_id, reaction, reasons, listing_snapshot: snapshotOf(listing),
    });
    if (!ok) return false;
    const key = String(listing.rightmove_id);
    if (reaction === 'like') {
      reactions[key] = { reaction, reason: null, reasons: reasons || [], created_at: new Date().toISOString() };
    } else {
      // Changed their mind — it's no longer a Like, so drop it from this view.
      delete reactions[key];
      liked = liked.filter((x) => String(x.listing.rightmove_id) !== key);
    }
    paint();
    return true;
  };

  // Set/clear the 1–10 priority on the shortlist row, then repaint so the rating
  // sort and the positive-only fit nudge take effect immediately.
  const onRate = async (listing, n) => {
    const ok = await setListingRating(listing.rightmove_id, n);
    if (!ok) return false;
    if (n == null) delete ratings[listing.rightmove_id];
    else ratings[listing.rightmove_id] = n;
    paint();
    return true;
  };

  function paint() {
    clear(listEl);
    if (summaryEl) summaryEl.textContent = '';
    if (!liked.length) {
      if (filterBar) filterBar.hidden = true;
      listEl.appendChild(el('li', { class: 'listings-empty' }, [
        el('p', {}, 'No saved listings yet.'),
        el('p', { class: 'listings-empty__hint' }, [
          'Like properties on the ',
          el('a', { href: url('pages/listings.html') }, 'Listings'),
          ' page and they’ll gather here with the reasons you loved them.',
        ]),
      ]));
      return;
    }
    if (filterBar) filterBar.hidden = false;

    // Sort/filter by like-recency: stamp each liked listing's recency with the time
    // it was liked (created_at), so "Most recent" means most-recently saved here.
    const byId = new Map(liked.map((item) => [String(item.listing.rightmove_id), item]));
    const pool = liked.map((item) => ({ ...item.listing, first_seen: item.created_at }));
    const visible = controls.apply(pool);

    for (const l of visible) {
      const item = byId.get(String(l.rightmove_id));
      listEl.appendChild(buildCard(item.listing, {
        reaction: reactions[String(item.listing.rightmove_id)] || null,
        rating: ratings[item.listing.rightmove_id] ?? null,
        onSave,
        onRate,
      }));
    }
    if (summaryEl) {
      const shown = visible.length;
      summaryEl.textContent = shown === liked.length
        ? `${liked.length} saved listing${liked.length === 1 ? '' : 's'}`
        : `${shown} of ${liked.length} saved listings`;
    }
  }

  controls.wire(filterBar, liked.map((item) => item.listing));
  wireReturnTracking(listEl, 'saved');
  paint();
  restoreListFocus(listEl, 'saved');
}

render();
