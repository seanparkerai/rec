// picker-state.js — pure, dependency-free reducer for the reaction picker's
// in-progress "draft" (the verb + reason/sub-reason chips the user has tapped but
// not yet Saved). Extracted from the closure state inside reactions-ui.js so a
// page coordinator can stash the draft per listing and rehydrate it when an async
// repaint rebuilds the card — the fix for the "my Reject deselected itself" race.
// No DOM, no storage, no imports: unit-tested in Node (tests/listings-picker-state.test.js).
//
// Draft shape (plain JSON-able data, immutable updates — every function returns a
// NEW draft and never mutates its input):
//   { verb: 'like'|'pass'|'reject'|null,
//     primary: string[],                  // active primary reason keys, insertion order
//     subs: { [primaryKey]: string[] } }  // active sub-reason details per primary

/** An empty draft (no verb, no reasons). */
export function emptyDraft() {
  return { verb: null, primary: [], subs: {} };
}

/**
 * Hydrate a draft from a saved decision ({ reaction, reasons }) — the shape
 * getListingReactions / latestPerListing returns. Null-safe: no decision → empty.
 * @param {object|null} current  { reaction, reasons? }
 */
export function draftFromDecision(current) {
  const draft = emptyDraft();
  if (!current?.reaction) return draft;
  draft.verb = current.reaction;
  for (const r of (Array.isArray(current.reasons) ? current.reasons : [])) {
    if (!r?.key) continue;
    if (!draft.primary.includes(r.key)) draft.primary.push(r.key);
    if (r.detail) {
      const subs = draft.subs[r.key] || (draft.subs[r.key] = []);
      if (!subs.includes(r.detail)) subs.push(r.detail);
    }
  }
  return draft;
}

// Internal: structural clone of the plain draft shape.
function clone(draft) {
  const subs = {};
  for (const [k, v] of Object.entries(draft.subs || {})) subs[k] = [...v];
  return { verb: draft.verb ?? null, primary: [...(draft.primary || [])], subs };
}

/**
 * Select a verb. Switching to a DIFFERENT verb clears the reasons (the other
 * vocabulary's chips are meaningless); re-tapping the same verb is a no-op on
 * reasons. Mirrors the picker's historical behaviour.
 */
export function applyVerb(draft, verb) {
  if (draft.verb === verb) return clone(draft);
  return { verb, primary: [], subs: {} };
}

/** Toggle a primary reason chip. Toggling OFF drops that key's sub-reasons too. */
export function togglePrimary(draft, key) {
  const next = clone(draft);
  const i = next.primary.indexOf(key);
  if (i >= 0) {
    next.primary.splice(i, 1);
    delete next.subs[key];
  } else {
    next.primary.push(key);
  }
  return next;
}

/** Toggle a sub-reason detail under an active primary. */
export function toggleSub(draft, key, detail) {
  const next = clone(draft);
  const subs = next.subs[key] || (next.subs[key] = []);
  const i = subs.indexOf(detail);
  if (i >= 0) subs.splice(i, 1); else subs.push(detail);
  if (!subs.length) delete next.subs[key];
  return next;
}

/**
 * The consolidated reasons array a Save persists: for each active primary (in
 * insertion order), one entry per active sub-reason, else a single null-detail
 * entry. Identical to the picker's historical buildReasonsArray().
 * @returns {Array<{key:string, detail:string|null, note:null}>}
 */
export function reasonsArray(draft) {
  const out = [];
  for (const key of draft.primary || []) {
    const subs = draft.subs?.[key];
    if (subs && subs.length) for (const d of subs) out.push({ key, detail: d, note: null });
    else out.push({ key, detail: null, note: null });
  }
  return out;
}

// Internal: order-insensitive equality of two drafts (chip-tap order carries no
// meaning, so {a,b} == {b,a}).
function sameDraft(a, b) {
  if ((a.verb ?? null) !== (b.verb ?? null)) return false;
  const ap = [...a.primary].sort(); const bp = [...b.primary].sort();
  if (ap.length !== bp.length || ap.some((k, i) => k !== bp[i])) return false;
  const keys = new Set([...Object.keys(a.subs || {}), ...Object.keys(b.subs || {})]);
  for (const k of keys) {
    const as = [...(a.subs?.[k] || [])].sort(); const bs = [...(b.subs?.[k] || [])].sort();
    if (as.length !== bs.length || as.some((d, i) => d !== bs[i])) return false;
  }
  return true;
}

/**
 * True if the draft differs from the saved decision it would hydrate from —
 * i.e. there is un-saved user input worth preserving across a repaint.
 * @param {object} draft
 * @param {object|null} current  the saved { reaction, reasons } (or null)
 */
export function isDirty(draft, current) {
  return !sameDraft(draft, draftFromDecision(current));
}
