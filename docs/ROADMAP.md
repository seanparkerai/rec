# v3 Roadmap

v2 covered the visual-first overhaul of seven existing pages plus an intelligence engine
(affordability, money-flow, savings-velocity). Three v3 capabilities were scaffolded in v2 as
placeholder pages. Two have shipped; one remains.

---

## Shipped in v3.0

### Outreach generator — `pages/outreach.html`

**Shipped.** 24 researched best-practice email templates covering every party a UK FTB engages with during a purchase — estate agents, mortgage brokers, solicitors, surveyors, vendors, removals, insurers, and local authorities.

- Templates are data (`data/outreach-templates.json`), not code — editable without touching JS.
- Pure renderer (`assets/js/outreach-renderer.js`) substitutes `{{path}}` placeholders and evaluates `{{#if}}` blocks.
- The Quantity-of-Information Ladder (`filterContextByDataNeeded`) ensures each template only shares the data appropriate for its recipient.
- `mailto:` and clipboard copy; falls back to clipboard when the URL exceeds 1800 chars.
- Outreach log persists via `storage.js`; Supabase `contacts` and `outreach` tables added.
- Contacts CRUD (agents / brokers / solicitors / surveyors) in a collapsible directory.
- Deep-linked from area-detail verdict strip (A1), finances affordability widget (A5), and seven journey checklist rows.

### Live listings + self-learning feed — `pages/listings.html`

**Shipped** (v3 L0–L6 + convergence P1–P7 + the Model Refinement Engine). A live Rightmove feed
(Apify actor → `tools/fetch-listings.mjs` → Supabase `listings`) filtered by a single baseline gate,
ranked by an explainable fit score from the v2 affordability engine, with an append-only reaction
log (`listing_reactions`), distilled learned preferences (base-rate calibrated · recency-decayed ·
reason-attributed), feed suppression/dedup, a per-listing dossier page (`pages/property.html`), and
a statistics-gated refinement engine that *proposes* stopping areas/types (notify-only, reversible).
Operating guide: `docs/REFINEMENT_README.md`; build record: `docs/archive/V3_LISTINGS_PLAN.md` +
`docs/archive/REFINEMENT_PLAN.md`.

---

## Still to come

### Ask — `pages/ask.html`

**Goal.** A natural-language interface over the whole dataset — e.g. *"show me the most affordable shortlisted areas with an outstanding primary school"*.

**What it does**
- Parses NL queries into structured filters over the criteria, the areas index, and listings.
- Returns ranked results with the same fit-dot vocabulary used everywhere else in the app.
- Suggestion-chip examples on the empty state replicate common queries.

**Data it needs**
- An LLM. Candidates: Claude API via a small server-side worker, or in-browser via a hosted endpoint.
- A schema-aware prompt that knows the data model (`docs/CONTEXT.md`, `data/schema/*`, the per-area files).

**v2 surface it slots into**
- Placeholder page at `pages/ask.html` (Phase 5). The dashboard's ask-anything tile (Phase 3, tile 8) links here.

---

## What's deliberately not on this roadmap

- A native mobile wrapper. The web app is already built mobile-first (DESIGN.md §6).
- A second visual direction. The Stripe-docs / Linear-dense anchors are the contract; new features
  must inherit, not introduce a third.

*(The "backend / auth layer is a v4 concern" note from the original v3 plan is obsolete — Supabase
auth + RLS shipped in Phase 10 and is the live backend; see CLAUDE.md §17–§18.)*
