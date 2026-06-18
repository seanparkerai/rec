# areas/ — Area reference & lookup

**Domain:** Household-scoped area selection, postcodes.io lookup flow, and canonical area-reference resolution for display across all UI surfaces.

**Naming convention:** `area-*.js` for pure logic (no DOM, no Supabase, no network). `place-lookup.js` for the browser-only networked lookup.

**Entry points & architecture:**
- `area-ref.js` — resolves a household area record to a canonical display object (name, town, live/pending status). The single source of truth; every tile/page must route through `resolveAreaRef()` rather than deriving name/town directly.
- `place-lookup.js` — the add-area flow: user types a place name, queries postcodes.io (free API), returns matches, calls `matchCatalogArea()` to link to an existing catalog area or stub a new household-onboarding record.
- Supporting modules: `area-match.js` (pure: slugify, haversine distance, postcode parsing, match-or-create logic); `area-enrich.js` (pure: postcodes.io record → location patch, fetch-eligibility test).

**Key constraint:** Pure modules (`area-ref.js`, `area-match.js`, `area-enrich.js`) have NO DOM, NO network, NO Supabase — they run in Node tests *and* the browser. `place-lookup.js` is browser-only (async fetch to postcodes.io).

**Live file list:** `find assets/js/areas -name '*.js' | sort`

See docs/REPO_MAP.md for the whole-repo map.
