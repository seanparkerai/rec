# rec — First-Time Buyer Property Dashboard (Hampshire & Wiltshire)

A clean, modern, single-source web dashboard for organising a **first-time house purchase** in and around
**Hampshire and Wiltshire, UK**. It holds a buyer profile, search criteria, an areas directory with
research-backed town/village profiles, characteristic house-types, a savings/finances tracker, and an
interactive map of search areas.

It is a **zero-build static web app** (plain HTML/CSS/JS, libraries via CDN) that stores content as
editable JSON in the repo, with user state persisted to Supabase via the MCP-backed storage layer.

## v3 — visuals + page re-prioritisation

The v3 cycle adds the visual surfaces that turn the v2 intelligence engine into
something you read at a glance. Eleven new visualisations across the dashboard and
finances page, each paired with a caption-as-answer (DESIGN.md §5 rule 4):

- **Savings over time** on the dashboard (sparkline) and finances page (full Chart.js
  line) — actual cumulative balance plotted against the engine baseline and the £40k
  target hairline.
- **Trading 212 ISA performance suite** on the finances page — monthly deposits, ISA
  stacked area (contributions vs dividends vs interest vs market growth), cumulative
  dividends + interest, strategy-epoch comparison, ticker exposure treemap, realised
  vs unrealised P&L. All stub-safe: when the T212 importer hasn't been run, every
  visual degrades to a single explanatory placeholder.
- **Dashboard re-ranked** by decision value × visual density per pixel — scenario fan,
  net-worth donut, withdrawal-readiness seasoning bar, and an in-tile savings
  sparkline join the existing tiles; shortlist/criteria/ask move to a foot context strip.
- **Finances Now stage** re-ordered so the savings trajectory chart sits below the
  hero. **Later stage** leads with the affordability widget; deposit-at-risk upgraded
  from a text scenarios table to a 3-step waterfall (current → −10% → −20%) labelled
  with months-of-savings-lost.
- **Profile** page promotes "Things to check" to rank 2 — actions before known data.
- **Supabase contract** (CLAUDE.md §18) extended: `storage.js` gains `getGoals`,
  `getReadinessChecklist`, `saveReadinessItem`, `getInvestmentsHistory`. Four v3
  tables (`goals`, `readiness_checklist`, `investments_accounts`,
  `investments_history`) are backfilled via the Supabase MCP connector.

See `docs/archive/PROGRESS-2026-05-26.md` for the phase-by-phase delivery log.

## v2 — visual-first overhaul + intelligence engine

The v2 cycle (`docs/PLAN.md`) shipped a calm-precise-editorial redesign plus a small **intelligence
engine** that powers every affordability surface from one source of truth:

- **Affordability verdict** (`assets/js/affordability.js`) — given a price + finances + criteria, returns
  a comfortable / stretch / tight / out-of-reach band plus the loan, LTV (with tier), SDLT, LISA
  eligibility, monthly P&I (contract + stressed), and post-move spare cash. Rules calibrated and
  documented in `docs/INTELLIGENCE_RULES.md`.
- **Money-flow** (`assets/js/money-flow.js`) and **savings-velocity** (`assets/js/savings-velocity.js`)
  expose the shapes consumed by the dashboard, finances and area-detail pages.
- **Dashboard** is a 7-tile bento: deposit story (with scenario chips) · affordability ladder · today-vs-
  after-move money-flow · shortlist with fit dots · journey track · criteria-as-prose · ask placeholder.
- **Finances page** replaced four siloed calculator fieldsets with one **unified affordability widget**
  (slider → mono grid → colour-banded verdict pill) plus a "What if…" projection chart.
- **Areas page** rows gain a fit dot, bed-fit chip and council-tax band column (all sortable + filterable).
- **Area-detail** gets a verdict strip across the top, Ofsted dots on schools, coloured commute bands
  on transport, and a foot mini-affordability widget bound to the same engine.
- **v3 Outreach generator** ships at `pages/outreach.html` — 24 researched best-practice email templates
  for every party in a UK property purchase. Drafts are pre-filled from profile / finances / area data,
  filtered by the Quantity-of-Information Ladder (only the right depth for each recipient), and sent via
  `mailto:` or copied to clipboard. Outreach log + contacts directory persist via Supabase. Deep-linked
  from area-detail, finances, and journey checklist rows.
- **v3 placeholders** remain at `pages/listings.html` and `pages/ask.html`. See `docs/ROADMAP.md`.

Run `node tools/run-intelligence-tests.mjs` for the unified test harness (174+ assertions covering
affordability bands, money-flow sums, savings-velocity, savings series, deposit risk, investment
performance, outreach template schema, renderer + QoI leak guard, Supabase sync state, and
computation-pipeline characterization baselines). Browser-side smoke checks (no horizontal scroll, no inline styles, page
reachability) run via `tests/tests.html` against a local server when you want them; visual review is done
by eye in the browser.

## Supabase MCP sync contract

The app uses Supabase for all stateful data and Claude is wired to Supabase via the MCP connector.
The full bidirectional sync contract — what lives in the database vs the repo, how user-portal edits
and Claude edits stay aligned, and the mandatory MCP-first session start — lives in
**[`docs/SUPABASE_SYNC.md`](docs/SUPABASE_SYNC.md)** (operational detail) and **`CLAUDE.md` §18**
(rules of engagement). TL;DR:

- **User state** (profile, criteria, finances, shortlist, zones, journey, contacts, outreach) →
  Supabase is canonical; the portal writes via `storage.js`, Claude writes via MCP `execute_sql`.
- **Content** (areas, house-types, checklists, outreach-templates) → repo JSON is canonical, mirrored
  to Supabase tables for query access.
- **Every Claude session** opens by polling `MAX(updated_at)` across all tables to detect portal
  edits that happened while Claude was away, and closes by verifying every write landed.

## ✨ View live site

**Live:** https://seanparkerai.github.io/rec/

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
**Supabase** (Postgres + Auth) behind a storage abstraction · `localStorage` write-through cache for instant renders. No build step.

## Supabase backend

The app now uses **Supabase** for cloud-synced, multi-device data storage and login. All user data (profile, criteria, finances, shortlist, map zones, journey checks) is stored in a private Supabase Postgres database, protected by Row Level Security so only authenticated household members can access it.

To set up Supabase for the first time, follow the interactive guide at **[`pages/setup.html`](pages/setup.html)** — it walks through account creation, schema deployment, user management, and data migration in five phases.

The Supabase schema lives in [`supabase/schema.sql`](supabase/schema.sql). The only files that talk to Supabase directly are `assets/js/storage.js` (data) and `assets/js/auth-guard.js` (sessions).

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
| `rec:contacts`       | `pages/outreach.html`                  | `{ agents:[], brokers:[], solicitors:[], surveyors:[] }` |
| `rec:outreach`       | `pages/outreach.html`                  | Array of outreach log entries          |
| `rec:theme`          | global (header toggle)                 | `"light" \| "dark"` (override)         |

Phase 9 didn't add any new keys — the about-search.html merge (Phase 9A) preserved
`rec:profile` and `rec:criteria` verbatim, and old `pages/profile.html` /
`pages/criteria.html` URLs continue to resolve as `<meta refresh>` redirects to the
relevant `#about` / `#search` anchor on the merged page.
