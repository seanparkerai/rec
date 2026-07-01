// classify.js — shared, pure listing classification: the single source of truth
// for "is this a home worth showing?" (baseline type/price/beds gate) and for the
// physical-property FINGERPRINT used to collapse duplicates / re-lists and to
// suppress already-saved or already-rejected properties from the fresh feed.
//
// No DOM, no storage, no fetch — same discipline as fit.js / flags.js — so it
// imports cleanly in the BROWSER (page-listings, flags) AND in NODE (the fetcher
// tools/fetch-listings.mjs and tools/import-apify-runs.mjs import it via
// ../assets/js/listings/classify.js, the same cross-boundary pattern those tools
// already use for learned-preferences.js). One rule, enforced everywhere.

const lc = (s) => String(s ?? '').toLowerCase().trim();

// ── Property-type allow-list: "Houses & bungalows (broad)" ────────────────────
// EXCLUDED is checked FIRST and wins, because several non-home types contain the
// word "house" (Coach House, House Share, House of Multiple Occupation) and must
// not slip through the broad "house" allow rule. Town/Country/Manor/Farm House are
// genuine homes and are caught by the allow rule (they carry no excluded token).
// Exported so the household_feed RPC's SQL mirror can be pinned against these
// exact sources (tests/contract/household-feed.test.js translates \b→\y and
// asserts the SQL literal matches — the anti-drift rail for the DB-side copy).
export const EXCLUDED_TYPE_RE = /\b(flat|apartment|maisonette|penthouse|studio|duplex|coach\s*house|park\s*home|mobile\s*home|caravan|houseboat|house\s*boat|lodge|chalet|land|plot|farm\s*land|equestrian|garages?|house\s*share|multiple\s*occupation|\bhmo\b|retirement|sheltered|not\s*specified)\b/;

// Broad houses + bungalows: detached / semi / terraced / end-of-terrace / town
// house / cottage / link-detached / mews / barn conversion / character / bungalow
// (all bungalow forms) / plain "house" / farmhouse / manor / country house.
export const ALLOWED_TYPE_RE = /\b(detached|semi[\s-]*detached|terrace|terraced|end[\s-]*of[\s-]*terrace|town\s*house|cottage|link[\s-]*detached|mews|barn|character|bungalow|house|farmhouse|manor)\b/;

/** Classify a raw property_type string: 'house' (show), 'excluded' (never show),
 *  or 'unknown' (unrecognised → treated as not-a-home, so the feed stays tight). */
export function propertyTypeClass(type) {
  const t = lc(type);
  if (!t) return 'unknown';
  if (EXCLUDED_TYPE_RE.test(t)) return 'excluded';
  if (ALLOWED_TYPE_RE.test(t)) return 'house';
  return 'unknown';
}

/** True only for a property type in the houses-&-bungalows allow-list. */
export function isAllowedPropertyType(type) {
  return propertyTypeClass(type) === 'house';
}

// ── Price / beds baseline (the hard floor the Apify actor keeps leaking past) ──
// The actor honours the search-URL price/type filters only loosely (~26% wrong
// type, ~15% over-ceiling slip through), so this gate is the GUARANTEE applied
// post-normalise in BOTH the live fetcher and the backfill importer.
export const BASELINE_PRICE_MIN = 250000;   // owner-set floor (2026-06-04)
export const BASELINE_PRICE_MAX = 425000;   // owner-set ceiling (2026-06-04)
export const BASELINE_MIN_BEDS  = 2;

/**
 * Is this normalised listing a home worth keeping? Type must be in the allow-list;
 * a KNOWN price must sit in [priceMin, priceMax]; KNOWN beds must be ≥ minBeds.
 * Unknown price/beds do NOT reject (a re-fetched summary payload can omit them and
 * must not drop a known-good row) — only the type rule is unconditional.
 * @param {object} listing  normalised row ({ property_type, price, beds })
 * @param {object} [opts]   { priceMin, priceMax, minBeds }
 */
export function passesBaseline(listing, { priceMin = BASELINE_PRICE_MIN, priceMax = BASELINE_PRICE_MAX, minBeds = BASELINE_MIN_BEDS } = {}) {
  if (!listing) return false;
  if (!isAllowedPropertyType(listing.property_type)) return false;
  // null/'' price or beds = "unknown" (a re-fetched summary payload can omit them);
  // coerce to NaN, not 0, so unknown never trips the band/min check.
  const price = listing.price == null || listing.price === '' ? NaN : Number(listing.price);
  if (Number.isFinite(price) && (price < priceMin || price > priceMax)) return false;
  const beds = listing.beds == null || listing.beds === '' ? NaN : Number(listing.beds);
  if (Number.isFinite(beds) && beds < minBeds) return false;
  return true;
}

// ── Physical-property fingerprint (identity across re-lists / duplicate IDs) ───
// rightmove_id is NOT stable: a withdrawn-then-relisted property (or a second
// agent) gets a NEW id, which is why reactions orphan and duplicates pile up.
// The fingerprint is a PRICE-INSENSITIVE key derived from the street + town +
// beds + type, so a re-list at a changed price still matches its prior self.
//
// It is deliberately CONSERVATIVE: it returns null unless the address is specific
// enough (a street segment distinct from the town) to avoid false-merging the many
// town-only addresses ("Fordingbridge") that would otherwise collapse into one.
const COUNTY_RE = /^(hampshire|wiltshire|dorset|berkshire|surrey|somerset|hants|wilts|berks)$/;
const POSTCODE_SEG_RE = /^[a-z]{1,2}\d[a-z\d]?(\s*\d[a-z]{2})?$/;   // SP6, SO20, "SP6 1JW"

const normToken = (s) => lc(s)
  .replace(/[.,'’`()]/g, ' ')
  .replace(/\b(the|no|nr|near)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Normalised type token for the fingerprint: drop the trailing "house"/"property"
 *  noise so "Semi-Detached" and "Semi-Detached House" fingerprint identically. */
function typeToken(type) {
  return lc(type).replace(/\b(house|property|for sale)\b/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Stable physical-property fingerprint, or null when the address is too coarse to
 * trust. Two listings sharing a fingerprint are treated as the SAME property.
 * @param {object} l  a listing row or a reaction's listing_snapshot
 *                    (needs address, beds, property_type)
 */
export function propertyFingerprint(l) {
  if (!l) return null;
  const beds = l.beds == null || l.beds === '' ? NaN : Number(l.beds);
  const type = typeToken(l.property_type);
  if (!Number.isFinite(beds) || !type) return null;

  const segs = String(l.address ?? '')
    .replace(/[\r\n]+/g, ' ')
    .split(',')
    .map(normToken)
    .filter((s) => s && !COUNTY_RE.test(s) && !POSTCODE_SEG_RE.test(s));
  if (segs.length < 2) return null;            // need street + town to be specific

  const street = segs[0];
  const town = segs[segs.length - 1];
  if (!street || street === town) return null; // a bare town name is not specific

  return `${type}|${beds}|${street}|${town}`;
}
