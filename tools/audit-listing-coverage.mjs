// tools/audit-listing-coverage.mjs — the coverage sentinel (2026-07-09 audit).
//
// GUARANTEE it enforces: no listing may be invisible without a NAMED reason, and
// no household area may be silently excluded from coverage. Four checks:
//
//   1. AREA CONSISTENCY — every ACTIVE household_areas link resolves to a catalog
//      row that exists, has coords, and is not curated-disabled (a disabled row
//      behind an active link is exactly how areas were silently feed-hidden
//      before ADR 0009's sweep).
//   2. MEMBERSHIP DRIFT — for every active area (radius-aware, incl. the learned
//      area_search_tuning override), every listing whose coordinates fall inside
//      the geofence must have a listing_areas row. Drift = silent feed loss.
//      --fix inserts the missing rows (is_primary=false; the primary never moves).
//      RING FLOOR (ADR 0010): the checked radius is never below the map's drawn
//      ring (criteria.location overrides/global, default 3mi) — the ring is the
//      user's trust surface, so a learner-shrunk radius cannot bless a coverage
//      hole. Only an explicit user pin (override_radius_mi) narrows the check.
//   3. FULL ACCOUNTING — per household, every listings row lands in exactly one
//      bucket: shown by household_feed, archived, outside-your-active-catchments,
//      geofence-fail, excluded type, off-band price, under-beds. An UNEXPLAINED
//      residue fails the audit — that is the "randomly hidden" class.
//   4. STALENESS (report-only) — active areas whose newest member listing is old,
//      so thinning coverage is seen early. Never fails the run.
//
// Usage:
//   node tools/audit-listing-coverage.mjs            (audit; exit 1 on violations)
//   node tools/audit-listing-coverage.mjs --fix      (backfill drift, then re-audit)
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (same as the fetcher). Read-only
// except the --fix junction backfill (idempotent ON CONFLICT-equivalent upsert).
import {
  isAllowedPropertyType, BASELINE_PRICE_MIN, BASELINE_PRICE_MAX, BASELINE_MIN_BEDS,
} from '../assets/js/listings/classify.js';
import { ringFloorInputs } from './lib/geofence-universe.mjs';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const FIX = process.argv.includes('--fix');
const STALE_REPORT_DAYS = Number(process.env.STALE_REPORT_DAYS) || 14;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('audit-listing-coverage: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(2);
}
const HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

async function getAll(table, select, filter = '') {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${filter}`;
    const res = await fetch(url, { headers: { ...HEADERS, Range: `${from}-${from + PAGE - 1}` } });
    if (!res.ok) throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function feedIds(householdId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/household_feed`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ p_household_id: householdId, p_limit: 100000, p_offset: 0 }),
  });
  if (!res.ok) throw new Error(`household_feed RPC failed: ${res.status} ${await res.text()}`);
  return new Set((await res.json()).map((r) => r.rightmove_id));
}

const MILES = (aLat, aLng, bLat, bLng) => {
  const rad = (d) => (d * Math.PI) / 180;
  return 3958.8 * Math.acos(Math.min(1,
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(rad(bLng) - rad(aLng))
    + Math.sin(rad(aLat)) * Math.sin(rad(bLat))));
};

// Mirrors the household_feed baseline type rule via the REAL product classifier
// (classify.js lowercases internally — never test its regexes on raw text).
const typeExcluded = (t) => !isAllowedPropertyType(t);

async function main() {
  console.log('=== audit-listing-coverage ===');
  const [areas, links, tuning, listings, junction, criteriaRows] = await Promise.all([
    getAll('areas', 'id,data'),
    getAll('household_areas', 'household_id,area_id,status'),
    getAll('area_search_tuning', 'area_id,geofence_radius_mi,override_radius_mi'),
    getAll('listings', 'rightmove_id,lat,lng,price,beds,property_type,geofence_pass,archived_at,last_seen'),
    getAll('listing_areas', 'rightmove_id,area_id'),
    getAll('criteria', 'household_id,data'),
  ]);
  const { ringRadii, defaultRingMi } = ringFloorInputs(criteriaRows);
  const areaById = new Map(areas.map((a) => [a.id, a.data || {}]));
  const tuneById = new Map(tuning.map((t) => [t.area_id, t]));
  const activeLinks = links.filter((l) => l.status === 'active');
  const households = [...new Set(activeLinks.map((l) => l.household_id))];
  let violations = 0;

  // ── 1. AREA CONSISTENCY ────────────────────────────────────────────────────
  const disabled = [], noCoords = [], missing = [];
  const activeAreaIdsByHousehold = new Map(households.map((h) => [h, new Set()]));
  for (const l of activeLinks) {
    const d = areaById.get(l.area_id);
    if (!d) { missing.push(l.area_id); continue; }
    if (d.active === false && (d.source || '') !== 'household-onboarding') { disabled.push(l.area_id); continue; }
    if (!(d.coords && Number.isFinite(Number(d.coords.lat)))) { noCoords.push(l.area_id); continue; }
    activeAreaIdsByHousehold.get(l.household_id).add(l.area_id);
  }
  for (const [label, arr] of [['missing from areas catalog', missing], ['curated-disabled behind an ACTIVE link', disabled], ['active link without coords', noCoords]]) {
    if (arr.length) { violations += arr.length; console.error(`✗ ${arr.length} area link(s) ${label}: ${[...new Set(arr)].join(', ')}`); }
  }
  if (!missing.length && !disabled.length && !noCoords.length) console.log('✓ area consistency: every active link resolves, has coords, and is not curated-disabled');

  // ── 2. MEMBERSHIP DRIFT (radius-aware) ─────────────────────────────────────
  const junctionSet = new Set(junction.map((j) => `${j.rightmove_id}|${j.area_id}`));
  const activeAreaIds = [...new Set(activeLinks.map((l) => l.area_id))];
  const geo = activeAreaIds
    .map((id) => {
      const d = areaById.get(id) || {};
      if (!(d.coords && Number.isFinite(Number(d.coords.lat)))) return null;
      const t = tuneById.get(id) || {};
      // ADR 0010 ring floor: a user pin narrows the check (explicit consent, ring moved
      // with it); otherwise the checked radius = max(learned/native, drawn ring).
      const ringMi = Number(ringRadii[id]) > 0 ? Number(ringRadii[id]) : defaultRingMi;
      const radius = Number(t.override_radius_mi)
        || Math.max(Number(t.geofence_radius_mi) || Number(d.geofenceRadiusMi) || 3, ringMi);
      return { id, lat: Number(d.coords.lat), lng: Number(d.coords.lng), radius };
    })
    .filter(Boolean);
  const drift = [];
  for (const l of listings) {
    if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng)) continue;
    for (const a of geo) {
      const d = MILES(a.lat, a.lng, l.lat, l.lng);
      if (d <= a.radius && !junctionSet.has(`${l.rightmove_id}|${a.id}`)) {
        drift.push({ rightmove_id: l.rightmove_id, area_id: a.id, distance_mi: Math.round(d * 100) / 100, is_primary: false });
      }
    }
  }
  if (drift.length && FIX) {
    for (let i = 0; i < drift.length; i += 500) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/listing_areas?on_conflict=rightmove_id,area_id`, {
        method: 'POST', headers: { ...HEADERS, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(drift.slice(i, i + 500)),
      });
      if (!res.ok) throw new Error(`drift backfill failed: ${res.status} ${await res.text()}`);
    }
    console.log(`✓ membership drift: ${drift.length} missing junction row(s) BACKFILLED (--fix)`);
  } else if (drift.length) {
    violations += drift.length;
    const byArea = new Map();
    for (const d of drift) byArea.set(d.area_id, (byArea.get(d.area_id) || 0) + 1);
    console.error(`✗ membership drift: ${drift.length} in-geofence listing(s) missing junction rows — run with --fix. Worst: ${
      [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => `${id}(${n})`).join(', ')}`);
  } else {
    console.log('✓ membership drift: none — every in-geofence listing is stamped for every active area');
  }

  // ── 3. FULL ACCOUNTING per household ───────────────────────────────────────
  const memberAreasByListing = new Map();
  for (const j of junction) {
    if (!memberAreasByListing.has(j.rightmove_id)) memberAreasByListing.set(j.rightmove_id, []);
    memberAreasByListing.get(j.rightmove_id).push(j.area_id);
  }
  for (const hid of households) {
    const shown = await feedIds(hid);
    const mine = activeAreaIdsByHousehold.get(hid);
    const buckets = new Map();
    const bump = (k) => buckets.set(k, (buckets.get(k) || 0) + 1);
    const unexplained = [];
    for (const l of listings) {
      if (shown.has(l.rightmove_id)) { bump('shown'); continue; }
      if (l.archived_at) { bump('archived'); continue; }
      const members = memberAreasByListing.get(l.rightmove_id) || [];
      if (!members.some((a) => mine.has(a))) { bump('outside-your-active-catchments'); continue; }
      if (l.geofence_pass === false) { bump('geofence-fail'); continue; }
      if (typeExcluded(l.property_type)) { bump('excluded-type'); continue; }
      if (l.price != null && (l.price < BASELINE_PRICE_MIN || l.price > BASELINE_PRICE_MAX)) { bump('price-off-band'); continue; }
      if (l.beds != null && l.beds < BASELINE_MIN_BEDS) { bump('under-beds'); continue; }
      bump('UNEXPLAINED'); unexplained.push(l.rightmove_id);
    }
    const summary = [...buckets.entries()].map(([k, n]) => `${k}=${n}`).join(' · ');
    if (unexplained.length) {
      violations += unexplained.length;
      console.error(`✗ accounting[${hid.slice(0, 8)}]: ${summary}\n  UNEXPLAINED ids: ${unexplained.slice(0, 20).join(', ')}${unexplained.length > 20 ? ' …' : ''}`);
    } else {
      console.log(`✓ accounting[${hid.slice(0, 8)}]: ${summary} — zero unexplained`);
    }
  }

  // ── 4. STALENESS (report-only, never fails) ────────────────────────────────
  const newestByArea = new Map();
  const lastSeenById = new Map(listings.map((l) => [l.rightmove_id, l.last_seen]));
  for (const j of junction) {
    const seen = lastSeenById.get(j.rightmove_id);
    if (!seen) continue;
    if (!newestByArea.has(j.area_id) || seen > newestByArea.get(j.area_id)) newestByArea.set(j.area_id, seen);
  }
  const now = Date.now();
  const stale = activeAreaIds
    .map((id) => ({ id, days: newestByArea.has(id) ? Math.floor((now - Date.parse(newestByArea.get(id))) / 86400000) : null }))
    .filter((r) => r.days === null || r.days > STALE_REPORT_DAYS)
    .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));
  if (stale.length) {
    console.log(`ℹ staleness (report-only): ${stale.length} active area(s) with no listing seen in ${STALE_REPORT_DAYS}d: ${
      stale.slice(0, 12).map((r) => `${r.id}(${r.days === null ? 'never' : `${r.days}d`})`).join(', ')}${stale.length > 12 ? ' …' : ''}`);
  } else {
    console.log('ℹ staleness: every active area has a listing seen recently');
  }

  console.log(violations === 0 ? '\n=== COVERAGE AUDIT CLEAN ===' : `\n=== ${violations} VIOLATION(S) ===`);
  process.exit(violations === 0 ? 0 : 1);
}

main().catch((e) => { console.error('audit-listing-coverage crashed:', e.message); process.exit(2); });
