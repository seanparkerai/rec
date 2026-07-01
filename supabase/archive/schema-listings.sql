-- schema-listings.sql — DDL for the v3 "Live Listings" feature (Phase L1).
-- Fully idempotent — safe to re-run on an existing project.
-- DO NOT run from a page; apply via the Supabase MCP connector:
--   mcp__supabase__apply_migration({ name: 'listings_l1', query: <contents> })
-- Assumes schema.sql has already been applied (households, areas, touch_updated_at()).
--
-- Sync class (new — see docs/SUPABASE_SYNC.md): LIVE CONTENT.
--   Source of truth = Supabase, written by tools/fetch-listings.mjs (service role).
--   NOT git-versioned (listings change hourly; no review/cite value, unlike areas).
--   Public read (it is content, not household data); writes only via service role,
--   which bypasses RLS. No portal/Claude jsonb write path — this is the one
--   fetcher-written table.

BEGIN;

-- -----------------------------------------------------------------------
-- listings — normalised property objects (typed columns for everything we
-- filter / sort / dedup on; raw_json keeps the full source payload so a
-- source swap never loses data).
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rightmove_id     text UNIQUE NOT NULL,          -- dedup key; source-native id
  source           text NOT NULL DEFAULT 'rightmove-apify',
  url              text,
  title            text,
  address          text,
  postcode         text,                          -- full postcode when present
  outcode          text NOT NULL,                 -- requested outcode (e.g. SO20)
  area_id          text,                          -- best-match area id (logical ref to areas.id; loose by design)
  price            integer,
  beds             smallint,
  baths            smallint,
  property_type    text,
  tenure           text,
  epc              text,
  council_tax      text,
  status           text NOT NULL DEFAULT 'live',  -- listing lifecycle: live/under_offer/sstc/withdrawn
  lat              double precision,
  lng              double precision,
  image_url        text,
  floorplan_url    text,                          -- first floor-plan image (detail scrapes only; null on summary fetch)
  description      text,
  first_seen       timestamptz NOT NULL DEFAULT now(),
  last_seen        timestamptz NOT NULL DEFAULT now(),
  added_date       date,                          -- source's "added/reduced" date
  update_reason    text,                          -- source listingUpdateReason: new/reduced/...
  price_history    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{price, seen_at}]
  raw_json         jsonb NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Idempotent column adds (so re-running on an existing table picks up new columns).
ALTER TABLE listings ADD COLUMN IF NOT EXISTS floorplan_url text;

-- L7 geofence precision. distance_mi/geofence_pass are the coordinate verdict;
-- name_match/corroborated are the second-signal failsafe (town/postcode text vs
-- the matched village). corroborated=false means FLAG FOR AUDIT, never auto-drop.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS distance_mi   double precision; -- to nearest active village centroid
ALTER TABLE listings ADD COLUMN IF NOT EXISTS geofence_pass boolean;          -- coordinate geofence verdict (precision guarantee)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS name_match    boolean;          -- second signal agrees with matched village (null = no text)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS corroborated  boolean;          -- both signals agree; false = flag for audit (not auto-dropped)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS match_source  text;             -- 'coordinates' | 'coordinates+name'
CREATE INDEX IF NOT EXISTS idx_listings_geofence ON listings (geofence_pass);
CREATE INDEX IF NOT EXISTS idx_listings_distance ON listings (distance_mi);
CREATE INDEX IF NOT EXISTS idx_listings_corrob   ON listings (corroborated);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Content: any authenticated (or anon) reader may SELECT. Writes happen only
-- through the service role, which bypasses RLS — so no INSERT/UPDATE policy is
-- granted to ordinary roles (mirrors the `areas` content table).
DROP POLICY IF EXISTS "listings public read" ON listings;
CREATE POLICY "listings public read" ON listings FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_listings_first_seen ON listings (first_seen DESC);
CREATE INDEX IF NOT EXISTS idx_listings_outcode    ON listings (outcode);
CREATE INDEX IF NOT EXISTS idx_listings_area       ON listings (area_id);
CREATE INDEX IF NOT EXISTS idx_listings_status     ON listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_price      ON listings (price);

-- updated_at trigger (touch_updated_at() defined in schema.sql).
DROP TRIGGER IF EXISTS trg_touch_listings ON listings;
CREATE TRIGGER trg_touch_listings BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── listing↔area membership (m2m) + origin areas ──────────────────────────────
-- A listing is stamped with ONE primary `listings.area_id` (named/nearest village),
-- but areas have OVERLAPPING geofences, so a listing can sit inside several areas at
-- once. `listing_areas` records the FULL membership set (every area whose geofence
-- contains it); `listings.area_id` stays the primary (one row here, is_primary=true).
-- Same live-content class as `listings`: service-role write, public read, never
-- git-synced. The feed reads membership here instead of the single area_id column,
-- so a listing inside an area you hold is visible even when its primary is one you
-- don't. See docs/SUPABASE_SYNC.md and the HANDOFF for the m2m + origin rationale.
CREATE TABLE IF NOT EXISTS listing_areas (
  rightmove_id  text    NOT NULL,            -- → listings.rightmove_id (logical ref, loose like area_id)
  area_id       text    NOT NULL,            -- → areas.id
  distance_mi   double precision,            -- listing → this area's centroid (mi)
  is_primary    boolean NOT NULL DEFAULT false,  -- mirrors listings.area_id (the named/nearest home area)
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rightmove_id, area_id)
);
CREATE INDEX IF NOT EXISTS idx_listing_areas_area    ON listing_areas (area_id);
CREATE INDEX IF NOT EXISTS idx_listing_areas_listing ON listing_areas (rightmove_id);
ALTER TABLE listing_areas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "listing_areas public read" ON listing_areas;
CREATE POLICY "listing_areas public read" ON listing_areas FOR SELECT USING (true);

-- Atomic membership replace for one listing (delete-then-insert in one txn): a
-- listing's membership set can SHRINK on re-geocode / radius tuning, so a plain
-- upsert would leave stale rows. SECURITY DEFINER → the service-role fetcher writes
-- the whole set atomically. p_rows = json array of { area_id, distance_mi, is_primary }.
CREATE OR REPLACE FUNCTION replace_listing_areas(p_rightmove_id text, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM listing_areas WHERE rightmove_id = p_rightmove_id;
  INSERT INTO listing_areas (rightmove_id, area_id, distance_mi, is_primary)
  SELECT p_rightmove_id,
         (r->>'area_id')::text,
         NULLIF(r->>'distance_mi','')::double precision,
         COALESCE((r->>'is_primary')::boolean, false)
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r
  ON CONFLICT (rightmove_id, area_id) DO UPDATE
    SET distance_mi = EXCLUDED.distance_mi, is_primary = EXCLUDED.is_primary;
END;
$$;

-- Origin areas: a home/commute-anchor area contributes to commute math but is
-- EXCLUDED from listing-feed membership + the fetcher demand set (its catchment is
-- where the household LIVES, not where they want to buy). Household-specific.
ALTER TABLE household_areas ADD COLUMN IF NOT EXISTS is_origin boolean NOT NULL DEFAULT false;

COMMIT;
