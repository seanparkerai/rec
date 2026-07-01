// Integration (step 2.2, re-pointed at the RPC in step 2.13): the REAL storage
// feed read path — getListings() in assets/js/storage/listings/feed.js — run
// under Node against the fixture-backed mock client via the core.js test seam.
// Since the 2.13 cutover the scoped path calls the household_feed RPC, served
// here by the fixture reference implementation (tests/mocks/household-feed-rpc.js,
// itself contract-pinned against the SQL mirror) — so these assertions prove the
// same visibility contract holds THROUGH the client: m2m membership scoping,
// origin exclusion, active-link filtering, geofence_pass semantics, status
// filter, ordering, and membership attachment.
import { MockSupabaseClient } from '../mocks/supabase-client.js';
import { buildHouseholdFeedRpc } from '../mocks/household-feed-rpc.js';

const HID = 'house-001';
const SESSION = { user: { id: 'user-001', email: 'test@example.com' }, access_token: 't' };

const L = (id, { pass = true, first_seen, status = 'new', area_id = 'a-target' } = {}) => ({
  rightmove_id: id, address: `${id} street`, price: 300000, beds: 3,
  property_type: 'Detached', area_id, geofence_pass: pass, status,
  first_seen: first_seen ?? '2026-06-01T00:00:00Z',
});

function fixtureTables() {
  return {
    household_members: [{ user_id: 'user-001', household_id: HID }],
    household_areas: [
      { household_id: HID, area_id: 'a-target', status: 'active', is_origin: false },
      { household_id: HID, area_id: 'a-second', status: 'active', is_origin: false },
      { household_id: HID, area_id: 'a-origin', status: 'active', is_origin: true },   // home — excluded
      { household_id: HID, area_id: 'a-paused', status: 'inactive', is_origin: false }, // paused — excluded
    ],
    listing_areas: [
      // in-target: primary IS the held area
      { rightmove_id: 'in-target', area_id: 'a-target', distance_mi: 0.5, is_primary: true },
      // problem-A: physically inside a held area but primary stamped elsewhere
      { rightmove_id: 'overlap', area_id: 'a-unheld', distance_mi: 0.4, is_primary: true },
      { rightmove_id: 'overlap', area_id: 'a-second', distance_mi: 0.9, is_primary: false },
      // problem-B: only inside the household's ORIGIN area
      { rightmove_id: 'origin-only', area_id: 'a-origin', distance_mi: 0.3, is_primary: true },
      // paused-area-only membership
      { rightmove_id: 'paused-only', area_id: 'a-paused', distance_mi: 0.2, is_primary: true },
      // member of a held area but geofence_pass=false on the row (belt-and-braces gate)
      { rightmove_id: 'gf-false', area_id: 'a-target', distance_mi: 0.6, is_primary: true },
      // member with a null geofence verdict (pre-backfill) — must pass through
      { rightmove_id: 'gf-null', area_id: 'a-target', distance_mi: 0.7, is_primary: true },
      // saved-status listing in a held area
      { rightmove_id: 'saved-one', area_id: 'a-target', distance_mi: 0.8, is_primary: true },
    ],
    listings: [
      L('in-target', { first_seen: '2026-06-03T00:00:00Z' }),
      L('overlap', { area_id: 'a-unheld', first_seen: '2026-06-05T00:00:00Z' }),
      L('origin-only', { area_id: 'a-origin', first_seen: '2026-06-04T00:00:00Z' }),
      L('paused-only', { area_id: 'a-paused', first_seen: '2026-06-02T00:00:00Z' }),
      L('gf-false', { pass: false, first_seen: '2026-06-06T00:00:00Z' }),
      L('gf-null', { pass: null, first_seen: '2026-06-01T00:00:00Z' }),
      L('saved-one', { status: 'saved', first_seen: '2026-06-07T00:00:00Z' }),
      L('nowhere', { area_id: 'a-unheld', first_seen: '2026-06-08T00:00:00Z' }), // no membership rows at all
    ],
  };
}

async function loadFeed(tables) {
  const core = await import('../../assets/js/storage/core.js');
  core._resetStorageForTests();
  tables.__rpc = { household_feed: buildHouseholdFeedRpc(tables, { session: SESSION }) };
  globalThis.__REC_TEST_SB__ = new MockSupabaseClient(tables, { session: SESSION });
  const feed = await import('../../assets/js/storage/listings/feed.js');
  return { core, feed };
}

export async function register({ test, assert, assertEqual }) {
  // The catalog fetch inside getListings is expected to fail under Node (no
  // fetch of repo files) and is try/caught by the production code — silence
  // the console noise for readable test output.
  const quiet = async (fn) => {
    const orig = console.error; console.error = () => {};
    try { return await fn(); } finally { console.error = orig; }
  };

  test('feed: membership scoping — held-area listings in, unheld/never-membered out', async () => {
    const { feed } = await loadFeed(fixtureTables());
    const rows = await quiet(() => feed.getListings({ limit: 50 }));
    const ids = rows.map((r) => r.rightmove_id);
    assert(ids.includes('in-target'), 'primary-in-held-area listing visible');
    assert(!ids.includes('nowhere'), 'listing with no membership in any held area is absent');
  });

  test('feed (Problem A): membership beats the primary stamp — overlap listing visible', async () => {
    const { feed } = await loadFeed(fixtureTables());
    const rows = await quiet(() => feed.getListings({ limit: 50 }));
    assert(rows.some((r) => r.rightmove_id === 'overlap'),
      'listing whose primary is unheld but which is a member of a held area IS visible');
  });

  test('feed (Problem B): origin-area membership never surfaces a listing', async () => {
    const { feed } = await loadFeed(fixtureTables());
    const rows = await quiet(() => feed.getListings({ limit: 50 }));
    assert(!rows.some((r) => r.rightmove_id === 'origin-only'),
      'origin-only listing is excluded from the feed');
  });

  test('feed: paused (status≠active) area links do not scope listings in', async () => {
    const { feed } = await loadFeed(fixtureTables());
    const rows = await quiet(() => feed.getListings({ limit: 50 }));
    assert(!rows.some((r) => r.rightmove_id === 'paused-only'), 'inactive-link membership excluded');
  });

  test('feed: geofence_pass=false hidden by default, revealed by includeOutOfArea; null passes', async () => {
    const { feed } = await loadFeed(fixtureTables());
    const def = await quiet(() => feed.getListings({ limit: 50 }));
    assert(!def.some((r) => r.rightmove_id === 'gf-false'), 'false hidden by default');
    assert(def.some((r) => r.rightmove_id === 'gf-null'), 'null (pre-backfill) passes through');
    const withOOR = await quiet(() => feed.getListings({ limit: 50, includeOutOfArea: true }));
    assert(withOOR.some((r) => r.rightmove_id === 'gf-false'), 'includeOutOfArea reveals it');
  });

  test('feed: status filter + first_seen DESC ordering + membership attachment', async () => {
    const { feed } = await loadFeed(fixtureTables());
    const saved = await quiet(() => feed.getListings({ limit: 50, status: 'saved' }));
    assertEqual(saved.map((r) => r.rightmove_id).join(','), 'saved-one');
    const rows = await quiet(() => feed.getListings({ limit: 50 }));
    const seen = rows.map((r) => r.first_seen);
    assert(seen.every((t, i) => i === 0 || t <= seen[i - 1]), 'newest first');
    const overlap = rows.find((r) => r.rightmove_id === 'overlap');
    assert(Array.isArray(overlap.areas) && overlap.areas.some((a) => a.area_id === 'a-second'),
      'membership rows attached to the listing for the "why am I seeing this" surface');
  });

  test('feed: a household with no target areas gets an empty feed (short-circuit)', async () => {
    const t = fixtureTables();
    t.household_areas = t.household_areas.filter((l) => l.area_id === 'a-origin'); // origin only
    const { feed } = await loadFeed(t);
    const rows = await quiet(() => feed.getListings({ limit: 50 }));
    assertEqual(rows.length, 0, 'origin-only household sees nothing (no target areas)');
  });
}
