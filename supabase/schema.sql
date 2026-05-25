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
  USING (user_id = auth.uid() OR is_household_member(household_id));

DROP POLICY IF EXISTS "users can insert their own membership" ON household_members;
CREATE POLICY "users can insert their own membership"
  ON household_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

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
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = p_household_id
      AND user_id = auth.uid()
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
-- updated_at trigger — applied to every data table
-- DROP TRIGGER IF EXISTS inside a DO block is already idempotent.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profile','criteria','finances','shortlist',
    'zones','journey_checks','contacts','outreach'
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

COMMIT;
