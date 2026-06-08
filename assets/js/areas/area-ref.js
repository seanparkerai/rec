// areas/area-ref.js — the single, pure area-reference resolver (Phase: household-
// scoped area references). Given an area record from the household's OWN selection
// (getHouseholdAreas() — the household_areas join), it returns the canonical display
// object every UI surface should render, plus the live/pending classification that
// tells a stub the user just added ("Researching") apart from a curated, fetchable
// area ("Live"). No Supabase, no DOM, no network — unit-testable in the Node harness
// and importable from any tile/page. This is the ONE place that decides what an area
// reference looks like; components must not re-derive name/town or hard-filter on
// `active:true` to decide whether to SHOW a household-selected area.

// A household-onboarding stub is "pending": it was provisionally added by the user
// (source='household-onboarding'), is not yet in the fetch catchment (active:false),
// and carries an early research status. We treat ANY of those as pending so a stub is
// never mistaken for a live, fetchable area. `active===false` always wins (an area the
// pipeline has pruned is not fetchable, regardless of source); when `active` is absent
// we fall back to the research status. A curated area (active!==false) is live even at
// `partial` status, matching "curated & fetchable".
const _STUB_STATUSES = new Set(['directory', 'stub', 'drafted', 'partial']);

export function isPendingArea(area) {
  if (!area) return false;
  if (area.source === 'household-onboarding') return true;
  if (area.active === false) return true;
  if (area.active == null && _STUB_STATUSES.has(area.status)) return true;
  return false;
}

export function isLiveArea(area) {
  return !!area && !isPendingArea(area);
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
