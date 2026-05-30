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
  { key: 'other',         label: 'Other' },
];

const REJECT_REASON_KEYS = new Set(REJECT_REASONS.map((r) => r.key));

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
  return true;
}

/** True if `key` is a recognised reject-reason chip key. */
export function isRejectReasonKey(key) {
  return REJECT_REASON_KEYS.has(key);
}

/**
 * Normalise a loose reaction input into the row shape inserted into
 * listing_reactions. `reason` is dropped for non-reject reactions (a reason only
 * applies to a reject). Returns null for an invalid reaction.
 * @param {object} input  { listing_id, reaction, reason?, listing_snapshot? }
 * @param {Date|string} now
 */
export function normaliseReaction(input, now = new Date()) {
  if (!input || !isReaction(input.reaction) || !input.listing_id) return null;
  const nowIso = now instanceof Date ? now.toISOString() : String(now);
  const reason = input.reaction === 'reject' && input.reason ? String(input.reason) : null;
  return {
    listing_id: String(input.listing_id),
    reaction: input.reaction,
    reason,
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
