// learned-preferences.js — v3 L4 learning core. Pure, side-effect-free: no DOM,
// no DB, no fetch, no clock except an injectable `now`. Imported by
// assets/js/storage.js (recompute path), assets/js/page-listings.js (re-rank +
// cold-start deck), tools/fetch-listings.mjs (search-spec narrowing), and
// tests/learned-preferences.test.js so the algorithm is unit-tested in isolation.
//
// THE CONTRACT (docs/INTELLIGENCE_RULES.md §"Learned preferences"):
//   Layer 1  immutable reaction log (listing_reactions) — the raw evidence.
//   Layer 2  derived weights — deriveWeights() distils GRADED reactions into a
//            signal→weight map that is BASE-RATE CALIBRATED (only signals that
//            DISCRIMINATE within the shown set earn weight), RECENCY-DECAYED, and
//            TRACEABLE (each weight records the reaction_ids that produced it).
//   Layer 3  overrides — manual/AI weights that take precedence; conflicts with
//            Layer 2 surface as recommendations (L5), never resolved silently.
//
//   GUARDRAIL: cold-start (gradedCount) counts only like/reject. Passes are
//   UNLABELLED for graduation but, once cold-start is cleared, apply a small
//   LOCAL weak-negative penalty (PASS_WEIGHT-scaled, capped) to the discrimination
//   of signals that ALREADY carry graded evidence — they can never create a new
//   signal and never touch the shared denominator, so a pass on one listing can't
//   dilute an unrelated reject. `viewed`/`offered` personal status applies
//   VIEWED_MULTIPLIER to the matching reaction's recency weight so real decisions
//   outweigh casual likes.

import { LEARNED_PREF, RECENCY_DAYS, TRAINING_MILESTONES } from './intelligence-constants.js';

const GRADED = new Set(['like', 'reject']);
const PASS   = new Set(['pass']);
const norm = (s) => String(s || '').trim().toLowerCase();
const round3 = (n) => Math.round(n * 1000) / 1000;

// ── Signal extraction ────────────────────────────────────────────────────────
// Symmetric between a live listings row and a listing_snapshot (same fields), so
// the features we LEARN from are exactly the features we SCORE on.

/** Coarse, market-aligned price band label for a price (£). */
export function priceBand(price) {
  const p = Number(price) || 0;
  if (!p) return null;
  if (p < 250_000) return '<250k';
  if (p < 300_000) return '250-300k';
  if (p < 350_000) return '300-350k';
  if (p < 400_000) return '350-400k';
  if (p < 450_000) return '400-450k';
  if (p < 500_000) return '450-500k';
  if (p < 600_000) return '500-600k';
  if (p < 800_000) return '600-800k';
  return '800k+';
}

/** Bed bucket (5+ collapsed to curb sparsity). */
function bedBucket(beds) {
  if (beds == null || beds === '') return null;
  const b = Number(beds);
  if (!Number.isFinite(b)) return null;
  return b >= 5 ? '5+' : String(b);
}

/** Bath bucket (3+ collapsed to curb sparsity). Snapshot-derivable from `baths`,
 *  symmetric between a live row and a reaction snapshot (both carry `baths`). */
function bathBucket(baths) {
  if (baths == null || baths === '') return null;
  const b = Number(baths);
  if (!Number.isFinite(b)) return null;
  return b >= 3 ? '3+' : String(b);
}

/**
 * The signals a listing (or reaction snapshot) exhibits. These are the keys the
 * learned-weight map is built from and scored against.
 * @param {object} l  listing row or listing_snapshot { property_type, beds, outcode, area_id, price }
 * @returns {string[]}
 */
export function signalsForListing(l) {
  if (!l || typeof l !== 'object') return [];
  const sigs = [];
  const t = norm(l.property_type);
  if (t) sigs.push(`type:${t}`);
  const bb = bedBucket(l.beds);
  if (bb != null) sigs.push(`beds:${bb}`);
  const ba = bathBucket(l.baths);
  if (ba != null) sigs.push(`baths:${ba}`);
  const oc = norm(l.outcode);
  if (oc) sigs.push(`outcode:${oc}`);
  const a = norm(l.area_id);
  if (a) sigs.push(`area:${a}`);
  const pb = priceBand(l.price);
  if (pb) sigs.push(`price-band:${pb}`);
  // Outdoor / parking: a stored boolean (set on the snapshot at reaction time)
  // wins; otherwise infer from the description so a LIVE row scores on the same
  // feature it was LEARNED from (symmetry). Inference abstains (null) when unclear.
  const outdoor = l.outdoor_space ?? inferOutdoorSpace(l.description);
  if (outdoor != null) sigs.push(`outdoor:${outdoor ? 'yes' : 'no'}`);
  const parking = l.has_parking ?? inferParking(l.description);
  if (parking != null) sigs.push(`parking:${parking ? 'yes' : 'no'}`);
  return sigs;
}

// ── Feature inference from free text (conservative, abstaining) ──────────────
// outdoor_space / has_parking are not structured fields in the Rightmove feed.
// Rather than leave the signal permanently dead, infer it from the listing
// description — but ABSTAIN (return null → no signal emitted) whenever the text
// is ambiguous, so the training set never gains a guessed value. Strategy: strip
// explicit negations, test for a positive mention on the remainder (presence of
// ANY outdoor feature ⇒ "has outdoor space"); if only a negation remains ⇒ false;
// otherwise ⇒ null. Pure + unit-tested in tests/learned-preferences.test.js.

const OUTDOOR_NEG = /\bno\s+(?:private\s+|rear\s+|front\s+|outside\s+)?(?:garden|outdoor\s+space|outside\s+space)\b|\bwithout\s+(?:a\s+|an\s+)?garden\b/gi;
const OUTDOOR_POS = /\b(?:garden|patio|terrace|balcony|courtyard|outdoor\s+space|outside\s+space|decking)\b/i;
const PARKING_NEG = /\bno\s+(?:allocated\s+|off-?street\s+|private\s+)?parking\b|\bno\s+garage\b|\bno\s+driveway\b|\bstreet\s+parking\s+only\b|\bpermit(?:\s+parking)?\s+only\b/gi;
const PARKING_POS = /\b(?:driveway|garage|off-?street\s+parking|allocated\s+parking|private\s+parking|parking\s+space|car\s*port|residents'?\s+parking)\b/i;

/** Infer "has outdoor space" from description text. true | false | null (abstain). */
export function inferOutdoorSpace(text) {
  if (!text || typeof text !== 'string') return null;
  const neg = OUTDOOR_NEG.test(text);
  OUTDOOR_NEG.lastIndex = 0; // reset the /g regex between calls
  const cleaned = text.replace(OUTDOOR_NEG, ' ');
  OUTDOOR_NEG.lastIndex = 0;
  if (OUTDOOR_POS.test(cleaned)) return true;
  return neg ? false : null;
}

/** Infer "has parking" from description text. true | false | null (abstain). */
export function inferParking(text) {
  if (!text || typeof text !== 'string') return null;
  const neg = PARKING_NEG.test(text);
  PARKING_NEG.lastIndex = 0;
  const cleaned = text.replace(PARKING_NEG, ' ');
  PARKING_NEG.lastIndex = 0;
  if (PARKING_POS.test(cleaned)) return true;
  return neg ? false : null;
}

/** Human-readable label for a learned signal key (for the "Why this verdict" UI). */
export function describeSignal(signal) {
  const [kind, ...rest] = String(signal).split(':');
  const val = rest.join(':');
  switch (kind) {
    case 'type':       return `property type "${val}"`;
    case 'beds':       return `${val}-bed homes`;
    case 'baths':      return `${val}-bath homes`;
    case 'outcode':    return `the ${val.toUpperCase()} area`;
    case 'area':       return `the ${val} area`;
    case 'price-band': return `the ${val} price band`;
    case 'outdoor':    return val === 'yes' ? 'homes with outdoor space' : 'homes without outdoor space';
    case 'parking':    return val === 'yes' ? 'homes with parking' : 'homes without parking';
    default:           return signal;
  }
}

// ── Reason → feature attribution (v3 L4 causal sharpening) ───────────────────
// A reaction's reasons are CAUSAL information about WHICH feature drove it. A
// reject tagged "wrong area" is strong evidence against the home's location
// (outcode/area) but only weak evidence against its bed count or price band — so
// the location signals take the full contribution and the rest are discounted
// (UNATTRIBUTED_DISCOUNT). This stops the model conflating "I reject 3-bed homes"
// with "I rejected homes that happened to be 3-bed".
//
// Map: reason key → the signal KINDS it implicates (the prefix before ':' in a
// signal). A reason that maps to an EMPTY list (e.g. kitchen, light — features we
// don't snapshot) implicates nothing, so the reaction contributes a generic,
// discounted listing-level signal to ALL kinds (never silently dropped).
// Sub-reasons can ADD kinds via SUBREASON_SIGNAL_KINDS. Like-reasons map
// analogously (positive boosts).
export const REASON_SIGNAL_KINDS = {
  // reject reasons
  too_small:     ['beds'],
  wrong_area:    ['outcode', 'area'],
  too_expensive: ['price-band'],
  busy_road:     ['outcode', 'area'],
  poor_layout:   ['baths'],
  needs_work:    ['type'],   // work-intensity correlates with property type/age
  no_outdoor:    ['outdoor'],
  // like reasons (positive)
  great_area:    ['outcode', 'area'],
  good_value:    ['price-band'],
  right_size:    ['beds'],
  good_layout:   ['baths'],
  kitchen:       [],   // property-intrinsic — not captured
  light:         [],   // not captured
  parking:       ['parking'],
  move_in_ready: ['type'],   // new builds / modern stock cluster by type
  outdoor_space: ['outdoor'],
  character:     ['type'],
};

/**
 * Second-level sub-reason → signal KINDS, namespaced under their parent primary
 * key. Used by implicatedKinds() to ADD extra signal kinds when a sub-reason is
 * more specific than (or orthogonal to) its parent. Only entries that are
 * DIFFERENT FROM or ADDITIVE TO the parent are significant; the rest default to
 * the parent's mapping via union.
 *
 * Lookup: SUBREASON_SIGNAL_KINDS[primaryKey]?.[detailKey] → string[] | undefined
 */
export const SUBREASON_SIGNAL_KINDS = {
  needs_work: {
    structural: ['type'],   // period/older stock — strong type signal
    cosmetic:   [],         // any age; doesn't narrow type
    dated:      [],         // liveable but dated — any age
  },
  too_expensive: {
    over_budget:    ['price-band'],
    poor_value:     ['price-band', 'type'],   // spec for the money → price + type
  },
  too_small: {
    beds:       ['beds'],
    reception:  [],
    plot:       ['outdoor'],   // small plot → outdoor signal
    storage:    [],
  },
  poor_layout: {
    bathrooms:  ['baths'],
    flow:       [],
    no_storage: [],
  },
  no_outdoor: {
    no_garden:  ['outdoor'],
    no_parking: ['parking'],   // property-level parking shortage
  },
  busy_road: {
    noise:   ['outcode', 'area'],
    safety:  ['outcode', 'area'],
    parking: [],   // road-related parking problem ≠ property parking attribute
  },
  wrong_area: {
    too_rural:  ['outcode', 'area'],
    too_urban:  ['outcode', 'area'],
    commute:    ['outcode', 'area'],
    schools:    ['outcode', 'area'],
    flood:      ['outcode', 'area'],
  },
  // like sub-reasons
  great_area: {
    quiet:       ['outcode', 'area'],
    connected:   ['outcode', 'area'],
    schools:     ['outcode', 'area'],
    green_space: ['outcode', 'area'],
    amenities:   ['outcode', 'area'],
  },
  good_value: {
    under_priced:    ['price-band'],
    price_drop:      ['price-band'],
    space_for_money: ['price-band', 'type'],
  },
  right_size: {
    beds:      ['beds'],
    reception: [],
    plot:      ['outdoor'],
    storage:   [],
  },
  good_layout: {
    open_plan:      [],
    separate_rooms: [],
    flow:           [],
    bathrooms:      ['baths'],
  },
  outdoor_space: {
    garden:  ['outdoor'],
    patio:   ['outdoor'],
    balcony: [],
  },
  parking: {
    driveway: ['parking'],
    garage:   ['parking'],
    ev:       ['parking'],
  },
  move_in_ready: {
    modern_finish: ['type'],
    renovated:     [],
    new_build:     ['type'],
  },
  character: {
    period:        ['type'],
    fireplace:     [],
    beams:         [],
    high_ceilings: [],
  },
  kitchen: {},   // no sub-reasons map to captured signals
  light:   {},
};

/**
 * The set of signal KINDS a reaction's reasons implicate, or `null` when the
 * reaction carries no reasons (→ caller applies full, undiscounted contribution
 * to every signal, exactly as a pre-reasons reaction did — backward-compatible).
 * An empty set means "reasons present but none map to a captured signal" → the
 * caller discounts ALL signals (generic listing-level evidence).
 * @param {Array} reasons  [{ key, detail?, note? }]
 * @returns {Set<string>|null}
 */
export function implicatedKinds(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) return null;
  const kinds = new Set();
  for (const r of reasons) {
    const ks = REASON_SIGNAL_KINDS[r?.key];
    if (ks) for (const k of ks) kinds.add(k);
    if (r?.detail) {
      const subKs = SUBREASON_SIGNAL_KINDS[r.key]?.[r.detail];
      if (subKs) for (const k of subKs) kinds.add(k);
    }
  }
  return kinds;
}

// ── Recency ──────────────────────────────────────────────────────────────────

/** True if a listing was added within `days` of `now`. Undated ⇒ never recent. */
export function isRecent(listing, now = new Date(), days = RECENCY_DAYS) {
  const added = listing?.added_date;
  if (!added) return false;
  const t = new Date(added).getTime();
  if (!Number.isFinite(t)) return false;
  const ref = (now instanceof Date ? now : new Date(now)).getTime();
  return ref - t <= days * 86_400_000 && t <= ref + 86_400_000; // allow ~1d clock skew
}

// ── Layer 2: derive weights ──────────────────────────────────────────────────

/** Count of graded (like/reject) reactions that carry a usable snapshot. */
export function gradedCount(reactions) {
  return (Array.isArray(reactions) ? reactions : []).filter(
    (r) => r && GRADED.has(r.reaction) && r.listing_snapshot
  ).length;
}

/** True while there is too little graded evidence to credit any learned weight. */
export function isColdStart(reactions, min = LEARNED_PREF.COLD_START_MIN) {
  return gradedCount(reactions) < min;
}

/**
 * Honest, balance-aware training-progress summary for the L4 learning UI. Pure —
 * the page coordinator only renders the returned parts. NOT a single magic number:
 * effective strength blends VOLUME (graded count vs milestones) with BALANCE
 * (a one-sided feed is penalised, since the model only learns contrast). With the
 * household's current ~84:4 negative split this returns a low strength and an
 * "add more likes" next-action, which is the real bottleneck.
 *
 * @param {Array} reactions  reaction objects with a `.reaction` ('like'/'reject'/'pass'/…)
 * @param {object} [opts] { coldStartMin, milestones }
 * @returns {{ graded, likes, rejects, likeShare, rejectShare, balanceFactor,
 *             milestone, volumePct, strengthPct, cold, imbalanced, nextAction }}
 */
export function trainingProgress(reactions, opts = {}) {
  const coldMin = opts.coldStartMin ?? LEARNED_PREF.COLD_START_MIN;
  const M = opts.milestones ?? TRAINING_MILESTONES;
  const arr = Array.isArray(reactions) ? reactions : [];
  let likes = 0;
  let rejects = 0;
  for (const r of arr) {
    if (!r) continue;
    if (r.reaction === 'like') likes += 1;
    else if (r.reaction === 'reject') rejects += 1;
  }
  const graded = likes + rejects;
  const likeShare = graded ? likes / graded : 0;
  const rejectShare = graded ? rejects / graded : 0;
  // Balance factor: 50/50 → 1.0; fully one-sided → ~0. min(share)/0.5 is symmetric.
  const balanceFactor = graded ? Math.min(likeShare, rejectShare) / 0.5 : 0;
  // Volume progress toward "mature" (diminishing returns past there), 0..1.
  const volumePct = Math.max(0, Math.min(1, graded / M.mature));
  // Effective strength: volume penalised by imbalance, so a one-sided feed never
  // reads as "done" however many reactions it has.
  const strengthPct = Math.round(volumePct * balanceFactor * 100);
  const cold = graded < coldMin;
  const imbalanced = graded > 0 && likeShare < 0.2; // the "add more likes" trigger

  let milestone = 'warming-up';
  if (graded >= M.mature) milestone = 'mature';
  else if (graded >= M.solid) milestone = 'solid';
  else if (graded >= M.usable) milestone = 'usable';
  else if (!cold) milestone = 'learning';

  let nextAction;
  if (cold) nextAction = `Review ${coldMin - graded} more to start tuning your feed.`;
  else if (imbalanced) nextAction = 'You’ve told me what you dislike — now like a few you’d actually live in so I can find more like them.';
  else if (graded < M.usable) nextAction = `Review ${M.usable - graded} more for a meaningful re-rank.`;
  else if (graded < M.solid) nextAction = 'Solid start — keep reacting to sharpen the ranking.';
  else nextAction = 'Your feed is tuned — run a fresh fetch to pull more homes like your likes.';

  return { graded, likes, rejects, likeShare, rejectShare, balanceFactor, milestone, volumePct, strengthPct, cold, imbalanced, nextAction };
}

/**
 * Distil the reaction log into Layer-2 derived weights.
 *
 * Algorithm (calibrated · decayed · traceable):
 *   1. Keep only GRADED reactions (like/reject) that carry a snapshot.
 *   2. Below COLD_START_MIN graded reactions ⇒ return {} (honest cold start).
 *   3. Each reaction gets a recency weight 0.5^(ageDays / HALF_LIFE_DAYS).
 *   3b. REASON ATTRIBUTION. If a reaction carries reasons, the signal kinds those
 *      reasons IMPLICATE get the full recency weight; every other signal kind is
 *      multiplied by UNATTRIBUTED_DISCOUNT (d, default 0.35). A reaction with no
 *      reasons is undiscounted everywhere (unchanged legacy behaviour). The
 *      liked/rejected MASS (the denominators) always use the FULL recency weight
 *      `w` — only the per-signal numerators are discounted. So an unattributed
 *      signal present in every reject reaches P(s|rejected) = d (not 1): its
 *      discrimination, and thus its weight, is scaled by exactly d versus the
 *      attributed signal. This keeps probability shares ≤ 1 and consistent
 *      (every reaction contributes its full `w` to mass exactly once), while
 *      sharpening the attributed feature and protecting the innocent ones.
 *   4. For each signal s: P(s|liked) and P(s|rejected) are the recency-weighted
 *      (and attribution-discounted) shares of the liked / rejected mass that
 *      exhibit s. The discrimination P(s|liked) − P(s|rejected) is the signal's
 *      edge — a signal present in everything cancels to ~0 (so we never just
 *      re-learn `criteria`).
 *   5. weight = discrimination × MAX_LEARNED_WEIGHT × confidence(n), where
 *      confidence = n / (n + SMOOTHING). Signals below MIN_SIGNAL_N are dropped.
 *      (n is the raw reaction COUNT exhibiting s — the discount touches mass, not
 *      counts, so MIN_SIGNAL_N / confidence are unaffected.)
 *
 * @param {Array} reactions  rows { id, listing_id, reaction, reasons, created_at, listing_snapshot }
 * @param {object} [opts]    { now, halfLifeDays, maxWeight, minSignalN, smoothing, coldStartMin,
 *                             unattributedDiscount, passWeight, viewedMultiplier,
 *                             statusMap: { [listing_id]: 'viewed'|'offered'|… } }
 * @returns {{ derived: object, meta: object }}
 */
export function deriveWeights(reactions, opts = {}) {
  const now = opts.now ? (opts.now instanceof Date ? opts.now : new Date(opts.now)) : new Date();
  const halfLife = opts.halfLifeDays ?? LEARNED_PREF.HALF_LIFE_DAYS;
  const maxW = opts.maxWeight ?? LEARNED_PREF.MAX_LEARNED_WEIGHT;
  const minN = opts.minSignalN ?? LEARNED_PREF.MIN_SIGNAL_N;
  const smoothing = opts.smoothing ?? LEARNED_PREF.SMOOTHING;
  const coldMin = opts.coldStartMin ?? LEARNED_PREF.COLD_START_MIN;
  const discount = opts.unattributedDiscount ?? LEARNED_PREF.UNATTRIBUTED_DISCOUNT;
  const passWeight = opts.passWeight ?? LEARNED_PREF.PASS_WEIGHT;
  const viewedMult = opts.viewedMultiplier ?? LEARNED_PREF.VIEWED_MULTIPLIER;
  const statusMap = opts.statusMap ?? {};

  const all = Array.isArray(reactions) ? reactions : [];
  const graded = all.filter((r) => r && GRADED.has(r.reaction) && r.listing_snapshot);
  const passes = all.filter((r) => r && PASS.has(r.reaction)  && r.listing_snapshot);

  const meta = {
    coldStart: graded.length < coldMin,
    gradedCount: graded.length,
    decay_basis: 'days',
    half_life_days: halfLife,
    unattributed_discount: discount,
    computed_at: now.toISOString(),
  };
  if (meta.coldStart) return { derived: {}, meta };

  let likedMass = 0;
  let rejectedMass = 0;
  const acc = new Map(); // signal → { likedW, rejectedW, passMass, n, n_liked, n_rejected, n_pass, reaction_ids:Set }

  for (const r of graded) {
    const ageDays = Math.max(0, (now.getTime() - new Date(r.created_at).getTime()) / 86_400_000);
    const status = statusMap[r.listing_id];
    const statusMult = (status === 'viewed' || status === 'offered') ? viewedMult : 1;
    const w = Math.pow(0.5, ageDays / halfLife) * statusMult;
    const liked = r.reaction === 'like';
    if (liked) likedMass += w; else rejectedMass += w;

    const id = r.id ?? `${r.listing_id}@${r.created_at}`;
    // Reason attribution: full weight for implicated signal kinds, discounted for
    // the rest. `null` ⇒ no reasons ⇒ full weight everywhere (legacy behaviour).
    const kinds = implicatedKinds(r.reasons);
    for (const s of signalsForListing(r.listing_snapshot)) {
      const kind = s.slice(0, s.indexOf(':'));
      const mult = kinds === null ? 1 : (kinds.has(kind) ? 1 : discount);
      const cw = w * mult;
      let e = acc.get(s);
      if (!e) { e = { likedW: 0, rejectedW: 0, passMass: 0, n: 0, n_liked: 0, n_rejected: 0, n_pass: 0, reaction_ids: new Set() }; acc.set(s, e); }
      if (liked) { e.likedW += cw; e.n_liked += 1; } else { e.rejectedW += cw; e.n_rejected += 1; }
      e.n += 1;
      e.reaction_ids.add(id);
    }
  }

  // Passes are WEAK NEGATIVE evidence, applied as a LOCAL per-signal penalty — not
  // through the shared rejected denominator (which would let a pass on listing A
  // dilute an unrelated strong reject on B). A pass only touches signals that
  // already carry graded evidence (never creates a signal, never crosses cold
  // start) and only nudges that signal's discrimination DOWN (toward rejected),
  // bounded by passWeight and by the graded-only confidence(n).
  for (const r of passes) {
    const ageDays = Math.max(0, (now.getTime() - new Date(r.created_at).getTime()) / 86_400_000);
    const passW = Math.pow(0.5, ageDays / halfLife) * passWeight;
    const id = r.id ?? `${r.listing_id}@${r.created_at}`;
    for (const s of signalsForListing(r.listing_snapshot)) {
      const e = acc.get(s);
      if (!e) continue; // no graded evidence for this signal — skip
      e.passMass += passW;
      e.n_pass += 1;
      e.reaction_ids.add(id);
    }
  }

  const gradedMass = likedMass + rejectedMass; // local penalty scale (graded-only)
  const derived = {};
  for (const [s, e] of acc) {
    if (e.n < minN) continue;
    const pLiked = likedMass > 0 ? e.likedW / likedMass : 0;
    const pRejected = rejectedMass > 0 ? e.rejectedW / rejectedMass : 0;
    // Pass penalty: this signal's recency-weighted pass mass as a share of the
    // graded mass, capped at half the discrimination range so weak passes can
    // never dominate genuine graded evidence. Always subtractive (toward reject).
    const passPenalty = gradedMass > 0 ? Math.min(e.passMass / gradedMass, 0.5) : 0;
    const discrimination = Math.max(-1, Math.min(1, pLiked - pRejected - passPenalty));
    const confidence = e.n / (e.n + smoothing);
    const weight = round3(discrimination * maxW * confidence);
    if (Math.abs(weight) < 0.01) continue; // not worth surfacing
    derived[s] = {
      weight,
      reaction_ids: [...e.reaction_ids],
      n: e.n,
      n_liked: e.n_liked,
      n_rejected: e.n_rejected,
      n_pass: e.n_pass,
      discrimination: round3(discrimination),
      confidence: round3(confidence),
    };
  }

  meta.signalCount = Object.keys(derived).length;
  meta.likedMass = round3(likedMass);
  meta.rejectedMass = round3(rejectedMass);
  return { derived, meta };
}

// ── Layer 2 ⊕ Layer 3: effective weights ─────────────────────────────────────

/**
 * Merge derived (Layer 2) with overrides (Layer 3) into the flat signal→weight
 * map fed to scoreListingFit. Overrides WIN (manual/AI intent beats inference);
 * `derived_weight_at_set` is preserved on the override so L5 can later detect
 * "the data has moved since you set this" and surface it — never resolved here.
 *
 * @param {object} derived   { signal: { weight, … } }  (from deriveWeights)
 * @param {object} overrides { signal: { weight, derived_weight_at_set?, note? } }
 * @returns {object}         { signal: number }
 */
export function effectiveWeights(derived = {}, overrides = {}) {
  const eff = {};
  for (const [s, v] of Object.entries(derived || {})) {
    const w = Number(v?.weight);
    if (Number.isFinite(w)) eff[s] = w;
  }
  for (const [s, v] of Object.entries(overrides || {})) {
    const w = Number(v?.weight);
    if (Number.isFinite(w)) eff[s] = w; // override precedence
  }
  return eff;
}

/**
 * The subset of effective weights a single listing actually exhibits — this is
 * what page-listings passes to scoreListingFit as `learnedPrefs`, so a learned
 * weight for "type:detached" only applies to detached homes (the scoring seam
 * adds every entry unconditionally, so we pre-select here).
 * @param {object} listing
 * @param {object} effective  flat signal→weight map
 * @returns {object} signal→weight for the signals this listing has
 */
export function listingLearnedPrefs(listing, effective = {}) {
  const out = {};
  for (const s of signalsForListing(listing)) {
    if (s in effective && effective[s]) out[s] = effective[s];
  }
  return out;
}

// ── Cold-start diversification ───────────────────────────────────────────────

/**
 * Reorder items round-robin across feature buckets so consecutive items differ
 * (max contrastive signal early). Stable within a bucket. Returns the FULL list
 * reordered (the cold-start deck reviews everything, but front-loads variety);
 * pass `count` to cap the result.
 * @param {Array} items
 * @param {(item)=>string} keyFn  bucket key
 * @param {object} [opts] { count }
 */
export function diversifySelection(items, keyFn, opts = {}) {
  const arr = Array.isArray(items) ? items.slice() : [];
  const buckets = new Map();
  for (const it of arr) {
    const k = String(keyFn ? keyFn(it) : '');
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(it);
  }
  const queues = [...buckets.values()];
  const out = [];
  let live = true;
  while (live) {
    live = false;
    for (const q of queues) {
      if (q.length) { out.push(q.shift()); live = true; }
    }
  }
  return opts.count ? out.slice(0, opts.count) : out;
}

/** Default bucket key for diversifying a listings deck: type × price band × beds. */
export function listingBucketKey(l) {
  return `${norm(l?.property_type)}|${priceBand(l?.price)}|${bedBucket(l?.beds)}`;
}

// ── Optimised next-fetch search spec ─────────────────────────────────────────

/**
 * Turn the household's criteria + effective learned weights into a narrowing
 * spec for tools/fetch-listings.mjs, so the (paid) Apify query asks for fewer,
 * better results. Learned weights only ADD focus or exclude on a STRONG signal —
 * a weak/uncertain weight never removes a listing class (asymmetric caution).
 *
 * @param {object} effective  flat signal→weight map (from effectiveWeights)
 * @param {object} criteria   household criteria record
 * @param {object} [opts]     { recencyDays, maxWeight, strongFraction }
 * @returns {{ recencyDays, priceMin, priceMax, minBeds, excludeTypes, focusTypes, focusOutcodes }}
 */
export function deriveSearchSpec(effective = {}, criteria = {}, opts = {}) {
  const recencyDays = opts.recencyDays ?? RECENCY_DAYS;
  const maxW = opts.maxWeight ?? LEARNED_PREF.MAX_LEARNED_WEIGHT;
  const strongFrac = opts.strongFraction ?? LEARNED_PREF.STRONG_FRACTION;
  const strong = maxW * strongFrac;

  const priceMin = Number(criteria?.budget?.min) || null;
  const priceMax = Number(criteria?.budget?.max) || null;
  const minBeds = Number(criteria?.size?.minBeds) || null;

  const excludeTypes = new Set(
    (criteria?.propertyTypePrefs?.excluded || []).map(norm).filter(Boolean)
  );
  const focusTypes = new Set();
  const focusOutcodes = new Set();
  // L7.5: prune CANDIDATES — areas/outcodes with a strong NEGATIVE learned weight.
  // deriveSearchSpec never drops anything itself; these are surfaced as L5
  // recommendations (meta-observations.detectConflicts) and only act on acceptance.
  const dropAreas = new Set();
  const dropOutcodes = new Set();

  for (const [sig, weight] of Object.entries(effective)) {
    const w = Number(weight);
    if (!Number.isFinite(w) || Math.abs(w) < strong) continue;
    const [kind, ...rest] = sig.split(':');
    const val = rest.join(':');
    if (kind === 'type') {
      if (w <= -strong) excludeTypes.add(val);
      else if (w >= strong) focusTypes.add(val);
    } else if (kind === 'outcode') {
      if (w >= strong) focusOutcodes.add(val);
      else if (w <= -strong) dropOutcodes.add(val);
    } else if (kind === 'area' && w <= -strong) {
      dropAreas.add(val);
    }
  }
  // A type can't be both focused and excluded — exclusion wins (it's the harder signal).
  for (const t of excludeTypes) focusTypes.delete(t);

  return {
    recencyDays,
    priceMin,
    priceMax,
    minBeds,
    excludeTypes: [...excludeTypes],
    focusTypes: [...focusTypes],
    focusOutcodes: [...focusOutcodes],
    dropAreas: [...dropAreas],
    dropOutcodes: [...dropOutcodes],
  };
}
