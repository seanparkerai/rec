// listing-fit.js — v3 L2 listing fit-score engine.
// Pure module. No DOM, no storage, no fetch. Mirrors affordability.js discipline:
// it IMPORTS assessAffordability and the calibrated constants — it never
// reimplements a single affordability number.
//
// The seam (docs/INTELLIGENCE_RULES.md §"Listing fit"):
//   1. HARD GATE — assessAffordability() runs first. 'out-of-reach' ⇒ verdict
//      'reject', gated:true. Such listings are filtered from the default feed.
//   2. SOFT SIGNAL — for everything that survives, the affordability band is one
//      weighted input alongside beds / type / price / LISA / EPC fit and (from
//      L4) the learned-preference weights.
//   3. OUTPUT — a 5-band verdict plus a contributions[] array built BY
//      CONSTRUCTION, so every verdict can show its working (the anti-black-box
//      contract).

import { assessAffordability } from '../affordability.js';
import { LISTING_VERDICTS, FIT_BANDS, FIT_WEIGHTS } from '../intelligence-constants.js';

const norm = (s) => String(s || '').trim().toLowerCase();

/** Map a 0–1 score to a 5-band verdict. */
function bandForScore(score) {
  if (score >= FIT_BANDS.strong) return 'strong';
  if (score >= FIT_BANDS.possible) return 'possible';
  if (score >= FIT_BANDS.stretch) return 'stretch';
  if (score >= FIT_BANDS.weak) return 'weak';
  return 'reject';
}

/** Does a listing property_type fall in a criteria type list? Loose substring
 *  match both ways so "Semi-detached" matches "Semi-detached house" etc. */
function typeIn(list, type) {
  if (!Array.isArray(list) || !type) return false;
  const t = norm(type);
  return list.some((x) => {
    const c = norm(x);
    return c && (t.includes(c) || c.includes(t));
  });
}

const EPC_RANK = { A: 7, B: 6, C: 5, D: 4, E: 3, F: 2, G: 1 };

/**
 * Score a single listing's fit.
 * @param {object} args
 * @param {object} args.listing       a normalised listings row.
 * @param {object} args.finances      derived finances record.
 * @param {object} args.criteria      criteria record.
 * @param {object} [args.area]        the matched area record (for council tax etc).
 * @param {object} [args.learnedPrefs] L4 effective preference weights (signal→weight).
 *                                      Empty/absent in L2 — the seam is reserved here.
 * @param {number} [args.rating]       manual 1–10 saved-listing priority. Applied
 *                                      positive-only (see FIT_WEIGHTS.ratingMax).
 * @returns {{verdict, score, gated, contributions, affordability}}
 */
export function scoreListingFit({ listing, finances, criteria, area, learnedPrefs, rating } = {}) {
  const contributions = [];
  const add = (signal, label, delta, detail) => {
    if (!delta) return;
    contributions.push({ signal, label, delta: Math.round(delta * 100) / 100, detail });
  };

  const price = Number(listing?.price) || 0;
  const affordability = assessAffordability({
    price,
    finances,
    criteria,
    councilTaxBand: listing?.council_tax ?? area?.councilTaxBand,
  });

  const bMin = Number(criteria?.budget?.min) || 0;
  const bMax = Number(criteria?.budget?.max) || 0;

  // 1. HARD GATES. Two symmetric price gates bound the default feed, plus the
  // affordability gate. A gated row is hidden by default and revealable via the
  // "Show out of reach" toggle (feed-partition's includeOOR). A KNOWN price
  // (price > 0) gates; an unknown/0 price never does.
  if (affordability.verdict === 'out-of-reach') {
    return {
      verdict: 'reject',
      score: 0,
      gated: true,
      contributions: [{
        signal: 'affordability-gate',
        label: 'Out of reach',
        delta: -1,
        detail: affordability.headline,
      }],
      affordability,
    };
  }

  // Below the user's own price floor: a known price under budget.min is gated,
  // mirroring the over-ceiling treatment, so sub-minimum homes never surface in
  // the default feed (they are still revealable via "Show out of reach").
  if (bMin && price && price < bMin) {
    return {
      verdict: 'reject',
      score: 0,
      gated: true,
      contributions: [{
        signal: 'budget-floor',
        label: `£${price.toLocaleString('en-GB')} — under your £${bMin.toLocaleString('en-GB')} minimum`,
        delta: -1,
        detail: 'Below your minimum budget',
      }],
      affordability,
    };
  }

  // 2. SOFT SIGNALS — start from a neutral base and accumulate.
  let score = 0.5;
  const W = FIT_WEIGHTS;

  // Affordability band as a signal.
  if (affordability.verdict === 'comfortable') add('affordability', 'Comfortably affordable', W.affordabilityComfortable);
  else if (affordability.verdict === 'stretch') add('affordability', 'Affordable (a stretch)', W.affordabilityStretch);
  else if (affordability.verdict === 'tight') add('affordability', 'Affordability is tight', W.affordabilityTight);

  // Beds vs criteria.size.
  const beds = Number(listing?.beds) || 0;
  const minBeds = Number(criteria?.size?.minBeds) || 0;
  const idealBeds = Number(criteria?.size?.idealBeds) || 0;
  if (minBeds && beds < minBeds) add('beds', `${beds} beds — below your ${minBeds}-bed minimum`, W.bedsBelowMin);
  else if (idealBeds && beds >= idealBeds) add('beds', `${beds} beds — meets your ideal`, W.bedsIdeal);
  else if (minBeds && beds >= minBeds) add('beds', `${beds} beds — meets your minimum`, W.bedsMin);

  // Property type vs preferences.
  const prefs = criteria?.propertyTypePrefs || {};
  const type = listing?.property_type;
  if (typeIn(prefs.excluded, type)) add('type', `${type} — an excluded type`, W.typeExcluded);
  else if (typeIn(prefs.preferred, type)) add('type', `${type} — a preferred type`, W.typePreferred);
  else if (typeIn(prefs.acceptable, type)) add('type', `${type} — acceptable`, W.typeAcceptable);

  // Price vs budget window (bMin/bMax hoisted above for the price gates).
  if (bMax && price > bMax) add('price', `£${price.toLocaleString('en-GB')} — over your £${bMax.toLocaleString('en-GB')} ceiling`, W.priceOverBudget);
  else if (price && (!bMin || price >= bMin) && (!bMax || price <= bMax)) add('price', 'Within your budget window', W.priceInBudget);

  // LISA eligibility (from the affordability signals — single source).
  if (affordability.bandSignals?.lisaEligible) add('lisa', 'LISA-eligible price', W.lisaEligible);

  // EPC vs minimum (usually unknown from the list payload — only credits when known).
  const epcMin = criteria?.epcMin;
  if (listing?.epc && epcMin && (EPC_RANK[String(listing.epc).toUpperCase()] || 0) >= (EPC_RANK[String(epcMin).toUpperCase()] || 0)) {
    add('epc', `EPC ${listing.epc} — meets your ${epcMin} minimum`, W.epcMeetsMin);
  }

  // 3. LEARNED PREFERENCES (L4 seam). When present, learnedPrefs is a map of
  // signal → effective weight; each is applied as a contribution. Empty in L2.
  if (learnedPrefs && typeof learnedPrefs === 'object') {
    for (const [signal, weight] of Object.entries(learnedPrefs)) {
      const w = Number(weight);
      if (w) add(`learned:${signal}`, `Learned preference: ${signal}`, w);
    }
  }

  // 4. MANUAL RATING (1–10). Positive-only: full ratingMax at 10, linearly to +0 at
  // 1, and never below 0 — a low rating is a weaker boost, not a penalty.
  const r = Number(rating);
  if (Number.isFinite(r) && r >= 1) {
    const clamped = Math.min(10, r);
    const delta = Math.max(0, W.ratingMax * (clamped - 1) / 9);
    if (delta) add('rating', `You rated this ${Math.round(clamped)}/10`, delta);
  }

  for (const c of contributions) score += c.delta;
  score = Math.max(0, Math.min(1, score));

  return {
    verdict: bandForScore(score),
    score: Math.round(score * 100) / 100,
    gated: false,
    contributions,
    affordability,
  };
}

/** Re-export the verdict vocabulary for consumers/tests. */
export { LISTING_VERDICTS };
