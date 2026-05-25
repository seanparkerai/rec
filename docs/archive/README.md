# docs/archive/

Historical / superseded documents kept for provenance.

- `Areadetails.md` — original research drafts for ~30 areas, written as fenced
  ```json``` blocks. Superseded by the per-area JSON files at
  `data/areas/<id>.json`. Migration was performed by `tools/migrate-areas.mjs`
  on the cut-over commit; this file is retained only as the original-source
  audit trail. Do **not** add new area content here — write directly to the
  matching `data/areas/<id>.json`.
