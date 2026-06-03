// learned-preferences/search.js — cold-start diversification + optimised next-fetch
// search spec (REFACTOR P7c). Pure. No DOM/IO.
import { LEARNED_PREF, RECENCY_DAYS } from '../intelligence-constants.js';
import { priceBand } from './signals.js';
import { effectiveWeights } from './weights.js';

const norm = (s) => String(s || '').trim().toLowerCase();
// Local copy of the beds-bucket helper (also used privately in ./signals.js); kept
// here so the search module is self-contained and signals.js's export surface is unchanged.
function bedBucket(beds) {
  if (beds == null || beds === '') return null;
  const b = Number(beds);
  if (!Number.isFinite(b)) return null;
  return b >= 5 ? '5+' : String(b);
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
