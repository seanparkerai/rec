-- IMPORTANT: Fully idempotent — safe to re-run on an existing project.
-- rec — Supabase database schema
-- Run in Supabase → SQL Editor → New query → paste → Run.

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

COMMIT;
