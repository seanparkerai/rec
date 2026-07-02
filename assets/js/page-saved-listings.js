// page-saved-listings.js — the consolidated "Saved listings" surface (v3).
// One focused home for every listing whose CURRENT reaction is a Like, with the
// specific positives you tagged surfaced as chips. The read model derives from the
// append-only reaction log (latest-per-listing), so a liked home survives delisting
// via its stored snapshot. Cards are thin compositions of THE shared property-card
// family (page-saved-listings/card.js, step 3.4d); controls live in the shared
// filter-sheet <dialog>. Editing a card's reaction here (e.g. switching it
// off Like) re-saves through storage and drops it from the page on the next paint.
import {
  getListings, getReactionLog, getCriteria, getHouseholdAreas,
  getLearnedPreferences, saveListingReaction,
  getListingRatings, setListingRating,
} from './storage.js';
import { getDerivedFinances } from './finance-load.js';
import { scoreListingFit } from './listings/fit.js';
import { effectiveWeights, listingLearnedPrefs } from './learned-preferences.js';
import { latestPerListing } from './listings/reactions.js';
import { dedupeNewestByFingerprint } from './listings/suppress.js';
import { createListingsControls, LISTING_SORTS } from './listings/controls.js';
import { wireFilterSheet } from './listings/filter-sheet.js';
import { wireReturnTracking, restoreListFocus } from './listings/nav.js';
import { clear } from './dom.js';
import { buildSavedCard } from './page-saved-listings/card.js';

async function render() {
  const main = document.querySelector('#main') || document.body;
  const listEl = main.querySelector('[data-saved-listings]');
  const summaryEl = main.querySelector('[data-saved-summary]');
  if (!listEl) return;

  const filterBar = main.querySelector('[data-listings-filter]');
  const filterTrigger = main.querySelector('[data-filter-trigger]');
  const emptyEl = main.querySelector('[data-empty-saved]');

  const [listings, log, criteria, finances, areas, learned, ratings] = await Promise.all([
    // includeOutOfArea + scopeToHousehold:false — a listing you deliberately saved
    // must resolve to its live row (cover photo, fresh price) even if it sits
    // outside the discovery geofence OR in an area you have since deselected; your
    // saved list is keyed off your own reactions, not the feed's area scope.
    getListings({ limit: null, includeOutOfArea: true, scopeToHousehold: false }), getReactionLog(), getCriteria(), getDerivedFinances(), getHouseholdAreas(), getLearnedPreferences(),
    getListingRatings(),
  ]);
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
    onChange: () => { paint(); sheet?.refresh(); },
  });

  // The shared filter sheet (3.4c mechanism): modal on phones behind the pill
  // trigger, inline card ≥768px. The saved view's default sort is "Your rating",
  // so only a divergence from that reads as an active filter.
  const describeActiveFilters = () => {
    const s = controls.state || {};
    const pills = [];
    if (s.search && s.search.trim()) pills.push(`“${s.search.trim()}”`);
    if (s.sort && s.sort !== 'rating') pills.push(LISTING_SORTS.find((o) => o.key === s.sort)?.label || s.sort);
    if (s.type && s.type !== 'all') pills.push(s.type);
    if (s.beds && s.beds !== 'all') pills.push(`${s.beds}+ beds`);
    if (s.status && s.status !== 'all') pills.push(s.status.replace(/_/g, ' '));
    return pills;
  };
  const sheet = wireFilterSheet({
    dlg: main.querySelector('#saved-filter-sheet'),
    openBtn: main.querySelector('[data-open-filters]'),
    closeBtn: main.querySelector('[data-close-filters]'),
    activeEl: main.querySelector('[data-active-filters]'),
    describe: describeActiveFilters,
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
    // Throw on a failed write so the picker shows its error state instead of a
    // false "Saved ✓" over a lost reaction.
    if (!ok) throw new Error('Could not save your decision — check your connection and try again.');
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
    const hasAny = liked.length > 0;
    // Static empty state (a sibling of the role="list" register, which only ever
    // holds listitem cards); the filter trigger only shows once there is a list.
    if (emptyEl) emptyEl.hidden = hasAny;
    if (filterTrigger) filterTrigger.hidden = !hasAny;
    if (!hasAny) { sheet?.hide(); return; }
    sheet?.sync();

    // Sort/filter by like-recency: stamp each liked listing's recency with the time
    // it was liked (created_at), so "Most recent" means most-recently saved here.
    const byId = new Map(liked.map((item) => [String(item.listing.rightmove_id), item]));
    const pool = liked.map((item) => ({ ...item.listing, first_seen: item.created_at }));
    const visible = controls.apply(pool);

    for (const l of visible) {
      const item = byId.get(String(l.rightmove_id));
      listEl.appendChild(buildSavedCard(item.listing, {
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
