// Contract (step 2.12): the ONE per-household visibility predicate —
// household_feed(p_household_id, …). Two nets in one file:
//   1. Fixture semantics via the reference implementation
//      (tests/mocks/household-feed-rpc.js), pinning the same contracts the 2.2
//      feed integration test pins for the client path: membership scoping,
//      Problem A (membership beats primary), every-active-area inclusion (the
//      is_origin home/commute carve-out was REMOVED 2026-07-09 — see
//      docs/adr/0009), paused links, curated-disable vs onboarding stubs,
//      cross-membership dedupe, geofence semantics, baseline,
//      status/order/paging, forbidden.
//   2. SQL-text pins over the DDL mirror (supabase/archive/
//      schema-household-feed.sql): guard, clauses, and the classify.js
//      constants + type regexes (translated \b→\y) — so the DB copy of the
//      baseline rule can never silently drift from the product rule.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildHouseholdFeedRpc } from '../mocks/household-feed-rpc.js';
import {
  BASELINE_PRICE_MIN, BASELINE_PRICE_MAX, BASELINE_MIN_BEDS,
  EXCLUDED_TYPE_RE, ALLOWED_TYPE_RE,
} from '../../assets/js/listings/classify.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SQL_PATH = join(ROOT, 'supabase/archive/schema-household-feed.sql');

const HID = 'house-001';
const SESSION = { user: { id: 'user-001', email: 'test@example.com' } };

const L = (id, { pass = true, first_seen, status = 'new', area_id = 'a-target', price = 300000, beds = 3, property_type = 'Detached' } = {}) => ({
  rightmove_id: id, address: `${id} street`, price, beds,
  property_type, area_id, geofence_pass: pass, status,
  first_seen: first_seen ?? '2026-06-01T00:00:00Z',
});

function fixtureTables() {
  return {
    household_members: [{ user_id: 'user-001', household_id: HID }],
    areas: [
      { id: 'a-disabled', data: { active: false } },                                    // curated disable
      { id: 'a-stub', data: { active: false, source: 'household-onboarding' } },        // researching stub
      { id: 'a-target', data: { active: true } },
      // a-second deliberately ABSENT from areas — an id missing from the
      // catalog passes through (the excludeCuratedDisabled contract).
    ],
    household_areas: [
      { household_id: HID, area_id: 'a-target', status: 'active' },
      { household_id: HID, area_id: 'a-second', status: 'active' },
      { household_id: HID, area_id: 'a-home', status: 'active' },     // ex-origin — now a plain active area, INCLUDED
      { household_id: HID, area_id: 'a-paused', status: 'inactive' }, // paused — excluded
      { household_id: HID, area_id: 'a-disabled', status: 'active' }, // curated disable — excluded
      { household_id: HID, area_id: 'a-stub', status: 'active' },     // stub — INCLUDED
    ],
    listing_areas: [
      { rightmove_id: 'in-target', area_id: 'a-target', distance_mi: 0.5, is_primary: true },
      // Problem A: inside a held area, primary stamped elsewhere
      { rightmove_id: 'overlap', area_id: 'a-unheld', distance_mi: 0.4, is_primary: true },
      { rightmove_id: 'overlap', area_id: 'a-second', distance_mi: 0.9, is_primary: false },
      // only inside the household's home area (ex-origin): now surfaces like any other
      { rightmove_id: 'home-only', area_id: 'a-home', distance_mi: 0.3, is_primary: true },
      { rightmove_id: 'paused-only', area_id: 'a-paused', distance_mi: 0.2, is_primary: true },
      { rightmove_id: 'disabled-only', area_id: 'a-disabled', distance_mi: 0.2, is_primary: true },
      { rightmove_id: 'stub-one', area_id: 'a-stub', distance_mi: 0.4, is_primary: true },
      // member of TWO held areas — must appear exactly once
      { rightmove_id: 'two-areas', area_id: 'a-target', distance_mi: 0.6, is_primary: true },
      { rightmove_id: 'two-areas', area_id: 'a-second', distance_mi: 1.1, is_primary: false },
      { rightmove_id: 'gf-false', area_id: 'a-target', distance_mi: 0.6, is_primary: true },
      { rightmove_id: 'gf-null', area_id: 'a-target', distance_mi: 0.7, is_primary: true },
      { rightmove_id: 'saved-one', area_id: 'a-target', distance_mi: 0.8, is_primary: true },
      // baseline violators, all members of the held target area
      { rightmove_id: 'price-high', area_id: 'a-target', distance_mi: 0.5, is_primary: true },
      { rightmove_id: 'price-null', area_id: 'a-target', distance_mi: 0.5, is_primary: true },
      { rightmove_id: 'beds-one', area_id: 'a-target', distance_mi: 0.5, is_primary: true },
      { rightmove_id: 'a-flat', area_id: 'a-target', distance_mi: 0.5, is_primary: true },
      { rightmove_id: 'no-type', area_id: 'a-target', distance_mi: 0.5, is_primary: true },
    ],
    listings: [
      L('in-target', { first_seen: '2026-06-03T00:00:00Z' }),
      L('overlap', { area_id: 'a-unheld', first_seen: '2026-06-05T00:00:00Z' }),
      L('home-only', { area_id: 'a-home', first_seen: '2026-06-04T00:00:00Z' }),
      L('paused-only', { area_id: 'a-paused', first_seen: '2026-06-02T00:00:00Z' }),
      L('disabled-only', { area_id: 'a-disabled', first_seen: '2026-06-02T12:00:00Z' }),
      L('stub-one', { area_id: 'a-stub', first_seen: '2026-06-02T18:00:00Z' }),
      L('two-areas', { first_seen: '2026-06-06T12:00:00Z' }),
      L('gf-false', { pass: false, first_seen: '2026-06-06T00:00:00Z' }),
      L('gf-null', { pass: null, first_seen: '2026-06-01T00:00:00Z' }),
      L('saved-one', { status: 'saved', first_seen: '2026-06-07T00:00:00Z' }),
      L('nowhere', { area_id: 'a-unheld', first_seen: '2026-06-08T00:00:00Z' }), // no membership at all
      L('price-high', { price: 500000, first_seen: '2026-06-05T06:00:00Z' }),
      L('price-null', { price: null, first_seen: '2026-06-05T12:00:00Z' }),
      L('beds-one', { beds: 1, first_seen: '2026-06-05T18:00:00Z' }),
      L('a-flat', { property_type: 'Flat', first_seen: '2026-06-04T06:00:00Z' }),
      L('no-type', { property_type: '', first_seen: '2026-06-04T12:00:00Z' }),
    ],
  };
}

const feed = (args = {}, tables = fixtureTables()) =>
  buildHouseholdFeedRpc(tables, { session: SESSION })({ p_household_id: HID, ...args });

export async function register({ test, assert, assertEqual }) {
  test('household_feed: membership scoping — held-area in, unheld/never-membered out', () => {
    const ids = feed().data.map((r) => r.rightmove_id);
    assert(ids.includes('in-target'), 'held-area listing visible');
    assert(!ids.includes('nowhere'), 'listing with no membership in any held area is absent');
  });

  test('household_feed (Problem A): membership beats the primary stamp', () => {
    assert(feed().data.some((r) => r.rightmove_id === 'overlap'),
      'listing whose primary is unheld but which is a member of a held area IS visible');
  });

  test('household_feed: EVERY active area surfaces (no origin carve-out); paused links excluded', () => {
    const ids = feed().data.map((r) => r.rightmove_id);
    assert(ids.includes('home-only'), 'listing in the household\'s home area IS visible (is_origin removed, ADR 0009)');
    assert(!ids.includes('paused-only'), 'inactive-link membership excluded');
  });

  test('household_feed: curated-disabled areas contribute nothing; onboarding stubs DO', () => {
    const ids = feed().data.map((r) => r.rightmove_id);
    assert(!ids.includes('disabled-only'), 'curated disable (active:false, no source) excluded');
    assert(ids.includes('stub-one'), 'household-onboarding stub (active:false) still surfaces');
  });

  test('household_feed: a listing held via TWO areas appears exactly once', () => {
    const hits = feed().data.filter((r) => r.rightmove_id === 'two-areas');
    assertEqual(hits.length, 1, 'cross-membership dedupe (nothing doubled)');
  });

  test('household_feed: geofence_pass false hidden / null passes / p_include_out_of_area reveals', () => {
    const ids = feed().data.map((r) => r.rightmove_id);
    assert(!ids.includes('gf-false'), 'false hidden by default');
    assert(ids.includes('gf-null'), 'null (pre-backfill) passes through');
    assert(feed({ p_include_out_of_area: true }).data.some((r) => r.rightmove_id === 'gf-false'),
      'p_include_out_of_area reveals it');
  });

  test('household_feed: baseline — known out-of-band hidden, unknown passes, type unconditional', () => {
    const ids = feed().data.map((r) => r.rightmove_id);
    assert(!ids.includes('price-high'), `price outside [${BASELINE_PRICE_MIN}, ${BASELINE_PRICE_MAX}] hidden`);
    assert(ids.includes('price-null'), 'unknown price passes (re-fetched summary must not drop rows)');
    assert(!ids.includes('beds-one'), `known beds < ${BASELINE_MIN_BEDS} hidden`);
    assert(!ids.includes('a-flat'), 'excluded property type hidden');
    assert(!ids.includes('no-type'), 'blank/unknown property type hidden (type rule is unconditional)');
  });

  test('household_feed: status filter, first_seen DESC ordering, membership attachment', () => {
    assertEqual(feed({ p_status: 'saved' }).data.map((r) => r.rightmove_id).join(','), 'saved-one');
    const rows = feed().data;
    const seen = rows.map((r) => r.first_seen);
    assert(seen.every((t, i) => i === 0 || t <= seen[i - 1]), 'newest first');
    const overlap = rows.find((r) => r.rightmove_id === 'overlap');
    assert(Array.isArray(overlap.areas) && overlap.areas.some((a) => a.area_id === 'a-second'),
      'full membership attached for the "why am I seeing this" surface');
    assertEqual(overlap.areas[0].area_id, 'a-unheld', 'membership distance-sorted (nearest first)');
  });

  test('household_feed: paging — limit/offset window the same ordered set without overlap', () => {
    const all = feed({ p_limit: null }).data.map((r) => r.rightmove_id);
    const page1 = feed({ p_limit: 3, p_offset: 0 }).data.map((r) => r.rightmove_id);
    const page2 = feed({ p_limit: 3, p_offset: 3 }).data.map((r) => r.rightmove_id);
    assertEqual([...page1, ...page2].join(','), all.slice(0, 6).join(','), 'pages tile the full ordering');
  });

  test('household_feed: non-member caller is forbidden; no-target household sees []', () => {
    const denied = buildHouseholdFeedRpc(fixtureTables(), { session: SESSION })({ p_household_id: 'house-002' });
    assert(denied.data === null && /forbidden/.test(denied.error?.message ?? ''), 'non-member forbidden');
    const t = fixtureTables();
    t.household_areas = t.household_areas.filter((l) => l.area_id === 'a-paused');
    assertEqual(feed({}, t).data.length, 0, 'paused-only household sees nothing');
  });

  // ── SQL-text pins over the DDL mirror ─────────────────────────────────────
  test('household_feed SQL: guard + clause structure pinned', () => {
    const sql = readFileSync(SQL_PATH, 'utf8');
    for (const needle of [
      'create or replace function public.household_feed(',
      'security definer',
      'set search_path = public',
      'is_household_member(p_household_id)',
      "raise exception 'household_feed: forbidden'",
      "ha.status = 'active'",
      "coalesce(a.data ->> 'source', '') <> 'household-onboarding'",
      'l.geofence_pass is distinct from false',
      'order by l.first_seen desc, l.rightmove_id',
      'limit p_limit offset p_offset',
    ]) assert(sql.includes(needle), `SQL mirror must contain: ${needle}`);
    // The origin carve-out is RETIRED (ADR 0009): every active area is in the
    // target set. A reappearing is_origin predicate is a regression.
    assert(!/is_origin\s*=/.test(sql), 'SQL mirror must NOT reintroduce an is_origin predicate');
  });

  test('household_feed SQL: baseline constants + type regexes mirror classify.js exactly', () => {
    const sql = readFileSync(SQL_PATH, 'utf8');
    assert(sql.includes(`p_price_min integer default ${BASELINE_PRICE_MIN}`), 'price floor default = BASELINE_PRICE_MIN');
    assert(sql.includes(`p_price_max integer default ${BASELINE_PRICE_MAX}`), 'price ceiling default = BASELINE_PRICE_MAX');
    assert(sql.includes(`p_min_beds integer default ${BASELINE_MIN_BEDS}`), 'beds floor default = BASELINE_MIN_BEDS');
    // Postgres ARE uses \y where JS uses \b; everything else is byte-identical.
    const toPg = (re) => re.source.replaceAll('\\b', '\\y');
    assert(sql.includes(`!~* '${toPg(EXCLUDED_TYPE_RE)}'`), 'EXCLUDED_TYPE_RE mirrored (translated \\b→\\y)');
    assert(sql.includes(`~* '${toPg(ALLOWED_TYPE_RE)}'`), 'ALLOWED_TYPE_RE mirrored (translated \\b→\\y)');
  });
}
