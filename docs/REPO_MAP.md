# REPO_MAP.md — whole-repo orientation

> One place to get your bearings fast. The **rules** live in `CLAUDE.md`; the **visual
> contract** in `DESIGN.md`; this file is the *map*. Directory contents change — so this
> map describes **purpose and conventions**, not file lists. For the live list of any
> folder, run `find <folder> -name '*.js'` (or `*.css`, `*.mjs`).

## Top-level layout

| Path | Purpose |
|------|---------|
| `CLAUDE.md` | Operating rules for AI-assisted work here. Read at session start. |
| `DESIGN.md` | The visual/interaction contract (tokens, anchors, bans, responsive doctrine). |
| `index.html`, `pages/` | The site: `index.html` is the dashboard; `pages/*.html` are the other screens. |
| `components/` | Shared HTML partials (header/nav/footer) fetch-injected into every page. |
| `assets/js/` | Vanilla-JS module layer — utilities, `page-*` coordinators, feature subtrees. |
| `assets/css/` | CSS architecture — tokens + base, component partials, page partials. |
| `assets/fonts/`, `assets/img/` | Self-hosted woff2 subsets; downloaded openly-licensed imagery. |
| `data/` | Content + data layer (areas index + per-area files, schema, fixtures, snapshots, source). |
| `tools/` | Node `.mjs` scripts — build, sync, fetch, test harness. See `tools/README.md`. |
| `tests/` | Pure-JS test harness — `*.test.js`, run by `tools/run-all-tests.mjs`. |
| `supabase/` | Backend — schema (reference), edge functions (`functions/ask`). MCP is canonical. |
| `docs/` | Live operating docs (this file, sync contract, data model, engine guides). Index: `docs/README.md`. |
| `.claude/` | Claude Code config — skills (resume/sync-check/area-research) + settings. |
| `.github/workflows/` | CI / deploy / scheduled fetch pipelines (guard-railed). |

## Naming conventions

- **`page-<name>.js`** — one thin coordinator per HTML page (e.g. `page-finances.js` ↔ `pages/finances.html`).
- **Prefix families** signal role: `tile-*` (dashboard cards), `section-*` (finances-page sections),
  `calc-*` (pure finance calculators), `characterization-*` (regression-baseline tests).
- **Inside a feature subfolder, modules use bare names** (`storage/listings.js`, `ask/compose.js`):
  the directory supplies the context, so no redundant prefix. Each substantial subfolder has its own
  `README.md` describing its domain. (Outreach folded into Ask Compose — `assets/js/ask/{compose,messages}.js`
  over the read-only `get_outreach_brief`; the old `assets/js/outreach/` grid modules were retired.)
- **CSS** mirrors the JS domains: `assets/css/pages/<page>.css`, `assets/css/components/<thing>.css`,
  `assets/css/dashboard/tile-*.css`. All colour/spacing/radius values come from `tokens.css`.

## File-size norm (the split-with-a-shim rule)

The house norm is **focused modules of roughly ≤400 lines**. When a module outgrows that, split it
into a subfolder of single-purpose modules behind a **thin re-export shim** that keeps the public
import path unchanged — the established pattern for `assets/js/storage.js` (→ `storage/*.js`) and
`assets/js/finances.js` (→ `finances/calc-*.js`). Page coordinators follow the same rule: a large
`page-<name>.js` may own a `page-<name>/` subfolder with the coordinator left thin.

Generated/aggregated data files (`data/areas.json`, `data/snapshots/areas.json`,
`data/source/area-coord-verification.json`) are intentionally large — they are regenerated, never
hand-split.

## Guard rails

Some files are **only touched as their own named, approved phase** — never as incidental feature
work. The authoritative list is **`CLAUDE.md` §16** (tokens.css, base.css, dashboard.css, config.js,
data-loader.js, the `storage.js`/`finances.js` shims + their modules, `area.schema.json`,
`.github/workflows/*`). Check there before editing anything in that set.

## Where to start

- New session / "where were we" → `docs/CHECKLIST.md` (the resume point) via the `resume` skill.
- A specific feature → that subtree's `README.md`, then the relevant module header.
- A tool to run → `tools/README.md`.
- Data shapes → `docs/DATA_MODEL.md`; sync rules → `docs/SUPABASE_SYNC.md`.
