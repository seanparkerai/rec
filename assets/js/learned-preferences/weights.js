// learned-preferences/weights.js — recency, cold-start, training progress, and the
// Layer 2 derive + Layer 2⊕3 effective weights (REFACTOR P7c). Pure. No DOM/IO.
import { LEARNED_PREF, RECENCY_DAYS, TRAINING_MILESTONES } from '../intelligence-constants.js';
import { signalsForListing, implicatedKinds } from './signals.js';
import { isNonTrainingReaction, isUnattributedReject, latestPerListing } from '../listings/reactions.js';
import { classifyProvenance } from '../listings/reaction-provenance.js';

const GRADED = new Set(['like', 'reject']);
const PASS   = new Set(['pass']);
const round3 = (n) => Math.round(n * 1000) / 1000;

// Reserved key inside `learned_preferences.derived` (step 4.7, P10c): the ranked
// attributed-reason counts ({ reject:[{key,label,count}…], like:[…] }), recomputed
// wholesale from the append-only reaction log every retrain — never incremented per
// reaction, so the log stays the single source of truth. Safe by the same convention
// as the overrides-side reserved keys: no numeric `.weight`, so effectiveWeights()
// (and every derived consumer) treats it as inert. Lets one-row readers (dashboard
// tiles, the Ask assistant, MCP analysis) answer "what do they dislike most" without
// paging the multi-thousand-row log.
export const REASON_COUNTS_KEY = '__reason_counts';

// A reaction trains preferences only if it is a graded verb, carries a snapshot, is not
// administrative (e.g. a `removed_area` reject — a wholesale area ignore, which must not
// be read as a dislike of the homes' type/outcode/beds/price), AND — for a reject — is
// attributed: an UNATTRIBUTED reject (no reason at all) carries no causal information, so
// crediting it at full weight against every feature poisons the model (a detached home
// quick-rejected for its location reads as "dislikes detached"). It still hides the
// listing; it just does not move weights. See reactions.js isUnattributedReject.
function isTraining(r) {
  return r && GRADED.has(r.reaction) && r.listing_snapshot
    && !isNonTrainingReaction(r) && !isUnattributedReject(r);
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
  return (Array.isArray(reactions) ? reactions : []).filter(isTraining).length;
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
    if (isNonTrainingReaction(r)) continue; // administrative (e.g. removed_area) — not a real judgement
    if (isUnattributedReject(r)) continue;  // reject with no reason — no causal signal, not trained
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
 *   3a. PROVENANCE + SUPERSEDE (2026-07-06, owner decision). A bulk-provenance
 *      reaction (en-masse sweep — durable ADR-0009 `source`, heuristic fallback via
 *      classifyProvenance) has its recency weight multiplied by BULK_DISCOUNT (0.3):
 *      real but coarse signal that must not drown one-at-a-time reviews. A graded
 *      reaction SUPERSEDED by a later graded reaction on the same listing is
 *      multiplied by SUPERSEDED_DISCOUNT (0.4): the newest judgement counts in full,
 *      the changed mind lingers only faintly (a `pass` never supersedes). Both scale
 *      the row's `w` BEFORE mass accumulation, so numerators and denominators stay
 *      consistent. Admin rows remain fully excluded (isTraining).
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
  const bulkDiscount = opts.bulkDiscount ?? LEARNED_PREF.BULK_DISCOUNT;
  const supersededDiscount = opts.supersededDiscount ?? LEARNED_PREF.SUPERSEDED_DISCOUNT;
  const statusMap = opts.statusMap ?? {};

  // Provenance over the WHOLE log (the heuristic's minute-buckets need every row;
  // durable ADR-0009 sources win row-by-row regardless).
  const all = classifyProvenance(Array.isArray(reactions) ? reactions : []);
  const graded = all.filter(isTraining);
  const passes = all.filter((r) => r && PASS.has(r.reaction)  && r.listing_snapshot);
  // Supersede: the newest GRADED row per listing counts in full; earlier graded rows
  // on the same listing are discounted. Built over graded rows only, so a later
  // `pass` (or an admin/unattributed row) never supersedes a real judgement.
  const latestGraded = latestPerListing(graded);

  const meta = {
    coldStart: graded.length < coldMin,
    gradedCount: graded.length,
    decay_basis: 'days',
    half_life_days: halfLife,
    unattributed_discount: discount,
    bulk_discount: bulkDiscount,
    superseded_discount: supersededDiscount,
    bulkTrained: 0,
    supersededTrained: 0,
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
    const bulkMult = r.provenance === 'bulk' ? bulkDiscount : 1;
    const supersededMult = !r.listing_id || latestGraded.get(r.listing_id) === r ? 1 : supersededDiscount;
    if (bulkMult !== 1) meta.bulkTrained += 1;
    if (supersededMult !== 1) meta.supersededTrained += 1;
    const w = Math.pow(0.5, ageDays / halfLife) * statusMult * bulkMult * supersededMult;
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

