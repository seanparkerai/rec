# v3 Roadmap

v2 covered the visual-first overhaul of seven existing pages plus an intelligence engine
(affordability, money-flow, savings-velocity). Three v3 capabilities were scaffolded in v2 as
placeholder pages. All three have now shipped.

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

### Ask — `pages/ask.html`

**Shipped** (natural-language assistant). A signed-in household member asks plain-English questions
about finances, budget, saved homes, live listings, areas, trends, and outreach drafting; answers are
produced by Claude (Anthropic API) from a **Supabase Edge Function** (`supabase/functions/ask/`) that
holds the API key as a secret, verifies the user's JWT, gives Claude **read-only, RLS-scoped tools**
over the household's own data, runs the tool-use loop, and **streams** the answer back over SSE.
The browser renders the streamed markdown (escape-first sanitiser) and persists each thread to the
`ask_conversations` table. No Anthropic key ever reaches the browser. Default model
`claude-sonnet-4-6`. Operating guide: `docs/ASK.md`.

---

## Still to come

*(Nothing outstanding from the original v3 placeholder set — Outreach, Listings, and Ask have all
shipped.)*

---

## What's deliberately not on this roadmap

- A native mobile wrapper. The web app is already built mobile-first (DESIGN.md §6).
- A second visual direction. The Stripe-docs / Linear-dense anchors are the contract; new features
  must inherit, not introduce a third.

*(The "backend / auth layer is a v4 concern" note from the original v3 plan is obsolete — Supabase
auth + RLS shipped in Phase 10 and is the live backend; see CLAUDE.md §17–§18.)*
