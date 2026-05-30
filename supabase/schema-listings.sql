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
  description      text,
  first_seen       timestamptz NOT NULL DEFAULT now(),
  last_seen        timestamptz NOT NULL DEFAULT now(),
  added_date       date,                          -- source's "added/reduced" date
  update_reason    text,                          -- source listingUpdateReason: new/reduced/...
  price_history    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{price, seen_at}]
  raw_json         jsonb NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

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

COMMIT;
