#!/usr/bin/env node
// audit-area-links.mjs — drift guard for the active:false ⇄ household_areas contract.
//
// Why this exists: `areas.active === false` (a curated disable) is the authoritative
// "cross this area off the catalog" lever. Both the scraper (tools/fetch-listings.mjs)
// and the display feed (assets/js/storage/listings/feed.js) now honour it via the SAME
// rule — assets/js/areas/area-ref.js → isCuratedDisabled. With those guards a stale
// active link is inert (never fetched, never shown), but it is still untidy DATA: a
// household_areas row claims a link to an area the catalog has retired. This tool
// surfaces (and optionally fixes) those rows so the live data matches the catalog.
//
// It is the as-code replacement for the one-off manual cleanup: run it after disabling
// any curated area, or on a schedule/CI, instead of hand-writing UPDATEs.
//
//   node tools/audit-area-links.mjs            # read-only report (default; exit 1 if drift)
//   node tools/audit-area-links.mjs --fix      # mark every offending link status='removed'
//
// Env: SUPABASE_URL (defaults to the project URL), SUPABASE_SERVICE_ROLE_KEY (required).
// Read-only by default; --fix is the ONLY path that writes, and it writes user-state, so
// it is gated behind the explicit flag. 'removed' is excluded from every read path
// (active-only feed/map, the includeInactive management view, and the scraper demand set).

import { isCuratedDisabled } from '../assets/js/areas/area-ref.js';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://qxmyrahqsopmaeokxdub.supabase.co').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const FIX = process.argv.includes('--fix');

function headers(extra = {}) {
  return { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...extra };
}

async function getJSON(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  if (!SERVICE_KEY) {
    console.error('audit-area-links: SUPABASE_SERVICE_ROLE_KEY is required (read-only service-role access).');
    process.exit(2);
  }

  // 1) Every non-removed link, with its household + area id.
  const links = await getJSON('household_areas?status=in.(active,inactive)&select=household_id,area_id,status');
  if (!links.length) { console.log('audit-area-links: no active/inactive links — nothing to check.'); return; }

  // 2) The catalog rows behind those links (active flag + source live in areas.data).
  const ids = [...new Set(links.map((l) => l.area_id).filter(Boolean))];
  const inList = ids.map((i) => `"${i}"`).join(',');
  const areas = await getJSON(`areas?id=in.(${inList})&select=id,data`);
  const byId = new Map(areas.map((a) => [a.id, a.data || {}]));

  // 3) A link is stale when its area is a CURATED disable (the shared rule).
  const offenders = links.filter((l) => isCuratedDisabled(byId.get(l.area_id)));

  if (!offenders.length) {
    console.log(`audit-area-links: ✓ clean — ${links.length} link(s) checked, none point at a curated-disabled area.`);
    return;
  }

  console.log(`audit-area-links: found ${offenders.length} stale link(s) to curated-disabled areas:`);
  for (const o of offenders) console.log(`  • ${o.area_id}  (household ${o.household_id}, status=${o.status})`);

  if (!FIX) {
    console.log('\nRe-run with --fix to set these links to status=\'removed\'.');
    process.exit(1);
  }

  // 4) --fix: mark each offending link removed (idempotent; scoped to the exact pair).
  let fixed = 0;
  for (const o of offenders) {
    const url = `${SUPABASE_URL}/rest/v1/household_areas?household_id=eq.${o.household_id}&area_id=eq.${encodeURIComponent(o.area_id)}`;
    const res = await fetch(url, { method: 'PATCH', headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify({ status: 'removed' }) });
    if (!res.ok) { console.error(`  ✗ failed ${o.area_id}: ${res.status} ${await res.text()}`); continue; }
    fixed += 1;
  }
  console.log(`\naudit-area-links: marked ${fixed}/${offenders.length} link(s) removed.`);
  if (fixed !== offenders.length) process.exit(1);
}

main().catch((e) => { console.error('audit-area-links:', e.message); process.exit(2); });
