// probe-rightmove-params.mjs — Phase 0 gating checks for the Search Profiles plan.
//
// WHY: the plan's cost model rests on beliefs about the Apify actor and Rightmove
// that this repo has NEVER verified, and one of them (`monitoringMode must stay
// off — it re-bills`, tests/contract/fetch-spend.test.js:30) looks backwards. This
// project has already been burned once by an unverified wire parameter: an
// off-ladder `radius=6.9` silently returned ZERO results on 36 of 56 targets for
// months (ADR 0011). So nothing in the fetcher changes until these probes report.
//
// SAFETY: read-only. Never writes to Supabase. The free probes (H) run by default;
// every paid probe must be named explicitly with --only, and each prints its actual
// charge from the run object so the cost is observed, not estimated.
//
// Usage (GitHub Actions — APIFY_TOKEN lives there, not locally):
//   node tools/probe-rightmove-params.mjs                     # probe H only, free
//   node tools/probe-rightmove-params.mjs --only=H,I,J,K,A,F  # everything
//   node tools/probe-rightmove-params.mjs --only=I --outcode=SP11
//
// Probes:
//   H  actor input schema + recent runs' real charges       free    §0.1, §0.7
//   P  account state + the exact 403 body the fetcher hides  free    live outage
//   I  bill a known-empty search                            ~$0.02  §0.2
//   J  monitoringMode: run twice, compare billed counts      ~$0.10  §0.7  ← biggest
//   K  does fullPropertyDetails:false return gate-able text  ~$0.05  §0.8
//   A  does an exact minPrice==maxPrice band work            ~$0.05  §2
//   F  two adjacent outcodes — are result sets disjoint      ~$0.10  I1

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || 'dhrumil~rightmove-scraper';
const API = 'https://api.apify.com/v2';

const BROWSER_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-GB,en;q=0.9',
  Referer: 'https://www.rightmove.co.uk/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

const args = process.argv.slice(2);
const argOf = (name, dflt = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const ONLY = new Set(String(argOf('only', 'H')).toUpperCase().split(',').map((s) => s.trim()).filter(Boolean));
const OUTCODE = argOf('outcode', 'SP11');
const OUTCODE2 = argOf('outcode2', 'SP4');
const PRICE = Number(argOf('price', '400000'));

const log = (...a) => console.log(...a);
const hr = (t) => log(`\n${'─'.repeat(72)}\n${t}\n${'─'.repeat(72)}`);
const money = (n) => (n == null ? 'n/a' : `$${Number(n).toFixed(4)}`);

// ── Rightmove search URL (self-contained on purpose) ─────────────────────────
// Deliberately NOT imported from fetch-listings.mjs: a probe must test the
// hypothesis, not inherit the assumptions of the code under suspicion.
function searchUrl(locationIdentifier, o = {}) {
  const p = new URLSearchParams({ searchType: 'SALE', sortType: String(o.sortType ?? 6) });
  if (o.priceMin != null) p.set('minPrice', String(o.priceMin));
  if (o.priceMax != null) p.set('maxPrice', String(o.priceMax));
  if (o.minBeds != null) p.set('minBedrooms', String(o.minBeds));
  if (o.days != null) p.set('maxDaysSinceAdded', String(o.days));
  if (o.propertyTypes) p.set('propertyTypes', o.propertyTypes);
  if (o.keywords) p.set('keywords', o.keywords);
  if (o.radius != null) p.set('radius', String(o.radius));
  // locationIdentifier stays OUTSIDE URLSearchParams — it encodes ^ as %5E, which
  // Rightmove double-decodes into a dead URL returning 0 results.
  return `https://www.rightmove.co.uk/property-for-sale/find.html?locationIdentifier=${locationIdentifier}&${p}`;
}

async function resolveOutcodeId(outcode) {
  const url = `https://los.rightmove.co.uk/typeahead?query=${encodeURIComponent(outcode)}&limit=10`;
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) throw new Error(`typeahead HTTP ${res.status}`);
  const json = await res.json();
  const matches = json?.matches || json?.typeAheadLocations || json?.locations || json?.suggestions || [];
  const idOf = (m) => String(m.locationIdentifier || m.identifier || m.id || m.locationId || m.value || '');
  const hit = matches.find((m) => idOf(m).toUpperCase().startsWith('OUTCODE')) || matches[0];
  if (!hit) throw new Error(`no typeahead match for ${outcode}`);
  let id = idOf(hit);
  if (/^\d+$/.test(id)) id = `OUTCODE^${id}`;
  return id;
}

// ── Apify ────────────────────────────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(APIFY_TOKEN)}`);
  if (!res.ok) throw new Error(`apify GET ${path} → HTTP ${res.status}`);
  return (await res.json()).data;
}

/**
 * Start a run, wait for it, and return BOTH the dataset items and the run's own
 * accounting. The run object is the whole point — `run-sync-get-dataset-items`
 * returns items only, so it can never tell us what a probe actually cost.
 */
async function runActor(input, label, runOptions = {}) {
  if (!APIFY_TOKEN) throw new Error('APIFY_TOKEN not set — paid probes cannot run');
  const qs = new URLSearchParams({ token: APIFY_TOKEN, waitForFinish: '300' });
  for (const [k, v] of Object.entries(runOptions)) qs.set(k, String(v));
  const res = await fetch(`${API}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`apify run ${label} → HTTP ${res.status} ${await res.text()}`);
  const run = (await res.json()).data;
  let items = [];
  try {
    const d = await fetch(`${API}/datasets/${run.defaultDatasetId}/items?token=${encodeURIComponent(APIFY_TOKEN)}`);
    if (d.ok) items = await d.json();
  } catch { /* dataset read is best-effort; the accounting below is what matters */ }
  const cost = run.usageTotalUsd ?? run.stats?.computeUnits ?? null;
  log(`  run ${label}: status=${run.status} items=${Array.isArray(items) ? items.length : '?'} cost=${money(cost)}`);
  if (run.chargedEventCounts) log(`    chargedEventCounts: ${JSON.stringify(run.chargedEventCounts)}`);
  return { run, items: Array.isArray(items) ? items : [], cost };
}

// ── Probe H — free. The one that gates everything else. ──────────────────────
async function probeH() {
  hr('PROBE H — actor input schema + recent runs (FREE)');
  const actor = await apiGet(`/acts/${encodeURIComponent(APIFY_ACTOR_ID)}`);
  log(`actor: ${actor.username}/${actor.name}  ·  defaultRunOptions: ${JSON.stringify(actor.defaultRunOptions || {})}`);

  const buildId = actor.taggedBuilds?.latest?.buildId;
  if (buildId) {
    const build = await apiGet(`/actor-builds/${buildId}`);
    const schema = build.inputSchema
      ? (typeof build.inputSchema === 'string' ? JSON.parse(build.inputSchema) : build.inputSchema)
      : null;
    if (schema?.properties) {
      log('\ninput schema fields (name · type · default):');
      for (const [k, v] of Object.entries(schema.properties)) {
        log(`  ${k.padEnd(26)} ${String(v.type).padEnd(9)} ${JSON.stringify(v.default ?? v.prefill ?? null)}`);
      }
      // The four fields the plan hangs on (§0.1, §0.7, §0.8).
      log('\nVERDICT on the fields this repo currently sends:');
      for (const f of ['maxItems', 'maxBudget', 'maxProperties', 'fullPropertyDetails',
                       'monitoringMode', 'includePriceHistory']) {
        const present = Object.prototype.hasOwnProperty.call(schema.properties, f);
        const dflt = present ? JSON.stringify(schema.properties[f].default ?? null) : '—';
        log(`  ${f.padEnd(22)} ${present ? 'ACCEPTED' : 'NOT IN SCHEMA (silently ignored)'}   default=${dflt}`);
      }
    } else {
      log('build carries no parsable inputSchema — read the console instead');
    }
  }

  const runs = await apiGet(`/acts/${encodeURIComponent(APIFY_ACTOR_ID)}/runs?limit=10&desc=1`);
  log('\nrecent runs — what we have ACTUALLY been paying:');
  for (const r of runs.items || []) {
    log(`  ${r.startedAt}  ${String(r.status).padEnd(9)}  cost=${money(r.usageTotalUsd)}` +
        `${r.chargedEventCounts ? '  ' + JSON.stringify(r.chargedEventCounts) : ''}`);
  }
  const total = (runs.items || []).reduce((a, r) => a + (Number(r.usageTotalUsd) || 0), 0);
  log(`  → last ${(runs.items || []).length} runs total: ${money(total)}`);
}

// ── Probe P — free. Why is the live fetcher getting 403 from Apify? ──────────
// Added 2026-08-27 after probe H revealed the fetcher has written ZERO listings
// since 2026-08-06: every target in every dispatch run fails `apify HTTP 403`.
// Probe H's own GET calls used the SAME token and succeeded, so the token is
// valid and has read scope — the 403 is specific to STARTING a run. That points
// at account state (credit/plan/actor rental), not at credentials. This probe
// pins down which, and prints the actual error body the fetcher throws away.
async function probeP() {
  hr('PROBE P — account state + the exact 403 body (FREE)');
  try {
    const me = await apiGet('/users/me');
    log(`account: ${me.username}  plan=${me.plan?.id ?? 'n/a'}  ` +
        `maxMonthlyUsageUsd=${me.plan?.maxMonthlyUsageUsd ?? 'n/a'}`);
    if (me.plan?.monthlyUsage) log(`  monthlyUsage: ${JSON.stringify(me.plan.monthlyUsage)}`);
    if (me.plan?.availableProxyGroups) log(`  proxyGroups: ${Object.keys(me.plan.availableProxyGroups).join(', ')}`);
  } catch (e) { log(`  /users/me failed: ${e.message}`); }

  try {
    const limits = await apiGet('/users/me/limits');
    log(`\nlimits/usage: ${JSON.stringify(limits.current ?? limits, null, 2).slice(0, 900)}`);
  } catch (e) { log(`  /users/me/limits failed: ${e.message}`); }

  // Reproduce the fetcher's exact failing call and PRINT THE BODY. The fetcher
  // raises `apify HTTP ${res.status}` and discards the body, which is precisely
  // why three weeks of total failure looked like an opaque 403.
  hr('PROBE P — reproducing the fetcher call verbatim');
  const url = searchUrl('OUTCODE^2445', { priceMin: 400000, priceMax: 400000 });
  const endpoint = `${API}/acts/${encodeURIComponent(APIFY_ACTOR_ID)}` +
    `/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listUrls: [{ url }], maxProperties: 50, fullPropertyDetails: false }),
  });
  const body = await res.text();
  log(`  HTTP ${res.status} ${res.statusText}`);
  log(`  body: ${body.slice(0, 1200)}`);
  log(`\n  VERDICT: ${res.ok
    ? 'the call SUCCEEDS now — the 403 was transient or has been resolved.'
    : 'reproduced. The body above names the real cause; fix that before any plan work.'}`);
}

// ── Paid probes ──────────────────────────────────────────────────────────────
async function probeI(locId) {
  hr('PROBE I — does a VALID search returning ZERO results cost anything? (§0.2)');
  // A price nothing will match: exact £123,457 is not a round asking price.
  const url = searchUrl(locId, { priceMin: 123457, priceMax: 123457, days: 1 });
  log(`  url: ${url}`);
  const { items, cost } = await runActor({ listUrls: [{ url }], maxProperties: 50, fullPropertyDetails: false }, 'empty');
  log(`\n  VERDICT: ${items.length} items, cost ${money(cost)} — ` +
      `${Number(cost) > 0.005 ? 'NOT free; the 10x empty-URL clause may apply to valid empty searches' : 'effectively free, as §0.2 predicts'}`);
}

async function probeJ(locId) {
  hr('PROBE J — monitoringMode: does run 2 bill only NEW listings? (§0.7) ← the big one');
  const url = searchUrl(locId, { priceMin: PRICE, priceMax: PRICE });
  log(`  url: ${url}`);
  const a = await runActor({ listUrls: [{ url }], maxProperties: 50, fullPropertyDetails: false, monitoringMode: true }, 'monitor-1');
  const b = await runActor({ listUrls: [{ url }], maxProperties: 50, fullPropertyDetails: false, monitoringMode: true }, 'monitor-2');
  log(`\n  run1: ${a.items.length} items ${money(a.cost)}`);
  log(`  run2: ${b.items.length} items ${money(b.cost)}`);
  const worked = b.items.length < a.items.length || Number(b.cost) < Number(a.cost) * 0.5;
  log(`\n  VERDICT: ${worked
    ? 'monitoringMode WORKS — run 2 billed materially less. The repo comment "it re-bills" is backwards; turn it ON.'
    : 'monitoringMode did NOT reduce run 2. Keep it off and re-read the actor docs before changing anything.'}`);
}

async function probeK(locId) {
  hr('PROBE K — does fullPropertyDetails:false still return text for the keyword gate? (§0.8)');
  const url = searchUrl(locId, { priceMin: PRICE, priceMax: PRICE });
  const { items } = await runActor({ listUrls: [{ url }], maxProperties: 50, fullPropertyDetails: false }, 'cheap-fields');
  if (!items.length) return log('  no items returned — re-run against a busier outcode/price');
  const it = items[0];
  log(`\n  field names on a search-card item:\n    ${Object.keys(it).join(', ')}`);
  for (const f of ['description', 'summary', 'keyFeatures', 'features', 'propertySubType',
                   'addedOn', 'firstVisibleDate', 'listingUpdateDate', 'listingUpdateReason', 'displayStatus']) {
    const v = it[f];
    const len = typeof v === 'string' ? `${v.length} chars` : Array.isArray(v) ? `${v.length} entries` : typeof v;
    log(`    ${f.padEnd(22)} ${v == null ? 'ABSENT' : `present (${len})`}`);
  }
  const text = [it.description, it.summary, ...(it.keyFeatures || [])].filter(Boolean).join(' ');
  log(`\n  VERDICT: ${text.length} chars of gate-able text. ` +
      `${text.length < 200 ? 'THIN — the period/Georgian/cottage gate may need the 5x detail fetch.' : 'Sufficient for the keyword gate at the 1x rate.'}`);
}

async function probeA(locId) {
  hr('PROBE A — does an EXACT band (minPrice == maxPrice) work? (§2)');
  const exact = searchUrl(locId, { priceMin: PRICE, priceMax: PRICE });
  const control = searchUrl(locId, { priceMin: PRICE - 25000, priceMax: PRICE });
  log(`  exact:   ${exact}`);
  log(`  control: ${control}`);
  const e = await runActor({ listUrls: [{ url: exact }], maxProperties: 50, fullPropertyDetails: false }, 'exact');
  const c = await runActor({ listUrls: [{ url: control }], maxProperties: 50, fullPropertyDetails: false }, 'control');
  const offBand = e.items.filter((x) => Number(x.price) !== PRICE).length;
  log(`\n  exact: ${e.items.length} items (${offBand} off-band)   control: ${c.items.length} items`);
  log(`  VERDICT: ${e.items.length === 0 && c.items.length > 0
    ? 'EXACT BAND RETURNS NOTHING while the control works — treat as off-ladder and re-plan §9.'
    : 'exact band works. ' + (offBand ? `NOTE ${offBand} off-band items — the post-fetch price gate is load-bearing.` : '')}`);
}

async function probeF(locId, locId2) {
  hr('PROBE F — are two adjacent outcodes DISJOINT? (invariant I1)');
  const mk = (id) => searchUrl(id, { priceMin: PRICE - 50000, priceMax: PRICE + 50000 });
  const a = await runActor({ listUrls: [{ url: mk(locId) }], maxProperties: 100, fullPropertyDetails: false }, OUTCODE);
  const b = await runActor({ listUrls: [{ url: mk(locId2) }], maxProperties: 100, fullPropertyDetails: false }, OUTCODE2);
  const idOf = (x) => String(x.id ?? x.rightmoveId ?? x.propertyId ?? '');
  const A = new Set(a.items.map(idOf).filter(Boolean));
  const B = new Set(b.items.map(idOf).filter(Boolean));
  const overlap = [...A].filter((x) => B.has(x));
  const rate = A.size + B.size ? (overlap.length * 2) / (A.size + B.size) : 0;
  log(`\n  ${OUTCODE}: ${A.size} ids   ${OUTCODE2}: ${B.size} ids   overlap: ${overlap.length} (${(rate * 100).toFixed(1)}%)`);
  log(`  VERDICT: ${overlap.length === 0
    ? 'DISJOINT — I1 holds; outcode targeting bills each listing exactly once.'
    : `OVERLAP FOUND — I1 is only approximate. Duplicate rate ${(rate * 100).toFixed(1)}% must be monitored every run.`}`);
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  log(`probe-rightmove-params · actor=${APIFY_ACTOR_ID} · only=${[...ONLY].join(',')}`);
  if (!APIFY_TOKEN) log('WARNING: APIFY_TOKEN not set — only free probes can run.');

  const paid = ['I', 'J', 'K', 'A', 'F'].filter((x) => ONLY.has(x));
  let locId = null, locId2 = null;
  if (paid.length) {
    locId = await resolveOutcodeId(OUTCODE);
    log(`resolved ${OUTCODE} → ${locId}`);
    if (ONLY.has('F')) {
      locId2 = await resolveOutcodeId(OUTCODE2);
      log(`resolved ${OUTCODE2} → ${locId2}`);
    }
  }

  const failures = [];
  const run = async (name, fn) => {
    if (!ONLY.has(name)) return;
    try { await fn(); } catch (e) { failures.push(`${name}: ${e.message}`); log(`  PROBE ${name} FAILED: ${e.message}`); }
  };

  await run('H', probeH);
  await run('P', probeP);
  await run('I', () => probeI(locId));
  await run('J', () => probeJ(locId));
  await run('K', () => probeK(locId));
  await run('A', () => probeA(locId));
  await run('F', () => probeF(locId, locId2));

  hr('SUMMARY');
  log(failures.length ? `${failures.length} probe(s) failed:\n  ${failures.join('\n  ')}` : 'all requested probes completed');
  log('\nPaste this output into the plan at docs/ before changing tools/fetch-listings.mjs.');
  if (failures.length) process.exitCode = 1;
})();
