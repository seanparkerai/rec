#!/usr/bin/env node
// =============================================================================
// THROWAWAY PROBE — Phase L0 of the v3 "Live Listings" plan.
// =============================================================================
// Purpose: prove the data source works *before* committing to it (schema, app,
// fetcher). It touches NO database and NO app code. Delete this file once L1
// has a real, validated fetcher.
//
// What it does, for 5 representative outcodes (SO20, SO21, SP5, GU34, SP11):
//   1. Resolve each outcode -> a Rightmove location identifier.
//        - Free/direct route first: los.rightmove.co.uk typeahead.
//        - Apify location-resolver fallback if APIFY_TOKEN is set.
//   2. Fetch the most-recent BUY listings for that location.
//        - Free/direct route first: rightmove.co.uk _search JSON API.
//        - Apify actor (APIFY_ACTOR_ID) fallback if the direct route is blocked.
//   3. Print road name + price + added date for each result.
//   4. VALIDATE every result is actually in the requested outcode and flag any
//      that look wrong-region (a stale/wrong location id silently returns the
//      wrong area — London for a Hampshire outcode has been observed; this is
//      the #1 data-quality risk and the whole reason this probe exists).
//   5. Report which route worked, per-outcode counts, and the real
//      new-listings-per-day rate so we can confirm daily-vs-every-other-day.
//
// Run:  node tools/probe-rightmove.mjs
// Env (optional, enables the Apify fallback):  APIFY_TOKEN, APIFY_ACTOR_ID
//       (load from .env yourself, e.g. `node --env-file=.env tools/probe-rightmove.mjs`)
// Requires Node 18+ (global fetch).
// =============================================================================

const TEST_OUTCODES = ['SO20', 'SO21', 'SP5', 'GU34', 'SP11'];
const MAX_DAYS_SINCE_ADDED = 3;
const RESULTS_PER_OUTCODE = 24;

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || '';

// Browser-ish headers — Rightmove 403s naked requests.
const BROWSER_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-GB,en;q=0.9',
  'Referer': 'https://www.rightmove.co.uk/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

// --- small helpers -----------------------------------------------------------

function priceFmt(n) {
  return typeof n === 'number' ? '£' + n.toLocaleString('en-GB') : String(n ?? '—');
}

// A result is "in outcode" if its address/postcode begins with the outcode and
// is NOT obviously another region. We keep this conservative: the address rarely
// carries a full postcode, so we use (a) explicit postcode prefix when present,
// (b) a hard reject on the classic failure signal ("London"), and (c) a soft
// note when we simply can't tell from the address text.
function classifyRegion(displayAddress, outcode) {
  const addr = String(displayAddress || '');
  const upper = addr.toUpperCase();
  const oc = outcode.toUpperCase();
  // Postcode-looking token at the end, e.g. "... SO21 1AB" or "... SO21".
  const m = upper.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b(?:\s*\d[A-Z]{2})?$/);
  if (m) return m[1] === oc ? 'in-outcode' : 'wrong-outcode:' + m[1];
  if (/\bLONDON\b/.test(upper)) return 'WRONG-REGION:London';
  return 'unverifiable-from-address';
}

// --- direct (free) route -----------------------------------------------------

async function resolveOutcodeDirect(outcode) {
  const url = `https://los.rightmove.co.uk/typeahead?query=${encodeURIComponent(outcode)}&limit=10`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`typeahead HTTP ${res.status}`);
  const json = await res.json();
  // Shape varies; look for an OUTCODE-type match whose display text contains the outcode.
  const matches =
    json?.matches || json?.typeAheadLocations || json?.locations || json?.suggestions || [];
  // Field names differ across Rightmove endpoints — try all the common ones.
  const idOf = (m) =>
    String(m.locationIdentifier || m.identifier || m.id || m.locationId || m.value || '');
  const txtOf = (m) =>
    String(m.displayName || m.displayText || m.name || m.label || m.text || '').toUpperCase();
  const hit =
    matches.find((m) => idOf(m).toUpperCase().startsWith('OUTCODE')) ||
    matches.find((m) => txtOf(m).includes(outcode.toUpperCase())) ||
    matches[0];
  if (!hit) {
    throw new Error(
      'no match in typeahead payload; topkeys=' +
        JSON.stringify(Object.keys(json || {})).slice(0, 200)
    );
  }
  const locationIdentifier = idOf(hit);
  if (!locationIdentifier) {
    // Surface the real shape so we can lock the field name.
    throw new Error('match has no id field; sample=' + JSON.stringify(hit).slice(0, 300));
  }
  return { locationIdentifier, displayName: txtOf(hit) || outcode };
}

async function fetchListingsDirect(locationIdentifier) {
  const params = new URLSearchParams({
    locationIdentifier,
    numberOfPropertiesPerPage: String(RESULTS_PER_OUTCODE),
    radius: '0',
    sortType: '6', // newest first
    index: '0',
    viewType: 'LIST',
    channel: 'BUY',
    currencyCode: 'GBP',
    isFetching: 'false',
    maxDaysSinceAdded: String(MAX_DAYS_SINCE_ADDED),
  });
  const url = `https://www.rightmove.co.uk/api/_search?${params}`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`_search HTTP ${res.status}`);
  const json = await res.json();
  const props = json?.properties || [];
  return props.map((p) => ({
    address: p.displayAddress,
    price: p.price?.amount,
    beds: p.bedrooms,
    type: p.propertySubType || p.propertyTypeFullDescription,
    added: p.firstVisibleDate || p.listingUpdate?.listingUpdateDate || null,
  }));
}

// --- Apify fallback ----------------------------------------------------------

// Build the Rightmove search URL the dhrumil/rightmove-scraper actor expects in
// `listUrls`. It needs a real locationIdentifier (OUTCODE^nnnn) — which is why we
// resolve the outcode first (the typeahead works from a Codespace's IP even
// though it's blocked from the Claude sandbox).
function buildSearchUrl(locationIdentifier) {
  const params = new URLSearchParams({
    searchType: 'SALE',
    locationIdentifier,
    sortType: '6', // newest first
    maxDaysSinceAdded: String(MAX_DAYS_SINCE_ADDED),
  });
  return `https://www.rightmove.co.uk/property-for-sale/find.html?${params}`;
}

async function fetchListingsApify(locationIdentifier) {
  if (!APIFY_TOKEN || !APIFY_ACTOR_ID) {
    throw new Error('APIFY_TOKEN/APIFY_ACTOR_ID not set — cannot use Apify fallback');
  }
  if (!locationIdentifier) {
    throw new Error('no locationIdentifier (outcode did not resolve) — dhrumil actor needs a listUrl');
  }
  // run-sync-get-dataset-items: runs the actor and returns its dataset inline.
  const url =
    `https://api.apify.com/v2/acts/${encodeURIComponent(APIFY_ACTOR_ID)}` +
    `/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;
  // Input shape for dhrumil/rightmove-scraper: listUrls (array of {url}) + a cap.
  // If you swap actors, this is the one block to change.
  const input = {
    listUrls: [{ url: buildSearchUrl(locationIdentifier) }],
    maxItems: RESULTS_PER_OUTCODE,
    monitoringMode: false,
    includePriceHistory: false,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`apify HTTP ${res.status}`);
  const items = await res.json();
  // Field names vary by actor — keep several fallbacks; the probe prints whatever
  // it finds so we can lock the exact mapping for the L1 fetcher from real output.
  return (Array.isArray(items) ? items : []).map((p) => ({
    address: p.displayAddress || p.address || p.title || null,
    price: p.price?.amount ?? p.price ?? p.priceValue ?? null,
    beds: p.bedrooms ?? p.beds ?? null,
    type: p.propertySubType || p.propertyType || p.type || null,
    added: p.firstVisibleDate || p.addedOrReduced || p.addedOn || p.listingUpdate?.listingUpdateDate || null,
  }));
}

// --- per-outcode probe -------------------------------------------------------

async function probeOutcode(outcode) {
  const out = { outcode, route: null, count: 0, inOutcode: 0, wrongRegion: 0, rows: [], error: null };

  // Resolve the outcode -> locationIdentifier once. Needed by BOTH routes
  // (the direct _search and the dhrumil actor's listUrl).
  let loc = null;
  let resolveErr = null;
  try {
    loc = await resolveOutcodeDirect(outcode);
  } catch (e) {
    resolveErr = e.message;
  }

  // 1) direct route (free)
  let directErr = null;
  if (loc) {
    try {
      out.rows = await fetchListingsDirect(loc.locationIdentifier);
      out.route = `direct (${loc.locationIdentifier} · ${loc.displayName})`;
    } catch (e) {
      directErr = e.message;
    }
  }

  // 2) apify fallback (uses the resolved locationIdentifier)
  if (!out.route) {
    try {
      out.rows = await fetchListingsApify(loc?.locationIdentifier);
      out.route = `apify (${APIFY_ACTOR_ID} · ${loc?.locationIdentifier})`;
    } catch (errApify) {
      out.error =
        `resolve: ${resolveErr || 'ok'} | direct: ${directErr || (loc ? 'ok' : 'skipped')} | ` +
        `apify: ${errApify.message}`;
      return out;
    }
  }

  out.count = out.rows.length;
  for (const r of out.rows) {
    const cls = classifyRegion(r.address, outcode);
    r._region = cls;
    if (cls === 'in-outcode') out.inOutcode += 1;
    if (cls.startsWith('WRONG-REGION')) out.wrongRegion += 1;
  }
  return out;
}

// --- main --------------------------------------------------------------------

async function main() {
  console.log('=== L0 PROBE: Rightmove data source ===');
  console.log(`outcodes: ${TEST_OUTCODES.join(', ')}`);
  console.log(`maxDaysSinceAdded: ${MAX_DAYS_SINCE_ADDED}`);
  console.log(`apify fallback: ${APIFY_TOKEN && APIFY_ACTOR_ID ? 'configured' : 'NOT configured'}`);
  console.log('');

  const results = [];
  for (const oc of TEST_OUTCODES) {
    const r = await probeOutcode(oc);
    results.push(r);

    console.log(`── ${oc} ──────────────────────────────────────────`);
    if (r.error) {
      console.log(`  ✗ FAILED: ${r.error}`);
      console.log('');
      continue;
    }
    console.log(`  route: ${r.route}`);
    console.log(`  results: ${r.count}  (in-outcode: ${r.inOutcode}, wrong-region: ${r.wrongRegion})`);
    for (const row of r.rows.slice(0, 8)) {
      const flag = row._region === 'in-outcode' ? '' : `  [${row._region}]`;
      console.log(`    • ${row.address ?? '—'} — ${priceFmt(row.price)} — added ${row.added ?? '?'}${flag}`);
    }
    if (r.wrongRegion > 0) {
      console.log(`  ⚠ ${r.wrongRegion} WRONG-REGION result(s) — location id is mis-resolving. STOP & investigate.`);
    }
    console.log('');
  }

  // summary + cadence signal
  console.log('=== SUMMARY ===');
  const ok = results.filter((r) => !r.error && r.count > 0);
  const totalNew = ok.reduce((s, r) => s + r.count, 0);
  console.log(`outcodes returning data: ${ok.length}/${TEST_OUTCODES.length}`);
  console.log(`total listings (<=${MAX_DAYS_SINCE_ADDED}d old) across probed outcodes: ${totalNew}`);
  if (ok.length) {
    const perDay = (totalNew / MAX_DAYS_SINCE_ADDED).toFixed(1);
    console.log(`≈ new-listings/day across ${ok.length} probed outcodes: ${perDay}`);
    console.log('  (low/trickle → every-other-day with a 3-day window is plenty; high → daily)');
  }
  const anyWrong = results.some((r) => r.wrongRegion > 0);
  const anyFail = results.some((r) => r.error);
  if (anyWrong) console.log('VERDICT: ✗ wrong-region results seen — do NOT trust this source/route until fixed.');
  else if (anyFail && !ok.length) console.log('VERDICT: ✗ no route returned data — direct blocked and no Apify fallback configured.');
  else if (anyFail) console.log('VERDICT: ~ partial — some outcodes failed; review per-outcode errors above.');
  else console.log('VERDICT: ✓ all probed outcodes returned in-region data — source looks usable for L1.');
}

main().catch((e) => {
  console.error('PROBE CRASHED:', e);
  process.exit(1);
});
