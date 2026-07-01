# Mandate — Session Mandate · TOP PRIORITY DIRECTIVE · how to use this plan · the product

> Split from `fable_refactor.md` (2026-07-01, content unchanged). Directory: [`plan/README.md`](README.md).

# fable_refactor.md — The Master Refactor & Overhaul Plan

> **Audience:** Fable (claude-fable-5), operating as the lead engineer and chief architect on a
> complete, top-to-bottom re-architecture of the **rec** portal — a zero-build static web app that
> helps a UK first-time buyer find, finance, and act on a home in Hampshire & Wiltshire.
>
> **Status of this file:** This is the *foundation*, authored by Opus 4.8 (2026-06-16) and expanded
> the same day into this comprehensive edition. It is a living document. Fable's **first job** is to
> **enter Plan Mode** (see the Session Mandate immediately below), ingest this file whole, perform the
> §2 scan, run the §7 Q&A intake, and then — still in Plan Mode — **rewrite this plan top to bottom**
> into the final, exhaustive, step-by-step program, which it presents for the owner's approval before
> a single line of the product is touched. Nothing below is frozen until that intake is done —
> including the guard rails and the tests, both of which Fable now has explicit authority to redesign
> (§4, §5).
>
> **Prime directive — a new standard, not a polish pass.** The current system is good: feature-
> complete, modular, tested. That is the *floor*, not the ceiling. The brief is to lift every
> surface, every mechanism, every line of logic and every pixel of design to a **new standard
> entirely** — the standard a senior team would set if they rebuilt this from first principles
> today, with the benefit of everything already learned here. Improve relentlessly; regress nothing.
> This is an *overhaul of a living product*, so behaviour is preserved-or-bettered, never lost, and
> every change ships in small, reversible, owner-visible increments.
>
> **Total redesign freedom (owner-granted, 2026-06-16).** Fable is explicitly free to **redesign the
> entire portal, top to bottom** — the information architecture, the navigation, the page set, the
> visual language, and every underlying mechanism and rule. Nothing is off the table on the *design*
> axis: pages may be merged, split, removed, or invented; flows may be re-sequenced; the whole IA may
> be re-thought. This freedom is bounded only by the *process* (the §3 safety protocol, the §4 rail
> protocol, the §5 test net, and the owner gates in §3.10) — never by a presumption that the current
> shape is correct. Treat today's structure as the best previous answer, not the final one.
>
> **External validation pass applied 2026-06-16; finance/web-platform/API claims checked against
> primary sources current to June 2026 — see commit.**
>
> ---
>
> ## 🔒 SESSION MANDATE — run this entire session in PLAN MODE (owner-directed, 2026-07-01) — read before anything else
>
> **This is the operating contract for the session that opens this file. It governs *how* the session
> runs and overrides any looser phrasing elsewhere in this document.** The owner will start a fresh
> Claude Code session on the **Fable model (`claude-fable-5`)** and hand it this one file. Everything
> below tells that session exactly what to do.
>
> **1. Enter Plan Mode first — before any other action.** The very first thing this session does is
> switch Claude Code into **Plan Mode** (cycle modes with **Shift+Tab** until the input shows
> *"plan mode on"*). If already in Plan Mode, confirm it and stay there. **Do not leave Plan Mode**
> until the owner has approved the plan. In Plan Mode the session is **read-only**: it researches and
> designs but **writes nothing** — no file edits, no `Write`/`Edit`, no commits, no pushes, no code
> changes, no Supabase writes. Every scan, trace, and MCP read below is permitted; every mutation is
> forbidden until approval.
>
> **2. Do all the thinking here, in Plan Mode.** While in Plan Mode, carry out — in full — the §2
> full-codebase scan, the §7 Q&A intake, the flow traces (§2.4), the dead-code/obsolescence audit
> (§2.7), and the Supabase/schema reads (§2.3). This is the entire discovery and design effort. Take
> the time it needs; this is the most important hour of the program and everything downstream inherits
> its accuracy.
>
> **3. The single deliverable of Plan Mode is the overhaul of *this file*.** The plan you present for
> approval is not a summary and not a sketch — it is a proposal to **rewrite `fable_refactor.md` itself
> into the final, complete, definitive plan**: a top-to-bottom, step-by-step-by-step breakdown of
> **every single part of the system** (every segment, page, module, mechanism, rule, constant, table,
> and data flow) and **every granular unit of work** required to take it to the new standard. Nothing
> vague, nothing deferred to "figure out later." If a part of the system exists, it appears in the
> plan; if a piece of work is needed, it is written down as a discrete step.
>
> **4. Granularity is the whole point — size every step to survive credit limits and cold resumes.**
> The owner works alongside real usage/credit limits and expects the program to advance in **tiny,
> individually shippable steps**. So the overhauled plan must decompose the work until **each step is
> small enough to complete, test, commit, and tick in a single short working spell** — one sentence to
> describe, one commit to land, one checklist line to track (§3.1, §9). A step that can't be described
> in one sentence is too big; split it. The sequenced backlog (§9) is the spine of this: an ordered
> list of atomic steps, each with its files, its test impact, and its acceptance check, such that **any
> fresh session can open this file, read the checklist, and resume from the exact next unticked step.**
>
> **5. Present the plan, then wait for approval.** When the overhaul is authored, present it via the
> **ExitPlanMode** tool for the owner to review and approve. The plan you present is the *content of the
> rewritten file plus the sequenced tiny-step backlog*. **Do not carry out any of it until the owner
> approves.** If the owner asks for changes, revise in Plan Mode and re-present. Approval of the plan is
> the one and only gate that starts execution.
>
> **6. On approval — write the file first, then execute one tiny step at a time.** The moment the owner
> approves and Plan Mode is exited, the session's **first execution action** is to **write the
> overhauled `fable_refactor.md`** (the new comprehensive plan + backlog) and commit it, so the plan is
> durable and resumable before any product code moves. From then on, execute the backlog **strictly one
> tiny step at a time**, following the §3 safety protocol: build the step (test-first per §5), run the
> harness green, commit + push, tick the §9 checklist, post a one-line progress note — then move to the
> next step. **Never batch steps.** This cadence is deliberate: it keeps every increment reversible,
> owner-visible, and resumable across the credit limits and cold sessions the owner will hit.
>
> **7. Reality wins.** The §10 deep-dives below are the best previous answer, not the final one. Where
> the §2 scan shows this file is stale, the overhaul corrects it (`CLAUDE.md` rule 0). The plan you
> present should reflect the code as it actually is today, not as this document remembers it.
>
> ---
>
> ## ⭐ TOP PRIORITY DIRECTIVE (owner-granted, 2026-07-01) — read before everything else
>
> **The single most important thing in this entire program is getting the LISTINGS PIPELINE
> right.** Above the design overhaul, above the finance engine, above the Ask assistant — above
> everything. If Fable does only one thing to a genuinely world-class standard, it must be this:
>
> > **Every user must see a true, complete, de-duplicated reflection of *all* the properties
> > covered by *any* area they hold — nothing missing, nothing doubled, nothing leaked from areas
> > they don't hold, and nothing surfaced from the place they already live.**
>
> That means the whole chain — **finding** listings for all households optimally, **pulling**
> (scraping) them within budget, **storing** them, **filtering** them (baseline, geofence,
> affordability, junk, decided-suppression), **organising** them (dedupe, membership, primary),
> and **managing each household's areas** (targets vs. origins, overlap, radius) — must be
> **heavily reviewed, reworked, stripped back, and made optimal**. Hunt down and delete **dead
> code and bad mechanics**. There are today **three separate village-index loaders**, **two
> different area-matching algorithms** in the ingestion path, and a **dual source of truth**
> (`listings.area_id` vs. `listing_areas.is_primary`) held together by convention — exactly the
> kind of divergence-prone plumbing that must be collapsed to **one canonical path**. Treat this
> segment (§10.4 Listings, §10.5 Areas, §10.9 Backend/sync) as the flagship of the whole overhaul.
> The 2026-07-01 session log at the foot of this file is the current-state briefing and the list of
> known weaknesses to fix — **start there.**
>
> **Second priority: a complete, mobile-first UI/UX front-end overhaul.** After the listings
> pipeline is optimal, Fable must genuinely consider a **from-scratch rewrite** of the front end —
> not a polish pass on the current markup, but a true rethink of the information architecture and
> visual language, **designed mobile-first** (320–480 px first, then enhanced; see §10.1 and
> DESIGN.md §6) because the overwhelming majority of real use is on a phone. Everything else in
> this document ranks below these two.

---

## 0. How Fable should use this document

Read this file once, end to end, before touching anything. It is long by design: it is meant to let
any cold Fable session resume the program with full context. The Session Mandate at the top of this
file is the binding version of the steps below — this section is its rationale. Then:

0. **Enter Plan Mode (Session Mandate).** Switch Claude Code into Plan Mode and stay there for
   everything in steps 1–3. Nothing is written, edited, committed, or pushed until the owner approves
   the plan (step 4). All of the discovery below is read-only research.
1. **Scan (§2 kickoff).** Run the mandated full-codebase sweep. Do not trust this file's inventories
   blindly — verify them against reality; the corrections are folded into the plan you present, per the
   repo's own first rule: *"If reality and this file disagree, reality wins — fix this file."*
2. **Interrogate (§7 intake).** Run the structured Q&A. Extract the owner's aspirations, taste,
   priorities, risk tolerance, and non-negotiables. Fold the answers into the plan so it self-documents.
3. **Overhaul this file into the final plan (still in Plan Mode).** Rewrite `fable_refactor.md` top to
   bottom into the definitive, step-by-step breakdown of every part of the system and every granular
   unit of work — replacing every "opportunities / sub-phases" stub with a concrete, dependency-ordered
   backlog of atomic steps (§9). Decide the order segments are tackled and justify it. Decide which
   guard rails to keep, relax, or redesign (§4) and how the test suite is rebuilt (§5) — and write those
   decisions down. **Present the result via ExitPlanMode for the owner's approval.**
4. **Execute only after approval (§3 safety protocol).** Write the overhauled file first, then work
   **one tiny step at a time**. Plan it (§3.3), build it test-first (§5), self-review against the
   feature-description standard (§6), the design contract (`DESIGN.md`) and accessibility floor, merge
   to `main`, push, report. Repeat — never batching steps.
5. **Report continuously.** After every merged step, post a short progress update and tick the §9
   living checklist. Progress never lives only in your head — so any credit-limited or cold session can
   resume from the exact next unticked step.

Treat the per-segment deep-dives (§10) as the map of the territory. Treat `CLAUDE.md` and `DESIGN.md`
as the *current* law — law that you are now authorised to amend through the disciplined processes in
§4 and §5, with the owner's sign-off on anything foundational.

### 0.1 How this document is structured

- **§1–§2** orient you: what the product is, and how to scan it from cold.
- **§3** is the safety contract that keeps a total rebuild from breaking a live product.
- **§4** grants and bounds your authority to redesign the guard rails.
- **§5** is the mandate to rebuild the entire test apparatus to a new standard.
- **§6** is the *feature-description standard* — the exact, vetted way every rule, mechanic, style
  choice and behaviour in this document (and in the code's own docs) must be written and confirmed.
- **§7–§9** are the intake, the global conventions, and the living checklist.
- **§10** is ten exhaustive segment deep-dives — the bulk of the document.
- **§11** is the quick-reference appendix.

### 0.2 How to use this plan in "auto" mode — your latitude over the plan itself (owner-directed, 2026-06-16)

The owner will run you in **"auto" mode** and is **deliberately relying on your advanced capabilities**.
The owner's standing assumption is that *work you produce will be better than what exists today*, and
has explicitly authorised you to treat **this plan as a starting point you may fully replace** — not a
fixed specification. **You decide** which of these three modes fits, segment by segment, and may switch
between them as you learn more:

1. **Use the plan as-is.** Where a segment's deep-dive is already accurate and well-sequenced (verified
   against the live code in the §2 scan), execute it directly.
2. **Update the plan in segments as you reach them.** Re-write a segment's "opportunities / sub-phases"
   into a concrete, dependency-ordered backlog just-in-time, deepening any description thinner than the
   §6 standard, and correcting anything the scan shows is stale (reality wins — `CLAUDE.md` rule 0).
3. **Fully reproduce this plan top to bottom.** If your judgement is that a cleaner plan would serve the
   refactor better, you are authorised to **rewrite the entire document** — at the **same or greater
   level of granularity, detail, and guidance** (every rule/mechanic/constant named, quoted, and traced
   to `file:line` per §6; per-segment file inventories, data flows, behaviour catalogues, tests, smells,
   and sub-phases). A full reproduction must still deliver the **complete refactoring the owner is
   after** and must preserve everything non-negotiable: the §3 safety protocol, the §3.11 protected
   invariants, the §4 rail-change discipline, the §5 test net, and the owner-directed **priority order**
   in §9 (front-end/UX/mobile/redesign first → listings/trends/saved-rejected/scraper → the rest in
   optimal order).

**Optimal default.** Do not over-plan up front. Run the §2 scan and §7 intake, then **commit to the
lightest mode that achieves the standard**: prefer (1)/(2) per segment and reserve a full (3) rewrite
for when the existing structure genuinely gets in the way. Whichever mode you choose, **record the
decision** (a dated line in §9 or an ADR per G2) so a future cold session understands why the plan looks
the way it does. The bar is outcome, not fidelity to these words: a complete, regression-free, owner-
visible overhaul that leaves the product — and this plan — better than you found them.

---

## 1. The product in one screen

**rec** is a personal, single-household house-search intelligence portal. It is not a generic SaaS —
it is one buyer's command centre. It does six things:

| Capability | Where it lives | One-line purpose |
|---|---|---|
| **Dashboard** | `index.html` + `assets/js/dashboard/` | At-a-glance verdict on readiness, money, and next best action. |
| **Finances** | `pages/finances.html` + `assets/js/finances/` | Affordability, deposit, LISA, money-flow, savings velocity, investments. |
| **Areas** | `pages/areas.html`, `area-detail.html`, `map.html` | Researched location dossiers + matching + map. |
| **Listings** | `pages/listings.html`, `property.html`, `saved-listings.html`, `rejected.html` | Live Rightmove feed, fit-scoring, self-learning reactions. |
| **Intelligence** | `assets/js/refinement/`, `learned-preferences/`, `suggestions/` | Model Refinement Engine that learns the buyer's taste over time. |
| **Action** | `pages/outreach.html`, `journey.html`, `ask.html` | Outreach templates, the buying journey, and an AI "Ask" assistant. |

**Stack:** Zero-build static site — plain HTML + CSS + vanilla ES modules, all libraries via CDN.
Shared shell via fetch-injected partials (`components/`). Pico CSS v2 + design tokens. **Supabase**
is the live backend (auth + Postgres with RLS) for all user-state; a localStorage write-through
cache fronts it. Hosted on **GitHub Pages** (deploy on push to `main`). One Supabase Edge Function
(Deno/TypeScript) powers the "Ask" assistant.

**Current maturity:** Feature-complete through "v3" (live listings + Model Refinement Engine,
Stages 1–9). The codebase was modularised in a 2026-05 refactor: 132 JS modules, 51 CSS partials,
~65 test files. This overhaul builds on — and is licensed to rebuild — that foundation.

**Who it serves:** one household (`lukeclifford.uk`), buying in Hampshire & Wiltshire. Single user,
single device-class reality, real money on the line. That changes the engineering calculus: trust in
the numbers and clarity of the verdicts matter more than scale, multi-tenancy, or theoretical
generality. Optimise for *this buyer's confidence and speed*, not for a hypothetical market.

---

