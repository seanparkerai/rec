# Content + Data Layer — JSON, Snapshots, Schemas

Repo-committed content (areas, house types, checklists, outreach templates) + sync snapshots and
coordination. **User-state lives exclusively in Supabase**, never here.

## Structure

- **`areas.json`** — generated lightweight index (id, name, town, postcode). Rebuilt by
  `tools/build-areas.mjs` from `source/villages.csv` + per-area files.
- **`areas/<id>.json`** — per-area materialised views (DB-canonical per CLAUDE.md §2). Full
  records (overview, character, schools, prices, coords, sources). Write via Supabase MCP →
  `sync-areas-from-supabase.mjs` → `build-areas.mjs` → commit (never hand-edit).
- **`house-types.json`** — property-type reference data; mirrored to Supabase `house_types` table.
- **`checklists.json`**, **`outreach-templates.json`** — repo-JSON-only (no mirror table); sourced
  by pages and never edited via dashboard.
- **`schema/`** — JSON Schema validators (`area.schema.json`, `outreach-template.schema.json`).
- **`source/`** — coordinate truth tables: `villages.csv` (id, name, town, county, postcode);
  `area-coord-verification.json` (coord checks); `postcode-regions.csv` (UK postcode lookup).
- **`snapshots/`** — sync high-water marks (`sync-state.json`) + parity snapshot (`areas.json`).
  Maintained by `tools/sync-areas-from-supabase.mjs` and verified by `tests/areas-db-repo-parity.test.js`.
- **`fixtures/`** — redacted synthetic sample data for tests/fresh-install (see `fixtures/README.md`).

## Data Classification

- **User state** (profile, finances, criteria, goals, contacts, investments, journey, readiness,
  reactions, area confirmations): **Supabase only**, fetched via `assets/js/storage.js`.
- **Content** (`areas`, `house_types`): DB-canonical; repo files are materialised views.
- **Repo-only content** (`checklists`, `outreach-templates`): JSON files, no mirror.

For the live file inventory, run `find data -name '*.json' | sort`.

See docs/REPO_MAP.md for the whole-repo map.
