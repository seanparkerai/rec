// suppress.js — pure feed-suppression + de-duplication over the physical-property
// fingerprint (classify.js). No DOM, no storage, no fetch — unit-tested in Node.
//
// The problem it solves: reactions key on rightmove_id, but a re-listed property
// gets a NEW rightmove_id, so a saved/rejected home returns as a "fresh" card and
// the feed fills with duplicates. These helpers let the feed treat a PROPERTY (by
// fingerprint) as decided/duplicate, independent of which listing id it wears.
//
// Policy (per the v3 design + the household's instruction):
//   • A property whose LATEST reaction is `like` or `reject` is DECIDED → never
//     shown again as a fresh card (matched by id AND fingerprint, so re-lists are
//     caught). The reject signal lives forever in the append-only log, so this is
//     durable even after the heavy listings row is purged.
//   • `pass` is a soft skip — NOT decided, may resurface (matches "pass is
//     unlabelled / never trains").
//   • Among undecided rows, same-fingerprint duplicates collapse to ONE.

import { propertyFingerprint } from './classify.js';

/** Reactions that "decide" a property (remove it from the fresh feed). */
const DECIDING = new Set(['like', 'reject']);

/**
 * Build the suppression sets from a latest-reaction-per-listing map.
 * @param {Map<string, {reaction, listing_snapshot?}>} latest  latestPerListing(log)
 * @param {Map<string, object>} [liveById]  rightmove_id → live listing row (fingerprint fallback)
 * @returns {{ ids: Set<string>, fps: Set<string> }}
 */
export function decidedSets(latest, liveById = new Map()) {
  const ids = new Set();
  const fps = new Set();
  for (const [id, row] of latest instanceof Map ? latest : new Map(Object.entries(latest || {}))) {
    if (!DECIDING.has(row?.reaction)) continue;
    const key = String(id);
    ids.add(key);
    const fp = propertyFingerprint(row.listing_snapshot) || propertyFingerprint(liveById.get(key));
    if (fp) fps.add(fp);
  }
  return { ids, fps };
}

/** True if this listing's property is already decided (by id or fingerprint). */
export function isDecided(listing, { ids, fps } = {}) {
  if (ids && ids.has(String(listing?.rightmove_id))) return true;
  const fp = propertyFingerprint(listing);
  return !!(fp && fps && fps.has(fp));
}

/**
 * Collapse same-fingerprint listings to a single representative. Rows whose address
 * is too coarse to fingerprint (null) are always kept as unique (no false merge).
 * The representative is the newest (added_date|first_seen), tie-broken to the
 * cheaper price. `keyOf` extracts the listing from a wrapper (e.g. {listing,scored}).
 * Order is not preserved (callers re-sort).
 * @param {Array} items
 * @param {(x)=>object} [keyOf]
 */
export function dedupeByFingerprint(items, keyOf = (x) => x) {
  const groups = new Map();
  const singles = [];
  for (const it of items || []) {
    const fp = propertyFingerprint(keyOf(it));
    if (!fp) { singles.push(it); continue; }
    if (!groups.has(fp)) groups.set(fp, []);
    groups.get(fp).push(it);
  }
  const score = (l) => (new Date(l?.added_date || l?.first_seen || 0).getTime() || 0) - (Number(l?.price) || 0) / 1e9;
  const reps = [];
  for (const g of groups.values()) {
    g.sort((a, b) => score(keyOf(b)) - score(keyOf(a)));
    reps.push(g[0]);
  }
  return [...reps, ...singles];
}

/**
 * Collapse same-fingerprint items to ONE representative, choosing the entry with the
 * newest timestamp from `timeOf` (e.g. the most-recently-liked save). Like
 * dedupeByFingerprint, but the representative is picked by an explicit time accessor
 * rather than the listing's own added_date/first_seen — used by the Saved view, where
 * "newest" means most-recently saved, not most-recently listed. Items whose address is
 * too coarse to fingerprint (null) are always kept (no false merge).
 * @param {Array} items
 * @param {(x)=>object} [keyOf]   extract the fingerprintable listing from a wrapper
 * @param {(x)=>(string|number|Date)} [timeOf]  the comparison timestamp
 */
export function dedupeNewestByFingerprint(items, keyOf = (x) => x, timeOf = () => 0) {
  const repByFp = new Map();
  const singles = [];
  const t = (x) => new Date(timeOf(x)).getTime() || 0;
  for (const it of items || []) {
    const fp = propertyFingerprint(keyOf(it));
    if (!fp) { singles.push(it); continue; }
    const prev = repByFp.get(fp);
    if (!prev || t(it) > t(prev)) repByFp.set(fp, it);
  }
  return [...repByFp.values(), ...singles];
}
