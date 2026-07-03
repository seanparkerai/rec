-- REFERENCE ONLY — applied to the live project as migration household_feed_rpc (20260701232138); do not re-run.
-- schema-household-feed.sql — the ONE per-household visibility predicate
-- (flagship step 2.12; plan/04-program.md §3 collapse #4).
-- Migration intent name: household_feed_rpc.
--
-- Applied to the live project 2026-07-01 via the Supabase MCP connector.
-- Recorded here for the record per supabase/README.md — live schema truth
-- remains the MCP migration history / list_tables, not this file.
-- CREATE OR REPLACE is idempotent.
--
-- WHY: before this RPC the feed's visibility rule lived client-side in
-- assets/js/storage/listings/feed.js — resolve non-origin active areas, drop
-- curated disables, page listing_areas for member ids, then filter listings by
-- an .in('rightmove_id', …) id list (a URL-length scale wall) PLUS a
-- belt-and-braces geofence_pass gate. This function owns the WHOLE predicate in
-- one place: membership ∩ non-origin active areas ∩ curated-disable rule ∩
-- geofence_pass ∩ baseline, ordered and paged. The client (step 2.13) calls it
-- and retires the id-list plumbing.
--
-- CONTRACT (pinned by tests/contract/household-feed.test.js against this file,
-- and by the fixture reference implementation tests/mocks/household-feed-rpc.js):
--   * target areas  — household_areas rows with status='active' AND
--     is_origin=false, minus CURATED disables: areas.data active=false whose
--     source is not 'household-onboarding' (the excludeCuratedDisabled rule in
--     assets/js/areas/area-ref.js; a stub keeps rendering, a disabled area
--     never does; an id absent from areas passes through).
--   * membership    — listing_areas m2m: a listing inside ANY held target area
--     is in scope (Problem A), exactly once (DISTINCT — nothing doubled).
--   * geofence      — geofence_pass IS DISTINCT FROM false (null = pre-backfill
--     passes); p_include_out_of_area=true reveals the out-of-buffer rows.
--   * baseline      — classify.js passesBaseline mirrored: allowed house type
--     is unconditional; a KNOWN price/beds must sit inside the band; unknown
--     price/beds pass. Defaults = BASELINE_PRICE_MIN/MAX/MIN_BEDS; the type
--     regexes are the classify.js sources with \b translated to Postgres \y.
--   * shape         — the feed.js _LISTING_COLS plus `areas` jsonb: the FULL
--     membership set (held or not — the "why am I seeing this" surface),
--     distance-sorted nulls-last; first_seen DESC, rightmove_id tiebreak;
--     LIMIT p_limit (null = everything) OFFSET p_offset.
--   * access        — caller must be a member of p_household_id
--     (is_household_member), or a service context (service-role REST for CI
--     sweeps; direct DB session for MCP verification). Anon/non-members get
--     'household_feed: forbidden' — SECURITY DEFINER must not let a stranger
--     read another household's area selection through the side door.

create or replace function public.household_feed(
  p_household_id uuid,
  p_status text default null,
  p_include_out_of_area boolean default false,
  p_limit integer default 200,
  p_offset integer default 0,
  p_price_min integer default 250000,
  p_price_max integer default 425000,
  p_min_beds integer default 2
)
returns table (
  rightmove_id text, url text, title text, address text, postcode text,
  outcode text, area_id text, price integer, beds smallint, baths smallint,
  property_type text, tenure text, epc text, council_tax text, status text,
  lat double precision, lng double precision, image_url text, description text,
  first_seen timestamptz, last_seen timestamptz, added_date date,
  update_reason text, price_history jsonb, distance_mi double precision,
  geofence_pass boolean, name_match boolean, corroborated boolean,
  match_source text, areas jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    is_household_member(p_household_id)
    or coalesce(auth.jwt() ->> 'role', current_user) in ('service_role', 'postgres')
  ) then
    raise exception 'household_feed: forbidden';
  end if;

  return query
  with target_areas as (
    select ha.area_id
    from household_areas ha
    left join areas a on a.id = ha.area_id
    where ha.household_id = p_household_id
      and ha.status = 'active'
      and ha.is_origin = false
      and not (
        (a.data ->> 'active')::boolean is false
        and coalesce(a.data ->> 'source', '') <> 'household-onboarding'
      )
  ),
  member_listings as (
    select distinct la.rightmove_id
    from listing_areas la
    join target_areas t on t.area_id = la.area_id
  )
  select
    l.rightmove_id, l.url, l.title, l.address, l.postcode,
    l.outcode, l.area_id, l.price, l.beds, l.baths,
    l.property_type, l.tenure, l.epc, l.council_tax, l.status,
    l.lat, l.lng, l.image_url, l.description,
    l.first_seen, l.last_seen, l.added_date,
    l.update_reason, l.price_history, l.distance_mi,
    l.geofence_pass, l.name_match, l.corroborated,
    l.match_source,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'area_id', la.area_id,
          'distance_mi', la.distance_mi,
          'is_primary', la.is_primary
        )
        order by la.distance_mi nulls last, la.area_id
      )
      from listing_areas la
      where la.rightmove_id = l.rightmove_id
    ), '[]'::jsonb) as areas
  from listings l
  join member_listings m on m.rightmove_id = l.rightmove_id
  where (p_include_out_of_area or l.geofence_pass is distinct from false)
    and (p_status is null or l.status = p_status)
    -- baseline (classify.js passesBaseline): type rule unconditional, unknown
    -- price/beds pass. Regexes = classify.js sources with \b -> \y.
    and l.property_type is not null and btrim(l.property_type) <> ''
    and l.property_type !~* '\y(flat|apartment|maisonette|penthouse|studio|duplex|coach\s*house|park\s*home|mobile\s*home|caravan|houseboat|house\s*boat|lodge|chalet|land|plot|farm\s*land|equestrian|garages?|house\s*share|multiple\s*occupation|\yhmo\y|retirement|sheltered|not\s*specified)\y'
    and l.property_type ~* '\y(detached|semi[\s-]*detached|terrace|terraced|end[\s-]*of[\s-]*terrace|town\s*house|cottage|link[\s-]*detached|mews|barn|character|bungalow|house|farmhouse|manor)\y'
    and (l.price is null or (l.price >= p_price_min and l.price <= p_price_max))
    and (l.beds is null or l.beds >= p_min_beds)
  order by l.first_seen desc, l.rightmove_id
  limit p_limit offset p_offset;
end;
$$;
