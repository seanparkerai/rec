// page-property.js — v3 L6 per-listing dossier coordinator.
// Renders a single listing (?id=<rightmove_id>) as a considered, reading-first
// dossier: photo gallery, headline + fit verdict, key facts (only the ones we
// actually have — tenure/EPC/council-tax aren't in the source payload, so their
// rows are omitted rather than shown empty), an OPEN "why this verdict", price
// history, area context, the full description, and the reaction/status controls.
// No outreach — that lives elsewhere and is intentionally not joined here.
import {
  getListing, getCriteria, getHouseholdAreas,
  getListingReactions, saveListingReaction,
  getShortlistStatuses, setShortlistStatus,
  getLearnedPreferences, recomputeLearnedPreferences,
  getListingRatings, setListingRating,
} from './storage.js';
import { getDerivedFinances } from './finance-load.js';
import { scoreListingFit } from './listings/fit.js';
import { effectiveWeights, listingLearnedPrefs } from './learned-preferences.js';
import { backTargetFrom } from './listings/nav.js';
import { url } from './config.js';
import { el, clear, byId } from './dom.js';
import {
  mapBtn, buildGallery, buildHeadline, buildFacts, buildFloorplan, buildWhy,
  buildPriceHistory, buildDescription, buildAreaCard, buildAreaMembership, buildActions,
} from './page-property/sections.js';

function notFound(mount, msg) {
  clear(mount);
  // Context-aware + filter-preserving back link (same as the main render path), so
  // even the "not found" fallback returns you to the filtered view you came from.
  const back = backTargetFrom();
  mount.appendChild(el('div', { class: 'dossier-empty' }, [
    el('p', { class: 'dossier-empty__title' }, msg || 'Listing not found'),
    el('p', { class: 'dossier-muted' }, 'It may have been withdrawn, or the link is out of date.'),
    el('a', { class: 'dossier-back', href: url(back.page) }, back.label),
  ]));
}

async function render() {
  const mount = document.querySelector('[data-property]') || byId('main');
  if (!mount) return;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { notFound(mount, 'No listing specified'); return; }

  const listing = await getListing(id);
  if (!listing) { notFound(mount, 'Listing not found'); return; }

  const [finances, criteria, areas, reactions, statuses, learned, ratings] = await Promise.all([
    getDerivedFinances(), getCriteria(), getHouseholdAreas(), getListingReactions(), getShortlistStatuses(), getLearnedPreferences(),
    getListingRatings(),
  ]);
  const area = (areas || []).find((a) => a.id === listing.area_id) || null;
  const effective = effectiveWeights(learned?.derived || {}, learned?.overrides || {});
  const scored = finances
    ? scoreListingFit({ listing, finances, criteria, area, learnedPrefs: listingLearnedPrefs(listing, effective), rating: ratings[listing.rightmove_id] })
    : { verdict: 'unknown', score: 0, gated: false, contributions: [] };

  const current = {
    reaction: reactions[listing.rightmove_id]?.reaction || null,
    reasons: reactions[listing.rightmove_id]?.reasons || [],
    status: statuses[listing.rightmove_id] || '',
    rating: ratings[listing.rightmove_id] ?? null,
  };
  const snapshotOf = (l) => ({
    rightmove_id: l.rightmove_id, title: l.title, address: l.address, outcode: l.outcode,
    area_id: l.area_id, price: l.price, beds: l.beds, baths: l.baths,
    property_type: l.property_type, status: l.status, url: l.url,
    image_url: l.image_url ?? null,   // cover photo persists once the live row is withdrawn
  });
  let retrainTimer = null;
  // The in-flight save promise, if any. The dossier's "back" link is a full-page
  // navigation that would otherwise ABORT an in-flight Supabase insert (the
  // reported "reacted, saved, went back — reaction gone" bug), so navigation is
  // gated on this until the write has actually committed.
  let pendingSave = null;
  // Persist on Save (the consolidated decision) — one clean append-only row.
  const onSave = async ({ reaction, reasons }) => {
    const p = (async () => {
      const saved = await saveListingReaction({ listing_id: listing.rightmove_id, reaction, reasons, listing_snapshot: snapshotOf(listing) });
      if (!saved) throw new Error('Failed to save reaction');
      if (retrainTimer) clearTimeout(retrainTimer);
      retrainTimer = setTimeout(() => { recomputeLearnedPreferences({ now: new Date() }).catch(() => {}); }, 1500);
    })();
    pendingSave = p;
    try { await p; } finally { if (pendingSave === p) pendingSave = null; }
  };
  const onStatus = (status) => setShortlistStatus(listing.rightmove_id, status);
  const onRate = (n) => setListingRating(listing.rightmove_id, n);

  // Context-aware back link: return to the live feed or the saved view depending
  // on where the user opened this dossier from (?from=…).
  const back = backTargetFrom();
  const backHref = url(back.page);

  // If the user clicks "back" while a save is still committing, hold the
  // navigation until the write lands so the in-flight insert is never aborted
  // (the dossier-specific reaction-loss bug). On a save failure the picker keeps
  // its error state and we stay put so the user can retry.
  const guardNav = (e) => {
    if (!pendingSave) return;
    e.preventDefault();
    pendingSave.then(() => { location.href = backHref; }).catch(() => { /* error already shown; stay */ });
  };
  // A full reload / browser-Back / tab-close can't be awaited; warn instead so an
  // uncommitted reaction isn't silently lost.
  window.addEventListener('beforeunload', (e) => { if (pendingSave) { e.preventDefault(); e.returnValue = ''; } });

  clear(mount);
  const backLink = el('a', { class: 'dossier-back', href: backHref }, back.label);
  backLink.addEventListener('click', guardNav);
  mount.appendChild(backLink);
  mount.appendChild(el('div', { class: 'dossier' }, [
    el('div', { class: 'dossier__main' }, [
      buildGallery(listing),
      buildHeadline(listing, scored),
      buildFacts(listing),
      buildAreaMembership(listing),
      buildFloorplan(listing),
      buildWhy(scored),
      buildPriceHistory(listing),
      buildDescription(listing),
    ].filter(Boolean)),
    el('aside', { class: 'dossier__rail' }, [
      buildActions(listing, current, onSave, onStatus, onRate),
      buildAreaCard(area),
    ].filter(Boolean)),
  ]));
  document.title = `${listing.title || 'Property'} · rec`;
}

render();
