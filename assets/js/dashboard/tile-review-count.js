// tile-review-count.js — a single "listings to review" total above the dashboard
// bento (replaces the old Next-Best-Action strip). One number, one destination:
// how many listings are still waiting for a decision on the Listings page.
//
// It is DIRECTLY tied to the Listings feed: it runs the very same pure partition
// pipeline (listings/feed-partition.js) the Browse view uses, with the same
// radius / affordability-gate / junk / refinement / decided / dedupe rules, so
// the count here can never drift from the "to review" total shown there.
import {
  getListings, getCriteria, getHouseholdAreas, getLearnedPreferences,
  getReactionLog, getReviewedListings, getScrapeProbation,
} from '../storage.js';
import { getDerivedFinances } from '../finance-load.js';
import { scoreListingFit } from '../listings/fit.js';
import { classifyListing } from '../listings/flags.js';
import { latestPerListing } from '../listings/reactions.js';
import { decidedSets, isDecided } from '../listings/suppress.js';
import { partitionFeed } from '../listings/feed-partition.js';
import { hiddenRulesFromOverrides, listingHiddenByRefinement } from '../refinement/view.js';
import { url } from '../config.js';
import { el, clear, byId } from '../dom.js';

/** Count listings still awaiting a decision, mirroring the Browse feed exactly. */
function countToReview({ listings, criteria, finances, areas, learned, reactionLog, probationRows }) {
  const normArea = (s) => String(s ?? '').trim().toLowerCase();

  // Household search radius (+ per-area overrides) — identical to page-listings.
  const searchRadiusMi = Number(criteria?.location?.searchRadiusMi ?? 3);
  const radiusOverrides = criteria?.location?.areaRadiusOverrides || {};
  const probationSet = new Set((probationRows || []).map((p) => normArea(p.value)));
  const passesRadius = (listing) => {
    if (listing.distance_mi == null) return true;
    const r = Number(radiusOverrides[listing.area_id] ?? searchRadiusMi);
    if (r === 0) return listing.geofence_pass === true;
    return Number(listing.distance_mi) <= r;
  };

  const overrides = learned?.overrides || {};
  const hiddenRules = hiddenRulesFromOverrides(overrides);

  const areasById = new Map((areas || []).map((a) => [a.id, a]));
  const areaOf = (l) => (l.area_id ? areasById.get(l.area_id) : null);
  // Only `gated` feeds the count, and that depends on finances + criteria + price
  // + the area's council-tax band — not on learned weights or manual ratings.
  const scoreOf = (l) => (finances
    ? scoreListingFit({ listing: l, finances, criteria, area: areaOf(l) })
    : { verdict: 'unknown', score: 0, gated: false });

  // Decided (latest reaction like/pass/reject) suppression, by id AND fingerprint.
  const liveById = new Map(listings.map((l) => [String(l.rightmove_id), l]));
  const latest = latestPerListing(reactionLog || []);
  const reactions = {};
  for (const [id, row] of latest) reactions[String(id)] = { reaction: row.reaction, created_at: row.created_at };
  const decided = decidedSets(latest, liveById);
  const isDecidedListing = (l) => isDecided(l, decided);
  const feedListings = listings.filter((l) => !isDecidedListing(l));

  const reviewedSet = new Set([
    ...getReviewedListings().map(String),
    ...Object.keys(reactions).map(String),
  ]);
  const isReviewed = (id) => reviewedSet.has(String(id));

  const feed = partitionFeed(feedListings, {
    passesRadius, scoreOf, areaOf,
    includeOOR: false, includeHidden: false,
    isJunk: (l) => classifyListing(l).hide,
    isRefHidden: (l) => listingHiddenByRefinement(l, hiddenRules) || probationSet.has(normArea(l.area_id)),
    isDecided: isDecidedListing, isReviewed,
    reactionOf: (id) => reactions[id] || null,
    applyControls: (ls) => ls, // no search/sort/filter on the dashboard — the raw to-review pool
  });
  return feed.unreviewed.length;
}

export async function renderReviewCount(mountId = 'review-count') {
  const mount = byId(mountId);
  if (!mount) return;
  try {
    const [listings, criteria, finances, areas, learned, reactionLog, probationRows] = await Promise.all([
      getListings({ limit: null }), getCriteria(), getDerivedFinances(), getHouseholdAreas(),
      getLearnedPreferences(), getReactionLog(), getScrapeProbation(),
    ]);
    const n = countToReview({ listings: listings || [], criteria, finances, areas, learned, reactionLog, probationRows });

    clear(mount);
    mount.hidden = false;
    const link = el('a', { class: 'review-count__link', href: url('pages/listings.html') }, n > 0
      ? [
          el('span', { class: 'review-count__n num' }, String(n)),
          el('span', { class: 'review-count__text' }, `listing${n === 1 ? '' : 's'} to review`),
          el('span', { class: 'review-count__cta', 'aria-hidden': 'true' }, '→'),
        ]
      : [
          el('span', { class: 'review-count__check', 'aria-hidden': 'true' }, '✓'),
          el('span', { class: 'review-count__text' }, 'No listings to review — you’re all caught up'),
          el('span', { class: 'review-count__cta', 'aria-hidden': 'true' }, '→'),
        ]);
    if (n === 0) link.classList.add('review-count__link--clear');
    mount.appendChild(el('h2', { class: 'review-count__label' }, 'Listings'));
    mount.appendChild(link);
  } catch (e) {
    console.error('review-count tile', e);
    mount.hidden = true;
  }
}
