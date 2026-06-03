// data-sync/diff.js — pure data helpers for the Data-sync page (REFACTOR P7a).
//
// Extracted from page-data-sync.js so the comparison/display logic is unit-testable
// without a DOM or a live Supabase connection. No DOM, no network, no storage.
//   • sortJson / jsonEq — key-order-insensitive deep equality
//   • diffData          — flat list of differing leaves (local vs Supabase)
//   • formatTs          — short en-GB timestamp for status rows
//   • flattenToRows     — flatten a payload into {key,val} rows for the data viewer

// Recursively sort object keys so two structurally-equal payloads serialise identically.
export function sortJson(v) {
  if (Array.isArray(v)) return v.map(sortJson);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortJson(v[k])]));
  }
  return v;
}

export function jsonEq(a, b) {
  return JSON.stringify(sortJson(a)) === JSON.stringify(sortJson(b));
}

// Produce a flat list of {path, local, sb, type} for every differing leaf.
// `a` = local value, `b` = Supabase value. Recurses into objects to depth 2.
export function diffData(a, b, prefix, depth) {
  prefix = prefix || '';
  depth = depth || 0;
  const diffs = [];

  const fmt = (v) => {
    if (v === null || v === undefined) return String(v);
    if (Array.isArray(v)) return `[${v.length} item${v.length !== 1 ? 's' : ''}]`;
    if (typeof v === 'object') return '{…}';
    const s = JSON.stringify(v);
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  };

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!jsonEq(a, b))
      diffs.push({ path: prefix || '(root)', local: fmt(a), sb: fmt(b), type: 'change' });
    return diffs;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (!jsonEq(a, b))
      diffs.push({ path: prefix || '(root)', local: fmt(a), sb: fmt(b), type: 'change' });
    return diffs;
  }
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...allKeys].sort()) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (!(k in b))        { diffs.push({ path: p, local: fmt(a[k]), sb: '(missing)', type: 'remove' }); }
    else if (!(k in a))   { diffs.push({ path: p, local: '(missing)', sb: fmt(b[k]), type: 'add' }); }
    else if (!jsonEq(a[k], b[k])) {
      if (depth < 2 && typeof a[k] === 'object' && !Array.isArray(a[k]) && a[k] !== null
                     && typeof b[k] === 'object' && !Array.isArray(b[k]) && b[k] !== null) {
        diffs.push(...diffData(a[k], b[k], p, depth + 1));
      } else {
        diffs.push({ path: p, local: fmt(a[k]), sb: fmt(b[k]), type: 'change' });
      }
    }
  }
  return diffs;
}

export function formatTs(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Flatten a payload into {key, val, …} rows for the data viewer. Small nested
// objects are inlined (dotted keys); larger/array values are stringified.
export function flattenToRows(obj, prefix = '') {
  const rows = [];
  if (obj === null || obj === undefined) {
    rows.push({ key: prefix || '(root)', val: null, isNull: true });
  } else if (Array.isArray(obj)) {
    rows.push({ key: prefix || '(root)', val: `[array, ${obj.length} items]`, isObj: true, raw: JSON.stringify(obj, null, 2) });
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length <= 8 && JSON.stringify(v).length < 200) {
        rows.push(...flattenToRows(v, fullKey));
      } else if (Array.isArray(v) && v.length <= 6 && v.every((x) => typeof x !== 'object')) {
        rows.push({ key: fullKey, val: JSON.stringify(v) });
      } else if (v !== null && typeof v === 'object') {
        rows.push({ key: fullKey, val: JSON.stringify(v, null, 2), isObj: true });
      } else {
        rows.push({ key: fullKey, val: v === null ? null : String(v), isNull: v === null });
      }
    }
  } else {
    rows.push({ key: prefix || '(root)', val: String(obj) });
  }
  return rows;
}
