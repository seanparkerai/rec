// meta-observations.js — v3 L5 recommendation loop. Pure, side-effect-free:
// no DOM, no DB, no fetch, no clock except an injectable `now`. One job:
//
//   detectConflicts() — when the household's LIKES contradict their stated
//   criteria (over budget, an excluded type, below the bed minimum), surface
//   a prompt. It NEVER edits criteria — conflicts are recommendations. A
//   3-condition trigger keeps it off noise; a dismissed prompt stays quiet
//   for META_OBS.DISMISS_DAYS.
//
// Imported by assets/js/suggestions/sources.js (the shared suggestion inbox)
// and tests/meta-observations.test.js.

import { META_OBS } from './intelligence-constants.js';

const norm = (s) => String(s || '').trim().toLowerCase();
const round2 = (n) => Math.round(n * 100) / 100;

function withinDays(iso, now, days) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t <= days * 86_400_000;
}

/** Graded LIKE rows that carry a usable snapshot (the only training-grade evidence). */
function likeRows(reactions) {
  return (Array.isArray(reactions) ? reactions : []).filter(
    (r) => r && r.reaction === 'like' && r.listing_snapshot,
  );
}

/** Graded REJECT rows with a snapshot — the evidence for an L7.5 prune suggestion. */
function rejectRows(reactions) {
  return (Array.isArray(reactions) ? reactions : []).filter(
    (r) => r && r.reaction === 'reject' && r.listing_snapshot,
  );
}

// ── Conflict detection ───────────────────────────────────────────────────────

/**
 * The 3-condition trigger, shared by every conflict kind:
 *   (1) at least MIN_CONFLICT_LIKES violating likes,
 *   (2) violating likes are ≥ MIN_CONFLICT_SHARE of the comparable likes,
 *   (3) at least one violating like is within CONFLICT_RECENCY_DAYS (it persists).
 * @returns {{ triggered, count, comparable, share, reaction_ids }}
 */
function evaluate(violating, comparable, now, cfg) {
  const count = violating.length;
  const denom = comparable.length || 0;
  const share = denom ? count / denom : 0;
  const recent = violating.some((r) => withinDays(r.created_at, now, cfg.CONFLICT_RECENCY_DAYS));
  const triggered = count >= cfg.MIN_CONFLICT_LIKES && share >= cfg.MIN_CONFLICT_SHARE && recent;
  return { triggered, count, comparable: denom, share: round2(share), recent, reaction_ids: violating.map((r) => r.id ?? r.listing_id) };
}

/**
 * Detect criteria conflicts in the like history. Dismissed prompts (whose
 * `dismissed_until` is still in the future) are filtered out.
 * @param {Array} reactions   reaction rows { id, reaction, created_at, listing_snapshot }
 * @param {object} criteria   household criteria record
 * @param {object} [opts]     { now, dismissals: { [key]: iso }, cfg }
 * @returns {Array<{ key, kind, message, suggestion, count, share, threshold, reaction_ids }>}
 */
export function detectConflicts(reactions, criteria = {}, opts = {}) {
  const now = opts.now ? (opts.now instanceof Date ? opts.now : new Date(opts.now)) : new Date();
  const cfg = { ...META_OBS, ...(opts.cfg || {}) };
  const dismissals = opts.dismissals || {};
  const likes = likeRows(reactions);
  const out = [];

  // A dismissal entry is either a legacy ISO string (the original "dismiss for 14
  // days") OR the richer object form { kind:'snooze'|'dismiss', until } written by
  // the unified Snooze/Dismiss controls. Both resolve to a future-or-past timestamp.
  const untilMs = (v) => {
    if (!v) return 0;
    const iso = typeof v === 'object' ? v.until : v;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const push = (key, kind, evalRes, message, suggestion, threshold, extra = {}) => {
    if (!evalRes.triggered) return;
    if (untilMs(dismissals[key]) > now.getTime()) return; // still snoozed / dismissed
    out.push({ key, kind, message, suggestion, count: evalRes.count, share: evalRes.share, threshold, reaction_ids: evalRes.reaction_ids, ...extra });
  };

  // 1. Over budget — likes priced above criteria.budget.max.
  const maxBudget = Number(criteria?.budget?.max) || 0;
  if (maxBudget) {
    const withPrice = likes.filter((r) => Number(r.listing_snapshot?.price) > 0);
    const over = withPrice.filter((r) => Number(r.listing_snapshot.price) > maxBudget);
    // Proposed new ceiling = the priciest home you've liked, so every liked home fits.
    const maxOver = over.length ? Math.max(...over.map((r) => Number(r.listing_snapshot.price))) : 0;
    push('conflict:over-budget', 'over-budget', evaluate(over, withPrice, now, cfg),
      `You've liked ${over.length} home${over.length === 1 ? '' : 's'} above your £${maxBudget.toLocaleString('en-GB')} budget ceiling.`,
      'Raise your budget, or keep it as a hard filter — your call.', maxBudget, { proposed: maxOver });
  }

  // 2. Excluded type — likes of a property type marked excluded.
  const excluded = (criteria?.propertyTypePrefs?.excluded || []).map(norm).filter(Boolean);
  if (excluded.length) {
    const withType = likes.filter((r) => r.listing_snapshot?.property_type);
    const isExcluded = (t) => { const n = norm(t); return excluded.some((e) => n.includes(e) || e.includes(n)); };
    const bad = withType.filter((r) => isExcluded(r.listing_snapshot.property_type));
    const types = [...new Set(bad.map((r) => r.listing_snapshot.property_type))].join(', ');
    // The criteria.excluded entries that actually matched — Apply re-accepts exactly these.
    const excludedMatched = excluded.filter((e) => bad.some((r) => {
      const n = norm(r.listing_snapshot.property_type); return n.includes(e) || e.includes(n);
    }));
    push('conflict:excluded-type', 'excluded-type', evaluate(bad, withType, now, cfg),
      `You keep liking ${types || 'types'} — which you marked as excluded.`,
      'Add the type back to your accepted list, or keep excluding it.', types, { excludedMatched });
  }

  // 3. Below the bed minimum — likes with fewer beds than criteria.size.minBeds.
  const minBeds = Number(criteria?.size?.minBeds) || 0;
  if (minBeds) {
    const withBeds = likes.filter((r) => r.listing_snapshot?.beds != null && Number.isFinite(Number(r.listing_snapshot.beds)));
    const small = withBeds.filter((r) => Number(r.listing_snapshot.beds) < minBeds);
    // Proposed new minimum = the smallest liked home, so every liked home clears the bar.
    const minLiked = small.length ? Math.min(...small.map((r) => Number(r.listing_snapshot.beds))) : minBeds;
    push('conflict:below-min-beds', 'below-min-beds', evaluate(small, withBeds, now, cfg),
      `You've liked ${small.length} home${small.length === 1 ? '' : 's'} below your ${minBeds}-bed minimum.`,
      'Lower your bed minimum, or keep it firm.', minBeds, { proposed: minLiked });
  }

  // ── L7.5 geofence tuning — surfaced as recommendations, NEVER silent edits. ──
  const rejects = rejectRows(reactions);
  const areasMeta = opts.areas || {};            // { [area_id]: { name, geofenceRadiusMi } }

  // 4. Tighten buffer — every recent LIKE in an area sits well inside its buffer,
  //    so the buffer could be tightened without losing anything you've wanted. The
  //    3-condition trigger is reused (the likes are their own "violating" set).
  const likesByArea = new Map();
  for (const r of likes) {
    const id = r.listing_snapshot?.area_id; const d = Number(r.listing_snapshot?.distance_mi);
    if (!id || !Number.isFinite(d)) continue;
    if (!likesByArea.has(id)) likesByArea.set(id, []);
    likesByArea.get(id).push({ ...r, _mi: d });
  }
  for (const [areaId, rows] of likesByArea) {
    const meta = areasMeta[areaId] || {};
    const radius = Number(meta.geofenceRadiusMi);
    if (!Number.isFinite(radius)) continue;
    const maxLiked = Math.max(...rows.map((r) => r._mi));
    const proposed = Math.max(1, Math.ceil(maxLiked + 0.5));   // snug fit, ≥1mi, leave headroom
    if (proposed + cfg.TIGHTEN_MARGIN_MI > radius) continue;   // not worth tightening
    push(`tighten:${areaId}`, 'tighten-buffer', evaluate(rows, rows, now, cfg),
      `Every home you've liked in ${meta.name || areaId} is within ${maxLiked.toFixed(1)} mi of the village — your search there reaches ${radius} mi.`,
      `Tighten ${meta.name || areaId} to ~${proposed} mi?`, radius, { proposed, areaId });
  }

  // 5. Stop searching — an area/outcode you keep rejecting with NO likes, flagged as
  //    a prune candidate by deriveSearchSpec (strong negative learned weight).
  const cand = opts.pruneCandidates || { areas: [], outcodes: [] };
  const likedAreas = new Set(likes.map((r) => r.listing_snapshot?.area_id).filter(Boolean));
  const likedOutcodes = new Set(likes.map((r) => norm(r.listing_snapshot?.outcode)).filter(Boolean));
  for (const areaId of cand.areas || []) {
    if (likedAreas.has(areaId)) continue;                       // never prune somewhere you've liked
    const bad = rejects.filter((r) => r.listing_snapshot?.area_id === areaId);
    const name = areasMeta[areaId]?.name || areaId;
    push(`prune-area:${areaId}`, 'stop-searching', evaluate(bad, bad, now, cfg),
      `You've passed on ${bad.length} home${bad.length === 1 ? '' : 's'} in ${name} and liked none.`,
      `Stop searching ${name} (set it aside), or keep it in?`, 0, { areaId });
  }
  for (const oc of cand.outcodes || []) {
    const ocn = norm(oc);
    if (likedOutcodes.has(ocn)) continue;
    const bad = rejects.filter((r) => norm(r.listing_snapshot?.outcode) === ocn);
    push(`prune-outcode:${ocn}`, 'stop-searching', evaluate(bad, bad, now, cfg),
      `You've passed on ${bad.length} home${bad.length === 1 ? '' : 's'} in ${String(oc).toUpperCase()} and liked none.`,
      `Stop searching ${String(oc).toUpperCase()}, or keep it in?`, 0, { outcode: String(oc).toUpperCase() });
  }

  return out;
}

/** ISO timestamp META_OBS.DISMISS_DAYS in the future — store as `dismissed_until`. */
export function dismissUntil(now = new Date(), days = META_OBS.DISMISS_DAYS) {
  const ref = now instanceof Date ? now : new Date(now);
  return new Date(ref.getTime() + days * 86_400_000).toISOString();
}
