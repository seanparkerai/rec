# rec — Property Search Dashboard (Hampshire & Wiltshire)

A clean, single-source web dashboard for organising a **house purchase** in and around
**Hampshire and Wiltshire, UK**. It brings a buyer profile, an areas directory with research-backed
town/village profiles, characteristic house-types, a savings/affordability view, an interactive
map of search areas, and a **live property-listings feed that learns your taste** together in one
calm, readable place.

It is a **zero-build static web app** (plain HTML/CSS/JS, libraries via CDN). Editable **content**
(areas, house-types, templates) is JSON in the repo; all **personal/user state** lives only in a
private, access-controlled Supabase database — never committed to the repo.

## ✨ View live site

**Live:** https://georgianrectory.com — auto-deploys from `main` via GitHub Actions
(custom domain set by `CNAME`; this is also the origin the Ask edge function's CORS
allow-list expects, see `supabase/functions/_shared/cors.ts`).

## Run it locally

The app loads shared partials and JSON via `fetch()`, so it must be served over **HTTP** (opening the
HTML file directly won't work). From the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Tests

`node tools/run-all-tests.mjs` runs the unified test harness. Browser-side smoke checks
(no horizontal scroll, no inline styles, page reachability) live at
`http://localhost:8000/tests/tests.html`. Run before each commit.

## Tech

Pico CSS + design tokens · vanilla-JS fetch-injected partials · Chart.js · Leaflet + Leaflet-Geoman ·
**Supabase** (Postgres + Auth) behind a `storage.js` abstraction · `localStorage` write-through cache
for instant renders. No build step.

## Data & privacy

- **Content** (areas, house-types, checklists, outreach templates) → editable JSON in the repo, the
  canonical source, mirrored to Supabase for query access.
- **User state** (buyer profile, preferences, savings, shortlist, map zones, journey, contacts) →
  stored **only** in a private Supabase Postgres database, protected by Row Level Security so only
  authenticated household members can read it. It is **never** stored in the repo.

First-time Supabase setup is documented in [`supabase/README.md`](supabase/README.md). The schema lives in
[`supabase/schema.sql`](supabase/schema.sql); only `assets/js/storage.js` (data) and
`assets/js/auth-guard.js` (sessions) talk to Supabase directly. New users enter their details directly on
[`pages/profile.html`](pages/profile.html) — every field is editable inline, guided by a first-run prompt
until real data exists.

## 🧠 Self-learning feed

The Live Listings feed sharpens the more you use it. Every reaction you give a property —
**like**, **pass** or **reject**, each with optional structured reasons (*wrong area*,
*great value*, *no parking*, …) — is appended to an **immutable reaction log**
(`listing_reactions`, append-only), so the record of *why* a home worked for you or didn't is
never overwritten.

From that log the app distils a **signal → weight** map (`learned_preferences`) that is:

- **Base-rate calibrated** — a signal only earns weight if it actually *discriminates* within the
  homes you've been shown, so the model never just re-learns your stated criteria.
- **Recency-decayed** — older reactions fade (a half-life), so your taste is allowed to move.
- **Reason-attributed** — a reject tagged *“wrong area”* sharpens the location signal and barely
  touches bed-count or price, instead of blaming every feature equally.
- **Traceable & honest** — every weight records the exact reactions that produced it, and
  cold-start / balance handling means a one-sided feed reads as *“needs more likes”* rather than
  false confidence.

Those weights then **re-rank** the feed best-fit-first, seed a diversified **cold-start deck**
before there is enough data, and **narrow the next (paid) listings fetch** so the search pulls
fewer, better homes. Manual or AI **overrides** can pin a weight, and any conflict between what you
said and what the data shows is surfaced as a recommendation — never resolved silently. The logic
is pure and unit-tested in [`assets/js/learned-preferences.js`](assets/js/learned-preferences.js)
(scored by [`assets/js/listings/fit.js`](assets/js/listings/fit.js)); the learned state lives only in
Supabase, recomputed from the reaction log.

## Project docs

Full index of live docs: [`docs/README.md`](docs/README.md). Highlights:

- `docs/ROADMAP.md` — what has shipped and what remains.
- `docs/CHECKLIST.md` — live progress tracker.
- `docs/CONTEXT.md` — research context (UK buying process, tech choices, regional info).
- `docs/AREAS.md` — master list of towns/villages.
- `CLAUDE.md` — operating rules for AI-assisted development.
