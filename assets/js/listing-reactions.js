// listing-reactions.js — pure, side-effect-free helpers for the v3 L3 reaction
// log. No network, no DB, no DOM, so it imports cleanly in the browser and Node.
// Imported by assets/js/storage.js (write path),
// assets/js/page-listings.js (UI), and tests/listing-reactions.test.js so the
// vocabulary / validation / latest-per-listing reduction is unit-tested
// independently of any live insert.
//
// Reaction model (CLAUDE.md v3 L3):
//   - GRADED signals (like / reject-with-reason) are the training input for the
//     Layer 2 learning engine. `pass` is a soft skip (weakly negative).
//   - Workflow events (viewed / ignored) are NOT reactions and never land here —
//     they belong to the shortlist personal-status map, not the reaction log.
//   - The log is APPEND-ONLY: every tap is a new row; the most-recent row per
//     listing is the current reaction.

/** The reaction vocabulary written to listing_reactions.reaction. */
export const REACTIONS = ['like', 'pass', 'reject'];

/** Reactions that carry a graded training signal for Layer 2 (pass is soft). */
export const GRADED_REACTIONS = ['like', 'reject'];

/** Canonical reject-reason chips. `other` allows free text in `reason`. */
export const REJECT_REASONS = [
  { key: 'too_expensive', label: 'Too expensive' },
  { key: 'wrong_area',    label: 'Wrong area' },
  { key: 'too_small',     label: 'Too small' },
  { key: 'needs_work',    label: 'Needs too much work' },
  { key: 'no_outdoor',    label: 'No outdoor space' },
  { key: 'poor_layout',   label: 'Poor layout' },
  { key: 'busy_road',     label: 'Busy road / location' },
];

const REJECT_REASON_KEYS = new Set(REJECT_REASONS.map((r) => r.key));

/**
 * Optional second-level refinements per primary reject reason — the "further
 * level of detail" chips revealed beneath an active primary reason. All optional
 * (selecting none is fine). Keys are short + stable; they namespace under their
 * parent, so the same sub-key (`schools`, `parking`) can recur under different
 * parents without colliding.
 */
export const REJECT_SUBREASONS = {
  too_expensive: [
    { key: 'over_budget', label: 'Over budget' },
    { key: 'poor_value',  label: 'Poor value for the spec' },
  ],
  wrong_area: [
    { key: 'too_rural', label: 'Too rural' },
    { key: 'too_urban', label: 'Too built-up' },
    { key: 'commute',   label: 'Bad commute' },
    { key: 'schools',   label: 'Schools' },
    { key: 'flood',     label: 'Flood risk' },
  ],
  too_small: [
    { key: 'beds',      label: 'Too few bedrooms' },
    { key: 'reception', label: 'Living space too small' },
    { key: 'plot',      label: 'Plot/garden too small' },
    { key: 'storage',   label: 'Not enough storage' },
  ],
  needs_work: [
    { key: 'structural', label: 'Structural' },
    { key: 'cosmetic',   label: 'Cosmetic only' },
    { key: 'dated',      label: 'Dated but liveable' },
  ],
  no_outdoor: [
    { key: 'no_garden',  label: 'No garden' },
    { key: 'no_parking', label: 'No parking' },
  ],
  poor_layout: [
    { key: 'bathrooms', label: 'Too few bathrooms' },
    { key: 'flow',      label: 'Awkward flow' },
    { key: 'no_storage', label: 'No storage' },
  ],
  busy_road: [
    { key: 'noise',   label: 'Noise' },
    { key: 'safety',  label: 'Road safety' },
    { key: 'parking', label: 'Parking' },
  ],
};

/**
 * Positive-reason vocabulary for a `like` — the cheapest fix for the negative
 * signal skew (the model only knows dislikes). A like may carry these so the
 * model learns WHAT was liked, not merely that something was.
 */
export const LIKE_REASONS = [
  { key: 'great_area',    label: 'Great area' },
  { key: 'good_value',    label: 'Good value' },
  { key: 'right_size',    label: 'Right size' },
  { key: 'good_layout',   label: 'Good layout' },
  { key: 'kitchen',       label: 'Kitchen' },
  { key: 'light',         label: 'Light & aspect' },
  { key: 'outdoor_space', label: 'Outdoor space' },
  { key: 'parking',       label: 'Parking' },
  { key: 'move_in_ready', label: 'Move-in ready' },
  { key: 'character',     label: 'Character' },
];

/**
 * Feature-level sub-reasons for likes — the "specifically what makes it a
 * positive" detail beneath each primary like. Mirrors REJECT_SUBREASONS in shape;
 * richer here because the positive-feedback loop wants the user to call out the
 * exact elements they love. Sub-keys namespace under their parent.
 */
export const LIKE_SUBREASONS = {
  great_area:    [{ key: 'quiet', label: 'Quiet' }, { key: 'connected', label: 'Well connected' }, { key: 'schools', label: 'Good schools' }, { key: 'green_space', label: 'Green space' }, { key: 'amenities', label: 'Amenities nearby' }],
  good_value:    [{ key: 'under_priced', label: 'Priced below similar' }, { key: 'price_drop', label: 'Recent price drop' }, { key: 'space_for_money', label: 'Space for the money' }],
  right_size:    [{ key: 'beds', label: 'Right bedrooms' }, { key: 'reception', label: 'Great living space' }, { key: 'plot', label: 'Good plot/garden' }, { key: 'storage', label: 'Good storage' }],
  good_layout:   [{ key: 'open_plan', label: 'Open plan' }, { key: 'separate_rooms', label: 'Separate rooms' }, { key: 'flow', label: 'Good flow' }, { key: 'bathrooms', label: 'Enough bathrooms' }],
  kitchen:       [{ key: 'modern', label: 'Modern' }, { key: 'large', label: 'Large' }, { key: 'island', label: 'Island' }, { key: 'utility', label: 'Utility room' }],
  light:         [{ key: 'south_facing', label: 'South-facing' }, { key: 'large_windows', label: 'Large windows' }, { key: 'dual_aspect', label: 'Dual aspect' }],
  outdoor_space: [{ key: 'garden', label: 'Garden' }, { key: 'patio', label: 'Patio/terrace' }, { key: 'balcony', label: 'Balcony' }],
  parking:       [{ key: 'driveway', label: 'Driveway' }, { key: 'garage', label: 'Garage' }, { key: 'ev', label: 'EV charging' }],
  move_in_ready: [{ key: 'modern_finish', label: 'Modern finish' }, { key: 'renovated', label: 'Recently renovated' }, { key: 'new_build', label: 'New build' }],
  character:     [{ key: 'period', label: 'Period features' }, { key: 'fireplace', label: 'Fireplace' }, { key: 'beams', label: 'Beams' }, { key: 'high_ceilings', label: 'High ceilings' }],
};

// Union of every recognised PRIMARY reason key (reject + like). `other` appears
// in both vocabularies and means the same generic thing in either, so a shared
// lookup is safe.
const REASON_KEYS = new Set([...REJECT_REASONS, ...LIKE_REASONS].map((r) => r.key));
// Parent-key → sub-reason list. Parent keys are disjoint across reject/like
// (except `other`, empty in both), so the merge never loses entries.
const SUBREASONS_BY_KEY = { ...REJECT_SUBREASONS, ...LIKE_SUBREASONS };

/** True if `key` is a recognised primary reason key (reject OR like). */
export function isReasonKey(key) {
  return REASON_KEYS.has(key);
}

/** The optional sub-reasons for a primary reason key ([] if none). */
export function subReasonsFor(key) {
  return SUBREASONS_BY_KEY[key] || [];
}

/** True if `detail` is a valid sub-reason of primary reason `parentKey`. */
export function isSubReasonKey(parentKey, detail) {
  return subReasonsFor(parentKey).some((s) => s.key === detail);
}

/**
 * Personal-status lifecycle for a saved property. Lives on the existing
 * shortlist record (NOT a parallel state machine) — see storage.js. Distinct
 * from the reaction vocabulary: a status is the current lifecycle state, a
 * reaction is an append-only graded signal.
 */
export const PERSONAL_STATUSES = ['new', 'saved', 'viewed', 'offered', 'rejected'];

/** True if `reaction` is one of the known reaction verbs. */
export function isReaction(reaction) {
  return REACTIONS.includes(reaction);
}

/** True if `status` is a known personal-status lifecycle value. */
export function isPersonalStatus(status) {
  return PERSONAL_STATUSES.includes(status);
}

/**
 * Validate a reaction record before it is inserted. Throws on the first problem
 * so the caller surfaces a clear message; returns true when valid.
 * @param {object} r  { listing_id, reaction, reason? }
 */
export function validateReaction(r) {
  if (!r || typeof r !== 'object') throw new Error('reaction must be an object');
  if (!r.listing_id || typeof r.listing_id !== 'string') throw new Error('reaction.listing_id is required');
  if (!isReaction(r.reaction)) throw new Error(`reaction.reaction must be one of ${REACTIONS.join('/')}`);
  // A reason is only meaningful for reject; when present it must be a non-empty string.
  if (r.reason != null) {
    if (typeof r.reason !== 'string' || !r.reason.trim()) throw new Error('reaction.reason, when present, must be a non-empty string');
  }
  // The structured multi-reason array, when present, must be an array of entries
  // each carrying a recognised primary reason key.
  if (r.reasons != null) {
    if (!Array.isArray(r.reasons)) throw new Error('reaction.reasons, when present, must be an array');
    for (const entry of r.reasons) {
      const k = typeof entry === 'string' ? entry : entry?.key;
      if (!k || !isReasonKey(String(k))) throw new Error(`reaction.reasons contains an unknown reason key: ${k}`);
    }
  }
  return true;
}

/** True if `key` is a recognised reject-reason chip key. */
export function isRejectReasonKey(key) {
  return REJECT_REASON_KEYS.has(key);
}

/**
 * Clean a loose array of `{ key, detail?, note? }` (or bare key strings) into the
 * validated, de-duplicated reasons shape stored on a reaction. Pure: invalid
 * entries are DROPPED (never thrown). Unknown primary keys are dropped; a
 * sub-reason `detail` that doesn't belong to its parent is reset to null; notes
 * are trimmed and capped. De-dup is by `key::detail` (so two sub-reasons under
 * one primary survive, but exact repeats collapse).
 * @param {Array} input
 * @param {object} [opts] { max, noteMax }
 * @returns {Array<{key:string, detail:string|null, note:string|null}>}
 */
export function normaliseReasons(input, opts = {}) {
  const max = Number.isFinite(opts.max) ? opts.max : 8;
  const noteMax = Number.isFinite(opts.noteMax) ? opts.noteMax : 280;
  if (!Array.isArray(input)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of input) {
    if (out.length >= max) break;
    const entry = typeof raw === 'string' ? { key: raw } : raw;
    if (!entry || typeof entry !== 'object') continue;
    const key = String(entry.key || '').trim();
    if (!isReasonKey(key)) continue;
    let detail = entry.detail == null ? null : String(entry.detail).trim();
    if (!detail || !isSubReasonKey(key, detail)) detail = null;
    let note = entry.note == null ? null : String(entry.note).trim();
    if (!note) note = null;
    else if (note.length > noteMax) note = note.slice(0, noteMax);
    const dedup = `${key}::${detail ?? ''}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    out.push({ key, detail, note });
  }
  return out;
}

/** The primary (first) reason key of a reasons array, or null. */
export function primaryReasonKey(reasons) {
  const arr = Array.isArray(reasons) ? reasons : [];
  return arr.length && arr[0]?.key ? String(arr[0].key) : null;
}

/**
 * Normalise a loose reaction input into the row shape inserted into
 * listing_reactions. The structured `reasons` array is the source of truth; the
 * scalar `reason` is dual-written with the PRIMARY reject reason key for
 * back-compat (and stays null for non-reject — the historical invariant). A
 * `like` may carry positive `reasons` (the scalar stays null). A legacy reject
 * carrying only the scalar `reason` synthesises a one-element `reasons` array so
 * every reject trains through the array-aware engine. Returns null for an invalid
 * reaction.
 * @param {object} input  { listing_id, reaction, reason?, reasons?, listing_snapshot? }
 * @param {Date|string} now
 */
export function normaliseReaction(input, now = new Date()) {
  if (!input || !isReaction(input.reaction) || !input.listing_id) return null;
  const nowIso = now instanceof Date ? now.toISOString() : String(now);
  const rx = input.reaction;

  // Graded reactions carry reasons (reject negatives, like positives); pass none.
  let reasons = (rx === 'reject' || rx === 'like') ? normaliseReasons(input.reasons) : [];
  // Back-compat: a legacy reject with only the scalar `reason` → one-element array.
  if (rx === 'reject' && reasons.length === 0 && input.reason && isReasonKey(String(input.reason))) {
    reasons = [{ key: String(input.reason), detail: null, note: null }];
  }
  // Scalar reason: reject-only (historical invariant), the primary reason key.
  const reason = rx === 'reject'
    ? (primaryReasonKey(reasons) || (input.reason && isReasonKey(String(input.reason)) ? String(input.reason) : null))
    : null;

  return {
    listing_id: String(input.listing_id),
    reaction: rx,
    reason,
    reasons,
    listing_snapshot: input.listing_snapshot ?? null,
    created_at: nowIso,
  };
}

/**
 * Reduce an append-only reaction log to the CURRENT reaction per listing: the
 * most-recent row (by created_at) for each listing_id wins.
 * @param {Array} rows  reaction rows with { listing_id, reaction, reason, created_at }
 * @returns {Map<string, object>} listing_id → latest reaction row
 */
export function latestPerListing(rows) {
  const latest = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?.listing_id) continue;
    const prev = latest.get(row.listing_id);
    if (!prev || new Date(row.created_at) >= new Date(prev.created_at)) {
      latest.set(row.listing_id, row);
    }
  }
  return latest;
}
