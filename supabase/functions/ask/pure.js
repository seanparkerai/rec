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

// ── Context-window guards (Ask plan: keep the upstream prompt under the model cap) ──
// The Edge Function re-sends the WHOLE conversation to Anthropic on every tool-loop
// iteration. Incoming history is capped (index.ts MAX_HISTORY_TURNS/MAX_TURN_CHARS),
// but each loop also APPENDS an assistant tool_use turn + a user tool_result turn, and
// a tool_result is an unbounded JSON.stringify of the DB read. Left unchecked these
// accumulate and overflow the 200k-token window ("prompt is too long"). These two pure
// helpers bound it: capToolResult bounds a single result; fitConvoToBudget bounds the
// whole thread. Pure + unit-tested here; index.ts only applies them.

const DEFAULT_TOOL_RESULT_CHARS = 24_000;

/**
 * Serialise a tool result for a tool_result block, bounding its length so one large
 * read (a full area record, a listing dossier) cannot dominate the context window.
 * tool_result content is a free-form STRING for Anthropic, so a truncated-but-clearly-
 * marked payload is valid — it need not stay parseable JSON.
 * @param {unknown} result    the tool executor's return value
 * @param {number}  maxChars  hard character cap (default 24k ≈ ~7k tokens)
 * @returns {string} the (possibly truncated) tool_result content string
 */
export function capToolResult(result, maxChars = DEFAULT_TOOL_RESULT_CHARS) {
  const s = typeof result === 'string' ? result : JSON.stringify(result ?? null);
  const cap = Math.max(0, Number(maxChars) || 0);
  if (!cap || s.length <= cap) return s;
  const omitted = s.length - cap;
  return s.slice(0, cap) +
    `\n…[result truncated: ${omitted} more characters omitted to fit the model context window]`;
}

/** Approximate the character weight of a messages array (string or block content). */
export function estimateConvoChars(convo) {
  let n = 0;
  for (const m of (Array.isArray(convo) ? convo : [])) {
    if (!m) continue;
    n += typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content ?? '').length;
  }
  return n;
}

/**
 * Trim the oldest turns from a conversation so it fits a character budget, WITHOUT
 * breaking Anthropic's tool_use/tool_result pairing. The thread may only be cut at a
 * "clean" boundary — a user turn whose content is a plain string — because a user turn
 * led by tool_result blocks references the assistant turn immediately before it, and
 * orphaning that pairing is a 400. We keep the EARLIEST clean-start whose tail fits the
 * budget (most context retained); if none fits, fall back to the latest clean-start
 * (smallest valid tail). Tool pairs always sit between clean boundaries as whole units,
 * so any chosen cut preserves every surviving pair.
 * @param {object[]} convo    the messages array sent upstream
 * @param {number}   maxChars character budget for the whole array
 * @returns {object[]} the same array, or a trimmed suffix of it
 */
export function fitConvoToBudget(convo, maxChars) {
  if (!Array.isArray(convo) || !convo.length) return Array.isArray(convo) ? convo : [];
  const cap = Math.max(0, Number(maxChars) || 0);
  if (!cap || estimateConvoChars(convo) <= cap) return convo;

  const cleanStarts = [];
  for (let i = 0; i < convo.length; i++) {
    const m = convo[i];
    if (m && m.role === 'user' && typeof m.content === 'string') cleanStarts.push(i);
  }
  if (!cleanStarts.length) return convo; // no safe cut point — leave the thread intact

  let chosen = cleanStarts[cleanStarts.length - 1]; // aggressive fallback: smallest valid tail
  for (const s of cleanStarts) {
    if (estimateConvoChars(convo.slice(s)) <= cap) { chosen = s; break; }
  }
  return chosen === 0 ? convo : convo.slice(chosen);
}

/** Resolve a dotted path ("listing.address") against a nested context object. */
export function lookupPath(ctx, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
}

/** Set a dotted path on an object, creating intermediate objects as needed. */
export function setPath(obj, path, value) {
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

/** Delete a set of dotted paths from an object (defence-in-depth privacy backstop). */
export function stripPaths(obj, paths) {
  for (const path of (Array.isArray(paths) ? paths : [])) {
    const parts = String(path).split('.');
    let cur = obj;
    let ok = true;
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur?.[parts[i]];
      if (cur == null || typeof cur !== 'object') { ok = false; break; }
    }
    if (ok && cur && typeof cur === 'object') delete cur[parts[parts.length - 1]];
  }
  return obj;
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

// ── Outreach brief assembler (Compose capability) ─────────────────────────────
// The model AUTHORS outreach emails (any situation, no invented figures); this
// assembler hands it everything it is ALLOWED to use: a best-matching template as
// a STYLE exemplar, that template's best-practice notes, the household facts that
// pass the per-recipient privacy ladder, the saved contact, the grounded property,
// and a list of missing specifics to ask about. Read-only — it drafts nothing and
// sends nothing. Pure + unit-tested (tests/ask-tools.test.js).

// Quantity-of-Information Ladder — what each recipient role may receive. Keys are
// dotted paths resolved against { profile, finances, criteria, derived }. The
// `derived.*` entries are safe, pre-computed signals (buildDerivedSignals) — never
// raw salary/savings figures, except for the mortgage broker who legitimately needs
// the full financial picture.
export const OUTREACH_FACT_ALLOWLIST = {
  'estate-agent': [
    'profile.person.firstName', 'profile.person.lastName', 'profile.person.mobile',
    'derived.firstTimeBuyer', 'derived.chainFree', 'derived.aipInPlace', 'derived.aipAmount',
    'derived.positionSummary',
  ],
  'vendor': [
    'profile.person.firstName',
    'derived.firstTimeBuyer', 'derived.chainFree', 'derived.positionSummary',
  ],
  'mortgage-broker': [
    'profile.person.firstName', 'profile.person.lastName', 'profile.person.mobile',
    'profile.person.email', 'profile.person.dateOfBirth',
    'profile.employment.employer', 'profile.employment.role', 'profile.employment.type',
    'profile.employment.probationStatus', 'profile.employment.tenureYears',
    'finances.income', 'finances.savings.current', 'finances.goal.targetDeposit',
    'finances.goal.targetPropertyPrice', 'finances.mortgage', 'finances.firstTimeBuyer',
    'derived.depositSaved', 'derived.depositGap', 'derived.ltv',
  ],
  'solicitor': [
    'profile.person.firstName', 'profile.person.lastName', 'profile.person.mobile',
    'profile.person.email', 'profile.person.address',
    'derived.firstTimeBuyer', 'derived.fundingType', 'derived.lenderName',
  ],
  'surveyor': [
    'profile.person.firstName', 'profile.person.lastName', 'profile.person.mobile',
    'profile.person.email',
  ],
  'removals': [
    'profile.person.firstName', 'profile.person.lastName', 'profile.person.mobile',
    'profile.person.email',
  ],
  'insurance': [
    'profile.person.firstName', 'profile.person.lastName', 'profile.person.email',
  ],
  'local-authority': [
    'profile.person.firstName', 'profile.person.lastName', 'profile.person.address',
  ],
};

// NEVER-SHARE backstop — even if a future allow-list edit slips a sensitive field
// in, strip these for every non-broker recipient before the brief leaves this module.
export const OUTREACH_NEVER_FOR_NON_BROKER = [
  'finances.income', 'finances.savings', 'finances.goal.targetDeposit',
  'profile.creditProfile', 'profile.debts',
];

const ROLE_CONTACT_KEY = {
  'estate-agent': 'agents',
  'mortgage-broker': 'brokers',
  'solicitor': 'solicitors',
  'surveyor': 'surveyors',
};

/**
 * Safe, pre-computed signals for the QoI ladder — proceedability and position
 * facts an agent/vendor MAY see, derived from the raw finances/profile so the raw
 * figures never leave this module. Reuses shapeFinancesSummary for deposit maths.
 */
export function buildDerivedSignals(household) {
  const { profile = {}, finances = {} } = household || {};
  const fs = shapeFinancesSummary(finances, household?.investments ?? null);
  const aipAmount = finances?.mortgage?.targetMax ?? null;
  const arrangement = String(profile?.person?.household?.livingArrangement ?? '').toLowerCase();
  const targetPrice = Number(finances?.goal?.targetPropertyPrice) || 0;
  const ltv = (targetPrice && fs.depositSaved != null && fs.depositSaved >= 0)
    ? Math.max(0, Math.round(((targetPrice - fs.depositSaved) / targetPrice) * 100))
    : null;
  return {
    firstTimeBuyer: finances?.firstTimeBuyer ?? true,
    chainFree: arrangement !== 'owner-occupier',
    aipInPlace: aipAmount != null,
    aipAmount,
    depositSaved: fs.depositSaved ?? null,
    depositGap: fs.depositGap ?? null,
    ltv,
    fundingType: aipAmount ? 'mortgage' : null,
    lenderName: finances?.mortgage?.lender ?? null,
    positionSummary: 'first-time buyer, chain-free'
      + (aipAmount ? `, AIP in place for £${Number(aipAmount).toLocaleString('en-GB')}` : ''),
  };
}

/** Choose the exemplar template: explicit id wins, else best match on role + intent keywords. */
export function pickTemplate(templates, { recipientRole, intent, templateId } = {}) {
  const list = Array.isArray(templates) ? templates : [];
  if (templateId) {
    const byId = list.find((t) => t.id === templateId);
    if (byId) return byId;
  }
  const roleMatches = list.filter((t) => t.recipientRole === recipientRole);
  const pool = roleMatches.length ? roleMatches : list;
  if (!pool.length) return null;
  if (!intent) return pool[0];
  const words = norm(intent).split(/\s+/).filter((w) => w.length > 2);
  let best = pool[0];
  let bestScore = -1;
  for (const t of pool) {
    const hay = `${norm(t.title)} ${norm(t.description)} ${norm(t.stageName)}`;
    let score = 0;
    for (const w of words) if (hay.includes(w)) score += 1;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

function pickContactFields(c) {
  if (!c) return null;
  return { name: c.name ?? null, firm: c.firm ?? null, email: c.email ?? null, phone: c.phone ?? null };
}

/** Match a saved contact for the recipient role (by name if given, else the first on file). */
export function matchContact(contacts, recipientRole, contactName) {
  const key = ROLE_CONTACT_KEY[recipientRole];
  if (!key || !contacts) return null;
  const list = Array.isArray(contacts[key]) ? contacts[key] : [];
  if (!list.length) return null;
  if (contactName) {
    const want = norm(contactName);
    const hit = list.find((c) => {
      const n = norm(c?.name);
      return n && (n.includes(want) || want.includes(n));
    });
    if (hit) return pickContactFields(hit);
  }
  return pickContactFields(list[0]);
}

// Build the shape the 24 template placeholders expect ({{profile.firstName}},
// {{contact.agentName}}, {{finances.aipAmount}}…) so missing-fact detection doesn't
// false-positive on facts we DO hold under a different key. The model still gets the
// structured allowedFacts/contact/listing separately and authors from those.
function briefResolutionContext({ facts, listing, contact, extra, derived }) {
  const person = facts?.profile?.person ?? {};
  const profile = { ...person, ...(facts?.profile ?? {}) };
  const finances = { ...(facts?.finances ?? {}) };
  if (derived?.aipAmount != null) finances.aipAmount = derived.aipAmount;
  const contactAliases = contact
    ? { name: contact.name, firm: contact.firm, email: contact.email, phone: contact.phone,
        agentName: contact.name, brokerName: contact.name, solicitorName: contact.name, surveyorName: contact.name }
    : {};
  return {
    profile,
    finances,
    derived: derived ?? {},
    listing: listing ?? {},
    contact: contactAliases,
    ...(extra ?? {}),
  };
}

/** The exemplar placeholders we cannot ground from facts/contact/listing/extra — the model asks about these. */
export function computeMissingFacts(exemplar, { facts, listing, contact, extra, derived } = {}) {
  if (!exemplar) return [];
  const ctx = briefResolutionContext({ facts, listing, contact, extra, derived });
  const tokens = new Set();
  const src = `${exemplar.subjectTemplate ?? ''}\n${exemplar.bodyTemplate ?? ''}`;
  let m;
  const re = /\{\{\s*([\w.]+)\s*\}\}/g;
  while ((m = re.exec(src)) !== null) tokens.add(m[1]);
  const missing = [];
  for (const path of tokens) {
    const v = lookupPath(ctx, path);
    if (v === undefined || v === null || v === '') missing.push(path);
  }
  return missing;
}

/**
 * Assemble the read-only brief the model authors an outreach email from.
 * @param {object} args
 * @param {object[]} args.templates    outreach-templates.json
 * @param {string}   args.recipientRole estate-agent | mortgage-broker | …
 * @param {string=}  args.intent        free-text situation
 * @param {string=}  args.templateId    explicit exemplar id
 * @param {string=}  args.listingRef    rightmove id or free-text address
 * @param {object=}  args.listing       grounded listing row (fetched by tools.ts)
 * @param {string=}  args.contactName   recipient name to match against saved contacts
 * @param {object=}  args.extra         user-supplied specifics
 * @param {object}   args.household     { profile, finances, criteria, contacts, investments? }
 */
export function assembleOutreachBrief({
  templates, recipientRole, intent, templateId, listingRef, listing,
  contactName, extra, household,
} = {}) {
  const hh = household || {};
  const exemplar = pickTemplate(templates, { recipientRole, intent, templateId });
  const derived = buildDerivedSignals(hh);

  // Apply the per-recipient allow-list, then the never-share backstop.
  const facts = {};
  const allow = OUTREACH_FACT_ALLOWLIST[recipientRole] ?? OUTREACH_FACT_ALLOWLIST['estate-agent'];
  const source = { profile: hh.profile ?? {}, finances: hh.finances ?? {}, criteria: hh.criteria ?? {}, derived };
  for (const path of allow) {
    const v = lookupPath(source, path);
    // Derived signals land at the root of allowedFacts (positionSummary, aipAmount…);
    // profile/finances paths keep their nesting (profile.person.firstName…).
    if (v !== undefined && v !== null && v !== '') setPath(facts, path.replace(/^derived\./, ''), v);
  }
  if (recipientRole !== 'mortgage-broker') stripPaths(facts, OUTREACH_NEVER_FOR_NON_BROKER);

  const contact = matchContact(hh.contacts, recipientRole, contactName);
  const missingFacts = computeMissingFacts(exemplar, { facts, listing, contact, extra, derived });

  return {
    recipientRole: recipientRole ?? null,
    exemplar: exemplar ? {
      id: exemplar.id, title: exemplar.title, tone: exemplar.tone,
      subjectTemplate: exemplar.subjectTemplate, bodyTemplate: exemplar.bodyTemplate,
      bestPracticeNotes: exemplar.bestPracticeNotes ?? [],
      sources: exemplar.sources ?? [],
      attachmentsHint: exemplar.attachmentsHint ?? [],
    } : null,
    allowedFacts: facts,
    contact,
    listing: listing ?? null,
    extra: extra ?? {},
    missingFacts,
    note: 'These are the only household facts permitted for this recipient. Do not introduce others, and never invent figures, names, dates or prices.',
  };
}
