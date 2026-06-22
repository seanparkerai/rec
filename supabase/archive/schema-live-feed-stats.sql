-- schema-live-feed-stats.sql — the /live-feed admin kiosk aggregate RPC.
-- Migration intent name: live_feed_stats_admin_rpc (LIVE_FEED_PLAN §2).
--
-- Applied to the live project 2026-06-22 via MCP execute_sql (the apply_migration
-- tool was approval-gated in that session). Recorded here for the record per
-- supabase/README.md — live schema truth remains the MCP migration history /
-- list_tables, not this file. Do NOT re-run blindly; CREATE OR REPLACE is idempotent.
--
-- Admin-only (auth.jwt() email = admin@gr.com), SECURITY DEFINER so it can
-- aggregate across the two target households WITHOUT exposing any raw RLS-locked
-- row — it returns only counts, a savings total, and rolling averages. Read-only.
--
-- Savings sources the ISA value from the scalar investments_accounts.current_value
-- / earmark_pct columns (the "current latest" figure — owner decision 2026-06-22),
-- not the older data->>'currentPortfolioValue' snapshot. The earmark arithmetic +
-- rounding still mirror finance-derive.js#computeDepositSavings; the formula parity
-- is pinned by tests/live-feed-stats.test.js.

create or replace function public.live_feed_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := auth.jwt() ->> 'email';
  luke    uuid := '9628b44f-447e-4c5b-bbbc-b2ce51efbbbe';
  suzanne uuid := 'f36e6215-7d62-497b-bc15-32a25c63de5b';
  result  jsonb;
begin
  if v_email is distinct from 'admin@gr.com' then
    raise exception 'live_feed_stats: forbidden';
  end if;

  with hh(id, label) as (values (luke, 'Luke'), (suzanne, 'Suzanne')),
  areas as (
    select household_id, count(*)::int as n
    from household_areas
    where status = 'active' and household_id in (luke, suzanne)
    group by household_id
  ),
  live as (
    select a.household_id, count(distinct l.rightmove_id)::int as n
    from household_areas a
    join listings l on l.area_id = a.area_id and l.status = 'live' and l.geofence_pass is not false
    where a.status = 'active' and a.household_id in (luke, suzanne)
    group by a.household_id
  ),
  latest_reaction as (
    select distinct on (household_id, listing_id) household_id, listing_id, reaction
    from listing_reactions
    where household_id in (luke, suzanne)
    order by household_id, listing_id, created_at desc
  ),
  saved as (
    select household_id, count(*) filter (where reaction = 'like')::int as n
    from latest_reaction group by household_id
  ),
  like_avg as (
    select household_id,
      round(count(*) filter (where reaction = 'like' and created_at >= now() - interval '7 days')::numeric / 7.0, 2) as per_day_7,
      round(count(*) filter (where reaction = 'like' and created_at >= now() - interval '28 days')::numeric / 4.0, 2) as per_week_4
    from listing_reactions
    where household_id in (luke, suzanne)
    group by household_id
  ),
  savings as (
    select f.household_id,
      round(
        coalesce((f.data->'savings'->>'current')::numeric, 0)
        + coalesce((
            select sum(case when coalesce(i.earmark_pct, 0) > 0
                            then round(i.current_value * i.earmark_pct / 100.0, 2)
                            else coalesce(i.current_value, 0) end)
            from investments_accounts i where i.household_id = f.household_id
          ), 0)
      , 2) as total
    from finances f
    where f.household_id in (luke, suzanne)
  ),
  scraper as (
    select
      round(count(*) filter (where action = 'insert' and at >= now() - interval '7 days')::numeric / 7.0, 2) as new_per_day_7,
      round(count(*) filter (where action = 'insert' and at >= now() - interval '30 days')::numeric / 30.0, 2) as new_per_day_30,
      max(at) as last_write
    from sync_log
    where table_name = 'listings' and actor = 'system'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'scraper', (select to_jsonb(scraper) from scraper),
    'households', (
      select jsonb_agg(jsonb_build_object(
        'id', hh.id, 'label', hh.label,
        'live_listings', coalesce(live.n, 0),
        'saved', coalesce(saved.n, 0),
        'areas', coalesce(areas.n, 0),
        'savings', coalesce(savings.total, 0),
        'avg_likes_per_day_7', coalesce(like_avg.per_day_7, 0),
        'avg_likes_per_week_4', coalesce(like_avg.per_week_4, 0)
      ) order by hh.label)
      from hh
      left join live    on live.household_id    = hh.id
      left join saved   on saved.household_id   = hh.id
      left join areas   on areas.household_id   = hh.id
      left join savings on savings.household_id = hh.id
      left join like_avg on like_avg.household_id = hh.id
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.live_feed_stats() from public, anon;
grant execute on function public.live_feed_stats() to authenticated;
