// setup/autosave.js — nested get/set + debounced write-through saver for the wizard.
// getNested/setNested are PURE (unit-tested); setNested creates missing intermediate
// objects and never clobbers sibling keys, so a per-step save merges its fields into
// the blob without wiping fields owned by other steps. makeAutosaver coalesces rapid
// edits into one save per blob.

export function getNested(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Set `value` at a dotted path, creating intermediate objects as needed. Mutates and
// returns `obj`. Existing sibling keys at every level are preserved.
export function setNested(obj, path, value) {
  const keys = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object' || Array.isArray(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return obj;
}

// Read the value of a single labelled line entry (tagged with `_lineId`) inside the
// array at `path`. Returns the entry's `key` (default 'monthly'), or undefined when no
// such entry exists. Used by the wizard's `money-line` fields, which capture a scalar
// onboarding figure into the arrays the app actually sums (finances.expenses /
// ongoingBills as { item, monthly, annual }), instead of dead scalar keys.
export function getLineValue(obj, path, lineId, key = 'monthly') {
  const arr = getNested(obj, path);
  if (!Array.isArray(arr)) return undefined;
  const entry = arr.find((e) => e && e._lineId === lineId);
  return entry ? entry[key] : undefined;
}

// Upsert ONE labelled line entry into the array at `path`, identified by `_lineId` so
// re-edits update the same row rather than appending duplicates. A null/empty/non-finite
// value REMOVES the entry. All other entries (the user's own lines) are preserved.
// Stores { _lineId, item: label, monthly, annual } so the finance breakdown tables and
// deriveFinances totals pick it up unchanged. Mutates and returns `obj`.
export function setLineValue(obj, path, { lineId, label, value, key = 'monthly' }) {
  const keys = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== 'object' || Array.isArray(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  const prev = Array.isArray(cur[last]) ? cur[last] : [];
  const kept = prev.filter((e) => !(e && e._lineId === lineId));
  const n = Number(value);
  if (value != null && value !== '' && Number.isFinite(n)) {
    const entry = { _lineId: lineId, item: label, [key]: n };
    if (key === 'monthly') entry.annual = Math.round(n * 12 * 100) / 100;
    kept.push(entry);
  }
  cur[last] = kept;
  return obj;
}

// saveFns: { profile: saveProfile, criteria: saveCriteria, finances: saveFinances, goals: saveGoals }.
// queue(name, blob) debounces to one save per blob per `ms`; flushAll() forces any
// pending saves (used on Finish / before navigating away).
export function makeAutosaver(saveFns, ms = 600) {
  const timers = {};
  const pending = {};
  const flush = (name) => {
    const blob = pending[name];
    delete pending[name];
    clearTimeout(timers[name]);
    delete timers[name];
    if (blob !== undefined && typeof saveFns[name] === 'function') saveFns[name](blob);
  };
  return {
    queue(name, blob) {
      pending[name] = blob;
      clearTimeout(timers[name]);
      timers[name] = setTimeout(() => flush(name), ms);
    },
    flushAll() {
      for (const name of Object.keys(pending)) flush(name);
    },
  };
}
