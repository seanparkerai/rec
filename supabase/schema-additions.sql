-- schema-additions.sql — idempotent DDL for expanded data model (Phase 5).
-- DO NOT run from Claude Code directly.
-- Apply via the companion Supabase prompt using the MCP connector:
--   mcp__supabase__apply_migration({ sql: <contents of this file> })
--
-- Assumes the existing schema.sql has already been applied (households,
-- household_members, is_household_member() helper, etc. all exist).

BEGIN;

-- -----------------------------------------------------------------------
-- profiles — expanded buyer profile (replaces the simple profile table
-- JSON column used by the original schema; stores the full nested spec)
-- -----------------------------------------------------------------------
-- The existing "profile" table stores { data jsonb }. We extend by adding
-- an "extended_data" column to hold the new nested profile.json shape.
-- This avoids breaking the portal's existing writes via storage.js.
ALTER TABLE profile ADD COLUMN IF NOT EXISTS extended_data jsonb NOT NULL DEFAULT '{}';

-- -----------------------------------------------------------------------
-- goals — buyer goals: deposit target, timeline, readiness checklist
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS goals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  data         jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read goals" ON goals;
CREATE POLICY "household members can read goals"
  ON goals FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert goals" ON goals;
CREATE POLICY "household members can insert goals"
  ON goals FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update goals" ON goals;
CREATE POLICY "household members can update goals"
  ON goals FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- investments_accounts — one row per investment account
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investments_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  provider        text NOT NULL,
  account_type    text NOT NULL,
  account_opened  date,
  current_value   numeric(12,2),
  earmark_pct     smallint NOT NULL DEFAULT 0,
  earmarked_for   text,
  strategy_epoch  text,
  data            jsonb NOT NULL DEFAULT '{}',
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE investments_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read investments_accounts" ON investments_accounts;
CREATE POLICY "household members can read investments_accounts"
  ON investments_accounts FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert investments_accounts" ON investments_accounts;
CREATE POLICY "household members can insert investments_accounts"
  ON investments_accounts FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update investments_accounts" ON investments_accounts;
CREATE POLICY "household members can update investments_accounts"
  ON investments_accounts FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- investments_history — monthly aggregates from the T212 importer
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investments_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id      uuid REFERENCES investments_accounts(id) ON DELETE CASCADE,
  month           char(7) NOT NULL,             -- YYYY-MM
  deposits        numeric(12,2) NOT NULL DEFAULT 0,
  withdrawals     numeric(12,2) NOT NULL DEFAULT 0,
  net             numeric(12,2) NOT NULL DEFAULT 0,
  dividends       numeric(12,2) NOT NULL DEFAULT 0,
  interest        numeric(12,2) NOT NULL DEFAULT 0,
  realised_pnl    numeric(12,2) NOT NULL DEFAULT 0,
  epoch           text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, account_id, month)
);

ALTER TABLE investments_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read investments_history" ON investments_history;
CREATE POLICY "household members can read investments_history"
  ON investments_history FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert investments_history" ON investments_history;
CREATE POLICY "household members can insert investments_history"
  ON investments_history FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update investments_history" ON investments_history;
CREATE POLICY "household members can update investments_history"
  ON investments_history FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- debts_credit_cards — one row per card
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS debts_credit_cards (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id            uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  provider                text NOT NULL,
  card_name               text,
  credit_limit            numeric(10,2),
  current_balance         numeric(10,2),
  minimum_monthly_payment numeric(8,2),
  pays_in_full_monthly    boolean NOT NULL DEFAULT false,
  utilisation_pct         numeric(5,2),
  intended_action         text,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE debts_credit_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read debts_credit_cards" ON debts_credit_cards;
CREATE POLICY "household members can read debts_credit_cards"
  ON debts_credit_cards FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert debts_credit_cards" ON debts_credit_cards;
CREATE POLICY "household members can insert debts_credit_cards"
  ON debts_credit_cards FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update debts_credit_cards" ON debts_credit_cards;
CREATE POLICY "household members can update debts_credit_cards"
  ON debts_credit_cards FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- debts_student_loans — one row per loan plan
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS debts_student_loans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  plan                text NOT NULL,
  monthly_deduction   numeric(8,2),
  balance             numeric(12,2),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE debts_student_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read debts_student_loans" ON debts_student_loans;
CREATE POLICY "household members can read debts_student_loans"
  ON debts_student_loans FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert debts_student_loans" ON debts_student_loans;
CREATE POLICY "household members can insert debts_student_loans"
  ON debts_student_loans FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update debts_student_loans" ON debts_student_loans;
CREATE POLICY "household members can update debts_student_loans"
  ON debts_student_loans FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- debts_other — catch-all for personal loans, BNPL, car finance, overdraft
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS debts_other (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  debt_type       text NOT NULL,  -- 'personal-loan','bnpl','car-finance','overdraft'
  provider        text,
  balance         numeric(12,2),
  monthly_payment numeric(8,2),
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE debts_other ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read debts_other" ON debts_other;
CREATE POLICY "household members can read debts_other"
  ON debts_other FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert debts_other" ON debts_other;
CREATE POLICY "household members can insert debts_other"
  ON debts_other FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update debts_other" ON debts_other;
CREATE POLICY "household members can update debts_other"
  ON debts_other FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- readiness_checklist — key-value, one row per checklist item
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS readiness_checklist (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  item_key        text NOT NULL,
  item_label      text NOT NULL,
  completed       boolean,
  completed_at    timestamptz,
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, item_key)
);

ALTER TABLE readiness_checklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "household members can read readiness_checklist" ON readiness_checklist;
CREATE POLICY "household members can read readiness_checklist"
  ON readiness_checklist FOR SELECT USING (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can insert readiness_checklist" ON readiness_checklist;
CREATE POLICY "household members can insert readiness_checklist"
  ON readiness_checklist FOR INSERT WITH CHECK (is_household_member(household_id));

DROP POLICY IF EXISTS "household members can update readiness_checklist" ON readiness_checklist;
CREATE POLICY "household members can update readiness_checklist"
  ON readiness_checklist FOR UPDATE USING (is_household_member(household_id));

-- -----------------------------------------------------------------------
-- updated_at triggers for new tables
-- -----------------------------------------------------------------------
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'goals',
    'investments_accounts',
    'investments_history',
    'debts_credit_cards',
    'debts_student_loans',
    'debts_other',
    'readiness_checklist'
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
