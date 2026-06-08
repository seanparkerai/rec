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
