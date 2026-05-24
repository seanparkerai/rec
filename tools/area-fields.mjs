// area-fields.mjs — single source of truth for which fields live where.
// INDEX_FIELDS = lightweight, ship in data/areas.json (directory + map + list pages).
// DETAIL_FIELDS = full record, ship in data/areas/<id>.json (detail page only).
// CONTENT_FIELDS = the fields the research workflow actually populates; used by
// area-status.mjs to compute per-area completeness.

export const INDEX_FIELDS = [
  'id', 'name', 'village', 'town', 'county', 'postcode',
  'hubCity', 'regionDir', 'settlementType', 'subRegion',
  'coords', 'coordsSource', 'houseTypeIds', 'status',
];

export const DETAIL_FIELDS = [
  ...INDEX_FIELDS,
  'overview', 'character', 'amenities', 'schools', 'transport', 'prices',
  'thingsToDo', 'placesToEat', 'pros', 'cons', 'whoItSuits',
  'councilTaxBand', 'broadbandMedianMbps', 'nearestStation', 'primarySupermarket',
  'images', 'sources',
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
