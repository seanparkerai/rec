# rec — First-Time Buyer Property Dashboard (Hampshire & Wiltshire)

A clean, modern, single-source web dashboard for organising a **first-time house purchase** in and around
**Hampshire and Wiltshire, UK**. It holds a buyer profile, search criteria, an areas directory with
research-backed town/village profiles, characteristic house-types, a savings/finances tracker, and an
interactive map of search areas.

It is a **zero-build static web app** (plain HTML/CSS/JS, libraries via CDN) that stores content as
editable JSON in the repo. Designed so a future login + web-server backend is a swap, not a rewrite.

## ✨ View live site

**Live:** https://lukeclifforduk.github.io/rec/

The site auto-deploys from `main` via GitHub Actions.

## Run it locally

The app loads shared headers and JSON via `fetch()`, so it must be served over **HTTP** (opening the HTML
file directly won't work). From the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Tests

Open `http://localhost:8000/tests/tests.html` in a browser — it runs schema, calculator and smoke checks
and shows pass/fail. Run it before each commit.

## Project docs

- `docs/PLAN.md` — the master development plan.
- `docs/CONTEXT.md` — research context (UK buying process, tech choices, regional info).
- `docs/CHECKLIST.md` — live, granular progress tracker.
- `docs/AREAS.md` — master list of towns/villages.
- `docs/USER_PROFILE.md` — narrative buyer profile.
- `CLAUDE.md` — operating rules for AI-assisted development.

## Tech

Pico CSS + design tokens · vanilla-JS fetch-injected partials · Chart.js · Leaflet + Leaflet-Geoman ·
JSON + `localStorage` behind a storage abstraction. No build step.

## Storage abstraction → backend migration path

Every page reads and writes user state through one module: `assets/js/storage.js`. The current
implementation overlays user edits from `localStorage` on top of the JSON shipped in `data/`. The
public API is intentionally async even when it doesn't need to be, so the swap to a real backend is
mechanical:

```js
// today
export async function getProfile()    { return readLocal('profile')   ?? await loadJSON('profile'); }
export function       saveProfile(d)  { return writeLocal('profile', d); }

// tomorrow (one-module swap; no page changes)
export async function getProfile()    { return await fetch('/api/profile').then((r) => r.json()); }
export async function saveProfile(d)  { return await fetch('/api/profile', { method: 'PUT', body: JSON.stringify(d) }); }
```

For multi-user: namespace endpoints by user id (`/api/users/:id/profile`). For optimistic UI: keep
the localStorage layer as a write-through cache — `getProfile()` returns the cached value
immediately, then revalidates from the server in the background. Pages remain untouched; only
`storage.js` and `data-loader.js` change.

`localStorage` namespace is `rec:*` (see `STORAGE_NS` in `assets/js/config.js`). Keys currently used:

| Key                  | Owner                                  | Shape                                  |
| -------------------- | -------------------------------------- | -------------------------------------- |
| `rec:profile`        | `pages/about-search.html` (§#about)    | Profile object overlay                 |
| `rec:criteria`       | `pages/about-search.html` (§#search)   | Criteria object overlay                |
| `rec:finances`       | `pages/finances.html`                  | Finances object overlay                |
| `rec:shortlist`      | `pages/areas.html` + map               | Array of area ids                      |
| `rec:zones`          | `pages/map.html`                       | GeoJSON FeatureCollection (drawn zones)|
| `rec:journey-checks` | `pages/journey.html`                   | `{ viewing:{}, process:{}, moving:{} }`|
| `rec:theme`          | global (header toggle)                 | `"light" \| "dark"` (override)         |

Phase 9 didn't add any new keys — the about-search.html merge (Phase 9A) preserved
`rec:profile` and `rec:criteria` verbatim, and old `pages/profile.html` /
`pages/criteria.html` URLs continue to resolve as `<meta refresh>` redirects to the
relevant `#about` / `#search` anchor on the merged page.
