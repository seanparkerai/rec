// feed-partition.js — the pure Browse-feed partition pipeline, extracted from
// page-listings.js paint() so the maths is unit-testable in Node (P11c/P11e).
// No DOM, no storage, no fetch: every page-specific dependency (scoring, junk
// classification, refinement rules, suppression sets, controls) arrives as a
// callback. The pipeline and its counting rules are UNCHANGED from the inline
// original:
//   radius → score → affordability gate → junk / refinement hides → decided
//   suppression → fingerprint dedupe → search/sort controls → reviewed split
//   (by verdict) → summary counts.
import { dedupeByFingerprint } from './suppress.js';

/**
 * Partition the raw listings into the rendered feed shape.
 * @param {Array} listings  raw listing rows (fetcher shape, keyed by rightmove_id)
 * @param {object} deps
 * @param {(l)=>boolean}   [deps.passesRadius]  household search-radius pre-filter
 * @param {(l)=>object}     deps.scoreOf        memoised fit score ({score, verdict, gated, …})
 * @param {(l)=>object|null}[deps.areaOf]       matched area record
 * @param {boolean}        [deps.includeOOR]    "Show out of reach" toggle
 * @param {boolean}        [deps.includeHidden] "Show hidden" toggle
 * @param {(l)=>boolean}    deps.isJunk         junk classifier (auction / over-55)
 * @param {(l)=>boolean}   [deps.isRefHidden]   hidden by a confirmed refinement
 * @param {(l)=>boolean}    deps.isDecided      latest reaction like/reject (id OR fingerprint)
 * @param {(id)=>boolean}  [deps.isReviewed]    user pressed Save on this listing
 * @param {(id)=>object|null} [deps.reactionOf] current reaction for a listing id
 * @param {(ls:Array, scoredRows:Array)=>Array} [deps.applyControls] search/filter/sort
 * @returns {{ scoredRows, visible, unreviewed, reviewed, byVerb, counts }}
 *   rows are { listing, scored, area }; byVerb groups the reviewed rows as
 *   { like, pass, reject } (an unknown verb folds into pass); counts carries
 *   { hiddenByRadiusCount, gatedCount, hiddenJunkCount, hiddenRefCount,
 *     decidedCount, dupCount, hiddenByFilter }.
 */
export function partitionFeed(listings, {
  passesRadius = () => true,
  scoreOf,
  areaOf = () => null,
  includeOOR = false,
  includeHidden = false,
  isJunk = () => false,
  isRefHidden = () => false,
  isDecided = () => false,
  isReviewed = () => false,
  reactionOf = () => null,
  applyControls = (ls) => ls,
} = {}) {
  const all = Array.isArray(listings) ? listings : [];
  const radiusFiltered = all.filter(passesRadius);
  const hiddenByRadiusCount = all.length - radiusFiltered.length;
  const scoredRows = radiusFiltered.map((listing) => ({ listing, scored: scoreOf(listing), area: areaOf(listing) }));
  const gated = scoredRows.filter((r) => r.scored.gated);
  const rowById = new Map(scoredRows.map((r) => [r.listing.rightmove_id, r]));

  // Three independent hides, all reversible: the affordability gate (out-of-reach),
  // the junk classifier (auction / over-55), and confirmed refinements (a value the
  // user chose to hide). Gated rows are counted first; junk and refinement are
  // counted among rows that survived the gate. A listing both junk AND
  // refinement-hidden is counted only as junk (no double-count). All three are
  // revealed together by the "Show hidden" toggle.
  const afford = includeOOR ? scoredRows : scoredRows.filter((r) => !r.scored.gated);
  const junkRows = afford.filter((r) => isJunk(r.listing));
  const refHiddenRows = afford.filter((r) => !isJunk(r.listing) && isRefHidden(r.listing));
  const pool = includeHidden ? afford : afford.filter((r) => !isJunk(r.listing) && !isRefHidden(r.listing));

  // Suppress already-decided properties (latest reaction like/reject) by id AND by
  // physical-property fingerprint, so a re-list under a new rightmove_id is caught;
  // `pass` stays resurfaceable. Then collapse same-fingerprint duplicates to one
  // representative. "Show hidden" reveals the decided rows alongside junk.
  const undecided = includeHidden ? pool : pool.filter((r) => !isDecided(r.listing));
  const deduped = dedupeByFingerprint(undecided, (r) => r.listing);
  const decidedCount = pool.length - undecided.length;
  const dupCount = undecided.length - deduped.length;
  const visible = applyControls(deduped.map((r) => r.listing), scoredRows)
    .map((l) => rowById.get(l.rightmove_id))
    .filter(Boolean);

  // Partition into still-to-review (top, fit-ranked) and reviewed (collapsed at
  // the bottom, split by the user's verdict). Reviewed = a Saved decision.
  const unreviewed = visible.filter((r) => !isReviewed(r.listing.rightmove_id));
  const reviewed = visible.filter((r) => isReviewed(r.listing.rightmove_id));
  const byVerb = { like: [], pass: [], reject: [] };
  for (const r of reviewed) {
    const verb = reactionOf(r.listing.rightmove_id)?.reaction;
    (byVerb[verb] || byVerb.pass).push(r); // unknown verb reads as passed
  }

  const gatedCount = includeOOR ? 0 : gated.length;
  const hiddenJunkCount = includeHidden ? 0 : junkRows.length;
  const hiddenRefCount = includeHidden ? 0 : refHiddenRows.length;
  const counts = {
    hiddenByRadiusCount,
    gatedCount,
    hiddenJunkCount,
    hiddenRefCount,
    decidedCount,
    dupCount,
    hiddenByFilter: Math.max(0, all.length - visible.length - hiddenByRadiusCount - gatedCount - hiddenJunkCount - hiddenRefCount - decidedCount - dupCount),
  };
  return { scoredRows, visible, unreviewed, reviewed, byVerb, counts };
}
