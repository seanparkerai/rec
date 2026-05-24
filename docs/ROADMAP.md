# v3 Roadmap

v2 covers the visual-first overhaul of seven existing pages plus an intelligence engine (affordability, money-flow, savings-velocity). Three v3 capabilities are scaffolded in v2 as placeholder pages but not built — they need data sources or LLM infrastructure that don't belong in a zero-build static site without explicit design work. This file describes what each becomes, what data it needs, and which v2 surface it slots into.

---

## Live listings — `pages/listings.html`

**Goal.** Replace manual area research with live property listings filtered to the user's criteria and ranked by affordability fit.

**What it does**
- Pulls open listings (sale + lettings) for the user's shortlisted areas.
- Ranks each listing with a fit dot from the v2 affordability engine (`assessAffordability(listing.price, finances, criteria)`).
- Shows price history, council-tax band, LISA eligibility inline on each listing row.
- "Saved" listings persist via `assets/js/storage.js`; deltas (price drops, new matches against the user's criteria) trigger an in-app badge.

**Data it needs**
- A listings feed. Candidates: Rightmove via Apify, Zoopla developer API, OnTheMarket public RSS, Land Registry price-paid for historical baselines.
- Per-listing geolocation to match against shortlisted area polygons.
- A daily-refresh job (out of scope for a zero-build static site — likely a small fetch worker behind a JSON cache).

**v2 surface it slots into**
- Placeholder page at `pages/listings.html` (Phase 5). Nav already carries `Listings (soon)`.
- The dashboard's shortlist tile will gain a "new listings since last visit" indicator once the feed is wired up.

---

## Outreach — `pages/outreach.html`

**Goal.** Turn viewings, broker intros, and follow-ups into one-click email drafts pre-filled with the user's profile and the listing or area context.

**What it does**
- Three templates: viewing request, mortgage broker intro, post-viewing follow-up.
- `mailto:` drafts (or copy-to-clipboard if `mailto:` is unavailable) pre-filled from `data/profile.json` and the chosen listing or area.
- Tracks status per outreach (drafted / sent / replied) via `storage.js`.

**Data it needs**
- Estate agent and broker contacts. Optional: a curated `data/contacts.json`.
- Listing context for the subject line — depends on **Live listings** being in first.

**v2 surface it slots into**
- Placeholder page at `pages/outreach.html` (Phase 5). Nav carries `Outreach (soon)`.

---

## Ask — `pages/ask.html`

**Goal.** A natural-language interface over the whole dataset — *"chain-free 3-beds near Winchester under £400k"*, *"show me the most affordable shortlisted areas with an outstanding primary school"*.

**What it does**
- Parses NL queries into structured filters over `criteria.json`, the areas index, and listings.
- Returns ranked results with the same fit-dot vocabulary used everywhere else in the app.
- Suggestion-chip examples on the empty state replicate common queries.

**Data it needs**
- An LLM. Candidates: Claude API via a small server-side worker, or in-browser via a hosted endpoint.
- A schema-aware prompt that knows the data model (`docs/CONTEXT.md`, `data/schema/*`, the per-area files).

**v2 surface it slots into**
- Placeholder page at `pages/ask.html` (Phase 5). The dashboard's ask-anything tile (Phase 3, tile 8) links here.

---

## What's deliberately not on this roadmap

- A backend / auth layer. The migration target is a single login + remote storage; that's a v4 concern, not v3.
- A native mobile wrapper. The web app should already be a 5-star mobile experience by the end of v2.
- A second visual direction. The Stripe-docs / Linear-dense anchors are the contract; v3 features must inherit, not introduce a third.
