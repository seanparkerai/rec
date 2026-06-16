// supabase/functions/ask/pure.js — PURE helpers for the Ask edge function.
//
// Plain ES module: NO Deno-specific and NO Node-specific imports, so it loads
// identically in the Deno edge runtime (imported by tools.ts) AND in the Node
// test harness (tests/ask-tools.test.js). All filtering / ranking / shaping
// logic lives here so it can be unit-tested away from the database wrappers
// (the Ask plan §4 "keep the filtering/ranking/formatting logic as pure
// functions"). The thin RLS-scoped Supabase queries stay in tools.ts.
//
// The listing ranker is a faithful but SELF-CONTAINED mirror of the browser's
// assets/js/listings/fit.js vocabulary + assets/js/intelligence-constants.js
// weights. The canonical scorer (with the full affordability engine) still runs
// in the browser feed; this Edge-side ranker is the lightweight conversational
// approximation — it uses the criteria budget window as the affordability proxy
// rather than re-deriving the whole finances model. Keep the band names and
// weights in step with intelligence-constants.js if those ever change.

// ── Mirrored fit constants (intelligence-constants.js) ────────────────────────
export const LISTING_VERDICTS = ['strong', 'possible', 'stretch', 'weak', 'reject'];
export const FIT_BANDS = { strong: 0.75, possible: 0.55, stretch: 0.4, weak: 0.2 };
export const FIT_WEIGHTS = {
  affordabilityComfortable: 0.25,
  affordabilityStretch: 0.10,
  bedsIdeal: 0.15,
  bedsMin: 0.05,
  bedsBelowMin: -0.30,
  typePreferred: 0.15,
  typeExcluded: -0.40,
  priceInBudget: 0.10,
  priceOverBudget: -0.20,
  lisaEligible: 0.08,
};
export const LISA_CAP_GBP = 450_000;

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** Map a 0–1 score to a 5-band verdict (mirrors fit.js#bandForScore). */
export function bandForScore(score) {
  if (score >= FIT_BANDS.strong) return 'strong';
  if (score >= FIT_BANDS.possible) return 'possible';
  if (score >= FIT_BANDS.stretch) return 'stretch';
  if (score >= FIT_BANDS.weak) return 'weak';
  return 'reject';
}

/** Loose two-way substring type match (mirrors fit.js#typeIn). */
function typeIn(list, type) {
  if (!Array.isArray(list) || !type) return false;
  const t = norm(type);
  return list.some((x) => {
    const c = norm(x);
    return c && (t.includes(c) || c.includes(t));
  });
}

/**
 * Score one listing's fit against the household criteria. Self-contained mirror
 * of fit.js: a known price outside the budget window gates to 'reject'; otherwise
 * a 0.5 base accumulates the budget / beds / type / LISA signals and maps to a band.
 * @returns {{ verdict, score, gated, reasons: string[] }}
 */
export function scoreListingFit(listing, criteria) {
  const reasons = [];
  const W = FIT_WEIGHTS;
  const price = Number(listing?.price) || 0;
  const beds = Number(listing?.beds) || 0;
  const bMin = Number(criteria?.budget?.min) || 0;
  const bMax = Number(criteria?.budget?.max) || 0;

  // HARD GATES — a KNOWN price outside the budget window is out of reach.
  if (price && bMax && price > bMax) {
    return { verdict: 'reject', score: 0, gated: true,
      reasons: [`£${price.toLocaleString('en-GB')} — over your £${bMax.toLocaleString('en-GB')} ceiling`] };
  }
  if (price && bMin && price < bMin) {
    return { verdict: 'reject', score: 0, gated: true,
      reasons: [`£${price.toLocaleString('en-GB')} — under your £${bMin.toLocaleString('en-GB')} minimum`] };
  }

  let score = 0.5;
  const add = (delta, why) => { if (delta) { score += delta; reasons.push(why); } };

  // Affordability proxy: a known in-window price is "comfortable"; an unpriced
  // listing earns the milder stretch credit (we cannot place it).
  if (price && (!bMin || price >= bMin) && (!bMax || price <= bMax)) {
    add(W.affordabilityComfortable, 'Within your budget window');
  } else if (!price) {
    add(W.affordabilityStretch, 'Price not listed');
  }

  // Beds vs criteria.size.
  const minBeds = Number(criteria?.size?.minBeds) || 0;
  const idealBeds = Number(criteria?.size?.idealBeds) || 0;
  if (minBeds && beds && beds < minBeds) add(W.bedsBelowMin, `${beds} beds — below your ${minBeds}-bed minimum`);
  else if (idealBeds && beds >= idealBeds) add(W.bedsIdeal, `${beds} beds — meets your ideal`);
  else if (minBeds && beds >= minBeds) add(W.bedsMin, `${beds} beds — meets your minimum`);

  // Property type vs preferences.
  const prefs = criteria?.propertyTypePrefs || {};
  const type = listing?.property_type;
  if (type && typeIn(prefs.excluded, type)) add(W.typeExcluded, `${type} — an excluded type`);
  else if (type && typeIn(prefs.preferred, type)) add(W.typePreferred, `${type} — a preferred type`);

  // LISA eligibility on price.
  if (price && price <= LISA_CAP_GBP) add(W.lisaEligible, 'LISA-eligible price');

  score = Math.max(0, Math.min(1, score));
  return { verdict: bandForScore(score), score: Math.round(score * 100) / 100, gated: false, reasons };
}

/** Compact, model-friendly summary of one listing row. */
export function summariseListing(l, fit) {
  return {
    rightmove_id: l.rightmove_id,
    address: l.address ?? null,
    area_id: l.area_id ?? null,
    price: l.price ?? null,
    beds: l.beds ?? null,
    baths: l.baths ?? null,
    property_type: l.property_type ?? null,
    tenure: l.tenure ?? null,
    url: l.url ?? null,
    status: l.status ?? null,
    fit: fit ? fit.verdict : null,
    reasons: fit ? fit.reasons : [],
  };
}

/**
 * Filter + rank live listings for a conversational answer. Applies the explicit
 * query filters (maxPrice/minPrice/minBeds/area/propertyType/keyword), scores
 * each survivor against the household criteria, drops gated rows, sorts by fit
 * score then price ascending, and returns at most `limit` compact summaries.
 * NEVER returns the whole table (the Ask plan §4 invariant).
 * @param {object[]} rows     raw listings rows
 * @param {object}   filters  { maxPrice, minPrice, minBeds, area, propertyType, keyword, limit, includeGated }
 * @param {object}   criteria household criteria record (for scoring)
 */
export function rankAndFilterListings(rows, filters = {}, criteria = {}) {
  const f = filters || {};
  const limit = Math.min(Math.max(Number(f.limit) || 10, 1), 25);
  const areaQ = norm(f.area);
  const typeQ = norm(f.propertyType);
  const kw = norm(f.keyword);

  const matched = (Array.isArray(rows) ? rows : []).filter((l) => {
    if (!l) return false;
    // Only consider live rows unless explicitly asked otherwise.
    if (l.status && l.status !== 'live' && !f.includeHidden) return false;
    const price = Number(l.price) || 0;
    if (f.maxPrice && price && price > Number(f.maxPrice)) return false;
    if (f.minPrice && price && price < Number(f.minPrice)) return false;
    if (f.minBeds && Number(l.beds) && Number(l.beds) < Number(f.minBeds)) return false;
    if (areaQ) {
      const hay = `${norm(l.area_id)} ${norm(l.address)} ${norm(l.postcode)} ${norm(l.outcode)}`;
      if (!hay.includes(areaQ)) return false;
    }
    if (typeQ && !norm(l.property_type).includes(typeQ)) return false;
    if (kw) {
      const hay = `${norm(l.title)} ${norm(l.description)} ${norm(l.address)}`;
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  const scored = matched
    .map((l) => ({ l, fit: scoreListingFit(l, criteria) }))
    .filter((x) => f.includeGated || !x.fit.gated)
    .sort((a, b) => (b.fit.score - a.fit.score) || ((a.l.price || Infinity) - (b.l.price || Infinity)));

  return {
    total_matched: matched.length,
    returned: Math.min(scored.length, limit),
    listings: scored.slice(0, limit).map((x) => summariseListing(x.l, x.fit)),
  };
}

// ── Listings query push-down (Ask plan P1-1) ──────────────────────────────────
// The candidate listings set is bounded server-side (indexed price/area/status
// predicates) BEFORE pure.js ranks it, so the edge↔DB payload stays small as the
// scrape grows. This is a Supabase-efficiency win, not a token win — the model
// still only ever sees the ≤25 ranked summaries rankAndFilterListings returns.
// The select list and predicates are computed here (pure + unit-tested); tools.ts
// only applies them to the RLS-scoped query builder.

const LISTING_BASE_COLS =
  'rightmove_id, address, area_id, postcode, outcode, price, beds, baths, ' +
  'property_type, tenure, status, title, url';

// Strip characters that would break a PostgREST `.or()` filter string (commas
// and parentheses separate/group filters; the value rides inside an ilike
// pattern). The model supplies `area`, but sanitising keeps the filter well-formed.
function sanitizeFilterTerm(s) {
  return String(s ?? '').replace(/[,()*%\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Build the bounded Supabase query plan for query_listings: which columns to
 * select (description ONLY when a keyword search needs it) and which cheap,
 * indexed predicates to push to Postgres. minBeds / propertyType / keyword are
 * deliberately LEFT to pure.js (not indexed; substring/two-way logic), so the
 * push-down only narrows on the selective indexed columns and the nuanced rest
 * runs over a small set. Price predicates keep `price IS NULL` rows so unpriced
 * listings survive exactly as rankAndFilterListings would have kept them.
 * @returns {{ columns, wantsKeyword, filters: Array, order, limit }}
 */
export function buildListingsQuery(inp = {}) {
  const wantsKeyword = typeof inp.keyword === 'string' && inp.keyword.trim().length > 0;
  const columns = wantsKeyword ? `${LISTING_BASE_COLS}, description` : LISTING_BASE_COLS;
  const filters = [];

  // Default to live rows unless explicitly told to include hidden ones.
  if (!inp.includeHidden) filters.push({ kind: 'eq', col: 'status', value: 'live' });

  // Indexed price push-downs — guarded so an unpriced row isn't dropped server-side.
  const maxP = Number(inp.maxPrice);
  if (maxP) filters.push({ kind: 'or', expr: `price.lte.${maxP},price.is.null` });
  const minP = Number(inp.minPrice);
  if (minP) filters.push({ kind: 'or', expr: `price.gte.${minP},price.is.null` });

  // Area substring across the indexed/text columns the pure ranker also searches.
  const area = sanitizeFilterTerm(inp.area);
  if (area) {
    filters.push({
      kind: 'or',
      expr: `area_id.ilike.%${area}%,outcode.ilike.%${area}%,postcode.ilike.%${area}%,address.ilike.%${area}%`,
    });
  }

  return { columns, wantsKeyword, filters, order: { col: 'price', ascending: true }, limit: 200 };
}

/**
 * Search the area catalogue by free text + simple filters. Each area row is the
 * Supabase areas.data blob (overview, town, county, schools, prices, etc.).
 * @param {object[]} areas  area rows ({ id, name, town, county, data?... } or flat)
 * @param {object}   q      { query, county, town, limit }
 */
export function searchAreasPure(areas, q = {}) {
  const limit = Math.min(Math.max(Number(q.limit) || 8, 1), 25);
  const text = norm(q.query);
  const countyQ = norm(q.county);
  const townQ = norm(q.town);
  const flat = (a) => ({ ...(a?.data || {}), ...a });

  const matched = (Array.isArray(areas) ? areas : []).map(flat).filter((a) => {
    if (countyQ && !norm(a.county).includes(countyQ)) return false;
    if (townQ && !norm(a.town).includes(townQ)) return false;
    if (text) {
      const hay = `${norm(a.id)} ${norm(a.name)} ${norm(a.town)} ${norm(a.county)} ${norm(a.overview)}`;
      if (!hay.includes(text)) return false;
    }
    return true;
  });

  return matched.slice(0, limit).map((a) => ({
    id: a.id ?? null,
    name: a.name ?? null,
    town: a.town ?? null,
    county: a.county ?? null,
    status: a.status ?? null,
    overview: typeof a.overview === 'string' ? a.overview.slice(0, 400) : null,
  }));
}

/**
 * Deposit savings = cash savings (savings.current) + the earmarked portion of the
 * Trading 212 ISA. FAITHFUL MIRROR of assets/js/finance-derive.js#computeDepositSavings
 * — the Deno deploy boundary forbids importing it across the repo, so the math is
 * duplicated here and pinned in lockstep by tests/ask-tools.test.js (parity assertion
 * against deriveFinances). Change BOTH together or the parity test fails. This is the
 * direct fix for the "£0 saved" answer when a household's deposit lives in the ISA.
 */
export function computeDepositSavings(finances, investments) {
  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const r2 = (x) => Math.round(x * 100) / 100;
  const cash = n(finances?.savings?.current);
  const isa = investments?.trading212ISA;
  if (!isa) return r2(cash);
  const isaTotal = n(isa.currentPortfolioValue);
  const pct = n(isa.earmarkPct);
  const isaForDeposit = pct > 0 ? r2((isaTotal * pct) / 100) : isaTotal;
  return r2(cash + isaForDeposit);
}

/**
 * Shape the raw finances blob into a compact, quotable summary. Pulls the real
 * stored figures (no invention); the model interprets them. Mirrors the fields
 * the dashboard reads — deposit target, savings position, monthly contribution,
 * estimated mortgage payment — plus a derived deposit gap + naive months-to-target.
 *
 * `depositSaved` is cash + earmarked ISA (computeDepositSavings) so it matches the
 * browser dashboard exactly. Pass the investments record ({ trading212ISA }) for the
 * ISA to count; without it, only cash is counted. The earmarked ISA is also surfaced
 * (cashSavings + earmarkedIsa) so the model can name where the deposit is held.
 */
export function shapeFinancesSummary(raw, investments = null) {
  const f = raw || {};
  const target = Number(f.goal?.targetDeposit) || 0;
  const cash = Number(f.savings?.current) || 0;
  const depositSaved = computeDepositSavings(f, investments);
  const monthly = Number(f.savings?.monthlyContribution) || 0;
  const gap = Math.max(0, Math.round((target - depositSaved) * 100) / 100);
  const monthsToTarget = monthly > 0 ? Math.ceil(gap / monthly) : null;
  const isa = investments?.trading212ISA || null;
  return {
    currency: f.currency || 'GBP',
    firstTimeBuyer: f.firstTimeBuyer ?? null,
    income: f.income ?? null,
    targetPropertyPrice: f.goal?.targetPropertyPrice ?? null,
    targetDeposit: target || null,
    depositSaved,
    cashSavings: cash,
    earmarkedIsa: isa
      ? { currentValue: Number(isa.currentPortfolioValue) || 0, earmarkPct: Number(isa.earmarkPct) || 0 }
      : null,
    depositGap: gap,
    monthlyContribution: monthly,
    monthsToTarget,
    mortgage: f.mortgage ?? null,
  };
}

/** Resolve a dotted path ("listing.address") against a nested context object. */
function lookupPath(ctx, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
}

/**
 * Fill an outreach template's {{dotted.path}} placeholders from a context object.
 * Simplified mirror of the browser outreach-renderer (no Quantity-of-Information
 * Ladder): returns the drafted { subject, body } plus the list of placeholders
 * that could not be resolved, so the model can ask for or infer them. Returns
 * TEXT ONLY — it never sends anything (read-only tool, Ask plan §7).
 * @param {object} template an outreach-templates.json entry
 * @param {object} context  { profile, contact, listing, finances, ...adhoc }
 */
export function renderOutreachDraft(template, context = {}) {
  const t = template || {};
  const missing = new Set();
  const fill = (str) => String(str ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const v = lookupPath(context, path);
    if (v === undefined || v === null || v === '') { missing.add(path); return `{{${path}}}`; }
    return String(v);
  });
  return {
    templateId: t.id ?? null,
    recipientRole: t.recipientRole ?? null,
    subject: fill(t.subjectTemplate),
    body: fill(t.bodyTemplate),
    missingFields: [...missing],
  };
}
