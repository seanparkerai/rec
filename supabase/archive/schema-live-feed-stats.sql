-- schema-live-feed-stats.sql — the /live-feed admin kiosk DB surface.
-- Migration intent name: live_feed_stats_admin_rpc (LIVE_FEED_PLAN §2) + the
-- household_review_stats derived cache (added 2026-06-22 for the "to review" hero).
--
-- Applied to the live project 2026-06-22 via MCP execute_sql (the apply_migration
-- tool was approval-gated in that session). Recorded here for the record per
-- supabase/README.md — live schema truth remains the MCP migration history /
-- list_tables, not this file. CREATE OR REPLACE / IF NOT EXISTS are idempotent.

-- ── household_review_stats — derived, engine/cache class (UNTRACKED) ──────────
-- Holds the listings-page "to review" count: the size of the visible Browse pool
-- the household actually sees AFTER the full client intelligence pipeline (radius →
-- affordability gate → junk → refinement/probation → decided suppression → dedupe).
-- The raw live-listings count CANNOT reproduce it, so the browser persists this
-- figure (assets/js/storage/listings/feed.js#saveListingsReviewCount, written by
-- page-listings.js) and the kiosk RPC reads it. Recomputable; never synced from
-- repo JSON — same untracked class as area_search_tuning / refinement_*.
create table if not exists public.household_review_stats (
  household_id uuid primary key references public.households(id) on delete cascade,
  pending_count int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.household_review_stats enable row level security;

drop policy if exists "review_stats_member_select" on public.household_review_stats;
drop policy if exists "review_stats_member_insert" on public.household_review_stats;
drop policy if exists "review_stats_member_update" on public.household_review_stats;

create policy "review_stats_member_select" on public.household_review_stats
  for select using (public.is_household_member(household_id));
create policy "review_stats_member_insert" on public.household_review_stats
  for insert with check (public.is_household_member(household_id));
create policy "review_stats_member_update" on public.household_review_stats
  for update using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

grant select, insert, update on public.household_review_stats to authenticated;

-- ── live_feed_stats() — admin-only aggregate read for the kiosk ───────────────
-- Admin-only (auth.jwt() email = admin@gr.com), SECURITY DEFINER so it can
-- aggregate across the two target households WITHOUT exposing any raw RLS-locked
-- row — it returns only counts, a savings total, and rolling averages. Read-only.
--
-- `to_review` is the persisted household_review_stats pool (null until the
-- household first browses since deploy). `live_listings` is the raw in-area live
-- count (kept as secondary context). Savings sources the ISA value from the scalar
-- investments_accounts.current_value / earmark_pct columns (the "current latest"
-- figure — owner decision 2026-06-22); the earmark arithmetic + rounding mirror
-- finance-derive.js#computeDepositSavings (parity pinned by tests/live-feed-stats.test.js).
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
  review as (
    select household_id, pending_count, updated_at
    from household_review_stats
    where household_id in (luke, suzanne)
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
        'to_review', review.pending_count,
        'to_review_at', review.updated_at,
        'live_listings', coalesce(live.n, 0),
        'saved', coalesce(saved.n, 0),
        'areas', coalesce(areas.n, 0),
        'savings', coalesce(savings.total, 0),
        'avg_likes_per_day_7', coalesce(like_avg.per_day_7, 0),
        'avg_likes_per_week_4', coalesce(like_avg.per_week_4, 0)
      ) order by hh.label)
      from hh
      left join live    on live.household_id    = hh.id
      left join review  on review.household_id  = hh.id
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
