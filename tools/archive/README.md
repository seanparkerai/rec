# tools/archive/ — retired one-shot scripts

Superseded or single-run data-prep scripts, kept for provenance. **Nothing in a live
code path imports or invokes these** — they were verified (REFACTOR P3, 2026-06) to be
referenced only by `docs/CHECKLIST.md` history. Their effects are already baked into the
committed `data/areas/*.json`, so they exist here as a record, not a dependency.

| Script | What it did | Why archived |
|--------|-------------|--------------|
| `enrich-batch-01.mjs` | First research batch — enriched 4 villages with place-specific content + sources (CLAUDE.md §7). Idempotent, keyed by id. | One-shot; its output is committed. |
| `apply-accurate-coords.mjs` | Replaced postcode-outward approximations with village-centre coordinates (±50–200 m) across the area set. | Superseded by the geocoding workflow (`geocode-areas.mjs` + `verify-area-coords.mjs`); one-shot. |
| `geocode-per-area.mjs` | Per-area Nominatim geocoder writing `data/areas/<id>.json`, with a resumable cache. | Superseded by the canonical `tools/geocode-areas.mjs` (still live — `assets/js/page-map.js` points users to it). |

**Not archived** (still referenced by live code, intentionally kept in `tools/`):
`geocode-areas.mjs` (referenced by `assets/js/page-map.js`) and `migrate-areas.mjs`
(referenced by `tools/area-status.mjs`).
