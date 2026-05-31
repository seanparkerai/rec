// page-saved-listings.js — the consolidated "Saved listings" surface (v3).
// One focused home for every listing whose CURRENT reaction is a Like, with the
// specific positives you tagged surfaced as chips. The read model derives from the
// append-only reaction log (latest-per-listing), so a liked home survives delisting
// via its stored snapshot. Reuses the .listing-card idiom from pages/listings.css —
// no new tokens, no new CSS file. Editing a card's reaction here (e.g. switching it
// off Like) re-saves through storage and drops it from the page on the next paint.
import {
  getListings, getReactionLog, getCriteria, getFinances, getAreas,
  getLearnedPreferences, saveListingReaction,
} from './storage.js';
import { deriveFinances } from './finance-derive.js';
import { scoreListingFit } from './listing-fit.js';
import { effectiveWeights, listingLearnedPrefs } from './learned-preferences.js';
import { latestPerListing, LIKE_REASONS, LIKE_SUBREASONS } from './listing-reactions.js';
import { buildReasonPicker } from './listing-reactions-ui.js';
import { url } from './config.js';
import { el, clear } from './dom.js';

const dossierHref = (id) => `${url('pages/property.html')}?id=${encodeURIComponent(id)}`;
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

function buildCard(listing, { reaction, onSave }) {
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
      buildReasonPicker({ variant: 'row', current: reaction, onSave: (d) => onSave(listing, d) }),
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

  const [listings, log, criteria, rawFinances, areas, learned] = await Promise.all([
    getListings({ limit: 200 }), getReactionLog(), getCriteria(), getFinances(), getAreas(), getLearnedPreferences(),
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

  const areaOf = (l) => (l.area_id ? areasById.get(l.area_id) : null);
  const scoreOf = (l) => (finances
    ? scoreListingFit({ listing: l, finances, criteria, area: areaOf(l), learnedPrefs: listingLearnedPrefs(l, effective) })
    : null);

  // Best-fit first, then most-recently liked.
  liked.sort((a, b) =>
    ((scoreOf(b.listing)?.score ?? -Infinity) - (scoreOf(a.listing)?.score ?? -Infinity)) ||
    (new Date(b.created_at) - new Date(a.created_at)));

  const snapshotOf = (l) => ({
    rightmove_id: l.rightmove_id, title: l.title, address: l.address, outcode: l.outcode,
    area_id: l.area_id, price: l.price, beds: l.beds, baths: l.baths,
    property_type: l.property_type, status: l.status, url: l.url,
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

  function paint() {
    clear(listEl);
    if (summaryEl) summaryEl.textContent = '';
    if (!liked.length) {
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
    for (const item of liked) {
      listEl.appendChild(buildCard(item.listing, {
        reaction: reactions[String(item.listing.rightmove_id)] || null,
        onSave,
      }));
    }
    if (summaryEl) {
      summaryEl.textContent = `${liked.length} saved listing${liked.length === 1 ? '' : 's'}`;
    }
  }

  paint();
}

render();
