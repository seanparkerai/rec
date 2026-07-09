// tests/mocks/household-feed-rpc.js — fixture-backed reference implementation of
// the household_feed(p_household_id, …) SECURITY DEFINER RPC (flagship step 2.12;
// SQL mirror: supabase/archive/schema-household-feed.sql). One visibility
// predicate, expressed over MockSupabaseClient fixture tables so the contract
// tier can pin the RPC's semantics offline and the feed integration test (2.13)
// can serve it via tables.__rpc.household_feed.
//
// Semantics mirrored 1:1 from the SQL (any divergence is a bug HERE or THERE —
// the contract test additionally pins the SQL text against classify.js):
//   target areas  = household_areas(status='active') minus
//                   curated disables (areas.data active=false, not an
//                   onboarding stub); an id absent from areas passes through
//   membership    = DISTINCT listing_areas rows in any target area (a listing
//                   held via two areas appears once)
//   row gates     = geofence_pass IS DISTINCT FROM false (unless
//                   p_include_out_of_area), optional p_status equality, and the
//                   classify.js passesBaseline rule (the REAL import, so the JS
//                   side can never drift from the product rule)
//   shape         = listing columns + `areas` jsonb (full membership set,
//                   distance-sorted, nulls last), first_seen DESC then
//                   rightmove_id, LIMIT p_limit OFFSET p_offset
import { passesBaseline } from '../../assets/js/listings/classify.js';

/**
 * Build the rpc('household_feed') implementation over fixture tables.
 * @param {Record<string, object[]>} tables — the MockSupabaseClient fixture map
 * @param {{ session?: { user?: { id: string } } | null }} [opts]
 * @returns {(args?: object) => { data: object[] | null, error: { message: string } | null }}
 */
export function buildHouseholdFeedRpc(tables, { session } = {}) {
  return (args = {}) => {
    const {
      p_household_id,
      p_status = null,
      p_include_out_of_area = false,
      p_limit = 200,
      p_offset = 0,
    } = args;

    // Guard: caller must be a member of the household (is_household_member).
    // The SQL's service-context bypass has no browser analogue, so the mock
    // models the signed-in path only.
    const uid = session?.user?.id ?? null;
    const member = (tables.household_members ?? [])
      .some((m) => m?.user_id === uid && m?.household_id === p_household_id);
    if (!member) return { data: null, error: { message: 'household_feed: forbidden' } };

    // Target areas: active links minus curated disables.
    const areaById = new Map((tables.areas ?? []).map((a) => [a.id, a]));
    const isCuratedDisabled = (id) => {
      const a = areaById.get(id);
      return !!a && a.data?.active === false && a.data?.source !== 'household-onboarding';
    };
    const targetAreas = new Set(
      (tables.household_areas ?? [])
        .filter((l) => l?.household_id === p_household_id && l?.status === 'active')
        .map((l) => l.area_id)
        .filter((id) => !isCuratedDisabled(id)),
    );

    // m2m membership: DISTINCT listing ids in any target area.
    const memberIds = new Set(
      (tables.listing_areas ?? [])
        .filter((la) => targetAreas.has(la?.area_id))
        .map((la) => la.rightmove_id),
    );

    const rows = (tables.listings ?? [])
      .filter((l) => memberIds.has(l?.rightmove_id))
      .filter((l) => p_include_out_of_area || (l?.geofence_pass ?? null) !== false)
      .filter((l) => p_status == null || l?.status === p_status)
      .filter((l) => passesBaseline(l))
      .sort((a, b) =>
        String(b.first_seen ?? '').localeCompare(String(a.first_seen ?? ''))
        || String(a.rightmove_id).localeCompare(String(b.rightmove_id)))
      .slice(p_offset, p_limit == null ? undefined : p_offset + p_limit)
      .map((l) => ({
        ...l,
        // Full membership set (every area, held or not — the "why am I seeing
        // this" surface), distance-sorted with nulls last, ties on area_id.
        areas: (tables.listing_areas ?? [])
          .filter((la) => la?.rightmove_id === l.rightmove_id)
          .map((la) => ({ area_id: la.area_id, distance_mi: la.distance_mi ?? null, is_primary: !!la.is_primary }))
          .sort((a, b) =>
            ((a.distance_mi ?? Infinity) - (b.distance_mi ?? Infinity))
            || String(a.area_id).localeCompare(String(b.area_id))),
      }));

    return { data: rows, error: null };
  };
}
