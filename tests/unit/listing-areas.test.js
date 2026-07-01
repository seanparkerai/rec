// tests/listing-areas.test.js — m2m listing↔area membership + origin-area semantics.
// Covers the pure building blocks of the junction (tools/listing-areas-writer.mjs +
// the backfill's is_primary alignment) and the CONTRACT the feed read enforces:
//   • Problem A — a listing stamped with area X but physically inside area Y is a
//     member of Y, so a household holding Y sees it (the single area_id would hide it).
//   • Problem B — an origin area is dropped from the household's feed scope, so a
//     listing that sits ONLY in the origin's catchment is not surfaced.
import { withinGeofence } from '../../tools/listings-normalise.mjs';
import { membershipRowsFor, groupByListing } from '../../tools/listing-areas-writer.mjs';
import { membershipFor } from '../../tools/backfill-listing-areas.mjs';

// Two overlapping villages (both buffers contain the home) + one far village.
const VILLAGES = [
  { id: 'dundridge-so32', name: 'Dundridge', outcode: 'SO32', lat: 50.9413, lng: -1.1952 },
  { id: 'waltham-chase-so32', name: 'Waltham Chase', outcode: 'SO32', lat: 50.9675, lng: -1.2077 },
  { id: 'whiteley-po15', name: 'Whiteley', outcode: 'PO15', lat: 50.8836, lng: -1.2669 },
];

// The feed's scope logic, mirrored purely so the contract is locked by a test:
//   held = active, NON-origin area links; a listing is in-scope iff its membership
//   set intersects the held set (what storage resolves via listing_areas + .in()).
const heldAreas = (links) => links.filter((l) => l.status === 'active' && !l.is_origin).map((l) => l.area_id);
const feedIncludes = (listingAreaIds, held) => listingAreaIds.some((a) => held.includes(a));

export async function register({ test, assert, assertEqual }) {
  // ── writer helper: geo results → flat membership rows, grouped per listing ──
  test('membershipRowsFor: flattens in-buffer areas; skips !pass; carries is_primary', () => {
    const passHome = { rightmove_id: '1', lat: 50.9386, lng: -1.2031, address: 'Forest Road, Waltham Chase, SO32' };
    const failHome = { rightmove_id: '2', lat: 52.5, lng: -1.9 };
    const geo = [passHome, failHome].map((l) => ({ l, g: withinGeofence(l, { villages: VILLAGES }) }));
    const rows = membershipRowsFor(geo);
    assert(rows.every((r) => r.rightmove_id === '1'), 'only the in-buffer listing contributes rows');
    assertEqual(rows.filter((r) => r.is_primary).length, 1);
    const byId = groupByListing(rows);
    assert(byId.has('1') && !byId.has('2'), 'grouped only for the passing listing');
    assert(byId.get('1').length >= 2, 'member of both overlapping villages');
  });

  // ── backfill: is_primary is aligned to the listing's STORED area_id ──
  test('backfill membershipFor: verdict-driven rows, no drift when stored primary matches', () => {
    const row = { rightmove_id: '3', lat: 50.9386, lng: -1.2031, address: 'Forest Road, Waltham Chase', area_id: 'waltham-chase-so32' };
    const { rows, primaryDrift } = membershipFor(row, VILLAGES);
    assertEqual(primaryDrift, false);
    const primaries = rows.filter((r) => r.is_primary);
    assertEqual(primaries.length, 1, 'exactly one primary (RPC boundary requires it)');
    assertEqual(primaries[0].area_id, 'waltham-chase-so32');
  });

  test('backfill membershipFor: stored area_id disagreeing with the verdict → drift flag only (RPC derives the column)', () => {
    // Stored primary no longer the geofence verdict: rows carry the VERDICT
    // primary as-is; primaryDrift=true signals stale geofence FIELDS (run
    // backfill-geofence alongside). No primaryFix — listings.area_id is derived
    // by replace_listing_areas since step 2.9.
    const row = { rightmove_id: '4', lat: 50.9386, lng: -1.2031, address: 'Forest Road, Waltham Chase', area_id: 'gone-area' };
    const { rows, primaryDrift } = membershipFor(row, VILLAGES);
    assertEqual(primaryDrift, true);
    const primaries = rows.filter((r) => r.is_primary);
    assertEqual(primaries.length, 1, 'exactly one verdict primary');
    assert(primaries[0].area_id !== 'gone-area', 'verdict, not the stale stored column, drives the primary');
  });

  // ── Problem A: membership makes an overlap-area listing visible ──
  test('feed contract (Problem A): a listing member of a held area is visible even if its primary is elsewhere', () => {
    // The listing's primary area_id is one the household does NOT hold, but it is a
    // MEMBER of one the household does hold.
    const listingAreas = ['wickham-and-knowle-hampshire', 'waltham-chase-so32']; // primary would be wickham
    const held = heldAreas([{ area_id: 'waltham-chase-so32', status: 'active', is_origin: false }]);
    assert(feedIncludes(listingAreas, held), 'held via the overlap membership, not the primary');
    // A household holding neither → excluded.
    const heldNone = heldAreas([{ area_id: 'swanmore-so32', status: 'active', is_origin: false }]);
    assert(!feedIncludes(listingAreas, heldNone), 'not a member of any held area → excluded');
  });

  // ── Problem B: origin areas are excluded from feed scope ──
  test('feed contract (Problem B): a listing only in an origin area is not surfaced', () => {
    const links = [
      { area_id: 'waltham-chase-so32', status: 'active', is_origin: false }, // target
      { area_id: 'whiteley-po15', status: 'active', is_origin: true },        // origin (home/commute)
    ];
    const held = heldAreas(links);
    assertEqual(JSON.stringify(held), JSON.stringify(['waltham-chase-so32'])); // origin dropped
    assert(!feedIncludes(['whiteley-po15'], held), 'origin-only listing excluded');
    assert(feedIncludes(['waltham-chase-so32'], held), 'target listing still included');
    // Membership itself is origin-agnostic: a whiteley listing IS a member of whiteley,
    // it is simply not in the household's *scope* because origin is filtered out.
  });
}
