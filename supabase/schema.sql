-- REFERENCE ONLY — the live schema truth is the MCP migration history (see
-- supabase/README.md); never run this against the live project (CLAUDE.md §18.5:
-- all DDL via mcp__supabase__apply_migration, never the dashboard).
-- rec — Supabase base database schema (original tables), kept as readable
-- reference and for bootstrapping a hypothetical fresh project. Idempotent.

BEGIN;

-- -----------------------------------------------------------------------
-- households
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL DEFAULT 'My Household',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE households ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read their household" ON households;
CREATE POLICY "household members can read their household"
  ON households FOR SELECT
  USING (is_household_member(id));

-- -----------------------------------------------------------------------
-- household_members
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS household_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read membership" ON household_members;
CREATE POLICY "household members can read membership"
  ON household_members FOR SELECT
  USING (user_id = (select auth.uid()) OR is_household_member(household_id));

DROP POLICY IF EXISTS "users can insert their own membership" ON household_members;
CREATE POLICY "users can insert their own membership"
  ON household_members FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------
-- Helper: is_household_member()
-- Defined after both tables exist so PostgreSQL can validate the body.
-- CREATE OR REPLACE is already idempotent.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_household_member(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = p_household_id
      AND user_id = (select auth.uid())
  );
$$;

-- -----------------------------------------------------------------------
-- profile
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profile (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read profile" ON profile;
CREATE POLICY "household members can read profile"
  ON profile FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert profile" ON profile;
CREATE POLICY "household members can insert profile"
  ON profile FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update profile" ON profile;
CREATE POLICY "household members can update profile"
  ON profile FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- criteria
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS criteria (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE criteria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read criteria" ON criteria;
CREATE POLICY "household members can read criteria"
  ON criteria FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert criteria" ON criteria;
CREATE POLICY "household members can insert criteria"
  ON criteria FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update criteria" ON criteria;
CREATE POLICY "household members can update criteria"
  ON criteria FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- finances
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read finances" ON finances;
CREATE POLICY "household members can read finances"
  ON finances FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert finances" ON finances;
CREATE POLICY "household members can insert finances"
  ON finances FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update finances" ON finances;
CREATE POLICY "household members can update finances"
  ON finances FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- shortlist
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shortlist (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '[]',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shortlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read shortlist" ON shortlist;
CREATE POLICY "household members can read shortlist"
  ON shortlist FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert shortlist" ON shortlist;
CREATE POLICY "household members can insert shortlist"
  ON shortlist FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update shortlist" ON shortlist;
CREATE POLICY "household members can update shortlist"
  ON shortlist FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- zones
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT 'null',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read zones" ON zones;
CREATE POLICY "household members can read zones"
  ON zones FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert zones" ON zones;
CREATE POLICY "household members can insert zones"
  ON zones FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update zones" ON zones;
CREATE POLICY "household members can update zones"
  ON zones FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- journey_checks
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journey_checks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{"viewing":{},"process":{},"moving":{}}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE journey_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read journey_checks" ON journey_checks;
CREATE POLICY "household members can read journey_checks"
  ON journey_checks FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert journey_checks" ON journey_checks;
CREATE POLICY "household members can insert journey_checks"
  ON journey_checks FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update journey_checks" ON journey_checks;
CREATE POLICY "household members can update journey_checks"
  ON journey_checks FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- journey_progress — buying-journey timeline tick state (v3)
-- Shape: { tasks: { [taskId]: true } } — the set of ticked task ids from
-- data/journey.json. A step is "done" when all its tasks are ticked.
-- Replaces the fixed-shape journey_checks blob with two-way synced progress.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journey_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{"tasks":{}}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE journey_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read journey_progress" ON journey_progress;
CREATE POLICY "household members can read journey_progress"
  ON journey_progress FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert journey_progress" ON journey_progress;
CREATE POLICY "household members can insert journey_progress"
  ON journey_progress FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update journey_progress" ON journey_progress;
CREATE POLICY "household members can update journey_progress"
  ON journey_progress FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- contacts — agents / brokers / solicitors / surveyors directory
-- Shape: { agents: [], brokers: [], solicitors: [], surveyors: [] }
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read contacts" ON contacts;
CREATE POLICY "household members can read contacts"
  ON contacts FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert contacts" ON contacts;
CREATE POLICY "household members can insert contacts"
  ON contacts FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update contacts" ON contacts;
CREATE POLICY "household members can update contacts"
  ON contacts FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- outreach — log of drafted / sent / replied emails
-- Shape: array of { id, templateId, recipientRole, subject, body, status… }
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outreach (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE outreach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read outreach" ON outreach;
CREATE POLICY "household members can read outreach"
  ON outreach FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert outreach" ON outreach;
CREATE POLICY "household members can insert outreach"
  ON outreach FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update outreach" ON outreach;
CREATE POLICY "household members can update outreach"
  ON outreach FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- areas — content mirror (canonical source is data/areas/<id>.json in repo).
-- Public read; writes via Supabase MCP only (service role bypasses RLS).
-- See CLAUDE.md §18 + docs/SUPABASE_SYNC.md for the sync contract.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS areas (
  id           text PRIMARY KEY,
  data         jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "areas public read" ON areas;
CREATE POLICY "areas public read" ON areas FOR SELECT USING (true);

-- -----------------------------------------------------------------------
-- house_types — content mirror (canonical source is data/house-types.json).
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS house_types (
  id           text PRIMARY KEY,
  data         jsonb NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE house_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "house_types public read" ON house_types;
CREATE POLICY "house_types public read" ON house_types FOR SELECT USING (true);

-- -----------------------------------------------------------------------
-- sync_log — append-only audit of every Claude/portal write.
-- Used by tests/supabase-sync.test.js to verify the sync contract.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   text NOT NULL,
  actor        text NOT NULL CHECK (actor IN ('claude', 'portal', 'system')),
  row_id       text,
  action       text NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'backfill')),
  at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_log public read" ON sync_log;
CREATE POLICY "sync_log public read" ON sync_log FOR SELECT USING (true);

-- -----------------------------------------------------------------------
-- listing_reactions — v3 L3 reaction log (append-only graded preference signal).
-- One row per reaction event; the latest row per (household_id, listing_id) is the
-- current reaction. listing_snapshot preserves the listing at reaction time so a
-- training signal survives the live listing being withdrawn/deleted.
-- User-state class. RLS: household members read + insert; NO update/delete
-- (append-only by contract), and so deliberately no updated_at trigger below.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_reactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id          uuid,                                    -- auth.uid() of the reactor
  listing_id       text NOT NULL,                           -- listings.rightmove_id (loose ref by design)
  reaction         text NOT NULL CHECK (reaction IN ('like','pass','reject')),
  reason           text,                                    -- chip key / free text; PRIMARY reason key, dual-written for back-compat
  reasons          jsonb NOT NULL DEFAULT '[]'::jsonb,       -- v3 multi-reason: [{key, detail, note}] — source of truth (migration listing_reactions_multi_reason)
  listing_snapshot jsonb,                                   -- listing at reaction time (training durability)
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Idempotent column add (so re-running on an existing table picks up multi-reason).
ALTER TABLE listing_reactions ADD COLUMN IF NOT EXISTS reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE listing_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read listing_reactions" ON listing_reactions;
CREATE POLICY "household members can read listing_reactions"
  ON listing_reactions FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert listing_reactions" ON listing_reactions;
CREATE POLICY "household members can insert listing_reactions"
  ON listing_reactions FOR INSERT WITH CHECK (is_household_member(household_id));

CREATE INDEX IF NOT EXISTS idx_listing_reactions_household ON listing_reactions (household_id);
CREATE INDEX IF NOT EXISTS idx_listing_reactions_listing   ON listing_reactions (household_id, listing_id, created_at DESC);

-- -----------------------------------------------------------------------
-- learned_preferences — v3 L4 distilled preference weights (one row/household).
-- `derived` is the Layer-2 recomputation of the append-only listing_reactions
-- log (base-rate calibrated · recency decayed · traceable); `overrides` is the
-- Layer-3 manual/AI intent that takes precedence. Migration: learned_preferences_l4.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learned_preferences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  derived      jsonb NOT NULL DEFAULT '{}',  -- signal -> { weight, reaction_ids[], n, n_liked, n_rejected, ... }
                                             -- + reserved '__reason_counts' (2026-07-02, step 4.7): ranked
                                             --   attributed-reason counts, recomputed wholesale with the weights
  overrides    jsonb NOT NULL DEFAULT '{}',  -- signal -> { weight, derived_weight_at_set, note? }
  dismissals   jsonb NOT NULL DEFAULT '{}',  -- v3 L5: conflict key -> dismissed_until ISO (14-day quiet)
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE learned_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read learned_preferences" ON learned_preferences;
CREATE POLICY "household members can read learned_preferences"
  ON learned_preferences FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert learned_preferences" ON learned_preferences;
CREATE POLICY "household members can insert learned_preferences"
  ON learned_preferences FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update learned_preferences" ON learned_preferences;
CREATE POLICY "household members can update learned_preferences"
  ON learned_preferences FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- area_confirmations (v3 Step5 — per-household area location review map)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS area_confirmations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz DEFAULT now(),
  CONSTRAINT area_confirmations_household_unique UNIQUE (household_id)
);

ALTER TABLE area_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members manage area_confirmations" ON area_confirmations;
CREATE POLICY "household members manage area_confirmations"
  ON area_confirmations
  FOR ALL USING (is_household_member(household_id)) WITH CHECK (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- updated_at trigger — applied to every data table
-- DROP TRIGGER IF EXISTS inside a DO block is already idempotent.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = pg_catalog.now(); RETURN NEW; END;
$$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profile','criteria','finances','shortlist',
    'zones','journey_checks','contacts','outreach',
    'areas','house_types','learned_preferences','area_confirmations'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_touch_%I ON %I;
       CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION touch_updated_at();',
      tbl, tbl, tbl, tbl
    );
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------
-- Covering indexes for foreign keys (perf advisor 0001_unindexed_foreign_keys)
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_debts_credit_cards_household   ON debts_credit_cards (household_id);
CREATE INDEX IF NOT EXISTS idx_debts_other_household          ON debts_other (household_id);
CREATE INDEX IF NOT EXISTS idx_debts_student_loans_household  ON debts_student_loans (household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_user         ON household_members (user_id);
CREATE INDEX IF NOT EXISTS idx_investments_accounts_household ON investments_accounts (household_id);
CREATE INDEX IF NOT EXISTS idx_investments_history_account    ON investments_history (account_id);

-- -----------------------------------------------------------------------
-- Model Refinement Engine (notify-only) — see docs/REFINEMENT_PLAN.md §3.
-- Stage 1: empty tables only. The engine PROPOSES; nothing here mutates scrape
-- scope or hides a listing. All household-scoped, RLS via is_household_member().
-- -----------------------------------------------------------------------

-- refinement_suggestions: one row per (household, dimension, value) tracked.
CREATE TABLE IF NOT EXISTS refinement_suggestions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  -- 2026-06-19: expanded beyond area/property_type to cover more reaction-trend
  -- dimensions (price_band/beds/outdoor/parking/outcode are display/observation only).
  -- 2026-06-21: 'area_radius' added — the per-area learned search-radius advisory rides
  -- this inbox (written by tools/radius-tune.mjs; see area_search_tuning below).
  dimension         text NOT NULL CHECK (dimension IN ('area','property_type','price_band','beds','outdoor','parking','outcode','area_radius')),
  value             text NOT NULL,                 -- normalised lower(trim())
  metrics           jsonb NOT NULL DEFAULT '{}',   -- §2.8 engine output (counts/metrics, not id lists)
  tier              text CHECK (tier IN ('forming','probable','confident','strong')),
  status            text NOT NULL DEFAULT 'forming'
                      CHECK (status IN ('forming','actionable','confirmed_hide','confirmed_scrape','dismissed','snoozed')),
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  runs_qualified    int NOT NULL DEFAULT 0,        -- consecutive qualifying runs (persistence gate §2.6.5)
  snoozed_until     timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, dimension, value)
);

ALTER TABLE refinement_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "household members can read refinement_suggestions" ON refinement_suggestions;
CREATE POLICY "household members can read refinement_suggestions"
  ON refinement_suggestions FOR SELECT USING (is_household_member(household_id));
DROP POLICY IF EXISTS "household members can insert refinement_suggestions" ON refinement_suggestions;
CREATE POLICY "household members can insert refinement_suggestions"
  ON refinement_suggestions FOR INSERT WITH CHECK (is_household_member(household_id));
DROP POLICY IF EXISTS "household members can update refinement_suggestions" ON refinement_suggestions;
CREATE POLICY "household members can update refinement_suggestions"
  ON refinement_suggestions FOR UPDATE USING (is_household_member(household_id));
DROP POLICY IF EXISTS "household members can delete refinement_suggestions" ON refinement_suggestions;
CREATE POLICY "household members can delete refinement_suggestions"
  ON refinement_suggestions FOR DELETE USING (is_household_member(household_id));

-- refinement_runs: audit of each evaluation run (backs the persistence gate).
CREATE TABLE IF NOT EXISTS refinement_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  run_at               timestamptz NOT NULL DEFAULT now(),
  params               jsonb NOT NULL DEFAULT '{}',  -- config snapshot used for the run
  candidates_evaluated int NOT NULL DEFAULT 0,
  actionable_count     int NOT NULL DEFAULT 0,
  weights_snapshot     jsonb                         -- P10i (2026-07-02): learned signal->weight
                                                     -- map as of this run; NULL pre-migration /
                                                     -- before a household's first recompute
);

ALTER TABLE refinement_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "household members can read refinement_runs" ON refinement_runs;
CREATE POLICY "household members can read refinement_runs"
  ON refinement_runs FOR SELECT USING (is_household_member(household_id));
DROP POLICY IF EXISTS "household members can insert refinement_runs" ON refinement_runs;
CREATE POLICY "household members can insert refinement_runs"
  ON refinement_runs FOR INSERT WITH CHECK (is_household_member(household_id));
DROP POLICY IF EXISTS "household members can delete refinement_runs" ON refinement_runs;
CREATE POLICY "household members can delete refinement_runs"
  ON refinement_runs FOR DELETE USING (is_household_member(household_id));

-- scrape_probation: areas/types approved for removal from active scrape (reversible).
CREATE TABLE IF NOT EXISTS scrape_probation (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  dimension         text NOT NULL CHECK (dimension IN ('area','property_type')),
  value             text NOT NULL,                 -- normalised lower(trim())
  approved_at       timestamptz NOT NULL DEFAULT now(),
  reprobe_every_runs int NOT NULL DEFAULT 6,       -- PROBATION_REPROBE_RUNS
  last_reprobe_run  int NOT NULL DEFAULT 0,        -- run counter of the last re-probe
  status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','reconsider','restored')),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, dimension, value)
);

ALTER TABLE scrape_probation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "household members can read scrape_probation" ON scrape_probation;
CREATE POLICY "household members can read scrape_probation"
  ON scrape_probation FOR SELECT USING (is_household_member(household_id));
DROP POLICY IF EXISTS "household members can insert scrape_probation" ON scrape_probation;
CREATE POLICY "household members can insert scrape_probation"
  ON scrape_probation FOR INSERT WITH CHECK (is_household_member(household_id));
DROP POLICY IF EXISTS "household members can update scrape_probation" ON scrape_probation;
CREATE POLICY "household members can update scrape_probation"
  ON scrape_probation FOR UPDATE USING (is_household_member(household_id));
DROP POLICY IF EXISTS "household members can delete scrape_probation" ON scrape_probation;
CREATE POLICY "household members can delete scrape_probation"
  ON scrape_probation FOR DELETE USING (is_household_member(household_id));

-- area_search_tuning: per-area learned search/geofence radius (engine-managed,
-- AREA-GLOBAL — NOT household-scoped, NOT git-synced). Written by tools/radius-tune.mjs,
-- read live by tools/fetch-listings.mjs. RLS modelled on the content mirrors: public
-- SELECT (area-global, for portal display), service-role-only writes (no INSERT/UPDATE
-- policy → only the service role, which bypasses RLS, writes it).
CREATE TABLE IF NOT EXISTS area_search_tuning (
  area_id               text PRIMARY KEY,
  geofence_radius_mi    numeric,
  search_radius_mi      numeric,
  recommended_radius_mi numeric,
  override_radius_mi    numeric,                  -- user override; always wins over the learner
  geofence_radii        jsonb,                    -- directional "petals": per-sector keep radius (mi), sector 0 = North
  sample_size           integer,
  like_count            numeric,
  method                text,
  confidence            text,
  explore_until         timestamptz,              -- inside this window the fetcher uses RADIUS_CEIL_MI
  last_explored_at      timestamptz,
  computed_at           timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE area_search_tuning ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "area_search_tuning public read" ON area_search_tuning;
CREATE POLICY "area_search_tuning public read"
  ON area_search_tuning FOR SELECT TO public USING (true);

-- updated_at touch triggers (reuse touch_updated_at()).
DROP TRIGGER IF EXISTS trg_touch_refinement_suggestions ON refinement_suggestions;
CREATE TRIGGER trg_touch_refinement_suggestions BEFORE UPDATE ON refinement_suggestions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS trg_touch_scrape_probation ON scrape_probation;
CREATE TRIGGER trg_touch_scrape_probation BEFORE UPDATE ON scrape_probation
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Covering indexes for the new FKs.
CREATE INDEX IF NOT EXISTS idx_refinement_suggestions_household ON refinement_suggestions (household_id);
CREATE INDEX IF NOT EXISTS idx_refinement_runs_household        ON refinement_runs (household_id);
CREATE INDEX IF NOT EXISTS idx_scrape_probation_household       ON scrape_probation (household_id);

-- -----------------------------------------------------------------------
-- ask_conversations (Ask feature — natural-language assistant chat threads)
-- User-state class (per household_id). The live DDL is applied via
-- mcp__supabase apply_migration (create_ask_conversations); this block is the
-- reference mirror only (CLAUDE.md §17). Threads persist the final user/assistant
-- TEXT turns; intermediate tool blocks are not stored (re-run per turn).
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ask_conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title        text NOT NULL DEFAULT 'New chat',
  messages     jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ role, content, ts }]
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ask_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members manage ask_conversations" ON ask_conversations;
CREATE POLICY "household members manage ask_conversations"
  ON ask_conversations FOR ALL
  USING (is_household_member(household_id))
  WITH CHECK (is_household_member(household_id));

CREATE INDEX IF NOT EXISTS idx_ask_conversations_household ON ask_conversations (household_id);

DROP TRIGGER IF EXISTS trg_touch_ask_conversations ON ask_conversations;
CREATE TRIGGER trg_touch_ask_conversations BEFORE UPDATE ON ask_conversations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- -----------------------------------------------------------------------
-- Helper: ask_reaction_counts() — Ask edge function get_reactions_summary.
-- Collapses the three per-reaction COUNT round-trips into one grouped read.
-- SECURITY INVOKER (not DEFINER) so Row Level Security still scopes the rows to
-- the calling household. Applied via MCP migration `ask_reaction_counts_rpc`.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ask_reaction_counts(hh uuid)
RETURNS TABLE(reaction text, n bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT lr.reaction, count(*)::bigint
  FROM public.listing_reactions lr
  WHERE lr.household_id = hh
  GROUP BY lr.reaction
$$;

GRANT EXECUTE ON FUNCTION public.ask_reaction_counts(uuid) TO authenticated;

COMMIT;
