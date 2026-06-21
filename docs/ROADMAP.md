# v3 Roadmap

v2 covered the visual-first overhaul of seven existing pages plus an intelligence engine
(affordability, money-flow, savings-velocity). Three v3 capabilities were scaffolded in v2 as
placeholder pages. All three have now shipped.

---

## Shipped in v3.0

### Outreach Compose — inside Ask

**Shipped.** Outreach is a guided, LLM-authored **Compose** experience inside Ask (the original rigid
template-grid page, `pages/outreach.html`, was retired). The user picks who they're writing to and the
situation (with a free-text escape hatch for the long tail); the assistant pulls the right household
facts automatically, drafts a genuinely good email for that exact situation, and lets them refine it,
then copy / open-in-mail / save-to-log.

- The 24 researched templates (`data/outreach-templates.json`) survive as the model's **grounding
  corpus + style exemplars**, surfaced via `get_outreach_templates` / `get_outreach_brief` — not a
  fill engine.
- **Draft-only / human-in-the-loop:** the Edge Function is read-only; the human commits every send and
  save via `storage.js`. **No invented figures.**
- The **information ladder** (privacy) is enforced server-side in `pure.js` — agents/vendors never see
  salary, savings, deposit total, credit, or debts; the mortgage broker gets the full picture.
- Editable draft card: Copy / Open in mail (`buildMailto`, clipboard fallback >1800 chars) / Save to
  log + refine chips. Outreach log + contacts (Supabase `outreach` / `contacts`) live in the Ask
  "Messages" dialog.
- Deep-linked from the area-detail verdict strip, the finances affordability widget, and journey
  checklist rows. Full design: `docs/ASK.md` §4.

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
`claude-haiku-4-5` for data Q&A; Compose (outreach authoring) turns route to `claude-sonnet-4-6`.
Operating guide: `docs/ASK.md`.

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
