# rec — First-Time Buyer Property Dashboard (Hampshire & Wiltshire)

A clean, modern, single-source web dashboard for organising a **first-time house purchase** in and around
**Hampshire and Wiltshire, UK**. It holds a buyer profile, search criteria, an areas directory with
research-backed town/village profiles, characteristic house-types, a savings/finances tracker, and an
interactive map of search areas.

It is a **zero-build static web app** (plain HTML/CSS/JS, libraries via CDN) that stores content as
editable JSON in the repo. Designed so a future login + web-server backend is a swap, not a rewrite.

## Run it locally

The app loads shared headers and JSON via `fetch()`, so it must be served over **HTTP** (opening the HTML
file directly won't work). From the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Live site (GitHub Pages)

The site auto-deploys from `main` via `.github/workflows/pages.yml`.

**One-time setup (you must do this once):** in the GitHub repo go to
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

Live URL: `https://lukeclifforduk.github.io/rec/`

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
`rec:profile`, `rec:criteria`, `rec:finances`, `rec:shortlist`, `rec:zones`, `rec:journey-checks`,
`rec:theme`.
