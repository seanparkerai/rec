# JavaScript Module Layer — Vanilla ES Modules

Flat utilities and feature subtrees. ~400-LOC single-responsibility norm. Zero framework, no
build step. Guard-railed modules (storage.js, finances.js, config.js, data-loader.js per
CLAUDE.md §16) are split-behind-shims and never rewritten.

## Root-Level Utilities

- **`page-*.js`** — one coordinator per HTML page; assembles data + calls tile/section renderers.
- **`config.js`** (guard-railed) — base-URL + `url()` helpers.
- **`data-loader.js`** (guard-railed) — JSON loader.
- **`storage.js`** (guard-railed, REFACTOR P8) — re-export shim over `storage/{core,user-state,
  listings,outreach,refinement,ask}.js`; Supabase + localStorage write-through layer.
- **`finances.js`** (guard-railed, REFACTOR P9) — re-export shim over `finances/calc-*`.
- **`auth-guard.js`** — Supabase session guard on every page load.
- Other utilities: `css-vars.js`, `dom.js`, `affordability.js`, `deposit-risk.js`, `finance-derive.js`,
  `flow-constants.js`, `money-flow.js`, etc.

## Feature Subtrees

Each subdirectory owns a feature domain; see the folder's README.md:

- **`dashboard/`** — tile modules for home page.
- **`finances/`** — section renderers + calculators for finances page.
- **`areas/`**, **`listings/`**, **`refinement/`**, **`outreach/`**, **`criteria/`**, **`ask/`** —
  domain-specific renderers and utilities.

For the live file structure, run `find assets/js -name '*.js' | sort` and `find assets/js -name
'README.md'` for per-folder documentation.

See docs/REPO_MAP.md for the whole-repo map.
