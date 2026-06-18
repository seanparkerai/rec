# Dashboard Tiles

Home-dashboard tile modules — self-contained presentation components that render individual
dashboard cards. Each `tile-*.js` module exports render functions (typically `render<TileName>()`)
called by `page-home.js` to populate the dashboard layout.

## Pattern

Tiles are **presentation-only**: they accept pre-computed data (finances, criteria, profile,
etc.) and shape it into DOM. Business logic lives in sibling compute modules: affordability
assessments in `../affordability.js`, money-flow calculations in `../money-flow.js`, savings
projections in `../savings-velocity.js`, and so on.

Tiles may fetch Supabase data (e.g. goals, investments, readiness checklist) via the
`../storage.js` layer, but they do not own business logic or validation.

## Contents

Run `find assets/js/dashboard -name '*.js'` for the live list of tile modules.

See `docs/REPO_MAP.md` for the whole-repo map.
