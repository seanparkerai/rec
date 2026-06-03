// listing-flags.js — review-screen post-fetch classifier (pure module).
// No DOM, no storage, no fetch — same discipline as listing-fit.js.
//
// Rightmove's source filters can stop flats/land/park-home/retirement-flagged/
// shared-ownership at the URL (see tools/fetch-listings.mjs), but it has NO
// auction filter and no reliable "hidden over-55" filter. Those only surface in
// the listing TEXT, so they're caught here, after the fetch. This saves review
// effort, NOT money (the listing was already fetched + billed).
//
// Two tiers, by the household's instruction:
//   • HIDE  — junk you never want: auction lots, over-55 / retirement homes that
//             slipped past the type filter. Removed from the feed (behind the
//             "Show hidden" toggle — never destroyed).
//   • FLAG  — judgement calls you still want to SEE, just labelled: new builds
//             (you're open to them) and condition red-flags from your criteria
//             (needs modernisation / refurbishment / cash buyers only /
//             investment opportunity).
//
// Matching is deliberately conservative: a guard phrase like "no age restriction"
// must NOT trip the over-55 rule, and only explicit auction phrasing counts.

const norm = (s) => String(s || '').toLowerCase();

// ── HIDE: auction ────────────────────────────────────────────────────────────
const AUCTION = /\bfor sale by (?:modern |online )?auction\b|\bmodern method of auction\b|\bonline auction\b|\bnational property auction\b|\bunder the hammer\b|\bauctioneers?\b|\bsold via auction\b/;

// ── HIDE: over-55 / retirement ───────────────────────────────────────────────
// Brand / category phrases hide unconditionally; bare age phrases hide only when
// not negated by an "open to all ages" guard.
const RETIREMENT_BRAND = /\bretirement (?:home|property|apartment|living|complex|development|village)\b|mccarthy stone|churchill retirement|\bsheltered (?:housing|accommodation)\b|\bassisted living\b|\blater living\b|\bextra care\b|\bover[- ]?55s? (?:only|development|community)\b/;
const AGE_PHRASE = /\bover[- ]?(?:55|60)s?\b|\b(?:55|60)\+\b|\b(?:55|60) (?:and|or) over\b|\baged? (?:55|60)\b|\bminimum age\b|\bage[- ]restrict/;
const AGE_NEGATION = /\bno (?:upper )?age (?:restriction|limit)\b|\bnot age[- ]restricted\b|\bany age\b|\bno age limit\b/;

// ── FLAG: new build (kept visible — you're open to them) ─────────────────────
const NEW_BUILD = /\bnew build\b|\bnewly built\b|\bbrand[- ]new\b|\bnew home\b|\bshow home\b|\bnew development\b/;

// ── FLAG: condition red-flags (from criteria.keywords.exclude) ───────────────
const CONDITION = [
  { key: 'needs-work', label: 'Needs modernisation', re: /\bneeds? modernis|\bin need of (?:modernis|refurb|updating|renovation)|\brefurbishment\b|\brenovation project\b|\brequires? (?:updating|modernis)/ },
  { key: 'cash-only',  label: 'Cash buyers only',    re: /\bcash buyers? only\b|\bcash purchasers? only\b/ },
  { key: 'investment', label: 'Investment opportunity', re: /\binvestment opportunity\b/ },
];

/** Human labels for the HIDE reasons (chip text when shown via the toggle). */
export const HIDE_LABELS = { auction: 'Auction', 'over-55': 'Over-55 / retirement' };

/**
 * Classify a single listing's text for the review screen.
 * @param {object} listing  a normalised listings row (title, description, raw_json).
 * @returns {{ hide: boolean, hideReasons: string[], flags: {key,label}[] }}
 */
export function classifyListing(listing = {}) {
  const text = norm(`${listing.title || ''} ${listing.description || ''}`);

  const hideReasons = [];
  if (AUCTION.test(text)) hideReasons.push('auction');
  const ageHit = AGE_PHRASE.test(text) && !AGE_NEGATION.test(text);
  if (RETIREMENT_BRAND.test(text) || ageHit) hideReasons.push('over-55');

  const flags = [];
  const rawNew = listing?.raw_json?.newHome === true || listing?.raw_json?.isNewHome === true;
  if (NEW_BUILD.test(text) || rawNew) flags.push({ key: 'new-build', label: 'New build' });
  for (const c of CONDITION) if (c.re.test(text)) flags.push({ key: c.key, label: c.label });

  return { hide: hideReasons.length > 0, hideReasons, flags };
}
