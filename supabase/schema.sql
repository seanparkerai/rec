-- IMPORTANT: This is idempotent. Safe to re-run.
-- rec — Supabase database schema
-- Run this in Supabase → SQL Editor → New query → paste → Run.
-- It creates all tables the app needs, enables Row Level Security,
-- and adds policies so only household members can read/write their data.

BEGIN;

-- -----------------------------------------------------------------------
-- Helper function: returns true if the current authenticated user belongs
-- to a given household. Used by every RLS policy below.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_household_member(p_household_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = p_household_id
      AND user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------
-- households — one row per household (single-household model).
-- The app auto-inserts this row during setup; you never need to touch it.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS households (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL DEFAULT 'My Household',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- A household is readable only by its members (checked via the junction table).
CREATE POLICY "household members can read their household"
  ON households FOR SELECT
  USING (is_household_member(id));

-- -----------------------------------------------------------------------
-- household_members — links Supabase auth users to a household.
-- Add one row per person who should have access.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS household_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);

ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Users can see who else is in their household.
CREATE POLICY "household members can read membership"
  ON household_members FOR SELECT
  USING (user_id = auth.uid() OR is_household_member(household_id));

-- Only the user themselves can add/remove their own membership
-- (admin operations are done via the Supabase dashboard or service role).
CREATE POLICY "users can insert their own membership"
  ON household_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------
-- profile — buyer profile (mirrors data/profile.json shape)
-- One row per household; data column stores the full JSON object.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profile (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can read profile"
  ON profile FOR SELECT USING (is_household_member(household_id));

CREATE POLICY "household members can insert profile"
  ON profile FOR INSERT WITH CHECK (is_household_member(household_id));

CREATE POLICY "household members can update profile"
  ON profile FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- criteria — search criteria (mirrors data/criteria.json shape)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS criteria (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can read criteria"
  ON criteria FOR SELECT USING (is_household_member(household_id));

CREATE POLICY "household members can insert criteria"
  ON criteria FOR INSERT WITH CHECK (is_household_member(household_id));

CREATE POLICY "household members can update criteria"
  ON criteria FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- finances — finances tracker (mirrors data/finances.json shape)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE finances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can read finances"
  ON finances FOR SELECT USING (is_household_member(household_id));

CREATE POLICY "household members can insert finances"
  ON finances FOR INSERT WITH CHECK (is_household_member(household_id));

CREATE POLICY "household members can update finances"
  ON finances FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- shortlist — array of saved area IDs (e.g. ["alresford-so24", ...])
-- Stored as a single JSONB array per household, matching the localStorage shape.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shortlist (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '[]',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shortlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can read shortlist"
  ON shortlist FOR SELECT USING (is_household_member(household_id));

CREATE POLICY "household members can insert shortlist"
  ON shortlist FOR INSERT WITH CHECK (is_household_member(household_id));

CREATE POLICY "household members can update shortlist"
  ON shortlist FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- zones — drawn map zones (GeoJSON FeatureCollection)
-- Stored as a single JSONB object per household.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT 'null',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can read zones"
  ON zones FOR SELECT USING (is_household_member(household_id));

CREATE POLICY "household members can insert zones"
  ON zones FOR INSERT WITH CHECK (is_household_member(household_id));

CREATE POLICY "household members can update zones"
  ON zones FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- journey_checks — viewing / process / moving checklist state
-- Shape: { viewing: {}, process: {}, moving: {} }
-- Stored as a single JSONB object per household.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS journey_checks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{"viewing":{},"process":{},"moving":{}}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE journey_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household members can read journey_checks"
  ON journey_checks FOR SELECT USING (is_household_member(household_id));

CREATE POLICY "household members can insert journey_checks"
  ON journey_checks FOR INSERT WITH CHECK (is_household_member(household_id));

CREATE POLICY "household members can update journey_checks"
  ON journey_checks FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- Trigger: auto-update updated_at on every table that has it
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['profile','criteria','finances','shortlist','zones','journey_checks']
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

COMMIT;
