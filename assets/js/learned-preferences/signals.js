// learned-preferences/signals.js — signal extraction, free-text feature inference,
// and reason→feature attribution (REFACTOR P7c). Pure, self-contained. No DOM/IO.
const norm = (s) => String(s || '').trim().toLowerCase();

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
  wrong_house_type: ['type'],   // explicit "not this kind of home" → property type
  removed_area:  [],   // administrative wholesale area-ignore — excluded from training
                       // upstream (weights.js isTraining); [] here is defensive only.

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
  wrong_house_type: {
    mid_terrace: ['type'],
    maisonette:  ['type'],
    flat:        ['type'],
    apartment:   ['type'],
    caravan:     ['type'],
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

