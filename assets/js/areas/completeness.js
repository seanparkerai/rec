// areas/completeness.js — the ONE research-completeness rule (Phase 6.4).
// Moved verbatim from tools/area-fields.mjs so the browser can consume the same
// predicate set the research tooling uses (tools/area-status.mjs, the archive
// migrator) — area-fields.mjs re-exports everything here, so the tools' import
// surface is unchanged. Pure data + functions only: no DOM, no node imports.

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

// The honest research-status cue for the area dossier (6.4): one plain-text line
// driven by completeness(), or null for a fully researched area (no cue rendered).
// Replaces the anonymous per-section-placeholder feel with a page-level statement
// of exactly how much of this dossier is real research.
export function researchStatusLine(area) {
  const { filled, total } = completeness(area || {});
  if (filled >= total) return null;
  if (filled === 0) return 'Not yet researched — every section below is a placeholder.';
  return `Research in progress — ${filled} of ${total} sections researched.`;
}
