// area-fields.mjs — single source of truth for which fields live where.
// INDEX_FIELDS = lightweight, ship in data/areas.json (directory + map + list pages).
// DETAIL_FIELDS = full record, ship in data/areas/<id>.json (detail page only).
// CONTENT_FIELDS = the fields the research workflow actually populates; used by
// area-status.mjs to compute per-area completeness.

export const INDEX_FIELDS = [
  'id', 'name', 'village', 'town', 'county', 'postcode',
  'hubCity', 'regionDir', 'settlementType', 'subRegion',
  'coords', 'coordsSource', 'houseTypeIds', 'status',
  'priceSummary', 'councilTaxBand',
  // Geofence/search-catchment fields (written by resolve-areas.mjs). Shipped in the
  // lightweight index so the Map page can draw the REAL per-area listings catchment
  // (radius + active flag), not just a point marker. `active:false` areas are pruned
  // from the fetch (tools/fetch-listings.mjs) and so are excluded from the catchment.
  'geofenceRadiusMi', 'searchRadiusMi', 'active',
];

export const DETAIL_FIELDS = [
  ...INDEX_FIELDS,
  'overview', 'character', 'amenities', 'schools', 'transport', 'prices',
  'thingsToDo', 'placesToEat', 'pros', 'cons', 'whoItSuits',
  'councilTaxBand', 'broadbandMedianMbps', 'nearestStation', 'primarySupermarket',
  'images', 'sources',
  // Fetch-infrastructure field written by resolve-areas.mjs — must survive build-areas
  // rebuilds. (geofenceRadiusMi/searchRadiusMi/active now live in INDEX_FIELDS above.)
  'rightmove',
];

// Research-completeness rules (CONTENT_FIELDS, getField, completeness, deriveStatus)
// moved to assets/js/areas/completeness.js (Phase 6.4) so the area-detail page can
// render the honest research-status cue from the SAME rule the tooling uses. Re-exported
// here verbatim — every existing `from './area-fields.mjs'` import keeps working.
export { CONTENT_FIELDS, getField, completeness, deriveStatus } from '../assets/js/areas/completeness.js';

// priceSummary — the lightweight per-type price subset baked into the directory index
// (and per-area files) so the list/map pages can compute affordability fit dots without
// loading every per-area file. ONE derivation home (Phase 6.2): called by build-areas.mjs
// AND sync-areas-from-supabase.mjs `canonicalRecord()`; the DB's stored priceSummary is
// IGNORED at materialisation — derived state is always recomputed from `prices`, so it
// can never go stale between pipeline steps.
export function bakePriceSummary(prices) {
  const p = prices ?? {};
  const hasAnyPrice = ['avgDetached', 'avgSemi', 'avgTerraced', 'avgFlat']
    .some((k) => p[k] != null);
  return hasAnyPrice ? {
    avgDetached: p.avgDetached ?? null,
    avgSemi:     p.avgSemi     ?? null,
    avgTerraced: p.avgTerraced ?? null,
    avgFlat:     p.avgFlat     ?? null,
    asOf:        p.asOf        ?? null,
  } : null;
}

// isOnboardingStub — the ONE predicate for household-onboarding stub records (Phase 6.3).
// Stubs are created at RUNTIME by the portal's add-area flow (source='household-onboarding',
// active=false, via the gated member INSERT policy). They are per-household provisional rows,
// not curated catalog content, so they are NEVER materialised into repo files or the parity
// snapshot: tools/sync-areas-from-supabase.mjs skips them and
// tests/contract/areas-db-repo-parity.test.js excludes them — both through THIS predicate,
// so the rule cannot drift between the materialiser and the gate. Takes the area RECORD
// (the jsonb `data` payload / per-area-file shape) — callers with DB rows pass `row.data`.
export function isOnboardingStub(rec) {
  return !!rec && rec.source === 'household-onboarding';
}

