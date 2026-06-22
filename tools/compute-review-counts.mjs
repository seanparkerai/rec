#!/usr/bin/env node
// compute-review-counts.mjs — headless recompute of each household's listings-page
// "to review" pool: the EXACT number page-listings.js shows ("N to review"), so the
// /live-feed kiosk stays live WITHOUT a user opening the listings page.
//
// It reuses the SAME pure engine modules as the browser feed — affordability/fit gate
// (scoreListingFit → assessAffordability), junk classifier (classifyListing), confirmed
// refinement hides (listingHiddenByRefinement) + probation, decided suppression
// (decidedSets/isDecided over the reaction log), the per-area radius filter and
// fingerprint dedupe — composed by partitionFeed exactly as page-listings.js paint()
// composes them, on the DEFAULT (unfiltered) view. Nothing is reimplemented, so the
// count can never drift from what the page renders.
//
// READ-ONLY w.r.t. all real data: it reads via the service role (PostgREST, bypassing
// RLS for the aggregate) and writes ONLY household_review_stats. It NEVER triggers Apify.
//
// CI / a machine with the key:
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set → recompute every target household.
//     node tools/compute-review-counts.mjs                 # the two kiosk households
//     node tools/compute-review-counts.mjs --household <id> # one household
// Sandbox (no key) — verify one household's count from a pre-built bundle:
//     node tools/compute-review-counts.mjs --from-file /tmp/review-bundle.json

import { readFile } from 'node:fs/promises';
import { scoreListingFit } from '../assets/js/listings/fit.js';
import { classifyListing } from '../assets/js/listings/flags.js';
import { partitionFeed } from '../assets/js/listings/feed-partition.js';
import { latestPerListing } from '../assets/js/listings/reactions.js';
import { decidedSets, isDecided } from '../assets/js/listings/suppress.js';
import { hiddenRulesFromOverrides, listingHiddenByRefinement } from '../assets/js/refinement/view.js';
import { effectiveWeights, listingLearnedPrefs } from '../assets/js/learned-preferences.js';
import { deriveFinances } from '../assets/js/finance-derive.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// The two kiosk households (same ids as public.live_feed_stats). --household overrides.
const TARGETS = [
  '9628b44f-447e-4c5b-bbbc-b2ce51efbbbe', // Luke   (My Household)
  'f36e6215-7d62-497b-bc15-32a25c63de5b', // Suzanne (Suzanne's Household)
];

const LISTING_COLS = 'rightmove_id,area_id,postcode,outcode,address,title,description,'
  + 'price,beds,baths,property_type,tenure,epc,council_tax,status,distance_mi,geofence_pass,'
  + 'first_seen,added_date,lat,lng';

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const normArea = (s) => String(s ?? '').trim().toLowerCase();

async function rest(path) {
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}${sep}limit=1000&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`PostgREST ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/**
 * The canonical "to review" count for one household — the same pipeline + default
 * (unfiltered) view as page-listings.js paint(). `finances` is already derived.
 */
export function computeReviewCount({ listings, criteria, finances, areasById, learned, reactionLog, probationRows }) {
  const live = Array.isArray(listings) ? listings : [];
  const liveById = new Map(live.map((l) => [String(l.rightmove_id), l]));
  const latest = latestPerListing(reactionLog || []);
  const decided = decidedSets(latest, liveById);
  const isDecidedListing = (l) => isDecided(l, decided);
  // Drop already-decided properties up front (like paint()'s feedListings).
  const feedListings = live.filter((l) => !isDecidedListing(l));

  const overrides = learned?.overrides || {};
  const effective = effectiveWeights(learned?.derived || {}, overrides);
  const hiddenRules = hiddenRulesFromOverrides(overrides);
  const probationSet = new Set((probationRows || []).map((p) => normArea(p.value)));

  const searchRadiusMi = Number(criteria?.location?.searchRadiusMi ?? 3);
  const radiusOverrides = criteria?.location?.areaRadiusOverrides || {};
  const passesRadius = (l) => {
    if (l.distance_mi == null) return true;
    const r = Number(radiusOverrides[l.area_id] ?? searchRadiusMi);
    if (r === 0) return l.geofence_pass === true;
    return Number(l.distance_mi) <= r;
  };
  const areaOf = (l) => (l.area_id ? areasById.get(l.area_id) : null) || null;
  const scoreOf = (l) => {
    if (!finances) return { verdict: 'unknown', score: 0, gated: false, contributions: [] };
    return scoreListingFit({ listing: l, finances, criteria, area: areaOf(l), learnedPrefs: listingLearnedPrefs(l, effective) });
  };

  const feed = partitionFeed(feedListings, {
    passesRadius,
    scoreOf,
    areaOf,
    includeOOR: false,
    includeHidden: false,
    isJunk: (l) => classifyListing(l).hide,
    isRefHidden: (l) => listingHiddenByRefinement(l, hiddenRules) || probationSet.has(normArea(l.area_id)),
    isDecided: isDecidedListing,
    // The server has no device-local "reviewed" marker; decided rows are already
    // removed, so the visible pool IS the pending pool (== page's unreviewed.length).
    isReviewed: () => false,
    reactionOf: () => null,
    applyControls: (ls) => ls, // default view — no transient search/sort/filter
  });
  return feed.unreviewed.length;
}

async function loadHousehold(householdId) {
  // Active areas → scope live listings (mirrors storage getListings/getHouseholdAreas).
  const areaLinks = await rest(`household_areas?select=area_id&household_id=eq.${householdId}&status=eq.active`);
  const areaIds = [...new Set(areaLinks.map((a) => a.area_id))];
  let listings = [];
  const areasById = new Map();
  if (areaIds.length) {
    const inList = areaIds.map((id) => `"${id}"`).join(',');
    listings = (await rest(`listings?select=${LISTING_COLS}&status=eq.live&area_id=in.(${inList})`))
      .filter((l) => l.geofence_pass !== false); // pass OR not-yet-verified (null)
    // Area records (councilTaxBand fallback for the affordability gate) keyed by id.
    for (const a of await rest(`areas?select=id,data&id=in.(${inList})`)) areasById.set(a.id, { id: a.id, ...(a.data || {}) });
  }
  const criteria = (await rest(`criteria?select=data&household_id=eq.${householdId}`))[0]?.data || {};
  const rawFin = (await rest(`finances?select=data&household_id=eq.${householdId}`))[0]?.data || null;
  const invRow = (await rest(`investments_accounts?select=data&household_id=eq.${householdId}`))[0];
  const investments = invRow ? { trading212ISA: invRow.data } : null;
  const finances = rawFin ? deriveFinances(rawFin, { investments }) : null;
  const learned = (await rest(`learned_preferences?select=overrides,derived,dismissals&household_id=eq.${householdId}`))[0] || {};
  const reactionLog = await rest(`listing_reactions?select=listing_id,reaction,reason,reasons,created_at,listing_snapshot&household_id=eq.${householdId}`);
  const probationRows = await rest(`scrape_probation?select=value&household_id=eq.${householdId}`);
  return { listings, criteria, finances, areasById, learned, reactionLog, probationRows };
}

async function upsertCount(householdId, count) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/household_review_stats?on_conflict=household_id`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ household_id: householdId, pending_count: count, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`upsert ${res.status}: ${await res.text()}`);
}

async function main() {
  const fromFile = arg('--from-file');
  if (fromFile) {
    const b = JSON.parse(await readFile(fromFile, 'utf8'));
    const finances = b.finances || (b.rawFinances ? deriveFinances(b.rawFinances, { investments: b.investments || null }) : null);
    const n = computeReviewCount({
      listings: b.listings || [],
      criteria: b.criteria || {},
      finances,
      areasById: new Map(Object.entries(b.areasById || {})),
      learned: b.learned || {},
      reactionLog: b.reactionLog || [],
      probationRows: b.probationRows || [],
    });
    process.stdout.write(`to_review (${b.householdId || 'bundle'}) = ${n}\n`);
    return;
  }
  if (!SERVICE_KEY) {
    process.stderr.write('compute-review-counts: no SUPABASE_SERVICE_ROLE_KEY — set it (CI) or use --from-file.\n');
    process.exit(0); // soft no-op (mirrors the other service-role tools)
  }
  const targets = arg('--household') ? [arg('--household')] : TARGETS;
  for (const id of targets) {
    try {
      const data = await loadHousehold(id);
      const n = computeReviewCount(data);
      await upsertCount(id, n);
      process.stderr.write(`  ${id}: to_review=${n}  (live in area=${data.listings.length}) → upserted\n`);
    } catch (e) {
      process.stderr.write(`  ${id}: FAILED — ${e.message}\n`);
      process.exitCode = 1;
    }
  }
}

main().catch((e) => { process.stderr.write(`compute-review-counts failed: ${e.message}\n`); process.exit(1); });
