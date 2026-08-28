// profile-spec.js — the pure core of a search profile (Phase 1b).
//
// A "search profile" is one named way of searching: an exact price, an area
// scope, a recency window, and up to three hard-filter keywords. A household can
// hold several, each independently switched on or off, each scheduled or manual.
// This module owns everything about a spec that needs no network and no DOM, so
// it unit-tests in Node and runs unchanged in the browser — the same reason
// listings/classify.js lives where it does.
//
// Nothing here talks to Supabase or Apify. The fetcher composes these functions;
// the profiles UI validates with them; the tests pin them.

/** Rightmove accepts at most three keywords, and it treats them as a RANKING
 *  signal, not a filter — the result count is unchanged by them. So the hard
 *  filter the owner asked for has to happen here, after the fetch. */
export const MAX_KEYWORDS = 3;

/** Rightmove's `maxDaysSinceAdded` is an enum: anything off-ladder returns zero
 *  results, silently. `null` means "omit the parameter" (no recency limit). */
export const VALID_RECENCY_DAYS = [1, 3, 7, 14];

/** sortType values confirmed against the live site: 6 = newest listed,
 *  10 = oldest listed. Oldest-first is what surfaces long-standing stock. */
export const SORTS = { newest: 6, oldest: 10 };

/** The hard property-type allow-list. Mirrors BASELINE_PROPERTY_TYPES in
 *  tools/fetch-listings.mjs — a spec may NARROW within this set but can never
 *  widen it, so no profile can re-admit the flat family, land or park homes.
 *  tests/contract/search-profile-contract.test.js fails if the two drift. */
export const ALLOWED_PROPERTY_TYPES = ['detached', 'semi-detached', 'terraced', 'bungalow'];

/** Which listing text the keyword gate reads, in priority order. */
export const DEFAULT_KEYWORD_FIELDS = ['title', 'keyFeatures', 'description'];

const lc = (s) => String(s ?? '').trim().toLowerCase();
const isPosInt = (n) => Number.isFinite(Number(n)) && Number(n) > 0;

/**
 * Normalise and check a profile spec. Returns the cleaned spec plus a list of
 * human-readable problems — never throws, because both the UI (which wants to
 * show every problem at once) and the fetcher (which wants to skip a bad profile
 * rather than die) call this.
 *
 * New profiles are EXACT-PRICE ONLY, by owner decision: one `price` used as both
 * minPrice and maxPrice, no ranges. `priceMode: 'range'` survives solely on the
 * legacy profiles migrated from the old `criteria` blob, so that switching one
 * back on reproduces today's behaviour faithfully; it is never offered in the UI.
 *
 * @param {object} spec
 * @param {{allowLegacyRange?: boolean}} [opts]
 * @returns {{spec: object, errors: string[]}}
 */
export function validateSpec(spec, { allowLegacyRange = false } = {}) {
  const errors = [];
  const s = spec && typeof spec === 'object' ? spec : {};
  const out = {};

  const mode = lc(s.priceMode) || 'exact';
  if (mode === 'range') {
    if (!allowLegacyRange) {
      errors.push('priceMode "range" is legacy-only — new profiles must use an exact price');
    }
    out.priceMode = 'range';
    out.priceMin = Number(s.priceMin) || null;
    out.priceMax = Number(s.priceMax) || null;
    if (!isPosInt(out.priceMax)) errors.push('a range profile needs a positive priceMax');
    if (out.priceMin && out.priceMax && out.priceMin > out.priceMax) {
      errors.push('priceMin is above priceMax');
    }
  } else {
    out.priceMode = 'exact';
    out.price = Number(s.price) || null;
    if (!isPosInt(out.price)) errors.push('an exact profile needs a positive price');
  }

  out.minBeds = isPosInt(s.minBeds) ? Math.floor(Number(s.minBeds)) : 2;

  // Narrow-only: silently drop anything outside the allow-list rather than
  // erroring, so a stale profile keeps working instead of blocking a run — but
  // an empty result means the profile asked for nothing valid, which IS an error.
  if (s.propertyTypes != null) {
    const asked = (Array.isArray(s.propertyTypes) ? s.propertyTypes : []).map(lc);
    const kept = ALLOWED_PROPERTY_TYPES.filter((t) => asked.includes(t));
    if (asked.length && !kept.length) errors.push('propertyTypes matched none of the allowed types');
    out.propertyTypes = kept.length ? kept : [...ALLOWED_PROPERTY_TYPES];
  } else {
    out.propertyTypes = [...ALLOWED_PROPERTY_TYPES];
  }

  // null is meaningful and distinct from absent: it means "no recency limit at
  // all", which is what an all-time back-catalogue sweep needs.
  if (s.recencyDays === null) {
    out.recencyDays = null;
  } else if (s.recencyDays === undefined) {
    out.recencyDays = 1;
  } else if (VALID_RECENCY_DAYS.includes(Number(s.recencyDays))) {
    out.recencyDays = Number(s.recencyDays);
  } else {
    errors.push(`recencyDays must be null or one of ${VALID_RECENCY_DAYS.join(', ')} — Rightmove returns zero results for any other value`);
    out.recencyDays = 1;
  }

  out.sort = Object.prototype.hasOwnProperty.call(SORTS, lc(s.sort)) ? lc(s.sort) : 'newest';

  const kws = (Array.isArray(s.keywords) ? s.keywords : []).map((k) => lc(k)).filter(Boolean);
  const uniq = [...new Set(kws)];
  if (uniq.length > MAX_KEYWORDS) {
    errors.push(`at most ${MAX_KEYWORDS} keywords (Rightmove's own limit) — extras dropped`);
  }
  out.keywords = uniq.slice(0, MAX_KEYWORDS);
  out.keywordFields = Array.isArray(s.keywordFields) && s.keywordFields.length
    ? s.keywordFields.map(String)
    : [...DEFAULT_KEYWORD_FIELDS];

  out.minAgeDays = isPosInt(s.minAgeDays) ? Math.floor(Number(s.minAgeDays)) : null;
  out.dedupeByFingerprint = s.dedupeByFingerprint !== false;

  out.maxPropertiesPerQuery = isPosInt(s.maxPropertiesPerQuery)
    ? Math.floor(Number(s.maxPropertiesPerQuery))
    : 200;

  out.areaScope = s.areaScope && typeof s.areaScope === 'object' && Array.isArray(s.areaScope.areaIds)
    ? { areaIds: s.areaScope.areaIds.map(String).filter(Boolean) }
    : 'household';

  return { spec: out, errors };
}

/**
 * A stable key over everything that shapes the Rightmove URL — and NOTHING else.
 * Two profiles sharing a signature can be served by ONE paid search, which is
 * what stops N households multiplying the bill. Area scope is deliberately
 * excluded: areas decide *which* outcodes a signature is run against, not what
 * the search itself looks like.
 * @param {object} spec a spec already through validateSpec
 * @returns {string}
 */
export function signatureKey(spec) {
  const s = spec || {};
  const price = s.priceMode === 'range'
    ? `range:${s.priceMin ?? ''}-${s.priceMax ?? ''}`
    : `exact:${s.price ?? ''}`;
  return [
    price,
    `beds:${s.minBeds ?? ''}`,
    `types:${[...(s.propertyTypes || [])].sort().join('+')}`,
    `days:${s.recencyDays === null ? 'any' : s.recencyDays}`,
    `sort:${s.sort ?? 'newest'}`,
    `kw:${[...(s.keywords || [])].sort().join('+')}`,
  ].join('|');
}

/** Escape a user-supplied keyword before it becomes a regex. Without this a
 *  keyword like "c++" or "3.5" would throw or match far too much. */
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pull the configured fields out of a listing as one lowercase haystack.
 *  Arrays (keyFeatures) are flattened; anything else is stringified. */
function haystack(listing, fields) {
  const parts = [];
  for (const f of fields || DEFAULT_KEYWORD_FIELDS) {
    const v = listing?.[f];
    if (v == null) continue;
    if (Array.isArray(v)) parts.push(v.map((x) => String(x)).join(' '));
    else parts.push(String(v));
  }
  return parts.join(' ').toLowerCase();
}

/**
 * The hard keyword filter. Rightmove's own `keywords=` only re-ranks, so this is
 * the thing that actually guarantees "only properties carrying one of my tags".
 *
 * Whole-word matching: "period" does not match "periodic", and "cottage" does
 * not match "cottages" either, since \b needs a non-word character on both sides.
 * Missing the plural is the conservative direction — a profile that wants it can
 * add "cottages" as its own keyword. We never silently widen a filter the owner
 * set; that would hand back results they asked not to see.
 *
 * An empty keyword list filters nothing — that is the "or none" the owner asked
 * for, and it must never be confused with "match nothing".
 *
 * @param {object} listing
 * @param {object} spec
 * @returns {{keep: boolean, hits: string[]}}
 */
export function keywordGate(listing, spec) {
  const kws = spec?.keywords || [];
  if (!kws.length) return { keep: true, hits: [] };
  const hay = haystack(listing, spec?.keywordFields);
  const hits = kws.filter((k) => new RegExp(`\\b${escapeRe(k)}\\b`, 'i').test(hay));
  return { keep: hits.length > 0, hits };
}

/**
 * Days-on-market floor. Undated listings are KEPT: we cannot prove a listing is
 * too new, and silently dropping everything we failed to date would quietly
 * shrink the feed — the same reasoning as filterListingsBySpec in the fetcher.
 * @param {object} listing
 * @param {object} spec
 * @param {Date} [now]
 * @returns {{keep: boolean, days: number|null}}
 */
export function agedGate(listing, spec, now = new Date()) {
  const floor = spec?.minAgeDays;
  const raw = listing?.added_date ?? listing?.addedOn ?? listing?.firstVisibleDate ?? null;
  if (!raw) return { keep: true, days: null };
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return { keep: true, days: null };
  const days = Math.floor((now.getTime() - t) / 86400000);
  if (!isPosInt(floor)) return { keep: true, days };
  return { keep: days >= Number(floor), days };
}

/**
 * The exact-price gate. Belt-and-braces behind the search URL, because the actor
 * honours URL filters only loosely — which is the whole reason passesBaseline()
 * exists in classify.js. A range profile defers to its band.
 * @param {object} listing @param {object} spec @returns {boolean}
 */
export function priceGate(listing, spec) {
  const p = Number(listing?.price);
  if (!Number.isFinite(p)) return false;
  if (spec?.priceMode === 'range') {
    if (spec.priceMin && p < Number(spec.priceMin)) return false;
    if (spec.priceMax && p > Number(spec.priceMax)) return false;
    return true;
  }
  return p === Number(spec?.price);
}

/**
 * Is this profile allowed to spend right now? Four independent switches, any one
 * of which stops it. Kept here, pure, so the fetcher and the admin panel can
 * never disagree about what "active" means.
 * @param {{enabled?: boolean, admin_paused?: boolean}} profile
 * @param {{search_paused?: boolean}} [household]
 * @param {{fetch_enabled?: boolean}} [control]
 * @returns {boolean}
 */
export function isProfileRunnable(profile, household = {}, control = {}) {
  return profile?.enabled === true
    && profile?.admin_paused !== true
    && household?.search_paused !== true
    && control?.fetch_enabled !== false;
}
