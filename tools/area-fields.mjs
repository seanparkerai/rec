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

// Fields that count toward "researched" completeness. Each entry says how to
// detect whether the field is populated (non-empty / non-null).
export const CONTENT_FIELDS = [
  { key: 'overview',            test: (v) => typeof v === 'string' && v.trim().length > 0 },
  { key: 'character',           test: (v) => typeof v === 'string' && v.trim().length > 0 },
  { key: 'amenities',           test: (v) => Array.isArray(v) && v.length > 0 },
  { key: 'schools',             test: (v) => Array.isArray(v) && v.length > 0 },
  { key: 'transport.commutes',  test: (v) => Array.isArray(v) && v.length > 0 },
  { key: 'prices',              test: (v) => v && Object.values(v).some((x) => x != null && x !== '') },
  { key: 'thingsToDo',          test: (v) => Array.isArray(v) && v.length > 0 },
  { key: 'placesToEat',         test: (v) => Array.isArray(v) && v.length > 0 },
  { key: 'pros',                test: (v) => Array.isArray(v) && v.length > 0 },
  { key: 'cons',                test: (v) => Array.isArray(v) && v.length > 0 },
  { key: 'whoItSuits',          test: (v) => (typeof v === 'string' && v.trim().length > 0) || (Array.isArray(v) && v.length > 0) },
  { key: 'sources',             test: (v) => Array.isArray(v) && v.length > 0 },
];

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

export function getField(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

// Returns { filled, total, missing[], percent } against CONTENT_FIELDS.
export function completeness(area) {
  const missing = [];
  let filled = 0;
  for (const { key, test } of CONTENT_FIELDS) {
    if (test(getField(area, key))) filled += 1;
    else missing.push(key);
  }
  const total = CONTENT_FIELDS.length;
  return { filled, total, missing, percent: Math.round((filled / total) * 100) };
}

// Derive a status label from completeness (overrides nothing if already set
// explicitly upstream — callers decide whether to apply).
export function deriveStatus({ filled, total }) {
  if (filled === 0) return 'stub';
  if (filled === total) return 'researched';
  return 'partial';
}
