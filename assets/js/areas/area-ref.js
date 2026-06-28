// areas/area-ref.js — the single, pure area-reference resolver (Phase: household-
// scoped area references). Given an area record from the household's OWN selection
// (getHouseholdAreas() — the household_areas join), it returns the canonical display
// object every UI surface should render, plus the live/pending classification that
// tells a stub the user just added ("Researching") apart from a curated, fetchable
// area ("Live"). No Supabase, no DOM, no network — unit-testable in the Node harness
// and importable from any tile/page. This is the ONE place that decides what an area
// reference looks like; components must not re-derive name/town or hard-filter on
// `active:true` to decide whether to SHOW a household-selected area.
import { isFetchEligible } from './area-enrich.js';

// A household-onboarding stub starts "pending" (provisionally added, not yet
// located) but becomes LIVE the moment postcodes.io has accurately located it —
// coords + a derivable outcode + county confirmed (isFetchEligible) — because it is
// then included in the very next Rightmove run despite active:false. An un-enriched
// stub, or one flagged for a county mismatch, stays pending ("Researching") until it
// is located/confirmed. For NON-household areas the prior rule holds: `active===false`
// (a pipeline-pruned curated area) is pending; when `active` is absent we fall back to
// the research status; a curated area (active!==false) is live even at `partial`.
const _STUB_STATUSES = new Set(['directory', 'stub', 'drafted', 'partial']);

export function isPendingArea(area) {
  if (!area) return false;
  if (area.source === 'household-onboarding') return !isFetchEligible(area);
  if (area.active === false) return true;
  if (area.active == null && _STUB_STATUSES.has(area.status)) return true;
  return false;
}

export function isLiveArea(area) {
  return !!area && !isPendingArea(area);
}

// A CURATED disable: an area deliberately crossed off the catalog (active:false)
// that is NOT a household-onboarding stub. This is the SINGLE rule the scraper
// (tools/fetch-listings.mjs, householdRowsToVillages) and the display feed
// (storage/listings/feed.js, getListings) BOTH obey, so a disabled area is never
// re-fetched NOR shown — while a "Researching" onboarding stub (also active:false)
// is exempt and keeps rendering. Centralising the rule here is what keeps the scrape
// side and the display side in lockstep; neither re-derives it inline.
export function isCuratedDisabled(area) {
  return !!area && area.active === false && area.source !== 'household-onboarding';
}

// Scope a list of household-linked area ids to those that should still surface
// listings: drop any id that is a curated disable per the catalog. Curated rows in
// the catalog (data/areas.json) carry `active`; onboarding stubs are absent from it,
// so an id not in the catalog passes through untouched (a located stub still shows).
// Pure — the feed passes its active-linked ids + the catalog and gets back the ids
// whose listings may be displayed.
export function excludeCuratedDisabled(areaIds, catalog) {
  const disabled = new Set((catalog || []).filter(isCuratedDisabled).map((a) => a.id));
  return (areaIds || []).filter((id) => !disabled.has(id));
}

// Canonical display object for one area record. `town` falls back through the same
// chain the shortlist tile used inline (town → subRegion → county) so the place line
// is never blank when a stub only knows its county.
export function resolveAreaRef(area) {
  if (!area) return null;
  const pending = isPendingArea(area);
  return {
    id: area.id,
    name: area.name || area.id || null,
    town: area.town || area.subRegion || area.county || '',
    county: area.county || '',
    status: area.status || null,
    isLive: !pending,
    isPending: pending,
  };
}

// Index the household's selected areas by id for O(1) reference lookups.
export function buildAreaIndex(areas) {
  return new Map((areas || []).filter((a) => a && a.id != null).map((a) => [a.id, a]));
}

// Resolve a reference (e.g. a listing's area_id) AGAINST the household's own areas.
// `areas` may be the array or a prebuilt index from buildAreaIndex(). When the id is
// not in the household's selection we degrade gracefully: a ref with isUnknown:true
// and name:null so callers can fall back to their own copy ("the nearest village")
// instead of leaking a raw id or crashing.
export function resolveAreaById(id, areas) {
  if (id == null) return null;
  const index = areas instanceof Map ? areas : buildAreaIndex(areas);
  const area = index.get(id);
  if (!area) return { id, name: null, town: '', county: '', status: null, isLive: false, isPending: false, isUnknown: true };
  return { ...resolveAreaRef(area), isUnknown: false };
}
