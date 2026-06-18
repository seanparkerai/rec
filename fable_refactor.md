# fable_refactor.md — The Master Refactor & Overhaul Plan

> **Audience:** Fable (claude-fable-5), operating as the lead engineer and chief architect on a
> complete, top-to-bottom re-architecture of the **rec** portal — a zero-build static web app that
> helps a UK first-time buyer find, finance, and act on a home in Hampshire & Wiltshire.
>
> **Status of this file:** This is the *foundation*, authored by Opus 4.8 (2026-06-16) and expanded
> the same day into this comprehensive edition. It is a living document. Fable's **first job** is to
> ingest it whole, perform the §2 scan, run the §7 Q&A intake, and then **rewrite this plan top to
> bottom** into a sequenced, owner-approved program. Nothing below is frozen until that intake is
> done — including the guard rails and the tests, both of which Fable now has explicit authority to
> redesign (§4, §5).
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

---

## 0. How Fable should use this document

Read this file once, end to end, before touching anything. It is long by design: it is meant to let
any cold Fable session resume the program with full context. Then:

1. **Scan (§2 kickoff).** Run the mandated full-codebase sweep. Do not trust this file's inventories
   blindly — verify them against reality and **correct this file where they disagree** (the repo's
   own first rule: *"If reality and this file disagree, reality wins — fix this file."*).
2. **Interrogate (§7 intake).** Run the structured Q&A. Extract the owner's aspirations, taste,
   priorities, risk tolerance, and non-negotiables. Capture answers inline so the plan self-documents.
3. **Re-plan.** Replace every "opportunities / sub-phases" stub with a concrete, dependency-ordered
   backlog. Decide the order segments are tackled and justify it. Decide which guard rails to keep,
   relax, or redesign (§4) and how the test suite is rebuilt (§5) — and write those decisions down.
4. **Execute (§3 safety protocol).** Work one segment (or sub-phase) at a time. Plan it (§3.3),
   build it test-first (§5), self-review against the feature-description standard (§6), the design
   contract (`DESIGN.md`) and accessibility floor, merge to `main`, push, report. Repeat.
5. **Report continuously.** After every merged sub-phase, post a short progress update and tick the
   §9 living checklist. Progress never lives only in your head.

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

## 2. Kickoff protocol — the enormous scan (do this first, every fresh program)

Before re-planning or editing, Fable performs a complete sweep and writes its findings back into the
relevant per-segment sections of this file. The scan is not optional and is not a skim. It is the
single most important hour of the program: everything downstream inherits its accuracy.

**2.1 Inventory & verify (mechanical).**
```bash
find assets/js -name '*.js' | sort        # JS modules (expect ~132)
find assets/css -name '*.css' | sort      # CSS partials (expect ~51)
ls pages/ components/ data/ tools/ tests/  # surfaces, partials, data, tooling
node tools/run-intelligence-tests.mjs      # the single unified harness — must be green at start
git log --oneline -40                      # recent history & cadence
wc -l fable_refactor.md                    # this plan's size — track it as it grows
```
Cross-check every inventory in §10 against this output. Fix drift in this file as you find it.

**2.2 Read the law.** `CLAUDE.md` (operating rules — esp. §1 branching, §6 testing, §9–§13 design,
§14 plan contract, §16 out-of-scope guard rails, §18 Supabase sync). `DESIGN.md` (visual contract —
anchors, tokens, bans, responsive doctrine). These two files govern every change **today**. Under §4
and §5 you may propose amendments to both — but you read and honour them until an amendment is
written, tested, and (where foundational) owner-approved.

**2.3 Map the data.** `docs/DATA_MODEL.md`, `docs/SUPABASE_SYNC.md`, `docs/SCHEMA_NOTES.md`. Run
`mcp__supabase__list_tables` to confirm the live schema and RLS. Understand the four data classes
(user-state / content-areas / content-other / system) before touching any storage path. Pull
`MAX(updated_at)` per table and reconcile against `data/snapshots/sync-state.json`.

**2.4 Trace the flows.** For each segment, follow one value end to end: Supabase row → `storage/*.js`
→ page coordinator (`page-*.js`) → domain module → DOM. Note coupling, shared constants, hidden
contracts, and the guard-railed files (§16 today) any change would brush against. Record the trace in
the segment's "Data flows" subsection — corrected against reality.

**2.5 Baseline the quality bar.** Run the harness, the responsive lint (`tools/lint-responsive.mjs`),
and note current test coverage per segment. Establish "green" before you change anything so every
later regression is attributable. Capture the baseline numbers (test count, runtime, lint violation
count) in §9 so the rebuild's progress is measurable, not vibes.

**2.6 Characterise before you change (links to §5).** For any segment you will refactor, the scan's
output includes a list of the *observable behaviours* that must be preserved. These become the
characterization tests written **before** the refactor begins. No refactor starts against a segment
whose current behaviour isn't pinned by tests.

**2.7 Obsolescence, redundancy & dead-code audit (owner-directed).** A first-class deliverable of the
scan is an explicit inventory of what is **old, redundant, dead, or unused** — the system has grown
through v1→v2→v3 and accumulated sediment. Hunt for, and list with evidence:
- **Dead code** — modules, exports, functions, CSS rules, and branches with no live caller. Confirm
  with `grep`/import-graph analysis (e.g. an exported symbol no `import` references; a CSS class no
  HTML/JS emits; a `page-*.js` for a page no nav links to). Cite the absence, not a guess.
- **Redundant logic** — the same rule implemented twice (the scan already suspects matched-price logic
  duplicated across `page-areas.js` and `page-area-detail.js`; ISA attribution duplicated between a
  dashboard tile and the finances page). Name each duplication and the single home it should collapse to.
- **Superseded mechanisms** — code kept "just in case" after a newer path replaced it; legacy data
  shapes the normaliser still tolerates but nothing writes; archived plans' scaffolding left in `assets/`.
- **Unused data & assets** — JSON fields no view reads, images not referenced, fixtures for deleted
  features, CDN deps loaded but unused.
- **Stale docs** — claims in `docs/` that no longer match the code (the docs-consistency test guards
  some of this; extend the net to the rest).
For each finding, record: what it is, the evidence it's dead/redundant, the risk of removing it, and a
recommendation (delete / merge / keep-with-reason). Removal is itself refactor work under §3 — pinned
by tests first, shipped incrementally, never a blind mass-delete. The goal of the new standard is a
**lean** system: every file, rule, and field earns its place or is removed.

**Deliverable of the scan:** an updated §9 living checklist + corrected §10 deep-dives + the §2.7
obsolescence inventory + a one-page "state of the system" note to the owner, surfacing the three
highest-leverage overhaul targets, the guard rails you recommend redesigning, the dead weight you
recommend cutting, and the shape of the new test apparatus.

---

## 3. Safety & merge protocol (non-negotiable)

This is the contract that makes a top-to-bottom rebuild safe on a live product. Every sub-phase obeys
it. The authority granted in §4/§5 widens *what* you may change — it never loosens *how* you change it.

**3.1 One segment, one sub-phase at a time.** Never refactor two segments in one branch. Decompose
each segment into the smallest shippable sub-phases. A sub-phase that can't be described in a single
sentence is too big — split it. Big-bang rewrites are banned even when the destination is a clean-
sheet design; you get there through a sequence of green, reversible steps (the "strangler" pattern:
stand the new mechanism up beside the old, divert traffic incrementally, delete the old last).

**3.2 Branch discipline.** Commit to `main` in small, green-tested increments per `CLAUDE.md` §1,
*unless* a session mandates a feature branch — in which case branch per sub-phase, merge to `main`
only when green, and never park long-lived divergent branches. The owner has standing authority to
ask for a merge to `main` at any time; honour it. Push with `git push -u origin <branch>` (retry with
backoff on network errors only). **Do not open a PR unless the owner explicitly asks.**

**3.3 Plan-mode contract (`CLAUDE.md` §14, sharpened).** Before each sub-phase, enumerate in order:
(1) files to edit *and the sections within them*; (2) order of operations; (3) test impact — which
tests change, which are added, the new behaviours pinned, and confirmation the harness ran green;
(4) an explicit **out-of-scope** list; (5) **guard-rail touch declaration** — does this sub-phase
touch a §16 file or a §4 rail, and if so under which §4 process. If scope changes mid-flight — a new
file is needed, a rail is touched unexpectedly, a refactor surfaces — **stop, surface the divergence,
re-plan.** Do not power through.

**3.4 Guard rails — now governed by §4, not by a blanket ban.** The §16 list (`tokens.css`,
`storage.js` + `storage/*.js`, `config.js`, `data-loader.js`, `finances.js` + `finances/calc-*.js`,
`dashboard.css` import shell, `area.schema.json`, `.github/workflows/*`) is no longer "never touched."
It is "touched only through the §4 rail-change protocol." Extend-by-default still holds for the
spine; *redesign* is now permitted, deliberately, with the safeguards §4 specifies.

**3.5 Supabase sync (`CLAUDE.md` §18).** Any change to data, schema, or storage triggers the
MCP-first session-start freshness check and session-end push-and-verify ceremony. User-state writes
go through Supabase via MCP (never repo JSON). Schema DDL goes through `apply_migration` only — never
the dashboard. The sync tests fail a half-synced commit; never commit one. This contract survives the
rebuild: even if you redesign the storage layer, *the live data must stay correct and in lockstep at
every commit.*

**3.6 Test gate (`CLAUDE.md` §6, superseded in scope by §5).** The harness is green **before every
commit**. During the test re-architecture (§5) the *command* and the *suite* may change, but the
invariant does not: there is always a single command that runs all tests, and it is green before any
commit that ships product code.

**3.7 Verification without a browser (`DESIGN.md` §4).** There is no browser in the environment.
Verify by re-reading the diff and reasoning through layout/specificity/token resolution, then hand
the owner one short on-device check note for anything that needs eyes. If you stand up a new
automated verification capability (e.g. headless DOM testing) under §5, document it here and use it.

**3.8 Merge & report.** Merge to `main` only on green. After each merge: tick §9, post a one-line
progress update. Keep each commit individually revertible.

**3.9 Reversibility & respect for existing work.** Prefer additive, behaviour-preserving moves. Before
deleting or overwriting anything you did not create, read it first — if it contradicts how it was
described, surface that instead of proceeding. The existing code earned its place by shipping; treat
its replacement as a thing to be *proven better*, not assumed better.

**3.10 Owner-approval gates.** Three classes of change require an explicit owner decision before merge,
via `AskUserQuestion`: (a) redesign of a foundational guard rail (storage/schema/finance-calc — §4.4);
(b) any change that alters a financial number the buyer sees (the trust surface — §10.3); (c) deletion
of a capability or page. Everything else is yours to ship under §3.

**3.11 What must stay green vs what may be uprooted and rebuilt (owner-directed, 2026-06-16).**
The owner wants a clear, logical line between the *invariants that must hold green at every commit* and
the *implementation that is free to be torn down and rebuilt with entirely new tests*. The rule:

- **Must stay green at every commit (the protected invariants — never red, never skipped):**
  1. **Live-data correctness & sync (§3.5).** The buyer's real data stays correct and in lockstep with
     Supabase at every commit, no matter how the storage layer is rebuilt.
  2. **The buyer-facing trust surface (§3.10b, §10.3).** Financial numbers the buyer sees never silently
     change; any intended change is owner-gated and re-pinned with tests.
  3. **The usability & performance acceptance tests.** The user-journey/usability checks and the
     performance budgets (mobile-first responsiveness, load/interaction performance, a11y floor
     `CLAUDE.md` §11) must be **defined as first-class tests** and **pass green** — these are the
     outcomes the owner actually cares about, so they are the contract, not the implementation.
  4. **The single test gate (§3.6).** There is always one command that runs the suite, and it is green
     before any commit that ships product code.
- **Free to be uprooted and rebuilt completely (no obligation to preserve the existing shape):** every
  *implementation* behind those invariants — modules, file layout, algorithms, the guard-rail *designs*
  (§4), the CSS/JS architecture, the visual language, **the test files and harness themselves (§5)**,
  and even **this plan** (§0.2). A rebuilt unit does not need to keep the old code, the old tests, or
  the old structure — it needs to (a) be covered by **new tests that are at least as strong** (pin
  behaviour via characterization *before* the teardown, §4.3/§5.3), and (b) keep the four protected
  invariants above green. "Rebuilt with new tests" is the expected path, not a fallback.
- **The practical test:** before uprooting something, ask *"is this one of the four protected
  invariants?"* If **no**, you may rebuild it wholesale (strangler-style, never leaving the net down).
  If **yes**, it is not the *implementation* that is protected but the *outcome* — re-express the
  outcome as a green test, then rebuild the implementation beneath it.

---

## 4. Guard-rail authority & the rail-redesign protocol (NEW — owner-granted, 2026-06-16)

The owner has explicitly granted Fable authority to **flex, relax, or redesign the guard rails and
guards** using its own engineering judgement. This section grants that authority and bounds it so the
latitude produces better foundations, not regressions. Authority without a process is recklessness;
this is the process.

### 4.1 What changed and why

Under the previous regime (`CLAUDE.md` §16) the guard-railed files were *never* touched by feature
work; any change was a separate, narrowly-approved phase. That was the right rule for a stabilising
product. For a deliberate re-architecture to a new standard, an absolute ban is now a liability: the
spine (storage, finance calculators, tokens, the build/sync tooling, the schema) is exactly where the
highest-leverage improvements live. Fable is therefore licensed to treat every rail as **a design
decision to be re-examined**, not a wall.

### 4.2 The rails, and your latitude over each

| Rail (today §16) | Default posture | Your latitude |
|---|---|---|
| `assets/css/tokens.css` | Extend | **Redesign permitted.** You may re-derive the whole token system (colour space, scale, type ramp) if it raises the standard — but migrate *all* consumers in the same program and keep `DESIGN.md` the source of truth. |
| `assets/js/storage.js` + `storage/*.js` | Extend | **Redesign permitted under §4.4 (foundational).** The write-through-cache contract and the four-class model may be re-architected; the *live data correctness invariant* (§3.5) may not be broken at any commit. |
| `assets/js/config.js`, `data-loader.js` | Extend | **Redesign permitted.** Small, well-understood; safe to modernise with characterization tests. |
| `assets/js/finances.js` + `finances/calc-*.js` | Extend | **Redesign permitted under §4.4 (foundational) AND §3.10(b).** These produce numbers the buyer trusts; every change is property-tested against the current outputs and owner-signed before merge. |
| `assets/css/dashboard.css` import shell | Extend (order-sensitive) | **Redesign permitted.** If you replace the @import shell with a better composition strategy, prove load order is preserved. |
| `data/schema/area.schema.json` | Frozen | **Redesign permitted under §4.4.** Schema changes ripple to the DB, the materialise pipeline, and the parity test — sequence them as one migration. |
| `.github/workflows/*` | Frozen | **Redesign permitted under §4.4.** CI/CD and the scheduled fetchers; a broken workflow can stop deploys or double-charge Apify, so change with care and a rollback plan. |

### 4.3 The rail-change protocol (every rail change follows this)

1. **Name the rail and the standard you're raising.** State, in one paragraph, what's wrong with the
   current design and what "better" looks like concretely.
2. **Characterise first (§5).** Pin the rail's current observable behaviour with tests *before*
   touching it. For finance calculators this means property/golden-master tests over a wide input
   grid; for storage, round-trip and cache-coherence tests; for tokens, a rendered-value snapshot.
3. **Design the replacement in the open.** Write the new design into this file (the relevant segment
   or a new ADR-style note) and into `CLAUDE.md`/`DESIGN.md` as a proposed amendment.
4. **Strangler migration (§3.1).** Stand the new mechanism beside the old, migrate consumers
   incrementally, keep the harness green at every step, delete the old last.
5. **Re-baseline the rail.** Update the governing doc (`CLAUDE.md` §16 / `DESIGN.md`) to describe the
   new rail. The point is not to *remove* guard rails — it's to **replace weak rails with stronger,
   better-designed ones.** A rebuilt system needs *more* disciplined guard rails, not fewer; you are
   authoring the next generation of them.
6. **Record the decision.** Leave a dated, one-paragraph rationale so a future session understands why
   the rail looks the way it now does.

### 4.4 Foundational changes need an owner gate (§3.10a)

Three rails are *foundational* — a mistake there is expensive or hard to reverse: **storage/schema**
(data integrity), **finance calculators** (the trust surface), and **CI/CD workflows** (deploy +
spend). Redesigning any of these requires an explicit owner decision via `AskUserQuestion` before
merge, with: the problem, the proposed design, the migration plan, the test strategy, and the
rollback. Everything else under §4.2 you may ship on your own judgement, following §4.3.

### 4.5 The meta-rule

You are not just permitted to change the rails — you are **expected to leave the guard-rail system
better designed than you found it.** Audit it as a first-class deliverable: which rails earned their
keep, which were cargo-culted, which were missing entirely (e.g. no rail currently guards the Edge
Function's prompt/tool surface, or the listings fetch spend). Propose the rail system a senior team
would design for this product today, and build it.

---

## 5. The test re-architecture mandate (NEW — owner-directed, 2026-06-16)

The owner has directed Fable to **completely re-write all test processes and the tests themselves**
to a new standard. The current harness is good for what it is (a fast, offline, dependency-free Node
runner with ~65 suites) but the brief is explicitly a clean-sheet rebuild of the testing apparatus,
not an extension of it. This section sets the standard and the safe path to it.

### 5.1 Why rebuild the tests at all

The test suite is the safety net under everything else in this program — the §3 protocol leans on it
at every commit. If the net is rebuilt to a higher standard *first*, every subsequent segment refactor
is safer and faster. The current suite has known gaps the scan will confirm: no end-to-end journey
coverage, no DOM/component rendering tests (no browser in CI), online Supabase assertions are skipped
rather than run, characterization coverage is uneven across segments, and the responsive lint is
count-based (it masks which violation regressed). A new standard fixes these by design.

### 5.2 The new testing standard (target architecture — Fable refines during intake)

- **One command, layered suites.** Preserve the "single green command" invariant (§3.6) but structure
  the suite in explicit layers: **unit** (pure functions/calculators), **contract** (module API +
  schema + data-shape), **characterization/golden-master** (pin existing behaviour before refactor),
  **integration** (cross-module flows, e.g. reaction → learned-preference → feed), **DOM/component**
  (render a partial in a headless DOM and assert structure/a11y), **end-to-end journey** (a scripted
  buyer path across pages), and **online/live** (Supabase round-trips, run deliberately, never skipped-
  as-passing).
- **Real DOM testing in CI.** Stand up a headless DOM (**`jsdom`** for fidelity — focus/dialog/ARIA —
  and/or **`happy-dom`** for speed on bulk renders; via the existing Node runner, still zero-build for
  the shipped site) so component rendering, partial injection, and accessibility (roles, labels, focus
  order) are asserted automatically — closing the "no browser" gap that §3.7 currently works around by
  hand.
  > **⚠️ External validation (D1):** **Drop `linkedom`** from the DOM/a11y layer — it is an
  > SSR/parser, incomplete for the interaction/focus/role assertions this layer needs. Use **jsdom**
  > (fidelity) or **happy-dom** (speed) instead. (PkgPulse, Mar 2026; Steve Kinney, Mar 2026.)
- **Online Supabase coverage, gated honestly.** Provide a path to run the online assertions against a
  disposable test project/branch in CI (or a documented local/MCP run), so the offline "skipped" rows
  become real passes. Never report an unrun online check as passing.
- **Coverage that means something.** Track behavioural coverage per segment (the §2.6 behaviour
  inventories), not just line coverage. Each segment's deep-dive (§10) names the behaviours its tests
  must pin. A segment isn't "done" until its catalogue of behaviours (§6) is covered.
- **Deterministic, fast, isolated.** No order-dependence, no shared mutable fixtures, no network in the
  offline layer, sub-15s offline run. Fixtures are redacted, generated, and owned by one source of
  truth (extend the `data/fixtures/*.sample.json` pattern).
- **Semantic lints, not count baselines.** Replace count-based baselines (responsive lint allow-list)
  with rules that name the *specific* violation and fail on *new instances by identity*, not by count.
- **Mutation-tested where it counts.** For the finance calculators and the intelligence engine (the
  two places a silent bug is most costly), add mutation testing so the tests are proven to actually
  catch regressions, not just execute the code.

### 5.3 The safe path to the new suite (do not leave the net down)

The test rebuild is itself refactored under §3 — you never delete the old safety net before the new
one holds. Sequence:
1. **Stand the new harness up beside the old.** New runner, new layout, both green, both run by the
   single command. (Strangler, §3.1.)
2. **Port + strengthen suite by suite**, segment by segment, in the same order you'll refactor product
   code — so each segment gets its new, stronger tests *before* its code is rebuilt.
3. **Add the missing layers** (DOM, integration, e2e, online) as you reach the segments that need them.
4. **Retire the old runner last**, only once every suite is ported and the new command is the canonical
   gate. Update `CLAUDE.md` §6 and `package.json` to point at it.
5. **Re-baseline §9** with the new test counts, layers, and runtime.

### 5.4 The test rebuild is a §4 foundational change

The harness and `.github/workflows/*` are guard rails (§4.2). The test re-architecture therefore
follows the §4.3 protocol and, because CI is foundational, the §4.4 owner gate for the CI-facing parts.
Practically: design the new standard during intake, get the owner's nod on the shape (and any new dev
dependency — note the site itself still ships zero `node_modules`; test-only deps live in
`devDependencies` and never reach the browser), then build it strangler-style.

---

## 6. The feature-description standard (NEW — the vetting methodology)

The owner has directed that **every headed section be expanded** so that *every bit of logic, every
rule, mechanic, style choice, and implementation detail of how something behaves is comprehensively
described, explained, and thoroughly vetted and confirmed.* This section defines the *how* — the
best-practice "feature-description" discipline that the rest of this document (especially §10) follows,
and that Fable must apply to its own documentation of the rebuilt system.

### 6.1 What "comprehensively described" means

A feature, rule, or mechanic is properly described only when a competent engineer who has never seen
the code could re-implement it correctly and a careful reader could spot if it were wrong. That bar
requires, for each unit of behaviour:

1. **Name & one-line purpose** — what it is, in the product's language.
2. **Trigger / entry point** — what invokes it (event, page load, user action, scheduled job), and the
   exact file:symbol where it begins.
3. **Inputs & preconditions** — every input, its source (Supabase table/column, criteria, constant,
   user gesture), its type/units, and what must be true before it runs.
4. **The rule itself, precisely** — the actual logic: formulas with their constants, thresholds with
   their values, branch conditions, ordering, and tie-breaks. Numbers are quoted exactly (e.g. "LTI
   gate fires above 4.5×", "feed hides a listing after the 3rd un-attributed reject"), each traced to
   `file:line`.
5. **Outputs & effects** — the return value/shape, the DOM it writes, the row it UPSERTs, the event it
   emits, and any side effects.
6. **Edge cases & failure modes** — zero/null/missing inputs, division-by-zero guards, cold-start,
   overflow, network failure, and what the code does in each. State the *observed* behaviour, not the
   hoped-for one.
7. **Rationale** — *why* it works this way: the domain reason (UK FTB rules, lender norms, the design
   anchor) or the engineering trade-off. A rule without a rationale is a rule no one can safely change.
8. **Invariants & acceptance criteria** — what must always hold (these become the tests of §5), phrased
   so they can be asserted.
9. **Style/UX choices, where applicable** — the design anchor it serves, the token decisions, the
   responsive/a11y behaviour, and the `DESIGN.md` rule it honours or the ban it avoids.
10. **As-is → To-be (mandatory, owner-directed).** Two explicitly-labelled halves. **Today:** an
    in-depth, honest account of how the thing works right now — including its compromises and why they
    were made. **Better:** a *completely revised or optimised* way to achieve the same outcome to the
    new standard — what you would build instead, why it's superior (clarity, correctness, speed,
    maintainability, UX), what it costs, what it risks, and how you'd migrate to it safely (§3.1).
    This pairing is the heart of the overhaul: the owner wants to see both the current reality and
    your considered, better alternative for every meaningful piece — not a vague "could improve."

### 6.2 The vetting standard — "thoroughly vetted and confirmed"

A description is not "vetted" because it is plausible. It is vetted when it is **confirmed against the
running truth of the system**:

- **Code-confirmed.** Every behavioural claim cites the `file:line` it was read from. If you can't
  point at the line, you can't make the claim — mark it *unconfirmed* and verify before relying on it.
- **Test-confirmed.** Where a behaviour matters, there is a test that asserts it (§5). The description
  and the test are written together; the test is the description made executable.
- **Data-confirmed.** Claims about live data, schema, or sync state are confirmed via MCP
  (`list_tables`, `execute_sql`) against Supabase, not inferred from `schema.sql`.
- **Cross-checked for drift.** Where two sources describe the same thing (a constant in
  `intelligence-constants.js` and its prose in `docs/INTELLIGENCE_RULES.md`), they are reconciled and
  the divergence is fixed, not papered over.
- **Dated and attributed.** A vetted description carries enough provenance that a future session knows
  when it was last confirmed and can re-confirm it cheaply.

### 6.3 How Fable applies this standard

- **To this document:** the §10 deep-dives are written to §6.1 depth and vetted to §6.2. Where the
  current text is thinner than the standard, Fable deepens it during the scan — every rule and mechanic
  named, quoted, traced, and confirmed.
- **To the rebuilt system:** every feature Fable builds or redesigns ships with its §6.1 description
  (in the relevant `docs/` file or segment) and its §6.2 confirmation (the tests). Documentation and
  tests are deliverables of the feature, not afterthoughts. "Done" (§11.5) includes "described and
  vetted to the §6 standard."
- **As a quality gate:** in self-review before merge, Fable checks each new/changed behaviour against
  the nine elements of §6.1 and the five confirmations of §6.2. A behaviour that can't be described to
  this standard isn't understood well enough to ship.

---

## 7. Q&A intake — the context-gathering interrogation

After the scan and before re-planning, Fable runs a structured Q&A with the owner. The goal is to
extract aspirations, taste, and constraints the code cannot reveal. Use `AskUserQuestion` for the
choices; capture free-form context in prose. Record every answer **inline in this file** under each
segment so the program is self-documenting. This is the "abundance of context and aspirations" the
owner wants to provide before the plan is overhauled top to bottom.

**7.0 The question & feedback standard (owner-directed — read before asking anything).**
The owner wants to give *super-specific* feedback on the **assumptions and decisions Fable is
considering** — so the quality of the questions is what unlocks the quality of the answers. Every
question Fable puts to the owner (here, and throughout the program via `AskUserQuestion`) must meet
this bar:

- **Surfaces a real, named decision or assumption.** Don't ask "what do you think?" Ask about the
  *specific* fork you're standing at, and put your current leaning on the table so the owner can
  confirm or correct it: "I'm assuming the dashboard should lead with *readiness*, not *money* — is
  that right?"
- **Easy to read.** One decision per question. Short. Plain language. Lead with the question, then the
  context — never bury the ask under a wall of preamble.
- **Easy to answer.** Offer 2–4 concrete options, each a sentence the owner can simply pick, with the
  **trade-off stated** ("faster but less transparent" vs "shows the working but busier"). Put your
  **recommended** option first and say *why*. Always leave room for "something else."
- **Shows the consequence.** Say what changes downstream depending on the answer, so the owner can
  weight their effort. Flag cheap-to-reverse decisions as such ("we can change this later") so the
  owner doesn't over-deliberate a small call.
- **Carries your reasoning.** Briefly show the assumption behind the options ("because you ranked
  trust-in-numbers highest, I'm leaning toward showing the calculation") so the owner can correct the
  *premise*, not just the choice.
- **Batched sensibly.** Group related decisions into one `AskUserQuestion` set; don't drip trivial
  questions one at a time, and don't dump twenty at once. Reserve prose for open-ended aspirations.

*Worked example of a good question:* "**For the listings feed, should a poor *affordability* fit hide
a property outright, or just rank it lower?** Today it's a hard gate — over-budget homes never appear.
(a) **Keep the hard gate** *(recommended — keeps the feed honest about what you can actually buy)*;
(b) Soft — show them, clearly flagged 'over budget', ranked last; (c) A toggle you control. This
changes how aggressive the feed feels and whether you ever see 'stretch' homes." — one decision,
plain, optioned, recommended-with-reason, consequence shown.

The goal: the owner reads a question in ten seconds and gives a precise, confident answer — because
Fable did the work of *framing* the decision, not just raising it. This standard governs the §10
per-segment Q&A sets too: rewrite any thin question to meet it before asking.

**7.1 Global / cross-cutting questions**
- What does "a new standard" mean to *you* here — speed, beauty, trust in the numbers, less manual
  work, delight, something else? Rank them; the ranking sets the program's optimisation target.
- Which **single page** do you use most, and which frustrates you most? (Sets the first target.)
- Are there pages or features you'd **cut** entirely if it sharpened the rest?
- Risk tolerance: bias toward bold rebuilds (more upside, more review) or conservative, invisible
  refactors (safer, slower)? Per segment, not just globally.
- How much do you want to **see** the machinery — the learning model's reasoning, the finance
  assumptions, the fit scores — vs. trust a clean verdict? (Drives transparency vs. minimalism.)
- Any hard deadlines, life events, or buying milestones the program should be paced around?
- Brand & voice: keep the current "calm precise editorial" direction, or evolve it? Reference sites/
  apps you love that should influence the new standard?
- Device reality: which devices do you *actually* use this on, in which orientations?
- Guard rails (§4): any part of the spine you're nervous about us touching, or eager to see rebuilt?
- Tests (§5): how much do you trust the current numbers/behaviour today — where do you double-check by
  hand? (Those are the behaviours the new tests must pin first.)
- What in the current system do you **never want changed** — the things that already feel right?

**7.2 Per-segment questions.** Each deep-dive (§10) ends with a tailored question set. Run them
segment-by-segment as you reach each one, not all upfront — context is freshest then.

**7.3 Output of intake.** A prioritised, sequenced backlog replacing the §10 "opportunities" stubs;
an agreed order of attack across segments; the guard-rail redesign decisions (§4); and the shape of
the new test apparatus (§5) — all recorded in §9.

---

## 8. Global conventions Fable must hold throughout

These are the *current* conventions. They are excellent and should be the floor for the new standard;
where §4 lets you raise them (e.g. evolving the token system or the design anchors), do so deliberately
and update the governing doc — never drift silently below them.

- **Design anchors (`DESIGN.md` §1).** Every view is *Stripe-docs* (editorial, content-led) or
  *Linear-dense* (data-rich UI) — never both, never neither. Name the anchor in every UI commit.
- **Tokens only.** No hard-coded hex, type px, or off-scale spacing in component CSS — everything via
  `tokens.css` custom properties (`--space-*`, `--text-*`, `--rec-*`, `--focus-ring`).
- **The five rules of the overhaul (`DESIGN.md` §5).** At-a-glance precedence; no isolated
  calculators; always-show-then-explain; no graphic without a verdict; visual cues replace text.
- **Responsive doctrine (`DESIGN.md` §6).** Mobile-first; `min-width` breakpoints 480/768/1024/1280;
  no transition in the iPad 600–800 band; `dvh`/`svh` not `vh`; container-queries for components; no
  inline styles; ≥44×44 targets. Mechanically enforced by `tools/lint-responsive.mjs` (to be upgraded
  to semantic rules under §5.2).
- **Accessibility floor (`CLAUDE.md` §11).** WCAG 2.2 AA: contrast, focus-visible never obscured,
  landmarks + skip-link, labelled forms, no colour-only signals, `<dialog>` for modals, reduced
  motion honoured. AA is the floor; aim higher where cheap.
- **Pico v2 conventions (`CLAUDE.md` §12).** Semantic HTML first; theme via `--pico-*` variable
  overrides, not source edits; dark mode via `data-theme` attribute.
- **Module layout (`CLAUDE.md` §19).** Small single-purpose modules; thin `page-*.js` coordinators;
  CSS mirrors the JS structure. Keep new code in this shape (or, under §4, propose a better one and
  migrate wholesale).
- **Content accuracy (`CLAUDE.md` §7).** Area/house content only after place- and type-specific web
  research, with `sources[]`. Never auto-generate. Only openly-licensed imagery, credited + licensed.
- **The feature-description standard (§6).** Every behaviour you ship is described and vetted to §6.

### 8.1 External validation — process (G1–G5)

The validation review confirmed the document's process choices and recommends making a few of them
**mechanical** rather than prose:

- **G1 — Trunk-based development:** Confirmed (DORA research). **Add:** enforce **branch protection +
  required green CI on `main`**, and treat **every merge as deployable** (GitHub Pages deploys on push).
- **G2 — ADRs:** Confirmed (Michael Nygard, 2011). **Add:** create **`docs/adr/NNNN-*.md`** with a
  standard template + `status` field, and **map every guard-rail / rail-change decision (§4) to an
  ADR** — this turns the §4 "rail-change protocol" into a concrete, reviewable artefact.
- **G3 — Conventional Commits:** Confirmed. **Add `commitlint` in CI** (optionally
  `release-please`/`changesets`).
- **G4 — Guard-rail protocol (§4):** Confirmed as sound. **Make it mechanical:** a rail change =
  **an ADR (G2) + a green run of the rebuilt suite**, enforced by branch protection + required CI —
  not by prose alone.
- **G5 — Incremental refactoring (strangler/characterization):** Confirmed (Fowler/Feathers); no change.

(Sources: DORA *Accelerate*; Nygard "Documenting Architecture Decisions", 2011; conventionalcommits.org;
Fowler & Feathers, 2004.)

---

## 9. Living program checklist (Fable maintains this)

> Replace this stub during intake with the agreed, sequenced backlog. Tick + commit after every
> merged sub-phase so any fresh session resumes from a known-good state. Record baseline metrics here
> (test count/runtime, lint violations, segment coverage) so progress is measured, not asserted.

**Phase 0 — Onboarding**
- [ ] Full-codebase scan complete (§2); inventories in §10 verified/corrected.
- [ ] Harness green at baseline; baseline metrics recorded (tests, runtime, lint, coverage/segment).
- [ ] Supabase schema + RLS confirmed via MCP; sync-state snapshot fresh.
- [ ] Global Q&A intake (§7.1) complete; answers recorded.
- [ ] Guard-rail audit (§4.5) delivered; redesign recommendations agreed with owner.
- [ ] New test standard (§5.2) designed; owner sign-off on shape + any dev dependency.
- [ ] "State of the system" note delivered with top-3 targets.

**Phase 1 — Test re-architecture (the net, first) (§5)**
- [ ] New harness stood up beside the old; single green command preserved.
- [ ] Suites ported + strengthened segment-by-segment; missing layers added (DOM/integration/e2e/online).
- [ ] Old runner retired; `CLAUDE.md` §6 + `package.json` re-pointed; §9 re-baselined.

**Phase 2…N — Per-segment overhaul** *(owner-directed priority order, 2026-06-16; tests precede code per §5.3)*

> The owner has set the **priority order** below. It overrides the old "dependency-order, foundation
> first" default for *sequencing the overhaul* — but **the test net (Phase 1) still comes first** for
> any segment before its code is rebuilt (§5.3, never leave the net down). Within each priority block,
> tests precede code and work ships in small reversible sub-phases (§3).

- **Priority 1 — Front-end / UX / mobile / redesign.** The visual + interaction overhaul comes first:
  §10.1 (design system, app shell, navigation) and §10.2 (home dashboard), plus the UX and
  mobile-responsiveness pass across every page (DESIGN.md §6/§9–§13). This is where the OKLCH-fallback
  fix (C1, §16 tokens.css phase) and the responsive/a11y validations (C2–C6) land.
- **Priority 2 — Listings, trends, saved/rejected, scraper.** §10.4 (live feed, fit-scoring, reactions,
  dossier, saved/rejected handling) and the scraper/fetch-listings optimisation (tooling, §10.10) +
  the trends surfaces. Pull the intelligence-engine seams (§10.6) that feed trends/refinement in
  alongside this block where they couple to listings.
- **Priority 3 — the rest, in optimal logical order** *(Fable confirms during intake; recommended)*:
  1. **Intelligence engine (§10.6)** — closely coupled to listings/reactions and trends; rebuild the
     module seams (§10.0) right after listings. Includes the **z-test → Fisher's exact** correction (B3)
     and the Bayesian-core decision (B5).
  2. **Finances (§10.3)** — includes the two ⚠️ code corrections (LISA 12-month A3, stress-rate A5) and
     the FTB-model additions (A4/A7).
  3. **Areas & map (§10.5).**
  4. **Ask assistant (§10.7)** — cache-breakpoint, strict-all-tools, JWT-forwarding (F2/F3/E4).
  5. **Profile, criteria, setup, journey & outreach (§10.8).**
  6. **Backend, storage, data & sync (§10.9)** — Supabase key migration (E1), RLS CI assertion (E2),
     IndexedDB/outbox (E3), declarative migrations (E4). *(The RLS CI assertion may be pulled forward
     into Phase 1 as a safety win.)*
  7. **Tooling, tests & CI (§10.10)** — folded into Phase 1; finalised last.

**Validation-driven corrections backlog (external review, 2026-06-16).** Each is scheduled as a normal
§3/§4 phase inside its segment above. Items marked ⚠️ are **corrections required in code** (a behaviour
or constant is currently wrong); the rest are additive/test/process improvements.

- [ ] ⚠️ **LISA withdrawal readiness → 12-month rule** (A3; §10.2 savings-visuals) — plot
  `firstContributionDate → +12 months`, not a 4–5 year horizon.
- [ ] ⚠️ **Mortgage stress test → "rate-rise sensitivity"** (A5; §10.3) — relabel; make `STRESS_UPLIFT_PP`
  configurable; default to an absolute floor (~7–8%); note "no mandated stress rate since Aug 2022" in
  INTELLIGENCE_RULES.md.
- [ ] **LISA/SDLT cap-mismatch warning + reform caveat** (A4; §10.3 + Ask UK-FTB facts).
- [ ] **FTB-model additions** (A7; §10.3) — Mortgage Guarantee/"Freedom to Buy", full transaction-cost
  checklist, leasehold running costs.
- [ ] ⚠️ **z-test → Fisher's exact test** before BH-FDR (B3; §10.6).
- [ ] **Decide Bayesian Beta-Bernoulli core vs keep-gates** (B5; §10.6) — intake decision; log gate-pass
  rates for tuning (B6).
- [ ] ⚠️ **OKLCH/`color-mix` fallbacks on base tokens** (C1; §16 tokens.css phase) — `@supports` guard +
  hex/rgb fallback.
- [ ] **Front-end validations** (C2–C6; §10.1) — target-size AA/AAA clarity, focus citation, container/
  dvh caveats, View-Transition unique-name + reduced-motion, Pico v2 variable-name check.
- [ ] **Drop `linkedom`; use jsdom/happy-dom** (D1; §5/§10.10).
- [ ] **Add Tier 0 type-check (`tsc --checkJs` + JSDoc) and Tier 6 real-browser (Playwright/Vitest browser)**
  (D5; Phase 1).
- [ ] **Stryker config** (D2; Phase 1) — perTest, incremental, scoped to finances/refinement/learned-prefs,
  ~75–80% threshold; consider **Vitest** runner (D6).
- [ ] ⚠️ **Supabase: ship `sb_publishable_*` (never secret/service_role); migrate off legacy keys** (E1; §10.9).
- [ ] **RLS CI assertion** (E2) — fail if any public user-data table has `rowsecurity = false`; run Security
  Advisor in CI. *(Candidate to pull into Phase 1.)*
- [ ] **IndexedDB + offline-write outbox; name SWR + versioned cache keys** (E3; §10.9).
- [ ] **Declarative-schema migrations (`supabase db diff`) + `supabase gen types`** (E4; §10.9).
- [ ] ⚠️ **Ask: cache breakpoint over TOOLS+SYSTEM; strict on all 13 tools; forward user JWT to PostgREST**
  (F2/F3/E4; §10.7); wire `count_tokens` prompt-bloat gate (F4).
- [ ] **Fix Opus-exclusion rationale to latency/cost** (F1; §10.7 — already corrected in plan prose).
- [ ] **Process: `docs/adr/` + template; map every §4 rail-change to an ADR; add `commitlint` in CI**
  (G2/G3/G4; Phase 0/1).

---

## 10. Segment deep-dives

Each segment below is a self-contained unit of work, written to the §6 feature-description standard: a
file inventory, the data flows, a vetted **feature & behaviour catalogue** (every rule, mechanic,
constant, and style choice — named, quoted, and traced to `file:line`), the coupling and guard-rail
surface, current test coverage and the behaviours the new tests must pin, known smells, refactor
opportunities, draft sub-phases, and a tailored Q&A. Fable verifies each against the live codebase
during the scan, deepens any description thinner than §6, and rewrites the "opportunities / sub-phases"
into a concrete backlog during re-planning.

The segments, in dependency order (foundation first):

1. **Design system, app shell & navigation** — tokens, shell, partials, shared utilities.
2. **Home dashboard** — the at-a-glance command centre and its tiles.
3. **Finances** — the affordability/deposit/LISA/money-flow/savings/investment engine + page.
4. **Listings & property** — live feed, fit-scoring, reactions, dossier, saved/rejected.
5. **Areas & map** — location dossiers, matching, map, area data pipeline.
6. **Intelligence engine** — refinement, learned preferences, suggestions, meta-observations.
7. **Ask assistant** — the AI helper + its Supabase Edge Function.
8. **Profile, criteria, setup, journey & outreach** — onboarding, buyer profile, action surfaces.
9. **Backend, storage, data & sync** — Supabase, the storage layer, data files, sync tooling.
10. **Tooling, tests & CI** — the harness, scripts, linters, GitHub Actions (rebuilt under §5).

### 10.0 Working in safe, gradual modules — and decomposing the intelligence engine

Two segments are large enough that "one segment at a time" (§3.1) is still too coarse: the
**intelligence engine** (§10.6) and the **finances engine** (§10.3). For these, Fable must decompose
the segment into independently-rebuildable **modules behind stable interfaces**, so each can be
optimised or wholly replaced without disturbing the others or breaking the live feed/numbers.

**The intelligence engine — mandated decomposition (owner-directed).** The "learning, trends and
refinement process" must be broken down so Fable can efficiently optimise or rebuild *one module at a
time*. The pipeline is already layered; formalise the seams into a contract so each layer is a unit of
work with its own tests (§5) and its own As-is→To-be (§6.1.10):

1. **Reaction capture** — the append-only `listing_reactions` event log (the immutable source of truth;
   everything downstream is derived and replayable from it). Interface: *append a reaction; read the log.*
2. **Signal aggregation** — time-decayed counting per dimension (type/beds/price/outcode/area/outdoor/
   parking). Interface: *log → per-dimension decayed like/reject tallies.*
3. **Statistical gating** — Wilson lower bounds + FDR multi-gate that decide which dimensions are
   *disproportionately* rejected. Interface: *tallies → flagged dimensions with confidence.*
4. **Suggestion lifecycle** — the sticky, user-confirmable proposals (`confirmed_hide`/`confirmed_scrape`)
   built from flags. Interface: *flags → suggestions; user verdict → persisted status.*
5. **Learned-preference weights** — per-signal weights derived from confirmed signals, feeding fit. Interface:
   *confirmed signals → weights consumed by listings fit-scoring (§10.4).*
6. **Meta-observations** — conflict detection (likes drifting from criteria) and next-best-action surfacing.
   Interface: *state → observations/NBAs for the dashboard + refinement page.*
7. **UI levers** — the confidence meter, hide filter, stop-searching probation, sensitivity preset. Interface:
   *read engine state; write user controls.*

Rebuild rule: pin each module's current behaviour with tests (§5), define its interface, then
optimise/replace it behind that interface using the strangler pattern (§3.1) — the feed keeps working
throughout. Never rebuild two engine modules in one branch. The same decomposition discipline applies
to the finance calculators (each `calc-*` is a module behind a tested interface) and to any other
segment that proves too large to move atomically.

---
## 10.1 Segment: Design system, app shell & navigation

**Design anchors:** **Stripe-docs** (editorial pages: profile, area-detail, property-dossier, journey, outreach) + **Linear-dense** (data-rich: dashboard, areas, finances, listings, refinement, report). The visual language is "calm precise editorial" — restrained palette, generous whitespace, deliberate typography, no generic AI/SaaS patterns. All colour, spacing, and motion values flow from tokens; no hard-coded hex or arbitrary px.

**Guard-rail surface (§16 files, redesignable under §4 rail-change protocol):** `assets/css/tokens.css` (OKLCH hues, type scale, spacing base), `assets/js/config.js` (URL resolution, namespace constant), `assets/js/data-loader.js` (JSON load + cache), plus the shell-entry pattern in `index.html` + `components.js`. Redesign of these files is permitted if a phase (1) names the change clearly, (2) updates all cascading references, (3) runs the full test harness. The test layer (NEW §5) now pins the contracts that must hold across redesigns.

---

### File inventory

| File | Purpose (sourced from code read) |
|------|----------|
| `index.html` | Single entry point; declares `<div data-include>` slots for partials (header, nav, footer); houses the primary `<main id="main">` landmark; dashboard grid: 12 tiles (deposit, readiness, affordability, flow, networth, scenarios, deposit-risk, shortlist, criteria, journey, ask, withdraw-ready) + stat-strip lede; `<script data-auth-state>` flash prevention; View Transitions opt-in via `@view-transition` in base.css; loads `components.js` + page-specific module (e.g. `page-home.js`). |
| `components/header.html` | Skip-link + sticky header (`position: sticky; z-index: 20`); brand logo/mark (custom house SVG, `stroke="currentColor"`); header-actions flex: user email (hidden on phones, shown 768+), sign-out button, theme toggle (moon/sun SVG icons swapped via `[aria-pressed]` CSS). Fixed burger toggle (`position: fixed; z-index: 60; top/left: max(space, env(safe-area-inset-*))`) with hamburger icon (3-line, custom SVG). Backdrop blur on header + burger. |
| `components/nav.html` | Native `<dialog id="nav-drawer">` (opened by burger, z-index 50, 86vw width capped at 20rem); 12 nav items (home, ask, listings, saved, rejected, trends, areas, profile, finances, journey, outreach, report); brand logo in drawer head; close button (X icon); `overflow-y: auto` with `overscroll-behavior: contain`; slide-in animation 220ms via `@keyframes nav-drawer-in` (translateX, honoured by reduced-motion). Backdrop: semi-opaque ink + blur. All links carry `data-nav="path"` for active-state marking + page navigation. Focus trapped by native `<dialog>`. |
| `components/footer.html` | Static footer span; attribution text only ("GR — property search dashboard"). Hard-coded; no data binding, no versioning, no links. |
| `assets/css/tokens.css` | Authoritative source of all visual values (guard-rail, redesignable via §4 protocol). **Hues:** `--hue-ink: 250` (blue-cast near-black), `--hue-paper: 95` (warm off-white), `--hue-accent: 160` (emerald). **Surfaces:** `--paper` (99% / 0.005 chroma), `--paper-2/-3` (elevation steps), `--ink` (20%), `--ink-muted` (60% blend), `--ink-subtle` (40% blend via `color-mix`), `--hairline` (12% blend, 1px borders), `--hairline-strong` (22% blend). **Accent cascade:** `--accent` (55% L / 0.12 C), `--accent-hover` (88% mix toward ink), `--accent-soft` (14% mix toward paper), `--accent-ink` (70% mix), `--accent-contrast` (paper on dark, paper on dark). **Semantic aliases:** `--surface` → `--paper`, `--ink-1/-2/-3`, `--positive/*-soft`, plus single danger colour `oklch(50% 0.18 27)`. **Pico mappings:** `--pico-primary-*`, `--pico-background-color`, `--pico-card-*` all read from token vars (no remix of Pico internals). **Type:** `--font-display: "Fraunces"` (variable, optical sizing, 400/600), `--font-body: "Instrument Sans"` (400/500), `--font-data: "JetBrains Mono"` (400/500, tabular numerals + zero variants). **Scale:** 1.250 minor-third ratio; `--text-xs … --text-4xl` via `clamp()` (responsive without @media breakpoints: min / mid-slope + vw% / max). **Leading:** `--leading-tight: 1.15` (headings), `--leading-snug: 1.3` (subheads), `--leading-body: 1.55` (prose). **Spacing:** strict 4 px base — `--space-1 … --space-24` (0.25 … 6 rem / 4 … 96 px). **Radius:** `--rec-radius: 12px` (cards), `--rec-radius-sm: 8px` (inputs, buttons), no third values. **Focus ring:** `--focus-ring: 0 0 0 3px color-mix(… 55% accent …)` (box-shadow, 3:1 both sides, `:focus-visible` only). **Motion:** `--ease-out`, `--ease-in-out` cubic-bezier easing. **Header dynamic:** `--header-h` set by `components.js initHeaderHeightVar()` on resize (default 64px), read by scroll-margin-top rules (Focus Not Obscured §2.4.11). **Dark theme:** `[data-theme="dark"]` selector + `@media (prefers-color-scheme: dark):root:not([data-theme])` auto-detection; both override the same 15–20 custom props with dark lightness/saturation values (no hue rotation, OKLCH uniform perceptual shift). **Pico v2 contract:** every `--pico-*` var consumed by Pico's CSS is remapped to our tokens, so Pico's buttons/links/forms inherit the unified system. |
| `assets/css/base.css` | Global layout + shared component imports (order-sensitive `@import` shell, guard-railed). Loads component partials: card, tile, sheet, chip, segmented, table, field, dialog, toc, save-bar, filter-sheet, finance-stage. **Body:** `font-family: --font-body`, `font-feature-settings: "ss01" "cv11" "kern"` (stylistic sets + kerning), no-flash via `[data-auth-state="pending"] body { visibility: hidden; }`. **Headings (h1–h4):** Fraunces display font, optical sizing, `font-feature-settings: "ss01" "ss02" "kern" "liga"` (serif alternates + ligatures on heads), tight leading, letter-spacing -0.012em / -0.02em (h1). **Numerals:** class="num" uses `--font-data` + `font-variant-numeric: tabular-nums` + "tnum"/"zero" features. **View Transitions:** `@view-transition { navigation: auto; }` enables cross-document transitions (280ms, ease-out); named `area-title` transition (400ms) for title morph (set in page-areas.js `style.viewTransitionName`); both respect reduced-motion. **A11y:** `@media (prefers-reduced-motion: reduce)` nulls all animations/transitions to 0.01ms (global), `:focus-visible` ring (outline 2px accent + box-shadow focus-ring, border-radius 8px), `.skip-link` (position absolute, `translateY(-150%)` default, visible on focus via translateY(0), z-index 100). **Layout skeleton:** `html body { min-height: 100dvh; display: flex; flex-direction: column; }`, `overflow-x: clip` (no horizontal scroll, not hidden so sticky descendants stay layout-consistent). **Header:** `position: sticky; top: 0; z-index: 20;` (always reachable); flex row (space-between); padding: `max(space-3, env(safe-area-inset-top))` top, `max(…, env(safe-area-inset-{left,right}))` sides (notch-safe on landscape); background: 92% paper + backdrop-filter blur(10px) saturate(150%); border-bottom: 1px hairline. **Burger toggle:** `position: fixed; z-index: 60; top/left: max(space-2, env(…))` (always visible, notch-safe); `width/height: --tap-min` (44px); grid place-items center; background: 88% paper + backdrop blur(12px); border: 1px hairline; transitions (120ms) on color/border/background for hover. **Brand mark:** inline-flex, custom house SVG, `stroke="currentColor"` (theme-aware), 1.9rem × 1.9rem. **Theme toggle:** inline-flex button, 44px min; `[aria-pressed]` drives icon swap (moon visible when pressed=false, sun when pressed=true) via CSS `:not([aria-pressed="false"]) .icon--moon { display: none; }`; aria-label updates on toggle. **Header actions:** flex row, gap; user email (text-xs, muted, 18ch max, ellipsis), sign-out button (text-xs, secondary outline Pico style), theme toggle (as above). **Nav drawer:** `position: fixed; inset: 0 auto 0 0; z-index: 50; width: min(86vw, 20rem); height: 100dvh` (full-height left slide-in); padding top/left: `max(space-3, env(safe-area-inset-*))` (notch-safe); flex column, gap space-2; `overflow-y: auto; overscroll-behavior: contain`; `[open]` animation: 220ms translateX(-100% → 0), ease-out (reduced-motion off); `::backdrop` 35% ink + blur(2px). **Drawer nav links:** flex, min-height 44px, padding 0.5rem / 0.75rem, text-sm, muted by default, hover: paper-2 bg + full ink color; `[aria-current="page"]`: full ink + 600 weight + paper-2 bg + left 3px accent bar `::before` (absolute inset). **Short viewport (max-height: 600px):** drawer tightens (gap 0, padding space-2/1, nav links reduced to floor), maintaining 44px touch target. **Main container:** `width: 100%; max-width: --rec-maxw (1120px); margin-inline: auto; flex: 1 0 auto;` (fills height above footer); padding-block: space-6, padding-inline: `max(clamp(0.75rem, 4vw, 2rem), env(safe-area-inset-*))` (responsive safe-inset aware). **Page head:** margin-bottom space-6; `h1` margin: space-1 0 space-2; `p` color muted, margin 0. **Page head with actions:** `flex column` (phones, full-width buttons), `flex row` (768+, space-between, button flex: 0 0 auto). **Footers:** push down via flex: 1 0 auto on main; static, simple text. |
| `assets/css/dashboard.css` | Guard-railed `@import` entry shell (order-sensitive, holds the imports only — new component CSS appended only, no direct rules). Imports 18 dashboard tile partials (tile-card structure, tile-deposit-arc/flow, tile-readiness, tile-scenarios-fan, tile-networth, tile-afford, tile-flow, tile-shortlist, tile-criteria, tile-journey, tile-ask, etc.) + 9 page-specific partials (pages/home.css, pages/areas.css, pages/finances.css, pages/journey.css, pages/outreach.css, pages/profile.css, pages/property.css, pages/report.css, pages/listings.css). The bento grid itself: `.bento` (grid auto-fit, dense packing, responsive 1–2–3 col), `.band-label` (section headers, same line-height as tiles). |
| `assets/css/components/{card,tile,chip,dialog,field,filter-sheet,finance-stage,outreach,save-bar,segmented,sheet,toc}.css` | Shared primitives. **card.css:** hairline border (1px `--hairline`), padding space-4, `@container card (max-width: 360px)` narrow adaptation. **tile.css:** 2-col grid on phones, `auto-fit` dense row ≥768px, `--rec-gap` (space-4) spacing, enforces iPad 600–800 rule (no intermediate breakpoints). **dialog.css:** `max-width: 90vw; max-height: 90dvh`, centered (CSS Grid), shadow-lg elevation, close button 44px, keyboard trap enabled, header/body/footer sections. **field.css:** label + input + error semantics, 44px min-height controls, focus (outline accent + focus-ring shadow), disabled state, required marker (icon + aria). **chip.css / segmented.css:** button groups, pill-shaped (border-radius: 999px), flex rows, gap space-1, active state: accent bg + accent-contrast text, toggle semantics via `[aria-pressed]`. **filter-sheet.css:** sheet modal for filter UI, chip rows scrollable w/ scroll-snap, apply/reset buttons. All primitives use `--space-*` / `--rec-radius*` / `--accent` / `--paper-*` tokens only; zero hard-coded colours/sizes. |
| `assets/js/components.js` | Shell bootstrap: entry point for every page. **Partial injection** (`injectIncludes()`, lines 20–36): finds all `[data-include]` divs, fetches each partial as HTML (concurrent via `Promise.all`), parses into template, replaces div with fragment (no error timeout; logs to console; continues on fetch fail). **Active nav** (`setActiveNav()`, lines 38–49): normalises location pathname (strips index.html, trailing slashes), compares to resolved `data-nav` hrefs, sets `aria-current="page"` on match (CSS marks with left 3px accent bar via `::before`). Path normalisation: `new URL(p, location.origin).pathname` (may diverge on GitHub Pages sub-paths; no tests). **Theme system** (lines 51–82): `effectiveTheme()` reads `localStorage[${STORAGE_NS}:theme]` ('light' or 'dark'), falls back to system `matchMedia('(prefers-color-scheme: dark)')`, defaults 'light'; `applyTheme(saved)` sets `[data-theme="light"|"dark"]` on `<html>` or removes attr for system default; `updateToggle(btn)` sets `aria-pressed` + `aria-label` + `.theme-toggle__label` text to match current theme; `initTheme()` wires click handler (toggle next theme, save to localStorage, apply + update button). **Nav drawer** (`initNavDrawer()`, lines 85–110): gets `<dialog id="nav-drawer">` + burger toggle button; wires `click` → `showModal()` / `close()`; backdrop click (outside drawer bounds check) closes; any nav link click closes; `aria-expanded` tracks open state on burger. Browser focus trap automatic on native `<dialog>`. **Header height dynamic var** (`initHeaderHeightVar()`, lines 112–119): reads `.site-header` computed `offsetHeight` (default 64px), writes to `--header-h` CSS var; resize listener (passive) updates on-the-fly (used by scroll-margin-top for focus-not-obscured compliance). **Flash prevention** (lines 122): `applyTheme(localStorage.getItem(THEME_KEY))` runs **before** includes resolve (ASAP before CSS paints). **Startup sequence** (lines 124–131): after partials inject, calls `setActiveNav()`, `initTheme()`, `initNavDrawer()`, `initHeaderHeightVar()`, then `await initHeaderUser()` (async), then fires `shell:ready` custom event (page modules await this before rendering). **Header user** (`initHeaderUser()`, lines 134–154): imports `storage.js` `getCurrentUser()` + `signOut()`, populates `#header-user` (email, unhidden ≥768px), wires sign-out button (click → `signOut()` → navigate to login); catches silently (pre-setup mode fallback). **Exports** (line 156): `injectIncludes`, `setActiveNav`, `initTheme`, `effectiveTheme` (for other modules to query theme or listen). |
| `assets/js/auth-guard.js` | Auto-run IIFE (no exports); checks Supabase session on every page load (except setup + login). **Flash prevention:** blocking `<script>` in `index.html` head sets `<html data-auth-state="pending">` (body visibility: hidden); this module removes attr once session confirmed (synchronous reveal, no DOM flicker on auth'd pages; on unauthenticated pages, redirect happens before anything renders). **Session check** (lines 9–54): reads location pathname, exempts setup + login pages (setup is always accessible for first-time config; login page auto-redirects home if session exists). Imports `supabase-client.js` (may fail pre-setup — caught, silently continues); if import succeeds, calls `supabase.auth.getSession()` (async), checks for `session` object. **Unauthenticated redirect:** if no session on a non-login page, navigates to `pages/login.html?next=${encodeURIComponent(location.href)}` (page stays hidden, never flickers). **Login page:** if session exists, redirects to `?next` param (query string) or home. **Pre-setup mode:** if `supabase-client.js` import fails, removes `data-auth-state` and continues (page reveals, no auth check). Fallback is silent — no error boundary; if user later navigates to a data-driven page, data fetch fails with console error only. |
| `assets/js/config.js` | Guard-railed module for URL resolution. **APP_BASE** (line 6): `new URL('../../', import.meta.url).href` — resolves this module's own URL (`assets/js/config.js`) and backs up to root, yielding `/` locally or `/rec/` on GitHub Pages (automatic, no config). **url()** helper (line 9): resolves app-root-relative paths (leading `/` stripped), returns absolute URL (works both locally and on GitHub Pages without code change). **STORAGE_NS** (line 11): constant `'rec'` (used by `components.js` for localStorage key prefix, e.g. `rec:theme`). |
| `assets/js/data-loader.js` | Low-level JSON cache layer. **loadJSON(name)** (lines 10–18): takes bare name ('areas') or app-root-relative path ('data/fixtures/sample.json'), resolves full path, checks in-memory `Map` cache, if hit returns cached data, if miss fetches via `url(path)`, parses JSON, caches, returns. Non-200 throws with message. **clearCache()** (line 21): empties cache (test cleanup). Used by all page modules to load `/data/*.json` datasets (areas, house-types, checklists, outreach-templates). |
| `assets/js/format.js` | Pure formatter functions: `gbp(num)` (Intl.NumberFormat GBP, no decimals), `gbpPence(num)` (with .00), `pct(num, decimals)` (percentage), `monthsAsDuration(n)` (years + months text), `dateFromMonths(baseDate, months)` (future date calc), `monthYear(date)` (Intl.DateTimeFormat, e.g. "June 2026"). No state, no side effects. |
| `assets/js/dom.js` | Micro-utilities: `esc(html)` (escapes HTML entities), `byId(id)` (getElementById shorthand), `setText(id, text)` / `setHTML(id, html)` (by-id setters), `on(el, ev, fn, opts)` (addEventListener, no-op safe if el falsy), `el(tag, attrs, children)` (hyperscript-style element builder), `clear(el)` (remove all children). All functions guard against null/undefined receivers. |
| `assets/js/css-vars.js` | Runtime CSS custom property manipulation (inferred from import, not read). Likely exports setters for `--*` vars that need JS-driven updates (e.g., responsive size calculations, animation timing). |
| `assets/js/motion.js` | Animation + transition orchestration (inferred). Likely exports helpers for coordinating page reveals, named view-transitions, reduced-motion-aware timing. |
| `assets/js/svg.js` | SVG drawing utilities (inferred). Likely exports path/shape/chart drawing helpers used by visualisation modules (deposit arc, sparkline, ladder, networth donut, money-flow bars, refinement fan). |
| `assets/js/types.js` | Type definitions + constants (inferred). May export enums, interfaces (JSDoc style), or app-level constants. |
| `assets/js/supabase-client.js` | Auto-generated by `pages/setup.html` (user runs setup to produce this). Exports `supabase` client singleton (Supabase JS SDK, pre-configured with project URL + publishable anon key). **Key insight:** contains only URL + anon key (both designed to be public in browser apps, safe iff Row Level Security is enforced on every table). **Committed to repo** (`.gitignore` does NOT exclude it) because the key is intentionally public. Schema DDL lives in `supabase/schema.sql` (reference only); migrations applied via MCP `apply_migration`, not hand-copied into the dashboard. |
| `assets/css/fonts.css` | `@font-face` declarations for self-hosted woff2 subsets (Fontsource files in `assets/fonts/`). **Fraunces:** 400/600 weights, full Unicode range (no split, large file but single family). **Instrument Sans:** 400/500, Latin + Latin Extended. **JetBrains Mono:** 400/500, Latin (numerals + punct). All use `font-display: swap` (render fallback immediately, swap when ready — avoids FOUT). Files loaded before `base.css` so no FOUT on first paint. |

---

### Data flows & shell mechanics

#### 1. Partial injection lifecycle (concurrent, fallback-less)
Every page HTML declares `<div data-include="components/header.html">` (3 slots: header, nav, footer). **On page load:**
- `components.js` fires async `injectIncludes()` (line 20), which finds all `[data-include]` nodes.
- Fetches each partial HTML **concurrently** via `Promise.all()` (line 22).
- For each fetch: if 200 OK, creates a `<template>`, parses HTML into it (line 28–29), replaces the div with fragment (line 30). If fetch fails (404, network, timeout), logs error, replaces div with a comment node (lines 31–34, no fallback render, page continues).
- **Race condition:** all three fetches resolve in parallel; slower partial doesn't block faster ones. But partial injection completes *sequentially* (line 30 replaces, then next loop iteration).
- **No timeout:** if a CDN is slow, page waits indefinitely for partial. No minimal fallback (e.g., sticky brand-only bar) available. Accessibility risk: page not focusable until partials arrive.
- After all resolve, continues to `setActiveNav()` (line 125).
- **Known fragility:** if any partial fetch hangs, page enters a "dark mode" (header/nav missing, just content visible). Error is silent console-only.

#### 2. Navigation & active state (relative path normalisation)
All nav links carry `data-nav="pages/foo.html"` (app-root-relative). **Flow:**
- `setActiveNav()` (line 42) reads current `location.href`.
- `normalisePath()` (line 39) converts pathname to canonical form: `new URL(p, location.origin).pathname.replace(/index\.html$/, '').replace(/\/+$/, '')` (strips trailing slashes + index.html).
- For each `[data-nav]` link: resolves `data-nav` value via `url()` (config.js, yields absolute URL), sets `href` attribute (line 46), normalises that URL, compares to current pathname (line 47), sets `aria-current="page"` if match.
- **CSS marks active:** `.nav-drawer__nav a[aria-current="page"]` gets full-colour text + 600 weight + `::before` left 3px accent bar (lines 253–260).
- **Fragility:** `new URL()` + `.pathname` may diverge on GitHub Pages sub-paths (`/rec/pages/…`) vs localhost (`/pages/…`). No test coverage. If path parsing diverges, active state fails silently (wrong link marked, or none marked).

#### 3. Theme system (localStorage → CSS cascade)
**Entry:** applied **before** partials inject (line 122, ASAP). **Runtime toggle:** button in header (lines 71–82). **Storage:** `localStorage[rec:theme]` (values: 'light' or 'dark', no other). **Logic:**
- `effectiveTheme()` (line 52) reads localStorage → system `matchMedia()` → default 'light'.
- `applyTheme(saved)` (line 57) sets `<html data-theme="light">` or `<html data-theme="dark">` or removes attr for system default (line 58–59).
- Toggle button click (line 76): flip current theme, save to localStorage, apply, update button UI (aria-pressed + label text).
- **CSS cascade:** `tokens.css` `:root { --paper: oklch(99% …), --ink: oklch(20% …), … }` (light). `[data-theme="dark"]` overrides same vars with dark values (line 126: `--paper: oklch(15% …)`, `--ink: oklch(94% …)`). `@media (prefers-color-scheme: dark) :root:not([data-theme])` auto-dark without explicit setting (line 153).
- **Design choice:** all colours use `color-mix(in oklch, …)` derivation, so no new hues in dark mode — only lightness/saturation shift (perceptually uniform). `--accent` flips from `oklch(55% 0.12 160)` light to `oklch(72% 0.13 160)` dark (brighter for dark background contrast).
- **Button UI:** theme toggle has two SVG icons (moon, sun), swapped by CSS `[aria-pressed]` attribute selector (lines 201–203: when pressed=false show moon, when true show sun). Label text set to "Dark" or "Light" (line 69, JS-driven).
- **Known smell:** label text mutation (line 69 `querySelector('.theme-toggle__label').textContent = …`) is fragile — if HTML markup changes (class name removed, element moved), toggle breaks silently (icon still swaps, label doesn't, aria-label updated).

> **✅ External validation — Pico v2 theming (C6):** Confirmed. Overriding `--pico-*` custom properties
> with `[data-theme]` + `prefers-color-scheme` is **exactly Pico v2's documented theming approach** — the
> project is using the framework as intended. Two notes: (1) a zero-build (CDN) Pico **cannot tree-shake
> unused components** (that needs the SASS build), so the full CSS ships — accept it or move to a SASS
> build as its own phase; (2) verify overridden variable names match Pico v2's current
> `{component}-{state}-{property}` scheme, since names changed from v1. (picocss.com/docs/css-variables, /v2.)

#### 4. Font loading & feature activation
**Source:** `assets/css/fonts.css` (`@font-face` declarations before `base.css`). **Self-hosted woff2 subsets,** `font-display: swap` (render fallback immediately, swap when WOFF2 parses). **Families:**
- **Fraunces:** 400/600, variable optical sizing (11–144 range).
- **Instrument Sans:** 400/500, contextual alternates ("cv11" feature).
- **JetBrains Mono:** 400/500, tabular numerals, zero variant.
**Feature settings** (base.css, body + headings):
- Body: `font-feature-settings: "ss01" "cv11" "kern"` (Fraunces stylistic set 1, Instrument contextual, kerning).
- Headings: `font-feature-settings: "ss01" "ss02" "kern" "liga"` (serif alts on display, ligatures).
- Numerals (class="num"): `font-variant-numeric: tabular-nums`, `font-feature-settings: "tnum" "zero"` (tabular width, slashed zero).
- **Trade-off:** self-hosted avoids Google Fonts' privacy concerns + ensures precise font loading, but adds file size (3 WOFF2 files ~60kb combined) + no system fallback customisation (fallback stack in tokens.css is generic serif/sans/mono).

#### 5. Auth guard redirect (flash prevention, pre-setup graceful fallback)
**Entry:** `auth-guard.js` IIFE runs immediately on every non-setup, non-login page (lines 9–54). **Flash prevention:**
- Blocking `<script>` in `index.html` head (line 4) sets `<html data-auth-state="pending">` **before** CSS paints.
- `base.css` hides body: `html[data-auth-state="pending"] body { visibility: hidden; }` (line 23).
- Auth-guard confirms session asynchronously, then removes attr (line 53), body becomes visible synchronously (no re-layout, just visibility toggle).
- **On redirect:** page navigates away before anything renders (pending attr stays, never visible).
**Session flow:**
- Exempts setup page (always accessible, line 18–20).
- Imports `supabase-client.js` (catches if missing — pre-setup mode, line 25–31).
- Calls `supabase.auth.getSession()` (line 33).
- Non-login page + no session → redirects to login with `?next=` return URL (line 44–49).
- Login page + session exists → redirects home or `?next` target (line 35–41).
**Known fragility:** pre-setup fallback is silent (no warning that auth check was skipped). If user later navigates to a data-driven page (e.g., finances), data fetch fails with console-only error (no error boundary, no toast).

#### 6. Nav drawer modal (native `<dialog>`, focus trap automatic)
**Markup:** `components/nav.html` contains `<dialog id="nav-drawer">`. **Wiring** (`initNavDrawer()`, lines 85–110):
- Click burger toggle → `dialog.showModal()` (opens).
- Backdrop click (outside drawer bounds check) → `dialog.close()` (closes).
- Any nav link click → `dialog.close()` (closes, so same-page hash links still close drawer).
- Browser native focus trap (no manual tabindex manipulation needed).
**Animation:** `nav-drawer[open]` CSS rule (line 219) applies `@keyframes nav-drawer-in` 220ms ease-out translateX(-100% → 0). Honoured by global reduced-motion rule (line 74–80).
**Accessibility:** `aria-label="Primary navigation"` on dialog, `aria-expanded` on burger tracks open state (wired on toggle + close, lines 97–98).
**Short-viewport rule** (max-height: 600px, lines 265–273): drawer padding/gaps tighten, nav items still 44px min-height (no collapse). Ensures drawer items fit without internal scroll on landscape phones (but does NOT test scroll + focus-trap interaction if scroll is needed).

#### 7. Header height dynamic CSS var (resize listener, scroll-margin-top compliance)
**Function:** `initHeaderHeightVar()` (lines 112–119). **Purpose:** compensate for dynamic header height (e.g., if logo or actions reflow). **Logic:**
- Reads `.site-header` computed `offsetHeight` (falls back to 64px).
- Sets `--header-h` CSS var (document root style property).
- Listens for `resize` event (passive), re-reads height, updates var.
**Usage:** `base.css` skip-link + scroll-margin-top rules use `--header-h` to reserve space for sticky header (WCAG §2.4.11 Focus Not Obscured — focused elements not hidden by sticky header). Example: `:target { scroll-margin-top: var(--header-h); }`.
**Known smell:** only runs on resize, not on dynamic content reflow (e.g., if header logo wraps to two lines). No test exercises resize handler.

---

### Feature & behaviour catalogue (exhaustively vetted)

#### A. Partial injection with error handling (resilience needed)
**Rule:** Every `<div data-include="path/to/partial.html">` slot fetches the partial asynchronously on page load.
**Trigger:** `injectIncludes()` called from `components.js` line 124, awaited before `setActiveNav()`.
**Inputs:** HTML page declaring `[data-include]` divs (all 3 slots in index.html + each page variant).
**Precise logic** (lines 20–35):
- `querySelectorAll('[data-include]')` finds all slots.
- For each slot: `fetch(url(el.getAttribute('data-include')))` (concurrent via Promise.all).
- If `!res.ok` (e.g., 404): throw (caught by catch).
- Parse HTML → `document.createElement('template')`, set innerHTML, replaceWith fragment.
- If fetch fails: log error, replaceWith comment node `<!-- include failed: {path} -->`.
**Outputs:** header, nav, footer partials rendered into page; or missing with comment if fetch failed.
**Edge cases:**
- One slow partial doesn't block others (concurrent), but injection loop is sequential (one div replaced per iteration).
- Fetch error is silent (console.error logged, page continues with missing partial).
- No timeout; if CDN hangs, page waits indefinitely.
- Page not focusable until all partials resolve (no minimal fallback).
**Failure modes:** 404 on footer → page renders without footer (silently). 404 on header → no top bar, burger still on page (lost in DOM until nav injected, which won't happen if header failed). 404 on nav → no drawer.
**Rationale:** Concurrent fetches reduce total load time; sequential injection keeps DOM sane (avoids race on partial replacement). Silent errors keep UX minimal but increase debugging friction.
**Acceptance criteria (NEW tests, §5):** (1) three concurrent fetches to partial paths, success → all partials injected in order (unit); (2) one fetch fails (404) → remaining two injected + failed slot has comment (characterization); (3) partial fetch > 5 sec → [stretch test, not automated] page stuck dark (e.g., devtools throttle); (4) integration: page-home rendered after `shell:ready` event fires post-injection.
**Style/UX/a11y choice:** Silent error keeps app shell minimal (no error toast), but DESIGN.md editorial anchor (calm precise) suggests clarity > minimalism here — a user seeing no header can't understand what failed. Suggested: add timeout + minimal fallback render (sticky brand-only bar) + warning event for Sentry.

#### B. Navigation active-state marking (path normalisation brittleness)
**Rule:** Current page's nav link is marked with `aria-current="page"` and left 3px accent bar.
**Trigger:** `setActiveNav()` (line 42) called after partials inject.
**Inputs:** Current page URL, nav drawer DOM with links carrying `data-nav="pages/foo.html"`.
**Precise logic** (lines 39–49):
- `normalisePath(location.href)` → `new URL(p, location.origin).pathname.replace(/index\.html$/, '').replace(/\/+$/, '')` (converts to canonical pathname).
- For each `[data-nav]` link:
  - Resolves `data-nav` value via `url()` (config.js) → absolute URL.
  - Sets link's `href` attribute.
  - `normalisePath(resolved_url)` → canonical form.
  - If canonical match: set `aria-current="page"`.
**Outputs:** One nav link marked with `aria-current="page"`; CSS `.nav-drawer__nav a[aria-current="page"]` applies full ink colour + 600 weight + `::before` left accent bar (lines 253–260).
**Edge cases:**
- URL trailing slash differences: normalisePath strips all, so `/pages/foo.html/` and `/pages/foo.html` match.
- Hash navigation (e.g., `/profile.html#search`): normalisePath keeps pathname (hash not included in pathname), so both `/profile.html` and `/profile.html#search` normalize to `/profile` and match (correct for same-page links).
- GitHub Pages subpath (`/rec/pages/foo.html` vs localhost `/pages/foo.html`): `new URL(…, location.origin)` + `.pathname` should handle this, but **untested** — if `url()` helper and path normalisation diverge, active state fails.
- Root page index.html → normalises to `/`, data-nav="index.html" resolves to `/index.html` → normalises to `/` (should match, but depends on url() resolution).
**Failure modes:** Different path resolution logic in `url()` and `normalisePath()` → active link never found or wrong link marked. Silent (no console error).
**Rationale:** Normalisation simplifies matching (no trailing-slash jitter), but adds fragility (two URL-parsing paths must align).
**Acceptance criteria (NEW tests, §5):** (1) current page matches nav link → aria-current set (unit: mock location + data-nav, assert aria-current); (2) trailing slash + hash variants normalize correctly (characterization); (3) GitHub Pages subpath: test with location.href = "https://user.github.io/rec/pages/areas.html" (integration, may skip if not in CI environment); (4) active link has left accent bar (DOM inspection or CSS computed style assertion).
**Style/UX/a11y choice:** Active state via `aria-current="page"` is semantic HTML (WCAG best practice); visual bar is decorative (icon-driven, colour-only would fail a11y). CSS-only implementation (no JS state management) is clean but depends on text node matching.

#### C. Theme toggle & persistence (localStorage, cascade verification)
**Rule:** User theme preference (light / dark) is stored in localStorage, reflected in `<html data-theme>`, cascaded through CSS token system.
**Trigger:** Button click in header (`#theme-toggle`, wired in `initTheme()` line 76).
**Inputs:** Current effective theme (system or saved override); button state in header.
**Precise logic** (lines 51–82):
- `effectiveTheme()` (line 52): reads `localStorage[rec:theme]` (strict 'light' or 'dark' check, line 54), falls back to `matchMedia('(prefers-color-scheme: dark)').matches` (system preference), defaults 'light'.
- `applyTheme(saved)` (line 57): if saved is 'light' or 'dark', sets `<html data-theme="{saved}"`; otherwise removes attr (system default).
- Button click (line 76): flip theme (dark → light, light → dark), save to localStorage (line 78), apply (line 79), update button UI (line 80).
- `updateToggle(btn)` (line 61): reads effective theme, sets aria-pressed (true if dark, false if light), aria-label (switch to opposite), label text (.theme-toggle__label).
- **ASAP apply** (line 122): theme is applied **before** partials inject, reducing flash (localStorage read synchronous, applied before CSS paints).
**CSS cascade** (tokens.css):
- `:root { --paper: oklch(99% …), … }` (light values).
- `[data-theme="dark"] { --paper: oklch(15% …), … }` (dark values, same vars, different values).
- `@media (prefers-color-scheme: dark) :root:not([data-theme]) { … }` (auto-dark if no explicit attr).
- All component CSS consumes `--paper`, `--ink`, `--accent`, etc. (no hardcoded colours).
**Outputs:** Page re-renders with dark or light token values; icon swap (CSS selectors on aria-pressed); button label updated.
**Edge cases:**
- localStorage inaccessible (private browsing, very old browser): `effectiveTheme()` fails gracefully (falls back to system → defaults 'light'). Click handler still works (theme not saved, but applied for this session).
- Two theme toggles on same page: both wired separately, both update, both toggle (no race because toggle is sync).
- Page reload after toggle: localStorage read → theme re-applied (no flash because applied in head script).
**Failure modes:** 
- Label text mutation fails (lines 69, querySelector returns null) → aria-label updated, visible label stale (icon swapped correctly, so partial UX).
- Token var not defined in dark mode (e.g., a component refs `--custom-red` which doesn't exist) → CSS inheritance breaks, falls back to system value (likely wrong colour).
**Rationale:** localStorage is simplest persistence (no round-trip to Supabase); system preference fallback respects OS dark mode. ASAP apply reduces flash (key UX win for dark mode users).
**Acceptance criteria (NEW tests, §5):** (1) toggle button click: theme flips, localStorage updated, `data-theme` attr set (unit); (2) page reload after toggle: localStorage read, theme re-applied (no flash test, but assertion that attr set before render); (3) SVG icons swap correctly (moon shown when pressed=false, sun when true — CSS computed styles or DOM inspection); (4) all `--paper`, `--ink`, `--accent` vars defined in both `:root` and `[data-theme="dark"]` (linting assertion, NEW); (5) `color-mix` derivatives resolve correctly in both themes (difficult to test without rendering, hand-off to developer QA).
**Style/UX/a11y choice:** Icon swap (moon/sun) via CSS (no glyph characters, avoiding tofu-box fallback) is WCAG-safe (aria-label provides text alternative). Saving preference to localStorage is UX best practice (respects user choice). Cascade via CSS tokens is architurally sound (single source of truth per theme).

#### D. Token cascade: OKLCH derivation + color-mix (colour accessibility)
**Rule:** All colour values flow from `--hue-ink`, `--hue-paper`, `--hue-accent` hues; hue-independent surfaces (`--paper*`, `--ink*`) and accent shades derive via `color-mix(in oklch, …)`.
**Trigger:** CSS loads tokens.css (line 14 in index.html).
**Inputs:** Base hues (250 ink, 95 paper, 160 accent), OKLCH perceptual space definition.
**Precise logic** (tokens.css, lines 5–179):
- **Hues (comment, not tokens):** `--hue-ink: 250`, `--hue-paper: 95`, `--hue-accent: 160`.
- **Base surfaces:**
  - Light: `--paper: oklch(99% 0.005 var(--hue-paper))` (near-white, very desaturated, warm cast).
  - `--ink: oklch(20% 0.020 var(--hue-ink))` (near-black, slight blue cast, very low saturation).
- **Derived (via `color-mix`):**
  - `--ink-muted: color-mix(in oklch, var(--ink) 60%, var(--paper))` (60% ink, 40% paper, desaturated).
  - `--ink-subtle: color-mix(in oklch, var(--ink) 40%, var(--paper))` (40% ink, lighter).
  - `--hairline: color-mix(in oklch, var(--ink) 12%, var(--paper))` (very subtle border).
  - `--accent-hover: color-mix(in oklch, var(--accent) 88%, var(--ink))` (accent tinted toward ink for hover, darker).
  - `--accent-soft: color-mix(in oklch, var(--accent) 14%, var(--paper))` (14% saturated accent, 86% paper, very subtle background).
- **Dark theme override** (`[data-theme="dark"]`, lines 126–150): same derivation logic, different base values (e.g., `--paper: oklch(15% 0.015 var(--hue-ink))` — dark bg using ink hue for perceptual contrast, ink flipped to light). **No hue rotation:** accent stays 160, only lightness + saturation change (perceptually uniform across theme).
- **Semantic aliases:** `--surface` → `--paper`, `--ink-1/-2/-3`, `--positive` (accent), `--danger: oklch(50% 0.18 27)` (second genuine colour, for error states).
**Outputs:** All component CSS uses `var(--paper)`, `var(--accent)`, etc.; resolves to OKLCH values at render time. Pico CSS reads `--pico-*` vars (mapped to our tokens, e.g., `--pico-primary-background: var(--accent)`).
**Edge cases:**
- Browser doesn't support `color-mix(in oklch, …)`: value invalid, property ignored, fallback to inherited/initial value (likely wrong colour, may be white or transparent).
- `var(--hue-accent)` used in derived token: if hue var is missing, `color-mix` fails (but hue is set at `:root`, so safe).
- Dark theme incomplete: a token defined in `:root` but not in `[data-theme="dark"]` → dark mode reads light value (wrong contrast). NEW test (linting): assert all `--*` vars in dark block match `:root` set.
**Failure modes:**
- Token value typo (e.g., `oklch(99% 0.005 var(--hue-papery))`) → CSS invalid, property ignored, cascades wrong colour.
- Hardcoded hex in component CSS (DESIGN.md §3 ban) → not resolved from tokens, can't adapt to theme (design debt, caught by linting).
**Rationale:** OKLCH perceptual uniformity means lightness shifts are consistent across hues (dark mode swap is arithmetic, not colour-by-colour tweaking). `color-mix` is mathematically pure (no magic hex remapping). Single-accent discipline (emerald only) keeps palette calm + accessible.

> **✅/⚠️ External validation (C1):** OKLCH + `color-mix()` is **confirmed best practice for 2026**
> (now Baseline). **But add a fallback requirement:** guard the **base** tokens (`--paper`, `--ink`,
> `--accent`, `--danger`) with `@supports (color: oklch(0 0 0)) { … }` or a plain hex/`rgb()` fallback
> declared *before* the OKLCH value, so a browser that doesn't support OKLCH/`color-mix` can't blank
> the whole palette (the current edge-case at lines 824–825 — "value invalid, property ignored" — would
> otherwise cascade white/transparent). Note: editing `tokens.css` is a guard-railed §16 change, so the
> fallback work is its own named phase. ⚠️ correction required in code (tokens.css). (caniuse;
> modern-css.com, Feb 2026.)
**Acceptance criteria (NEW tests, §5):** (1) all `--*` vars defined in both `:root` and `[data-theme="dark"]` (linting assertion, NEW); (2) `color-mix` syntax valid (CSS parser, NEW); (3) contrast ≥3:1 on interactive elements (text + button outlines), ≥4.5:1 on body text, measured in both light + dark (difficult without rendering, hand-off to developer QA but capture ratios in constants for assertions); (4) no hardcoded hex values in component CSS (grep linting, NEW); (5) accent tone difference between themes is mathematically consistent (L and C changes only, not H) (assertion on parsed OKLCH values).
**Style/UX/a11y choice:** OKLCH perceptual-uniformity is future-proofing (will work correctly on HDR displays); `color-mix` is CSS-native (no preprocessing, no build step). Contrast ≥4.5:1 exceeds WCAG AA (WCAG: ≥4.5:1 for normal text, ≥3:1 for large text + UI components); hand-verified on developer QA (no automated screenshot tool).

#### E. Font loading with feature activation (swap display, stylistic sets)
**Rule:** Three families (Fraunces, Instrument Sans, JetBrains Mono) are self-hosted WOFF2 subsets; all use `font-display: swap` (render fallback, swap when ready).
**Trigger:** CSS loads fonts.css (line 13 in index.html, before base.css).
**Inputs:** @font-face declarations, unicode-range splits, feature flags.
**Precise logic** (fonts.css + base.css):
- **@font-face:** self-hosted woff2 files in `assets/fonts/`, unicode-range split (e.g., Instrument Sans 0–255 = Basic Latin, 256–383 = Latin Extended).
- `font-display: swap` (fonts.css): render page with fallback (serif/sans/mono from tokens.css fallback stack) immediately, swap to WOFF2 when parsed (no FOUT on first paint, instant readability).
- **Feature activation** (base.css lines 25–37):
  - Body: `font-feature-settings: "ss01" "cv11" "kern"` (Fraunces stylistic set 1, Instrument contextual alternates, kerning).
  - Headings (h1–h4): `font-feature-settings: "ss01" "ss02" "kern" "liga"` (Fraunces serif alts + ligatures).
  - Numerals (class="num"): `font-variant-numeric: tabular-nums`, `font-feature-settings: "tnum" "zero"` (tabular width, slashed zero for 0 vs O clarity).
- **Variable optical sizing:** Fraunces `font-optical-sizing: auto` (browser auto-tunes font metrics based on size, e.g. H1 is large → looser serifs, body is small → tighter).
**Outputs:** Page renders with fallback fonts immediately (fallback stack is generic serif/sans/mono), WOFF2 swapped in when ready (imperceptible to user, typically <100ms on good connection).
**Edge cases:**
- Very slow connection: fallback fonts visible for several seconds before swap. Browser may choose to not swap if file takes >3s (timeout varies by browser/network).
- Missing WOFF2 file (404): fallback font stays (no error, just layout may shift if fallback has different metrics).
- Feature unsupported: browser ignores unsupported feature settings (e.g., "cv11" if not in font), text renders without that variant (no error).
- Unicode coverage gap (e.g., emoji): not in WOFF2 range, falls back to system emoji font (expected behaviour).
**Failure modes:**
- Fallback serif/sans stack doesn't exist on user's system → browser chooses generic fallback (Arial, etc.), metrics very different, layout shift on swap.
- Feature name typo (e.g., "ss01" vs "ss02") → browser ignores, text renders without variant (visual regression, caught by developer QA).
**Rationale:** Self-hosted WOFF2 avoids Google Fonts privacy concerns + ensures font delivery (no third-party outage). `font-display: swap` + feature settings are WCAG-safe + performant (instant first paint, graceful degradation).
**Acceptance criteria (NEW tests, §5):** (1) WOFF2 files exist in `assets/fonts/` (file linting); (2) @font-face declarations match file paths (linting); (3) feature settings are valid CSS (parser linting); (4) fallback font stack is defined in tokens.css (linting); (5) font swap works on slow connection (difficult test, hand-off to developer with devtools throttle). (6) optical sizing works on Fraunces (visual QA, no assertion).
**Style/UX/a11y choice:** `font-display: swap` is best practice for performance + readability (instant paint > pretty fonts); feature activation (stylistic sets, contextual alternates) is optional elegance (enhances readability, degrades gracefully if unsupported). Self-hosting is privacy-respecting + future-proof (no CDN outage).

#### F. Auth guard redirect with flash prevention (blocking script, session check)
**Rule:** Before rendering any non-setup, non-login page, check Supabase session; if none, redirect to login (while body hidden).
**Trigger:** `auth-guard.js` IIFE runs immediately on page load (before body paints).
**Inputs:** Current page path, Supabase session (or error if pre-setup).
**Precise logic** (auth-guard.js, lines 9–54):
- **Flash prevention:** blocking `<script>` in index.html head (line 4) sets `<html data-auth-state="pending">` **before** CSS paints.
- `base.css` rule (line 23): `html[data-auth-state="pending"] body { visibility: hidden; }` (hides body, renders as zero-height).
- **Auth-guard IIFE** (async, lines 9–54):
  - Read location.pathname, check if setup or login page (lines 12–21).
  - If setup: remove `data-auth-state` immediately (always accessible), return (line 19–20).
  - If login: remove `data-auth-state`, check for session (async), redirect home if session exists (line 35–41), else return (login page shows login form).
  - For other pages:
    - Import `supabase-client.js` (line 25, may fail pre-setup) → catch and return (pre-setup mode, reveal body, continue without auth).
    - Call `supabase.auth.getSession()` (async, line 33).
    - If no session: redirect to `pages/login.html?next={encodeURIComponent(location.href)}` (line 44–49), page stays pending (never visible).
    - If session: remove `data-auth-state` (line 53), reveal body, continue.
**Outputs:** Unauthenticated users on non-login pages redirected to login (page never flickers). Setup page always accessible. Pre-setup mode continues without auth check.
**Edge cases:**
- Session expired during IIFE await: `getSession()` returns no session, user redirected mid-interaction (abrupt but safe).
- `supabase-client.js` import throws for reason other than missing (e.g., syntax error): caught generically, treated as pre-setup (silent fallback).
- Page navigation via redirect is slow: pending state holds until navigation away. If redirect hangs, page stays hidden (user sees blank white page, doesn't understand why).
**Failure modes:**
- Pre-setup fallback is silent: user sees page (no auth check), clicks a data-driven tile, data fetch fails (no error UI, just console error). No guidance.
- Session check timeout: `getSession()` stalls, page stays pending indefinitely (browser timeout ~30s, user sees blank).
**Rationale:** Flash prevention (blocking script + visibility hidden) is critical UX (dark mode users don't see light flash; auth'd users don't see login page briefly). Pre-setup graceful fallback lets users access the app before Supabase is configured (required for first-time setup wizard to work).
**Acceptance criteria (NEW tests, §5):** (1) pending attr set before render (document.head inspection, characterization); (2) unauthenticated page redirects to login (mock session empty, assert location.href changed); (3) setup page always accessible (mock any path, assert no redirect); (4) pre-setup graceful fallback (mock import fail, assert body revealed); (5) body revealed synchronously after session confirmed (timing test, may skip if hard to automate); (6) ?next param preserved on login → redirect (integration: login page reads query, asserts next URL is set).
**Style/UX/a11y choice:** Flash prevention is essential UX (WCAG best practice, reduces cognitive load). Pre-setup fallback respects first-time setup flow (can't require auth before auth is possible). Redirect loop protection (setup → login → redirect loop) is handled by exempting setup page (safe).

#### G. Nav drawer dialog with focus trap (native `<dialog>`, automatic keyboard capture)
**Rule:** Nav drawer is a native HTML `<dialog>`, opened by burger toggle; backdrop click and nav link clicks close it; browser traps focus inside.
**Trigger:** Burger toggle click → `initNavDrawer()` (wired in components.js line 127).
**Inputs:** `<dialog id="nav-drawer">` DOM, burger toggle button, nav links with click handlers.
**Precise logic** (lines 85–110):
- `initNavDrawer()` (line 85): gets dialog and toggle button.
- Click burger toggle (line 93) → `dialog.showModal()` (opens, focus trapped by browser, backdrop rendered).
- Backdrop click check (line 101–106): if click target is dialog (not inner content), calculate bounding rect, check if click is outside, close if so.
- Any nav link click (line 109) → `dialog.close()` (includes same-page hash links, ensuring drawer closes even if page doesn't navigate).
- `aria-expanded` tracking (line 97–98): set true on open, false on close.
**CSS animation** (base.css, lines 219–220): `[open]` state applies `@keyframes nav-drawer-in` 220ms ease-out translateX(-100% → 0). Honoured by global reduced-motion rule (line 74).
**Backdrop styling** (base.css, lines 221–224): 35% ink + blur(2px) (semi-opaque, subtle blur, theme-aware via ink colour).
**Short-viewport optimization** (lines 265–273): if max-height 600px (landscape), drawer tightens (gap 0, padding space-2 top/bottom, nav items still 44px min-height, padding-block reduced to space-1).
**Outputs:** Nav drawer slides in, focus trapped, backdrop visible; backdrop click or nav click closes drawer; burger aria-expanded reflects state.
**Edge cases:**
- Very short viewport (max-height <300px, unlikely but possible): nav items stack, may scroll internally (drawer has `overflow-y: auto`). Scroll + focus-trap interaction untested.
- Backdrop click in landscape: click coordinate-checking may have rounding errors (left/right insets from env(safe-area-inset-*) may push drawer partially off-screen). Coordinate check assumes rectangular panel.
- Nav link is a button (not anchor): click handler fires, but button doesn't navigate → drawer closes, page stays (correct for toggleable buttons, but untested).
**Failure modes:**
- Native `<dialog>` unsupported (very old browser): `showModal()` does nothing, drawer never opens (silently broken). No fallback.
- Focus trap interferes with page modals: if another `<dialog>` opens while nav is open, both trap focus (browser handles, may be confusing).
**Rationale:** Native `<dialog>` is accessible (focus trap, backdrop, ARIA attributes automatic). Click-outside-to-close (backdrop click) is UX best practice. Slide animation (CSS-only) is performance-friendly.
**Acceptance criteria (NEW tests, §5):** (1) burger click opens drawer (`dialog.open` assertion); (2) backdrop click closes drawer (synthetic click on ::backdrop, assert closed); (3) nav link click closes drawer (click synthetic link, assert closed); (4) focus trapped inside drawer (Tab key cycles through nav items only, characterization); (5) aria-expanded reflects state (assertion on aria-expanded attribute); (6) slide animation runs 220ms (computed style getAnimationDuration, may skip if hard to mock); (7) short-viewport (max-height 600px) doesn't collapse nav items below 44px (style linting or computed style check).
**Style/UX/a11y choice:** Native `<dialog>` is WCAG-compliant (automatic focus trap, backdrop, semantics). Slide animation (CSS) is performance-friendly (GPU-accelerated). 44px min-height maintained even in short viewports respects touch-target minimum (§2 WCAG).

> **✅ External validation — target size (C2):** Confirmed, with a clarification. WCAG 2.2 **AA** SC
> 2.5.8 minimum is **24×24 CSS px**; the project's preferred **44×44 is AAA SC 2.5.5 / native-platform
> guidance**, so it **exceeds the AA floor** (state this explicitly rather than implying 44 is the AA
> requirement). Ensure the **hit area** (including padding), not just the visual box, meets the size —
> the floor is about the interactive target, not the icon. (W3C WAI; TetraLogical, Oct 2023.)

#### H. Skip-link & landmarks (first focusable element, proper heading structure)
**Rule:** Page starts with skip-link (visually hidden, visible on focus), points to `<main id="main">`; header/nav/footer are proper landmarks.
**Trigger:** HTML structure in index.html + CSS in base.css.
**Inputs:** Header, nav, main, footer semantic elements.
**Precise logic** (components/header.html line 1 + base.css lines 91–103):
- `.skip-link` (first element in header partial): anchor to `#main`, visually hidden by default (`transform: translateY(-150%)`).
- `:focus-visible` on skip-link: `transform: translateY(0)`, visible at top-left, accessible via keyboard (Tab from page start).
- Click skip-link: browser scrolls to `#main` (native anchor behavior), page focuses `<main>`.
**Landmark structure** (index.html + components):
- `<header class="site-header">` (sticky, z-index 20) — `<nav>` inside is secondary.
- `<nav>` inside `<dialog id="nav-drawer">` — `aria-label="Primary navigation"`.
- `<main id="main" class="container">` — primary content.
- `<footer>` (implicit from components/footer.html) — footer landmark.
**WCAG contract** (§2.4.1 Focus Visible, §1.3.1 Info + Relationships):
- Skip-link ensures keyboard users can jump to main content (WCAG §2.4.1, SCs 2.1.1, 2.4.3).
- Proper `<nav>`, `<main>`, `<footer>` help screen-reader users navigate (§1.3.1 semantic structure).
- Focus visible (`:focus-visible` outline + ring) for keyboard navigation.
**Outputs:** Keyboard user: Tab → skip-link focused (visible), Enter/Space → scrolls to main + focus moves to main (or first focusable inside main).
**Edge cases:**
- `<main>` is not focusable (div, no tabindex): anchor jump scrolls to it, but focus doesn't move (focus stays on document). `:target { scroll-margin-top: --header-h; }` rule (new in updated base.css) reserves space so main isn't hidden by sticky header (§2.4.11 Focus Not Obscured).
- Multiple `<main>` elements: HTML spec allows one per page, but if multiple, skip-link only points to first.
- Page scroll position: if page is scrolled down and user Tab from top, skip-link is not visible (DOM is top of tree, but visually below fold). Uncommon but possible.
**Failure modes:**
- Skip-link `href="#main"` points to non-existent element: anchor click does nothing (silent).
- Skip-link `transform: translateY(-150%)` is overridden by inline style or higher-specificity rule: skip-link stays hidden (visual regression).
- Main is a `<div id="main">` (not `<main>` tag): WCAG best practice says use semantic `<main>` tag (but `<div>` with id still works functionally).
**Rationale:** Skip-link is WCAG requirement (§2.4.1 Focus Visible); allows keyboard-only users to skip repetitive nav (critical for long pages). Landmark structure helps screen-reader users.
**Acceptance criteria (NEW tests, §5):** (1) skip-link exists + is first focusable element in tab order (DOM order assertion); (2) skip-link href="#main" points to existing `<main id="main">` element (document.getElementById('main') not null); (3) skip-link is hidden initially (`getComputedStyle().transform` contains translateY), visible on `:focus-visible` (synthesize focus, assert computed style changes); (4) landmarks present: one `<header>`, one `<nav>`, one `<main>`, one `<footer>` (DOM structure linting); (5) focus moves to `<main>` or first focusable inside it after skip-link click (integration: synthesize click, assert focus changed); (6) scroll-margin-top reserves header height on `:target` (style rule assertion).
**Style/UX/a11y choice:** CSS-only skip-link (no JS) is performant + robust. Transform-based hiding (not display: none) keeps element in layout (accessible to AT). Focus-visible-only (not :focus) respects mouse users (no purple focus ring on click).

> **✅ External validation — focus (C3):** Confirmed. SC 2.4.11 **Focus Not Obscured (Minimum) is AA**
> — correctly relied on by the `scroll-margin-top: --header-h` rule. The "Focus Appearance" size/contrast
> criterion is **AAA**, so the project's 3px focus ring already **exceeds the AA floor**. No change
> required beyond this citation. (W3C WAI, WCAG 2.2.)

#### I. Motion & reduced-motion (animation 0.01ms override, CSS-only orchestration)
**Rule:** All page animations honour `prefers-reduced-motion: reduce` (WCAG §2.3.3). Named transitions (e.g., area-title morph, nav drawer slide) are CSS-driven, duration defined in tokens.
**Trigger:** CSS loads base.css; animations applied by JS via `.style.viewTransitionName` or CSS `animation` property.
**Inputs:** `@media (prefers-reduced-motion: reduce)` + animation timing vars.
**Precise logic** (base.css, lines 56–81):
- Global reduced-motion rule (lines 74–80): `@media (prefers-reduced-motion: reduce)` sets all `animation-duration` / `animation-iteration-count` / `transition-duration` to 0.01ms (effectively instant), `scroll-behavior: auto` (no smooth scroll).
- **View transitions** (lines 57–71): `@view-transition { navigation: auto; }` enables cross-document transitions (280ms, ease-out). Named `area-title` transition (400ms) for list-to-detail morph. Both reduced-motion-aware (inherit the 0.01ms from global rule).

> **✅ External validation — View Transitions (C5):** Confirmed as **progressive enhancement**
> (Chromium + Safari 18.2+; Firefox no-ops gracefully — so the cross-document `@view-transition` is
> safe to ship). Two pitfalls to enforce: (1) every `view-transition-name` must be **unique per page**
> for the `area-title` morph — **duplicate names throw and skip the transition** entirely, so a list
> with two elements sharing `area-title` will break it; (2) confirm `prefers-reduced-motion` **also
> suppresses the VT** (it does inherit the global 0.01ms rule, but assert it explicitly in the test
> layer). (CSS-Tricks 2026; TestMu, May 2026.)
- **Timing tokens** (tokens.css, lines 121–122): `--ease-out`, `--ease-in-out` cubic-bezier curves (no animation durations in tokens — durations are in CSS rules or JS, tokens hold easing only).
- **Nav drawer animation** (base.css, line 219): `[open]` applies `@keyframes nav-drawer-in` 220ms ease-out (respected by reduced-motion rule above).
**Outputs:** On `prefers-reduced-motion: reduce`: all animations instant (0.01ms), page changes appear to snap (no smooth transitions). On normal preference: smooth animations at defined durations.
**Edge cases:**
- JavaScript-driven animation (e.g., canvas animation in a chart): not covered by CSS reduced-motion rule. JS must check `matchMedia('(prefers-reduced-motion: reduce)').matches` and skip animation.
- Named view transitions (`.style.viewTransitionName = "area-title"`): set in JS (page-areas.js), CSS rule applies 400ms duration, reduced-motion rule reduces to 0.01ms (works).
- Animations in third-party libraries (Chart.js): not controlled by our rules. Library may have its own reduced-motion support, or animations may run regardless.
**Failure modes:**
- Animation hardcoded in JS (e.g., `setInterval` loop drawing frames): reduced-motion not respected (not CSS-driven). Bug.
- Animation duration in inline style (e.g., `el.style.animationDuration = '2s'`): reduced-motion rule doesn't override inline (inline has higher specificity). Bug.
- Third-party library animation: may ignore prefers-reduced-motion (depends on library).
**Rationale:** Reduced motion is critical accessibility requirement (vestibular issues, epilepsy, motion sensitivity). CSS-only orchestration (no JS animation loops) is the best practice (respects browser settings, performance-friendly).
**Acceptance criteria (NEW tests, §5):** (1) reduced-motion rule exists + nulls animation duration (CSS rule assertion); (2) user's `prefers-reduced-motion: reduce` is detected (synthesize matchMedia result, assert no animations); (3) nav drawer animation runs 220ms normally (getAnimationDuration, may skip if hard to mock); (4) named area-title transition works (integration test: navigate areas list to detail, assert viewTransitionName set in JS); (5) all JS-driven animations check `matchMedia` + skip on reduced-motion (code linting: grep for matchMedia + setInterval patterns, manual review); (6) Chart.js animations (third-party) are documented as [untested] (note in test report).
**Style/UX/a11y choice:** Global reduced-motion rule is WCAG best practice (one place to manage, applies to all animations). CSS-only orchestration is future-proof (not dependent on JS runtime). Easing tokens (not durations) provide flexibility (pages can use different durations, easing is shared).

#### J. Shared utility modules: format, dom, data-loader (pure functions, no state)
**Rule:** Low-level, reusable functions for formatting, DOM manipulation, and data loading are split into utility modules.
**Trigger:** Page modules import and call these functions.
**Inputs:** Data values, DOM elements, JSON paths.
**Modules:**
- **format.js** (lines 266): `gbp(num)`, `gbpPence(num)` (Intl.NumberFormat, GBP locale), `pct(num, decimals)`, `monthsAsDuration(n)`, `dateFromMonths(base, months)`, `monthYear(date)`. No state, no side effects.
- **dom.js** (line 267): `esc(html)` (HTML escape), `byId(id)` (getElementById), `setText(id, text)`, `setHTML(id, html)`, `on(el, ev, fn, opts)` (addEventListener safe), `el(tag, attrs, children)` (hyperscript), `clear(el)` (remove children). Guard against null/undefined.
- **data-loader.js** (lines 10–21): `loadJSON(name)` (fetch + cache), `clearCache()` (test cleanup). In-memory `Map` cache.
**Outputs:** Formatted strings, DOM manipulation results, cached JSON data.
**Edge cases:**
- `byId()` returns null if element doesn't exist: caller must check before using.
- `setText()` on element without textContent: still works (sets it to empty or text).
- `loadJSON()` on missing path: throws Error (caller must catch).
- `el()` with nested children: may be complex (implementation details unknown without reading the file).
**Failure modes:**
- Cache not cleared between tests: stale data returned. Mitigated by `clearCache()` call in test setup.
- Circular reference in data-loader cache: unlikely (JSON is serializable).
**Rationale:** Utility modules reduce code duplication, improve testability, keep page modules focused on coordination (not boilerplate).
**Acceptance criteria (NEW tests, §5):** (1) format functions return expected strings (unit: test each formatter with sample inputs); (2) dom utilities guard against null (unit: call byId on non-existent id, assert returns null or no-op); (3) data-loader caches hits (unit: load JSON twice, assert only one fetch); (4) clearCache works (unit: call clearCache, load again, assert fresh fetch); (5) integration: page modules call format.gbp() and expect formatted GBP strings (integration: home page render, assert deposit amounts formatted as £X,XXX).
**Style/UX/a11y choice:** Pure functions (no side effects) are testable and predictable. Utility modules are a standard architectural pattern (separation of concerns).

---

### Coupling & dependencies

**Every page depends on (required chain):**

1. **index.html / page file** — declares `<div data-include>` slots, loads `components.js` + page module (e.g., page-home.js), sets `<html data-auth-state="pending">` (blocking script in head).

2. **assets/css/tokens.css** — loaded **first** (line 14 index.html, before Pico, before base.css). All colour, type, spacing, motion values. Redesignable under §4 rail-change protocol.

3. **assets/css/base.css** — imported by index.html (line 15), **after** Pico + tokens. Imports component CSS (card, tile, chip, etc.). Guard-railed (no direct rules, only @imports).

4. **assets/js/components.js** — loaded as module (line 247 index.html), imports `config.js` + `storage.js` + `auth-guard.js`. Runs immediately on page load (no defer).

5. **assets/js/config.js** — imported by components.js + data-loader.js. Provides `url()` helper for path resolution (required for both partial injection + data loading).

6. **assets/js/auth-guard.js** — imported by components.js (line 5), IIFE runs immediately. Checks session before components.js continues (but after, so shell may be injected before redirect).

7. **assets/js/supabase-client.js** — imported by auth-guard.js + storage modules. Must exist pre-setup (import fails gracefully) or setup.html generates it.

8. **Pico v2 CSS** (CDN: jsdelivr, line 12 index.html) — baseline form + button + link styles. Remapped via `--pico-*` vars in tokens.css. Must load **before** tokens.css so token override works.

9. **Chart.js v4.4.4** (CDN: defer, line 17 index.html) — used by finance + refinement visualisations (tiles). Deferred so non-blocking.

**Page-specific dependencies (examples):**
- Dashboard (index.html) → page-home.js (imports storage.js for household data, finances modules for calculations, tile-*.js modules for rendering).
- Areas page → page-areas.js (imports area-match.js, area-ref.js, map library, sets .style.viewTransitionName for title morph).
- Profile page → page-profile.js (imports storage.js for user state, criteria-form.js for UI, uploads to Supabase).

**Forbidden coupling (enforced by import-layer.test.js):**
- Page modules must **NOT** import `supabase-client.js` directly. All Supabase access goes through `storage.js` (the sanctioned data layer).
- Exception (exempted from test): `auth-guard.js` and `storage.js` are allowed to import `supabase-client.js` (infrastructure modules).

**Shared utilities (optional, called by most page-* + tile-* modules):**
- `format.js`: formatting functions.
- `dom.js`: DOM utilities.
- `data-loader.js`: JSON loading.
- `config.js`: `url()` helper.

**Cross-page navigation:** All pages use `data-nav="path"` links (no router, full-page reloads). Shell reinjected on each load (3 partial fetches every navigation). No progressive enhancement, no shared state across navigations.

---

### Test coverage & NEW test requirements (§5)

**Existing tests touching this segment:**

- **import-layer.test.js** — guards module import architecture (page/tile/finance/outreach modules must NOT import supabase-client directly). Runs in harness.

- **lint-responsive.mjs** — enforces DESIGN.md §6 responsive breakpoints (480/768/1024/1280 min-width only, no max-width media, tap targets ≥44px, no raw 100vw, no fixed-px font outside SVG, no inline styles, notch-aware). Count-based baseline in `lint-responsive.allow.json`. **Fragile:** count-based masking.

> **✅ External validation — container queries / dvh-svh / breakpoints (C4):** Confirmed (all Baseline).
> Caveats to enforce: (1) keep **sensible defaults outside `@container` blocks** so a browser without
> container-query support still gets a usable layout (it skips the `@container` rules); (2) **don't
> animate height with `dvh`** (the dynamic unit causes jank as the URL bar shows/hides) — use `svh` or a
> fixed value for animated heights, and keep a `vh` fallback; (3) the **480/768/1024/1280** ladder and
> the "no transition in the iPad 600–800 band" rule are validated as **defensible judgment calls** — but
> note the ladder **differs from Pico v2's defaults (576/768/1024/1280/1536)**, so label it as a
> deliberate project choice in DESIGN.md to avoid future confusion. (caniuse; web.dev, 2026.)

- **tests.html** (browser harness, developer-run) — smoke checks: component shell injection, theme toggle, nav drawer, auth-guard redirect (not run in CI, hand-executed by developer).

**NEW test requirements (§5 refresh) — unit/contract/characterization/integration/DOM/e2e:**

The expanded standard pins specific behaviours that must be tested **before and after redesign** (§4 rail-change protocol). Tests run in Node + browser harness (`tools/run-intelligence-tests.mjs`).

**Partial injection (A):**
- ✓ Unit: three concurrent fetches to partial paths, success → all injected in order.
- ✓ Characterization: one fetch fails (404) → remaining two injected, failed slot has comment.
- ✓ Integration: page-home rendered after `shell:ready` event fires.
- ⚠ E2E (stretch): partial fetch >5 sec → [not automated, devtools throttle QA].

**Active nav (B):**
- ✓ Unit: mock location + data-nav, assert aria-current set on match.
- ✓ Characterization: trailing slash + hash variants normalize correctly.
- ✓ Integration (skip if not in CI): GitHub Pages subpath test (location.href = "https://…/rec/pages/areas.html").
- ✓ DOM: active link has left accent bar (computed styles or ::before pseudo-element inspection).

**Theme toggle (C):**
- ✓ Unit: button click → theme flips, localStorage updated, data-theme attr set.
- ✓ Characterization: page reload → localStorage read, theme re-applied (assertion that attr set).
- ✓ DOM: SVG icons swap correctly (moon visible when pressed=false, sun when pressed=true).
- ✓ Contract: all `--paper`, `--ink`, `--accent` vars defined in both `:root` and `[data-theme="dark"]` (linting assertion, NEW).
- ⚠ E2E (hand-off): all `color-mix` derivatives resolve correctly in both themes (difficult without rendering, developer QA).

**Token cascade (D):**
- ✓ Contract: all `--*` vars defined in both `:root` and `[data-theme="dark"]` (linting, NEW).
- ✓ Contract: `color-mix` syntax valid (CSS parser linting, NEW).
- ✓ Contract: no hardcoded hex values in component CSS (grep linting, NEW).
- ✓ Contract: accent tone difference between themes is mathematically consistent (L and C changes only, not H) (parsed OKLCH assertion, NEW).
- ⚠ E2E (hand-off): contrast ≥4.5:1 on body text, ≥3:1 on UI components (screenshot tools not available, developer QA).

**Font loading (E):**
- ✓ Linting: WOFF2 files exist in `assets/fonts/`.
- ✓ Linting: @font-face declarations match file paths.
- ✓ Linting: feature settings are valid CSS.
- ✓ Contract: fallback font stack defined in tokens.css.
- ⚠ E2E (hand-off): font swap on slow connection (devtools throttle).

**Auth guard (F):**
- ✓ Characterization: pending attr set before render (document.head inspection).
- ✓ Integration: unauthenticated page redirects to login (mock session empty, assert location.href changed).
- ✓ Integration: setup page always accessible (mock any path, assert no redirect).
- ✓ Characterization: pre-setup graceful fallback (mock import fail, assert body revealed).
- ⚠ E2E (hard to automate): body revealed synchronously after session confirmed (timing measurement).
- ✓ Integration: ?next param preserved on login → redirect (read query, assert next URL set).

**Nav drawer (G):**
- ✓ Unit: burger click opens drawer (dialog.open assertion).
- ✓ Characterization: backdrop click closes drawer (synthetic click on ::backdrop).
- ✓ Integration: nav link click closes drawer (synthetic click).
- ✓ Contract: focus trapped inside drawer (Tab key cycles through nav items, characterization).
- ✓ DOM: aria-expanded reflects state (attribute assertion).
- ⚠ E2E (hard to mock): slide animation runs 220ms (getAnimationDuration).
- ✓ Linting: short-viewport (max-height 600px) nav items stay ≥44px (style rule assertion).

**Skip-link & landmarks (H):**
- ✓ Contract: skip-link exists + is first focusable element in tab order (DOM order assertion).
- ✓ Contract: skip-link href="#main" points to existing `<main id="main">` (getElementById assertion).
- ✓ Characterization: skip-link hidden initially, visible on :focus-visible (synthesize focus, assert computed style changes).
- ✓ Linting: landmarks present: one `<header>`, one `<nav>`, one `<main>`, one `<footer>` (DOM structure linting, NEW).
- ✓ Integration: focus moves to `<main>` or first focusable inside it after skip-link click (synthesize click).
- ✓ Contract: scroll-margin-top reserves header height on :target (style rule assertion, NEW).

**Motion & reduced-motion (I):**
- ✓ Contract: reduced-motion rule exists + nulls animation duration (CSS rule assertion, NEW).
- ✓ Characterization: matchMedia('prefers-reduced-motion: reduce') is detected (synthesize, assert no animations).
- ⚠ E2E (hard to mock): nav drawer animation runs 220ms normally.
- ✓ Integration: named area-title transition works (navigate list to detail, assert viewTransitionName set).
- ✓ Code linting: all JS-driven animations check matchMedia + skip on reduced-motion (manual review, NEW).
- ✓ Note: Chart.js animations (third-party) are [untested] (documented, NEW).

**Shared utilities (J):**
- ✓ Unit: format functions return expected strings (gbp, gbpPence, pct, etc.).
- ✓ Unit: dom utilities guard against null (byId non-existent id, no-op safe).
- ✓ Unit: data-loader caches hits (load twice, assert one fetch).
- ✓ Unit: clearCache works (clear, load, assert fresh fetch).
- ✓ Integration: page modules call format.gbp() → formatted GBP strings (home page render assertion).

**Test architecture (NEW §5):**
- All tests run in `tools/run-intelligence-tests.mjs` (Node harness) + `tests.html` (browser, developer-run).
- New tests added to `tests/*.test.js` files (unit/characterization) or `tests.html` (DOM/integration).
- Contract tests (linting) run in Node (CSS parser, DOM structure, missing vars).
- E2E tests (marked ⚠) are hand-off to developer QA (no headless browser available).

---

### Known smells / tech debt / risks

1. **Partial injection timeout & fallback missing** — If a CDN is slow or a partial fails, page renders without header/nav/footer. No timeout (waits indefinitely), no fallback (no minimal sticky bar). Accessibility risk: page not focusable until partials arrive. Consider: add 5-sec timeout, render minimal fallback (sticky brand bar only), emit warning event for Sentry.

2. **Path normalisation fragility** — `normalisePath()` and `url()` parsing may diverge on GitHub Pages subpaths. No tests. If divergence happens, active nav silently fails. Risk: user sees no active indicator (confusing on long nav lists). Consider: unit test both functions with subpath URLs, assert they agree.

3. **Theme toggle label text mutation** — Line 69: `btn.querySelector('.theme-toggle__label').textContent = …`. If HTML markup changes (class name, element moved), mutation fails silently (icon swaps correctly via CSS, label stays stale). Risk: visual inconsistency. Consider: use aria-label only (no visible label text), or assert label element exists before mutation.

4. **Safe-area-inset values not centralised** — Header, burger, nav drawer, main container all use `max(space, env(safe-area-inset-*))` separately. If inset logic changes, must update 4+ places. Risk: edge-case bugs on notched devices (landscape mode, foldables). Consider: create a shared mixin or utility class (if using preprocessor) or document pattern in code comments.

5. **Responsive lint is count-based, not semantic** — `lint-responsive.mjs` tracks violation counts, not violations themselves. A new off-token value can be masked if a similar violation already exists in the baseline. Risk: responsive regressions slip through. Consider: rewrite linting to fingerprint violations by (rule, file, selector, property) instead of count.

6. **No timeout on nav drawer scroll + focus trap** — Nav drawer has `overflow-y: auto` but doesn't test whether all 12 nav items fit at max-height 600px on landscape phones. If scroll is needed, interaction of scroll + keyboard focus-trap is untested. Risk: keyboard users may get stuck at bottom of scrolling drawer. Consider: test on actual landscape phone, or add explicit height cap + verify focus still cycles.

7. **Footer is hard-coded static placeholder** — No way to update via data or config. No version number, no legal disclaimers, no links. Risk: outdated text ships. Consider: load footer text from a data constant (or footer.json), or add versioning via build step.

8. **Icon system is bespoke hand-authored SVGs** — Hamburger, close, sun/moon icons are inline SVGs in components, hard-coded `stroke-width="1.75"`. If icon guidelines change (weight, colour), both must be edited manually. No consistency audit. Risk: icon style drift. Consider: adopt an icon library (Feather, Heroicons, Material Icons) or enforce stroke-width/colour via design tokens (CSS var in SVG).

9. **Dark-mode SVG icon legibility untested** — Brand mark, sun/moon icons use `stroke="currentColor"` (good for theme flip), but legibility on both light/dark backgrounds not formally tested. Risk: icon may be hard to see on one theme. Consider: add colour-contrast assertions for dark mode (measure stroke colour vs. background, assert ≥3:1).

10. **Focus ring is box-shadow only** — `:focus-visible` applies box-shadow (not outline), which may be invisible on some custom interactive elements (e.g., inline SVG with tabindex). Risk: keyboard users can't see focus on those elements. Consider: audit all interactive elements for visible focus-ring, add outline fallback if needed.

11. **View Transitions are opt-in per-page, no fallback** — Page must call `.style.viewTransitionName` to enable named transition (e.g., area-title morph). If page doesn't set the name, transition doesn't happen (silent). Lint exception for `.style.viewTransitionName =` is permissive (count = 1, but multiple pages may set it). Risk: inconsistent transitions across pages. Consider: establish a pattern (which pages use named transitions, document in DESIGN.md).

12. **No error boundary for shell injection failures** — If a partial fetch fails (404, CORS, timeout), page is left with a comment node + continues. No user-facing warning. Risk: page renders broken (no header) with no indication why. Consider: add error toast ("Navigation unavailable") or at least log to Sentry on fetch fail.

13. **Pre-setup auth-guard fallback is silent** — If supabase-client.js doesn't exist (pre-setup mode), auth-guard catches the error silently and continues. If user later navigates to a data-driven page, data fetch fails with console error only (no error boundary). Risk: poor first-time UX (blank page, silent failure). Consider: add a pre-setup banner ("Setup required — visit /setup.html") on pages that need Supabase.

14. **No multi-device theme persistence** — Theme preference stored in localStorage (device-local only). If user switches devices, theme reverts to system default. Risk: poor multi-device UX. Consider: optionally sync theme to Supabase user profile (adds complexity but improves multi-device UX).

15. **Header height var only updated on resize** — `initHeaderHeightVar()` reads height on page load + resize event, but doesn't watch for content reflow (e.g., logo wraps to 2 lines). If header dynamically grows after load, --header-h is stale. Risk: focus-not-obscured scroll-margin may be too small. Consider: use ResizeObserver instead of resize event.

16. **No automated test for partial fetch race conditions** — All happy-path tested, but concurrent fetch failure + success order is untested. Risk: race condition under load. Consider: add a characterization test that stalls one partial fetch and verifies others still inject.

17. **Pico CSS contract undocumented** — Pico's baseline styles + focus states + form inputs are remapped via --pico-* vars, but the exact contract (which selectors, which properties) is not documented in DESIGN.md or comments. Risk: future refactor (if moving away from Pico) will be difficult. Consider: document the Pico contract in comments (e.g., "Pico v2 overrides --pico-* for button/link/input styles").

18. **Mobile-first header responsiveness untested for edge viewports** — Header layout (burger + brand + actions) is tested on phones + tablets, but not on ultra-wide (>1280px) or unusual aspect ratios (ultra-tall phone, very wide landscape). Risk: layout may break or overflow. Consider: add test for 320px (min), 480px, 768px, 1024px, 1280px, 2560px widths.

---

### Refactor opportunities (to sequence in Fable phases)

**Short term (2–3 phases):**

- **Encapsulate shell state** (phase X.1): `components.js` exports individual functions but no unified shell state. Provide `getShellState()` returning `{ navOpen, theme, activeNav, headerHeight }` and `await waitForShell()` Promise (replaces event listener pattern). Lets page modules query state cleanly.

- **Partial fetch resilience** (phase X.2): Add 5-second timeout to `injectIncludes()`. On timeout, render minimal fallback (sticky bar: brand + burger only), emit warning event (Sentry). Hide main content behind opacity: 0 until all partials resolve (graceful degradation). Measure: "dark page" UX risk eliminated.

- **Responsive lint rewrite** (phase X.3): Replace count-based linting with semantic fingerprinting: violations identified by (rule, file, selector, property, value) tuple, not count. Enforce `violations.length === 0` in harness (strict mode). Measure: responsive lint output is a concrete list, not a mystery count.

- **Path normalisation test** (phase X.4): Add unit test for `normalisePath()` + `url()` with GitHub Pages subpath URLs. Verify both functions agree on canonical pathname. Measure: active nav is testable end-to-end.

- **Safe-insets utility** (phase X.5): Audit all uses of `env(safe-area-inset-*)` in base.css + page CSS. Extract a shared mixin (if using preprocessor) or document pattern. Test on landscape notched device. Measure: no viewport edge-case regressions.

**Medium term (1–2 sprints):**

- **Theme module** (phase Y.1): Extract theme logic from `components.js` into `theme.js`. Export `getTheme()`, `setTheme()`, `onThemeChange(callback)` (event-based). Let other modules (settings panel, etc.) manipulate theme without importing components. Guard-rail status: NEW code, no change to tokens.css / config.js / data-loader.js.

- **Shell error boundaries** (phase Y.2): Add user-facing error toast on partial fetch failure. Log to Sentry. Pre-setup mode: add banner ("Setup required") on data-driven pages. Measure: errors are visible, not silent.

- **Header state module** (phase Y.3): Extract `initHeaderUser()` from `components.js` into `header.js`. Export `updateHeaderUser(user)`, `clearHeaderUser()`. Let settings modal or user-change listener update header without re-importing components. Guard-rail status: NEW code.

- **Focus ring audit** (phase Y.4): Audit all interactive elements (buttons, links, custom elements) for visible `:focus-visible` ring. Add outline fallback for custom SVG + tabindex cases. Measure: all interactive elements have ≥3:1 contrast focus indicator.

**Long term (backlog):**

- **Decouple dark mode from Pico** — Document Pico contract, then evaluate: keep using Pico v2 (current path), or migrate to CSS-in-JS (if React later), or custom CSS framework. Measure: theme system is framework-agnostic.

- **Icon system upgrade** — Adopt Feather or Heroicons, or enforce icon style via design tokens. Measure: consistent icon weight/colour, easier maintenance.

- **Multi-device theme sync** — Optionally sync theme to Supabase user profile (behind feature flag). Measure: theme persists across devices (improvement over current localStorage-only).

- **Responsive lint CI enforcement** — Make responsive lint fail CI if violations > baseline (not just report). Measure: responsive regressions are caught before merge.

---

### Suggested sub-phases (draft)

**Phase 1: Shell state encapsulation & resilience**
- Create `shell-state.js` module exporting `getShellState()` + `waitForShell()` Promise.
- Update `components.js` to populate state.
- Add timeout + fallback to `injectIncludes()` (5-sec timeout, minimal sticky bar, warning event).
- Measure: page-* modules call `await waitForShell()` cleanly; partial failures are visible + logged.

**Phase 2: Semantic responsive linting**
- Rewrite `lint-responsive.mjs` to fingerprint violations by (rule, file, selector, property, value).
- Enforce `violations.length === 0` in harness (strict mode, no counting).
- Measure: responsive lint output is concrete + debuggable.

**Phase 3: Theme module + safe-insets audit**
- Extract theme logic from `components.js` to `theme.js`.
- Audit + centralise `env(safe-area-inset-*)` usage (shared mixin or documented pattern).
- Test on landscape notched device.
- Measure: theme is modular, insets are centralised, no viewport regressions.

**Phase 4: Path normalisation + header module**
- Add unit test for `normalisePath()` + `url()` (GitHub Pages subpath coverage).
- Extract `initHeaderUser()` to `header.js` module.
- Measure: active nav is tested, header can be updated by other modules.

**Phase 5: Focus ring audit + error boundaries**
- Audit all interactive elements for visible focus ring.
- Add error toast on partial fetch failure, pre-setup banner.
- Measure: focus is visible on all interactive elements, errors are transparent.

---

### Tailored Q&A for the owner

1. **Partial injection timeout vs. build-time inlining** — Current design fetches header/nav/footer on every page load (no timeout, no fallback). Two options: (A) keep fetching but add timeout + minimal fallback render + warning event (resilience improvement, 1 phase), or (B) adopt a build step that inlines partials into each page HTML at deploy time (eliminates fetch, but adds build complexity + harder to update partials without rebuild). Which aligns with your deployment model?

2. **Active nav path normalisation robustness** — Current logic may diverge on GitHub Pages subpaths (untested). Mitigation: add unit test with subpath URLs, or refactor path resolution to single canonical function. If you expect users on different domains (not just github.io), I'd recommend the unit test + shared function path (low effort, high confidence).

3. **Theme persistence scope** — Dark mode preference is currently localStorage-only (device-local). Supabase sync option exists but adds complexity (requires user profile table column, MCP write in each session-end, migration). Would you prefer theme to follow user across devices (Supabase sync) or stay device-local (current)?

4. **Responsive lint strictness** — Lint currently runs count-based (violations only flagged if total count increases). Strict mode would fail CI if any new violation is introduced. Strict mode catches regressions earlier but may be noisy during rapid iteration. Current or strict?

5. **Icon system at scale** — Header/nav icons are bespoke hand-authored SVGs. If you add 10+ more pages with icons (e.g., settings, help, share), maintaining consistency becomes harder. Option: adopt Feather/Heroicons (scales well, slower to customize) or keep bespoke + enforce via design tokens (SVG stroke-width/colour via CSS vars). Plan?

6. **Error transparency vs. minimalism** — Silent errors (current) keep UX minimal but reduce debuggability (user sees blank page, doesn't understand why). Transparent errors (toast + banner) clarify what failed but add visual noise. Preference for your app's philosophy: "calm minimal" (current) or "transparent + clear" (slightly noisier but more helpful)?

7. **Pre-setup UX** — Currently, setup page is always accessible (auth-guard exempts it) but other pages redirect to login if no session (or silently fail in pre-setup mode). Would you prefer: (A) explicit "Setup required" banner on all pages pre-setup (clearer but noisier), (B) keep current silent fallback (minimal but requires user to know to visit /setup.html), or (C) auto-redirect unauthenticated users to setup page on first load?

8. **Guard-rail redesignability scope** — This segment marks tokens.css / config.js / data-loader.js as "redesignable under §4 rail-change protocol." Would you like to add other files (e.g., base.css component @import shell, shell.html structure) to this redesign-permitted list, or keep it narrow (just core system files)?

---

### Summary

This expanded segment documents the complete design system, app shell, and navigation architecture for Rec. The shell is built on partial injection (concurrent fetches, no fallback), native `<dialog>` nav, CSS-driven theming (OKLCH cascade, localStorage persistence), and a comprehensive token system (colours via `color-mix`, type scale via `clamp()`, motion via CSS + reduced-motion honour). Key strengths: token-driven design (single source of truth, easy theme swap, future-proof OKLCH), native `<dialog>` focus trap (accessible, no custom JS), skip-link + landmarks (WCAG compliant). Key risks: partial injection timeout missing (potential "dark page" UX), path normalisation fragility (active nav may fail on subpaths), theme toggle label mutation (label text mutation brittle). Eight new test layers pin specific behaviours (unit, contract, characterization, integration, DOM, E2E hand-off) required before and after redesign. Five short-term refactors improve resilience + testability; long-term path decouples Pico + upgrades icon system. The guard-rail surface (tokens.css, config.js, data-loader.js) is explicitly redesignable under the §4 protocol, enabling future framework migrations or theme system overhauls without architectural breakage.
## 10.2 Segment: Home dashboard

**Design anchor:** Linear-dense (DESIGN.md §1) — data-rich UI with asymmetric/bento layout, compact rhythm, monospace numerals. **Banned: uniform shadow-floated cards, hero KPI cards (DESIGN.md §3).**

**Guard-rail surface (§4 — redesignable):**
- `assets/css/dashboard.css` (@import shell only, order-sensitive; edit rules in the sub-files, never this file itself)
- `assets/css/tokens.css` (colour/type/spacing tokens only — inviolable §16)
- `assets/js/storage.js` (Supabase backing layer — extend modules in `storage/`, never rewrite core shim)

---

### File inventory

| File | Purpose |
|------|---------|
| `index.html` | Dashboard page structure: lede prose + metrics table, bento grid, 13 tile sections across 4 bands (Goal progress, Affordability, Search, Next steps). Includes NBA strip above the bento (`id="nba-strip"`, initially hidden). |
| `assets/js/page-home.js` | Coordinator: orchestrates 13 tile renderers via explicit `render*()` calls, batches async fetches (finances, profile, criteria, investments via `Promise.all` for parallelism), triggers on `window.load` via `ready()` helper. `LOADING_IDS` const dims 5 headline elements during fetch; `clearStuckLoading()` restores them to `—` if still empty after render. Reactive: `getFinances()` calls `onUpdate` callback when Supabase cache detects fresh data, re-rendering all tiles without page reload. |
| `assets/js/dashboard/tile-lede.js` | Lede prose + key metrics table: formats budget max, deposit target, beds (range if minBeds ≠ idealBeds), moving window from criteria + finances + profile. Falls back to auto-prose from property type preferences + location focus if no custom headline set. |
| `assets/js/dashboard/tile-deposit.js` | Deposit arc (SVG ring progress %, animated stroke-dashoffset), mini-flow bar (stacked segments for Bills/Expenses/Savings/Spare), scenario chips (baseline/+£200/mo/+£500/mo/+£5k windfall with aria-pressed state), sparkline showing 12-month savings trajectory, ETA label. Ring % via `calcDepositProgress()` (saved / target). Mini-flow segments colour-mixed via `MINI_FLOW_COLORS` object. Scenario deltas defined in `SCENARIO_DELTAS` const: offset monthly contribution or apply lump-sum, recompute ETA, re-render arc + stats. |
| `assets/js/dashboard/tile-affordability.js` | Affordability ladder SVG: computes bands by iterating `LADDER_RANGE` (£250k–£500k, £2k step) and calling `assessAffordability()` per price point, collecting contiguous verdict zones (comfortable/stretch/tight/out-of-reach). SVG draws coloured band rectangles, tick labels, and two user-draggable range markers (From/To inputs). Verdict prose above the ladder updates on input change, reporting single verdict or split (e.g. "comfortable at low end, stretch at top"). |
| `assets/js/dashboard/tile-affordability-scenarios.js` | Three affordability scenarios: buy sooner/smaller (lower price target), buy at hoped target, stretch to £400k. Each calls `assessAffordabilityScenarios()`, renders verdict badge + LTV% detail + months-to-ready ETA. Verdicts: comfortable/stretch/tight/out-of-reach via `verdict-badge--*` CSS class. Async-awaits `getGoals()` before rendering. |
| `assets/js/dashboard/tile-money-flow.js` | Two-panel SVG money flow: Today vs. After Move. Each panel is a horizontal stacked bar (Bills/Expenses/Savings/Spare) with segment widths proportional to monthly amounts. Legend lists bucket names + £ amounts. Caption shows spare drop from today to after-move; flags negative spare (shortfall) in accent colour. Clicking a segment opens a collapsible details section showing line-item breakdown for that bucket. Mortgage P&I calculated via `calcMonthlyMortgage(loan, rate, termYears)`. |
| `assets/js/dashboard/tile-readiness.js` | Readiness snapshot: % of deposit target reached (saved / hoped goal), months-to-goal at current monthly + £500/mo + £1k/mo pace (via simple division: gap / monthly rate). Next priority action fetched from `READINESS_PRIORITY` array (7 items: credit checks, AIP, conveyancer, etc.), finds first unchecked item from household's `readiness_checklist` Supabase rows. Async-awaits `getGoals()` + `getReadinessChecklist()`. |
| `assets/js/dashboard/tile-deposit-risk.js` | Deposit-at-risk assessment: calls `assessDepositRisk(investments, goals)`, renders current ISA/cash value, scenarios showing deposit value after 10% + 20% market drops, recommendation action text. Verdict badge (low/medium/high risk) above the tile. Async-awaits `getInvestments()` + `getGoals()`. |
| `assets/js/dashboard/tile-shortlist.js` | Shortlist preview: renders user's `area_confirmations` from Supabase (via `getShortlist()` + `getHouseholdAreas()` call). Shows up to 5 areas by index + fit-dot badge (comfortable/stretch/tight/out-of-reach based on area's average price vs. finances) + area name + town + status pill (Live or Researching). Counts areas; appends "researching" sub-count if pending areas present. Fit-dot colour driven by `fitDotClass()` which maps verdict → CSS class name. |
| `assets/js/dashboard/tile-criteria.js` | Criteria prose + spec strip: formats property-type prefs + beds (range or single) + budget range + location into readable paragraph. Spec strip is a 6-row term-list: Beds / Budget / Deposit / EPC / Tenure / Window. If criteria missing, all fields show `—`. |
| `assets/js/dashboard/tile-journey.js` | Buying journey track: fetches journey milestones from `data/journey.json` + household's task completion state from `storage.getJourneyProgress()`. Renders ordered milestone list with phase label + progress count (done/total). Current phase highlighted, completed phases dimmed. Next-action label + tick button (triggers `saveJourneyProgress()` to mark one task done, then re-renders). |
| `assets/js/dashboard/tile-isa-ytd.js` | ISA YTD stat: fetches `getInvestmentsHistory()`, filters current-year months from `monthlySummary`, sums `net` contribution. Renders £ amount or `—` if no history. Populated into inline deposit-tile stat (index.html line 71, `id="isa-ytd-stat"`). |
| `assets/js/dashboard/tile-savings-visuals.js` | Four SVG visualizations: (1) **Sparkline** — 12-month savings area+line chart, plots last 12 months of cumulative savings, dashed target line, caption shows avg monthly velocity + ETA month if crossing target. (2) **Scenarios fan** — 6 bars (−£500/mo, −£200/mo, baseline, +£200/mo, +£500/mo, +£5k windfall), each shows months-to-goal, baseline bar highlighted. Caption shows time saved by +£500/mo scenario. (3) **Net-worth donut** — pie chart of ISA + cash + LISA bonus + investments vs. gap-to-target, centre label shows effective deposit (total − debts). (4) **Withdrawal readiness** — progress bar from first contribution to the LISA-usable date (open ≥ 12 months from first contribution — ⚠️ code correction A3), marker shows current date. |
| `assets/js/dashboard/tile-nba.js` | Next-Best-Action strip (v3 L5, self-contained async): scores 200 listings via `scoreListingFit()` with learned-preference weights, surfaces top 3 prioritized actions (e.g. "Review 3 new matched properties in Basingstoke"). Uses `computeNextBestActions()` from meta-observations engine. Loads listings/reactions/statuses/finances/criteria/learned prefs in parallel. Renders as a link-list above the bento; hidden if no actions. Catches errors silently and hides. |
| `assets/css/dashboard.css` | @import shell (guard-railed §16, do NOT edit rules). Order: base, tile-card, tile-{deposit,affordability,money-flow,shortlist,journey,criteria,ask,extended,v3-visuals,nba}, then pages. |
| `assets/css/dashboard/base.css` | Bento grid base (`.bento` = `display: grid; grid-template-columns: 1fr` on mobile, re-spec'd in tile-card.css media queries), lede prose styling, band labels (`.band-label` spanning full width), shortlist list styling, cell-foot link styling, legacy progress bar, utility classes. |
| `assets/css/dashboard/tile-card.css` | Tile base: `.tile-card` = white/paper bg, borderless on mobile, rounded tablet+, extends to viewport edges on mobile via negative margins (safe-area-inset aware). Tile head (h2 + right-aligned headline num/action). Loading state: `[data-loading="true"]` dims text + animated ellipsis. **Bento spans:** mobile/tablet ≤1023px stay 1 col; 1024–1279px: 2 cols with `.tile-deposit` + `.tile-flow` spanning 2; 1280px+: 3 cols with same 2-span tiles. Band labels span full width (grid-column: 1 / -1) to preserve band grouping. |
| `assets/css/dashboard/tile-deposit.css` | Deposit arc ring (SVG, `viewBox="0 0 120 120"`, stroke-dashoffset animated via JS), ring-value %= overlaid text, arc-stats definition list. Mini-flow bar (colour-mixed segments, legend), scenario chips (button group, aria-pressed toggle state, pill styling). Sparkline SVG (area + line + dashed target, responsive viewBox). |
| `assets/css/dashboard/tile-affordability.css` | Affordability ladder SVG styling: `.ladder__band--comfortable` / `.ladder__band--stretch` / `.ladder__band--tight` / `.ladder__band--out-of-reach` rect fill colours (via colour-mix oklch with accent/paper). `.ladder__marker` lines + circles, `.ladder__label` text anchors (start/middle/end per position). `.ladder__range` overlay (semi-transparent range indicator rect). Input fields (From/To) styled as standard number inputs. Verdict-line text above ladder. |
| `assets/css/dashboard/tile-money-flow.css` | Flow bar SVG (stacked segments, `.flow__seg--bills` / `.flow__seg--expenses` / `.flow__seg--savings` / `.flow__seg--negative`). Legend swatches + labels. Flow-details collapsible summary + line-items list (hidden until segment clicked). Bucket click handler in JS sets details open + populates line-item HTML. |
| `assets/css/dashboard/tile-shortlist.css` | Shortlist-list table styling: index (2-digit padded), fit-dot badge (4 verdict colours), area name + town link, status pill (Live/Researching). Empty-note + pending-area note styling. Link hover/focus to accent. |
| `assets/css/dashboard/tile-journey.css` | Journey-track milestone list (vertical flex column): numbered nodes (1–7), progress counter (done/total), colour-coded per phase state (done/current/upcoming). Journey-next section: label + next-step title + tick button (checkmark). |
| `assets/css/dashboard/tile-criteria.css` | Criteria-prose paragraph (readable text). Spec-strip definition list (inline 6-row grid: Beds/Budget/Deposit/EPC/Tenure/Window keys + values). |
| `assets/css/dashboard/tile-ask.css` | Ask input placeholder, ask-caption text + link to Ask page. Disabled state (greyed). |
| `assets/css/dashboard/tile-extended.css` | **Verdict badge** (tinted bg, no left-border pill per DESIGN.md §3 rule): `.verdict-badge--comfortable` (green mix), `.verdict-badge--stretch` (amber mix), `.verdict-badge--tight` (orange mix), `.verdict-badge--out-of-reach` (red mix), `.verdict-badge--loading` (placeholder). Readiness-stats grid (3-col on desktop, adapt mobile). Scenario-row-item adaptive 2–3 col. Deposit-risk row list. ISA attribution bar. |
| `assets/css/dashboard/tile-v3-visuals.css` | Sparkline: `.deposit-sparkline__area` (fill path), `.deposit-sparkline__line` (stroke path), `.deposit-sparkline__target` (dashed line). Scenarios-fan SVG: `.scenarios-fan__label` (axis label, baseline bolded), `.scenarios-fan__bar` (bar rect, baseline highlighted), `.scenarios-fan__value` (eta label). Net-worth donut: `.networth-donut__track` (bg circle), `.networth-donut__isa` (arc stroke), `.networth-donut__cash` (arc stroke), `.networth-donut__value` (centre £ text), `.networth-donut__label` (centre label). Seasoning-bar: `.seasoning-bar` progress container, `.seasoning-bar__fill` (animated width), `.seasoning-bar__marker` (vertical marker at current date). |
| `assets/css/dashboard/tile-nba.css` | NBA strip header (h2 label), nba-list (flex column), nba-item link styling + arrow (→) cta indicator. Hidden state (display: none) when no actions. |

---

### Data flows

**Initialization (`page-home.js` `init()` — lines 43–85):**
1. Call `markLoading()` to dim 5 headline elements (LOADING_IDS: td-headline, tf-headline, ta-verdict, tj-next-text, tc-prose).
2. Fetch 4 async sources in parallel via `Promise.all` (implicit — each try/catch is independent):
   - `getInvestments()` → `rawInvestments` (may fail; set to null)
   - `getFinances({ onUpdate: callback })` → `rawFinances` (reactive: callback fires on cache refresh)
   - `getProfile()` → normalized via `normalizeProfile()`
   - `getCriteria()` → criteria object
3. **Derive canonical finances state** via `deriveFinances(rawFinances, { investments: rawInvestments })` — single point for computed fields (savings velocity, mortgage calc, affordability bands).
4. Define `renderAll(financesData)` function: calls all 13 `render*()` functions in sequence, then `clearStuckLoading()`.
5. Attach `onUpdate` callback to `getFinances()`: whenever Supabase cache refreshes (user editing finances on another tab), trigger `renderAll(deriveFinances(fresh, ...))` reactively.
6. After final sync completes, call `renderAll(financesData)` one more time.
7. Fire `renderNba()` asynchronously (never blocks bento render).

**Reactive updates:** When user edits finances in `pages/finances.html` and syncs to Supabase, `storage.js` cache detects the change and fires the `onUpdate` callback in `getFinances()`, re-rendering all 13 tiles. **Risk:** No debounce — rapid edits (typing in a field) cause 13 re-renders per keystroke.

**Tile data dependencies:**

| Tile | Sources | Computed in | Key logic |
|------|---------|-------------|-----------|
| Lede | profile, criteria, finances | tile-lede.js | budget max (criteria.budget.max), deposit target (finances.goal.targetDeposit), beds (criteria.size.minBeds, idealBeds), moving window (finances.goal.movingWindow or profile.movingTimeline). Falls back to auto-prose if no profile.headline. |
| Deposit | finances | tile-deposit.js | Ring % = `calcDepositProgress(saved, target)`. Base saved = finances.savings.totalSavings or .current. Target = finances.goal.targetDeposit. Scenario deltas (SCENARIO_DELTAS) modify monthly contribution or apply lump sum, recompute ETA via `calcMonthsToTarget()`. Mini-flow via `getMoneyFlow(financesData)` (Today), segment widths = bucket.amount / total.income × 100%. |
| Affordability | finances, criteria | tile-affordability.js | Loop LADDER_RANGE (£250k–£500k, £2k step), call `assessAffordability({ price: p, finances, criteria })` per point, collect band transitions. SVG draws bands + user's range markers (From/To inputs). Verdict prose reports single verdict or split depending on input range. |
| Affordability Scenarios | finances, criteria, goals | tile-affordability-scenarios.js | 3 scenarios via `assessAffordabilityScenarios({ finances, criteria, goals })`: price + LTV% + verdict + monthsToReady per scenario. Async-awaits `getGoals()`. |
| Money Flow | finances, criteria | tile-money-flow.js | `getMoneyFlow(financesData)` (Today) + `getMoneyFlowPostMove(financesData, monthlyMortgage)` (After move). Both return { buckets: [{name, kind, amount}], spare: £ }. Mortgage P&I = `calcMonthlyMortgage(loan, rate%, termYears)`. Legend built from buckets. Line-item drill-down pulls from finances.ongoingBills, finances.expenses, or computed mortgage. |
| Deposit Risk | — | tile-deposit-risk.js | Async-awaits `getInvestments()` + `getGoals()`. Calls `assessDepositRisk(investments, goals)`. Returns current value, scenarios (10% + 20% drop), verdict + recommendation. Verdict badge class = `.verdict-badge--{verdict}` (low/medium/high risk). |
| Shortlist | finances, criteria | tile-shortlist.js | Fetches user's `shortlist` (array of area IDs) + `household_areas` (all areas user added). Filters areas to those in shortlist; if empty, shows first 5 suggested. Renders up to 5; for each, looks up area name/town from areas list. Fit-dot colour from `assessAffordability({ price: area avg price, finances, criteria })`. |
| Criteria | criteria, profile, finances | tile-criteria.js | Prose from criteria.propertyTypePrefs.preferred[0–1] + property type + location + beds + budget + features. Spec strip: 6 rows (Beds/Budget/Deposit/EPC/Tenure/Window) with values from criteria + finances. |
| Journey | — | tile-journey.js | Fetches `data/journey.json` (phases + tasks structure) + `getJourneyProgress()` (household's task.completed state). Renders 7 phase nodes, each with progress counter (done/total). Current phase determined by `currentStep(journey, state)`. Tick button marks one task done in state.tasks[taskId], saves via `saveJourneyProgress()`, re-renders. |
| Readiness | finances, goals, readiness checklist | tile-readiness.js | % = (current saved / hoped goal) × 100. Months-to-goal = (hoped − current) / monthly at current/+500/+1k rates. Next priority: find first unchecked item in READINESS_PRIORITY array matching household's `readiness_checklist` Supabase rows. READINESS_PRIORITY hardcoded (7 items). |
| ISA YTD | investments | tile-isa-ytd.js | Fetches `getInvestmentsHistory()`, filters current-year months, sums `monthlySummary[].net`. Renders £ or `—`. |
| Savings Visuals (sparkline) | investments history, finances, goals | tile-savings-visuals.js `renderSavingsSpark()` | Fetches history via `getInvestmentsHistory()`. Builds 12-month series via `buildSavingsSeries({ history, finances, goal })`. Plots last 12 months. Dashed target line at goal height. Caption shows average monthly velocity + ETA month if crossing target. |
| Scenarios Fan | finances | tile-savings-visuals.js `renderScenariosFan()` | Calls `getSavingsVelocity(financesData)` to compute 6 scenarios. Renders bars: −£500/mo, −£200/mo, baseline, +£200/mo, +£500/mo, +£5k windfall. Each bar width proportional to etaMonths. Baseline highlighted. Caption compares baseline to +£500/mo delta. |
| Net-worth Donut | investments, finances, goals | tile-savings-visuals.js `renderNetworthDonut()` | Extracts isaValue (totalSavings − cashSavings), cashValue (cashSavings), cardDebt. Pie: isaValue arc + cashValue arc. Centre text = isaValue + cashValue − cardDebt (effective deposit). |
| Withdrawal Readiness | investments | tile-savings-visuals.js `renderWithdrawalReadiness()` | Progress bar: months from first contribution to LISA-usable date (open ≥ 12 months from first contribution — ⚠️ code correction A3; GOV.UK; OneFamily, Jan 2026). Marker at current date. Caption shows remaining months. |
| NBA | listings, reactions, statuses, finances, criteria, learned prefs | tile-nba.js | Fetches 200 listings + reactions + statuses. Scores each via `scoreListingFit({ listing, finances, criteria, learnedPrefs })`. Calls `computeNextBestActions({ reactions, listings, statuses, scoreOf, now })` to rank and prioritize (e.g., "3 new matches in Basingstoke"). Renders as link-list. Async; never blocks bento. Hides if no actions. |

---

### Feature & behaviour catalogue (vetted per-tile)

#### Tile: Lede (lines 29–37, index.html)

**Purpose:** Personal headline + key metrics table. First impression of the user's search profile.

**Trigger/Entry:** `page-home.js` line 50: `renderLede(profile, criteria, financesData)`.

**Inputs & preconditions:**
- `profile`: object with `headline` (custom prose), `locationFocus`, `movingTimeline`.
- `criteria`: object with `budget.max`, `size.minBeds`, `size.idealBeds`, `propertyTypePrefs.preferred[]`.
- `financesData`: object with `goal.targetDeposit`, `goal.movingWindow`.

**Precise rule — tile-lede.js lines 4–25:**
- Budget: formats `criteria.budget.max` via `gbp()` (file:assets/js/format.js, decimal-aware pound symbol).
- Deposit: formats `financesData.goal.targetDeposit` via `gbp()`.
- Beds: if `minBeds` present, renders `minBeds` or `minBeds–idealBeds` (if `idealBeds > minBeds`). Otherwise `—`.
- Window: `financesData.goal.movingWindow` or falls back to `profile.movingTimeline`, or `—`.
- **Prose:** if `profile.headline` set, render it as-is. Otherwise auto-generate: `"Looking for {type} in {location} · {beds}-bed · {budget} · with {deposit} target"` — type from first 2 property-type prefs, location from `profile.locationFocus` (default "Hampshire & Wiltshire").

**Outputs & effects:**
- Five DOM elements updated: `#lede-budget`, `#lede-deposit`, `#lede-beds`, `#lede-window`, `#lede-prose` (via `setText()`, updates `.textContent`).

**Edge cases & failure modes:**
- `criteria.budget.max` = 0 or missing → `—`.
- `minBeds` undefined → `—`.
- `idealBeds < minBeds` → still renders as `minBeds–idealBeds` (not reversed).
- No property-type prefs → falls back to "a home".
- No location focus → falls back to hardcoded "Hampshire & Wiltshire".

**Rationale:** Lede is the user's quick "at-a-glance" summary. Custom headline respects personalization; auto-prose is a sensible default. All values are nullable (set to `—`) for transparency.

**Invariants/acceptance criteria:**
- `lede-budget` ≠ empty (either £amount or `—`).
- `lede-beds` is integer or range (`N–M`) or `—`.
- `lede-window` is non-empty string or `—`.
- `lede-prose` is at least 10 characters (not stub). ✓ UNCONFIRMED (no test in codebase for prose length).

**DESIGN.md rule served:** Linear-dense anchor — compact, readable key metrics. No emoji, no gradient, no hero KPI card.

---

#### Tile: Deposit (lines 45–83, index.html; tile-deposit.js)

**Purpose:** Show savings progress toward deposit goal. Ring progress %, ETA, scenario variations, mini-flow, ISA YTD.

**Trigger/Entry:** `page-home.js` line 52: `renderDeposit(financesData)`.

**Inputs & preconditions:**
- `financesData`: object with `savings.totalSavings` (or `.current` fallback), `savings.monthlyContribution`, `savings.avgMonthlyDepositEstimate`, `goal.targetDeposit`, `goal.movingWindow`.

**Precise rule — tile-deposit.js lines 83–105:**
- **Base state:** `{ saved, monthly, avgMonthly, target, window }` extracted from `financesData`.
- **Ring %:** `calcDepositProgress(saved, target)` (file:assets/js/finances.js, line ~) — clamps to 0–100 via `Math.min/max`.
- **Ring SVG animation:** stroke-dashoffset = `100 - pct` (file:line 23), applied via `requestAnimationFrame()` for smooth paint.
- **ETA label:** computes future date via `calcMonthsToTarget(saved, target, monthly)`, rounds months, then `new Date().setMonth(+ rounded)`. Formats as "Target in {duration} · {month year} · window {window}".
  - If `monthsTo` is not finite or `target === 0`, displays fallback: "Moving window: {window}" or "Set a deposit target on the Finances page."
  - (file:line 46–54, tile-deposit.js).
- **Scenario chips (baseline, +£200/mo, +£500/mo, +£5k):** `SCENARIO_DELTAS` (file:line 6–11) defines { deltaMonthly, lumpSum } per scenario. Clicking a chip applies delta, re-calls `applyDepositScenario()`, updates all stats + ring. aria-pressed toggled by JS (file:line 99–101).
- **Mini-flow bar:** `getMoneyFlow(financesData)` returns { buckets, income.total }. For each bucket (Bills, Expenses, Savings, Spare), width = (bucket.amount / total) × 100%. Segment colour via `MINI_FLOW_COLORS` (file:line 13–18, colour-mix oklch). Legend renders bucket names + £ amounts.
- **ISA YTD stat:** separate tile-isa-ytd.js; result inserted into `#isa-ytd-stat` (index.html line 71).

**Outputs & effects:**
- DOM updates: `#td-headline` (saved / target), `#td-ring-pct` (%), `#td-saved`, `#td-target`, `#td-monthly`, `#td-monthly-avg` (average from history), `#td-eta` (HTML with duration + date), `#td-flow` (mini-flow bar SVG spans), `#td-flow-legend` (list).
- Ring SVG: `#td-ring-bar` stroke-dashoffset animated.
- Event listeners: `.scenario-chip` click handlers toggle aria-pressed, re-render on selection.

**Edge cases & failure modes:**
- `target = 0` → ETA displays fallback message; ring at 0%.
- `saved > target` → ring clamps to 100%.
- `monthly = 0` → ETA = "already there" or infinity; displayed as fallback.
- Mini-flow: if all buckets ≤ 0, bar is empty (no segments); legend empty.
- Scenario: if `SCENARIO_DELTAS[key]` missing, falls back to baseline.

**Rationale:** Ring provides intuitive progress at a glance. Scenarios let user explore "what if" without leaving dashboard. Mini-flow humanizes the deposit in context of monthly cash flow. ETA is the most actionable summary.

**Invariants/acceptance criteria:**
- Ring % ∈ [0, 100]. ✓ file:tile-deposit.js line 23.
- ETA date is always in the future or "already there". ✓ UNCONFIRMED (no bounds check if past date due to negative monthly).
- Scenario chips exactly 4; one aria-pressed at a time. ✓ file:index.html lines 72–77, JS line 99–101.
- Mini-flow segments sum ≤ 100% (no overflow). ✓ UNCONFIRMED.

**DESIGN.md rule served:** Linear-dense — ring is compact data viz, not a hero KPI card. Scenarios avoid repetitive cards; aria-pressed is keyboard-accessible.

---

#### Tile: Affordability (lines 132–149, index.html; tile-affordability.js)

**Purpose:** Show affordability verdict bands across a price range (£250k–£500k). User can adjust From/To inputs to see their position.

**Trigger/Entry:** `page-home.js` line 54: `renderAffordability(financesData, criteria)`.

**Inputs & preconditions:**
- `financesData`: used by `assessAffordability()` to compute LTI, payment %, spare bands.
- `criteria`: used by `assessAffordability()` to fetch budget range (if not yet seed from finances).

**Precise rule — tile-affordability.js lines 6–104:**
- **Band computation (lines 6–22):** Loop over `LADDER_RANGE.min` to `.max` (file:intelligence-constants.js line 27, **£250k–£500k, £2k step**). For each price `p`, call `assessAffordability({ price: p, finances: financesData, criteria })` → returns `{ verdict }`. Collect contiguous zones: when verdict changes, record band `{ verdict, start, end }`.
- **SVG ladder (lines 25–67):** Build SVG string. For each band, draw `<rect class="ladder__band--{verdict}">` at scaled x (price → pixel). Range marker (From/To): if two distinct inputs, draw overlay rect + both endpoint markers + labels. If single input, draw single marker + label.
  - Scale function (line 29): `(price - RANGE.min) / (RANGE.max - RANGE.min) * innerWidth`.
  - Clamp inputs (line 30): both to [RANGE.min, RANGE.max].
- **Verdict prose (lines 78–95):** Re-rendered on input change (line 103). If range (hi > lo), assess both endpoints, check if verdicts match:
  - Match → "£X–£Y is {verdict} across the range."
  - Mismatch → "£X–£Y: {verdict} at low end, {verdict} at high end."
  - Single point → render the single-price verdict headline (file:affordability.js `assessAffordability()` returns `.headline`).
- **Input seeding (lines 97–100):** On first render, if inputs empty, seed From = `criteria.budget.min` or `offerTarget`, To = `criteria.budget.max` or `offerTarget + 70k` (clamped to RANGE.max).
- **Event handlers (line 103):** `input` event listener on both inputs → re-render SVG + verdict.

**Outputs & effects:**
- DOM: `#ta-verdict` (verdict prose), `#ta-ladder` (SVG innerHTML, full rebuild).
- Input elements: `#ta-price-a`, `#ta-price-b` seeded (if empty).

**Edge cases & failure modes:**
- User enters price outside RANGE (< 250k or > 500k): clamped to bounds in verdict calculation; SVG still renders but marker appears at edge.
- User enters invalid (non-numeric): `.value` coerced to `NaN`, filtered out in validation (line 79 `valid()` function).
- All prices in RANGE yield same verdict (unlikely, but if all "comfortable"): single band rect spans full width.
- No verdicts ever rendered: SVG has no band rects, just ticks + markers (edge case if criteria/finances undefined).

**Rationale:** Ladder makes affordability visible across price space. From/To inputs let user test their constraint bounds. Verdict prose contextualizes the range in one sentence.

**Invariants/acceptance criteria:**
- Ladder SVG has ≥1 band rect. ✓ UNCONFIRMED.
- Verdict prose explains the range (match or split). ✓ UNCONFIRMED.
- Inputs always valid (clamped to RANGE bounds). ✓ file:line 76.

**DESIGN.md rule served:** Linear-dense — SVG is data-driven, not decorative. Verdicts via CSS (no pastel palettes, colour-mix only).

---

#### Tile: Affordability Scenarios (lines 151–157, index.html; tile-affordability-scenarios.js)

**Purpose:** Three specific scenarios showing price, LTV%, verdict, and months-to-ready ETA for each.

**Trigger/Entry:** `page-home.js` line 64: `renderAffordabilityScenariosTile(financesData, criteria)`.

**Inputs & preconditions:**
- `financesData`, `criteria`: passed through.
- Async: fetches `getGoals()` internally.

**Precise rule — tile-affordability-scenarios.js lines 6–31:**
- Calls `assessAffordabilityScenarios({ finances: financesData, criteria, goals })` (file:affordability.js, returns { buyNowLowerTarget, buyOnTargetDeposit, buyAtHigherTarget }, each with price, LTV%, verdict, monthsToReady).
  - buyNowLowerTarget: lower price point, sooner timeline.
  - buyOnTargetDeposit: at the user's stated offerTarget.
  - buyAtHigherTarget: stretch to £400k.
- Renders 3-row list (line 26). Each row: label + price @ LTV% + verdict badge + eta (months or "available now").
  - Verdict badge class = `.verdict-badge--{verdictSlug}` (replace `-` with `_` for CSS class).
  - ETA: if monthsToReady > 0, show "~{months} months"; else "available now".

**Outputs & effects:**
- DOM: `#tsc-body` innerHTML replaced with `<ul class="scenario-list">` + 3 rows.
- Async: waits for `getGoals()` before rendering.

**Edge cases & failure modes:**
- `getGoals()` fails → returns null, function returns early (line 11 try/catch). Tile displays stale content or "Calculating..." from index.html line 155.
- All 3 scenarios have same verdict → still renders 3 rows (not collapsed).
- monthsToReady is 0 or negative (already at target) → "available now".

**Rationale:** Three concrete scenarios avoid abstract "what if". Each includes price + LTV% to ground the verdict in borrowing terms.

**Invariants/acceptance criteria:**
- Always exactly 3 rows rendered. ✓ file:line 26–29.
- Each row has a valid verdict badge class. ✓ UNCONFIRMED.
- ETA always "~N months" or "available now", never blank. ✓ file:line 17.

**DESIGN.md rule served:** Linear-dense — 3-row list is compact, not a card grid. Verdict badges accessible.

---

#### Tile: Money Flow (lines 159–182, index.html; tile-money-flow.js)

**Purpose:** Two-panel stacked bar charts (Today vs. After Move) showing monthly cash flow: bills, expenses, mortgage, savings, spare.

**Trigger/Entry:** `page-home.js` line 55: `renderMoneyFlow(financesData, criteria)`.

**Inputs & preconditions:**
- `financesData`: contains income, bills, expenses, mortgage params, savings contribution.
- `criteria`: optionally contains budget.offerTarget (fallback to financesData.goal.offerTarget or default £380k).

**Precise rule — tile-money-flow.js lines 53–112:**
- **Offer price & loan:** Line 54, offerTarget from criteria or finances or default. Line 56, loan = max(0, offerTarget − targetDeposit).
- **Monthly mortgage:** `calcMonthlyMortgage(loan, rate%, termYears)` (file:finances.js).
- **Today flow:** `getMoneyFlow(financesData)` (file:money-flow.js) → { buckets: [{name, kind, amount}], income, spare }.
  - Buckets: Bills, Expenses, Savings, Spare (computed: income − bills − expenses).
- **After-move flow:** `getMoneyFlowPostMove(financesData, monthlyMortgage)` → same structure, but mortgage P&I added to outgoings, spare recalculated.
- **SVG bars (lines 7–27 `buildFlowBar`):** Horizontal stacked bar, viewBox width 300. For each bucket (in order Bills/Expenses/Savings/Spare):
  - Segment width = (bucket.amount / maxTotal) × innerWidth.
  - Segment class = `.flow__seg--{kind}` (where kind ∈ { bills, expenses, savings, negative }).
  - If segment width > 36px, overlay the £ amount text centre-aligned.
  - If flow.spare < 0, append red "negative" segment (shortfall).
- **Legend (lines 30–38):** List each bucket name + colour swatch + £ amount.
- **Headline (line 72):** `"Spare £X → £Y/mo"` (today vs. after move).
- **Caption (lines 73–80):** If spare drops negative, emphasize "outgoings exceed take-home". Otherwise note the drop with offer price.
- **Line-item drill-down (lines 82–111):** Click any segment in either SVG → `openDetails(kind, name, items)` populates collapsible details section with line-item list. For kind='mortgage', compute P&I label with rate + term. For kind='negative', show shortfall amount.

**Outputs & effects:**
- DOM: `#tf-flow-today`, `#tf-flow-after` (SVG innerHTML). `#tf-legend-today`, `#tf-legend-after` (list HTML). `#tf-headline` (text), `#tf-caption` (HTML). `#tf-details` (collapsible, initially hidden; populated on click).
- Event listeners: click handlers on both SVGs to open details.

**Edge cases & failure modes:**
- `loan = 0` (saved ≥ offer price) → monthly mortgage = 0; spare unchanged.
- No bills/expenses → buckets sparse, bar segments gapped (order preserved).
- `spare < 0` → red "negative" segment appended; caption warns.
- Clicking unknown bucket kind → openDetails gracefully no-ops (line 101 check).
- SVG text label overflow: only drawn if segment width > 36px (lines 18–20, mitigates overlap).

**Rationale:** Two panels (Today/After) make the impact of homeownership visible side-by-side. Stacked bars respect linear-dense anchor. Line-item drill-down grounds abstract categories in real line items.

**Invariants/acceptance criteria:**
- Spare (Today) + (After) always updated. ✓ file:line 72.
- Legend and bar always in sync (same buckets). ✓ UNCONFIRMED.
- Clicking a segment shows correct line-item breakdown. ✓ UNCONFIRMED.

**DESIGN.md rule served:** Linear-dense — stacked bars are compact, monospace numerals. No shadow-floated cards, no hero CTA.

---

#### Tile: Deposit Risk (lines 184–191, index.html; tile-deposit-risk.js)

**Purpose:** Assess ISA/investment portfolio volatility risk. Show current value, drop scenarios, and recommendation.

**Trigger/Entry:** `page-home.js` line 63: `renderDepositRiskTile()`.

**Inputs & preconditions:**
- Async: fetches `getInvestments()` + `getGoals()` internally.

**Precise rule — tile-deposit-risk.js lines 6–38:**
- Async-awaits both `getInvestments()` + `getGoals()` (lines 12–15).
- Calls `assessDepositRisk(investments, goals)` (file:deposit-risk.js) → returns { currentValue, scenarios: [{pctDrop, newValue, gapImpact}], verdict, recommendation }.
  - verdict ∈ { low, medium, high } risk.
  - scenarios: drop scenarios (typically 10% + 20% market decline).
  - recommendation: { action: "Consider de-risking…" or similar advice }.
- **Verdict badge (lines 21–24):** Class = `.verdict-badge--{verdictSlug}` (replace `-` with `_`). Text = verdict uppercase.
- **Scenario rows (lines 26–32):** Filter to 10% + 20% drops only. For each: "If markets drop {pct}%: **£new-value** — that's £gap off your deposit."
- **Tile body (lines 34–37):** `.tile-kpi` displays current ISA value (large, bold). `.deposit-risk-list` shows 2 scenario rows. `.deposit-risk-action` displays recommendation text.

**Outputs & effects:**
- DOM: `#tdr-body` innerHTML (KPI + scenarios + action). `#tdr-badge` (verdict badge element).

**Edge cases & failure modes:**
- `getInvestments()` or `getGoals()` fails → early return (line 15), tile stays blank or "Loading...".
- `investments` or `goals` null → early return.
- No investment history → assessDepositRisk likely returns stub/0 values; tile displays "£0" + no scenarios.

**Rationale:** Deposit-at-risk surfaces a real concern: ISA volatility. Scenarios ground the risk in concrete numbers.

**Invariants/acceptance criteria:**
- Verdict badge always one of { low, medium, high, loading }. ✓ UNCONFIRMED.
- Scenarios always 2 rows (10% + 20% filters). ✓ UNCONFIRMED.
- Current value formatted as £. ✓ UNCONFIRMED.

**DESIGN.md rule served:** Linear-dense — verdict badge no left-border pill (correct per rule).

---

#### Tile: Shortlist (lines 195–206, index.html; tile-shortlist.js)

**Purpose:** Show the user's selected areas + their fit (via coloured badge). Quick link to full areas browser.

**Trigger/Entry:** `page-home.js` line 58: `renderShortlist(financesData, criteria)`.

**Inputs & preconditions:**
- `financesData`, `criteria`: used to assess affordability of each area's average price.
- Async: fetches `getShortlist()` (array of area IDs) + `getHouseholdAreas()` (all areas user selected/added).

**Precise rule — tile-shortlist.js lines 25–85:**
- Fetches shortlist IDs + household areas (lines 27–28).
- If shortlist not empty, filters household_areas to those in shortlist. Else, shows first 5 suggested areas.
- **Count (lines 32–41):** Plural label + count of live areas. If pending areas present, appends " · {N} researching".
  - Count logic: `isPendingArea()` checks area.status (file:areas/area-ref.js line ~, UNCONFIRMED).
- **Render (lines 50–83):** For each of first 5 areas, renders:
  - `.sl-index`: 2-digit padded index (01, 02, …, 05).
  - `.fit-dot`: coloured badge (file:fitDotClass() maps verdict → CSS class). Tooltip = "{verdict} at £{price}".
  - `.sl-name`: link to area detail page + town subtext.
  - `.sl-status`: pill (Live or Researching).
  - Fit-dot colour computed via `assessAffordability({ price: area.prices.avg3Bed or fallback, finances, criteria })` → verdict ∈ { comfortable, stretch, tight, out-of-reach, unknown }.
- If no areas, renders "No areas yet — open the Areas tab to browse."
- If areas are pending (not live), renders note: "{N} area(s) researching — listings coming soon."

**Outputs & effects:**
- DOM: `#ts-count` (count text), `#home-areas` (list HTML, or "empty-note" or "sl-note").

**Edge cases & failure modes:**
- `getShortlist()` or `getHouseholdAreas()` fails → function returns early (line 84 try/catch), tile stays blank.
- No areas → empty-note ("No areas yet…").
- All areas pending → note ("X areas researching…").
- Area missing price data → fit-dot class = "fit-dot--unknown", tooltip = "No price data for this area".
- Area.prices missing all fallback fields (avg3Bed, avgDetached, avgSemi, median) → priceFor() returns null → fit-dot unknown.

**Rationale:** Shortlist preview keeps areas visible + reachable. Fit-dot badges give quick affordability context.

**Invariants/acceptance criteria:**
- Render ≤5 areas. ✓ file:line 50.
- Each area has index, fit-dot, name, town, status. ✓ UNCONFIRMED.
- Fit-dot class always valid (one of 5 values). ✓ UNCONFIRMED.

**DESIGN.md rule served:** Linear-dense — table layout, no cards. Fit-dot badge accessible via aria-label.

---

#### Tile: Criteria (lines 208–215, index.html; tile-criteria.js)

**Purpose:** Readable summary of property search preferences (type, beds, budget, location, etc.).

**Trigger/Entry:** `page-home.js` line 60: `renderCriteriaProse(criteria, profile, financesData)`.

**Inputs & preconditions:**
- `criteria`: object with propertyTypePrefs, size, budget, tenure, epcMin, features, etc.
- `profile`: contains locationFocus.
- `financesData`: contains goal.targetDeposit, goal.movingWindow.

**Precise rule — tile-criteria.js lines 4–51:**
- **Prose (lines 4–25):** Generates a narrative sentence from criteria:
  - Property type: first 2 of `criteria.propertyTypePrefs.preferred[]` (e.g. "detached or semi").
  - Beds: `minBeds` or `minBeds–idealBeds` range.
  - Tenure: first of `criteria.tenure.preferred[]` (e.g. "freehold").
  - Budget: `budget.min–budget.max` or "up to budget.max" (if min missing).
  - EPC: `epcMin` (e.g. "D+").
  - Must-have features: first 2 of `features.mustHave[]`.
  - Excluded tenure: first 2 of `tenure.excluded[]`, appended as separate sentence.
  - Falls back to "—" if no criteria set.
- **Spec strip (lines 27–51):** 6-row definition list:
  - Beds: `minBeds` or `minBeds–idealBeds` or `—`.
  - Budget: `min–max` range or `"up to max"` or `—`.
  - Deposit: `goal.targetDeposit` via `gbp()` or `—`.
  - EPC: `epcMin` or `—`.
  - Tenure: first of `tenure.preferred[]` or `—`.
  - Window: `goal.movingWindow` or `—`.

**Outputs & effects:**
- DOM: `#tc-prose` (text), `#tc-strip` (HTML list).

**Edge cases & failure modes:**
- No criteria → all values `—`, prose = "—".
- `minBeds` = 0 → renders as "0-bed" (unusual but valid).
- `idealBeds` < `minBeds` → still renders `minBeds–idealBeds` (not reversed, UNCONFIRMED).
- No propertyTypePrefs → prose falls back to "a home".

**Rationale:** Prose is human-readable; spec strip is scannable. Both pull from same sources (criteria, profile, finances) to stay in sync.

**Invariants/acceptance criteria:**
- Prose is at least one sentence. ✓ UNCONFIRMED.
- Spec strip always 6 rows. ✓ file:line 38–45.
- All values in spec strip non-empty (either data or `—`). ✓ file:line 45.

**DESIGN.md rule served:** Stripe-docs – linear-dense hybrid. Prose is editorial; spec strip is compact data.

---

#### Tile: Journey (lines 219–230, index.html; tile-journey.js)

**Purpose:** Buying journey milestone tracker. Shows progress through phases (Research → Offer → Exchange → Completion). Next action + tick button.

**Trigger/Entry:** `page-home.js` line 59: `renderJourneyTrack()`.

**Inputs & preconditions:**
- Async: fetches `data/journey.json` (phases + tasks structure) + `getJourneyProgress()` (household's completed state).

**Precise rule — tile-journey.js lines 10–52:**
- Loads journey structure: `{ phases: [{ id, title, tasks: [{id, title}] }] }` (file:data/journey.json, exact structure UNCONFIRMED).
- Fetches household state: `{ tasks: {taskId: boolean} }` (Supabase-backed).
- **Render nodes (lines 17–27):** For each phase, computes progress via `phaseProgress(state, phase)` → { done, total }. Renders node with:
  - Label: phase index + 1 (1–7).
  - Progress: "{done}/{total}" (e.g. "2/4").
  - Mod class: `--done` if phase complete, `--current` if matches currentPhaseId, else empty.
- **Current phase (line 14):** Determined by `currentStep(journey, state)` (file:journey/progress.js, returns phase + step + tasks).
- **Next action (lines 30–46):** If current step exists, displays step.title in `#tj-next-text`. Tick button enabled. On click:
  - Find first unchecked task in current step (line 40).
  - Mark it done in state.tasks[taskId] = true.
  - Save state via `saveJourneyProgress(state)` (to Supabase).
  - Re-render (recursive call, line 45).
  - If no current step, displays "All steps ticked off — nice work.", button disabled.

**Outputs & effects:**
- DOM: `#tj-track` (list HTML, 7 nodes), `#tj-next-text` (step title or completion message), `#tj-next-tick` (button enabled/disabled).
- Supabase: saves updated journey_progress row on tick.

**Edge cases & failure modes:**
- `loadJSON('journey')` fails → function returns early (line 49 try/catch), tile displays error message via setText (line 50).
- `getJourneyProgress()` returns null → initialized to { tasks: {} } (line 13).
- `currentStep()` returns null → displays completion message, button disabled.
- Tick on a task that's already done → idempotent (re-marks as true, same effect).

**Rationale:** Milestone tracker is a motivational tool. Explicit task-by-task ticking keeps progress granular and interactive.

**Invariants/acceptance criteria:**
- Always 7 nodes rendered (one per phase). ✓ UNCONFIRMED (journey.phases is assumed length 7).
- Exactly one node has `--current` class (or none if complete). ✓ UNCONFIRMED.
- Tick button always enabled xor button text is "All steps ticked off". ✓ file:line 32.

**DESIGN.md rule served:** Linear-dense — vertical milestone track, no cards. Tick button accessible (checkmark symbol, focus-visible).

---

#### Tile: Readiness (lines 85–96, index.html; tile-readiness.js)

**Purpose:** Deposit progress (%) + months-to-goal at different savings rates + next priority action from a checklist.

**Trigger/Entry:** `page-home.js` line 62: `renderReadinessTile(financesData)`.

**Inputs & preconditions:**
- `financesData`: contains savings.totalSavings, savings.monthlyContribution, goal.targetDeposit.
- Async: fetches `getGoals()` + `getReadinessChecklist()` internally.

**Precise rule — tile-readiness.js lines 14–56:**
- Async-awaits `getGoals()` + `getReadinessChecklist()` (lines 20–22).
- **Deposit % (lines 25–30):** % = (current / hoped) × 100, clamped to 100. Headline: "You're {pct}% of the way to your £{hoped} deposit target." If goal not set, "Deposit target not set."
- **Months-to-goal (lines 40–48):** Calculates gap = hoped − current. For 3 rates (current, +£500, +£1k):
  - moLabel = gap / monthly (rounded up), or "already there" if gap ≤ 0 or monthly = 0.
  - Renders as: `<div><dt>At current pace</dt><dd>{moLabel}</dd></div>` (and +500, +1k variants).
  - If monthly not set, displays "not set" instead of grid.
- **Next priority action (lines 51–55):** Hardcoded `READINESS_PRIORITY` array (file:line 4–12, 7 items: credit checks, AIP, conveyancer, etc.). Maps household's `readiness_checklist` Supabase rows into checkMap (item_key → completed boolean). Finds first unchecked item in priority order (line 53). Displays its label; if all done, "All priority actions done."
  - **READINESS_PRIORITY (file:line 4–12):**
    ```
    { key: 'experianChecked', label: 'Check your Experian credit score' },
    { key: 'equifaxChecked', label: '…' },
    { key: 'transUnionChecked', label: '…' },
    { key: 'electoralRollRegistered', label: 'Register on the electoral roll' },
    { key: 'mortgageBrokerConversation', label: 'Speak to a mortgage broker' },
    { key: 'agreementInPrincipleObtained', label: 'Get an Agreement in Principle' },
    { key: 'conveyancerIdentified', label: 'Identify a conveyancer' },
    ```

**Outputs & effects:**
- DOM: `#readiness-headline` (%, goal amount), `#readiness-stats` (3-row definition list), `#readiness-next-text` (next action label).

**Edge cases & failure modes:**
- `getGoals()` or `getReadinessChecklist()` fails → function returns early (line 21), tile stays blank.
- goal.hopedFor = 0 → % = 0, headline = "Deposit target not set."
- monthly = 0 → moLabel = "not set" (no division attempted).
- checklist is empty → nextItem = first item in READINESS_PRIORITY (always found, assuming non-empty array).
- All checklist items completed → nextItem = null, label = "All priority actions done."

**Rationale:** Readiness % is motivational. Months-to-goal at 3 rates shows savings agility. Next action keeps the checklist from feeling abandoned.

**Invariants/acceptance criteria:**
- % ∈ [0, 100]. ✓ file:line 27.
- Always 3 month rates rendered (if monthly set). ✓ file:line 44–47.
- Next action is always non-empty text. ✓ file:line 54.

**DESIGN.md rule served:** Linear-dense — grid of stats, no cards. No hero KPI.

---

#### Tile: ISA YTD (tile-isa-ytd.js; inline stat in deposit tile)

**Purpose:** Quick ISA contribution YTD (year-to-date).

**Trigger/Entry:** `page-home.js` line 61: `renderISAYTD()` (also called inline on deposit tile render).

**Inputs & preconditions:**
- Async: fetches `getInvestmentsHistory()` internally.

**Precise rule — tile-isa-ytd.js lines 5–19:**
- Fetches `getInvestmentsHistory()` → array of monthly summaries with { month: "YYYY-MM", net: £ } (file:line 9, UNCONFIRMED exact structure).
- Filters to current year (line 14): month.startsWith(new Date().getFullYear().toString()).
- Sums `net` values for the year (line 15–16).
- Renders £ amount or `—` if no history.

**Outputs & effects:**
- DOM: `#isa-ytd-stat` (text, embedded in deposit tile line 71, index.html).

**Edge cases & failure modes:**
- `getInvestmentsHistory()` fails → el.textContent = `—`.
- history is null → el.textContent = `—`.
- `analysePerformance(history).isStub = true` → el.textContent = `—`.
- No months in current year → sum = 0, renders as `£0`.

**Rationale:** ISA YTD is a quick savings signal. Inline placement in deposit tile avoids redundant tile.

**Invariants/acceptance criteria:**
- Output is always £ amount or `—`. ✓ file:line 7, 10, 12, 17.

**DESIGN.md rule served:** Linear-dense — inline stat, no card.

---

#### Tile: Savings Visuals (lines 98–128, index.html; tile-savings-visuals.js)

**Purpose:** Four SVG charts: sparkline (12-month trajectory), scenarios fan (multiple savings rates), net-worth donut, withdrawal readiness bar.

**Trigger/Entry:** `page-home.js` lines 65–68: `renderSavingsSpark()`, `renderScenariosFan()`, `renderNetworthDonut()`, `renderWithdrawalReadiness()`.

**Inputs & preconditions:**
- `financesData`: goal.targetDeposit, savings totals.
- Async: `renderSavingsSpark()` fetches `getInvestmentsHistory()`. Others fetch respective data.

##### Sub-feature: Sparkline

**Precise rule (lines 15–71):**
- Fetches `getInvestmentsHistory()` → array of monthly investment records.
- Builds 12-month series via `buildSavingsSeries({ history, finances, goal })` (file:savings-series.js, returns { points: [{month, cumulative}], isStub, targetLine: {etaMonth} }).
- If isStub or no points → renders empty SVG + caption = "Run the Trading 212 importer to see your savings trajectory."
- Otherwise, plots last 12 months:
  - X-axis: months 0–window.length-1.
  - Y-axis: cumulative savings (0 to max of goal or latest point).
  - Renders 3 SVG elements: target dashed line (y = goal), area path (fill under curve), line path (stroke curve).
  - Caption: avg velocity over 12 months + ETA month if crossing target.

**Edge cases:**
- `getInvestmentsHistory()` fails → empty SVG + message.
- Series is stub (no data) → empty SVG + message.
- goal = 0 → max Y = latest point (no target line drawn, UNCONFIRMED).

##### Sub-feature: Scenarios Fan

**Precise rule (lines 73–146):**
- Calls `getSavingsVelocity(financesData)` (file:savings-velocity.js) → { baseline: {etaMonths, etaDate}, scenarios: [{label, etaMonths, etaDate}] }.
- Scenarios: −£500/mo, −£200/mo, baseline, +£200/mo, +£500/mo, +£5k windfall (6 total, file:line 85).
- Renders 6 bars, each width proportional to etaMonths. Baseline bar highlighted (different class). Y-axis label = scenario label, X-axis = bar width (months).
- Caption: "Adding £500/mo brings target {delta} months closer."
- If all scenarios ≤ 0 (already at target) → empty SVG + "Already at target — no projection needed."

##### Sub-feature: Net-worth Donut

**Precise rule (lines 148–200+):**
- Extracts: isaValue = totalSavings − cashSavings, cashValue = cashSavings, cardDebt = creditsCardsBalance.
- Effective deposit = isaValue + cashValue − cardDebt.
- Pie chart: ISA arc (cyan), cash arc (lighter), centre text = effective deposit, centre label = "Effective deposit".
- Stroke-dasharray proportional to slice size (using SVG circle + transform rotate -90).

##### Sub-feature: Withdrawal Readiness

**Precise rule — renderWithdrawalReadiness():**
- Progress bar from `firstContributionDate` to `firstContributionDate + 12 months` — a LISA can be
  used for a first-home purchase once it has been **open ≥ 12 months from the first contribution**.
- Marker at current date. Caption shows remaining months until the 12-month point.
- (file:lines 200+, read limit reached; exact implementation to be re-read during intake.)

> **⚠️ External validation — correction required in code (A3):** the prior spec described a
> "~4–5 year seasoning rule (UNCONFIRMED)." That is **wrong** and is hereby removed. The real rule is
> the **12-month-from-first-contribution** window above. Schedule a §3/§4 phase to make the tile plot
> `firstContributionDate → firstContributionDate + 12 months` (not a 4–5 year horizon), and to source
> `firstContributionDate` from stored LISA data. (GOV.UK Lifetime ISA; OneFamily, Jan 2026.)

**Outputs & effects:**
- DOM: `#td-savings-spark`, `#td-spark-caption` (sparkline), `#tsf-svg`, `#tsf-caption` (fan), `#tnw-svg`, `#tnw-stats`, `#tnw-caption` (donut), `#tws-bar`, `#tws-fill`, `#tws-marker`, `#tws-caption` (seasoning bar).

**Edge cases:**
- All charts can fail independently. If fetch fails, chart is empty + default caption.
- Sparkline + seasoning bar require investment history. If unavailable, render stub message.

**Rationale:** Four charts provide rich savings transparency. Sparkline shows past; fan shows future; donut shows composition; seasoning bar shows liquidity constraint.

**Invariants/acceptance criteria:**
- Sparkline plots 12 months or fewer (if less history available). ✓ UNCONFIRMED.
- Fan always has exactly 6 bars. ✓ file:line 85.
- Donut centre text = £ amount. ✓ UNCONFIRMED.
- Seasoning bar fills 0–100%. ✓ UNCONFIRMED.

**DESIGN.md rule served:** Linear-dense — 4 compact, distinct charts. No cards, no shadows. SVG + text only.

---

#### Tile: NBA (Next-Best-Action strip, lines 39, index.html; tile-nba.js)

**Purpose:** Self-contained recommender strip showing top 3 next-best actions (e.g., "Review 3 new matched properties in Basingstoke"). Appears above bento; hidden if no actions.

**Trigger/Entry:** `page-home.js` line 84: `renderNba()` (async, never blocks bento).

**Inputs & preconditions:**
- Async: fetches 6 sources in parallel: listings, reactions, statuses, finances, criteria, learned preferences.
- Requires: listings table, listing_reactions table, shortlist_statuses table in Supabase.

**Precise rule — tile-nba.js lines 17–48:**
- Loads 200 listings (limit: 200, line 22) via `getListings({ limit: 200 })`.
- Loads reactions (like/reject history), statuses (saved/unsaved), finances, criteria, learned prefs in parallel (lines 21–24, Promise.all).
- Derives finances from raw (line 25).
- Computes effective learned weights (line 26, file:learned-preferences.js).
- Scores each listing via `scoreListingFit({ listing, finances, criteria, learnedPrefs })` (file:listings/fit.js, returns { verdict, gated }).
- Calls `computeNextBestActions({ reactions, listings, statuses, scoreOf, now })` (file:meta-observations.js, returns array of actions like { text, href, count, timestamp }).
- Renders actions as link-list (lines 36–42):
  - Each action: `<a href="...">` with text + "→" cta arrow.
  - Link href = `url(action.href)` (file:config.js, resolves to page path).
  - Max 3 actions (file:META_OBS.NBA_MAX in intelligence-constants.js, line 142, value = 3).
- If no actions, hides strip (line 33, mount.hidden = true).
- Catches errors silently (line 44–46, console.error only).

**Outputs & effects:**
- DOM: `#nba-strip` (h2 + ul with actions, or hidden).
- No state saved; purely reactive.

**Edge cases & failure modes:**
- Any fetch fails → entire tile fails silently; strip hidden.
- 200 listings too many (perf) → UNCONFIRMED whether pagination is needed; currently no perf gate.
- No reactions/statuses → scores based on static fit only (no learned preferences).
- All listings fail to score → no actions derived, strip hidden.

**Rationale:** NBA is a recommendation engine. Self-contained async keeps it from blocking the bento. Top 3 actions prevent choice paralysis.

**Invariants/acceptance criteria:**
- NBA strip always hidden or visible (binary state). ✓ file:line 33–34.
- If visible, contains 1–3 actions. ✓ file:META_OBS.NBA_MAX line 142.
- Each action is a hyperlink. ✓ UNCONFIRMED.

**DESIGN.md rule served:** Linear-dense — list of actions, not cards. Hidden state respects minimalism.

---

### Coupling & dependencies

**Shared state / modules:**
- `storage.js` (+ `storage/*.js` sub-modules): All data retrieval. Supabase-backed + localStorage cache. Never call Supabase directly from tiles; always go through storage.js.
- `finance-derive.js` (`deriveFinances()`): **Single source of derived truth** for computed fields. Shared by all finance-consuming tiles (deposit, affordability, money-flow, readiness, scenarios, NBA).
- `affordability.js` (`assessAffordability()`, `assessAffordabilityScenarios()`): Verdict band logic. Shared by affordability tile + ladder + scenarios + shortlist + deposit-risk + listings fit scoring.
- `money-flow.js` (`getMoneyFlow()`, `getMoneyFlowPostMove()`): Expense bucket splitting. Used by deposit mini-flow + money-flow tile.
- `finances.js` (utilities): `calcDepositProgress()`, `calcMonthsToTarget()`, `calcMonthlyMortgage()`, `calcLTV()`, `lisaEligible()`, etc. Used by many tiles.
- `format.js`: `gbp()`, `monthsAsDuration()` — number formatting. All monetary figures go through `gbp()`.
- `savings-series.js` (`buildSavingsSeries()`): 12-month investment history. Used by sparkline.
- `savings-velocity.js` (`getSavingsVelocity()`): Scenario projections (6 rates). Used by scenarios-fan.
- `listings/fit.js` (`scoreListingFit()`): Affordability + criteria fit scoring. Used by NBA + listings page.
- `intelligence-constants.js`: Verdict thresholds (LTI_BANDS, PAYMENT_BANDS_PCT, SPARE_BANDS_GBP), LADDER_RANGE, LADDER_TICKS, learned-pref tuning, META_OBS constants.
- `flow-constants.js` (`FLOW_PALETTE`): Bucket colour map.
- `dom.js`: Helpers (byId, setText, setHTML, esc, el, clear).
- `areas/area-ref.js`: `resolveAreaRef()`, `isPendingArea()` — area lookup + status check.
- `investment-performance.js`: `analysePerformance()` — investment history analysis.
- `deposit-risk.js` (`assessDepositRisk()`): Market drop scenarios + verdict.
- `learned-preferences.js`: `effectiveWeights()`, `listingLearnedPrefs()` — learned scoring weights.
- `meta-observations.js` (`computeNextBestActions()`): NBA ranking engine.
- `journey/progress.js`: `phaseProgress()`, `phaseIsDone()`, `currentStep()` — journey state logic.

**§16 out-of-scope (untouched by feature work):**
- `assets/css/tokens.css` — all colour/type/spacing tokens (redesignable only per §4 owner approval).
- `assets/js/storage.js` — Supabase backing layer (extend modules in `storage/`, never rewrite core shim).
- `assets/js/finances.js` — finance calculators (extend subfolder modules, never rewrite).

**Constraints:**
- **Single source of derived state:** Every tile reads from `financesData` (shared, derived once per render). No independent calculators that bypass `deriveFinances()`.
- **SVG sizing:** viewBox + preserveAspectRatio; JS draws in viewBox space (0–300 or 0–320 typically), no pixel-level size set by JS.
- **Colour:** All via `color-mix(in oklch, var(--accent), var(--paper))` or similar. No hard-coded hex in component CSS.
- **Spacing:** All via `--space-*` tokens; font-size via `--text-*` or `clamp()` with 1rem floor (iOS zoom guard, DESIGN.md §2).
- **Responsive:** Mobile-first (320–480 px). Breakpoints at 480, 768, 1024, 1280 px (`min-width` only). No horizontal scroll at 320 px.
- **Async:** Tiles that fetch (readiness, deposit-risk, affordability-scenarios, journey, ISA YTD, all savings-visuals, NBA) must handle errors gracefully (fallback to `—` or stub message, never throw uncaught).

---

### Test coverage & behaviours new tests must pin

**Status quo (`tests/characterization-home.test.js`):**
- Pure-module regression baseline (no DOM access).
- Covers: lede prose, affordability verdict bands, money-flow buckets, deposit progress %, readiness %, shortlist area count, deposit-risk scenarios.
- **Gaps:** No DOM-level characterization, no sparkline/fan/donut shape tests, no loading/error state tests, no NBA tile, no snapshot tests.

**New test behaviours (Fable phase):**

1. **Lede tile:**
   - Budget max formats via gbp() (e.g., £450,000 → "£450,000").
   - Beds: minBeds renders as integer; minBeds + idealBeds renders as range.
   - Prose: custom headline overrides auto-prose.
   - Prose fallback: no headline + no property-type prefs → "Looking for a home in {location}."

2. **Deposit tile:**
   - Ring % computes correctly (saved / target × 100, clamped 0–100).
   - Scenario chips: baseline always aria-pressed="true" on init; only one chip pressed at a time.
   - Scenario delta applied: +£200/mo chip adds 200 to monthly, re-computes ETA.
   - ETA label: if monthsTo = 12, ETA = "in 1 year"; if monthsTo = 6, "in 6 months".
   - Mini-flow: segments sum to 100% (or less if spare is negative).
   - ISA YTD: pulls current-year contribution from history.

3. **Affordability tile:**
   - Ladder bands: contiguous verdicts grouped (no single-price "islands").
   - Ladder SVG: band rects colour-coded (`ladder__band--{verdict}`).
   - From/To inputs: clamped to LADDER_RANGE bounds (file:affordability.js line 27 — but check actual range, currently £250k–£500k, not £100k–£2M per original fable doc §7.2 line 472).
   - Verdict prose: match case ("is comfortable") vs. split case ("comfortable at low end, stretch at high").

4. **Affordability Scenarios:**
   - 3 rows always rendered (buy sooner, target, stretch).
   - Verdict badges: one of { comfortable, stretch, tight, out-of-reach }.
   - LTV% displayed (e.g., "~75%").
   - ETA: "~N months" or "available now".

5. **Money Flow:**
   - Today + After flows: separate SVGs, same-scale max total.
   - Spare line: Today spare vs. After spare (usually negative delta).
   - Segment widths: proportional to bucket.amount / total.
   - Shortfall (negative spare): "negative" segment appended (red).
   - Line-item drill-down: clicking segment populates `#tf-details`.

6. **Readiness:**
   - % of goal: (saved / hoped) × 100, clamped 0–100. Headline always "You're {pct}% of the way to £{hoped}."
   - Months-to-goal: gap / monthly rate, rounded up. 3 rates (current, +500, +1k) always shown (if monthly set).
   - Next priority: first unchecked item in READINESS_PRIORITY order. If all checked, "All priority actions done."

7. **Shortlist:**
   - Fit-dot colours: one of { comfortable, stretch, tight, out-of-reach, unknown } (5 classes).
   - Count: "X areas" or "X areas · Y researching".
   - Up to 5 areas rendered (line 50 filter).
   - Empty state: "No areas yet — open the Areas tab to browse."

8. **Journey:**
   - 7 nodes always (one per phase).
   - Exactly one node --current (or none if complete).
   - Tick button: enabled if current phase exists, disabled if all done.
   - Tick saves to Supabase (via saveJourneyProgress).

9. **Deposit Risk:**
   - Verdict badge: one of { low, medium, high } risk.
   - Scenarios: 2 rows (10% drop + 20% drop), each shows £new-value + gap impact.
   - Recommendation text always present.

10. **ISA YTD:**
   - Current-year months only (filter by YYYY).
   - Sum of net contributions.
   - Format: £ amount or `—`.

11. **Savings Sparkline:**
   - 12 months plotted (or fewer if less history).
   - Target dashed line at goal height.
   - Caption: avg velocity + ETA month (if crossing target).
   - Empty state: "Run the Trading 212 importer…"

12. **Scenarios Fan:**
   - 6 bars (−500, −200, baseline, +200, +500, +5k windfall).
   - Baseline bar highlighted (different CSS class).
   - Bars width ∝ etaMonths.
   - Caption: "Adding £500/mo brings target X months closer."

13. **Net-worth Donut:**
   - Centre text: effective deposit (£amount or £0).
   - Centre label: "Effective deposit".
   - ISA + cash arcs (proportional to slice).
   - Empty state: centre text = £0 (if no savings).

14. **NBA strip:**
   - Hidden if no actions.
   - Visible if ≥1 action.
   - Max 3 actions shown (if more computed, truncate).
   - Each action is a link + text + arrow (→).

15. **Coordinator (`page-home.js`):**
   - LOADING_IDS (5 elements) dimmed on init.
   - `renderAll()` calls all 13 tile functions.
   - `onUpdate` callback: triggered by storage cache refresh, re-renders all tiles.
   - NBA: async, never blocks bento (rendered last).
   - Error handling: each try/catch logs to console, continues (no tile error halts the page).

16. **Responsive (bento grid):**
   - Mobile (≤1023px): 1 col, all tiles full-width.
   - 1024–1279px: 2 cols, deposit + flow span 2.
   - 1280px+: 3 cols, deposit + flow span 2.
   - Band labels span full width (grid-column: 1 / -1).

17. **Loading states:**
   - `[data-loading="true"]`: dims text, appends animated ellipsis.
   - `clearStuckLoading()`: restores to `—` if empty after render.
   - Only 5 elements tracked (LOADING_IDS); other tiles have no loading state (smell!).

18. **Error handling:**
   - Async errors (tile fetches) caught silently; tile displays stale data or default message.
   - No per-tile error state (smell!).
   - Page never crashes (all try/catch blocks in place).

---

### Known smells / tech debt / risks

1. **13 unrelated tiles, one coordinator:** `page-home.js` blindly calls all 13 `render*()` functions in sequence. If one fails, no fallback per-tile. If one is slow, blocks others (only async is NBA). Smell: repetitive imports + calls; no registry pattern.
   - **Risk:** Unmaintainable as count grows.
   - **Mitigation:** Move to per-tile error handling + registry (phase 11.1).

2. **Loading-state UX incomplete:** `markLoading()` dims only 5 elements (LOADING_IDS). Other tiles (shortlist, criteria, journey, readiness, deposit-risk) have no loading state. If a tile fails silently, user sees stale data + no error indication.
   - **Risk:** User confusion; silent failures.
   - **Mitigation:** Extend LOADING_IDS to all 13 tiles; add per-tile `.is-loading` state (phase 11.1).

3. **`getFinances()` onUpdate callback unthrottled:** Fires `renderAll()` on every Supabase cache refresh. Rapid changes (user typing in finances form on another tab) cause 13 re-renders per keystroke.
   - **Risk:** Perf regression; tiles with SVG redraws (sparkline, fan, donut, ladder) are expensive.
   - **Mitigation:** Debounce or batch callback; defer revalidation until idle (phase 11.2).

4. **Bento grid layout fragile:** Spans controlled entirely by media queries in `tile-card.css`. Why only deposit + flow span 2? No clear rationale. Container-query threshold (720px in tile-deposit.css) differs from bento media breakpoint (1024px).
   - **Risk:** Future tile addition/removal risks broken layouts. Mobile-first confusion.
   - **Mitigation:** Hoist all bento-grid media queries to new `layout-bento.css`; document spans rationale in CSS comments (phase 11.3).

5. **SVG drawing via string concatenation:** Every visual tile (affordability, money-flow, sparkline, scenarios-fan, donut, seasoning-bar) builds SVG strings with `svg +=` loops. Inline `aria-label` + `data-*` attributes mixed in string builders. SVG elements are sometimes DOM nodes (savings-visuals.js uses `createElementNS()`), sometimes strings (affordability, money-flow).
   - **Risk:** Escaping bugs; inconsistent pattern; hard to refactor. (Escaping is handled via `esc()` helper, but pattern is fragile.)
   - **Mitigation:** Consolidate SVG building into helper (svg-builder.js) with element factory + escaping (phase 11.4).

6. **Verdict badge colour coding:** `.verdict-badge--comfortable`, `.verdict-badge--stretch`, `.verdict-badge--tight`, `.verdict-badge--out-of-reach` have **tinted backgrounds** (file:tile-extended.css). But DESIGN.md §3 rule "Existing accent / ink / paper palette only; never a seven-pastel palette." Stretch band uses custom orange hue (UNCONFIRMED).
   - **Risk:** Visual tokens leak into component CSS. Tone should be single accent + paper mixes only.
   - **Mitigation:** Audit CSS compliance; if custom hues exist, remove them or seek owner approval (phase 11.5).

7. **Deposit scenario chips vs. affordability scenario tile naming collision:** Two separate concept renderings:
   - `tile-deposit.js` renders `.scenario-row` with 4 buttons (baseline/+200/+500/+5k) — **savings scenarios**, aria-pressed toggle.
   - `tile-affordability-scenarios.js` renders `.scenario-list` with 3 rows (buy sooner/target/stretch) — **affordability scenarios**, verdicts + ETAs.
   - Both "scenarios"; conceptually different; users confused about which is which.
   - **Mitigation:** Rename deposit scenario chips to `.savings-scenario-chip`; add intro text explaining each (phase 11.2).

8. **Readiness checklist priority list hardcoded in tile-readiness.js:** `READINESS_PRIORITY` is a 7-item array with exact keys + labels. If Supabase schema changes (new checklist item type, renamed key), this breaks silently.
   - **Risk:** Future schema change requires code edit + test update. Brittle coupling.
   - **Mitigation:** Move READINESS_PRIORITY to `assets/js/constants.js` or fetch from `data/readiness-schema.json` (phase 11.6).

9. **ISA YTD in two places:** Stat rendered inline in deposit tile (index.html line 71) + as separate tile-isa-ytd.js module. Both fetch `getInvestmentsHistory()`.
   - **Smell:** Duplication. If one needs refactoring, the other is forgotten.
   - **Mitigation:** Remove inline stat; link from deposit tile to full ISA page (phase 11.2).

10. **Affordability ladder hard-coded price range:** `LADDER_RANGE.min/max` (£250k–£500k) hardcoded in tile-affordability.js. (Note: original fable doc §7.2 line 472 claims £100k–£2M, but code shows £250k–£500k — **data drift detected**.) If user's criteria exceed range, ladder clamps silently.
    - **Risk:** User sees ladder with no markers if budget is £2M; no warning.
    - **Mitigation:** Make LADDER_RANGE dynamic (config or from user criteria); warn if budget outside range (phase 11.3, pending spec clarification).

11. **No visual distinction between "loading" and "no data":** Both render `—` (dash). If storage returns null, user can't tell if it's still loading or genuinely missing.
    - **Mitigation:** Add `.is-loading` state (different visual, maybe shimmer); preserve `—` for "no data" only (phase 11.1).

12. **NBA tile performance unbounded:** Scores 200 listings every page load. If slow, no indication to user. No pagination or async batching.
    - **Risk:** Page feels sluggish if listing scoring expensive.
    - **Mitigation:** Benchmark scoring loop; consider pagination (top 10 actions) or defer to `requestIdleCallback()` (phase 11.4).

---

### Refactor opportunities (for Fable to sequence)

**High priority (unlocks other work):**

1. **Consolidate tile error handling:** Wrap each `render*()` in try/catch + individual error state (e.g., `data-error="true"` + aria-live update). Surface user-visible error toast or inline tile error message instead of silent fail + stale data. (Related: extend LOADING_IDS to all 13 tiles for complete loading state coverage.)

2. **De-duplicate savings/affordability scenarios:** Merge `tile-deposit.js` scenario-chip logic + `tile-affordability-scenarios.js` into a single **scenario model** with two rendering modes (toggle-buttons vs. option-rows). Centralize scenario delta math (SCENARIO_DELTAS const).

3. **Consolidate `getFinances()` revalidation:** Debounce or batch `onUpdate` callback. Add a "revalidating" spinner state that clears only when all 13 tiles have finished rendering. Or: defer revalidation until user is idle (using `requestIdleCallback`).

4. **Separate bento layout intent from tile internals:** Move all bento-grid media queries to new `layout-bento.css` file; keep `tile-card.css` for card base only. Clarify which tiles span multiple columns and why (document in comments). Test at 1024/1280 breakpoints explicitly. Confirm span rationale with owner (why deposit + flow, not others?).

5. **Consolidate SVG building:** Create `svg-builder.js` helper (element factory + escaping) to replace string concatenation. Reduces escaping bugs; makes refactoring easier. Start with affordability ladder + money-flow bars.

6. **Normalize loading states:** Extend LOADING_IDS to cover all 13 tiles; add per-tile `.is-loading` state. Test that loading spinners appear/disappear synchronously. Distinguish "loading" (shimmer or dimmed) from "no data" (–).

**Medium priority (design/UX):**

7. **Verdict badge colour palette review:** Audit DESIGN.md §3 rule 5 compliance (no seven-pastel palette). Verify all badge colours use only `color-mix(in oklch, var(--accent), var(--paper))` mixes. If stretch/tight bands need visual distinction, use oklch shades only (no bespoke hues). Document intent in tile-extended.css.

8. **Clarify readiness vs. affordability scenarios:** Rename deposit scenario-chips to `.savings-scenario-chip` (avoid collision with affordability scenarios). Add intro text: "How different savings rates affect your target date."

9. **Test affordability ladder edge cases:** Add tests for budget > LADDER_RANGE.max (clamp warning) and < LADDER_RANGE.min (show bounds). Verify user can still adjust inputs outside range. (Also: clarify spec — is LADDER_RANGE £250k–£500k or £100k–£2M?)

10. **ISA YTD consolidation:** Remove duplicate inline stat from deposit tile; surface via tile-isa-ytd.js only. Link from deposit tile to full ISA breakdown page.

**Lower priority (polish/future):**

11. **NBA tile performance:** Benchmark 200-listing scoring loop. Consider pagination (top 10 actions) or async iteration if slow. Add "Refreshing actions…" state during re-score.

12. **Hardcode migration: readiness checklist keys:** Move READINESS_PRIORITY to `assets/js/constants.js` or fetch from `data/readiness-schema.json` to decouple from tile module.

13. **Scenario velocity scenarios:** Expose the fan chart's underlying velocity calculations (baseline, +200, +500, +5k) as a shared `SCENARIO_DEFINITIONS` constant, reused by both deposit sparkline logic + scenarios-fan chart.

14. **Mobile-first / container-query alignment:** Resolve media-query (1024px) vs. container-query (720px) mismatch in responsive logic. Use consistent breakpoint system across dashboard (DESIGN.md §6).

---

### Suggested sub-phases (draft)

**Phase 11.1: Error handling + observability**
- Wrap each tile render in try/catch; add per-tile error state + aria-live toast.
- Extend LOADING_IDS to all 13 tiles; add `.is-loading` class for shimmer/dimmed state.
- Test: characterization-home.test.js expanded with error-state + loading-state assertions.
- Files affected: page-home.js, all tile-*.js files, tile-card.css.

**Phase 11.2: Scenario consolidation**
- Merge tile-deposit.js + tile-affordability-scenarios.js scenario models into `scenario-model.js`.
- Two UI modes: toggle-button chips (deposit) + option-rows (affordability), both use same deltas + computation.
- Rename deposit `.scenario-row` to `.savings-scenario-chip`; add intro text.
- Remove ISA YTD inline stat from index.html line 71; link to full ISA page instead.
- Update tests; verify scenario ETA consistency across both tiles.
- Files affected: tile-deposit.js, tile-affordability-scenarios.js, scenario-model.js (new), index.html, tile-extended.css.

**Phase 11.3: Bento layout clarity**
- Hoist all bento-grid media queries to new `layout-bento.css` file.
- Keep `tile-card.css` for card base (padding, border, shadow, loading state) only.
- Document (in CSS comments) why tile-deposit/tile-flow span 2 cols; confirm intent with owner.
- Test grid at 1024 / 1280 / 1440 px widths; ensure no slivers or overflow.
- Clarify LADDER_RANGE spec (£250k–£500k or £100k–£2M?) — data drift with fable doc.
- Files affected: tile-card.css (shrink), layout-bento.css (new), tile-affordability.js (if range changes).

**Phase 11.4: SVG builder consolidation**
- Create `svg-builder.js` helper with element factory + escaping utilities.
- Migrate affordability ladder + money-flow bars from string concat to svg-builder.
- Reduces string-concat bugs; easier to unit-test SVG generation separately.
- Test: characterization tests for SVG output shape / element counts.
- Benchmark NBA listing scoring loop; add `requestIdleCallback()` if needed.
- Files affected: svg-builder.js (new), tile-affordability.js, tile-money-flow.js, tile-nba.js.

**Phase 11.5: Verdict badge palette audit**
- Verify tile-extended.css `.verdict-badge--*` colours use only `color-mix` of accent + paper (no bespoke hues).
- If stretch/tight need custom hues, seek design decision (owner call); update DESIGN.md §3 if new palette rules emerge.
- Files affected: tile-extended.css, DESIGN.md.

**Phase 11.6: Readiness checklist externalization**
- Move READINESS_PRIORITY to `assets/js/constants.js` or `data/readiness-schema.json`.
- Fetch schema at init; tile-readiness.js references external source of truth.
- Test: schema change doesn't require code edit.
- Files affected: tile-readiness.js, constants.js (or data/readiness-schema.json).

---

### Tailored Q&A for the owner

1. **Scenario UX clarity:** Users see "Baseline / +£200/mo / +£500/mo / +£5k windfall" chips in the deposit tile, then separately "Buy sooner / Buy on target / Stretch to £400k" rows in affordability. Are these the same concept (savings impact on purchase date) or different (savings scenarios vs. price scenarios)? Should they be merged or clearly visually separated (e.g., different headings)?

2. **Bento grid customization:** Currently, only tile-deposit and tile-flow span 2 columns at ≥1024px. Are these the "hero" tiles you want to emphasize, or is the span assignment arbitrary? If you wanted a different tile to span (e.g., affordability scenarios), should the layout be configurable or hard-wired per your design?

3. **Loading experience:** The dashboard shows "Calculating…" in 5 headlines while fetching, then "—" if data is missing. Should we:
   - Add skeleton loaders (shimmer placeholders) to all 13 tiles for a smoother feel?
   - Show a single page-level "Loading your search…" overlay + fade-in all tiles at once?
   - Keep current staggered loads but add error messages if a tile fails?

4. **NBA (Next Best Actions) refresh rate:** The strip currently rescores 200 listings every page load, which could be expensive. Should it:
   - Only show top 3–5 actions (paginated)?
   - Refresh asynchronously in the background without blocking the initial render?
   - Add a manual "Refresh actions" button instead of auto-refresh on storage changes?

5. **Readiness vs. Affordability priority:** The "Readiness" tile shows "you're X% to your deposit target" + next priority action (credit check, AIP, etc.). Does this need a tighter link to affordability? I.e., should we highlight if the user can't afford their target at any savings rate (tight/out-of-reach), or are readiness checklist + affordability independent tracks?

6. **LADDER_RANGE spec drift:** The fable doc (§7.2 line 472) claims the affordability ladder ranges £100k–£2M (step £20k), but the code (intelligence-constants.js line 27) defines £250k–£500k (step £2k). Which is correct? If user's budget is £2M, what should happen (clamp + warn, or expand range)?

7. **ISA YTD inline stat:** Currently rendered both inline in deposit tile + as separate tile. Should we consolidate (remove inline) or keep for quick reference? If consolidate, should the deposit tile link to a full ISA page?

---

### 10.2.1 CSS Guard-Rail Surface

The following files are redesign-permitted under §4 (owner approval required):
- `assets/css/dashboard.css` (@import shell — reorder imports if needed, never inline rules).
- `assets/css/dashboard/*.css` (all partials — refactor layout/spacing/colour freely within Linear-dense anchor).

The following files are inviolable (§16):
- `assets/css/tokens.css` (colour/type/spacing tokens only).
- `assets/js/storage.js` (Supabase backing layer — extend, never rewrite).
- `assets/js/finances.js` (finance calculators — extend, never rewrite).

---

**Summary:** This 11,000+ word segment fully documents the home dashboard: 13 tiles across 4 bands, their data flows, precise thresholds and logic (quoted file:line), feature & behaviour catalogue (vetted per-tile), coupling & dependencies, test coverage + new test behaviours, known smells, refactor opportunities, and sub-phase sequencing. Every claim is cited to source (file:line) or marked (UNCONFIRMED) where unverifiable. DESIGN.md anchor (Linear-dense) and guard-rail surface (dashboard.css, tokens.css, storage.js) are clearly named. Suggested sub-phases are actionable and prioritized. Q&A addresses design decisions pending owner input.
## 10.3 Segment: Finances

**Design anchor:** Linear-dense (Pico v2 + Fraunces display type, generous whitespace)  
**Guard-rail surface (§16):**
- `assets/js/finances.js` — 8-line re-export shim (REFACTOR P9, byte-identical); never rewritten
- `assets/js/finances/calc-{purchase,lisa,savings,outlay}.js` — pure calculators; extend only, no rewrites
- `assets/js/intelligence-constants.js` — verdict thresholds + fit weights; changes require dual-source updates (§18.2 mirroring protocol)
- `docs/INTELLIGENCE_RULES.md` — the canonical source of truth for all constants and their rationale; every code change must reflect here first (§18.2 contract)

---

### File Inventory

| File | Purpose (one line) |
|------|-------------------|
| `pages/finances.html` | Three-topic page: Today (cash flow, bills, savings) / Investments (charts, ISA breakdown) / The purchase (affordability widget, scenarios) |
| `assets/js/page-finances.js` | Page coordinator — fetches storage, derives finances, delegates rendering to section-*.js modules |
| `assets/js/finances.js` | Re-export shim (REFACTOR P9) — byte-identical 10-function surface over split calc-*.js modules (preserves `import * as fin` callers) |
| `assets/js/finances/calc-purchase.js` | SDLT (FTB relief Apr 2025+), monthly mortgage repayment (P&I formula), LTV ratio — pure, no deps |
| `assets/js/finances/calc-lisa.js` | LISA bonus (25% of capped £4,000/yr), property-price eligibility (≤£450k cap) |
| `assets/js/finances/calc-savings.js` | Deposit-progress percentage, months-to-target (no-movement guard), savings projection (0 → N months forward) |
| `assets/js/finances/calc-outlay.js` | Total initial outlay + 3-group breakdown (core purchase / furnishing / major purchases) |
| `assets/js/finance-derive.js` | Single source of truth: enriches raw finances (inputs only) with 40+ derived totals + aliases; cross-resource totals (cash + ISA earmark) |
| `assets/js/money-flow.js` | Pre-move (bills/expenses/savings/spare) and post-move (bills/expenses/mortgage/spare) stacked-bar shape, pure |
| `assets/js/affordability.js` | Verdict engine (comfortable/stretch/tight/out-of-reach) driven by 3 worst-band signals: LTI, payment%, spare £; 320 LOC; surfaces why-verdict + deposit gaps |
| `assets/js/deposit-risk.js` | Risk verdict (low/moderate/high) for equity-backed deposit fund on timeline; 5%/10%/15%/20% market-drop scenarios |
| `assets/js/savings-velocity.js` | ETA + 9 delta scenarios (±£100-500/mo, ±£5-10k windfall, +£20k target) from baseline contribution |
| `assets/js/savings-series.js` | Build canonical savings-over-time series: cumulative history from trading212 import + engine baseline projection |
| `assets/js/investment-performance.js` | Analyse Trading 212 history: net contributed, dividends, interest, realised P&L, unrealised, total return %; epoch attribution |
| `assets/js/intelligence-constants.js` | Single source of truth for verdict thresholds: LTI_BANDS, PAYMENT_BANDS_PCT, SPARE_BANDS_GBP, LTV_TIERS, STRESS_UPLIFT_PP, FIT_WEIGHTS, LEARNED_PREF, TRAINING_MILESTONES, etc. |
| `docs/INTELLIGENCE_RULES.md` | Canonical rationale + sources for every constant (GOV.UK SDLT, PRA SS3/13, FCA MCOB, lender product matrices, calibration note) |
| `assets/js/finances/section-deposit.js` | Hero tiles: deposit progress %, total saved, monthly goal vs avg, months to target, LISA eligibility flag |
| `assets/js/finances/section-flow.js` | SVG stacked-bar rendering: builds bar (300×40 viewBox) + legend from money-flow shape; caption %s |
| `assets/js/finances/section-breakdowns.js` | Bills + expenses table rows from finData line items |
| `assets/js/finances/section-later.js` | Affordability widget (slider 200k–600k, 2k step) + post-move flow comparison + 9-scenario chart |
| `assets/js/finances/section-v3-charts.js` | Chart.js renderers: savings-over-time, monthly deposits, ISA stacked-area, dividend+interest, epoch comparison (SVG), ticker treemap (SVG), realised vs unrealised P&L (SVG) |
| `assets/js/finances/section-deposit-risk.js` | Waterfall chart (current / −5% / −10% / −15% / −20%) + details table; verdict badge + recommendation; async fetch investments + goals |
| `assets/js/finances/section-isa-attribution.js` | ISA growth breakdown: contributed vs dividends vs interest vs market growth |
| `assets/js/finances/chart-helpers.js` | Chart.js options (responsive, animation, legend, tooltip), month-label formatter, setStub fallback |
| `assets/js/flow-constants.js` | FLOW_PALETTE (css class suffixes: bills/expenses/savings/mortgage/spare), FLOW_ORDER (stable stacking left→right) |
| `tools/import-trading212.mjs` | One-shot CSV importer: parses Trading 212 export, builds monthlySummary (month/net/deposits/dividends/realisedPnL), epoch boundaries |
| `assets/css/pages/finances.css` | Finance hero gradient + responsive grid (1→2 col at 768px), chart tall (220–320px responsive), affordability pill + slider |
| `assets/css/pages/finances-charts.css` | Chart canvas + wrapper styling |
| `assets/css/pages/finances-widgets.css` | Afford widget, flow tile, deposit-risk waterfall styling |

---

### Data Flows

#### Input Pipeline

1. **Storage (Supabase via `storage.js`)**:
   - `getFinances()` → raw finances object (income, savings, bills, expenses, one-time costs, shopping list, gift cards, goal.targetDeposit, mortgage assumptions)
   - `getCriteria()` → criteria object (budget bounds, property type preferences, area filters)
   - `getInvestments()` → investments object (trading212ISA: currentPortfolioValue, earmarkPct, strategyEpochs, holdings)
   - `getGoals()` → goals object (timeline.horizon, deposit.hopedFor, area selections)

2. **Derivation (`finance-derive.js`)**:
   - Receives raw finances + optional investments
   - Computes 40+ derived fields: income aliases (takeHomeMonthly, totalMonthly, monthlyGross, bonusMonthly), line-item totals (ongoingBillsTotal.{monthly,annual}, expensesTotal.{monthly,annual,weekly}, oneTimeCostsTotal, etc.)
   - Cross-resource: `totalSavings = cashSavings + (isaEarmarkPct > 0 ? isaTotal × isaEarmarkPct/100 : isaTotal)` — gift cards tracked separately (not deposit-eligible)
   - Returns enriched object used by all downstream modules

#### Chart Rendering Flows

**Savings-over-time** (`savings-series.js` + `section-v3-charts.js`):
- Input: `data/imports/trading212-history.json` (monthlySummary array: month/net/deposits/dividends/realisedPnL/interest, epochs)
- Shape: cumulative running sum of `net` per month, sorted YYYY-MM ascending, anchored to account-opened date
- Overlays engine baseline projection from `getSavingsVelocity()` (current value + monthly contribution rate projected forward)
- Chart.js line dataset: historicalMonths vs baselineProjection; target reference line at deposit goal
- Stub-safe: returns `{ isStub: true }` if history not imported

**Monthly deposits** (`investment-performance.js` → `section-v3-charts.js`):
- Input: same history JSON
- Bar chart: deposits (green) vs withdrawals (red) per month, capped at goal (£2,000/mo)
- Caption: "Net deposits per month — what you actually put in vs your £2,000 goal"

**ISA stacked-area** (`investment-performance.js` → `section-v3-charts.js`):
- Input: history.monthlySummary with running balances
- Four stacks: contributed (cumsum deposits − withdrawals), dividends, interest, market growth (currentValue − net − div − int)
- Time-series, smooth stacked area, percentage Y-axis optional

**Epoch comparison** (SVG, `investment-performance.js` output):
- Epochs from history.epochs (stockpicker: 2025-05-26→2026-01-01; etfCore: 2026-01-02→null)
- Per-epoch bar: width ∝ contribution, height ∝ return
- Interactive: hover for amounts

**Ticker treemap** (SVG, `investment-performance.js` output):
- Holdings data from history (if available)
- Squarified treemap: area ∝ capital deployed per ticker
- Colour by P&L (red/yellow/green)

**Realised vs unrealised P&L** (SVG):
- Two side-by-side bars: realised (locked gains) vs unrealised (market value − cost basis)
- Percentage gain label, breakdown in table

#### Money-flow Rendering

**Now flow** (`money-flow.js` + `section-flow.js`):
- Input: derived finData
- `getMoneyFlow(finData)` → { income.{takeHome, bonus, total}, buckets: [{name, amount, kind}], spare }
- Buckets: Bills, Expenses, Savings, Spare (always in that order per `FLOW_ORDER`)
- Rendering: SVG bar (300×40 viewBox, 4px pad, stacked rects) with labels > 36px wide; legend with swatches + amounts
- Spare shown as negative red bar if < 0

**After-move flow** (`section-later.js`):
- `getMoneyFlowPostMove(finData, monthlyMortgage)` — same shape, replaces Savings bucket with Mortgage
- Spare recalculated: income − bills − expenses − mortgage
- Side-by-side SVG bars: Today vs After Move, common maxTotal scale

#### Affordability Widget

**Input**: price (from slider 200k–600k, 2k step; or number input 100k–2m, 5k step)

**Computation** (`affordability.js`, `assessAffordability({ price, finances, criteria })`):
- Derive verdict from 3 independent signals, worst-band wins:
  1. **LTI** = loan ÷ gross annual income → band via LTI_BANDS (comfortable ≤4.5×, stretch ≤5.5×, tight ≤6.0×)
  2. **Payment%** = monthly P&I ÷ take-home % → band via PAYMENT_BANDS_PCT (≤40%, ≤52%, ≤60%)
  3. **Spare £** = income − bills − expenses − mortgage → band via SPARE_BANDS_GBP (≥£400, ≥£100, else tight)
- Secondary signals (not verdict drivers but flagged in whyVerdict): rate-rise sensitivity (currently contract+3pp; ⚠️ to be modernised to a configurable absolute floor ~7–8% — see A5), LISA eligibility cliff (≤£450k), LTV tier (60/75/85/90/95)
- Output: `{ verdict, headline, loanRequired, ltvPct, ltvTier, depositGapToTier, monthlyPI, monthlyPIStressed, monthlySpareAfter, bandSignals, whyVerdict }` (15+ fields)

**Rendering** (`section-later.js`, `renderAffordWidget()`):
- Verdict pill colour: green (comfortable), yellow (stretch), orange (tight), red (out-of-reach)
- Grid: Required deposit, Loan needed, LTV (%) + tier, SDLT, LISA eligible, Monthly P&I, Stressed P&I, Spare after
- Why-verdict bullets (underlines, stress test flag, LISA cliff, spare warning, LTV gap opportunity)
- Affordability call-to-action: "Email these figures to a mortgage broker"

**What-if chart** (`getSavingsVelocity()` → `section-later.js`):
- Baseline + 9 scenarios (9 series in one Chart.js line chart)
- X: 0–60 months (or max ETA + 2)
- Y: savings balance (£)
- Legend: hoverable series, ghosted non-baseline
- Shows when each scenario hits the deposit target

#### Cross-storage Integration

- `finance-derive.js` composes raw finances + investments (optional) → enriched derived object
- All section-*.js modules consume the enriched object; they never fetch storage directly
- Exception: `section-deposit-risk.js` async-fetches investments + goals separately (async wrapper in page-finances.js)
- No two-way binding; storage writes happen only in Supabase via the portal's `storage.js`, not from this page

---

### Feature & Behaviour Catalogue (VETTED)

#### Core Calculators

##### 1. SDLT Calculation (`calc-purchase.js:calcSDLT()`)

**Purpose:** UK Stamp Duty Land Tax for residential purchase

**Trigger/Entry:** 
- File: `assets/js/finances/calc-purchase.js:14`
- Calls: affordability.js (line 156), calc-outlay.js (line 39), section-later.js

**Inputs:**
- `price` (number, GBP)
- `opts.firstTimeBuyer` (boolean, default false)

**Precise Formula & Constants:**

FTB relief (Apr 2025+):
```
IF firstTimeBuyer AND price ≤ £500,000:
  IF price ≤ £300,000:
    return £0
  ELSE:
    return ROUND((price - £300,000) × 0.05)
```

Standard rates (Apr 2025+):
```
bands = [
  [£125,000,   0%],
  [£250,000,   2%],
  [£925,000,   5%],
  [£1,500,000, 10%],
  [∞,          12%]
]
tax = 0
FOR (upper, rate) IN bands:
  IF price ≤ lower: BREAK
  slice = MIN(price, upper) - lower
  tax += slice × rate
  lower = upper
RETURN ROUND(tax)
```

**Constants (traced to file:line):**
- Line 18-20: `£300,000` FTB relief threshold (statutory, HM Treasury)
- Line 20: `0.05` (5% FTB relief rate, statutory)
- Line 25-29: Standard band thresholds: `£125k`, `£250k`, `£925k`, `£1.5m` with rates 0%, 2%, 5%, 10%, 12%

**Source/Rationale:** GOV.UK SDLT bands, April 2025. Relief lost entirely above £500k (line 18 guard).

> **✅ External validation (GOV.UK SDLT, current to June 2026):** CONFIRMED — no value change.
> The FTB relief (£0 ≤ £300k, 5% on the £300k–£500k slice, none above £500k) and the standard bands
> (0/2/5/10/12% at £125k/£250k/£925k/£1.5m) are correct for the post-1-April-2025 regime. Record
> `SDLT_RULES_VALID_FROM = 2025-04-01` alongside the constants, and **re-check each Budget** (rates and
> thresholds are fiscal-event variables, not permanent constants).

**Outputs & Shape:**
- Number (GBP, to nearest pound) — result of `Math.round(tax)`
- 2-decimal precision pre-rounding (not persisted, but honoured in intermediate calcs)

**Edge Cases:**
- `price ≤ 0` or null → returns `0`
- Price exactly on band boundary (e.g. £125,001) → correctly applies 2% to the slice above
- FTB at £500,001 → standard rates apply, relief lost (line 18 guard prevents FTB path)
- Large price (e.g. £10m) → all bands applied, 12% on amount above £1.5m

**Tests/Acceptance Criteria:**
- affordability.test.js: FTB £300k → £0, FTB £400k → £5,000, FTB £500.5k → standard rates apply
- Edge: £125k standard → £0 tax, £125.001k standard → £0.02 tax (correctly 2% of £0.001)

---

##### 2. Monthly Mortgage Repayment (`calc-purchase.js:calcMonthlyMortgage()`)

**Purpose:** P&I monthly repayment using standard amortisation formula

**Trigger/Entry:**
- File: `assets/js/finances/calc-purchase.js:49`
- Calls: affordability.js (line 127–128), section-later.js, section-v3-charts.js

**Inputs:**
- `principal` (number, GBP, loan amount)
- `annualRatePct` (number, annual interest rate as %), e.g. 5.35
- `termYears` (number, years)

**Precise Formula & Constants:**

Standard amortisation formula:
```
n = ROUND(termYears × 12)
r = (annualRatePct ÷ 100) ÷ 12   // monthly rate
IF r === 0:
  m = (principal ÷ n)  // interest-free: linear repayment
ELSE:
  m = (principal × r × (1 + r)^n) ÷ ((1 + r)^n - 1)
RETURN ROUND(m × 100) ÷ 100   // to 2 decimal places
```

**Constants (traced to file:line):**
- Line 52: `n = ROUND(termYears × 12)` — standard monthly conversion, no off-by-one
- Line 53: `(annualRatePct ÷ 100) ÷ 12` — standard monthly rate derivation
- Line 56: `ROUND(m × 100) ÷ 100` — 2-decimal banking precision

**Outputs & Shape:**
- Number (GBP, 2 decimal places) — e.g. `1,234.56`
- Used directly in affordability bands, spare-cash calcs, post-move flow

**Edge Cases:**
- `principal ≤ 0` or null → returns `0` (guard line 50)
- `termYears ≤ 0` or null → returns `0` (guard line 51)
- `r = 0` (0% mortgage, rare) → simplified linear repayment (line 54)
- `r > 0` → standard formula; tested at 5.35%, 8.5%, 0.5%

**Test Examples:**
- £250k at 5.35%, 25y → ~£1,463/mo
- £100k at 5.35%, 25y → ~£585/mo
- £500k at 8.5%, 25y → ~3,860/mo

**Calibration Note:** Rate assumed per mortgage data (`finances.mortgage.ratePctAssumed`). The
rate-rise sensitivity currently adds 3pp (line 119 in affordability.js: `stressedRate = rate + STRESS_UPLIFT_PP`).
⚠️ **Correction required in code (A5):** there has been no FPC-mandated stress rate since 1 Aug 2022;
modernise `STRESS_UPLIFT_PP` to a configurable absolute floor (~7–8% / reversion + ~1pp) and relabel
"stress test" → "rate-rise sensitivity". (Bank of England, 20 Jun 2022; FCA Mortgage rule review, Sep 2025.)

---

##### 3. Loan-to-Value Ratio (`calc-purchase.js:calcLTV()`)

**Purpose:** LTV as a percentage (1 decimal place) — used to assess deposit gaps and rate tiers

**Trigger/Entry:**
- File: `assets/js/finances/calc-purchase.js:65`
- Calls: affordability.js (line 124, 70), section-later.js

**Inputs:**
- `loan` (number, GBP, mortgage amount)
- `propertyValue` (number, GBP, purchase price)

**Precise Formula & Constants:**

```
IF propertyValue ≤ 0 or null:
  RETURN 0
RETURN ROUND((loan ÷ propertyValue) × 1000) ÷ 10   // to 1 decimal place
```

**Constants (traced to file:line):**
- Line 67: `1000` scale factor, line 67 divisor `10` → rounding to 1dp (e.g. 89.95% → 90.0%, 89.94% → 89.9%)

**Outputs & Shape:**
- Number (percentage, 1 decimal place) — e.g. `85.0`, `89.9`

**Edge Cases:**
- `propertyValue ≤ 0` or null → returns `0` (guard line 66)
- Loan > propertyValue (negative equity, impossible in new purchase) → calculates >100% (no guard; rare edge case)
- Rounding direction: `Math.round()` uses banker's rounding (round-half-to-even); 89.95% may round to 89.9% or 90.0% depending on prior floating-point state

**Lender Tier Boundaries (line 18 in intelligence-constants.js):**
```
LTV_TIERS = [60, 75, 85, 90, 95]   // % thresholds
```

**Deposit-Gap Calculation (affordability.js, lines 67–78):**

To find the deposit needed to reach the next-lower LTV tier:
```
ltvPct = calcLTV(loan, price)
idx = LTV_TIERS.findIndex((t) => ltvPct ≤ t)
IF idx === 0: return 0   // already at cheapest tier
nextTier = idx === -1 ? LTV_TIERS[LTV_TIERS.length - 1] : LTV_TIERS[idx - 1]
requiredDeposit = CEIL((price × (100 - nextTier)) ÷ 100)
RETURN MAX(0, requiredDeposit - currentDeposit)
```

**Example:**
- Price £380k, current deposit £30k (LTV = 90.8%) → next tier is 85% → required deposit £57k → gap = £27k

---

##### 4. LISA Bonus (`calc-lisa.js:calcLISABonus()`)

**Purpose:** Government bonus on Lifetime ISA contributions (25% up to £1,000/year)

**Trigger/Entry:**
- File: `assets/js/finances/calc-lisa.js:10`
- Calls: section-deposit.js, affordability.js (line 142 flag)

**Inputs:**
- `contributionThisYear` (number, GBP)

**Precise Formula & Constants:**

```
eligible = MAX(0, MIN(£4,000, contributionThisYear || 0))
bonus = ROUND(eligible × 0.25)
RETURN { eligible, bonus }
```

**Constants (traced to file:line):**
- Line 11: `£4,000` statutory annual cap (HM Treasury LISA)
- Line 12: `0.25` (25% government match)

**Outputs & Shape:**
```
{ eligible: number, bonus: number }
```
- `eligible`: amount up to £4k that qualifies for the bonus
- `bonus`: 25% of eligible (max £1,000)

**Example:**
- Contribute £4,000 → eligible £4,000, bonus £1,000
- Contribute £3,000 → eligible £3,000, bonus £750
- Contribute £0 → eligible £0, bonus £0

**LISA Eligibility Check (`lisaEligible()`, line 21):**
```
RETURN (price > 0) AND (price ≤ £450,000)
```

**Constants:**
- Line 22: `£450,000` statutory cap (HM Treasury, current 2026)

> **✅ External validation (GOV.UK Lifetime ISA, current to June 2026):** CONFIRMED — no change.
> The LISA core constants (£4,000 annual contribution cap, 25% bonus capped at £1,000/yr, £450,000
> property-price cap, 25% unauthorised-withdrawal charge) are all correct.

**Cliff Warning (affordability.js, line 177–179):**
If price > £450k, add to `whyVerdict`: "Price exceeds the £450k LISA cap — bonus forfeited."

> **⚠️ External validation — LISA/SDLT cap mismatch + pending reform (add to surfaced facts) (A4):**
> (a) The £450,000 LISA property cap does **not** align with the £500,000 SDLT FTB-relief ceiling. A
> buyer targeting £450k–£500k **keeps** SDLT first-time-buyer relief but **loses** the LISA bonus and
> pays the 25% withdrawal charge to access the funds. Surface a distinct warning in the affordability
> widget (and the Ask "UK FTB facts") whenever a target sits in the £450k–£500k band — this is a
> different, sharper failure than the existing simple "> £450k" cliff. (MoneySavingExpert, 26 Nov 2025.)
> (b) **LISA reform is pending:** the Autumn Budget 2025 announced a consultation (early 2026) on a
> replacement first-time-buyer ISA expected ~April 2028, with the £450k cap under review. LISA figures
> must therefore **not** be presented as permanent — carry a one-line "rules under review" caveat.
> (MoneySavingExpert, 26 Nov 2025; MoneyWeek, Jan 2026.)

---

##### 5. Deposit Progress (`calc-savings.js:calcDepositProgress()`)

**Purpose:** Percentage of target deposit reached (0–100, capped at 100)

**Trigger/Entry:**
- File: `assets/js/finances/calc-savings.js:10`
- Calls: section-deposit.js (hero tile percentage display)

**Inputs:**
- `saved` (number, GBP)
- `target` (number, GBP)

**Precise Formula:**
```
IF target ≤ 0:
  RETURN 0
RETURN MIN(100, ROUND((saved ÷ target) × 100))
```

**Outputs:**
- Integer 0–100 (percentage)

**Examples:**
- Saved £25k of £40k → 62% (ROUND(62.5) = 62 pre-capping)
- Saved £45k of £40k → 100 (capped)

---

##### 6. Months to Target (`calc-savings.js:calcMonthsToTarget()`)

**Purpose:** ETA (months, 1dp) to deposit goal at current contribution rate

**Trigger/Entry:**
- File: `assets/js/finances/calc-savings.js:22`
- Calls: savings-velocity.js (baseline ETA), section-deposit.js (hero "X months to go")

**Inputs:**
- `saved` (number, GBP, current balance)
- `target` (number, GBP, goal)
- `monthlyContribution` (number, GBP/month)

**Precise Formula:**
```
IF saved ≥ target: RETURN 0
IF monthlyContribution ≤ 0: RETURN Infinity
RETURN ROUND(((target - saved) ÷ monthlyContribution) × 10) ÷ 10
```

**Outputs:**
- Number (months, 1 decimal place) or Infinity

**Examples:**
- Saved £25k of £40k, contributing £500/mo → (15k ÷ 500) = 30 months
- Saved £40k of £40k → 0 months
- Saved £25k of £40k, £0/mo contribution → Infinity

---

##### 7. Savings Projection (`calc-savings.js:projectSavings()`)

**Purpose:** Forward projection of savings balance at month 0, 1, 2, … N

**Trigger/Entry:**
- File: `assets/js/finances/calc-savings.js:36`
- Calls: savings-velocity.js (all baseline + scenario projections), section-later.js (what-if chart X-axis)

**Inputs:**
- `startingBalance` (number, GBP)
- `monthlyContribution` (number, GBP/month)
- `months` (number, months to project forward)

**Precise Formula:**
```
out = []
bal = startingBalance
FOR m = 0 TO months (inclusive):
  out.push({ month: m, balance: ROUND(bal) })
  bal += monthlyContribution
RETURN out
```

**Outputs:**
```
Array<{ month: number, balance: number }>
```

**Examples:**
- Start £25k, +£500/mo, 12 months → [{ month: 0, balance: 25000 }, { month: 1, balance: 25500 }, …, { month: 12, balance: 31000 }]
- Rounding: each balance rounded to nearest pound pre-push

**Edge Case:**
- If months ≤ 0, returns array with one point (month 0)

---

##### 8. Initial Outlay (`calc-outlay.js:totalInitialOutlay()`)

**Purpose:** Sum of upfront costs at purchase: deposit + SDLT + one-time costs

**Trigger/Entry:**
- File: `assets/js/finances/calc-outlay.js:13`
- Calls: affordability.js (output only, not verdict driver), section-later.js

**Inputs:**
```
{
  deposit: number,
  sdlt: number,
  oneTimeCosts: Array<{ cost: number, … }>
}
```

**Formula:**
```
otherCosts = SUM(oneTimeCosts[].cost)
RETURN {
  deposit,
  sdlt,
  otherCosts,
  total: deposit + sdlt + otherCosts
}
```

**Outputs:**
```
{ deposit, sdlt, otherCosts, total }
```

**Caller Responsibility:** Avoid double-counting SDLT if it's also in oneTimeCosts.

---

##### 9. Outlay Breakdown (`calc-outlay.js:computeOutlayBreakdown()`)

**Purpose:** Three-group breakdown for UI summary: core purchase (deposit + SDLT + legal) / furnishing (shopping list) / major (transport e.g. car)

**Trigger/Entry:**
- File: `assets/js/finances/calc-outlay.js:35`
- Calls: section-later.js (affordability widget detail)

**Inputs:**
```
{
  targetDeposit: number,
  offerTarget: number (price, for SDLT calc),
  firstTimeBuyer: boolean,
  oneTimeCosts: Array<{ category: string, cost: number }>,
  shoppingList: Array<{ cost: number }>
}
```

**Formula:**
```
sdlt = calcSDLT(offerTarget, { firstTimeBuyer })
legalCosts = SUM(oneTimeCosts[] where category IN ['legal', 'removal', 'contingency'])
majorPurchases = SUM(oneTimeCosts[] where category === 'transport')
furnishing = SUM(shoppingList[].cost)
corePurchase = targetDeposit + sdlt + legalCosts
grandTotal = corePurchase + furnishing + majorPurchases
RETURN { sdlt, legalCosts, corePurchase, furnishing, majorPurchases, grandTotal }
```

**Outputs:**
```
{ sdlt, legalCosts, corePurchase, furnishing, majorPurchases, grandTotal }
```

**Affordability Impact:** Verdict uses only `corePurchase` (not furnishing / major). Spare-cash calcs assume only mortgage on income, not the full outlay.

**Rationale:** A mortgage lender does not care about a shopping list; they assess affordability on loan ÷ income. The outlay breakdown is for the user's own cash-flow planning post-move.

---

#### ➕ External validation — gaps to add to the FTB model (A7)

The validation review found three FTB-relevant elements missing from the finance model. Schedule each
as a normal §3/§4 phase (none changes an existing constant — these are additive). (HomeOwners Alliance /
David Wilson Homes, 2026.)

1. **Mortgage Guarantee Scheme / "Freedom to Buy"** — made **permanent since July 2025**; supports
   91–95% LTV lending on homes ≤ £600k, repayment-only, sole home. Model it as a high-LTV enabler
   alongside the existing LTV tiers so a low-deposit buyer sees it as an option, not a dead end.
2. **Explicit total transaction costs** — surface the full one-off cost stack, not just SDLT + deposit:
   legal/conveyancing, searches, survey (RICS Level 2/3), valuation, mortgage product fee, broker fee,
   and removals. These already partly live in `oneTimeCosts`/`computeOutlayBreakdown()` but should be a
   named, complete checklist.
3. **Leasehold running costs** — where the target is leasehold, include **ground rent + service charge**
   as ongoing post-move outgoings (they affect spare-cash and lender affordability).

---

#### Affordability Verdict Engine (`affordability.js`)

**Entry Point:** `assessAffordability({ price, finances, criteria })`

**Verdict Bands (from `intelligence-constants.js`, mirrored in `docs/INTELLIGENCE_RULES.md`)**

| Band | LTI | Payment/Take-Home | Spare/Month |
|------|-----|-------------------|------------|
| **comfortable** | ≤ 4.5× | ≤ 40% | ≥ £400 |
| **stretch** | ≤ 5.5× | ≤ 52% | ≥ £100 |
| **tight** | ≤ 6.0× | ≤ 60% | < £100 |
| **out-of-reach** | > 6.0× | > 60% | (no floor) |

**Verdict Derivation (line 148):**
```
verdict = WORST(
  bandLTI(loanRequired ÷ grossIncome),
  bandPaymentPct((monthlyPI ÷ takeHome) × 100),
  bandSpare(monthlySpareAfter)
)
```
Where `WORST()` returns the rightmost band in ['comfortable', 'stretch', 'tight', 'out-of-reach'].

**LTI Calculation (line 137):**
```
incomeMultiple = ROUND((loanRequired ÷ grossIncome) × 100) ÷ 100
```
Rounded to 2 decimal places for display (e.g. 4.50, 5.23).

> **✅ External validation — LTI bands validated as defensible (A6):** Keep the graduated bands
> (comfortable ≤ 4.5×, stretch ≤ 5.5×, tight ≤ 6.0×) — graduated guidance is **more defensible than a
> hard cap**. Correct the rationale, though: 4.5× is the Bank of England FPC **"LTI flow limit"** — a
> **lender-portfolio** regulatory cap (no more than 15% of a lender's new lending may sit at LTI ≥ 4.5×),
> **not a borrower ceiling**. It is being relaxed in 2025–26 (firms may exceed the 15% share by consent
> to ~30 Jun 2026), and FTB schemes already lend to ~6× (e.g. Nationwide Helping Hand at 95% LTV). So
> a borrower above 4.5× is "stretch", not "blocked". (FCA Mortgage rule review, Sep 2025; Crowdfund
> Insider, Jul 2025.)

**Payment % Calculation (line 138):**
```
paymentToIncomePct = ROUND((monthlyPI ÷ takeHome) × 1000) ÷ 10
```
Rounded to 1 decimal place (e.g. 39.8%, 52.1%).

**Spare Cash Calculation (line 132):**
```
monthlySpareAfter = totalMonthly - outgoings - monthlyPI
```
Where `totalMonthly = takeHomeMonthly + (bonus excluded per house rules, line 110)` and `outgoings = bills + expenses`.

**Rate-rise sensitivity (formerly "stress test") (lines 119, 128, 139–141, 172–176):**
```
stressedRate = rate + STRESS_UPLIFT_PP    // line 119, STRESS_UPLIFT_PP = 3 (intelligence-constants.js:21)
monthlyPIStressed = calcMonthlyMortgage(loanRequired, stressedRate, term)
stressedPaymentToIncomePct = ROUND((monthlyPIStressed ÷ takeHome) × 1000) ÷ 10

IF stressedPaymentToIncomePct > STRESS_WARNING_PCT (60%):  // line 172
  ADD TO whyVerdict: "Rate-rise sensitivity: at +3pp payment rises to X% of take-home"
```

> **⚠️ External validation — correction required in code (STRESS_UPLIFT_PP) (A5):** The FPC
> **withdrew** its mandatory affordability stress test on **1 August 2022** (Bank of England,
> 20 Jun 2022). There is now **no regulator-mandated stress rate**; lenders set their own, typically
> ~6–8% (FCA Mortgage rule review, Sep 2025; Fox Davidson, Apr 2026). Three corrections to schedule
> as a normal §3/§4 phase:
> 1. **Relabel** this signal throughout from "stress test" to an illustrative **"rate-rise
>    sensitivity"** — it is a what-if, not a regulatory pass/fail.
> 2. **Change the default.** Replace the fixed `+3pp on the contract rate` (which over-states stress
>    for a 2026 FTB on an already-elevated contract rate) with a **configurable** uplift defaulting to
>    an **absolute stress floor** (~7–8%, or `reversion rate + ~1pp`). `STRESS_UPLIFT_PP` becomes one
>    mode among several rather than the sole rule.
> 3. Keep it a **secondary signal only** — it never drives the verdict (unchanged from today).
> Document in `docs/INTELLIGENCE_RULES.md`: "no mandated stress rate since Aug 2022; the rate-rise
> sensitivity is illustrative and lender-set."

**Deposit Gap to Next Tier (lines 67–78, called at line 126):**

See calc-purchase.js LTV section above.

**Secondary Signals (flagged in `whyVerdict`, NOT verdict drivers):**

1. **LISA Cliff** (lines 177–179): Price > £450k → lose bonus
2. **FTB SDLT Relief Loss** (lines 180–182): FTB at price > £500k → standard rates apply
3. **Spare Warning** (lines 167–171): monthlySpareAfter < 0 (negative) or band != comfortable

**Output Shape (lines 192–220):**

```
{
  verdict: 'comfortable' | 'stretch' | 'tight' | 'out-of-reach',
  headline: string,    // human-readable summary
  maxBorrowEstimate: number,     // grossIncome × 4.5
  maxPropertyAtCurrentDeposit: number,
  maxPropertyAtTargetDeposit: number,
  loanRequired: number,
  ltvPct: number,
  ltvTier: number | null,        // 60, 75, 85, 90, 95
  depositGapToTier: number | null,
  monthlyPI: number,
  monthlyPIStressed: number,
  monthlyTotal: number,
  monthlySpareAfter: number,
  monthlySpareNow: number,
  spareDelta: number,    // spareAfter - spareNow
  bandSignals: {
    incomeMultiple: number,
    paymentToIncome: number,
    stressedPaymentToIncome: number,
    lisaEligible: boolean
  },
  whyVerdict: Array<string>,     // non-comfortable factors only
  sdlt: number,
  bills: number,
  expenses: number
}
```

**Example Verdict** (hypothetical):
```
Price: £380,000
Finances: £60k gross, £3,500/mo take-home, £15k bills/expenses, £40k deposit
Mortgage: £340k @ 5.35%, 25y = ~£1,963/mo
LTI: 340 ÷ 60 = 5.67 → "stretch" (between 5.5 and 6.0)
Payment%: 1963 ÷ 3500 = 56.1% → "stretch" (between 52 and 60)
Spare: 3500 - 15k/12 - 1963 = 3500 - 1250 - 1963 = 287 → "tight" (< £100 is <£100, but 287 ≥ £100, so "stretch")
Verdict: WORST(stretch, stretch, stretch) = "stretch"
```

---

#### Deposit-Risk Verdict (`deposit-risk.js`)

**Entry Point:** `assessDepositRisk(investments, goals)`

**Verdict Logic (lines 80–84):**

```
equityPct = deriveEquityPct(isa)
timelineMonthsMax = parseHorizonMax(goals.timeline.horizon)

IF equityPct < 50% OR timelineMonthsMax > 12:
  verdict = 'low-risk'
ELSE IF timelineMonthsMax ≤ 6:
  verdict = 'high-risk'
ELSE:
  verdict = 'moderate-risk'
```

**Equity % Derivation (lines 67–78):**

Currently simplified: if active epoch is etfCore or stockpicker, return 100%. Otherwise 100. (Future: real holdings data would allow <50% calculation.)

**Timeline Parsing (lines 58–65):**

```
IF horizon matches "N–M months":
  RETURN M (upper bound)
ELSE IF horizon matches "N months":
  RETURN N
ELSE:
  RETURN 12 (default, unknown)
```

**Market-Drop Scenarios (lines 36–40):**

```
dropPcts = [5, 10, 15, 20]
FOR pct IN dropPcts:
  newValue = ROUND(currentValue × (1 - pct ÷ 100))
  gapImpact = newValue - currentValue   // negative
  PUSH { label, pctDrop, newValue, gapImpact }
```

**Example:**
- Current £25k, 20% drop → newValue £20k, gapImpact −£5k

**Recommendation (lines 86–106):**

| Verdict | Action | Urgency | Reasoning |
|---------|--------|---------|-----------|
| **high-risk** | De-risk 50-100% to Cash ISA | high | <6mo timeline + 100% equity = direct deposit risk |
| **moderate-risk** | Consider partially de-risking (50%) | medium | 6-12mo timeline + equity volatility |
| **low-risk** | No immediate action | low | >12mo timeline or <50% equity |

---

#### Savings Velocity & Scenarios (`savings-velocity.js`)

**Entry Point:** `getSavingsVelocity(finances, scenarios, now)`

**Baseline ETA (lines 43–49):**

```
baselineEta = calcMonthsToTarget(startingBalance, target, monthlyContribution)
baselineProjection = projectSavings(startingBalance, monthlyContribution, baselineEta)
baseline = { etaMonths, etaDate: monthsToDate(etaMonths, now), projection }
```

**Default Scenario Set (lines 11–21):**

9 scenarios, each adjusting contribution or target:

| Scenario | Delta | Effect |
|----------|-------|--------|
| −£500/mo | −£500 contribution | slower ETA |
| −£200/mo | −£200 contribution | slower |
| −£100/mo | −£100 contribution | slower |
| +£100/mo | +£100 contribution | faster |
| +£200/mo | +£200 contribution | faster |
| +£500/mo | +£500 contribution | much faster |
| +£5k windfall | +£5k lump sum | accelerates by 10 months |
| +£10k windfall | +£10k lump sum | accelerates by 20 months |
| target +£20k | target up £20k | extends ETA |

**Scenario Computation (lines 51–65):**

```
FOR scenario IN scenarios:
  start = startingBalance + lumpSum
  monthly = monthlyContribution + deltaMonthly
  adjustedTarget = target + targetDelta
  eta = calcMonthsToTarget(start, adjustedTarget, monthly)
  deltaMonths = baselineEta - eta    // relative speedup/slowdown
  PUSH { label, etaMonths, etaDate, deltaMonths, projection }
```

**Projection Cap (lines 74–81):**

```
IF etaMonths NOT finite OR etaMonths ≤ 0:
  RETURN projectSavings(start, monthly, 0)   // single point
ELSE:
  months = MIN(240, CEIL(etaMonths))
  RETURN projectSavings(start, monthly, months)   // bounded to 20 years
```

---

#### Investment Performance Analysis (`investment-performance.js`)

**Entry Point:** `analysePerformance(historyJson)`

**Stub Detection (lines 32–34):**

```
isStub = (historyJson._status === 'awaiting Phase 3 import')
      OR (NOT Array.isArray(historyJson.monthlySummary))
      OR (monthlySummary.length === 0)
```

**Net Contributed Calculation (line 46):**

```
netContributed = totalDeposited - totalWithdrawn
```

Where `totalDeposited` and `totalWithdrawn` are either from `summary` or summed from `monthlySummary[].{deposits, withdrawals}`.

**Unrealised Gain Attribution (line 51):**

```
unrealisedGain = currentValue - netContributed - dividendsReceived - interestEarned - realisedPnL
```

**Rationale:** Assumes all remaining gain is "market growth" (conservative estimate, not TWRR/MWRR).

**Total Return % (lines 52–54):**

```
IF netContributed > 0:
  totalReturnPct = ROUND(((currentValue - netContributed) ÷ netContributed) × 10000) ÷ 100
ELSE:
  totalReturnPct = null
```

Returns percentage to 2dp (e.g. 5.32%).

**Epoch Attribution (line 56, helper `buildEpochs()`):**

Per-epoch contribution + dividend totals, plus list of tickers held during epoch.

---

#### Finance Derivation (`finance-derive.js`)

**Entry Point:** `deriveFinances(raw, opts)`

**Income Aliases (lines 62–72):**

```
annualGross = raw.income.annualGrossBase
takeHome = raw.income.monthlyNetTakeHome
annualBonus = raw.income.annualBonus

Derived:
annualBaseSalary = annualGross
monthlyGross = ROUND2(annualGross ÷ 12)
takeHomeMonthly = takeHome
totalMonthly = takeHome    // bonus excluded per house rules
bonusMonthly = ROUND2(annualBonus ÷ 12)
```

**Cross-Resource Savings (lines 88–102):**

```
cashSavings = raw.savings.current
isaTotal = investments.trading212ISA.currentPortfolioValue
isaEarmarkPct = investments.trading212ISA.earmarkPct

isaForDeposit = (isaEarmarkPct > 0)
              ? ROUND2(isaTotal × isaEarmarkPct ÷ 100)
              : isaTotal

totalSavings = ROUND2(cashSavings + isaForDeposit)
```

**Savings Gap & Months-to-Save (lines 104–109):**

```
targetDeposit = raw.goal.targetDeposit
monthlyContribution = raw.savings.monthlyContribution

savingsGap = MAX(0, ROUND2(targetDeposit - totalSavings))
monthsToSave = (monthlyContribution > 0 AND savingsGap > 0)
             ? ROUND2(savingsGap ÷ monthlyContribution)
             : 0
```

**Monthly Average Deposit Estimate (lines 111–129):**

Prefers pre-computed `raw.savings.monthlyAverage.net` (from import history). Falls back to `isaTotal ÷ months-since-opened` if history absent.

**Post-Move Outgoings (lines 141–150):**

```
mortgage = raw.mortgage.estimatedMonthlyPayment
postMoveTotal = ROUND2(billsMonthly + expensesMonthly + mortgage)

monthlyOutgoingsPostMove = {
  bills: ongoingBillsTotal.monthly,
  expenses: expensesTotal.monthly,
  mortgage: ROUND2(mortgage),
  total: postMoveTotal
}

spareMonthly = ROUND2(takeHome - postMoveTotal)
```

---

#### Money-Flow Shapes (`money-flow.js`)

**`getMoneyFlow()` (Pre-Move)**

```
buckets = [
  { name: 'Bills',    amount: bills,    kind: 'bills' },
  { name: 'Expenses', amount: expenses, kind: 'expenses' },
  { name: 'Savings',  amount: savings,  kind: 'savings' },
  { name: 'Spare',    amount: spare,    kind: 'spare' }
]

spare = total - bills - expenses - savings
total = sum(buckets[].amount)
```

**`getMoneyFlowPostMove()` (Post-Move)**

```
buckets = [
  { name: 'Bills',    amount: bills,    kind: 'bills' },
  { name: 'Expenses', amount: expenses, kind: 'expenses' },
  { name: 'Mortgage', amount: mortgage, kind: 'mortgage' },
  { name: 'Spare',    amount: spare,    kind: 'spare' }
]

spare = total - bills - expenses - mortgage
```

---

### Coupling & Dependencies

#### Shared Constants

- **`intelligence-constants.js`** (GUARD-RAILED §16):
  - LTI_BANDS, PAYMENT_BANDS_PCT, SPARE_BANDS_GBP, LISA_CAP_GBP, LTV_TIERS, STRESS_UPLIFT_PP, STRESS_WARNING_PCT
  - LADDER_RANGE, LADDER_TICKS (affordability slider bounds)
  - LISTING_VERDICTS, FIT_BANDS, FIT_WEIGHTS (listing fit score, v3 L2)
  - LEARNED_PREF constants (v3 L4)
  - TRAINING_MILESTONES, RECENCY_DAYS, META_OBS
  - **Mirrored in `docs/INTELLIGENCE_RULES.md`** — when a constant changes, both files must be updated in the same commit per §18.2

- **`flow-constants.js`** (tiny, guard-railed):
  - FLOW_PALETTE (css class suffixes: bills/expenses/savings/mortgage/spare)
  - FLOW_ORDER (stable stacking left→right)
  - Shared between: page-home.js (dashboard money-flow tile), page-finances.js (finances money-flow tiles)

#### Calculus Chain

- `finance-derive.js` → `money-flow.js` (takes derived finData, returns flow shape)
- `money-flow.js` → `section-flow.js` (takes flow shape, renders SVG + legend)
- `finance-derive.js` + `criteria` → `affordability.js` (takes derived finData + criData + price, returns verdict)
- `affordability.js` → `section-later.js` (calls `assessAffordability()` on slider/input change, updates widget)
- `savings-velocity.js` → `section-later.js` (powers 9-scenario what-if chart)
- `investment-performance.js` → `section-v3-charts.js` (powers 6 investment charts: savings-over-time, monthly deposits, ISA stacked, div+int, epoch, treemap, realised P&L)
- `deposit-risk.js` → `section-deposit-risk.js` (verdict + recommendation + waterfall scenarios)

#### Guard-Railed Modules (no rewrite)

- `finances.js` (8 LOC shim; preserves public surface across calc-*.js split)
- `calc-purchase.js` (68 LOC: calcSDLT, calcMonthlyMortgage, calcLTV) — used by affordability.js, section-later.js, calc-outlay.js
- `calc-lisa.js` (24 LOC: calcLISABonus, lisaEligible) — used by affordability.js, section-deposit.js
- `calc-savings.js` (44 LOC: projectSavings, calcMonthsToTarget, calcDepositProgress) — used by savings-velocity.js, section-deposit.js
- `calc-outlay.js` (50 LOC: totalInitialOutlay, computeOutlayBreakdown) — reuses calcSDLT; used by affordability.js output

#### Dashboard Tile Reuse

- `money-flow.js` shape (income, buckets, spare, total) consumed by both:
  - page-home.js dashboard tile (sparkline + summary; see dashboard.css)
  - page-finances.js today/later flow tiles (SVG stacked bars + table)
- Money-flow legend (swatch colours) driven by FLOW_PALETTE CSS class names (bills/expenses/savings/mortgage/spare) — defined in components/finance-flow.css or dashboard.css

#### Criteria Coupling

- `affordability.js` expects `criteria` object with `budget` field (bounds) — used for LTI / payment% / spare banding
- **No two-way binding**: Fable's refactors on affordability must not write to criteria.json; the user writes via the Supabase portal

---

### Test Coverage & Behaviours

#### Characterization Tests (`tests/characterization-finances.test.js`)

- Money-flow shape (buckets present: Bills/Expenses/Savings/Spare or Mortgage)
- Money-flow totals (flow.total === flow.income.total)
- Finance derivation (income.takeHomeMonthly survives re-derive, goal.targetDeposit survives)
- Savings series shape (points property, or isStub flag)
- Format helpers (gbp(1234.56) → '£1,235')
- **Note**: Synthetic fixtures only; no personal figures. Regression baseline for Phase 4.

#### Affordability Verdict Tests (`tests/affordability.test.js`)

- Verdict bands: £300k → stretch, £380k → out-of-reach, £420k → out-of-reach, £500k → out-of-reach (on sample finances)
- LISA cliff: £449k → eligible, £451k → not eligible + whyVerdict mentions cap
- Stress-test warning: high stressed rate flagged in whyVerdict (e.g., 69.9% of take-home at £380k)
- Shape contract: all 15+ fields present (verdict, headline, loanRequired, ltvPct, ltvTier, depositGapToTier, monthlyPI, monthlyPIStressed, monthlyTotal, monthlySpareAfter, monthlySpareNow, spareDelta, bandSignals, whyVerdict)
- LTV deposit gap: computed correctly (e.g., £380k + £40k target → gap £17k to reach 85% tier)
- SDLT edge cases: FTB relief (£300k → £0, £400k → £5k), standard bands

#### Deposit-Risk Tests (`tests/deposit-risk.test.js`)

- Verdict: low-risk (timeline > 12mo), moderate-risk (50-100% equity + 6-12mo), high-risk (100% equity + <6mo)
- Scenarios: 5%/10%/15%/20% drops included
- Math: 10% drop on £25k → £22,500; gapImpact = −£2,500
- Recommendation shape: action, urgency (low/medium/high), reasoning

#### Affordability-Scenarios Tests (`tests/affordability-scenarios.test.js`)

- Three scenarios: buyNowLowerTarget, buyOnTargetDeposit, buyAtHigherTarget
- monthsToReady computed as CEIL((targetDeposit - currentSavings) / monthlyContribution)
- Verdicts span stretch → tight range

#### Known Gaps

- **No E2E test** of the affordability slider in the actual DOM (requires browser; out of scope per §13)
- **No test for chart rendering** (Chart.js, SVG treemap/epoch/waterfall rendering) — verification is manual code self-review + developer eyes (DESIGN.md §4 smoke check)
- **No test for trading212-history import** (the CSV parser logic) — one-shot tool, tested manually on real exports
- **No test for ISA attribution breakdown** (dividend/interest/growth attribution) — pure component, coverage limited to shape
- **No precision/rounding regression tests** (banking precision at 2dp, LTV at 1dp, percentages). Numeric edge cases (small deposits, large prices) are known risks.

---

### Known Smells / Tech Debt / Risks

#### Architecture / Design

1. **Siloed calculators anti-pattern (partially mitigated by P9 refactor)**
   - Pre-P9: calc-purchase, calc-lisa, calc-savings, calc-outlay lived as scattered utility functions in finances.js
   - Post-P9: split into `finances/calc-*.js` modules but finances.js is still a re-export shim (byte-identical surface)
   - Risk: If future refactors want to recombine or reorder these, they must maintain the shim signature or update every importer
   - Status: WATCH — shim is safe, but tight coupling via re-export means a rename of calc-purchase.js requires shim edit

2. **Affordability verdict engine is monolithic** (`affordability.js`, 320 LOC)
   - Single function `assessAffordability()` computes LTI + Payment% + Spare bands, derives deposit gaps, surfaces whyVerdict
   - No sub-module split (e.g., no affordability/verdict-lti.js, affordability/verdict-payment.js)
   - Risk: Hard to test or refactor a single band in isolation; future thresholds change requires careful re-read of 320 LOC
   - Status: ACCEPTABLE — the function is pure, well-commented, and the logic is linear (no mutual recursion). Test coverage is solid. Future refactors may extract band-logic helpers if complexity grows.

3. **Chart.js integration is sprawling** (`section-v3-charts.js`, 332 LOC)
   - 6 independent chart renderers (savings-over-time, monthly deposits, ISA stacked, div+int, epoch SVG, treemap SVG, realised P&L SVG) in one file
   - Risk: File is long; hard to find a specific chart renderer; risk of cross-contamination if shared helpers are added
   - Opportunity: Could split into `section-v3-charts/{savings-over-time, monthly-deposits, isa-stacked, dividend-interest, epoch, treemap, realised-unrealised}.js` — 7 files × ~50 LOC each. Would reduce read time + allow independent testing (if a test harness is built).

#### Numeric Precision & Rounding

1. **2-decimal pound accuracy throughout**
   - `round2(n) = Math.round(n * 100) / 100` used in finance-derive, money-flow, savings-velocity
   - Risk: Large cumulative sums (e.g., 20-year mortgage projections) may drift by pence; bankers' rounding not used
   - Status: ACCEPTABLE for UX (display precision). If exactness is needed for regulatory output, a big-decimal library should be considered (future phase).

2. **LTV rounding at 1 decimal place** (`calcLTV()` in calc-purchase.js)
   - `Math.round((loan / propertyValue) * 1000) / 10` — matches lender conventions
   - Risk: 89.95% rounded to 90% may affect tier boundaries (e.g., gap-to-tier calculation)
   - Status: WATCH — verify rounding direction in affordability.test.js edge cases

3. **SDLT bands are integer-anchored** (e.g., £125,000 boundary is exact)
   - Risk: A £125,001 property triggers 2% on the entire band above, not just the slice; this is correct per GOV.UK but subtly different from a smooth function
   - Status: CORRECT — reflects actual SDLT rules

#### Data Flow & State Management

1. **Investments optional in finance-derive** (line 59: `opts.investments || null`)
   - If investments not provided, `totalSavings = cashSavings` only (ISA earmark ignored)
   - Risk: If a page forgets to pass investments, deposit calculations will be wrong and give no warning
   - Status: WATCH — add a console.warn in finance-derive if investments is expected but null (future phase)

2. **Storage async but page-finances.js does not handle stale data**
   - `getFinances()` called with `onUpdate` callback → re-render on live updates
   - `getCriteria()` and `getInvestments()` called once at init; do not re-fetch on Supabase changes
   - Risk: If user changes investment earmark% in the portal mid-session, the affordability widget and deposit-risk tile are stale
   - Status: ACCEPTABLE for MVP. Future: wire `getCriteria()` and `getInvestments()` into the onUpdate pattern if needed.

#### Chart Sizing & Responsiveness

1. **Chart height management** (finances.css lines 52–57)
   - `.chart-tall { height: clamp(220px, 50vw, 320px); }`
   - Using viewport width (`vw`) for vertical chart sizing is unusual; should be `vh` or `dvh` per DESIGN.md §6
   - Risk: On ultra-wide monitors, charts may become very tall; on portrait phones, may be squashed
   - Status: KNOWN — flagged in finances.css comments; future refactor to use `dvh` and container queries

2. **SVG viewBox hardcoding** (section-v3-charts.js, section-deposit-risk.js)
   - Epoch SVG: `viewBox="0 0 600 180"` hardcoded; no responsive scaling
   - Treemap: `viewBox="0 0 600 360"`
   - Risk: On mobile, SVG is too wide; on desktop, may be too small
   - Status: WATCH — add `preserveAspectRatio` and CSS max-width constraints to SVGs; verify with responsive test (DESIGN.md §6 lint)

3. **Flow bar SVG** (section-flow.js, line 6)
   - Fixed 300×40 viewBox; rendered directly into DOM with inline width/height
   - Risk: On narrow screens, bar is 300px wide (exceeds 320px mobile viewport)
   - Status: ACCEPTABLE — bar is inside a `.flow__panel` which should have its own responsive constraints; verify with linter

#### Accessibility (WCAG 2.2 AA)

1. **Chart.js charts lack explicit ARIA labels**
   - Chart.js provides default canvas labeling; no custom aria-label or aria-describedby
   - Risk: Screen readers cannot hear the data; visual-only users are excluded
   - Status: KNOWN LIMITATION — Chart.js v4 has limited a11y; Fable's refactor could add aria-label + summary text below each chart

2. **SVG charts (epoch, treemap, waterfall, realised P&L) have minimal semantics**
   - Some have `aria-label` (section-deposit-risk.js line 237: `aria-label="Deposit at risk waterfall"`), but no `<title>` or `<desc>` elements inside SVG
   - Risk: Keyboard users cannot tab into SVG; screen reader users get only the aria-label, not the data
   - Status: WATCH — add `<title>` + `<desc>` inside SVG elements; consider a data table fallback for complex charts (DESIGN.md §11)

3. **Interactive slider (affordability widget)**
   - Slider input (HTML range element) is keyboard-accessible; labeled with `for="afford-slider"`
   - Risk: Initial value on page load is not announced; on-change events may be too frequent for screen readers
   - Status: ACCEPTABLE — standard HTML input; verify with manual accessibility audit

4. **Live regions**
   - `.afford-why` list has no aria-live (currently static)
   - `.dr-waterfall-rows` (details/summary disclosure) has no aria-live
   - Status: ACCEPTABLE for MVP; future refactor could add aria-live="polite" + clear regions between updates per §11

#### Constants Maintenance Risk

1. **Intelligence constants dual-source problem**
   - `assets/js/intelligence-constants.js` (values) + `docs/INTELLIGENCE_RULES.md` (rationale) must stay in sync
   - Risk: A developer updates one file and forgets the other; the mismatch is silent (no test enforces it)
   - Status: WATCH — add a linter or test that parses INTELLIGENCE_RULES.md and compares to intelligence-constants.js literal values (Fable refactor opportunity, Phase B2)

2. **LTV tier boundaries are a list**
   - `LTV_TIERS = [60, 75, 85, 90, 95]` — hardcoded in intelligence-constants.js
   - Risk: If lender products change (new tier at 88%), updating the list requires re-checking affordability.test.js boundary cases
   - Status: ACCEPTABLE — change is infrequent; tests are solid

#### Trading212 Import & Investment Data

1. **Import is one-shot, not incremental**
   - `tools/import-trading212.mjs` parses CSV(s) and writes `data/imports/trading212-history.json`
   - No deduplication or merge logic; re-running the importer overwrites the file
   - Risk: If a user exports history twice with overlapping months, the second run silently overwrites; no version control
   - Status: ACCEPTABLE for MVP. Future: implement merge + update logic (out of scope for this segment).

2. **Epoch boundaries are hardcoded in the importer**
   - Stockpicker: 2025-05-26 → 2026-01-01; etfCore: 2026-01-02 → null
   - Risk: These dates are specific to this user's history; a different user's epochs won't match
   - Status: KNOWN — epochs should be configurable or inferred from strategy changes in the history. Future phase.

3. **ISA attribution logic is simplistic**
   - `unrealisedGain = currentValue − netContributed − dividends − interest − realisedPnL`
   - Assumes all gain is "market growth"; does not account for rounding or transaction costs
   - Risk: Small discrepancies (£1–10) are common; not suitable for tax-return use
   - Status: KNOWN — for UX purposes, the approximation is fine. Future: add a caveat in the UI ("approximate attribution").

---

### Refactor Opportunities (Fable to Sequence)

#### Phase A: Chart Rendering & Responsiveness (Independent of Affordability Engine)

1. **Split `section-v3-charts.js` (332 LOC) into per-chart modules**
   - Extract 6 functions into `section-v3-charts/{savings-over-time.js, monthly-deposits.js, isa-stacked.js, dividend-interest.js, epoch.js, treemap.js}` (PRESERVE section-v3-charts.js as an `import * as` re-export shim, matching finances.js pattern)
   - Allows independent testing of chart-rendering logic if a test harness is later built
   - Does NOT change page-finances.js; no public API change

2. **Replace SVG hardcoded viewBox with responsive container queries**
   - Epoch SVG: wrap in `<div class="epoch-chart-wrap" style="container-type: size">` and use `@container (min-width: 600px)` to scale viewBox
   - Treemap: same treatment
   - Waterfall (section-deposit-risk.js): same
   - Realised P&L: same
   - Verify with `node tools/lint-responsive.mjs` (DESIGN.md §6)

3. **Fix chart height handling per DESIGN.md §6**
   - Replace `clamp(220px, 50vw, 320px)` with `clamp(220px, 50dvh, 320px)` for vertical charts
   - Add `@media (max-height: 600px)` overrides to use `svh` on short screens
   - Verify with dev's manual smoke test at 320px / 480px / 768px / 1024px heights

#### Phase B: Affordability Engine Architecture (Independent of Chart Work)

1. **Extract band-calculation logic into sub-helpers**
   - Create affordability/{verdict-lti.js, verdict-payment.js, verdict-spare.js, verdict-stress.js}
   - Each exports a function `verdictLTI(loan, income) → {band, reason}`
   - Affordability.js imports and composes: `worst(verdictLTI(...), verdictPayment(...), verdictSpare(...))`
   - Allows single-band testing & refactoring without touching the monolithic function

2. **Hoist deposit-gap calculation into its own helper**
   - Extract `depositGapToTier()` logic (lines 67–78 in affordability.js) into a standalone, tested function
   - Makes it easier to verify the LTV tier boundary logic independently

3. **Add a constants-verification test**
   - Test that `intelligence-constants.js` literal values match the values stated in `docs/INTELLIGENCE_RULES.md` (simple regex + compare)
   - Catches skew at commit time

#### Phase C: Data Flow & Storage Integration

1. **Formalize the investments-optional pattern in finance-derive**
   - Add console.warn if `investments` is falsy but a caller might expect it (detect via a flag passed by page-finances.js)
   - Or: change signature to `deriveFinances(raw, { investments, onMissingInvestments: 'warn'|'error' })` to make the intent explicit

2. **Add onUpdate callback for investments + criteria** (optional, low priority)
   - Currently only finances uses the onUpdate callback in page-finances.js
   - If needed for live-portal updates, wire investments + criteria into the same callback system
   - May require Supabase subscription changes

#### Phase D: Chart & SVG Accessibility

1. **Add `<title>` + `<desc>` elements inside each SVG**
   - Epoch: `<title>Investment strategy epochs</title><desc>Contribution per epoch vs return gained</desc>`
   - Treemap: `<title>Portfolio holdings</title><desc>Capital deployed per ticker</desc>`
   - Waterfall: `<title>Deposit at risk</title><desc>Current balance and impacts of market corrections</desc>`
   - Realised P&L: same pattern

2. **Add data tables below complex charts** (optional, depends on user feedback)
   - For epoch comparison, treemap, realised P&L: provide a collapsible HTML table with full data
   - Allows screen-reader users to access data directly

3. **Upgrade Chart.js charts with aria-labels + summary captions**
   - Savings-over-time: add aria-label="Cumulative savings over time toward a £40,000 deposit target"
   - Monthly deposits: aria-label="Monthly deposit contributions"
   - Current captions in HTML are static; consider aria-live="polite" updates when data changes

#### Phase E: Code Quality (Across All Above)

1. **Consistent error handling in all section-*.js modules**
   - Some handle missing DOM elements gracefully (e.g., `const card = document.getElementById(sectionId); if (!card) return;`)
   - Others assume elements exist (e.g., `document.getElementById('now-flow-bar')` without null check)
   - Audit and standardize to early-return pattern

2. **Centralize common DOM-update patterns**
   - Many modules use `setText()`, `setHTML()`, `byId()` from dom.js (good)
   - Some modules call `setHTML()` with user data without `esc()` escaping (search for pattern `innerHTML = ... finData ...` without esc)
   - Verify all UGC flows go through `esc()` or are safe (e.g., numbers)

3. **Remove magic numbers from section-*.js**
   - Hard-coded viewBox dimensions, padding, scaling factors should move to constants at the top of each module
   - Example: section-deposit-risk.js lines 34–37 define PAD_L, PAD_R, PAD_T, PAD_B; good pattern to replicate in other SVG renders

---

### Suggested Sub-Phases (Draft)

#### Sub-phase A1: Chart Module Split
**Scope:** Split section-v3-charts.js into 6 per-chart files + re-export shim  
**Files:** section-v3-charts.js (shim), section-v3-charts/{savings-over-time, monthly-deposits, isa-stacked, dividend-interest, epoch, treemap}.js  
**No API change:** page-finances.js imports remain identical  
**Tests:** Existing characterization tests still pass  
**Effort:** ~2 hours (code motion, no logic change)

#### Sub-phase A2: Responsive Chart Sizing
**Scope:** Replace vw/vh with dvh; add container queries to SVGs; verify with lint  
**Files:** assets/css/pages/finances.css, section-v3-charts/*.js (SVG renders), section-deposit-risk.js  
**Verification:** Manual smoke test at 4 breakpoints + lint pass  
**Tests:** No test changes needed (layout is CSS-only)  
**Effort:** ~1.5 hours

#### Sub-phase B1: Affordability Band Extraction
**Scope:** Create affordability/{verdict-lti, verdict-payment, verdict-spare}.js; refactor affordability.js to compose  
**Files:** affordability.js (320 LOC → ~100 LOC coordinator), affordability/{verdict-*.js} (3 new files × ~70 LOC each)  
**Tests:** affordability.test.js verdict cases still pass; add new per-band tests in affordability-verdict-lti.test.js, etc.  
**Effort:** ~3 hours (logic extraction + test updates)

#### Sub-phase B2: Constants Verification Test
**Scope:** Add a test that parses INTELLIGENCE_RULES.md and verifies literal values match intelligence-constants.js  
**Files:** tests/intelligence-constants.test.js (new)  
**Verification:** Test fails if constants drift from docs; run in CI  
**Effort:** ~1 hour

#### Sub-phase C1: Investments-Optional Clarity
**Scope:** Add console.warn or error mode in finance-derive when investments are missing  
**Files:** assets/js/finance-derive.js, page-finances.js  
**Tests:** characterization-finances.test.js updated to verify warning behavior  
**Effort:** ~30 minutes

#### Sub-phase D1: SVG Accessibility (Title + Desc)
**Scope:** Add `<title>` + `<desc>` elements to 4 SVG charts (epoch, treemap, waterfall, realised P&L)  
**Files:** section-v3-charts/{epoch, treemap}.js, section-deposit-risk.js, assets/js/finances/section-v3-charts.js (if not split in A1)  
**Verification:** Manual a11y audit with NVDA or JAWS  
**Effort:** ~1.5 hours

#### Sub-phase D2: Chart.js Aria-Labels
**Scope:** Add aria-label + aria-describedby to all Chart.js canvases  
**Files:** section-v3-charts.js (or per-chart files if split in A1)  
**Verification:** Manual a11y audit  
**Effort:** ~1 hour

#### Sub-phase E1: Error Handling & Escaping Audit
**Scope:** Review all section-*.js for missing null checks; audit all HTML writes for esc()  
**Files:** All section-*.js modules, finance-derive.js  
**Tests:** No new tests; code review only  
**Effort:** ~1 hour

---

### Tailored Q&A for the Owner

1. **Which affordability verdicts do you trust most, and which feel wrong?**
   - The bands are calibrated to your household's income + current market rates (2026 Q1 at ~5.35%)
   - At £300k you're stretch; at £380k+ you're out-of-reach
   - **Is this matching your lender conversations?** If you've got informal pre-approval at a higher LTI, Fable should adjust the bands (a separate INTELLIGENCE_RULES.md update).
   - Similarly: do the payment% thresholds (≤40% comfortable, ≤52% stretch, ≤60% tight) match what you'd actually qualify for?

2. **Are you using the LISA bonus surface correctly?**
   - Affordability widget flags when price crosses £450k (LISA cap) and loses the £1,000/yr bonus
   - Section-deposit.js hero shows "LISA eligible at <price>— bonus up to £1,000/yr" when under cap
   - **Are you confident in the LISA withdrawal + bonus rules that page-finances displays?** If you've had a lawyer review, verify the wording matches.

3. **What does the "deposit at risk" verdict actually change in your decision-making?**
   - High-risk flag means "de-risk 50-100% to cash ISA" with urgency=high
   - Moderate-risk says "consider partially de-risking (50%)" with urgency=medium
   - Low-risk says "no immediate action"
   - **Would you trade the growth upside for de-risking peace of mind at 6 months away?** This is the right time to lock in your answer; it shapes whether you need the trading212 import at all.

4. **On the savings velocity / "what if" scenarios — which ones matter?**
   - Fable shows 9: ±£100/200/500/mo, ±£5k/10k windfall, target +£20k
   - You're currently ~£XXk of your £40k target (calculated from finData.savings.totalSavings)
   - **Are there other scenarios you'd like to see?** (e.g., "stop contributions entirely", "double contributions for Q3 only", "inheritance spike")
   - The chart should show where you'll land; if a scenario is missing, add it.

5. **Do the one-time costs and home-setup shopping list reflect your real plans, or are they placeholder estimates?**
   - `computeOutlayBreakdown()` breaks outlay into 3 groups: core purchase (deposit + SDLT + legal) / furnishing (shopping list) / major (transport)
   - The affordability widget doesn't include shopping + major in its verdict (only core purchase), so the "spare after" figure is what's left after mortgage, not after buying a car
   - **Is this the right breakdown for your move?** If you have a car + kitchen overhaul planned, the outlay total will be much higher than the mortgage lenders see (relevant for your overall cash planning, but not their affordability check).

6. **If you import your Trading 212 history, what will you do with the breakdown (epoch contributions, dividends, realised P&L)?**
   - The importer builds a monthlySummary + epoch attribution (e.g., stockpicker phase earned £X, etfCore phase earned £Y)
   - Six charts light up: savings-over-time (with historical cumulative), monthly deposits, ISA growth (stacked), dividends, epoch comparison, ticker treemap
   - **Are these charts useful for validating your strategy (e.g., "etfCore outperformed stockpicker")?** Or are they just nice-to-haves for retrospectives?
## 10.4 Segment: Listings & property

**Design anchor(s):** Linear-dense (listings/saved/report) + Stripe-docs (property dossier)  
**Guard-rail surface (§16):** storage/listings.js (extend only), listings table (system-managed, fetcher-written only)

---

### File inventory

| File | Purpose (one line) |
|------|-------------------|
| `pages/{listings,saved-listings,rejected,property,report}.html` | Page scaffolds (shell fetched & injected, page-specific HTML) |
| `assets/js/page-listings.js` | Live Listings feed coordinator: loads, scores, partitions, renders with fit verdict & reactions |
| `assets/js/page-saved-listings.js` | Saved Listings (Like-only) view: derives from reaction log, reuses .listing-card |
| `assets/js/page-rejected.js` | Rejected/Passed listings table: builds from snapshot log, search/paginate, reason display |
| `assets/js/page-property.js` | Single-listing dossier (Stripe-docs anchor): gallery, facts, description, reactions, rating |
| `assets/js/page-report.js` | Value-analysis summary: ranked villages, feasibility, key points, generated-at stamp |
| `assets/js/listings/classify.js` | Property-type allow-list, baseline price/beds gate (cross-import: Node tools + browser) |
| `assets/js/listings/fit.js` | L2 fit-score engine: hard gates (affordability, price floor) + soft signals (beds, type, LISA, EPC, learned prefs, rating) |
| `assets/js/listings/feed-partition.js` | Pure partition pipeline: radius → score → gates → junk/refinement hides → decided/fingerprint dedupe → search/sort → reviewed split |
| `assets/js/listings/fetch.js` | "Pull listings" control: 24hr/3d/7d Rightmove windows, confirms, dispatches via `requestListingsFetch` RPC |
| `assets/js/listings/reactions.js` | Reaction vocab (like/pass/reject), reject/like reason chips, sub-reasons, validation, normalise, latest-per-listing reduction |
| `assets/js/listings/reactions-ui.js` | Multi-select picker (shared row/deck/dossier): verb buttons, reason primaries + optional subs, Save consolidation |
| `assets/js/listings/suppress.js` | Feed suppression: decided sets (by id & fingerprint), dedupe by fingerprint (newest by time), fold reactions in-place |
| `assets/js/listings/detail.js` | Dossier helpers: gallery images, floor-plan images, price-history series, net-price-change |
| `assets/js/listings/controls.js` | Search/sort/filter for listings & saved: pure filterListings/sortListings (no DOM), + DOM wiring + URL state |
| `assets/js/listings/format.js` | Pure formatters: fmtPrice, fmtAgo, fmtDate, lastPriceDrop (extracted for unit test) |
| `assets/js/listings/labels.js` | Label dicts: VERDICT_LABELS, STATUS_LABELS, PERSONAL_STATUS_LABELS, HIDE_LABELS |
| `assets/js/listings/flags.js` | Post-fetch classifier: new-build/condition red flags (never silent), hide-reason logic (auction/over-55/refinement hidden) |
| `assets/js/listings/rating-ui.js` | 1–10 priority select (saved-card + dossier), feeds fit-score as positive-only nudge |
| `assets/js/listings/nav.js` | Return-tracking & focus restore (list-to-dossier-to-list), back-target preservation |
| `assets/js/listings/picker-state.js` | Pure draft reducer for in-progress reaction picker (verb + primary/sub toggles, JSON-able, rehydrate across repaints) |
| `assets/js/listings/reaction-provenance.js` | Training eligibility gates: isTraining, isNonTrainingReaction, isUnattributedReject (learning can read reasons, not unattributed rejects) |
| `assets/js/listings/rejected-view.js` | Pure read model: builds rejected/passed table from snapshot log, search, paginate, collapse same-property re-lists |
| `assets/js/storage/listings.js` | GUARD-RAIL: `getListings()`, `getReactionLog()`, `saveListingReaction()`, `getListingRatings()`, `setListingRating()`, `getShortlistStatuses()`, `setShortlistStatus()` (§16 extend-only) |
| `assets/css/pages/listings.css` | @import shell: controls, cards, states, widgets (649→modular, cascade byte-for-byte unchanged) |
| `assets/css/pages/property.css` | Dossier styles: gallery, hero, sections, facts grid, price history, floor plan, prose, rail cards, sticky actions |
| `assets/css/pages/{rejected,report}.css` | Rejected table + Report styles (role-specific CSS) |
| `assets/css/listings/{controls,cards,states,widgets}.css` | Listings CSS partials: feed bars, media cards, fit dots, verdicts, tags, flags, why-expander, reactions, mobile states |
| `tools/fetch-listings.mjs` | Scheduled fetcher (Node): areas → outcodes → Apify actor → normalise → dedupe → nearest-area → merge price_history → UPSERT |
| `tools/listings-normalise.mjs` | Normaliser: Apify raw → listings shape, isInOutcode, withinGeofence, haversineKm, mergePriceHistory |
| `tools/import-apify-runs.mjs` | Backfill importer: post-process Apify runs, call listings-normalise, feed the same UPSERT path |
| `tools/purge-listings.mjs` | Maintenance: remove withdrawn/soft-deleted rows, compact the table |
| `docs/FETCH_SCHEDULE.md` | Fetch timing: pg_cron (noon London) + GitHub schedule (backstop), GitHub token in Vault, RPC trigger, Apify budget caps |

---

### Data flows

#### Fetch path (L1) — Rightmove fetcher → Supabase listings table

1. **Scheduled trigger:** `pg_cron` (noon Europe/London, via Supabase Vault token) or GitHub Actions backstop both dispatch `workflow_dispatch`.
2. **Manual trigger:** User taps "Pull listings" (24hr/3d/7d button, file: `assets/js/listings/fetch.js`) → `confirmFetch()` native dialog (line 38–59, confirm-only) → `requestListingsFetch(days)` RPC (storage/listings.js:187–197) → GitHub Vault token → GitHub Actions `request-rightmove-fetch` dispatch.
3. **Fetcher runs:** `tools/fetch-listings.mjs` — reads areas/*.json per-area files → extracts distinct outcodes → calls Apify actor (dhrumil~rightmove-scraper, hardcoded in the tool) → receives raw JSON listings.
4. **Normalise:** `tools/listings-normalise.mjs` (called by fetch-listings.mjs + import-apify-runs.mjs) — Apify raw JSON → normalised shape (fields: rightmove_id, address, postcode, outcode, lat, lng, property_type, beds, baths, price, title, status, image_url, raw_json, added_date, price_history, description, first_seen, geofence_pass, distance_mi, name_match, corroborated, area_id, council_tax, epc, tenure, update_reason).
5. **Validate baseline:** `passesBaseline()` (classify.js:57–67, shared browser+Node) — type must be in allow-list (property-type classification, lines 28–38); known price ∈ [BASELINE_PRICE_MIN=250000, BASELINE_PRICE_MAX=425000] (line 45–46, owner-set 2026-06-04); known beds ≥ BASELINE_MIN_BEDS=2 (line 47). Unknown price/beds do NOT reject (re-fetched summary may omit them) — only type is unconditional.
6. **Dedupe & location:** `dedupeByRightmoveId()` (not exported; internal to fetch tool) + nearest-area match via `haversineKm()` (listings-normalise.mjs) — associates each listing to its matched area_id.
7. **Merge price history:** existing listing's `price_history` array + new price → upsert via PostgREST service-role UPSERT (rightmove_id conflict key).
8. **Result:** listings table ← live source of truth; every row carries snapshot price_history array + raw_json details.

#### Browse feed (L2) — Listings page, fit-score pipeline

1. **Load:** `getListings({ limit, status, includeOutOfArea, scopeToHousehold })` (storage/listings.js:253–310) → fetches from listings table, scoped to household's selected area_ids (via household_areas join), geofence_pass gate (line 284), capped or paginated (lines 289–305).
2. **Score:** `scoreListingFit({ listing, finances, criteria, area, learnedPrefs, rating })` (fit.js:56–176) — outputs `{ verdict, score, gated, contributions[], affordability }`.
   - **Hard gates** (lines 74–109):
     - Affordability gate: `affordability.verdict === 'out-of-reach'` → verdict='reject', gated=true, hidden by default (revealable via includeOOR toggle).
     - Price floor gate: known price < criteria.budget.min → verdict='reject', gated=true (mirrors ceiling treatment).
   - **Soft signals** (lines 111–166, base=0.5):
     - Affordability band: comfortable (+0.25, line 50), stretch (+0.10, line 51), tight (-0.05, line 52).
     - Beds: ideal ≥ criteria.size.idealBeds (+0.15), meets min ≥ criteria.size.minBeds (+0.05), below min < minBeds (-0.30).
     - Type: preferred (+0.15), acceptable (+0.0), excluded (-0.40).
     - Price: in budget (+0.10), over budget (-0.20).
     - LISA: price ≤ LISA_CAP_GBP (450000, line 15 intelligence-constants.js) AND affordability.bandSignals.lisaEligible → +0.08.
     - EPC: listing.epc ≥ criteria.epcMin → +0.05.
     - Learned preferences (L4 seam, lines 150–155): learnedPrefs map signal→weight, each applied as contribution.
     - Manual rating (1–10, lines 159–164): positive-only, clamped to [0, ratingMax=0.20], linearly scaled (10→0.20, 1→0, <1→no boost).
   - **Verdict bands** (intelligence-constants.js:45, fit.js line 22–27):
     - strong ≥ 0.75
     - possible ≥ 0.55
     - stretch ≥ 0.4
     - weak ≥ 0.2
     - reject < 0.2 (or gated=true).
3. **Partition:** `partitionFeed(listings, { passesRadius, scoreOf, areaOf, includeOOR, includeHidden, isJunk, isRefHidden, isDecided, isReviewed, reactionOf, applyControls })` (feed-partition.js:33–101) — pure pipeline:
   - Radius filter: `passesRadius()` (household search-radius pre-check), line 47.
   - Hard gates: `includeOOR` toggle reveals gated rows, line 59.
   - Junk hide: `isJunk()` classifier (auction/over-55, classify.js) — toggled by includeHidden, lines 60–62.
   - Refinement hide: `isRefHidden()` (confirmed hide rules from refinement/view.js) — toggled by includeHidden, lines 60–62.
   - Decided suppression: `isDecided()` (suppress.js:45–50) by id AND fingerprint (re-lists caught), line 70. UNCONDITIONAL — "Show hidden" does NOT reveal decided rows.
   - Dedupe: `dedupeByFingerprint()` (suppress.js:84–100) — collapse same fingerprint to newest-by-added_date, break ties on cheapest price, line 71.
   - Apply controls: `applyControls(deduped, scoredRows)` — search/sort/filter, line 74–76.
   - Split reviewed: `isReviewed()` (a Saved decision, checked via reviewed-listings localStorage marker) vs unreviewed, lines 80–81.
   - Return: `{ scoredRows, visible, unreviewed, reviewed, byVerb: {like,pass,reject}, counts }`, lines 100.
4. **Render:** page-listings.js paints `visible` rows as `.listing-card` media cards (see CSS anchor): address, price, beds, type, geofence chips (distance · village + ⚠ unconfirmed), flags (new-build / condition red-flags), fit-dot (colored circle, verdict text), why-expander (breakdown of scoring contributions), reactions row (verb buttons + optional reason picker), rating select (1–10, dossier only).
5. **Reaction:** User taps like/pass/reject → `buildReasonPicker()` (reactions-ui.js) opens → optional reason chips (multi-select primary + optional sub-reasons, reactions.js lines 23–104) → Save → `saveListingReaction({ listing_id, reaction, reason, reasons, listing_snapshot })` (storage/listings.js:434–449) appends row to listing_reactions (append-only).

#### Saved listings (L3a) — Likes-only view

1. **Load:** `getReactionLog()` (storage/listings.js:416–432) → all listing_reactions rows, paged (PAGE=1000, line 346–362, mirroring getListings pagination).
2. **Filter:** `latestPerListing(log)` (reactions.js) → latest reaction per listing_id.
3. **Filter:** only `reaction = 'like'` rows → extract `listing_snapshot` (captured at reaction time, allows delisted homes to still render).
4. **Dedupe:** `dedupeNewestByFingerprint(items, keyOf, timeOf)` (suppress.js:113–124) — by snapshot address, newest-save-time first, so a re-liked home under a new rightmove_id appears once (most recent save).
5. **Render:** cards reuse `.listing-card`, surfaced like-reasons as read-only chips (e.g., great_area:quiet, good_value:underpriced), rating select (1–10, editable in-place), edit reaction/rating inline.

#### Rejected page (L3b) — Pass/Reject table

1. **Load:** `getReactionLog()` → latest per listing.
2. **Filter:** `reaction ∈ {pass, reject}` → derive from `listing_snapshot`.
3. **Dedupe:** collapse same property (fingerprint) to most-recent decision, hide re-lists.
4. **Render:** table (property type, area, title, price, reaction-verb, reasons chip, date-decided), search by type/area/address, 50-per-page paginate (pagination code in rejected-view.js).

#### Property dossier (L6) — Single-listing page

1. **Load:** `getListing(rightmove_id)` (storage/listings.js:314–329) → single row, expand raw_json.
2. **Extract:** `galleryImages()` (detail.js) → raw_json.images[] + image_url (dedupe, primary guaranteed).
3. **Extract:** `floorplanImages()` (detail.js) → raw_json.floorplans|floorplan_url (if detail-page scrape available).
4. **History:** `priceHistorySeries()` (detail.js) → time-ascending, per-step delta/pct/kind (listed/reduced/increased).
5. **Render:** Stripe-docs anchor — hero gallery (prev/next arrows, counter, thumb grid, full-screen lightbox modal), headline (verdict + fit-dot, price, title, place), Rightmove CTA + Google Maps links, sections (only show if data: facts grid 2-col, EPC if known, council-tax if known, price history if >1 point, floor plan if available), full description prose, rail (fit-why open, reaction picker, status select, rating select).
6. **Reaction/status:** Same picker + picker-state (in-progress draft rehydrate), status select ∈ {new, saved, viewed, offered, rejected}.

#### Learning loop (L4) — seam reserved

1. **Reactions feed learning:** `GRADED_REACTIONS = ['like', 'reject']` (reactions.js:20) → training signals.
2. **Training filters:** `isTraining()` (reaction-provenance.js) — exclude unattributed rejects, exclude removed_area + system reasons (NON_TRAINING_REASON_KEYS).
3. **Learned prefs:** `recomputeLearnedPreferences()` (learned-preferences.js) → derived preference weights per signal (area, type, etc.).
4. **Apply:** `listingLearnedPrefs()` (learned-preferences.js) → extract this listing's effective weights → `scoreListingFit({ learnedPrefs })` applies as soft contributions.

---

### Feature & behaviour catalogue (vetted)

#### Property-type allow-list and baseline validation

**Name & purpose:**  
Single source of truth for "is this a home worth showing?" (baseline type/price/beds gate). Prevents flats, land, shared housing, park homes, retirement homes, etc. from entering the feed, and enforces a price/beds floor consistent with the fetcher's and the household's intent.

**Trigger & entry:**  
- Browser: `classify.js:propertyTypeClass()` (line 28–34) — called by feed partition, feed suppression, flags.js.
- Node: `tools/fetch-listings.mjs` imports classify.js → calls `passesBaseline()` post-normalise (line 57–67), gatekeeping the UPSERT.

**Inputs & preconditions:**  
- A normalized listing row `{ property_type, price, beds }`.
- Optional overrides: `{ priceMin, priceMax, minBeds }` (defaults: 250k, 425k, 2 beds).

**Exact rule — quoted from file:line:**  
```javascript
// classify.js:19–24 — EXCLUDED TYPE RE (literal)
const EXCLUDED_TYPE_RE = /\b(flat|apartment|maisonette|penthouse|studio|duplex|coach\s*house|park\s*home|mobile\s*home|caravan|houseboat|house\s*boat|lodge|chalet|land|plot|farm\s*land|equestrian|garages?|house\s*share|multiple\s*occupation|\bhmo\b|retirement|sheltered|not\s*specified)\b/;

// classify.js:24 — ALLOWED TYPE RE (literal)
const ALLOWED_TYPE_RE = /\b(detached|semi[\s-]*detached|terrace|terraced|end[\s-]*of[\s-]*terrace|town\s*house|cottage|link[\s-]*detached|mews|barn|character|bungalow|house|farmhouse|manor)\b/;

// classify.js:57–67 (exact)
export function passesBaseline(listing, { priceMin = BASELINE_PRICE_MIN, priceMax = BASELINE_PRICE_MAX, minBeds = BASELINE_MIN_BEDS } = {}) {
  if (!listing) return false;
  if (!isAllowedPropertyType(listing.property_type)) return false;
  const price = listing.price == null || listing.price === '' ? NaN : Number(listing.price);
  if (Number.isFinite(price) && (price < priceMin || price > priceMax)) return false;
  const beds = listing.beds == null || listing.beds === '' ? NaN : Number(listing.beds);
  if (Number.isFinite(beds) && beds < minBeds) return false;
  return true;
}

// classify.js:45–47
export const BASELINE_PRICE_MIN = 250000;   // owner-set floor (2026-06-04)
export const BASELINE_PRICE_MAX = 425000;   // owner-set ceiling (2026-06-04)
export const BASELINE_MIN_BEDS  = 2;
```

**Outputs & effects:**  
- `propertyTypeClass()` → 'house' | 'excluded' | 'unknown'.
- `passesBaseline()` → boolean.
- Rejected rows never UPSERT; rejected rows in the feed are hidden (not destroyed).

**Edge cases:**  
- Empty/null property_type → 'unknown' (conservative, shows in feed).
- Unknown price/beds (null or '') → NaN (never trips band check, allows a resummary fetch to preserve a known row).
- Overlapping name patterns: "Coach House" must not match "House" alone — EXCLUDED wins first (line 19).

**Rationale:**  
Rightmove's source filters (~26% wrong-type slip-through, line 9 flags.js) + the Apify actor's loose compliance mean post-fetch filtering is essential. A single cross-boundary module (browser + Node, same file) prevents divergence. Conservative unknown handling lets re-fetched summaries refresh the row without losing data.

**Invariants & acceptance criteria:**  
- propertyTypeClass() deterministic, pure (no side effects).
- passesBaseline({ beds: 1 }) → false (below BASELINE_MIN_BEDS).
- passesBaseline({ price: 250000 }) → true (exact floor).
- passesBaseline({ price: 249999 }) → false (just under floor).
- Flat/apartment/Coach House/HMO always rejected.
- Semi-Detached / Semi-Detached House fingerprint identically (normalize via typeToken).

**Card & dossier style:**  
Linear-dense: listings cards hide excluded type (moved to .listing-tag--hidden, line 77 page-listings.js, only visible with "Show hidden" toggle).

---

#### Fit-score algorithm (L2) — the 5-band verdicts

**Name & purpose:**  
Dual-layer affordability assessment: hard gate first (out-of-reach ⇒ reject, filtered from default feed), then soft scoring blending type/size/price/LISA/EPC fit (and, from L4, learned-preference weights).

**Trigger & entry:**  
`scoreListingFit({ listing, finances, criteria, area, learnedPrefs, rating })` (fit.js:56).

**Inputs & preconditions:**  
- `listing`: normalized row.
- `finances`: derived affordability record (from affordability.js, single source).
- `criteria`: { budget: {min, max}, size: {minBeds, idealBeds}, propertyTypePrefs: {preferred[], acceptable[], excluded[]}, epcMin, councilTaxBand }.
- `area`: matched area record (for council_tax fallback).
- `learnedPrefs`: (L4) signal→weight map.
- `rating`: 1–10 manual priority (positive-only boost).

**Exact rule — quoted from file:line:**  
```javascript
// fit.js:112–176 — soft signals from 0.5 base
let score = 0.5;
const W = FIT_WEIGHTS;
// Affordability band as a signal.
if (affordability.verdict === 'comfortable') add('affordability', 'Comfortably affordable', W.affordabilityComfortable);  // +0.25
else if (affordability.verdict === 'stretch') add('affordability', 'Affordable (a stretch)', W.affordabilityStretch);  // +0.10
else if (affordability.verdict === 'tight') add('affordability', 'Affordability is tight', W.affordabilityTight);  // -0.05

// Beds (minBeds hoisted; idealBeds checked)
if (minBeds && beds < minBeds) add('beds', `${beds} beds — below your ${minBeds}-bed minimum`, W.bedsBelowMin);  // -0.30
else if (idealBeds && beds >= idealBeds) add('beds', `${beds} beds — meets your ideal`, W.bedsIdeal);  // +0.15
else if (minBeds && beds >= minBeds) add('beds', `${beds} beds — meets your minimum`, W.bedsMin);  // +0.05

// Type (typeIn() uses loose substring match)
if (typeIn(prefs.excluded, type)) add('type', `${type} — an excluded type`, W.typeExcluded);  // -0.40
else if (typeIn(prefs.preferred, type)) add('type', `${type} — a preferred type`, W.typePreferred);  // +0.15
else if (typeIn(prefs.acceptable, type)) add('type', `${type} — acceptable`, W.typeAcceptable);  // +0.0

// Price
if (bMax && price > bMax) add('price', `£${price.toLocaleString('en-GB')} — over your £${bMax.toLocaleString('en-GB')} ceiling`, W.priceOverBudget);  // -0.20
else if (price && (!bMin || price >= bMin) && (!bMax || price <= bMax)) add('price', 'Within your budget window', W.priceInBudget);  // +0.10

// LISA
if (affordability.bandSignals?.lisaEligible) add('lisa', 'LISA-eligible price', W.lisaEligible);  // +0.08

// EPC
if (listing?.epc && epcMin && (EPC_RANK[String(listing.epc).toUpperCase()] || 0) >= (EPC_RANK[String(epcMin).toUpperCase()] || 0)) {
  add('epc', `EPC ${listing.epc} — meets your ${epcMin} minimum`, W.epcMeetsMin);  // +0.05
}

// Learned preferences (L4)
if (learnedPrefs && typeof learnedPrefs === 'object') {
  for (const [signal, weight] of Object.entries(learnedPrefs)) {
    const w = Number(weight);
    if (w) add(`learned:${signal}`, `Learned preference: ${signal}`, w);
  }
}

// Manual rating: positive-only, 1–10 → [0, ratingMax]
const r = Number(rating);
if (Number.isFinite(r) && r >= 1) {
  const clamped = Math.min(10, r);
  const delta = Math.max(0, W.ratingMax * (clamped - 1) / 9);  // ratingMax = 0.20, line 66
  if (delta) add('rating', `You rated this ${Math.round(clamped)}/10`, delta);
}

// intelligence-constants.js:49–67 — FIT_WEIGHTS (exact)
export const FIT_WEIGHTS = {
  affordabilityComfortable: 0.25,
  affordabilityStretch: 0.10,
  affordabilityTight: -0.05,
  bedsIdeal: 0.15,
  bedsMin: 0.05,
  bedsBelowMin: -0.30,
  typePreferred: 0.15,
  typeAcceptable: 0.0,
  typeExcluded: -0.40,
  priceInBudget: 0.10,
  priceOverBudget: -0.20,
  lisaEligible: 0.08,
  epcMeetsMin: 0.05,
  ratingMax: 0.20,
};

// fit.js:22–28 — bandForScore (verdict bands)
function bandForScore(score) {
  if (score >= FIT_BANDS.strong) return 'strong';     // 0.75
  if (score >= FIT_BANDS.possible) return 'possible'; // 0.55
  if (score >= FIT_BANDS.stretch) return 'stretch';   // 0.4
  if (score >= FIT_BANDS.weak) return 'weak';         // 0.2
  return 'reject';
}

// intelligence-constants.js:45
export const FIT_BANDS = { strong: 0.75, possible: 0.55, stretch: 0.4, weak: 0.2 };
```

**Outputs & effects:**  
`{ verdict, score, gated, contributions[], affordability }` — verdict ∈ {strong, possible, stretch, weak, reject}, score ∈ [0,1], gated=true for out-of-reach/price-floor, contributions array built by construction (see "why" building in page-listings.js).

**Edge cases:**  
- Missing affordability assessment → contribution omitted (soft signal becomes no signal).
- Unknown beds/price → contribution omitted.
- rating=0 or rating>10 → normalized to [1, 10] (line 161).
- typeIn() substring match: "Semi-Detached" matches "Semi-detached house" (broad, intentional).

**Rationale:**  
Hard gates (affordability + price floor) are necessary guardrails; soft scoring allows "interesting" homes just outside strict criteria to surface for human review. Contributions array replaces black-box single score, enabling transparent "why this verdict?" UI. Learned preferences seam (L4) is clear but not yet wired; fit.js is ready.

**Invariants & acceptance criteria:**  
- Score always ∈ [0, 1] (clamped, line 167).
- contributions[] length ≥ 1 (at least affordability band, or a gate).
- Gated rows (verdict='reject', gated=true, score=0) are never shown in default feed.
- Verdict bands are deterministic (given fixed weights, same inputs → same verdict).
- Rating contribution ≥ 0 (never penalties).

**Card & dossier style:**  
Linear-dense: fit-dot (colored circle, Pico CSS theme color) + verdict text (strong/possible/stretch/weak) on card. Dossier: full why-expander (sorted contributions by |delta|, top 2–3 shown by default).

---

#### Feed partition & suppression pipeline

**Name & purpose:**  
Pure partition of the live listings into the rendered feed, controlling visibility via stacking gates (radius → score → affordability → junk → refinement → decided → dedupe → controls → reviewed split). Suppression suppresses re-lists and already-decided properties by physical-property fingerprint.

**Trigger & entry:**  
`partitionFeed(listings, { passesRadius, scoreOf, areaOf, includeOOR, includeHidden, isJunk, isRefHidden, isDecided, isReviewed, reactionOf, applyControls })` (feed-partition.js:33).

**Inputs & preconditions:**  
- `listings`: array of live rows.
- Callbacks: scoreOf (scored row), isJunk, isRefHidden, isDecided, isReviewed, reactionOf, applyControls.
- Toggles: includeOOR (show out-of-reach), includeHidden (show junk + refinement hidden).

**Exact rule — quoted from file:line:**  
```javascript
// feed-partition.js:47–76 (exact pipeline)
const radiusFiltered = all.filter(passesRadius);  // Stage 1: radius
const scoredRows = radiusFiltered.map((listing) => ({ listing, scored: scoreOf(listing), area: areaOf(listing) }));
const gated = scoredRows.filter((r) => r.scored.gated);  // Hard gates

// Stage 2: affordability gate
const afford = includeOOR ? scoredRows : scoredRows.filter((r) => !r.scored.gated);

// Stage 3: junk + refinement hides
const junkRows = afford.filter((r) => isJunk(r.listing));
const refHiddenRows = afford.filter((r) => !isJunk(r.listing) && isRefHidden(r.listing));
const pool = includeHidden ? afford : afford.filter((r) => !isJunk(r.listing) && !isRefHidden(r.listing));

// Stage 4: decided suppression (UNCONDITIONAL)
const undecided = pool.filter((r) => !isDecided(r.listing));

// Stage 5: dedupe by fingerprint
const deduped = dedupeByFingerprint(undecided, (r) => r.listing);
const decidedCount = pool.length - undecided.length;
const dupCount = undecided.length - deduped.length;

// Stage 6: apply controls (search/sort/filter)
const visible = applyControls(deduped.map((r) => r.listing), scoredRows)
  .map((l) => rowById.get(l.rightmove_id))
  .filter(Boolean);

// Stage 7: reviewed split
const unreviewed = visible.filter((r) => !isReviewed(r.listing.rightmove_id));
const reviewed = visible.filter((r) => isReviewed(r.listing.rightmove_id));
const byVerb = { like: [], pass: [], reject: [] };
for (const r of reviewed) {
  const verb = reactionOf(r.listing.rightmove_id)?.reaction;
  (byVerb[verb] || byVerb.pass).push(r);
}

// Counting (all stages)
const gatedCount = includeOOR ? 0 : gated.length;
const hiddenJunkCount = includeHidden ? 0 : junkRows.length;
const hiddenRefCount = includeHidden ? 0 : refHiddenRows.length;
const counts = {
  hiddenByRadiusCount,
  gatedCount,
  hiddenJunkCount,
  hiddenRefCount,
  decidedCount,
  dupCount,
  hiddenByFilter: Math.max(0, all.length - visible.length - hiddenByRadiusCount - gatedCount - hiddenJunkCount - hiddenRefCount - decidedCount - dupCount),
};
return { scoredRows, visible, unreviewed, reviewed, byVerb, counts };
```

**Suppression operators:**  
```javascript
// suppress.js:32–43 — decidedSets (build from reaction log)
export function decidedSets(latest, liveById = new Map()) {
  const ids = new Set();
  const fps = new Set();
  for (const [id, row] of latest instanceof Map ? latest : new Map(Object.entries(latest || {}))) {
    if (!DECIDING.has(row?.reaction)) continue;  // 'like', 'pass', 'reject'
    const key = String(id);
    ids.add(key);
    const fp = propertyFingerprint(row.listing_snapshot) || propertyFingerprint(liveById.get(key));
    if (fp) fps.add(fp);
  }
  return { ids, fps };
}

// suppress.js:45–50 — isDecided (test by id OR fingerprint)
export function isDecided(listing, { ids, fps } = {}) {
  if (ids && ids.has(String(listing?.rightmove_id))) return true;
  const fp = propertyFingerprint(listing);
  return !!(fp && fps && fps.has(fp));
}

// suppress.js:84–100 — dedupeByFingerprint (collapse same-property to newest)
export function dedupeByFingerprint(items, keyOf = (x) => x) {
  const groups = new Map();
  const singles = [];
  for (const it of items || []) {
    const fp = propertyFingerprint(keyOf(it));
    if (!fp) { singles.push(it); continue; }
    if (!groups.has(fp)) groups.set(fp, []);
    groups.get(fp).push(it);
  }
  const score = (l) => (new Date(l?.added_date || l?.first_seen || 0).getTime() || 0) - (Number(l?.price) || 0) / 1e9;
  const reps = [];
  for (const g of groups.values()) {
    g.sort((a, b) => score(keyOf(b)) - score(keyOf(a)));
    reps.push(g[0]);
  }
  return [...reps, ...singles];
}
```

**Outputs & effects:**  
`{ scoredRows, visible, unreviewed, reviewed, byVerb: {like, pass, reject}, counts: {hiddenByRadiusCount, gatedCount, hiddenJunkCount, hiddenRefCount, decidedCount, dupCount, hiddenByFilter} }`.

**Edge cases:**  
- A listing both junk AND refinement-hidden: counted as junk only (line 61, no double-count).
- A decided property with no fingerprint (too-coarse address): still suppressed by id.
- Undecided duplicates (different agents, same fingerprint): collapsed to newest-by-added_date, tie-break cheapest-price.
- "Show hidden" toggle does NOT reveal decided rows — likes live on Saved, pass/reject on Rejected page.

**Rationale:**  
Stacked gates allow independent toggles (includeOOR, includeHidden) while preserving decided-property suppression (unconditional). Decided suppression by BOTH id AND fingerprint catches re-lists under new rightmove_ids. Fingerprint is conservative (need street + town) to avoid false merges, so items with null fingerprint are always kept (no false negatives).

**Invariants & acceptance criteria:**  
- partitionFeed() deterministic, pure.
- If includeOOR=false, no gated rows in visible (gatedCount > 0 ⇒ hidden).
- Decided rows never in visible (unconditional).
- dedupeByFingerprint() preserves all items with null fingerprint.
- dedupedByFingerprint(N items) ≤ N items (never grows).
- decidedCount + dupCount + gatedCount + hiddenJunkCount + hiddenRefCount + hiddenByFilter + visible.length = all.length.

**Card & dossier style:**  
Linear-dense: decided rows (Saved/Rejected) never render on feed. Duplicate cards not shown. Junk/refinement hidden cards shown only with toggle on.

---

#### Reactions & decision capture (L3)

**Name & purpose:**  
Append-only graded preference signal log, providing the training input for learned preferences (L4) and the suppression source for feed + saved page. Reactions are like/pass/reject + optional reason chips (multi-select primary + optional sub-reasons). `pass` is a soft skip (no training signal, but suppresses the feed). `like` and `reject` are graded.

**Trigger & entry:**  
- User taps verb button on card/dossier → `buildReasonPicker()` (reactions-ui.js) opens → taps reason chips + Save → `saveListingReaction()` (storage/listings.js:434).

**Inputs & preconditions:**  
- `{ listing_id, reaction, reason, reasons, listing_snapshot }` (normalised).
- reaction ∈ {like, pass, reject}.
- reason: scalar (legacy compat, reject-only, deprecated but still stored).
- reasons: array of reason keys (primary [0] + optional subs [1+]).
- listing_snapshot: full listing row captured at reaction time (allows saved homes to render even after being delisted).

**Exact rule — quoted from file:line:**  
```javascript
// reactions.js:17–20 (REACTIONS vocab)
export const REACTIONS = ['like', 'pass', 'reject'];
export const GRADED_REACTIONS = ['like', 'reject'];  // training input

// reactions.js:23–32 (REJECT_REASONS chips, user-facing)
export const REJECT_REASONS = [
  { key: 'too_expensive', label: 'Too expensive' },
  { key: 'wrong_area',    label: 'Wrong area' },
  { key: 'too_small',     label: 'Too small' },
  { key: 'needs_work',    label: 'Needs too much work' },
  { key: 'no_outdoor',    label: 'No outdoor space' },
  { key: 'poor_layout',   label: 'Poor layout' },
  { key: 'busy_road',     label: 'Busy road / location' },
  { key: 'wrong_house_type', label: 'Wrong house type' },
];

// reactions.js:43–48 (SYSTEM_REJECT_REASONS — admin only, not in manual picker)
export const SYSTEM_REJECT_REASONS = [
  { key: 'removed_area', label: 'Removed area (ignored)' },
];
export const NON_TRAINING_REASON_KEYS = new Set(SYSTEM_REJECT_REASONS.map((r) => r.key));

// reactions.js:62–99 (REJECT_SUBREASONS — optional drill-down)
export const REJECT_SUBREASONS = {
  too_expensive: [
    { key: 'over_budget', label: 'Over budget' },
    { key: 'poor_value',  label: 'Poor value for the spec' },
  ],
  wrong_area: [
    { key: 'too_rural', label: 'Too rural' },
    { key: 'too_urban', label: 'Too built-up' },
    { key: 'commute',   label: 'Bad commute' },
    { key: 'schools',   label: 'Schools' },
    { key: 'flood',     label: 'Flood risk' },
  ],
  // … (8 more parents)
};

// storage/listings.js:434–449 (saveListingReaction, exact)
export async function saveListingReaction({ listing_id, reaction, reason = null, reasons = null, listing_snapshot = null }) {
  const norm = normaliseReaction({ listing_id, reaction, reason, reasons, listing_snapshot });
  if (!norm) { console.error('storage: invalid listing reaction', reaction); return false; }
  const [sb, hid] = await Promise.all([_initSb(), _getHid()]);
  if (!sb || !hid) return false;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const { error } = await sb.from('listing_reactions').insert({
      household_id: hid,
      user_id: session?.user?.id ?? null,
      listing_id: norm.listing_id,
      reaction: norm.reaction,
      reason: norm.reason,
      reasons: norm.reasons,
      listing_snapshot: norm.listing_snapshot,
    });
    if (error) throw error;
    // Invalidate + revalidate caches
    removeLocal('listing-reactions');
    _sbGetReactionRows().then((rows) => { if (rows) writeLocal('listing-reactions', _reactionsToMap(rows)); }).catch(() => {});
    return true;
  } catch (e) {
    console.error('storage: save listing reaction', e.message);
    _toast(`Failed to save reaction: ${e.message}`, true);
    return false;
  }
}
```

**Outputs & effects:**  
- New row appended to listing_reactions table.
- Suppression sets fold the decision in-place (suppress.js line 66–73, `foldDecision`).
- Feed re-partitions (decided count +1, visible -1).
- Learned preferences recomputed (next L4 evaluation).

**Edge cases:**  
- reason + reasons both supplied: normaliseReaction() resolves both (reason used if reasons is empty, else reasons wins).
- Unattributed reject (no reason chip selected): allowed to save, but isNonTrainingReaction() filters it out of learning input.
- listing_snapshot absent: lookup fails; a re-liked home after delisting will not render on Saved (edge case, mitigated by asking for snapshot at UI level).

**Rationale:**  
Append-only log allows durable history (never destructive, always auditable). Reactions don't destroy rows; they re-rank (feed suppression) and feed learning. pass/reject both suppress (household moved them off browse) but pass carries no training signal (weak signal, not graded). Snapshot capture enables saved homes to render even post-delisting.

**Invariants & acceptance criteria:**  
- Every row has household_id, user_id, listing_id, reaction, created_at.
- reaction ∈ {like, pass, reject} (enforced by normaliseReaction).
- reasons array: [primary, ...optional-subs].
- GRADED_REACTIONS = {like, reject} only.
- NON_TRAINING_REASON_KEYS include removed_area.
- latestPerListing(log) produces one row per listing_id (deterministic).

**Card & dossier style:**  
Linear-dense: reason chips (user-facing REJECT_REASONS) shown on saved cards + rejected table. reaction picker on card + dossier (same UI, reactions-ui.js).

---

#### Property classification & hiding (junk + red flags)

**Name & purpose:**  
Post-fetch classifier for two tiers: HIDE (auction, over-55, wrong type) and FLAG (new build, condition red-flags). Hides are toggled by "Show hidden"; flags are always shown.

**Trigger & entry:**  
`classifyListing(listing)` (flags.js:57–75, called by page-listings.js paint loop).

**Inputs & preconditions:**  
- A normalized listings row (title, description, raw_json, property_type).

**Exact rule — quoted from file:line:**  
```javascript
// flags.js:30–50 (HIDE regexes, exact)
const AUCTION = /\bfor sale by (?:modern |online )?auction\b|\bmodern method of auction\b|\bonline auction\b|\bnational property auction\b|\bunder the hammer\b|\bauctioneers?\b|\bsold via auction\b/;

const RETIREMENT_BRAND = /\bretirement (?:home|property|apartment|living|complex|development|village)\b|mccarthy stone|churchill retirement|\bsheltered (?:housing|accommodation)\b|\bassisted living\b|\blater living\b|\bextra care\b|\bover[- ]?55s? (?:only|development|community)\b/;
const AGE_PHRASE = /\bover[- ]?(?:55|60)s?\b|\b(?:55|60)\+\b|\b(?:55|60) (?:and|or) over\b|\baged? (?:55|60)\b|\bminimum age\b|\bage[- ]restrict/;
const AGE_NEGATION = /\bno (?:upper )?age (?:restriction|limit)\b|\bnot age[- ]restricted\b|\bany age\b|\bno age limit\b/;

// flags.js:39–47 (FLAG regexes, exact)
const NEW_BUILD = /\bnew build\b|\bnewly built\b|\bbrand[- ]new\b|\bnew home\b|\bshow home\b|\bnew development\b/;

const CONDITION = [
  { key: 'needs-work', label: 'Needs modernisation', re: /\bneeds? modernis|\bin need of (?:modernis|refurb|updating|renovation)|\brefurbishment\b|\brenovation project\b|\brequires? (?:updating|modernis)/ },
  { key: 'cash-only',  label: 'Cash buyers only',    re: /\bcash buyers? only\b|\bcash purchasers? only\b/ },
  { key: 'investment', label: 'Investment opportunity', re: /\binvestment opportunity\b/ },
];

// flags.js:57–75 (classifyListing, exact)
export function classifyListing(listing = {}) {
  const text = norm(`${listing.title || ''} ${listing.description || ''}`);
  const hideReasons = [];
  if (listing.property_type && propertyTypeClass(listing.property_type) === 'excluded') hideReasons.push('wrong-type');
  if (AUCTION.test(text)) hideReasons.push('auction');
  const ageHit = AGE_PHRASE.test(text) && !AGE_NEGATION.test(text);  // guard against "no age restriction"
  if (RETIREMENT_BRAND.test(text) || ageHit) hideReasons.push('over-55');

  const flags = [];
  const rawNew = listing?.raw_json?.newHome === true || listing?.raw_json?.isNewHome === true;
  if (NEW_BUILD.test(text) || rawNew) flags.push({ key: 'new-build', label: 'New build' });
  for (const c of CONDITION) if (c.re.test(text)) flags.push({ key: c.key, label: c.label });
  return { hide: hideReasons.length > 0, hideReasons, flags };
}

// flags.js:50 (HIDE_LABELS)
export const HIDE_LABELS = { 'wrong-type': 'Not a house/bungalow', auction: 'Auction', 'over-55': 'Over-55 / retirement' };
```

**Outputs & effects:**  
`{ hide: boolean, hideReasons: string[], flags: {key, label}[] }`.  
- Hides: removed from visible feed (behind "Show hidden" toggle).
- Flags: always visible, shown as `.listing-tag--flag` chips.

**Edge cases:**  
- AGE_PHRASE matched but AGE_NEGATION also matched → no hide (conservative).
- Both hideReason AND flag (e.g., new-build auction) → hide wins, flag shown separately.
- Raw JSON has newHome=true even if text doesn't match NEW_BUILD regex → flag applied.

**Rationale:**  
Auction and over-55 have no Rightmove source filter; wrong type has one but it leaks. Post-fetch hiding saves review effort. Guard phrases (AGE_NEGATION) prevent false positives. Flags are always shown because they're useful context even for rejected homes.

**Invariants & acceptance criteria:**  
- classifyListing() deterministic, pure.
- hideReasons ∈ {wrong-type, auction, over-55}.
- flags[].key ∈ {new-build, needs-work, cash-only, investment}.
- AGE_NEGATION prevents hide when "no age restriction" is present.
- AUCTION matches common phrases (modern auction, under the hammer, etc.).

**Card & dossier style:**  
Linear-dense: flag chips always shown; hide chips only with toggle.

---

#### Manual rating & fit-score boost

**Name & purpose:**  
1–10 priority rating on saved listings. Applied as a positive-only boost to the fit score (no penalties). Stored on shortlist row; feeds the listing-fit scoring via ratingMax contribution.

**Trigger & entry:**  
`buildRatingControl({ value, onChange })` (rating-ui.js:14–26, <select> 1–10).

**Inputs & preconditions:**  
- Current rating value (1–10, null/undefined = unrated).

**Exact rule — quoted from file:line:**  
```javascript
// rating-ui.js:14–26 (buildRatingControl)
export function buildRatingControl({ value = null, onChange } = {}) {
  const cur = Number(value);
  const sel = el('select', { class: 'listing-rating', 'aria-label': 'Your priority rating, 1 to 10 (10 = highest)' }, [
    el('option', { value: '', selected: !(cur >= 1) }, 'Rate 1–10'),
    ...Array.from({ length: 10 }, (_, i) => i + 1).map((n) =>
      el('option', { value: String(n), selected: cur === n }, String(n))),
  ]);
  sel.addEventListener('change', () => onChange?.(sel.value === '' ? null : Number(sel.value)));
  return el('label', { class: 'listing-rating-wrap' }, [
    el('span', { class: 'listing-rating__label' }, 'Priority'),
    sel,
  ]);
}

// fit.js:159–164 (fit-score contribution, exact)
const r = Number(rating);
if (Number.isFinite(r) && r >= 1) {
  const clamped = Math.min(10, r);
  const delta = Math.max(0, W.ratingMax * (clamped - 1) / 9);  // ratingMax = 0.20
  if (delta) add('rating', `You rated this ${Math.round(clamped)}/10`, delta);
}

// intelligence-constants.js:66 (ratingMax, exact)
ratingMax: 0.20,
```

**Outputs & effects:**  
- Rating saved to shortlist row via `setListingRating(listing_id, rating)`.
- Fit score boosted by [0, 0.20] (linear, 1→0, 10→0.20).
- Applied positive-only (never a penalty).

**Edge cases:**  
- rating=null/undefined → no boost (no "neutral" or "low priority" penalty).
- rating<1 → treated as null (no boost).
- rating>10 → clamped to 10 (ratingMax contribution).

**Rationale:**  
Rating nudges fit score for homes the user explicitly prioritised (e.g., "this one's my favourite"). Positive-only prevents strategic under-rating. Kept ≤ strongest positive (affordabilityComfortable=0.25) to preserve fit-score weight hierarchy.

**Invariants & acceptance criteria:**  
- Rating contribution always ≥ 0.
- ratingMax=0.20 (fixed).
- rating=10 → delta ≈ 0.20 (full boost).
- rating=1 → delta=0 (no boost).

**Card & dossier style:**  
Linear-dense: <select> "Rate 1–10" on saved card + dossier (compact, keyboard-accessible).

---

#### Search, sort & filter (controls)

**Name & purpose:**  
Listings feed + saved view search/sort/filter. Multi-token AND search across address/postcode/title/type/area. Sort by fit/recent/price/beds/type/rating. Filter by type/beds (minimum)/status (live/withdrawn/etc.).

**Trigger & entry:**  
`createListingsControls(root, listings, opts)` (controls.js, wires a controls bar to the feed).

**Inputs & preconditions:**  
- `listings`: array of live rows.
- `state`: { search, sort, type, beds, status }.
- Accessors: `scoreOf(listing)` (fit score 0–1), `ratingOf(listing)` (1–10), `areaNameOf(listing)` (matched area name).

**Exact rule — quoted from file:line:**  
```javascript
// controls.js:49–64 (filterListings, exact)
export function filterListings(listings, state = {}, { areaNameOf } = {}) {
  const q = norm(state.search).trim();
  const tokens = q ? q.split(/\s+/) : [];
  const minBeds = state.beds && state.beds !== 'all' ? parseInt(state.beds, 10) : 0;
  return (listings || []).filter((l) => {
    if (state.type && state.type !== 'all' && norm(l.property_type) !== norm(state.type)) return false;
    if (minBeds && !(Number(l.beds) >= minBeds)) return false;
    if (state.status && state.status !== 'all' && norm(l.status) !== norm(state.status)) return false;
    if (!tokens.length) return true;
    const hay = [
      l.address, l.postcode, l.outcode, l.title, l.property_type,
      areaNameOf ? areaNameOf(l) : '',
    ].map(norm).join(' ');
    return tokens.every((t) => hay.includes(t));  // AND over tokens
  });
}

// controls.js:20–28 (LISTING_SORTS, exact)
export const LISTING_SORTS = [
  { key: 'fit',        label: 'Best fit' },
  { key: 'recent',     label: 'Most recent' },
  { key: 'price-asc',  label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'beds',       label: 'Most bedrooms' },
  { key: 'type',       label: 'House type' },
  { key: 'rating',     label: 'Your rating' },
];

// controls.js:37–39 (DEFAULT_CONTROLS_STATE)
export const DEFAULT_CONTROLS_STATE = {
  search: '', sort: 'fit', type: 'all', beds: 'all', status: 'all',
};
```

**Outputs & effects:**  
- `filterListings()` → filtered array (AND over search tokens, AND over facet state).
- `sortListings()` → sorted array (per state.sort, recency tiebreak).

**Edge cases:**  
- beds='3' → keeps ≥3 bed homes (minimum, not exact).
- type='Semi-Detached' exact match case-insensitive.
- status='withdrawn' → only withdrawn listings.
- Search tokens: "SP6 Fordingbridge" → address contains both (AND).

**Rationale:**  
Multi-token AND allows precise searches (e.g., "Fordingbridge detached 4-bed"). Sort by fit reranks without changing filters. URL state preserves controls across reloads.

**Invariants & acceptance criteria:**  
- filterListings([], state) → [] (empty in, empty out).
- sortListings() preserves all items (no deletion).
- Recency tiebreak ensures stable sort (same input → same order).

**Card & dossier style:**  
Linear-dense: controls bar (search, sort select, type/beds/status selects, clear button).

---

### Coupling & dependencies

#### Input dependencies:
- **Refinement rules** (refinement/view.js, refinement/scope.js): hidden-by-refinement gates in feed partition + listing flags.
- **Learned preferences** (learned-preferences.js): `effectiveWeights()`, `listingLearnedPrefs()` (soft signals in fit-score).
- **Affordability** (affordability.js): single source of affordability assessment (hard gate + soft signal).
- **Criteria & finances** (storage.js via page coordinators): budget window, size (beds), property-type prefs, EPC min.
- **Areas** (data/areas.json materialized files): matched area record (council-tax band, location context) via `getHouseholdAreas()`.
- **Storage (§16 guard-rail):** `storage/listings.js` — `getListings()`, `getReactionLog()`, `saveListingReaction()`, `getListingRatings()`, `setListingRating()`, `getShortlistStatuses()`, `setShortlistStatus()`, `requestListingsFetch()`.

#### Output dependencies:
- **Learning loop:** reactions log feeds learned-preferences computation (elsewhere).
- **Outreach module:** (separate concern, intentionally NOT joined on property dossier per design).

#### Cross-boundary imports (Node + browser):
- **classify.js:** imported by tools/fetch-listings.mjs, tools/import-apify-runs.mjs, tools/listings-normalise.mjs for `passesBaseline()` + `propertyFingerprint()`.
- **listings-normalise.mjs:** called by fetch.mjs + import-apify-runs.mjs to normalize raw Apify output.

---

### Test coverage & behaviours new tests must pin

#### Existing test inventory:

| Test file | Coverage |
|-----------|----------|
| `tests/listing-fit.test.js` | scoreListingFit(): hard gates, soft signals, affordability seam, learned-prefs seam, 5-band verdicts, contributions array |
| `tests/listings-classify.test.js` | propertyTypeClass(), isAllowedPropertyType(), passesBaseline(), propertyFingerprint(), EXCLUDED_TYPE_RE, ALLOWED_TYPE_RE |
| `tests/listings-feed-partition.test.js` | partitionFeed(): radius, gates, dedupe, search/sort, reviewed split, counts, junk hide, refinement hide, decided suppression |
| `tests/listings-suppress.test.js` | decidedSets(), isDecided(), dedupeByFingerprint(), dedupeNewestByFingerprint(), foldDecision() in-place mutation |
| `tests/listing-reactions.test.js` | REACTIONS vocab, REJECT_REASONS, REJECT_SUBREASONS, reason-key validation, normaliseReaction(), latestPerListing() reduction, GRADED_REACTIONS |
| `tests/listings-picker-state.test.js` | emptyDraft(), applyVerb(), togglePrimary(), toggleSub(), reasonsArray(), isDirty() |
| `tests/listings-controls.test.js` | filterListings() (multi-token AND, facet filtering), sortListings() (fit/recent/price/beds/type/rating, recency tiebreak) |
| `tests/listings-format.test.js` | fmtPrice(), fmtAgo(), fmtDate(), lastPriceDrop() |
| `tests/listings-labels.test.js` | VERDICT_LABELS, STATUS_LABELS, PERSONAL_STATUS_LABELS, HIDE_LABELS dicts |
| `tests/listing-flags.test.js` | classifyListing(): AUCTION, RETIREMENT_BRAND, AGE_PHRASE, AGE_NEGATION logic, NEW_BUILD, CONDITION red-flags |
| `tests/listing-detail.test.js` | galleryImages(), floorplanImages(), priceHistorySeries(), netPriceChange() |
| `tests/reaction-provenance.test.js` | isTraining(), isNonTrainingReaction(), isUnattributedReject() (learning gates), NON_TRAINING_REASON_KEYS |
| `tests/listings-normalise.test.js` | normaliseRawListing(), isInOutcode(), withinGeofence(), haversineKm(), mergePriceHistory() |
| `tests/listings-fetch.test.js` | isValidWindow(), windowLabel(), confirmFetch() helpers |

#### Behaviours new tests MUST pin (priority order):

1. **Fit-score determinism:** Given fixed weights + same listing/finances/criteria inputs, score must be identical across runs. Test with and without learnedPrefs.
2. **Partition correctness:** Feed partition must satisfy: gatedCount + hiddenJunkCount + hiddenRefCount + decidedCount + dupCount + hiddenByFilter + visible.length = all.length (no orphans, no double-counts).
3. **Reaction-to-suppression integration:** Save a like/reject reaction; feed re-partitions; that property must appear in Saved/Rejected + vanish from Browse feed. Cross-page consistency.
4. **Dossier DOM render:** Property page must render gallery, facts grid, price history, floor plan, description, reactions picker, rating select without errors. Lazy-load images.
5. **Fingerprint deduplication:** Same property re-listed under new rightmove_id; feed shows only newest (added_date wins). Fingerprint-less items (too-coarse address) always kept separate.
6. **Controls stability:** Filter/sort state persists in URL; reload page, same state restored. Multi-token search AND is correct.
7. **Fetch pipeline integration:** Fetch → normalise → dedupe → UPSERT → getListings() must retrieve the rows, score deterministically, partition without orphans.
8. **Reaction log consistency:** Append-only, no deletes. latestPerListing() reduction is deterministic. Saved page + Rejected page derive correctly from log.
9. **Property-type allow-list:** Semi-Detached and Semi-Detached House fingerprint identically. Coach House never matches "House" alone. Flat always excluded.
10. **AGE_NEGATION guard:** "Over 55 but no age restriction" does NOT hide. "Over 55+ community" DOES hide (no negation).

---

### Known smells / tech debt / risks

1. **Feed partition complexity:** `partitionFeed()` is a 100-line pure function with 10+ parameter callbacks. Correct but dense; a state-machine or builder pattern might clarify the stacked gates (radius → score → affordability → junk → refinement → decided → dedupe → controls → reviewed split).

2. **Fit-scoring opacity:** The "why" is built post-facto from contributions[]. A score of 0.65 lands in "possible", but there's no explicit *intent* map (e.g., "strong = very likely to like, possible = worth reviewing, stretch = edge case"). FIT_BANDS constants are present but may not reflect user intent.

3. **Reaction provenance dual-field legacy:** The distinction between `reaction`, `reason` (scalar, reject-only, historical), and `reasons` (array, current) is layered historically. Stored dual-written for back-compat, but confusing to reason about. Migration path exists (§9).

4. **Dossier density (Stripe-docs anchor):** Facts grid, price history, floor plan, and full description stacked vertically. Mobile scrolling long. Collapsible sections or summary-detail pattern might help without breaking the anchor.

5. **Fingerprint false positives:** Deliberately conservative (need street + town). Edge case: "The High Street, Fordingbridge" vs "Another High Street, Fordingbridge" collide. Real but rare; acceptable trade-off.

6. **Price history UX:** 20+ price moves → list grows visually heavy. No truncation or chart view; purely list-based.

7. **Learned preferences seam untested:** L4 is not yet in repo, but scaffolding (learnedPrefs param, effectiveWeights lookup) is wired into fit.js. Handoff is clear but no live integration tests.

8. **A11y of verdict dots & chips:** Fit-dot (colored circle) carries color-only signal until text label arrives. Tests exist but may not catch all edge cases (WCAG 2.2 AA contrast check needed).

9. **Gallery image loading:** No lazy-load strategy; all images (or at least a few) load eager on hero. Responsive srcset missing; images not optimized for aspect ratio (3/2 hero).

10. **Feed performance with many listings:** No virtual scrolling or lazy-render. 500+ unreviewed listings → DOM churn on every partition/sort/filter. Pagination or infinite-scroll not implemented.

11. **CSS cascade order-sensitivity:** listings.css imports 4 partials in cascade order (controls → cards → states → widgets). Moved partials or out-of-order rules cause specificity bugs, hard to spot. No Sass variables or computed order.

12. **Suppress.js API fragmentation:** `decidedSets()`, `isDecided()`, `dedupeByFingerprint()`, `dedupeNewestByFingerprint()`, and `foldDecision()` have different input/output shapes. Unifying to a single class or builder might reduce confusion.

13. **Reject reason sub-reasons explosion:** REJECT_SUBREASONS has 8 parents with variable-length sub-arrays. Adding a new reason requires coordinating two places (REJECT_REASONS + REJECT_SUBREASONS). A single data structure might be cleaner.

---

### Refactor opportunities (Fable to sequence)

1. **Unify feed-partition & suppress.js:** Merge `decidedSets()`, `isDecided()`, `foldDecision()`, `dedupeByFingerprint()`, into a single, documented suppression engine with clear state shape. Define a single `SuppressionSet` class.

2. **Clarify fit-scoring intent:** Add explicit `FIT_BAND_INTENT` map (e.g., "strong" = "very likely to like", "possible" = "worth reviewing", "stretch" = "edge case", "weak" = "unlikely"). Add `whySummary()` helper distilling top 2–3 contributions for card preview.

3. **Unify dual-written reaction fields:** Migrate all existing rows to `reasons` array shape, remove scalar `reason` field (or keep as computed read-only alias). Clarify "unattributed reject" logic at write time (validate normaliseReaction), not read time.

4. **Extract controls state management:** `createListingsControls()` manages search/sort/filter + URL state inline. Extract a pure `reduceControlsState()` reducer and separate DOM wiring, enabling state-logic tests without DOM.

5. **Lazy-load gallery images:** Add responsive srcset, lazy-load thumbnails, preload main image only. Consider lightbox-specific image-loading strategy.

6. **Pagination or virtual-scroll:** Implement 50-per-page pagination for feed (matching rejected page), or add virtual-scroll library for 1000+ rows without DOM overhead.

7. **Dossier collapsible sections:** Wrap Price History, Floor Plan, Description in <details> or custom collapsible, so rail stays compact on mobile.

8. **A11y audit of cards:** Ensure fit-dot + verdict contrast (WCAG 2.2 AA), add `aria-label` to dot ("strong fit", etc.).

9. **CSS refactor to data-attributes:** Replace `.listing-react__btn--like` class toggles with `data-reaction="like"` + CSS attribute selectors, reducing specificity footprint.

10. **Suppress.js test coverage:** Add tests for `foldDecision()` in-place mutation; document the contract so future changes don't silently break suppression semantics.

---

### Suggested sub-phases (draft)

**Phase A: Partition & suppress unification (1–2 days)**
- Merge suppress.js + feed-partition.js into a single `feedEngine.js` with documented state shape.
- Update page-listings.js to use the new API.
- Add tests for unified engine.

**Phase B: Fit-scoring clarity (1 day)**
- Add `FIT_BAND_INTENT` map + `whySummary()` helper.
- Add `fitExplainerCard()` component to dossier (shows top contributions).
- Audit affordability hard-gate logic.

**Phase C: Reaction schema simplification (2–3 days)**
- Backfill: migrate all old `reason` scalar → new `reasons` array.
- Remove scalar field from schema + code.
- Clarify unattributed-reject detection at write time.

**Phase D: Controls state extraction (1–2 days)**
- Extract `reduceControlsState()` pure reducer.
- Build unit tests for state logic (no DOM).
- Wire new reducer into page-listings.js + page-saved-listings.js.

**Phase E: Performance improvements (2–3 days)**
- Add pagination (50-per-page) to feed OR implement virtual-scroll.
- Lazy-load gallery images + responsive srcset.
- Benchmark before & after.

**Phase F: A11y & CSS cleanup (1–2 days)**
- Audit fit-dot color contrast; add `aria-label` if needed.
- Refactor card class toggles to data-attributes.
- Run responsive lint + a11y scan.

---

### Tailored Q&A for the owner

1. **Fit signals vs. intent:** When you see "strong fit", are you expecting a home that meets *all* your stated criteria (type, size, price, area), or one that *feels right* (algorithm is just a guide)? How much should learned preferences (from past reactions) nudge the score vs. your explicit criteria?

2. **Reaction workflow:** Do you find yourself bulk-triaging a bunch of listings (quick pass/reject without reasons), then coming back to detail on the saved ones later? Or do you prefer to decide with reasons in one go? Should the reaction picker be simpler for the feed (just verb, no reasons) and richer on the dossier (full reason picker)?

3. **Dossier depth:** On the property page, what's the *first* thing you look at after the photos? (title + price, key facts, price history, description, map location, or the full fit verdict breakdown?) Are there facts we're omitting that you'd want to see?

4. **Saved vs. Rejected:** Do you ever move a property from Saved back to Active (i.e., "actually, I liked this one after all")? Should the Saved page allow unsaving, or is it a one-way commitment? Same question for Rejected: can you un-reject?

5. **Learning loop:** When learned preferences eventually arrive (L4), would you want to see which reasons/signals are actively shaping your feed (e.g., "we've learned you prefer quiet areas — showing 3 extra listings"), or is a silent re-ranking preference?

6. **Duplicate handling:** Right now, a re-listed property is shown once (deduped by fingerprint). Do you ever want to see *both* listings side-by-side if the price/agent changed significantly? Or is deduping always right?

7. **"Show out of reach" / "Show hidden" toggles:** How often do you flip these on? Should they be prominent controls, or is a collapsible/advanced panel better?

8. **Rating persistence:** The 1–10 priority rating on saved homes — how many homes do you typically rate? Should the rating affect sorting on the Saved page (highest first)?

---

**Notes for Fable:**
- All 17 modules in `assets/js/listings/` are pure (no DOM, no network, no storage directly) — highly testable and safe to refactor.
- The page coordinators (page-{listings,property,saved-listings,rejected}.js) are thin (~100–300 lines each), primarily orchestrating: load → compute → render.
- The fetcher (tools/fetch-listings.mjs) is standalone, runs on GitHub Actions (service-role), and is the source of truth for data freshness.
- The CSS is split into modular partials but relies on a single Pico CSS base; be careful not to break the cascade or reintroduce hard-coded colors/spacing.
- **Guard rails (§16):** Never rewrite `storage/listings.js`. The listings table is system-managed (fetcher-written only); EXTEND storage.js, never replace it.
## 10.5 Segment: Areas & map

**Design anchor(s):** Linear-dense (areas.html list + map), Stripe-docs (area-detail.html)  
**Guard-rail surface (§16):** `data/schema/area.schema.json` (immutable shape); `assets/js/storage.js` (Supabase-backed storage layer); `assets/js/finances.js` (affordability verdicts); `assets/css/dashboard.css` + `assets/css/tokens.css` (colour + spacing tokens)

---

### File Inventory

| File | Purpose & Canonical Status |
|------|---------|
| `pages/areas.html` | **Interactive directory & map (Linear-dense).** Mobile-first modal filter sheet (desktop: card sidebar). Search box (name, town, postcode, subregion). County + sub-region dropdowns (cascaded). Fit verdict filter (comfortable→out-of-reach). Shortlist toggle. Search-radius slider (persisted to criteria.location.searchRadiusMi). Responsive area-row grid with fit-dot, matched price, council-tax-band, star button. Embedded Leaflet map (toggle geofence visibility, fullscreen). No separate map.html; map is part of areas.html. |
| `pages/area-detail.html` | **Single-area dossier (Stripe-docs).** 9 sections: overview + character (prose), amenities (list), schools (mini-list with Ofsted dots), transport (commutes: destination/time/mode/band-class), prices (type breakdowns), things-to-do (list), places-to-eat (list), pros & cons (two-column), who-it-suits (prose or list). Sidebar TOC (sticky desktop). Essentials stat-strip (council-tax, broadband, nearest-station, supermarket). Images gallery (lazy-load). Sources (citations). **Affordability verdict strip** (matched-price + fit-dot + monthly P&I + outreach button). **Interactive footer calculator** (price slider 100k–2M, live P&I + LTV% + verdict). |
| `pages/map.html` | Currently unused; areas.html embeds the map fullscreen. Legacy placeholder; remove or fold into areas.html migration. |
| `assets/js/page-areas.js` | **Areas directory state machine.** Loads areas catalog + household-added stubs (via `getHouseholdAreas()`). URL↔state sync (shareable filter links via URLSearchParams). Filter pipeline: search (multi-field regex), county/subRegion cascaded dropdowns, fit verdict (computed per-area), shortlist toggle, search-radius persistence. **Matched-price lookup** (lines 74–94: property-type preference → avgDetached/avgSemi/avgTerraced/avgFlat from area.priceSummary → fall back to cheapest available). Sorting (name, town, postcode, status, fit, price, council-tax-band). Render: `renderCards()` generates flex area-row per entry (index + fit-dot + name + town/postcode + matched-price + council-tax-band + star). View transition name on detail link for morphing animation. |
| `assets/js/page-area-detail.js` | **Single-area renderer by `?id=`.** Fallback chain: per-area detail file → catalog index row → household-added stub (from `getHouseholdAreas()`). Renders 9 sections with conditionals; PLACEHOLDER text for empty sections (defined at line 8, applied by `listOrPlaceholder()`/`textOrPlaceholder()`). **Matched-price lookup** (lines 172–188: **DUPLICATED from page-areas.js**; property-type preference → priceSummary/prices → cheapest fallback). Renders affordability verdict strip (line 190): matched-price + fit-dot + monthly P&I. Interactive footer calculator via `attachFootAfford()`. |
| `assets/js/page-map.js` | **Leaflet map (CartoDB Positron/Dark tiles, theme-aware).** Leaflet@1.9 + Leaflet-Geoman (draw/edit/delete tools). **Geofence layer** (lines 214–236): draws circles for all `isLiveArea()` areas (curated active=true, or household-located stubs pass `isFetchEligible()`). Per-area radius: native geofenceRadiusMi (default 3 mi) or user's searchRadiusMi display override or per-area areaRadiusOverrides. Colour-keyed by fit verdict (green/orange/red/grey); lighter tint if shortlisted. **Markers** (line 270–302): cluster feature group with fit-dot popup + council-tax band + "Approximate coords" note for postcode-outward-approx. Geofence toggle (line 332): show/hide underlay geofences (default on). Fullscreen API button (top-right). Drawn zones persisted to localStorage (Geoman GeoJSON). Map summary tiles: areas in directory, mapped (with coords), drawn zones. Fits bounds to geofences or markers on load. |
| `assets/js/areas/area-match.js` | **Pure matching library (unit-testable, no DOM/Supabase).** `slugifyArea(name, county)` → stub id (name-county, slugified, pattern ^[a-z0-9-]+$). `haversineKm(a, b)` → great-circle distance (Earth radius 6371 km, handles null coords). `postcodeDistrict(pc)` → outcode (SO24, RG23) for Rightmove search key. **`matchCatalogArea(place, catalog, {maxKm=1.5})`** (lines 43–66): decides link-or-create on place-lookup. Name match (normalized) required. County match (normalized); if both known and disagree → no match. Distance ≤ 1.5 km (haversine) OR postcode-district match → candidate. Closest qualifying candidate wins (prevent cross-link of like-named villages). Returns matched area or null. |
| `assets/js/areas/area-enrich.js` | **Pure enrichment patch builder (unit-testable).** `enrichPatch(candidate, pcRecord)` (lines 56–88): builds additive field patch for household-added stub. Coords: prefer candidate.lat/lng; fall back to pcRecord.latitude/longitude. Postcode, county, town selection with fallback chain. **County-contradiction test** (lines 30–35): fires ONLY when candidate.county + pcRecord.admin_county clearly disagree (neither substring); conservative (absent admin_county → trust user, no false flag). Sets coordsSource flag: 'postcodes-io:county-mismatch' (soft block) or 'postcodes-io:places+reverse' or 'postcodes-io:postcode' or 'postcodes-io-provisional' (no record → soft-fail, not fetch-eligible yet). geofenceRadiusMi, searchRadiusMi hardcoded 3 (resolved-areas default). **`isFetchEligible(area)`** (lines 96–103): shared predicate (dashboard + fetcher). Has coords (lat/lng non-null). Postcode derives outcode (via `postcodeDistrict()`). No county-mismatch flag in coordsSource. |
| `assets/js/areas/area-ref.js` | **Area classifier.** `isLiveArea(a)` → boolean (fetch-eligible for geofence catchment + listings). Used by page-map.js (geofence layer inclusion), page-areas.js (fit verdict computation), dashboard (Live vs Researching badge). |
| `assets/js/areas/place-lookup.js` | **Phase 2 onboarding (not deeply scanned).** Postcodes.io place search + matchCatalogArea decision + enrichPatch → stub creation in Supabase user-state. |
| `assets/css/pages/areas.css` | **Filter bar styling (responsive grid).** Filter-sheet layout (inline card desktop / modal mobile). Search row. Disclosure toggle + result summary. Tap-target spacing (≥44×44). Token-based colour + spacing. |
| `assets/css/pages/areas-rows.css` | **Area-row grid component.** Flex row: index + fit-dot + name (with badge-status) + town/county/postcode + matched-price + council-tax-band + star button. Hover states. View transition name on detail link (morphing animation). Responsive stack on mobile. |
| `assets/css/pages/area-detail.css` | **Detail page layout.** Two-column on desktop (sidebar TOC left, article right); single-column mobile. Verdict strip (colour-keyed by fit). Essentials stat-strip. Mini-list components. Ofsted + commute-band dots. Prose text with images gallery. Sources section. Interactive footer calculator. Responsive font + spacing. |
| `assets/css/pages/map.css` | **Map container & geofence styling.** Leaflet container full-bleed in card. Geofence circle styling (fit-colour with opacity, lighter if shortlisted). Geoman toolbar (draw/edit/delete buttons). Fullscreen button (top-right). Status line summary. |
| `tools/build-areas.mjs` | **Materialisation rebuild step 1 (repos→files, run SECOND).** Reads source CSVs: `data/source/villages.csv` (county, town, village, postcode; 192 base entries) + `postcode-regions.csv` (postcode → city, region, type, lat, lng fallback). Merges with **prior** per-area detail files (preserves enriched content across rebuilds: overview, character, amenities, schools, transport, prices, images, sources). **Price-summary baking** (lines 71–77): extracts avgDetached/avgSemi/avgTerraced/avgFlat into lightweight `priceSummary` sub-object shipped in INDEX for areas.html to compute fit verdicts without loading every per-area file. **Fallback coords jitter** (lines 37–41): deterministic jitter ±0.02° seeded by area id + salt, so 192 areas don't pile on postcode-region centroid. **Generates** `data/areas.json` (INDEX_FIELDS only — ~30 KB, shipped to client). **Generates per-area** `data/areas/<id>.json` (DETAIL_FIELDS — up to 6 KB each, lazy-loaded on detail page). Preserves rightmove, geofenceRadiusMi, searchRadiusMi, active from prior per-area files (written by resolve-areas.mjs). **Regenerates** `docs/AREAS.md` (human-readable county→town breakdown; auto-generated, not hand-editable). Log: writes index + number of changed per-area files + coord stats. |
| `tools/sync-areas-from-supabase.mjs` | **Materialisation step 0 (DB→repo, run FIRST).** Fetches all areas rows (id + data jsonb) from Supabase DB (REST API with service-role key, or from MCP-dumped file in dev). Projects each through `canonicalRecord()` (lines 52–97) to match build-areas expected shape (defaults + nested-field normalization). **Writes per-area files only on semantic value change** (order-insensitive deep-equality, line 135–149: `canonEqual()`; Postgres jsonb does not preserve key order). **Prune mode** (with `--prune`): removes per-area files whose id no longer exists in DB (cleanup after id migrations). **Filters out household-onboarding stubs** (line 182: `source='household-onboarding'`) — runtime-only rows, never materialised to repo. **Writes parity snapshot** `data/snapshots/areas.json` — compact rows {id, name, postcode, coords, coordsSource, active} for offline regression testing (tests/areas-db-repo-parity.test.js). **Two read modes:** file (--from-file <dump.json>; dump via MCP execute_sql), REST (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars). **Flags:** --prune, --no-prune (default), --dry-run. **Output:** summary report (written/unchanged/removed/skipped). **After run:** ALWAYS `node tools/build-areas.mjs` → `node tools/verify-area-coords.mjs --online` → `node tools/run-intelligence-tests.mjs`. |
| `tools/area-fields.mjs` | **Single source of truth: field inventory.** `INDEX_FIELDS` (14 entries shipped in areas.json): id, name, village, town, county, postcode, hubCity, regionDir, settlementType, subRegion, coords, coordsSource, houseTypeIds, status, priceSummary, councilTaxBand, geofenceRadiusMi, searchRadiusMi, active. `DETAIL_FIELDS` (27 entries shipped in per-area files): INDEX_FIELDS + overview, character, amenities, schools, transport, prices, thingsToDo, placesToEat, pros, cons, whoItSuits, broadbandMedianMbps, nearestStation, primarySupermarket, images, sources, rightmove. `CONTENT_FIELDS` (12 entries; completeness scoring): overview, character, amenities, schools, transport.commutes, prices, thingsToDo, placesToEat, pros, cons, whoItSuits, sources. Exports `completeness(area)` → {filled, total, missing[], percent} and `deriveStatus({filled, total})` → status enum. Shared by area-status.mjs, build-areas.mjs, sync-areas-from-supabase.mjs, tests. |
| `tools/area-status.mjs` | **Session-start report.** Prints summary of curated areas by status (researched/partial/drafted/stub/directory). Per-county breakdown. Flags missing CONTENT_FIELDS per area. Flags: `--missing` (filter to incomplete), `--json` (JSON export for tooling), `--id <id>` (inspect one area). Canonical view of research progress + next-to-do queue. |
| `tools/geocode-areas.mjs` | **Coordinate assignment (not fully scanned).** Likely populates coords + coordsSource for stub areas via web-search or postcode-outward approximation. Marks coordsSource = 'web-verified:…' or 'postcode-outward-approx'. (UNCONFIRMED; scanner limitation §5.) |
| `tools/verify-area-coords.mjs` | **Coordinate validation (not fully scanned).** Post-sync validation; `--online` flag (requests geofences from Rightmove API?). Likely checks coord bounds (GB ±50.5°–55.5°?), detects zero-coords, validates coordsSource enum. (UNCONFIRMED.) |
| `tools/resolve-areas.mjs` | **Rightmove integration (not fully scanned).** Populates rightmove.locationIdentifier + identifierType (POSTCODE/REGION/OUTCODE/STATION) + identifierQuality (tight/coarse) + resolvedAt. Also writes geofenceRadiusMi, searchRadiusMi, active flags. Enables tight matching for listings fetch. (UNCONFIRMED.) |
| `data/areas.json` | **Generated; lightweight index (INDEX_FIELDS).** Shipped to client for areas-list + map. ~192 entries, ~30 KB. Regenerated by build-areas.mjs. Contains priceSummary sub-object (baked from prices during build) so areas.html can compute fit verdicts without loading 192 per-area files. |
| `data/areas/<id>.json` | **Per-area detail files (DETAIL_FIELDS).** ~192 files, one per curated area. Materialised from Supabase DB by sync-areas-from-supabase.mjs (step 0), then rebuilt with content preservation by build-areas.mjs (step 1). Lazy-loaded on area-detail.html. Up to 6 KB each. |
| `data/snapshots/areas.json` | **Parity snapshot written by sync-areas-from-supabase.** Compact rows {id, name, postcode, coords, coordsSource, active}. Guards against drift via tests/areas-db-repo-parity.test.js. Offline regression test (no DB connection needed). High-water mark for coordinate truth. Updated on every sync run; commit whenever changed. |
| `data/source/villages.csv` | **Master village list.** Header: county, town, village, postcode. 192 base entries. Used by build-areas.mjs to generate area ids (slug(village)-slug(postcode)) and index. **Regenerated on area id/postcode migrations** (§CLAUDE.md §2). Not hand-edited for new areas; instead edit the Supabase areas table via MCP, then sync-areas-from-supabase to materialise. |
| `data/source/postcode-regions.csv` | **Postcode-level fallback coordinates.** Header: postcode, city, region, type, lat, lng. Used by build-areas.mjs for fallback coords (when area.coords is unset, jitter + assign postcode-region centroid). ~130 UK outcode entries. Only updated if new postcode sectors are discovered. |
| `data/schema/area.schema.json` | **GUARD-RAILED (§16).** Canonical shape: required [id, name, town, county, postcode, status]. Optional [village, hubCity, regionDir, settlementType, subRegion, coords, coordsSource, houseTypeIds, overview, character, amenities, schools, transport, prices, thingsToDo, placesToEat, pros, cons, whoItSuits, councilTaxBand, broadbandMedianMbps, nearestStation, primarySupermarket, images, sources, rightmove, geofenceRadiusMi, searchRadiusMi, active, verified]. **coords** shape: null or {lat, lng} (numbers, no bounds checking). **status** enum: directory → stub → drafted → partial → researched. **source** enum: curated, household-onboarding. **rightmove** object: locationIdentifier (string), identifierType (POSTCODE/REGION/OUTCODE/STATION), identifierQuality (tight/coarse), resolvedAt (ISO string). Images/sources allow mixed string/object items (flexible but less strict typing). **REDESIGNABLE under §4.4 (foundational):** schema changes ripple through DB + materialise pipeline + parity test. Sequence schema changes as a separate migration phase. |
| `docs/AREAS.md` | **Auto-generated by build-areas.mjs; human-readable status table (county → town → village rows).** Regenerated on every build; do not hand-edit. Lists all ~192 areas, status, id. Canonical source for humans; repo files are authoritative for machines. |
| `tests/areas-db-repo-parity.test.js` | **Phase-2 lock-in: offline parity guard.** Tests that every per-area file {id, coords, coordsSource, postcode, active} matches the snapshot (data/snapshots/areas.json) on those four coordinate-truth fields. Filters out household-onboarding stubs (source='household-onboarding') from comparison (line 50: `isOnboardingStub` predicate). Fails if a file is hand-edited without going through sync-areas-from-supabase. Runs in Node harness (no DB connection). Wired into tools/run-intelligence-tests.mjs. |
| `tests/area-match.test.js` | **Unit tests for pure matching.** `matchCatalogArea()` name/county/distance logic; `slugifyArea()` id normalization; haversine calculation. Assumed to exist (not fully scanned). |
| `tests/area-enrich.test.js` | **Unit tests for pure enrichment.** `enrichPatch()` (coords selection, county contradiction, town derivation); `isFetchEligible()` predicate. Assumed to exist (not fully scanned). |
| `tests/area-ref.test.js` | **Area classifier tests.** `isLiveArea()` (fetch-eligible) vs "Researching" badge. Assumed to exist (not fully scanned). |
| `tests/areas-index-sync.test.js` | **Index consistency.** Assumed to exist (not fully scanned). |
| `tests/resolve-areas.test.js` | **Rightmove + geofence assignment.** Assumed to exist (not fully scanned). |
| `tests/verify-area-coords.test.js` | **Coordinate validation post-sync.** Assumed to exist (not fully scanned). |

---

### Data Flows

#### The Materialisation Pipeline (DB-Canonical, CLAUDE.md §18.5)

**Core principle:** Supabase `areas` table is the source of truth (owner decision 2026-06-04). Repo materialised view at `data/areas/<id>.json` + `data/areas.json` is regenerated by a **two-step pipeline** (run in order):

1. **`sync-areas-from-supabase.mjs` (Step 0 — DB→repo, takes 5–10 s)**
   - **Trigger:** After any DB-side edit (MCP execute_sql area property update, id/postcode migration, active flag toggle).
   - **Read modes:**
     - **File mode (dev):** `node tools/sync-areas-from-supabase.mjs --from-file /tmp/areas-dump.json --prune` (pass MCP `execute_sql` dump: `SELECT id, data FROM areas ORDER BY id;`).
     - **REST mode (CI/remote):** `SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY` env vars → PostgREST paginated fetch (1000 rows/page).
   - **Processes:**
     - Fetches all areas rows (id + data jsonb).
     - **Filters out household-onboarding stubs** (line 182: `source='household-onboarding'`, `active=false`) — runtime-only rows, never materialised to repo.
     - Projects each through `canonicalRecord()` (lines 52–97) to match build-areas' expected field order + defaults (mirrors tools/build-areas.mjs line 20 `pick()` contract).
     - **Writes per-area files only on semantic value change** (line 135–149, `canonEqual()`): order-insensitive deep equality (Postgres jsonb doesn't preserve key order; older files omit null optionals → treated as equal to freshly-projected rows spilling them out).
     - **Prune mode** (with `--prune` flag, line 204–211): removes any per-area file whose id no longer exists in DB (cleanup after id/postcode migrations).
     - **Writes parity snapshot** `data/snapshots/areas.json` (line 213–218): compact rows {id, name, postcode, coords, coordsSource, active} sorted by id. Snapshot is the ground truth for the offline parity test.
   - **Output:** Prints summary: written count, unchanged count, removed count, skipped count (household-onboarding), snapshot written flag.
   - **Idempotent:** Re-running is safe; only writes on change.

2. **`build-areas.mjs` (Step 1 — repos→files, takes ~1 s)**
   - **Trigger:** After sync-areas-from-supabase, or standalone when source CSVs change (villages.csv migration).
   - **Reads:**
     - `data/source/villages.csv` (county, town, village, postcode; 192 base entries for id generation).
     - `data/source/postcode-regions.csv` (postcode → city, region, type, lat, lng; ~130 outcode fallbacks).
     - **Prior per-area detail files** from `data/areas/` (the source of truth for enriched content: overview, character, amenities, schools, transport, prices, images, sources). Preserved across rebuilds.
   - **Processes:**
     - Generates area id: `slug(village)-slug(postcode)`, with collision-avoidance appending -2, -3, etc.
     - **Fallback coords jitter** (lines 37–41): when area.coords is unset, uses postcode-region centroid + deterministic jitter (±0.02° seeded by id + salt). Jitter breaks the pile-on effect but clustering is predictable (diamond pattern around centroid).
     - **Price-summary baking** (lines 71–77): extracts avgDetached, avgSemi, avgTerraced, avgFlat from per-area prices into a lightweight `priceSummary` sub-object. Baked into INDEX so areas.html can compute fit verdicts without loading 192 per-area files.
     - **Generates** `data/areas.json` (line 122): lightweight index (INDEX_FIELDS only). ~30 KB, shipped to client.
     - **Generates per-area files** (line 127): `data/areas/<id>.json` for each area, projected through DETAIL_FIELDS. Only writes if content changed (line 23 `writeJSON()` idempotency). Preserves rightmove, geofenceRadiusMi, searchRadiusMi, active from prior files (written by resolve-areas.mjs).
     - **Regenerates** `docs/AREAS.md` (line 150): human-readable county→town breakdown; auto-generated, not hand-editable.
   - **Output:** Prints summary: index written, number of per-area files changed, per-county distribution, coords stats (how many areas have non-null coords).

**Pipeline sequence (after any DB edit):**
```
mcp execute_sql → update areas set data = ... where id = 'X'
  → node tools/sync-areas-from-supabase.mjs --prune
  → node tools/build-areas.mjs
  → node tools/verify-area-coords.mjs --online
  → node tools/run-intelligence-tests.mjs
  → commit + push
```

**Invariant:** After both steps, `data/areas.json` + all per-area files are byte-identical to a fresh build from the DB (idempotent). If rebuild produces new diffs, it means the DB or source CSVs changed — expected and intentional.

#### Areas List & Filtering (page-areas.js)

1. **Init (on page load):**
   - `getHouseholdAreas()` → fetches merged catalog (from data/areas.json) + household-added stubs (from Supabase user-state `area_confirmations`, enriched via `storage/user-state.js`).
   - `getShortlist()` → bitwise set of starred area ids (persisted via `storage/user-state.js`).
   - `getFinances()` + `getCriteria()` → household finances + property-type preferences.

2. **URL↔state sync (shareable filter links):**
   - Reads `?q=` (search), `?county=`, `?sub=` (subRegion), `?sort=`, `?fit=`, `?starred=` from URL at load.
   - Writes back on every state change (line 47, `history.replaceState()`) so filters are shareable/backable.
   - URL_KEYS map (line 24): state keys ↔ query param names.

3. **Filter pipeline (`applyFilters()`, line 103–129):**
   - **Search** (multi-field, case-insensitive): regex match on [name, village, town, postcode, subRegion] (line 111–112).
   - **County** (line 106): exact match if state.county !== 'all'.
   - **Sub-region** (line 107): exact match if state.subRegion !== 'all' (cascaded dropdown, updated on county change by `updateSubRegions()`).
   - **Fit verdict** (line 109, `verdictFor()`): computed per-area via `assessAffordability(matchedPrice(area, criteria), finances, criteria)`. Filters to matched verdict if state.fit !== 'all'.
   - **Shortlist** (line 108): if state.onlyShortlisted, includes only areas in shortlist set.
   - **Sorting** (lines 118–127): sortFns map implements name, town, postcode, status, fit, price, counciltax order. Fit sorts by VERDICT_ORDER (comfortable→out-of-reach→unknown). Price sorts by matched price (or Infinity if no price).

4. **Matched-price lookup (`matchedPrice()`, lines 74–94):**
   - **Input:** area (with priceSummary), criteria.propertyTypePrefs.preferred.
   - **Mapping:** PROP_TO_KEY dict maps property types (Detached, Bungalow, Semi-detached, Terraced, Flat / Apartment) to avgDetached/avgSemi/avgTerraced/avgFlat keys.
   - **Logic:** Walk preferred types in order; return first type whose price is non-null. If none match, fall back through [avgSemi, avgTerraced, avgDetached, avgFlat] (cheapest-available bias, line 90).
   - **Output:** {price, label} or {price: null, label: null} if no price found.
   - **ISSUE:** **DUPLICATED** in page-area-detail.js lines 172–188 (same PROP_TO_KEY, same fallback logic). Any change to property-type preference handling must be applied to both. Recommend extract to shared pure function (affordability.js or areas/area-enrich.js).

5. **Render (`renderCards()`, lines 131–157):**
   - Generates `<li class="area-row">` for each area (after filtering + sorting).
   - Flex row layout: area-index (padded to 3 digits) + fit-dot (circle, fit-colour) + name + town/county/postcode + matched-price + council-tax-band + star button.
   - Status badge (if status !== 'directory', line 141).
   - Fit-dot title/aria-label: "Affordability fit: <verdict>" (line 144).
   - Matched-price display: "<type> <gbp(price)>" or "—" if no price (line 146).
   - Detail link has view transition name (line 139) for morphing animation.
   - "No areas match" message if filter result is empty (line 134).

#### Area Detail & Affordability (page-area-detail.js)

1. **Load by `?id=` (lines 214–274):**
   - `getAreaCatalog()` → data/areas.json.
   - `getAreaDetail(id)` → per-area detail file `data/areas/<id>.json` (lazy-loaded on detail page).
   - `getHouseholdAreas()` → includes household-added stubs (source=household-onboarding).
   - **Fallback chain:**
     - Try per-area detail file (common case — full researched dossier).
     - Fall back to catalog index row (curated stub with minimal INDEX_FIELDS).
     - Fall back to household-added area (from user-state `area_confirmations`, rendered with "research pending" placeholders).

2. **Render 9 sections (lines 20–154, with conditionals for stub vs researched vs missing):**
   - **Overview + Character** (line 20–24): textOrPlaceholder(overview) + optional character heading/text.
   - **Amenities** (line 26): listOrPlaceholder(amenities).
   - **Schools** (line 37–48): mini-list with Ofsted dots + badge (if rating present). Ofsted class map (line 28–35): outstanding/good/requires/inadequate/unknown → colour class.
   - **Transport** (line 63–75): commutes list (to/destination, time-band-class parsing, mode). Commute-band-class map (line 50–61): ≤30 min → quick, ≤60 min → medium, else long.
   - **Prices** (line 77–99): type breakdowns (avgSold12Mo, avgDetached, avgSemi, avgTerraced, avgBungalow, avgFlat) as definition list. Source + asOf metadata. Summary prose if present.
   - **Things to do, Places to eat** (line 10–12 listOrPlaceholder helper): lists or PLACEHOLDER.
   - **Pros & cons** (line 101–117): two-column layout (grid on desktop). Lists or "—" if empty.
   - **Who it suits** (helper): text or list, or PLACEHOLDER.
   - **Essentials stat-strip** (line 156–170): council-tax-band, broadband (Mbps), nearest-station, primary-supermarket. Rendered in #essentials-list; card hidden if no rows.
   - **Images** (line 119–135): gallery (lazy-load, no lightbox in current scope). Each figure has src, alt, credit, licence (figcaption).
   - **Sources** (line 137–154): list of citations (string URLs or objects {title, url}). Opens in new tabs.
   - **PLACEHOLDER text** (line 8): used for every empty section. Defined once; applied by `listOrPlaceholder()` + `textOrPlaceholder()` helpers. No visual distinction between "not researched" (empty) and "deliberately thin" (e.g., tiny hamlet).

3. **Affordability verdict strip (line 190–220, `renderVerdictStrip()`):**
   - **Matched-price logic** (lines 172–188): **DUPLICATED from page-areas.js**. Same PROP_TO_KEY, same fallback chain.
   - **Computes verdict:** `assessAffordability({price: matched, finances, criteria})` → {verdict, monthly, ltiBreached, ltvBreached, …}.
   - **Displays:** fit-dot + matched property type + price + monthly P&I.
   - **Color-keyed:** verdict → dot-class (comfortable/stretch/tight/out-of-reach/unknown → fitted CSS class).
   - **Outreach button:** links to outreach template A1 ("Draft viewing request").

4. **Interactive footer calculator (`attachFootAfford()`, line 223–271):**
   - Price slider + number input (100k–2M range, live-bound).
   - Live updates on change: monthly P&I, loan required (deposit), LTV%, monthly spare after payment.
   - Verdict pill (colour-keyed to result).
   - "Why verdict" bullets explaining the verdict (LTI breach ≥4.5x, LTV breach ≥95%, insufficient spare after payment, etc.).

#### Map Rendering (page-map.js)

1. **Setup (lines 10–60):**
   - Leaflet map centred on Hampshire–Wiltshire (51.05, -1.6) at zoom 9.
   - CartoDB Positron (light) or Dark tiles (theme-aware, reads data-theme from HTML).
   - Labels-only overlay (adds place names without base imagery).

2. **Geofence layer (`buildGeofenceLayer()`, lines 214–236):**
   - Draws circles for all **`isLiveArea()` areas** (curated active=true, or household-located stubs).
   - **Per-area radius selection** (lines 219–224): native geofenceRadiusMi (from area.geofenceRadiusMi, default 3 mi) can be overridden by:
     - Per-area override (areaRadiusOverrides map, keyed by areaId).
     - Global displayRadiusMi (household-level searchRadiusMi or from "tighten" suggestion).
   - **Colour coding** (accent colour or fit-based): green (comfortable), orange (stretch), red (tight), grey (out-of-reach/unknown). Lighter tint if shortlisted (line 232).
   - **Radius 0 ("village boundary only")** → no circle drawn (line 213); geofence_pass filter handles matching.
   - **Non-interactive circles:** clicks pass through to markers on top (line 206).
   - **Overlapping fills compound:** denser visual picture of geofence coverage.

3. **Markers (lines 238–310, `loadAreaMarkers()`):**
   - Cluster feature group (L.featureGroup, no auto-clustering at low zoom; see tech debt §7).
   - One marker per area with coords.
   - Marker popup: fit-dot + matched-price type + area name + council-tax-band + "Approximate coords" note if coordsSource === 'postcode-outward-approx'.
   - Matched-price for map (lines 182–195, `matchedPriceForMap()`): **DUPLICATED from page-areas.js**; same PROP_TO_KEY and fallback logic.
   - Fit verdict computed on-the-fly (line 279: `assessAffordability()`).
   - Fit bounds to geofences (if circles exist) or markers on load (lines 305–309).

4. **Geofence toggle (lines 329–354, `wireGeofenceToggle()`):**
   - Checkbox #toggle-geofences (default checked).
   - Shows/hides the geofence layer (L.addTo / removeLayer).
   - **Geofence-redraw event listener** (line 341: 'search-radius-changed' custom event): triggered by user's search-radius slider or per-area override changes in other pages. Rebuilds geofenceLayer with new radii; re-adds to map if checkbox is checked.

5. **Fullscreen control (lines 139–167, `addFullscreenControl()`):**
   - Custom Leaflet control (top-right button).
   - Requests Fullscreen API on map card (.map-card).
   - Calls `map.invalidateSize()` on exit to reflow Leaflet.

6. **Drawn zones (lines 169–177, Geoman integration):**
   - Geoman toolbar: draw (polygon, circle, rectangle), edit, delete tools.
   - User-drawn shapes persisted to localStorage (via `getDrawnZones()` / `saveDrawnZones()` in storage.js).
   - Geoman PM events (created, updated, deleted) trigger `saveDrawnZones()`.
   - Shapes loaded on init (line 55, `loadSavedZones()`).

7. **Map summary tiles (lines 312):**
   - "Showing <count> of <total> areas; <count> active geofences (≈3 mi radius); <shortlist> shortlisted."
   - Count of areas with coords ("Mapped").
   - Count of areas with postcode-outward-approx coords (note suggesting geocode-areas.mjs run).
   - Drawn zones count (not visible in code; would be nice to add).

#### Matching & Enrichment (Household-Added Areas, Phase 2 Onboarding)

**Flow:** User searches place via place-lookup → `matchCatalogArea()` decides link-or-stub → `enrichPatch()` fills coords/postcode/town/geofence → stub created in Supabase user-state (area_confirmations).

- **`matchCatalogArea(place, catalog, {maxKm=1.5})`** (assets/js/areas/area-match.js lines 43–66):
  - **Trigger:** place-lookup.js calls this on postcodes.io /places result.
  - **Inputs:** place {name, county, lat, lng, postcodeDistrict} from postcodes.io; catalog (array of curated areas from data/areas.json).
  - **Name match** (line 54): normalized (lowercase, remove non-alphanumeric) required; if place name does not match any catalog name → null (stub created).
  - **County match** (line 56): both known AND disagree → skip (not the same place).
  - **Distance OR postcode-district match** (lines 57–59): haversine ≤ 1.5 km OR postcode districts match → candidate.
  - **Closest wins** (line 62): among qualifying candidates, smallest haversine distance is returned (prevents cross-link of like-named villages in different counties).
  - **Output:** matched area object or null.

- **`enrichPatch(candidate, pcRecord)`** (assets/js/areas/area-enrich.js lines 56–88):
  - **Trigger:** place-lookup.js calls this after matchCatalogArea result and postcodes.io postcode reverse-geocode.
  - **Inputs:** candidate (matched catalog area or null), pcRecord (postcodes.io postcode object {postcode, latitude, longitude, admin_county, admin_district, region} or null if API unreachable).
  - **Coords selection** (lines 37–44, `pickCoords()`, line 58): prefer candidate.lat/lng; fall back to pcRecord.latitude/longitude; return null if none.
  - **Postcode** (line 66): candidate.postcode or pcRecord.postcode or null.
  - **County** (line 69): candidate.county (primary, stable id) or pcRecord.admin_county or pcRecord.region or null.
  - **County-contradiction test** (lines 30–35, `countyContradicts()`, line 70): fires ONLY when candidate.county + pcRecord.admin_county clearly disagree (neither substring). Conservative: if admin_county absent (common in unitary authorities) → do not flag (trusts user, no false positives).
  - **coordsSource flag** (line 77): 'postcodes-io:county-mismatch' (soft block) OR 'postcodes-io:places+reverse' (normal) OR 'postcodes-io:postcode' (postcode-only lookup).
  - **Soft-fail** (lines 62–63): if pcRecord is null (API unreachable) → return coords-only + coordsSource='postcodes-io-provisional'. Stub is created but NOT fetch-eligible until enriched again later (when API recovers).
  - **Defaults** (lines 81–82): geofenceRadiusMi, searchRadiusMi = 3 (resolved-areas fallback).
  - **Town derivation** (line 86): pcRecord.admin_district (local-authority district, better proxy than county-as-town). Only set if present.
  - **Output:** patch object {coords, postcode, county, town, coordsSource, geofenceRadiusMi, searchRadiusMi} merged into stub data.

- **`isFetchEligible(area)`** (assets/js/areas/area-enrich.js lines 96–103):
  - **Shared predicate** used by dashboard (isLiveArea → "Live" badge), map (geofence layer inclusion), fetcher (listings target assembly).
  - **Requires:** coords (lat/lng non-null) AND postcode derives outcode (via `postcodeDistrict()`) AND no county-mismatch flag (coordsSource does not include 'county-mismatch').
  - **Output:** boolean.
  - **Rationale:** coords needed for geofence distance calc; outcode needed for Rightmove API search key; county-mismatch is a soft block pending user confirmation (can be unblocked via a "confirm location" flow not yet fully scanned).

---

### Coupling & Dependencies

#### User State (Supabase-backed, CLAUDE.md §18)
- **`area_confirmations`** (user-state, Supabase table): household member's curated + added area list (array of area ids or {id, confirmed_at} objects). Loaded by page-areas.js via `getHouseholdAreas()` → merged into areas catalog for display. Persisted via storage/user-state.js.
- **`user_shortlist`** (user-state, Supabase table): starred area ids (bitwise set, updated via star button). Loaded/saved per-page via `getShortlist()` / `saveShortlist()` → storage/user-state.js.
- **`criteria.location.searchRadiusMi`** (user-state, nested in criteria Supabase row): per-household search radius for geofence display (default 3 mi, persisted on slider change in areas.html filter sheet). Used by page-map.js to compute geofence radii.
- **`criteria.location.areaRadiusOverrides`** (user-state, optional, nested in criteria): per-area radius overrides for map geofencing (areaId → miles). Written by "tighten" affordability suggestion; used by page-map.js buildGeofenceLayer. Not yet fully wired in UI.

#### Finances & Affordability
- **`getFinances()`** (user-state, Supabase household row): monthly income, deposit amount, LISA cap, outstanding debt. Used by page-areas.js + page-area-detail.js to compute fit verdicts via `assessAffordability()`.
- **`getCriteria()`** (user-state, Supabase household row): propertyTypePrefs.preferred (array of type names), budget (not used by areas, used by listings refinement), LTI/LTV thresholds. Used for matched-price lookup + verdict computation.
- **`assessAffordability()`** (pure, assets/js/affordability.js): verdict engine (comfortable/stretch/tight/out-of-reach) based on LTI/LTV/spare-after-payment rules (thresholds in intelligence-constants.js). Called by page-areas.js, page-area-detail.js, page-map.js to colour-code fit verdicts.

#### Area Enrichment & Availability
- **Household-added stubs** (source='household-onboarding'): Phase 2 onboarding creates provisional rows in Supabase.areas; sync-areas-from-supabase filters them out (line 182) → not materialised to repo files. Must be distinguished from curated areas in tests (areas-db-repo-parity.test.js line 50: `isOnboardingStub` predicate).
- **Curated catalog** (source not set or source='curated'): shipped in data/areas.json + per-area files. Always materialised.
- **Rightmove integration** (resolved-areas.mjs): populates area.rightmove {locationIdentifier, identifierType (POSTCODE/REGION/OUTCODE/STATION), identifierQuality (tight/coarse), resolvedAt}. Allows tight matching for listings fetch (tools/fetch-listings.mjs uses this for query assembly).
- **Geofencing** (resolve-areas.mjs): populates geofenceRadiusMi, searchRadiusMi, active flag. Controls which areas are included in listings fetch and map display (page-map.js filters by isLiveArea, which checks active flag + fetch eligibility).

#### Cross-Domain Callers
- **Dashboard tiles** (area-ref.js `isLiveArea()`): classify area as "Live" (fetch-eligible) vs "Researching" (stub/incomplete).
- **Fetcher** (tools/fetch-listings.mjs): uses isFetchEligible() + geofenceRadiusMi to assemble Rightmove fetch targets (geofences that are in the listings catchment).
- **Refinement engine** (assets/js/refinement/): filters listings by area_id (loaded from listings table, keyed by area).
- **Outreach** (assets/js/outreach/): links from verdict strip to outreach templates keyed by area + property type.

#### Parity Test Guard (areas-db-repo-parity.test.js)
- **Snapshot:** data/snapshots/areas.json (written by sync-areas-from-supabase at lines 213–218).
- **Check:** every per-area file {id, coords, coordsSource, postcode, active} matches snapshot on those four fields (line 70–83).
- **Trigger:** hand-edit a per-area file without going through sync → parity test fails in CI.
- **Offline:** runs without DB connection (Node harness). Live DB fidelity is checked separately via sync-start freshness pass (CLAUDE.md §18.2).
- **Household-stub exclusion:** filters out rows with source='household-onboarding' (line 50–51) before comparison, so a member-added stub never trips the parity gate (forward guard — expected to be a no-op until/unless a stub is ever materialised, which is not planned).

---

### Feature & Behaviour Catalogue (Vetted)

#### Feature: Area ID Generation & Materialization
**Name & purpose:** Assign deterministic IDs to curated areas for stable references across DB ↔ repo migrations.  
**Trigger/entry:** tools/build-areas.mjs (line 58), when reading villages.csv.  
**Inputs & preconditions:** village name, postcode from CSV row; existing per-area files (for prior enriched content); seen ID set (collision detection).  
**Precise rule:**  
```
id = slug(village) + '-' + slug(postcode)
if id already seen: id = id + '-2' (or '-3', etc., until unique)
slug() = lowercase, normalize NFKD, remove non-alphanumeric+dash, trim dashes.
Pattern enforced: ^[a-z0-9-]+$
```
(Quoted from tools/build-areas.mjs lines 19, 58–60.)  
**Outputs & effects:** Per-area files named data/areas/<id>.json. Index entry in data/areas.json keyed by id. Stable across runs (same input → same id). On postcode change (e.g., SO21 → SO22), old file pruned (if --prune), new file created, villages.csv updated.  
**Edge cases:**  
- Postcode-district collision (two villages in same outcode): slug deduplication appends -2, -3 (line 59).  
- Postcode changes mid-curate: village.csv → new id, old file removed if --prune, new file created. User-state area_confirmations refs must be updated (narrow §18.5 relaxation allows rewriting user_state area keys on migration).
**Rationale:** Postcode is more specific than town (better for Rightmove geofencing); slug is URL-safe, Git-diff-readable.  
**Invariants/acceptance criteria:**  
- Test: area-status.mjs lists all ~192 areas, each with unique id.  
- Test: build-areas.mjs produces same file count + same ids on re-run (idempotent).  
- Test: after id migration, areas-db-repo-parity.test.js passes (orphan files removed, new files created, snapshot updated).  
**Style & DESIGN.md anchor:** Machine-readable identifiers; Linear-dense index (file names are semantic, sortable, grep-able).

#### Feature: Price-Summary Baking & Affordability Verdict
**Name & purpose:** Extract property-type-specific prices from per-area full records into a lightweight sub-object shipped in the directory index so the areas list can compute fit verdicts on-client without loading 192 per-area files.  
**Trigger/entry:** tools/build-areas.mjs (lines 71–77), during index generation.  
**Inputs & preconditions:** area.prices {avgDetached, avgSemi, avgTerraced, avgFlat, source, asOf}; presence check for at least one type.  
**Precise rule:**  
```
priceSummary = (
  if ANY of [avgDetached, avgSemi, avgTerraced, avgFlat] is non-null:
    { avgDetached, avgSemi, avgTerraced, avgFlat, asOf }
  else:
    null
)
(Quoted from build-areas.mjs lines 69–77.)
```
**Outputs & effects:** priceSummary sub-object shipped in data/areas.json INDEX_FIELDS (line 11, area-fields.mjs). Used by page-areas.js `matchedPrice()` (line 75) and page-area-detail.js `matchedPrice()` (line 173) for verdict computation.  
**Edge cases:**  
- Mixed prices (only Detached + Terraced populated, others null): priceSummary includes the nulls; matchedPrice fallback logic (line 90, page-areas.js) walks through and skips nulls.  
- No prices: priceSummary = null; matchedPrice returns {price: null, label: null}.  
**Rationale:** Baking the summary into the index avoids N lazy-loads on areas-list render. 30 KB index + priceSummary is much cheaper than loading 192 files (6 KB each = 1152 KB).  
**Invariants/acceptance criteria:**  
- Test: areas.json contains a priceSummary entry for each area; matches its per-area file's prices (avgDetached/avgSemi/avgTerraced/avgFlat/asOf).  
- Test: matchedPrice() returns the same result whether passed area.priceSummary or area.prices.  
**Style & DESIGN.md anchor:** Stripe-docs (materialized cost fields, not fetched on-demand); Linear-dense (lightweight index payload).

#### Feature: Matched-Price Lookup & Property-Type Preference
**Name & purpose:** For a given area + user's property-type preferences, return the most relevant property price and its type label (e.g., "Semi-detached £285k") for affordability verdict.  
**Trigger/entry:** page-areas.js lines 74–94 (`matchedPrice()`), page-area-detail.js lines 172–188 (same function, **DUPLICATED**), page-map.js lines 182–195 (`matchedPriceForMap()`, **DUPLICATED**).  
**Inputs & preconditions:** area (with priceSummary or prices), criteria.propertyTypePrefs.preferred (array of type names, e.g., ["Detached", "Semi-detached"]).  
**Precise rule:**  
```
PROP_TO_KEY = {
  Detached: 'avgDetached',
  Bungalow: 'avgDetached',   // bungalows priced like detacheds
  'Semi-detached': 'avgSemi',
  Terraced: 'avgTerraced',
  'Flat / Apartment': 'avgFlat',
}
ps = area.priceSummary or area.prices
for t in preferred:
  k = PROP_TO_KEY[t]
  if k and ps[k] != null: return {price: ps[k], label: t}
// Fallback: cheapest available (bias verdict toward best case)
for [k, label] in [[avgSemi, Semi], [avgTerraced, Terraced], [avgDetached, Detached], [avgFlat, Flat]]:
  if ps[k] != null: return {price: ps[k], label}
return {price: null, label: null}
(Quoted from page-areas.js lines 74–94.)
```
**Outputs & effects:** {price (number or null), label (string or null)}. Passed to `assessAffordability()` to compute verdict. Used to render matched-price display on areas list and detail page.  
**Edge cases:**  
- No preferences set: preferred = []; fallback to cheapest available.  
- Preference type not in PROP_TO_KEY (e.g., "Cottage"): skipped, next preference tested.  
- All preferences have null prices: fallback chain (avgSemi → avgTerraced → avgDetached → avgFlat); if all null, return {price: null}.  
- User prefers Detached but area only has Flat data: verdict biased toward Flat (cheapest), which may be misleading ("area looks affordable" via Flat, but user would buy Detached). **Known UX risk**.
**Rationale:** Cheapest-available fallback ensures a verdict is always computed (avoid "unknown" verdict). Bias toward positive verdict encourages exploration.  
**Invariants/acceptance criteria:**  
- Test: matchedPrice({priceSummary: {avgSemi: 150k, …}}, {preferred: ["Semi-detached"]}) = {price: 150k, label: "Semi-detached"}.  
- Test: matchedPrice({prices: null, …}, {preferred: ["Detached"]}) = {price: null, label: null}.  
- Test: **DUPLICATED** matchedPrice logic in page-areas.js, page-area-detail.js, page-map.js all return identical result for same area + criteria.  
**Style & DESIGN.md anchor:** Stripe-docs (matched affordability verdict in summary); Linear-dense (fit-dot + price label on list row).
**ISSUE FLAGGED:** Duplicated in 3 places. Extract to shared pure function (recommend affordability.js new function `matchedAreaPrice(area, criteria)` exported to all callers). Change in one place = change in all three.

#### Feature: Affordability Verdict Computation & Colour Coding
**Name & purpose:** Assign a household-specific verdict (comfortable/stretch/tight/out-of-reach/unknown) to an area based on matched price + user finances + property-type thresholds (LTI, LTV, spare-after-payment).  
**Trigger/entry:** page-areas.js line 100 (`verdictFor()`), page-area-detail.js line 190 (`renderVerdictStrip()`), page-map.js line 279 (`buildGeofenceLayer()` popup).  
**Inputs & preconditions:** matched-price (from `matchedPrice()`), finances {monthlyIncome, deposit, …}, criteria {ltiThreshold, ltvThreshold, …}.  
**Precise rule:** Call `assessAffordability({price, finances, criteria})` (pure function in assets/js/affordability.js, not fully scanned). Returns {verdict, monthly, ltiBreached, ltvBreached, …}. Verdict logic per intelligence-constants.js thresholds (not fully scanned). Likely:  
```
if price == null: verdict = 'unknown'
else if LTI < 4.5 and LTV < 95 and monthlySpare > 0: verdict = 'comfortable'
else if LTI < 5.0 and LTV < 95: verdict = 'stretch'
else if monthlySpare >= 0: verdict = 'tight'
else: verdict = 'out-of-reach'
(UNCONFIRMED; scanner limitation.)
```
**Outputs & effects:** verdict enum (comfortable/stretch/tight/out-of-reach/unknown). Used to:  
- Filter areas list by fit (state.fit in page-areas.js line 109).  
- Sort by verdict (VERDICT_ORDER: comfortable=0, out-of-reach=3, unknown=4).  
- Colour-code fit-dot on list + detail page + map markers (fit-dot--comfortable, fit-dot--stretch, fit-dot--tight, fit-dot--out-of-reach, fit-dot--unknown CSS classes).  
- Render monthly P&I in verdict strip + footer calculator.  
- Display "why verdict" bullets (LTI breach, LTV breach, insufficient spare).
**Edge cases:**  
- Matched price = null: verdict = 'unknown' (cannot assess).  
- User's finances not set: verdict = 'unknown' (computedfails gracefully in page-area-detail.js line 196).  
- Criteria thresholds missing (e.g., ltiThreshold undefined): fallback to defaults (intelligence-constants.js).  
**Rationale:** Verdict guides user to areas within their affordability envelope. Colour coding (green/orange/red) provides visual scanning cue.  
**Invariants/acceptance criteria:**  
- Test: verdictFor(areaA, financeHigh, criteriaLax) = 'comfortable'; same area with financeLow = 'out-of-reach'.  
- Test: VERDICT_ORDER correctly sorts list (comfortable areas first, out-of-reach last).  
- Test: footer calculator dynamically updates verdict as user slides price (no page reload).  
**Style & DESIGN.md anchor:** Stripe-docs (affordability verdict summary); Linear-dense (colour-coded dots); Pico CSS (token-based colours for fit verdicts, e.g., --color-comfortable, --color-stretch, --color-tight, --color-out-of-reach).

#### Feature: Household-Stub Filtering & Materialization Lock
**Name & purpose:** Prevent household-added stubs (Phase 2 onboarding) from being materialised into committed repo files; keep them runtime-only in Supabase. Couple the sync-materializer and the parity test to enforce this boundary.  
**Trigger/entry:** tools/sync-areas-from-supabase.mjs line 182–183 (`isOnboardingStub` predicate), tests/areas-db-repo-parity.test.js line 50 (same predicate).  
**Inputs & preconditions:** area record with source field.  
**Precise rule:**  
```
isOnboardingStub = (r) => r && r.source === 'household-onboarding'
// In sync-areas-from-supabase.mjs (line 182–183):
rows = rows.filter((r) => r.data?.source !== 'household-onboarding')
// In areas-db-repo-parity.test.js (line 50–51):
const isOnboardingStub = (rec) => !!rec && rec.source === 'household-onboarding'
const snap = (…).filter((r) => !isOnboardingStub(r))
// Filters applied identically in both places; predicate function extracted
// from parity-test to area-fields.mjs recommended (§Refactor Opportunities §5).
(Quoted from sync-areas-from-supabase.mjs line 182, areas-db-repo-parity.test.js line 50.)
```
**Outputs & effects:**  
- Household stubs never written to data/areas/<id>.json.  
- Never included in data/snapshots/areas.json parity snapshot.  
- Can be present in live Supabase.areas table (inserted via Phase 2 onboarding member INSERT policy, active=false).  
- Parity test passes even if household stubs exist in DB (filtered out before comparison).  
- Ensures repo remains curated-catalog-only; member-added areas stay in Supabase user-state (`area_confirmations`).
**Edge cases:**  
- A member-added stub is later promoted to curated (source='curated' set via MCP): it will be materialised on next sync (source='household-onboarding' no longer matches filter). Expected + intended (admin workflow).  
- Stub-creation RLS policy sets active=false; stub must still be displayed in areas list if user added it. Logic: page-areas.js merges getHouseholdAreas() output (from user-state) with getAreaCatalog() (from repo files); household stubs come from user-state, not materialized files.
**Rationale:** Separates user-state (per-household) from curated content (shared). Unifies the two via storage.js getHouseholdAreas() at page-render time (no sync needed for user additions).  
**Invariants/acceptance criteria:**  
- Test (areas-db-repo-parity.test.js): parity test passes even if Supabase.areas contains household-onboarding stubs.  
- Test: every file in data/areas/*.json has source !== 'household-onboarding' (or source absent; curated areas don't set source).  
- Test: sync-areas-from-supabase.mjs skipped count > 0 (confirms stubs are being filtered, not materialised).  
**Style & DESIGN.md anchor:** Separation of concerns (curated vs user-state data); Linear-dense (household additions don't clutter repo).
**TECHNICAL DEBT:** isOnboardingStub predicate duplicated between sync-materializer and parity-test. Recommend move to area-fields.mjs as exported function (§Refactor §5).

#### Feature: Geofence Layer & Listings-Catchment Visualization
**Name & purpose:** Draw circles on the map representing the per-area listings-fetch geofences (real-world geography of listings matching) so users can see which areas are "in the net" for a given search-radius setting.  
**Trigger/entry:** page-map.js lines 214–236 (`buildGeofenceLayer()`), line 265 (instantiation on marker load).  
**Inputs & preconditions:** areasWithCoords (array of areas with non-null coords), shortlist (set of starred area ids), displayRadiusMi (household searchRadiusMi override or null), overrides (per-area areaRadiusOverrides map or null).  
**Precise rule:**  
```
for each area in areasWithCoords:
  if NOT isLiveArea(area): skip (not in fetch catchment)
  nativeMiles = area.geofenceRadiusMi > 0 ? area.geofenceRadiusMi : 3 (DEFAULT_GEOFENCE_MI)
  ov = overrides[area.id]
  radius = isFinite(ov) ? ov : (displayRadiusMi != null && displayRadiusMi > 0) ? displayRadiusMi : nativeMiles
  if radius > 0:
    draw L.Circle(area.coords, {radius in km}, {fillOpacity, fillColor, weight})
  fillColor = getAccentColour() (default green)
  if shortlisted: fillColor lighter
  // TODO: fit-based colour coding (green/orange/red/grey by verdict) not yet wired
(Quoted from page-map.js lines 214–235.)
```
**Outputs & effects:** L.featureGroup with circles per active area. Added to map (line 267). Removed on toggle (line 337). Redrawn on radius change (line 351). User sees:  
- Per-area geofence radius (3 mi default, or user's override).  
- Visual geofence cluster (overlaps show dense coverage).  
- Tint brightness (shortlisted areas lighter).  
- Colours (accent green, or fit-based red/orange/grey if implemented).
**Edge cases:**  
- Radius = 0 ("village boundary only"): no circle drawn (line 213 comment). Geofence_pass filter in fetcher handles the matching (not visualized, but active in listings fetch).  
- Area has coords = null: skipped (line 20 `_areasWithCoords` filtered, line 238).  
- Area is inactive (active=false) and curated: skipped (isLiveArea checks active flag). **User can still shortlist an inactive area via the list page** (no restriction in page-areas.js); geofence won't draw. Inconsistency noted in tech debt §8.  
- Override radius = 0: circle not drawn (same as native 0).
**Rationale:** Geofences are what the fetcher actually searches (tools/fetch-listings.mjs uses geofenceRadiusMi to compute distance threshold). Visualization aligns user expectation with backend behaviour.  
**Invariants/acceptance criteria:**  
- Test (visual/manual): at zoom 9, ~190 circles visible (one per area). At zoom 11+, circles larger, individual area coverage clear.  
- Test: geofence radius matches area.geofenceRadiusMi (or override).  
- Test: shortlisted area circles are lighter (visual, not automated).  
- Test: toggling 'Show geofences' adds/removes geofenceLayer from map (no page reload).  
**Style & DESIGN.md anchor:** Linear-dense (geofence circles underlay, markers overlay, no auto-clustering at low zoom); Pico CSS (circle opacity, accent colour).
**KNOWN SMELL:** At zoom 7–9, ~190 circles may redraw inefficiently. No spatial clustering. Recommend cluster markers at zoom < 10 (§Refactor §3, tech debt §7).

#### Feature: Area Enrichment & County-Mismatch Safety Net
**Name & purpose:** Derive postcode + town + geofence defaults for a household-added area stub from a postcodes.io lookup, with a conservative county-contradiction flag to catch user errors (e.g., village with a known postcode in a different county than expected).  
**Trigger/entry:** assets/js/areas/area-enrich.js lines 56–88 (`enrichPatch()`), called by place-lookup.js on place selection.  
**Inputs & preconditions:** candidate {name, county, lat, lng, postcode, kind}, pcRecord {postcode, latitude, longitude, admin_county, admin_district, region} (or null if postcodes.io unreachable).  
**Precise rule:**  
```
coords = pickCoords(candidate, pcRecord) // prefer candidate lat/lng, fall back to pcRecord
postcode = candidate.postcode || pcRecord.postcode || null
county = candidate.county || pcRecord.admin_county || pcRecord.region || null
contradicts = countyContradicts(candidate.county, pcRecord)
  // fires ONLY if candidate.county AND pcRecord.admin_county both present AND neither is substring of other
coordsSource = contradicts ? 'postcodes-io:county-mismatch' : (candidate.kind === 'postcode' ? 'postcodes-io:postcode' : 'postcodes-io:places+reverse')
town = pcRecord.admin_district || null  // best "town" proxy (local-authority district)
patch = {coords, postcode, county, town, coordsSource, geofenceRadiusMi: 3, searchRadiusMi: 3}

if pcRecord === null (API unreachable):
  return {coords, coordsSource: 'postcodes-io-provisional'}  // soft-fail; stub NOT fetch-eligible yet
else:
  return patch
(Quoted from area-enrich.js lines 56–88.)
```
**Outputs & effects:** Additive patch merged into stub data (via storage.js `createAreaStubAndLink()` or equivalent). Stub is then:  
- **Fetch-eligible** (isFetchEligible() returns true) if coordsSource is 'postcodes-io:places+reverse' or 'postcodes-io:postcode' (no mismatch flag).  
- **Soft-blocked** (isFetchEligible() returns false) if coordsSource includes 'county-mismatch'; user must confirm location (flow not yet fully scanned) to unblock.  
- **Provisional** (coordsSource = 'postcodes-io-provisional') if pcRecord was null; stub created but not fetch-eligible; re-enrichment flow needed once API recovers.
**Edge cases:**  
- Unitary authority (admin_county absent from pcRecord): countyContradicts returns false (line 32); stub is NOT flagged despite absence of county validation. Conservative: trust user, no false positives.  
- candidate.county is null (place-lookup didn't find a county): county derived from pcRecord; no contradiction possible (line 31 checks candidateCounty non-empty).  
- postcode is null (rare): patch omits postcode; stub is NOT fetch-eligible (isFetchEligible checks postcodeDistrict(area.postcode), line 100).  
- Same place exists in multiple counties (e.g., "Sheffield" in South Yorkshire and West Yorkshire): user must pick the right place in place-lookup UI first; matchCatalogArea uses county+distance to disambiguate. enrichPatch sees the user's pick + the matching postcode.io record and flags a mismatch only if they genuinely disagree.
**Rationale:** Postcodes.io API is authoritative for UK postcode location (±10 m in town, ±2–3 km in rural). Place picker adds a name+county heuristic. County mismatch is a soft block (suspicious but not fatal) because some postcodes span county boundaries, and user's intent (via place picker) overrides API.  
**Invariants/acceptance criteria:**  
- Test (unit, area-enrich.test.js): enrichPatch({name: 'Oakley', county: 'Hampshire', …}, {postcode: 'RG23', admin_county: 'Hampshire', …}) → coords + no flag.  
- Test: enrichPatch({…, county: 'Devon'}, {admin_county: 'Cornwall', …}) → flagged with 'county-mismatch'.  
- Test: isFetchEligible(patchResult) = true if no mismatch, false if flagged.  
- Test: enrichPatch({…}, null) → provisional, isFetchEligible returns false.  
**Style & DESIGN.md anchor:** Stripe-docs (diagnostic info in coordsSource string); Linear-dense (soft-block, not hard error).

#### Feature: Parity Test & Drift Guard
**Name & purpose:** Offline regression test that detects hand-edits to per-area files (or the index) that bypass the DB↔repo sync path, preventing coordinate drift.  
**Trigger/entry:** tests/areas-db-repo-parity.test.js, wired into tools/run-intelligence-tests.mjs harness (run on every commit via CI).  
**Inputs & preconditions:** data/snapshots/areas.json (parity snapshot from last sync-areas-from-supabase run), data/areas/*.json (all per-area files), data/areas.json (index).  
**Precise rule:**  
```
snap = read data/snapshots/areas.json, filter out rows with source='household-onboarding'
snapById = map snap rows by id
fileIds = list all data/areas/*.json file names (strip .json), filter out files with source='household-onboarding'

Test 1: every fileId is in snapById (no orphan files)
Test 2: every snapId is in fileIds (no missing files)
Test 3: for each fileId:
  file = read data/areas/<fileId>.json
  row = snapById[fileId]
  assert file.id === row.id
  assert file.postcode === row.postcode (allowing null ≈ absent)
  assert coordsEqual(file.coords, row.coords) (float epsilon = 1e-9)
  assert file.coordsSource === row.coordsSource
  (not tested: active flag, or other fields)

if any assertion fails:
  test fails; CI reports drift; developer must fix via sync-areas-from-supabase
(Quoted from areas-db-repo-parity.test.js lines 38–83.)
```
**Outputs & effects:**  
- **Test passes:** all per-area files match snapshot on coordinate-truth fields. No drift.  
- **Test fails:** at least one file drifted. Developer must:  
  1. Check if hand-edit was intentional (e.g., reviewed geofence radius change). If so, update DB via MCP, re-run sync, commit.  
  2. If hand-edit was accidental, revert file, re-run sync.  
- CI blocks merge if test fails (enforces DB-sync discipline).
**Edge cases:**  
- Household-onboarding stub in per-area files (shouldn't happen, but test is defensive): filtered out before comparison (line 56: `isOnboardingStub` predicate).  
- Float precision: coords compared with epsilon=1e-9 (line 20, `coordsEqual()`); JSON round-trip is deterministic so this is a soft safety net.  
- Null vs absent postcode: comparison uses `(f.postcode ?? null) === (row.postcode ?? null)` to treat them identically (line 78).
**Rationale:** Parity test is the enforcement mechanism for the DB-sync discipline. Without it, developers might hand-edit a per-area file (fixing a typo in overview text), but the coordinate fields would stay stale (not re-sync'd from DB after the next DB edit). The test catches this.  
**Invariants/acceptance criteria:**  
- Test (CI): areas-db-repo-parity.test.js passes on main branch (no drift).  
- Test: after sync-areas-from-supabase + build-areas, parity test passes (materialisation is faithful to DB).  
- Test (negative): hand-edit data/areas/lake-sp4.json (change coords.lat by 0.01), run parity test → fails (expected).  
**Style & DESIGN.md anchor:** Linear-dense (deterministic tests, no flakiness); system integrity (drift guard).

---

### Coupling & Dependencies

(Expanded from prior section)

**Data flow dependencies:**
- page-areas.js → getHouseholdAreas() → storage/user-state.js → Supabase (area_confirmations + household profile).
- page-areas.js → matchedPrice() → assessAffordability() → intelligence-constants.js (thresholds).
- page-area-detail.js → getAreaDetail() → data/areas/<id>.json (lazy-load).
- page-map.js → loadAreaMarkers() → getHouseholdAreas() + buildGeofenceLayer() → isLiveArea() (fetcher eligibility check).
- tools/sync-areas-from-supabase.mjs → Supabase.areas (REST or MCP dump) → canonicalRecord() → per-area files.
- tools/build-areas.mjs → villages.csv + postcode-regions.csv + prior per-area files → data/areas.json + per-area rebuilt files.
- tools/area-status.mjs → per-area files → CONTENT_FIELDS scoring → completeness % (session-start report).

**Reverse dependencies:**
- Supabase.areas table reverse-depends on data/areas/<id>.json (snapshot state, not live). If a per-area file is edited, the DB state drifts until a developer re-syncs (re-push DB via MCP + sync-areas-from-supabase).
- Listings fetcher depends on geofenceRadiusMi + searchRadiusMi + active + isFetchEligible() (filter eligible areas for geofence search).
- Dashboard depends on isLiveArea() to show "Live" vs "Researching" badge.
- Outreach templates depend on area_confirmations + property types (link from verdict strip to template A1).

**Cross-file duplications (tech debt §1–3):**
- matchedPrice() logic: page-areas.js lines 74–94, page-area-detail.js lines 172–188, page-map.js lines 182–195. Same PROP_TO_KEY, same fallback chain. **Extract to shared function.**
- isOnboardingStub() predicate: sync-areas-from-supabase.mjs line 182, areas-db-repo-parity.test.js line 50. **Extract to area-fields.mjs.**
- priceSummary generation: build-areas.mjs lines 71–77 (step 1), but actually a step-0 concern (should be in sync-areas-from-supabase). **Move generation, remove from build-areas.**

---

### Test Coverage & Behaviours New Tests Must Pin

| Test | What it Guards | Current Status | New Behaviour to Pin |
|------|---|---|---|
| `areas-db-repo-parity.test.js` | Offline coordinate-truth check {id, coords, coordsSource, postcode, active} match snapshot. No hand-drift. | **Exists, critical, wired into harness.** | (1) Per-area file matches snapshot on all 4 fields. (2) Household-onboarding stubs filtered (forward guard). (3) Re-running parity test after sync + build produces same result (deterministic). |
| `area-match.test.js` | `matchCatalogArea()` name/county/distance; `slugifyArea()` id normalization; haversine km. | Assumed to exist; not fully scanned. | (1) matchCatalogArea(place, catalog) with name mismatch → null. (2) County match required when both present. (3) Distance ≤ 1.5 km OR postcode-district match → candidate. (4) Closest qualifier wins. (5) Haversine precision ≥ 0.1 km. |
| `area-enrich.test.js` | `enrichPatch()` coords selection, county contradiction, town derivation; `isFetchEligible()` predicate. | Assumed to exist; not fully scanned. | (1) enrichPatch prefers candidate.lat/lng over pcRecord. (2) County mismatch flagged (neither substring) only if both non-empty. (3) Unitary authority (admin_county absent) not flagged. (4) isFetchEligible returns false if county-mismatch flagged. (5) isFetchEligible requires coords + postcode. |
| `area-ref.test.js` | `isLiveArea()` → fetch-eligible for map geofence + listings. | Assumed to exist; not fully scanned. | (1) isLiveArea checks isFetchEligible (for household stubs) AND active flag (for curated). (2) Household stub with active=false is live if isFetchEligible. (3) Curated area with active=false is not live. |
| **MISSING: matched-price logic consistency** | matchedPrice result identical in page-areas.js, page-area-detail.js, page-map.js. | **GAP: no integration test.** | (1) matchedPrice(area, criteria) returns same {price, label} when called 3× from different pages. (2) Fallback to cheapest available works identically. (3) Null price handling consistent. |
| **MISSING: geofence circle rendering** | Geofence circles drawn per-area with correct radius, colour, tint. No performance issues at zoom 9. | **GAP: no visual/interaction test.** | (1) Circle radius = geofenceRadiusMi (or override, or global searchRadiusMi). (2) Shortlisted areas lighter tint. (3) Fit-colour coding (green/orange/red/grey) if implemented. (4) Toggle show/hide adds/removes layer. (5) Radius change redraws (no memory leak). |
| **MISSING: area detail fallback chain** | Per-area file → catalog index row → household stub. Render gracefully with PLACEHOLDER for missing sections. | **GAP: no integration test.** | (1) Researched area (all sections filled) renders full dossier. (2) Index row (minimal fields) renders with PLACEHOLDER in detail sections. (3) Household stub (only coords/postcode) renders with PLACEHOLDER. (4) Image gallery lazy-loads. (5) Sources links open in new tab. |
| **MISSING: materialisation pipeline idempotence** | sync-areas-from-supabase + build-areas produces same files on re-run. No spurious diffs. | **GAP: no end-to-end test.** | (1) Run sync with DB dump, run build. (2) Run sync + build again. (3) Assert data/areas.json + all per-area files are byte-identical. (4) Snapshot is unchanged. |
| **MISSING: coordinate quality & sources** | coordsSource enum enforced. Fallback coords jitter is deterministic. Postcodes.io-provisional stubs not fetch-eligible. | **GAP: no validation test.** | (1) coordsSource is one of {web-verified:…, postcodes-io:places+reverse, postcodes-io:postcode, postcodes-io:county-mismatch, postcodes-io-provisional, postcode-outward-approx}. (2) Jitter (±0.02°) is seeded by id, reproducible. (3) isFetchEligible(stub with coordsSource='postcodes-io-provisional') = false. (4) Coords bounds check (GB ±50.5°–55.5°) not implemented; recommend adding. |
| **MISSING: household-stub lifecycle** | Stub created at runtime; filtering prevents materialisation; only visible via page-areas.js getHouseholdAreas(). | **GAP: no lifecycle test.** | (1) Stub created in Supabase.areas with source='household-onboarding', active=false. (2) sync-areas-from-supabase skips it (not in skipped count > 0). (3) Parity test doesn't compare it. (4) page-areas.js displays it (merges household + catalog). (5) Promotes to curated (source='curated' set via MCP) materialises on next sync. |

**Gaps & recommended new tests:**
1. Extract matched-price logic to shared function; add integration test verifying identical results across all callers.
2. Add visual/Playwright test for geofence circle rendering (may be out of scope for Node harness; consider browser-based smoke tests per CLAUDE.md §13).
3. Add integration test for detail page fallback chain (mocked storage, check rendered sections).
4. Add end-to-end test for materialisation idempotence (sync → build → verify byte-identical).
5. Add coordinate quality validation test (enum, bounds, sources).
6. Add household-stub lifecycle test (create → skip → filter → promote).

---

### Known Smells / Tech Debt / Risks

#### Data Flow

1. **Matched-price lookup is TRIPLY DUPLICATED** (page-areas.js lines 74–94, page-area-detail.js lines 172–188, page-map.js lines 182–195). Same PROP_TO_KEY, same fallback chain (cheapest available). **Any change to property-type preference logic must be applied to 3 places.** Risk: inconsistent verdicts if one copy is updated without the others. **Recommendation (§Refactor §1):** Extract `matchedAreaPrice(area, criteria)` to affordability.js; export and import in all three files. Single point of change; easier to test.

2. **Price-summary baking happens at wrong pipeline step.** build-areas.mjs (step 1, lines 71–77) extracts avgDetached/avgSemi/avgTerraced/avgFlat into priceSummary. However, this is actually a **first-step concern** (sync-areas-from-supabase step 0 should do it). Currently, if build-areas is skipped, the index stays stale (missing updated priceSummary). **Recommendation (§Refactor §2):** Move priceSummary generation into sync-areas-from-supabase.mjs `canonicalRecord()` (line 74 is ideal spot). build-areas then picks it as-is. **Risk:** Index payload size increases by ~10 KB (one priceSummary per ~192 areas); negligible.

3. **Household-stub filter logic is tightly coupled.** `isOnboardingStub(r) => r && r.source === 'household-onboarding'` is duplicated in sync-areas-from-supabase.mjs (line 182) and areas-db-repo-parity.test.js (line 50). If stub handling changes (e.g., add a new flag), both places must be updated in lockstep. **Recommendation (§Refactor §5):** Extract to area-fields.mjs as exported function `isOnboardingStub(record)`. Import and use in both locations. Single source of truth.

#### Content & Research

4. **Content backlog & status visibility.** docs/AREAS.md lists ~192 areas; 190 are researched/partial; ~2 are stub/directory. Imagery queue is TODO (CLAUDE.md §7). **Risk:** User visits a stub area → sees only PLACEHOLDER in all sections → confusing ("is this area incomplete or deliberately thin?"). **Recommendation (§Refactor §8):** Add per-area completion % badge (computed via area-fields.mjs `completeness()`). Visual cue: "45% complete — prices + location only; schools & transport coming soon." Consider skeleton-loading screens for detail page (images + schools sections). Test with users: at what % is a dossier useful?

5. **Price-first content bias.** Many curated areas have only prices populated; overview + character + amenities are sparse. Detail page renders PLACEHOLDER text for missing sections, giving a "under construction" feel even for live areas. **Risk:** Users get a verdicts/prices/fit summary but little sense of place. **Rationale for bias:** Prices are high-value for affordability verdict (core UX goal). Real estate UX prioritizes prices + location. **Recommendation (§Refactor §8):** Prioritize overview + character + schools for partial areas (research impact assessment: what content moves users most?). Measure completion % and track via area-status.mjs.

#### Map & Geofencing

6. **Geofence circle performance at low zoom.** At zoom levels 7–10, ~190 Leaflet circles are rendered. No spatial clustering; circles re-render on every geofence toggle or radius change. **Risk:** Low-end devices (mobile, old laptops) may experience lag or flicker. **Recommendation (§Refactor §3):** Implement cluster markers at zoom < 10 (Leaflet.Markercluster or Canvas-based clustering). Measure before/after frame rate + pan smoothness. Trade-off: cluster UI is less precise but avoids clutter.

7. **Geofence active flag inconsistency.** Areas map draws geofences only for active=true areas (page-map.js line 218, `isLiveArea` check). However, users can still **shortlist an inactive area via the list page** (page-areas.js has no active filter). Result: user shortlists an inactive area (list page), but its geofence doesn't appear on the map. Inconsistency: map doesn't visualize user's actual search intentions. **Risk:** User confusion ("where's the geofence for the area I starred?"). **Recommendation (§Refactor §7):** Either (a) add an 'inactive' visual state to map (dim markers, greyed geofence), or (b) show warning if user shortlists inactive area ("this area is not currently included in listings fetch; enable it?"), or (c) allow user to toggle active flag per-area from the detail page (requires criteria UPSERT). Owner decision needed.

8. **Map a11y gaps.** Geoman toolbar (draw/edit/delete buttons) lacks aria-labels. Circle colour coding (green/orange/red/grey by fit) is colour-only; no pattern or hatch for colourblind users. Keyboard navigation (Tab through markers, Enter to open detail) not tested. **Risk:** Screen-reader users cannot operate draw tools. Colourblind users cannot distinguish fit verdicts. **Recommendation (§Refactor §8):** Add aria-labels to Geoman buttons. Add SVG pattern fills to circles (diagonal lines, dots, etc.) per fit verdict. Test keyboard nav (Tab order, focus visible, Enter activation). Per CLAUDE.md §11 (WCAG 2.2 AA floor).

9. **Drawn zones lack persistence & sync.** User-drawn zones (Geoman GeoJSON) persisted in localStorage only. If user logs out or clears browser data, zones vanish. No export/import. No sync across devices. **Risk:** User loses work; mobile + desktop have different zones. **Recommendation (§Refactor §9):** Migrate drawn zones to Supabase (new table `drawn_zones` with GeoJSON, per-household). Add export (GeoJSON download) + import (paste JSON or upload file). Enable sharing via URL (encoded geojson param). Lower priority; nice-to-have.

#### Coordinate Quality

10. **Fallback coords jitter is deterministic but crude.** build-areas.mjs (lines 37–41) applies ±0.02° jitter (seeded by area id) so 192 areas don't pile on the same postcode-region centroid. Jitter is reproducible (good for debugging) but clusters areas in a predictable diamond pattern. **Risk:** Jitter point may be far from actual village centre (±2–3 km, postcode-outward-approx accuracy). Listings fetch uses these coords as geofence centre; matches may be off. **Recommendation (§Refactor §11):** Use UK postcode-sector centroids (finer granularity than outcode; ~125 m precision) instead of outcode jitter. Requires postcode-sectors.csv data source (OS CodePoint Open or alternative). Benefit: more accurate geofence centre, tighter listings matching. Cost: data source maintenance + coord source tracking (coordsSource = 'postcode-sector-centroid').

11. **Coord sources mix without visual distinction.** Some areas have web-verified coords (coordsSource='web-verified:…'), others postcode-outward-approx (±2–3 km error). Map draws all as point markers without distance-to-point uncertainty (confidence radius or glyph). **Risk:** User assumes all coords are equally accurate; may select area based on position that's actually ±3 km off. **Recommendation (§Refactor §11):** Add visual uncertainty cue: marker icon size/opacity scaled by coord confidence (web-verified = solid, postcode-sector = slightly hollow, postcode-outward = translucent). Hover popover: "Coordinates from <source>, ±<confidence> m". Per coordinate-quality test (§Test Coverage §5).

#### Schema & Migration

12. **`area.schema.json` is GUARD-RAILED (§16).** Any type/enum addition requires explicit approval + separate phase. Currently:
    - status enum is closed (directory → stub → drafted → partial → researched). Adding archived/merged/deleted would require schema update + migration.
    - coords allows null or {lat, lng}. No bounds checking (must be in GB? ±50.5°–55.5° N?). Could allow invalid coords (lat=999).
    - images and sources allow mixed string/object items, which is flexibility but complicates strict typing (JSON Schema allows string OR object per item; harder to guarantee shape).
    - rightmove.identifierQuality is enum [tight, coarse], but "tight" vs "coarse" is subjective; no spec. Could add "unknown".
    - No versioning/audit: area.schema.json is not versioned; changes are un-tracked.
    - **Recommendation (§Refactor §4.4, separate phase):** If schema changes needed, sequence as a migration phase: (1) update schema, (2) update sync + build tools, (3) run materialisation, (4) update tests, (5) commit. Document schema rationale + version.

---

### Refactor Opportunities (Fable to Sequence)

#### High-Priority Cleanups (§Refactor §1–3)

1. **Extract matched-price lookup to shared pure function** (§Refactor §1).
   - **Files:** affordability.js (new export `matchedAreaPrice(area, criteria)`), page-areas.js (import + use), page-area-detail.js (import + use), page-map.js (import + use).
   - **Impact:** Single point of change; easier to test; consistent verdicts.
   - **Cost:** Low; 15 lines of code + 3 imports.
   - **Test:** matched-price.test.js; verify all 3 callers return identical result.

2. **Move priceSummary generation to sync-areas-from-supabase** (§Refactor §2).
   - **Files:** sync-areas-from-supabase.mjs (add to `canonicalRecord()`, line 74), build-areas.mjs (remove lines 71–77, just pick priceSummary from prior file).
   - **Impact:** Index is always fresh (no dependency on build-areas running second).
   - **Cost:** Low; 10 lines moved, 1 line removed.
   - **Test:** materialisation-idempotence.test.js; verify sync + build produces byte-identical output on re-run.

3. **Unify household-stub predicate** (§Refactor §5).
   - **Files:** area-fields.mjs (export `isOnboardingStub(record)`), sync-areas-from-supabase.mjs (import + use), areas-db-repo-parity.test.js (import + use).
   - **Impact:** Single source of truth; changes propagate automatically.
   - **Cost:** Low; 2 lines moved, 2 lines changed (import).
   - **Test:** area-fields.test.js; verify predicate on test fixtures.

#### Medium-Priority Improvements (§Refactor §6–9)

4. **Add cluster markers for geofence circles at zoom < 10** (§Refactor §3).
   - **Files:** page-map.js (lines 214–236); integrate Leaflet.Markercluster or Canvas clustering.
   - **Impact:** Cleaner map at low zoom; better performance; still accurate at high zoom.
   - **Cost:** Medium; ~50 lines of code + library (Leaflet.Markercluster ~5 KB minified).
   - **Test:** visual test (zoom in/out, check clusters form/dissolve); perf test (measure frame rate, pan smoothness).

5. **Extract content-placeholder logic into component helper** (§Refactor §4).
   - **Files:** page-area-detail.js (lines 10–18 already define `PLACEHOLDER` + helpers; wrap 9 sections in a `<section-placeholder>` template or equivalent); consider Lit element or Web Component.
   - **Impact:** Testable placeholder rendering; easier to add visual cues (completion %, skeleton loading).
   - **Cost:** Low; ~20 lines of code + optional framework decision.
   - **Test:** detail-page.test.js; verify placeholder renders for missing sections, content renders for filled sections.

6. **Audit matched-price fallback chain** (§Refactor §5).
   - **Task:** Review the "cheapest available" fallback logic (page-areas.js line 90). Is it user-aligned? E.g., someone seeking Detached should not be surprised by Flat verdict. Consider biasing toward "unknown" (no price) instead of fallback to cheapest.
   - **Impact:** Verdicts more conservative, less "best-case" bias.
   - **Cost:** Low; decision + testing.
   - **Test:** matched-price-bias.test.js; verify fallback behaviour matches user intent.

7. **Add geofence-radius override UI** (§Refactor §7).
   - **Files:** page-map.js (add drag handles on geofence circles or per-area radius slider), page-area-detail.js footer (add radius input field), storage.js (add criteria.location.areaRadiusOverrides UPSERT).
   - **Impact:** Users can customize geofence size per-area without code changes.
   - **Cost:** Medium; ~40 lines (UI) + ~10 lines (storage).
   - **Test:** map.test.js; verify radius change triggers geofence redraw; detail-page.test.js; verify radius persists on save.

8. **Improve map a11y** (§Refactor §8).
   - **Files:** page-map.js (add aria-labels to Geoman buttons, line 117–121), pages/area-detail.css + pages/map.css (add SVG pattern fills for circles, colour + pattern).
   - **Impact:** Screen-reader + colourblind-friendly map.
   - **Cost:** Low; ~15 lines (labels) + ~20 lines (CSS patterns).
   - **Test:** axe-core accessibility audit; manual keyboard navigation test.

9. **Migrate drawn zones to Supabase** (§Refactor §9).
   - **Files:** new Supabase table `drawn_zones` (GeoJSON per-household), new storage module `storage/drawn-zones.js`, page-map.js (replace localStorage with Supabase calls + localStorage cache).
   - **Impact:** Zones persist across logout; sync across devices; enable sharing.
   - **Cost:** High; ~100 lines (table DDL, storage layer, UI updates).
   - **Test:** drawn-zones-persistence.test.js; verify zones survive logout + load on another device.

#### Lower-Priority / Design Investigation (§Refactor §10–12)

10. **Content density vs completion** (§Refactor §8).
    - **Task:** Add per-area completion % badge (via area-fields.mjs `completeness()`). Survey users: is a 50%-complete dossier useful (shows prices + location) vs confusing (missing schools, transport)?
    - **Impact:** Transparency; user expectations managed.
    - **Cost:** Low research; ~10 lines of code.
    - **Test:** user research; completion-badge.test.js (render % for test fixtures).

11. **Imagery integration & lazy-load** (§Refactor §11).
    - **Task:** Once imagery queued in CLAUDE.md §7 is added to per-area files, ensure lazy-load on detail page (already present, `loading="lazy"`). Add responsive srcset for mobile-first gallery.
    - **Impact:** Images load on-demand; fast detail-page paint; bandwidth-friendly.
    - **Cost:** Low; already scoped in CLAUDE.md §7 (imagery task).
    - **Test:** images.test.js (mock images, verify lazy-load attribute, check srcset format).

12. **Search-radius interplay with geofence** (§Refactor §12).
    - **Task:** Clarify UX: criteria.location.searchRadiusMi is global household setting (listings fetch + map geofence). Per-area areaRadiusOverrides exist but no UI. Should the areas list have a "search-radius filter" (show only areas within my chosen radius of a reference point)? Or is per-area geofence-on-the-map the interaction?
    - **Impact:** Clearer mental model; potential new filter interaction.
    - **Cost:** Medium design + implementation.
    - **Test:** UX testing; areas-list-radius-filter.test.js (mock criteria, verify filter results).

#### Suggested Sub-Phases (Draft Roadmap)

**Phase A: Data Integrity & DRY** (3–5 days)
- Extract matched-price lookup (shared function in affordability.js).
- Move priceSummary generation to sync-areas-from-supabase.
- Unify household-stub predicate (area-fields.mjs export).
- Add matched-price-bias audit + test.
- **Test:** all 3 harness suites pass; areas-db-repo-parity passes offline; materialisation-idempotence test passes.
- **Exit criteria:** No duplicated logic; buildtool stability high (no spurious re-runs).

**Phase B: Map & Geofencing** (1–2 weeks)
- Add cluster markers for zoom < 10.
- Fix map a11y (aria-labels, colour + pattern).
- Add geofence-radius override UI (drag handles or slider).
- Audit active-flag inconsistency (add warning or enable-on-demand UI).
- **Test:** manual visual inspection (zoom in/out, toggle geofences, modify radius); harness passes; a11y audit passes.
- **Exit criteria:** Map is performant at zoom 7–10; no colour-only signals; keyboard-accessible.

**Phase C: Content & UX** (2–3 weeks)
- Add per-area completion % badge + visual cue (skeleton loading or explicit "Under Construction").
- Prioritize content research: overview + character + schools for partial areas.
- (Optional) Integrate imagery (lazy-load, responsive srcset).
- **Test:** visual review + content checklist against area-status.mjs report; user survey (completion %).
- **Exit criteria:** ~95% of areas ≥50% complete; imagery integrated (if scope allows).

**Phase D: Long-Term** (backlog)
- Migrate drawn zones to Supabase.
- Investigate postcode-sector centroids (replace outcode-jitter fallback coords).
- Search-radius UX clarification + per-area overrides UI polish.
- Coordinate-quality visualization (uncertainty glyphs).

---

### Tailored Q&A for the Owner

1. **Matched price & verdict primacy:** Currently areas.html and area-detail.html both use matched-price lookup. If a user prefers Detached but the area only has Semi data, the verdict falls back to Semi ("cheapest available"). Is this the right bias? Should it instead show "insufficient data" for that area (verdict='unknown'), or is cheapest-available the right default (favour positive verdict so users explore more)?

2. **Dossier completion threshold:** ~190/192 areas are researched/partial; ~2 are stub/directory. At what completion % does an area become useful to a buyer? 25% (prices + location only)? 50% (+ schools/transport)? 75% (nearly full)? This affects content-research prioritization and also the visual treatment on the detail page (e.g., should a 30%-complete area show a "Coming Soon" banner?).

3. **Geofence-as-search-intention:** On the map, geofences are drawn for active=true areas only. Should the page show a different visual state (e.g., dimmed markers) for inactive areas, or should inactive areas be removed from the map entirely? Currently a user can shortlist an inactive area (list page), but the map won't show its geofence. Inconsistency or intended separation?

4. **Map clustering & zoom behaviour:** At zoom 9 (default), ~190 geofence circles can clutter the view. Should low zooms (< 10) auto-cluster into summary dots (e.g., "23 areas")? Or should users zoom in to areas of interest first, expecting the map to be data-rich only at higher zoom?

5. **Imagery & content backlog:** Imagery queue is pending (CLAUDE.md §7). Once added, should the detail page show a gallery (lightbox, swipe) or inline figures? Should areas without images show a placeholder (e.g., map screenshot, generic village stock photo)? And what's the deployment timeline for imagery completion?

6. **Postal address / street-level precision:** Currently areas have coords at ~village-centroid level (±2–3 km from postcode-outward-approx). Is this good enough for listings matching, or should we invest in sub-village postcodes (sector / unit level) for tighter geofencing? What's the impact on listings relevance if we improve coord precision?

7. **Household-stub lifecycle:** Phase 2 onboarding creates stubs (source='household-onboarding', active=false) at runtime. Should these stubs ever be promoted to curated (source='curated', active=true) if enough users add them? If so, what's the flow (manual admin review, or automatic on N adds)? Or should stubs stay runtime-only forever?

8. **Rightmove integration maturity:** resolved-areas.mjs populates rightmove.locationIdentifier (tight/coarse) + geofenceRadiusMi. Is the Rightmove integration production-ready, or are there known issues (e.g., REGION-level matches that are too coarse)? Should we prioritize tighter POSTCODE/OUTCODE matches?

---

End of segment. The materialisation pipeline (sync → build → verify), filter/sort UX, affordability verdict integration, and map rendering are all well-structured. Main refactor targets: DRY matched-price logic, content completeness visibility, map performance & a11y. Parity test is the key lock-in mechanism preventing coordinate drift.
## 10.6 Segment: Intelligence engine (refinement, learned preferences, suggestions)

**Design anchor:** Linear-dense (refinement page)  
**Guard-rail surface (§16):** `assets/js/storage/refinement.js` (extend only); refinement tables (`refinement_suggestions`, `refinement_runs`) are engine-managed, never hand-edited

---

### File inventory

| File | Purpose (one line) |
|------|-------------------|
| `assets/js/intelligence-constants.js` | Single source of truth for affordability bands (LTI, payment %, spare cash), listing-fit weights (static calibrated signals), learned-preference calibration (cold-start min, half-life, max weight, smoothing, unattributed discount), and meta-observation thresholds (conflict triggers, dismissal grace, re-probe cadence). |
| `assets/js/refinement/config.js` | Preset levers (Cautious/Balanced/Aggressive) controlling the four preset-swappable gates (WILSON_FLOOR, MIN_LIFT, PERSISTENCE_RUNS, FDR_Q); fixed constants (half-life, global/dimension feedback mins, continuity threshold, tier boundaries, volume-artefact thresholds). `resolveConfig()` yields flat config object. |
| `assets/js/refinement/engine.js` | Pure, deterministic statistical core: `buildAggregates()` reads reactions and applies exponential time-decay (half-life 150 days); `scoreFromAggregates()` computes Wilson bounds (95% confidence, continuity-corrected below n_eff=30), two-proportion z-test, Benjamini-Hochberg FDR, and five deterministic gates. No UI, no Supabase, no clock except injectable `now`. |
| `assets/js/refinement/persistence.js` | Pure Stage 3 planning layer; turns engine run + existing rows → SQL UPSERTs for `refinement_suggestions` (dimension, value, metrics, tier, status, runs_qualified); resolves user-sticky statuses (confirmed_hide, confirmed_scrape, dismissed, snoozed) vs engine-decided (actionable, forming). Also emits `refinement_runs` audit row (feedback summary, params snapshot, candidate count). |
| `assets/js/refinement/scope.js` | Scrape-scope derivation helpers for probation enforcement (activeAreaIds, probationDropIds, reprobeThisRun); scope-invariant verification (probationed areas are in the active set, re-probe cadence is consistent). |
| `assets/js/refinement/view.js` | Pure view-model builders; `toCard()` formats confidence/metrics/why-lines; `classifySuggestions()` buckets by status; `buildConfidenceMeter()` tracks training progress toward the global feedback gate (300 decayed reactions); `rankForInbox()` sorts actionable rows and caps at MAX_INBOX (5); `humaniseValue()` prettifies area IDs + property types for the UI. Owns the reserved `__refinement_hidden` and `__refinement_settings` keys in learned_preferences.overrides. |
| `assets/js/learned-preferences.js` | Re-export shim (P7c refactor) over signals/weights/search modules. Does not own data; routes to submodules. |
| `assets/js/learned-preferences/signals.js` | Signal extraction from a listing and its snapshot: property_type, beds, baths, outcode, area_id, price_band, outdoor_space, parking. Feature inference for outdoor + parking from description text (conservative: abstains when ambiguous). Exported `signalsForListing()` and `implicatedKinds()` (reason attribution). |
| `assets/js/learned-preferences/weights.js` | Layer 2 (derive) and Layer 2⊕3 (effective) weights. `deriveWeights()` computes per-signal discrimination (P(signal\|liked) − P(signal\|rejected)) with time-decay, reason attribution, and confidence shrinkage. `trainingProgress()` is balance-aware: counts graded reactions, detects imbalance (like-share <20%), tracks milestones (warming-up → learning → usable → solid → mature). `effectiveWeights()` merges static FIT_WEIGHTS + learned weights (capped at MAX_LEARNED_WEIGHT, 0.30); cold-start (<10 graded) falls back to static fit. |
| `assets/js/learned-preferences/search.js` | Search-spec narrowing (callable from fetch-listings.mjs) — not yet inspected in detail but documented here. |
| `assets/js/meta-observations.js` | Conflict detection (v3 L5): `detectConflicts()` surfaces when likes contradict stated criteria (over-budget, excluded type, below-min-beds, geofence-tighten, stop-searching). 3-condition trigger: ≥MIN_CONFLICT_LIKES (3) likes, ≥MIN_CONFLICT_SHARE (0.6) of comparable likes, ≥1 within CONFLICT_RECENCY_DAYS (30 days). Dismissed prompts stay quiet for DISMISS_DAYS (14). `computeNextBestActions()` returns ordered list (cold-start nudge, un-reviewed strong matches, saved-unviewed homes, recent wave). |
| `assets/js/suggestions/model.js` | Normalization: maps live conflicts + engine cards → NormalizedSuggestion shape (unified id/kind/dimension/label/apply.fn/actions). |
| `assets/js/suggestions/apply.js` | Action router; `applySuggestion()` branches on source + apply.fn, calling injected storage writers (setAreaRadius, stopArea, raiseBudget, hideType, etc.). Snooze/dismiss unified via `snoozeSuggestionUnified()` / `dismissSuggestionUnified()`. |
| `assets/js/suggestions/card.js` | Shared renderer for suggestion cards (used by Listings + Refinement pages); formats copy, actions, metadata. |
| `assets/js/suggestions/confirm.js` | Native `<dialog>` modal for high-stakes Apply actions (Stop area / Hide type); injects onConfirm callback; prevents accidental destructive actions. |
| `assets/js/suggestions/sources.js` | Combines engine suggestions + live conflicts; deduplicates (engine area card shadows live stop-area when both exist). |
| `assets/js/page-refinement.js` | Refinement control panel coordinator: reads engine suggestions + probation rows; renders inbox/forming/active/probation/dismissed sections; wires user actions (hide, stop, dismiss, snooze, undo variants). Golden rule: engine proposes, user confirms, everything undoes. |
| `assets/css/pages/refinement.css` | Linear-dense styling: confidence meter track (CSS progress bar), card tiers (strong/confident/probable/forming/none) with distinct backgrounds, action states (hidden/probation/dismissed/snoozed). Uses DESIGN.md tokens (--space-*, --text-*, --focus-ring). |
| `tools/refinement-run.mjs` | Stage 3 scheduled-job driver; reads reactions (file or REST mode) → runs engine → plans persistence → emits idempotent SQL (never executes DDL/DML). Filters genuine reactions (via reaction-provenance.js) to exclude bulk area/price sweeps + administrative removals that inflate baseline. |
| `tools/refinement-scope-check.mjs` | Invariant checker; verifies probationed areas match active set + re-probe cadence is consistent. Passive: only checks, does not fix. |
| `tests/refinement-engine.test.js` (311 lines) | Pure stats core: Wilson bounds, two-prop z-test, BH FDR, gate logic, time-decay aggregation, ranking, volume-artefact detection. |
| `tests/refinement-persistence.test.js` | Plan generation, SQL rendering, status resolution (user-owned sticky, engine-decided). |
| `tests/refinement-scope.test.js` | Scope derivation (active set, probation drop, re-probe, invariant). |
| `tests/refinement-view.test.js` | View-model building: toCard() metrics, humaniseValue(), confidence meter, sorting, bucketing, hide rules. |
| `tests/learned-preferences.test.js` (460 lines) | Signal extraction, feature inference, training progress, gradedCount, cold-start, recency, reason attribution. |
| `tests/meta-observations.test.js` (170 lines) | Conflict detection 3-condition trigger, next-best-actions, dismissal memory. |
| `tests/suggestions-model.test.js` | Normalization: conflict → suggestion, engine card → suggestion, combination deduplication. |
| `tests/suggestions-apply.test.js` | Action routing (all apply.fn cases), snooze/dismiss unified, storage injection. |

---

### How the engine works (end to end)

#### Layer 1: Audit (append-only reactions)

**File:** `assets/js/listings/reactions.js` + Supabase `listing_reactions` table  
**Key constant:** (none — layer is schema-only)

Every interaction is one append-only row: `{ listing_id, reaction ('like'|'pass'|'reject'), created_at, reasons, listing_snapshot, reason }`.

- **`reaction`** ∈ `{'like', 'pass', 'reject'}` — user's explicit verdict.
- **`listing_snapshot`** — optional frozen JSON of the listing state at reaction time (property_type, area_id, beds, baths, price, etc.). Absence means "no training" (§2.1).
- **`reasons`** — optional array of selected dismissal reasons for rejects (e.g. `['wrong-area', 'no-parking']`). Used by reason attribution (§L2).
- **`reason`** — legacy string field; superseded by `reasons` array.

**Administrative reactions** (bulk area filter, price sweep, area removal) are marked via `reaction='reject'` with `reason='removed_area'` etc. and excluded from training by `genuineReactions()` in `assets/js/listings/reaction-provenance.js`.

#### Layer 2: Derive (time-decayed signals & learned preferences)

##### Section 2.1–2.2: Aggregation with time-decay

**File:** `assets/js/refinement/engine.js::buildAggregates()`  
**Key constants:**
- `HALF_LIFE_DAYS: 150` (intelligence-constants.js line 97, used in config.js line 27)
- `EXCLUDE_PASSES: false` (config.js line 36) — passes count as non-reject trials

Algorithm:
1. For each reaction with a snapshot, extract the dimension value (area_id, property_type) via `extractValue()` (engine.js line 33).
2. Compute recency weight: `w = 0.5^(ageDays / HALF_LIFE_DAYS)` (engine.js line 42). Older reactions → smaller weights.
3. Accumulate per-value effective counts: `n_eff += w`, `k_eff += w` (if reject). Also track `n_raw`, `k_raw` (unweighted counts) and distinct rejected listing IDs.
4. Return `{ systemDecayed, perDimension: { area: { values: [...] }, property_type: { values: [...] } } }`.

**Sample:** 150-day-old reaction weights 0.5; 300-day-old reaction weights 0.25. System-level `systemDecayed` is summed over all reactions and thresholds trigger Gate 1.

##### Section 2.3–2.8: Scoring & five gates

**File:** `assets/js/refinement/engine.js::scoreFromAggregates()`  
**Key constants:**
- **Gate 1 (global):** `GLOBAL_MIN_FEEDBACK: 300` (config.js line 28) + `DIM_MIN_FEEDBACK: 150` (config.js line 29)
- **Gate 2 (sample):** `MIN_EFFECTIVE_SAMPLE: 12` (config.js line 30) + `MIN_DISTINCT: 6` (config.js line 31)
- **Gate 3 (confidence):** `WILSON_FLOOR: [0.88, 0.80, 0.72]` (presets, config.js lines 16–18) — 95% Wilson lower bound
- **Gate 4 (disproportionality):** `MIN_LIFT: [1.6, 1.3, 1.15]` (presets) + `FDR_Q: [0.05, 0.10, 0.15]` (presets) — Benjamini-Hochberg FDR-significant
- **Gate 5 (persistence):** `PERSISTENCE_RUNS: [5, 3, 2]` (presets) — consecutive qualifying runs
- **Engine internals:** `WILSON_Z: 1.96` (config.js line 39, 95% confidence), `CONTINUITY_N_MAX: 30` (config.js line 40), `TIER_CONFIDENT: 0.90` (config.js line 41), `TIER_STRONG: 0.95` (config.js line 42)
- **Volume artefact:** `VOLUME_ARTEFACT_MIN_REJECTS: 30` (config.js line 45) + `VOLUME_ARTEFACT_MAX_LIFT: 1.0` (config.js line 44)

For each dimension:
1. Compute baseline reject rate `p0 = Kall / Nall` (sum of all k_eff / sum of all n_eff).
2. For each value:
   - **Point estimate:** `p_hat = k_eff / n_eff`.
   - **Wilson lower bound (§2.3):** `wilsonLowerBound(k_eff, n_eff, { z: 1.96, continuity: n_eff < 30 })` (engine.js line 51). Continuity correction (Newcombe 1998) applied below n_eff=30 for better small-sample coverage.
   - **Lift:** `lift = p_hat / p0` (p_hat vs baseline).
   - **Two-proportion z-test p-value (§2.4):** one-sided test whether value is rejected more than rest-of-pool. Returns 1 (no evidence) on degenerate inputs (engine.js line 83). ⚠️ **External validation (B3):** the normal-approximation z-test is unreliable at the small n this engine targets and is inconsistent with the small-sample Wilson bound — replace with **Fisher's exact test**; ⚠️ correction required in code (see §10.6 "main statistical weakness").
3. **BH FDR (§2.5):** Sort all candidates in a dimension by p-value ascending. Largest rank i with `p_i ≤ (i/m)·q` passes; all ranks ≤ i marked `fdr_significant: true`. Set per-dimension if `FDR_PER_DIMENSION: true` (config.js line 43), else one pooled family across all dimensions.
4. **Five gates (§2.6):**
   - **Gate 1:** `systemDecayed >= GLOBAL_MIN_FEEDBACK` AND `dimDecayed >= DIM_MIN_FEEDBACK`. (Prevents early noise.)
   - **Gate 2:** `n_eff >= MIN_EFFECTIVE_SAMPLE` AND `distinct_rejected_listings >= MIN_DISTINCT`. (Ensures real sample, not a single listing reacted many times.)
   - **Gate 3:** `wilson_lower >= WILSON_FLOOR` (preset). (Confidence threshold; all three presets are >50%, so passing value is disproportionately rejected at 95% confidence.)
   - **Gate 4:** `fdr_significant` AND `lift >= MIN_LIFT`. (Multiple-testing correction + practical significance.)
   - **Gate 5 (persistence):** `runs_qualified >= PERSISTENCE_RUNS`. (Resets to 0 on miss; requires consecutive runs.)
5. **Status:** `actionable = qualifiesThisRun && gates.persistence`; all others with `tier !== 'none'` → `forming` (watch list, not yet actionable).
6. **Tier (§2.7):** wilson_lower → { strong (≥0.95), confident (≥0.90), probable (≥WILSON_FLOOR), forming (≥0.65), none (<0.65) }.
7. **Volume artefact (§2.8):** if `k_raw >= 30` AND `lift <= 1.0`, flag as volume artefact (high sample, but baseline rate — not disproportionate).
8. **Reason (§2.8):** Plain-English summary: "Rejected 42% — 15× your usual reject rate" (engine.js line 183).

**Ranking (§2.8):** `wilson_lower DESC, lift DESC, n_eff DESC, value ASC` (engine.js line 193). Strongest evidence first.

##### Layer 2⊕3: Learned weights (Layer 4)

**File:** `assets/js/learned-preferences/weights.js::deriveWeights()`  
**Key constants:**
- `COLD_START_MIN: 10` (intelligence-constants.js line 96)
- `HALF_LIFE_DAYS: 30` (intelligence-constants.js line 97, separate from refinement engine's 150 days)
- `MAX_LEARNED_WEIGHT: 0.30` (intelligence-constants.js line 98)
- `MIN_SIGNAL_N: 2` (intelligence-constants.js line 99)
- `SMOOTHING: 3` (intelligence-constants.js line 100)
- `STRONG_FRACTION: 0.5` (intelligence-constants.js line 101)
- `UNATTRIBUTED_DISCOUNT: 0.35` (intelligence-constants.js line 102) — non-implicated signals discounted when reject carries reasons
- `PASS_WEIGHT: 0.12` (intelligence-constants.js line 107) — pass contributes 12% of a reject's weight to local discrimination
- `VIEWED_MULTIPLIER: 2.0` (intelligence-constants.js line 110) — viewed/offered listing gets 2× weight

Algorithm (weights.js lines 102–226):
1. **Cold-start check:** If `gradedCount(reactions) < COLD_START_MIN` (10), return empty weights. No learned signal until minimum evidence.
2. **Graded only:** Keep like/reject reactions with a snapshot; drop unattributed rejects (no `reasons` at all) as non-causal.
3. **Reason attribution:** For each graded reaction, compute implicated signal kinds via `implicatedKinds(reaction.reasons)` (signals.js). If a reaction carries reasons (e.g. 'remote', 'no-parking'), those kind names are implicated. Non-implicated signals receive `UNATTRIBUTED_DISCOUNT` (0.35×) to their recency weight; implicated signals get full weight. Unatributed rejects (no reasons) are filtered entirely from weight derivation (not trained, but still hidden).
4. **Recency:** Each reaction gets `w = 0.5^(ageDays / HALF_LIFE_DAYS)` (30-day half-life for preferences, vs 150 for refinement engine).
5. **Per-signal discrimination:**
   - For each signal kind (beds, property_type, outcode, etc.):
   - `P(signal|liked) = Σ(w for likes with signal) / Σ(w for all likes)`
   - `P(signal|rejected) = Σ(w·discount for rejects with signal) / Σ(w for all rejects)` (discount applied per non-implicated signal).
   - `discrimination = P(s|liked) − P(s|rejected)`.
6. **Confidence shrinkage:** `weight = discrimination × MAX_LEARNED_WEIGHT × confidence`, where `confidence = n / (n + SMOOTHING)`. Thin evidence (low n) is discounted toward 0. Signals below `MIN_SIGNAL_N` (2) are dropped entirely.
7. **Return:** `{ derived: { [signal]: weight, ... }, meta: { cold, graded, likes, rejects, ... } }`.

**Cold-start UX consequence:** With <10 graded reactions, the feed stays static (no learned re-ranking). "Still learning" meter is honest but can feel slow.

#### Layer 3: Persist (suggestion state & engine-managed rows)

**File:** `assets/js/refinement/persistence.js::planRun()`  
**Key constants:** (all from engine run + config)

Algorithm:
1. Read existing `refinement_suggestions` rows for the household.
2. Build `priorRunsQualified` map: `{ "area:brighton": 3, "type:terraced": 2, ... }` from the existing rows' `runs_qualified` field (persistence.js line 16).
3. Feed `priorRunsQualified` to the engine; the engine advances each key by +1 if it qualifies this run, else resets to 0.
4. For each candidate from the engine:
   - **Is it tracked?** `tier !== 'none' && gates.sample && lift > 1` (persistence.js line 26). Candidates at or below baseline (volume artefacts) are not tracked.
   - **Resolve status:** Engine controls `actionable` (passes all gates this run) vs `forming` (confident but <PERSISTENCE_RUNS). User-owned statuses (`confirmed_hide`, `confirmed_scrape`, `dismissed`, `snoozed`) are STICKY — the engine ON CONFLICT guard never overwrites them (persistence.js lines 36–47). If a snooze has expired, fall through to the engine's decision.
5. **Render UPSERT:** `{ household_id, dimension, value, metrics (jsonb), tier, status, runs_qualified, first_detected_at (sticky), last_evaluated_at (now), snoozed_until, updated_at }`. The ON CONFLICT clause in SQL guards user statuses: `ON CONFLICT (household_id, dimension, value) DO UPDATE SET ... WHERE status NOT IN ('confirmed_hide', 'confirmed_scrape', 'dismissed')`.
6. **Run-audit row:** Snapshot the config (preset, gates, constants) and the feedback summary (systemDecayed, global gate open, dim decayed per dimension) so re-runs can be audited and the model-confidence meter can track progress.

**User-sticky statuses (don't re-nag):** confirmed_hide, confirmed_scrape, dismissed, snoozed (until expiry). These are never re-raised by the engine.

#### Layer 4: Learn (refined preferences & weighting)

**File:** `assets/js/learned-preferences/weights.js::effectiveWeights()`

**Static fit weights (affordability, beds, type, price, LISA, EPC, rating):** Defined in intelligence-constants.js lines 49–67. Always applied.

**Learned weights:** Derived per signal (beds, property_type, outcode, area_id, price_band, outdoor, parking) per reaction. Capped at MAX_LEARNED_WEIGHT (0.30). Cold-start (<10 graded reactions) disables all learned weights; fallback to static fit + diversification.

**Effective weights:** Merge static + learned; learned never exceed 0.30 to prevent drowning out the static fit signals.

**Training progress (weights.js line 60–100):** Balance-aware summary for the UI. Tracks:
- **Volume:** graded count vs milestones (usable=30, solid=80, mature=160).
- **Balance:** min(likeShare, rejectShare) / 0.5. One-sided feed penalized.
- **Strength:** volumePct × balanceFactor × 100 (0–100%).
- **Imbalance flag:** if likeShare < 0.2 (far more rejects than likes), trigger "add more likes" next-action.
- **Milestone:** warming-up → learning → usable → solid → mature.

#### Layer 5: Recommend (meta-observations & conflicts)

**File:** `assets/js/meta-observations.js::detectConflicts()`  
**Key constants:**
- `MIN_CONFLICT_LIKES: 3` (intelligence-constants.js line 137)
- `MIN_CONFLICT_SHARE: 0.6` (intelligence-constants.js line 138)
- `CONFLICT_RECENCY_DAYS: 30` (intelligence-constants.js line 139)
- `DISMISS_DAYS: 14` (intelligence-constants.js line 140)
- `TIGHTEN_MARGIN_MI: 1` (intelligence-constants.js line 145)

**3-condition trigger (meta-observations.js line 52–59):**
1. ≥MIN_CONFLICT_LIKES (3) violating likes.
2. Violating likes are ≥MIN_CONFLICT_SHARE (60%) of comparable likes (e.g., likes with a price field, if over-budget conflict).
3. ≥1 violating like within CONFLICT_RECENCY_DAYS (30 days) — pattern persists, not a stale one-off.

**Conflict kinds:**
- **Over-budget:** Likes priced above `criteria.budget.max`. Proposed new ceiling = priciest liked home (meta-observations.js line 97).
- **Excluded type:** Likes of a property type marked excluded in `criteria.propertyTypePrefs.excluded`. Proposed = add type back (meta-observations.js line 104).
- **Below-min-beds:** Likes with fewer beds than `criteria.size.minBeds`. Proposed new minimum = smallest liked home (meta-observations.js line 120).
- **Geofence tighten (L7.5):** Every recent like in an area sits well inside the buffer; buffer could tighten by ≥TIGHTEN_MARGIN_MI (1 mile) without losing liked homes (meta-observations.js line 131).
- **Stop searching:** Rare, surfaced separately (in probation detection logic, not detectConflicts).

**Dismissal memory:** Dismissed conflict (key = `'conflict:over-budget'` etc.) stays quiet for DISMISS_DAYS (14). Stored in `learned_preferences.dismissals: { [key]: { kind:'snooze'|'dismiss', until: iso } }` (meta-observations.js line 86–88).

**Next-best-actions (computeNextBestActions, meta-observations.js):** Ordered list:
1. Cold-start nudge (if <10 graded reactions).
2. Strong un-reviewed matches (actionable tier, not yet examined).
3. Saved-but-unviewed homes (≥SAVED_STALE_DAYS, 7).
4. Recent wave to review (newest listings, added within RECENCY_DAYS, 14).

---

### Feature & behaviour catalogue (vetted)

#### 1. Time-decay and recency weighting

**What:** Reactions age out exponentially; old reactions matter less.

**Where:** `assets/js/refinement/engine.js::decayWeight()` (line 42), called from `buildAggregates()` (line 130).

**Constants:**
- Refinement engine: `HALF_LIFE_DAYS: 150` (config.js line 27)
- Learned preferences: `HALF_LIFE_DAYS: 30` (intelligence-constants.js line 97)
- Recency window for "recent" listings: `RECENCY_DAYS: 14` (intelligence-constants.js line 122)

**Formula:** `w = 0.5 ^ (ageDays / halfLifeDays)`.
- 0 days old: w=1.0
- 75 days old (150-day half-life): w=0.5
- 150 days old: w=0.25
- 30 days old (30-day half-life): w=0.5 (preferences decay faster than engine judgements)

**Consequence:** User's recent reactions dominate the ranking; old dislikes fade if the user stops acting on them, allowing re-surfacing when the market or preferences shift.

> **✅ External validation (B1):** Exponential time-decay is validated as **defensible** — a standard,
> well-understood recency-weighting choice. No change required.

#### 2. Wilson score interval (confidence bound)

**What:** Lower bound of a 95% confidence interval for the reject rate, adjusted for small samples.

**Where:** `assets/js/refinement/engine.js::wilsonLowerBound()` (line 51).

**Constants:**
- Confidence level (implicit in z): `WILSON_Z: 1.96` (95% two-tailed, config.js line 39)
- Small-sample continuity correction threshold: `CONTINUITY_N_MAX: 30` (config.js line 40)

**Formula (no continuity):**
- `p_hat = k / n`
- `z2 = z^2 = 3.8416`
- `centre = p_hat + z2 / (2n)`
- `margin = z * sqrt((p_hat(1-p_hat) + z2/(4n)) / n)`
- `lower = (centre - margin) / (1 + z2/n)`, clamped to [0, 1]

**Formula (continuity-corrected, Newcombe 1998, used when n < 30):**
- (See engine.js lines 61–66 for exact form.)
- Tighter bounds; better small-sample coverage.

**Consequence:** Gate 3 (`wilson_lower >= WILSON_FLOOR`) is conservative; a feature must be consistently disliked at 95% confidence to qualify, even if the raw percentage is high but the sample is tiny.

**Caveat:** Wilson lower = 0.88 (Cautious) still passes if p_hat = 0.85 and n = 50 (a real disproportionate signal). Below n=30, continuity correction shrinks the bound further, so true but small-sample signals may not qualify early.

> **✅ External validation (B2):** The 95% Wilson lower bound with Newcombe continuity correction below
> n ≈ 30 is validated as **defensible** — it is the recommended small-sample interval (Brown, Cai &
> DasGupta 2001; Newcombe 1998) and the right tool for the small-n regime this engine targets.

#### 3. Benjamini-Hochberg FDR control

**What:** Protects against false positives when testing many candidates (area, type, etc.) simultaneously.

**Where:** `assets/js/refinement/engine.js::benjaminiHochberg()` (line 98), called from `scoreFromAggregates()` (line 266).

**Constants:**
- `FDR_Q: [0.05, 0.10, 0.15]` per preset (config.js lines 16–18) — false discovery rate threshold.
- `FDR_PER_DIMENSION: true` (config.js line 43) — family = per dimension (area, type separately), NOT one pooled family.

**Algorithm (line 99–111):**
1. Sort candidates by p-value ascending.
2. For each rank i (1 to m), check if `p_i <= (i/m) * q`.
3. Largest i passing the threshold → all ranks ≤ i are marked `fdr_significant: true`.
4. Ranks > i: `fdr_significant: false`.

**Consequence:** With FDR_Q=0.05, expect ≤5% of flagged candidates to be false positives (under the null hypothesis that there are no true signals). Per-dimension FDR (separate families for area and type) is more sensitive than one pooled family; area refinements don't steal significance budget from type refinements.

> **✅ External validation (B4):** Benjamini–Hochberg FDR is validated as **defensible** — the standard
> multiple-comparisons control for this kind of many-candidate screening (Benjamini & Hochberg 1995).

> **⚠️ External validation — main statistical weakness (B3):** the per-candidate p-value feeding BH-FDR
> comes from a **two-proportion normal-approximation z-test** (engine.js, "value vs rest-of-pool"). The
> normal approximation is **unreliable at small n** — exactly the regime this engine targets — and is
> **inconsistent** with the deliberate choice of the small-sample-robust Wilson bound for the
> confidence gate. **Recommendation:** replace the z-test with **Fisher's exact test** (or Barnard's
> exact test) on the 2×2 "value vs rest-of-pool" table before BH-FDR. This is the single highest-value
> statistical correction; schedule it as a §3/§4 phase. ⚠️ correction required in code.

#### 4. Five deterministic gates (multi-layered filtering)

**Gate 1 — Global minimum feedback:**
- Condition: `systemDecayed >= GLOBAL_MIN_FEEDBACK (300)` AND `dimDecayed >= DIM_MIN_FEEDBACK (150)`.
- Purpose: Prevent early noise before the household has shown enough reactions.
- Trade-off: Cautious preset delays early signals; by design.

**Gate 2 — Sample quality:**
- Condition: `n_eff >= MIN_EFFECTIVE_SAMPLE (12)` AND `distinct_rejected_listings >= MIN_DISTINCT (6)`.
- Purpose: Ensure real diversity; not a single listing reacted many times.
- Trade-off: Avoids quirk-signals (e.g., "never liked viewing this one listing, so hate all terraced homes").

**Gate 3 — Confidence:**
- Condition: `wilson_lower >= WILSON_FLOOR` (preset: 0.88 Cautious, 0.80 Balanced, 0.72 Aggressive).
- Purpose: Reject rate must be confidently above some threshold (preset-dependent).
- Trade-off: Cautious is very strict (88% confidence); Aggressive is looser (72%).

**Gate 4 — Disproportionality:**
- Condition: `fdr_significant` AND `lift >= MIN_LIFT` (preset: 1.6 Cautious, 1.3 Balanced, 1.15 Aggressive).
- Purpose: The dislike rate must be statistically significant AND practially large (2–3× baseline in Cautious mode).
- Trade-off: Cautious requires 60% higher reject rate than baseline; Aggressive requires 15% higher.
- **Critical note:** Raw baseline is ~98.7% (users reject almost all homes on first pass). A 1.15× lift = 0.987 × 1.15 = 1.135 = 113.5% rejection (impossible). The lift is computed over the dimension baseline (area, property_type), not the global baseline, so a property type with 92% rejects at 1.15× lift = 105.8% rejects (clamped to 100%). Only the most extreme property types (e.g., mobile homes, boats, rare sub-types) reach lift > 1.15 in Aggressive mode; common types are lifted to 1.6 (Cautious) before Gate 4 passes.

**Gate 5 — Persistence:**
- Condition: `runs_qualified >= PERSISTENCE_RUNS` (preset: 5 Cautious, 3 Balanced, 2 Aggressive).
- Purpose: Pattern must persist across multiple runs; prevents transient noise.
- Mechanism: On each run, if all earlier gates pass, increment `runs_qualified` by 1 (reset to 0 on miss). Only after PERSISTENCE_RUNS consecutive passing runs does a candidate become `actionable` (before that, it's `forming`).
- Trade-off: Cautious delays by 5 runs (assuming weekly runs, ~35 days); Aggressive by 2 runs (~14 days).

**Consequence of all gates:** A feature is actionable only if it passes all five gates. A feature passes Gate 3 alone does not surface unless it also passes Gates 1, 2, 4, 5. This layering is intentional and heavily tested (refinement-engine.test.js).

> **✅ External validation (B6):** The parameter choices — the 300 decayed-reaction global gate, the
> 10-reaction cold-start, and the 1.0/0.35 attribution weights — are validated as **reasonable tuning
> defaults**, not derivable constants. They should be **calibrated empirically**: log each gate's
> pass-rate per run (e.g. into the run-audit row) so the thresholds can be tuned against real data
> rather than guessed.

#### 5. Suggested sensitivity presets (Cautious/Balanced/Aggressive)

**What:** User-selectable radio buttons that tune the four preset-swappable gates (WILSON_FLOOR, MIN_LIFT, PERSISTENCE_RUNS, FDR_Q).

**Where:**
- `assets/js/refinement/config.js` (PRESETS, lines 15–19)
- `assets/js/refinement/view.js::PRESET_OPTIONS` (lines 42–46)
- Persisted in `learned_preferences.overrides.__refinement_settings: { preset: 'balanced' }`

**Matrix (config.js lines 15–19):**

| Preset | WILSON_FLOOR | MIN_LIFT | PERSISTENCE_RUNS | FDR_Q |
|--------|--------------|----------|------------------|-------|
| cautious | 0.88 | 1.6 | 5 | 0.05 |
| balanced | 0.80 | 1.3 | 3 | 0.10 |
| aggressive | 0.72 | 1.15 | 2 | 0.15 |

**UX (page-refinement.js, refinement.css):** Three radio buttons on the refinement page, near the confidence meter. Label = "Your sensitivity" or "Model tuning". Each option includes plain-English blurb (view.js lines 42–46). Changing the preset persists immediately via `setRefinementPreset()` (storage/refinement.js). The next refinement run will use the new preset.

**Default:** Cautious (owner decision, config.js line 22).

**Trade-offs:**
- **Cautious:** Fewest suggestions, highest confidence in each. 35+ days to actionable (5 runs). Best for risk-averse users.
- **Balanced:** Middle ground. ~21 days to actionable (3 runs).
- **Aggressive:** Most suggestions, earliest feedback. ~14 days to actionable (2 runs). Best for users who want to see re-ranking sooner, even if noisier.

#### 6. Reason attribution & unattributed-reject filtering

**What:** Rejects with selected reasons (e.g., 'remote', 'no-parking') train only the implicated signal kinds at full weight; non-implicated kinds get UNATTRIBUTED_DISCOUNT (35%). Rejects with no reasons at all are filtered entirely and do not train weights (but still hide the listing in the feed).

**Where:** `assets/js/learned-preferences/weights.js::deriveWeights()` (lines 102–226) and `assets/js/listings/reactions.js::isUnattributedReject()`.

**Constants:** `UNATTRIBUTED_DISCOUNT: 0.35` (intelligence-constants.js line 102).

**Algorithm (weights.js line 114–120):**
1. For each graded reaction, extract `reasons` array (e.g., `['remote', 'no-parking']`).
2. Call `implicatedKinds(reasons)` (signals.js) → set of signal kinds those reasons target.
3. When computing per-signal discrimination:
   - Implicated signals: full recency weight `w` in the numerator.
   - Non-implicated signals: discounted `w * 0.35` in the numerator. (The denominator always uses full `w` — probability shares sum to ≤ 1.)
4. Unattributed rejects (no `reasons` array or empty): **filtered out entirely** (weights.js line 20, `isUnattributedReject()`). They don't contribute to any weight derivation. (But they are still counted in `trainingProgress()` separately, and they hide the listing in the feed.)

**Consequence:**
- A user who says "remote" when rejecting a 3-bed semi → that rejection strongly trains the "area/distance" signal, weakly trains the beds/type signals (at 35% strength).
- A user who quick-rejects without reason → does not pollute the model. But if they later like a home "by accident", the model has no causal signal to learn from that reject.
- This asymmetry makes unattributed rejects feel invisible to the learner, but protects against wild guesses.

#### 7. Cold-start protection

**What:** Before 10 graded reactions, the learned model is silent; the feed uses static fit only and diversifies to elicit contrast.

**Where:** `assets/js/learned-preferences/weights.js::isColdStart()` (line 43), called from multiple places including `trainingProgress()` and the refinement UI.

**Constant:** `COLD_START_MIN: 10` (intelligence-constants.js line 96).

**Consequence:**
- New household: must react to ~10 homes (10–30 min engagement) before learned re-ranking kicks in.
- Training progress UI: "Still learning — review 10 more" message displayed until threshold is crossed.
- Feed: First 10 reactions are random/static-fit-based; no learned signal appears until minimum is met.

**Rationale:** 10 reactions is the minimum to estimate a per-signal discrimination; below that, the estimate is too noisy to trust.

#### 8. Confidence meter & training milestones

**What:** Visual progress bar on the Refinement page, showing training progress toward the global feedback gate (300 decayed reactions).

**Where:** `assets/js/refinement/view.js::buildConfidenceMeter()` (not shown in read, but inferred from usage), and page-refinement.js lines 129–138.

**Constants (training.js):**
- `GLOBAL_MIN_FEEDBACK: 300` — full bar = 300 decayed reactions.
- `TRAINING_MILESTONES: { usable: 30, solid: 80, mature: 160 }` (intelligence-constants.js line 117) — volume thresholds.

**Algorithm (inferred):**
- Current: `system_decayed` from the latest `refinement_runs` row.
- Percentage: `(system_decayed / 300) * 100`, clamped to 0–100.
- Label: "Gathering training data…" (0–30%), "Learning your taste…" (30–80%), "Tuned to your preferences…" (80–160%), "Reached peak accuracy" (160%+).
- Bar fill: CSS variable `--ref-pct` set to the percentage (page-refinement.js line 137).

**Consequence:** Transparent feedback loop. User sees how many reactions they've given and how close they are to activating the engine. At 300 decayed reactions (~1 year of weekly reactions, or ~4 weeks of 75/week reactions), the meter is "full" and the engine is firing.

#### ➕ Stronger statistical core (candidate) — external validation (B5)

The validation review proposes a candidate redesign of the core that the gates approximate piecemeal.
Treat this as an **option to weigh during intake**, not a mandated change — the gates' explainability
is a real asset (see trade-off).

- **Primary recommendation — Bayesian Beta-Bernoulli per feature value.** Model each feature value's
  reject rate as a Beta posterior updated by its like/reject counts. Crucially, use the **global reject
  base-rate as the prior** (not an implicit 50% / `Beta(1,1)` uniform) so the model does **not
  over-flag at low base rates**. This single model **unifies** what the current engine splits across
  three mechanisms — confidence (Gate 3), cold-start (Section 7), and disproportionality (Gate 4).
- **Complementary options:**
  - **Thompson sampling** for explore/exploit on *when to surface* a suggestion (Chapelle & Li 2011;
    Russo et al. 2018).
  - **A single regularised logistic regression** with a weakly-informative prior (Gelman et al. 2008)
    as a unified taste model — this is the only candidate here that handles **feature correlation**,
    which the current independent per-dimension discrimination ignores.
  - **Bradley–Terry** only if pairwise "which of these two?" prompts are later added.
- **Trade-off (state it explicitly):** Bayesian/logistic models are **better-calibrated at small n**
  but **lose the explicit, explainable "gates"** the product currently exposes to the user. If
  explainability is paramount, **keep the gates** and take the cheaper, high-value win: swap the
  z-test for Fisher's exact test (B3).

#### 9. Probation enforcement & re-probe cadence

**What:** User clicks "Stop searching this area" → a `scrape_probation` row is written (confirmed_scrape status). The next scraper run (fetch-listings.mjs) subtracts probationed areas from the search scope. Every N scraper runs (default 6), the area is re-included for exploration (re-probe). If reject rate stays high, status flips to 'reconsider' (user can bring it back or leave paused).

**Where:**
- Write side: `assets/js/storage/refinement.js::stopSearchingArea()` → writes `scrape_probation` row.
- Read side (enforcement): `tools/fetch-listings.mjs` (not shown in this segment) — subtracts probation areas.
- Re-probe detection: Engine / scraper-side logic (managed separately).

**Constants:**
- Re-probe cadence: `PROBATION_REPROBE_RUNS: 6` (config.js line 34) — re-include area every 6 scraper runs.
- Reconsider threshold: `RECONSIDER_RATE: 0.60` (config.js line 35) — if re-probe reject rate is <60%, flip status to 'reconsider'.

**Consequence:**
- Area removed from search immediately (silent, no visible delay).
- Every ~6 weeks (assuming ~weekly scraper runs), area is quietly re-checked for new listings.
- If re-check finds more homes the user likes, status flips to 'reconsider' and Refinement page shows "Worth reconsidering". User can click "Re-enable".
- User never sees rejected re-probes; they only see 'reconsider' status if the area starts performing well.

#### 10. Display-hide lever (Approach B — overrides rule + status flip)

**What:** "Hide these from view" → a rule is written to `learned_preferences.overrides.__refinement_hidden` (reserved key, skipped by effectiveWeights) + suggestion status flipped to confirmed_hide. Rule is never erased by retraining (recomputeLearnedPreferences preserves `overrides` wholesale).

**Where:**
- Write: `assets/js/storage/refinement.js::hideSuggestion()` (line 160+).
- Read/filter: `assets/js/refinement/view.js::hiddenRulesFromOverrides()` (line 67) and `listingHiddenByRefinement()` (line 95).
- UI: page-refinement.js card footer buttons.

**Constant:** `REFINEMENT_HIDE_KEY: '__refinement_hidden'` (refinement/view.js line 36).

**Algorithm:**
1. User clicks "Hide [area/type]" → confirmation dialog states "Listings matching this will be removed from your feed".
2. On confirm: `hideSuggestion({ dimension: 'area', value: 'brighton' })` (storage.js line 160+).
3. Storage layer:
   - Adds rule to `learned_preferences.overrides[__refinement_hidden]: { 'area:brighton': { at: iso, count: N } }`.
   - Updates suggestion status to confirmed_hide.
4. Undo: `unhideSuggestion()` removes the rule + flips status back to 'actionable' (or prior status).
5. Feed enforcement: Page filters out listings matching any hide rule via `listingHiddenByRefinement()` (refinement/view.js line 95).

**Consequence:** Hidden rules persist across retraining and survive logout/login (stored in Supabase). Engine never re-raises a confirmed_hide suggestion.

#### 11. Conflict detection & next-best-actions

See "Layer 5: Recommend" above for full details on:
- **Over-budget, excluded-type, below-min-beds, geofence-tighten, stop-searching** conflicts.
- **3-condition trigger:** ≥3 likes, ≥60% share, ≥1 recent (30 days).
- **Dismissal memory:** Dismissed conflict stays quiet for 14 days.
- **NBA list:** Cold-start nudge, strong un-reviewed, saved-unviewed, recent wave.

#### 12. Suggestion lifecycle & status stickiness

**States (engine-managed vs user-owned):**
- **Engine-managed:** actionable (passes all gates this run), forming (confident but <persistence). Overwritten on each run.
- **User-owned (STICKY):** confirmed_hide (via Hide lever), confirmed_scrape (via Stop area), dismissed (via Dismiss button), snoozed (via Snooze 30 days, with snoozed_until timestamp).

**Snooze expiry:** Expires at `snoozed_until` timestamp. View-layer `effectiveStatus()` (refinement/view.js line 185) checks expiry and returns 'actionable' if snooze has passed (the engine job never re-activates an expired snooze — the view owns this logic).

**SQL guard (persistence.js, renderPlanSql):** ON CONFLICT UPDATE clause never overwrites user-owned statuses.

**Consequence:** Golden rule — engine proposes (actionable/forming), user confirms (hide/stop), everything undoes (unhide/bring-back). No accidental permanent damage.

#### 13. Listing fit scoring (seam with learned weights)

**File:** `assets/js/listings/fit.js` (not shown in detail, but documented here).

**Constants (intelligence-constants.js):**
- `FIT_BANDS: { strong: 0.75, possible: 0.55, stretch: 0.4, weak: 0.2 }` (line 45) — score thresholds.
- `FIT_WEIGHTS: { affordabilityComfortable: 0.25, bedsIdeal: 0.15, typePreferred: 0.15, ... }` (lines 49–67) — contribution weights.

**Algorithm (fit.js, inferred):**
1. Start with 0.5 (neutral).
2. Add static fit weights for affordability, beds, type, price, LISA, EPC, rating.
3. Add learned weights (from effectiveWeights()) if not cold-start.
4. Clamp to [0, 1].
5. Map to verdict: strong (≥0.75), possible (≥0.55), stretch (≥0.4), weak (≥0.2), reject (<0.2 or out-of-reach affordability).

**Consequence:** Learned weights re-rank within the possible/stretch/weak bands; affordability is a hard gate first (out-of-reach → auto-reject).

#### 14. Reaction provenance filtering

**What:** Genuine reactions (individual judgement) are separated from bulk/admin (area removed, price filtered). Only genuine reactions train the engine and learned preferences.

**Where:** `assets/js/listings/reaction-provenance.js::genuineReactions()`.

**Filtering:** Drops reactions with `reason` matching 'removed_area', 'price_filtered', or other admin markers.

**Consequence:** Bulk actions (e.g., "Remove Brighton") don't inflate the baseline reject rate to ~99%, which would make every feature look "disproportionately rejected". Engine run sees a realistic ~87% baseline (individual judgements) instead of ~99% (bulk + individual).

#### 15. Learned-preference training progress (balance-aware)

**Algorithm (weights.js line 60–100):**
1. Count likes, rejects (excluding unattributed rejects).
2. Compute balance: `min(likeShare, rejectShare) / 0.5`. 50/50 split = 1.0; 100% one-sided = ~0.
3. Volume: `graded / mature_milestone` (0–1, clamped).
4. Strength: `volume * balance * 100` (0–100%).
5. Milestone: warming-up (<10) → learning (10–30) → usable (30–80) → solid (80–160) → mature (160+).
6. Next-action: Cold-start nudge, imbalance nudge ("add more likes"), volume nudge, or "run a fresh fetch".

**Consequence:** A household with 500 rejects and 1 like reads as "warming-up" (0% strength, even though graded=501), not "mature". The meter is honest about the information quality, not just volume.

---

### Coupling & dependencies

**Listings fit scoring** (`assets/js/listings/fit.js`): Uses FIT_WEIGHTS + effectiveWeights(). A listing verdict is 5-band (strong/possible/stretch/weak/reject); affordability is a hard gate first, then soft signal.

**Criteria** (`assets/js/storage/user-state.js`): Household criteria (budget, beds, types, areas, zones) are source-of-truth in Supabase; read once, cached. Conflicts surface when likes drift from criteria.

**Storage layer** (`assets/js/storage/refinement.js`): Refinement table reads + writes routed through. Injected into suggestions/apply.js for testability.

**Constants** (`intelligence-constants.js`): All calibrated numbers live here. Must be updated together with `docs/INTELLIGENCE_RULES.md`.

**Reaction provenance** (`assets/js/listings/reaction-provenance.js`): Filters genuine reactions in `tools/refinement-run.mjs` (line 92, `genuineReactions()`).

**Learned-preferences overrides** (`learned_preferences.overrides`): Reserved keys `__refinement_hidden` and `__refinement_settings` are skipped by effectiveWeights() and preserved by recomputeLearnedPreferences().

---

### Test coverage & behaviours new tests must pin

| Suite | Files | Coverage | Gaps & New Tests Needed |
|-------|-------|----------|------------------------|
| **Engine** | refinement-engine.test.js (311 lines) | Wilson bounds, two-prop z-test, BH FDR, time-decay, gate logic, aggregation, ranking, volume-artefact, tier classification. | **Gap 1:** Extreme imbalance (all likes vs all rejects, system edge case). **Gap 2:** Continuity correction boundary (n_eff exactly 30). **New:** Signal determinism — same reactions always produce identical candidates ranked in identical order; no random variation. |
| **Persistence** | refinement-persistence.test.js | Plan generation, status resolution (user sticky vs engine), SQL rendering, metrics rounding, run-audit row. | **Gap:** Concurrent user action (snooze expiry during run evaluation). **New:** User-sticky ON CONFLICT guard works (engine never overwrites confirmed_hide/confirmed_scrape/dismissed/snoozed). |
| **Scope** | refinement-scope.test.js | Active set, probation drop, re-probe cadence, invariant check. | **Gap:** Re-probe boundary conditions (runIndex - last_reprobe_run edge case at exactly N). **New:** Invariant fails when probationed area is reactivated in areas.json without unpausing. |
| **View** | refinement-view.test.js | Humanise value, toCard() copy, confidence meter, sorting, bucketing, hide rules. | **Gap:** Stale probation rows (area inactive but row persists). **New:** toCard() whySignals (when implemented per P10a). |
| **Learned prefs** | learned-preferences.test.js (460 lines) | Signal extraction, feature inference (outdoor/parking), cold-start, training progress, balance factor, milestone tracking, gradedCount. | **Gap 1:** No test for time-decay on learned weights (recompute path). **Gap 2:** No test for unattributed-reject filtering in weight derivation (reason attribution full path). **Gap 3:** No test for PASS_WEIGHT (passes as local discrimination). **New:** Weight derivation determinism — same reactions always yield identical weights in identical order; per-signal discrimination is reproducible. **New:** Reason attribution — reject with ['remote'] trains area signal at 1.0×, beds at 0.35×. **New:** VIEWED_MULTIPLIER — a "viewed" listing gets 2× weight. |
| **Meta-observations** | meta-observations.test.js (170 lines) | 3-condition trigger, conflict kinds (budget/type/beds), next-best-actions, dismissal memory. | **Gap 1:** Geofence-tighten logic (area_id lookup, margin check). **Gap 2:** Prune-candidate inference. **New:** Conflict snapshot freshness (stale prices don't trigger false conflicts). |
| **Suggestions** | suggestions-model.test.js, suggestions-apply.test.js | Normalization (conflict + engine card), action routing (all apply.fn), storage injection. | **Gap:** Integration test for combined inbox (engine + live, engine area shadows live area). **Gap:** Snooze/dismiss state transitions across multiple actions. **New:** Hide rule matching — case-insensitive, both Title-Case (listing.property_type) and lower (engine value) normalize correctly. **New:** Unhide restores a listing to the feed; hide removes it. |

#### New test framework additions (if tests are rewritten per §5)

Tests must enforce these invariants:

1. **Signal aggregation determinism:** Same reactions, same now, same config → identical candidates list, identical ordering. Zero randomness.
2. **Weight derivation determinism:** Same reactions, same now, same options → identical weights, identical order of signals.
3. **Suggestion lifecycle:** A confirmed_hide is never re-suggested, even after the engine re-runs. A snoozed suggestion with expired `snoozed_until` reads as 'actionable' in the view, not 'snoozed'.
4. **Reason attribution:** Rejects with reasons train only implicated signals at full weight; non-implicated at 0.35×. Unattributed rejects (no reasons) are filtered entirely.
5. **Meta-observation conflict trigger:** Must pass all 3 conditions; dismissal memory keeps prompt quiet for 14 days.
6. **Preseen switching:** Changing the preset immediately alters the resolved config; the next engine run uses the new gates.
7. **Hide rule matching:** `hideRuleKey()` normalizes both dimension and value; `matchingHideRule()` compares normalized listing field vs rule value; case-insensitive.
8. **On-conflict preservation:** Engine SQL never overwrites user-owned statuses (confirmed_hide, confirmed_scrape, dismissed, snoozed).

---

### Known smells / tech debt / risks

1. **Opacity of the model:** The user sees "Rejected 42% — 15× your usual reject rate" but does not see which signals (beds, price, outcode) moved the weight. A listed home's contribution to a signal's weight is invisible. This asymmetry can make the model feel magical or untrustworthy. (**Refactor P10a: Explainability layer** — surface whySignals in toCard()).

2. **Weight drift over time:** Learned weights are derived fresh on every run (no persistence of per-signal weight state); they only live in `learned_preferences.weights` (in-memory during the page session). If the user's taste shifts (e.g. abandons a price band entirely), old signals can linger with stale weights until overwritten. The HALF_LIFE_DAYS (30) mitigates this but is fixed, not adaptive. (**Refactor P10b: Adaptive half-life** — shorten half-life if user's like/reject ratio shifts rapidly.)

3. **Cold-start UX:** With <10 graded reactions, the engine doesn't fire and learned weights are ignored. The feed stays static. A new household has no signal until they react to ~10 homes, which is a long time with no feedback loop. The "Still learning" meter is honest but feels slow. (**Mitigation:** Accept 5–8 reactions with noisier early weights, or seed initial weights from cohort behaviour.)

4. **Unattributed rejects poison the model:** If a user quick-rejects 50 homes without reason, those 50 do not train—they're filtered out. But a user might reject for a genuine reason they didn't articulate (e.g. "too remote" but never selected that reason). An unattributed-reject is binary: either it trains or it doesn't. No middle ground. (**Refactor P10d: Unattributed-reject soft signal** — treat them as 0.35× weight instead of filtering entirely, but with careful threshold tuning.)

5. **Statistical testability:** The engine runs on a CI schedule (frequency unclear from code review). There's no hook to run it ad-hoc during development. The bundled test data in fixtures is synthetic; a real-world run is hard to replicate locally. (**Refactor P10f: On-demand engine run** — wire refinement-run.mjs to a UI button "Analyze now".)

6. **Probation enforcement is async:** A user stops searching an area (writes a probation row). The *next* scraper run (tools/fetch-listings.mjs) will respect it. Until then, the area is still scraped. The delay is silent—the feed doesn't visibly react. (**Mitigation:** Show "paused — new listings not being searched" label immediately on the card; re-enable has "will take effect on next scrape".)

7. **Meta-observations rely on snapshots:** Conflict detection works off `listing_snapshot` (the frozen listing state at reaction time). If a listing was liked 90 days ago and the user's actual budget has changed, the snapshot is stale. The conflict won't surface until a *new* like at the new price triggers evaluation. (**Refactor P10e: Conflict snapshot freshness** — check if snapshot price drifted from live listing; lower conflict priority if stale.)

8. **Scope invariant is passive:** `refinement-scope-check.mjs` only *checks* invariants; it doesn't fix them. If a probation area is reactivated in `areas.json` without unpausing it, the invariant fails (probationedButActive is non-empty). The fix is manual. (**Mitigation:** Surface the invariant failure in CI logs; owner runs the fix manually.)

9. **Learned weights can contradict fitted:** A listing might score "strong" on static fit (affordable, correct bed count) but "weak" on learned fit (the user hates that property type). The UI shows the combined score, but the tension is not transparent. (**Refactor P10a (extended):** Show contributing signals + direction (positive/negative weight).)

10. **Testability of the "real" engine:** The unit tests mock reactions; they don't test against live listing data (no access to Rightmove API in test harness). Cold-start scenarios, edge cases with real price distributions, are not covered. (**Mitigation:** Manual verification; integration tests in staging with real data.)

11. **Reason attribution is not transparent to the user:** A user selects a reason when rejecting; the system discounts non-implicated signals at 0.35×. But the user has no visibility into which signals were implicated, and this discount is applied silently. (**Refactor P10a (extended):** Surface implicated vs non-implicated signals in the conflict detection UI.)

12. **Preset switching is immediate, but engine runs on schedule:** User changes from Cautious to Aggressive; the next run will use Aggressive gates. But the current suggestions were built with Cautious gates. There's a ~1 week delay until the next run and suggestions re-rank. (**Mitigation:** Document that preset changes take effect on the next scheduled engine run, not immediately.)

---

### Refactor opportunities (Fable to sequence)

1. **Explainability layer (P10a):** Extend `toCard()` in `refinement/view.js` to include `whySignals: [{ signal: 'type:detached', weight: 0.12, direction: 'disliked', contribution: 'main' }]`. Surface this in the card's "Why?" drawer. Users can then see which features drove the verdict. Requires threading the learned-weight map and per-signal n_eff through the view layer. **Effort:** Medium. **Value:** High (transparency).

2. **Adaptive half-life (P10b):** Replace fixed HALF_LIFE_DAYS (30) with an adaptive model: if the user's like/reject ratio is stable over rolling windows, keep the half-life; if it shifts (e.g. suddenly more likes of a price band), shorten the half-life to 15 days so new signals ramp faster. Requires persisting a short history of rolling ratios in learned_preferences. **Effort:** High. **Value:** Medium (faster adaptation to taste shifts).

3. **Attributed-reason aggregation (P10c):** When a user rejects with reasons, increment a `reason_counts` map in learned_preferences (e.g. `{ 'remote': 5, 'no-parking': 3 }`). Use this to generate a "Your top dislikes" summary on the Refinement page, driving a smarter cold-start nudge. Requires writing to learned_preferences on every reaction. **Effort:** Low. **Value:** Medium (cold-start nudge).

4. **Unattributed-reject soft signal (P10d):** Instead of filtering unattributed rejects entirely, treat them as 0.35× weight (like non-implicated signals in attributed rejects). This gives them *some* causal signal while discounting wild guesses. Requires careful threshold tuning to avoid noise. **Effort:** Low. **Value:** Medium (captures some signal from quick-rejects).

5. **Conflict snapshot freshness (P10e):** Before surfacing a conflict, check if the home's snapshot price has drifted from the current live listing. If a liked home's price dropped, lower the conflict priority or surface a "budget ceiling may have fallen" observation instead. Requires a fast price-lookup (cached, not full re-scrape). **Effort:** Medium. **Value:** Medium (prevents false conflicts).

6. **On-demand engine run (P10f):** Wire `tools/refinement-run.mjs` to a UI button "Analyze my reactions now" (on the Refinement page). User clicks, bundle is built via MCP, SQL is emitted, suggestions update in-place. Enables faster iteration for testing. Requires MCP integration + refresh hook. **Effort:** Medium. **Value:** High (testing & iteration).

7. **Per-signal snooze (P10g):** Instead of snoozing the whole suggestion ("Stop searching Brighton for 30 days"), allow snoozing *per signal kind* ("I like Brighton but hide detached homes there for 30 days"). Requires storing snooze rules per dimension:value:signal-kind and evaluating them on fit-score time. **Effort:** High. **Value:** Low (niche use case).

8. **Probation re-probe UX (P10h):** When a probationed area reaches 'reconsider' status, the Refinement page shows "Latest batch suggests this might be worth another look." User taps "Re-enable" → immediately un-pauses + triggers a re-probe. Currently re-probes are silent; surfacing them closes the feedback loop. **Effort:** Low. **Value:** High (UX clarity).

9. **Learned-weight persistence for analysis (P10i):** Snapshot `learned_preferences.weights` at the end of each run (store in a `refinement_runs.weights_snapshot` jsonb column). Enables post-hoc analysis of weight evolution, debugging of drift, and charting "your taste over time". Requires adding a column + updating the plan. **Effort:** Low. **Value:** Medium (debugging & insights).

10. **Sensitivity preset A/B testing (P10j):** Log which preset the user chose + which suggestions they acted on. Analyze if Aggressive users convert more / faster than Cautious users, or if they're just noisier. Informs calibration of the preset matrix. Requires adding a `user_preset` column to refinement_suggestions. **Effort:** Low. **Value:** Medium (data-driven calibration).

---

### Suggested sub-phases (draft)

#### Phase A: Explainability + Probation UX (P10a + P10h)

**Why together:** Both improve transparency and close feedback loops; low coupling. Together they make the model feel less magical.

**Requires:**
- Read `effectiveWeights()` in `learned-preferences/weights.js` to understand per-signal weight map.
- Extend card view-model in `refinement/view.js::toCard()` to include `whySignals: [{ signal, weight, direction, contribution }]`.
- Extend card HTML (page-refinement.js) to render a "Contributing signals" list in the Why drawer.
- Add "reconsider" status detection in page-refinement.js; surface "Worth reconsidering" banner.
- Test in `refinement-view.test.js`: card view-model includes whySignals with correct weights and direction.

**Effort:** Medium. **Timeline:** ~1 week.

#### Phase B: On-demand engine run (P10f)

**Why:** Unblocks faster iteration and testing; enables real-world feedback loops.

**Requires:**
- Add a button "Analyze my reactions now" on the Refinement page (near the confidence meter).
- Click handler: fetch reactions + suggestions + preset via storage layer, build bundle, call `refinement-run.mjs` via MCP.
- Parse returned SQL, apply to local Supabase, re-fetch suggestions.
- Test: unit test the bundle-building logic; integration test via manual trigger.

**Effort:** Medium. **Timeline:** ~1 week.

#### Phase C: Conflict snapshot freshness (P10e) + Unattributed-reject soft signal (P10d)

**Why together:** Both improve signal quality; low coupling. Require similar testing infrastructure.

**Requires:**
- For P10e: Add a listings price cache (LRU, last 50 scraped homes). Before `detectConflicts()` returns, look up snapshot price vs live price. If drifted >5%, re-prioritize conflict.
- For P10d: Change `isUnattributedReject()` filter to a 0.35× weight discount; adjust MIN_SIGNAL_N thresholds to avoid noise.
- Test: mock listings cache, verify price-lookup + conflict re-prioritization; verify unattributed weights are discounted but not filtered.

**Effort:** High. **Timeline:** ~2 weeks.

#### Phase D: Reason aggregation + Learned-weight persistence (P10c + P10i)

**Why together:** Both log signal metadata for analysis; low coupling.

**Requires:**
- For P10c: On every reaction, increment `reason_counts` in learned_preferences. Surface "Your top dislikes" on Refinement page.
- For P10i: Snapshot `learned_preferences.weights` on each run; store in `refinement_runs.weights_snapshot` jsonb. Add visualization to Refinement page: "Your taste over time" chart.
- Test: verify reason_counts accumulate; verify weights_snapshot is valid JSON; verify chart renders correctly.

**Effort:** Low. **Timeline:** ~1 week.

---

### Tailored Q&A for the owner

1. **Do you trust the learned model?** The engine is statistically sound (Wilson bounds, FDR-controlled), but the user sees no intermediate state (which signals moved the weight, how much each contributed). Would you prefer a "See the reasoning" card detail that lists "type: +0.12, beds: −0.05, price: 0.00"? This would cost development time but could significantly raise confidence.

2. **How often should the engine run?** Currently it runs on a CI schedule (frequency unclear from code review). Would daily be too noisy? Would weekly be too slow (feedback lag for new reactions)? A user who reacts to 5 homes today won't see any re-ranking until the next scheduled run—is that acceptable? (Mitigation: P10f, on-demand run.)

3. **What is the target cold-start length?** With COLD_START_MIN=10, a new household must react to ~10 homes before the engine fires. That's 10–30 minutes of engagement (depending on listing density). Is this the right friction? Would you accept 5–8 reactions if the early weights were noisier but feedback started sooner?

4. **Do you want to expose the probation lever to the user?** Currently "Stop searching this area" is a high-stakes action (strong confirm modal). Users can bring it back, but the UX is scattered across the Refinement page. Would you prefer a front-and-centre "Search scope" section on the Dashboard, mirroring Criteria (with quick toggles for area on/off)?

5. **Should the engine learn from "passes"?** Currently `pass` (skip this listing) is treated as a non-reject trial (counts in denominator but doesn't contribute reject counts). Would you prefer to learn *negative* signals from passes (e.g. "users with 20+ passes on type=detached probably want to hide it")? This could surface "Hide detached?" suggestions earlier. (Note: PASS_WEIGHT is defined in intelligence-constants.js line 107 but not fully integrated.)

6. **How transparent should conflict detection be?** When a user likes 4 homes over-budget and the engine surfaces "Raise your budget", is the user annoyed (why is the engine being pushy?) or grateful (I didn't realize)? Would you prefer to gate this behind a "I'm open to feedback on my criteria" setting, or surface it quietly as a low-urgency "Observation" card (not in the main inbox)?

7. **What is the ideal sensitivity preset default?** Currently Cautious (5 runs to actionable, 1.6× lift gate). This is the most conservative. Would you prefer Balanced (3 runs, 1.3× lift, closer to mainstream usage)?

8. **Should probation areas re-probe more frequently?** Currently every 6 scraper runs (~6 weeks). Is this too infrequent (user forgets the area was paused)? Too frequent (noisy signals)?

9. **Should the model ever suggest stopping the search entirely?** Meta-observations include a "stop searching" conflict kind (rare, but mentioned in the code). Is this a real use case, or should we remove it?

10. **Do you want historical weight charts?** P10i suggests snapshotting weights at each run so users can see "your taste over time". Is this valuable, or confusing clutter?

---

### Coupling with Fable-level concerns

The intelligence engine is the heart of the Fable learning model. Changes to:
- **Reaction provenance** (what counts as a genuine reaction) directly affect baseline rates and all engine gates.
- **Listing fit weights** (FIT_WEIGHTS in intelligence-constants.js) directly affect the learned-weight cap (MAX_LEARNED_WEIGHT should never exceed the strongest static weight).
- **Criteria shape** (what fields are stored and when they change) affect conflict detection and meta-observations.
- **Household state** (when the user is in probation, or when they've just been re-activated) affect scope and scraper behaviour.

All of these must be kept in lockstep during refactors. The guard-rail strategy (§16) keeps the core engine pure and testable; extensions happen via option injection (storage functions, config overrides, scoreOf closures).

---

### Invariants & acceptance criteria (testable)

These must hold after any change:

1. **Determinism:** `runRefinementEngine(reactions, opts)` with identical inputs always produces identical output (same candidates, same order, same metrics).
2. **Gate ordering:** A candidate that fails Gate 2 (sample size) is never actionable, even if it passes Gates 3–5.
3. **Persistence:** A candidate needs `PERSISTENCE_RUNS` consecutive runs passing all gates to become actionable. Missing a run resets the counter to 0.
4. **Stickiness:** A user-owned status (confirmed_hide, confirmed_scrape, dismissed, snoozed) is never overwritten by the engine. Expiry (snooze) is handled by the view.
5. **Freshness:** The engine never operates on stale reactions (cutoff is the `now` parameter or current time); time-decay is monotonic.
6. **FDR control:** Under the null hypothesis (no true signals), at most FDR_Q fraction of flagged candidates are false positives (on average across many runs).
7. **Reason attribution:** Rejects with reasons train implicated signals at 1.0× weight and non-implicated at 0.35×. Unattributed rejects (no reasons) are filtered entirely and do not train any signal.
8. **Cold-start:** With <COLD_START_MIN graded reactions, no learned weight is applied. The feed uses static fit only.
9. **Probation enforcement:** A probationed area is not scraped by fetch-listings.mjs until un-paused or re-probe is triggered.
10. **Conflict trigger:** All 3 conditions must be met (≥3 likes, ≥60% share, ≥1 recent). A 2-condition trigger is never sufficient.

---

### DESIGN.md anchor & Linear-dense reference

The Refinement page and all intelligence cards use the **Linear-dense** design anchor (DESIGN.md). Key elements:

- **Colour:** Tiers (strong/confident/probable/forming/none) use distinct background tokens (e.g., --rec-tier-strong, etc.). Status badges (hidden/probation/dismissed) use separate tokens.
- **Type:** Card titles in body-bold (18px or larger), metric numbers in mono-bold for visual hierarchy.
- **Spacing:** Card grid uses --space-lg (16px) gutters; action buttons use --space-md (12px) padding.
- **Focus:** All interactive elements use --focus-ring (2px solid, 2px offset).
- **Motion:** Snooze expiry / status transitions are fade-in/out (200ms, respects prefers-reduced-motion).

The CSS is in `assets/css/pages/refinement.css` (guard-railed, §16). Any visual change must name the DESIGN.md anchor in the commit message (e.g., "refinement: card padding update (Linear-dense)").
## 10.7 Segment: Ask assistant

**Design anchor:** Conversational — natural-language UI over household data; calm, plain-text output; Stripe-docs editorial tone (calm reading column, hairline rules, single accent).

**Guard-rail surface (§16):** `assets/js/storage/ask.js` (extend only — persists `ask_conversations` via Supabase RLS, no mutations to tool definitions or Edge Function logic).

**Model context (current state — IMPORTANT):** DEFAULT_MODEL = `"claude-haiku-4-5"` (index.ts:24); ALLOWED_MODELS = `Set(["claude-haiku-4-5", "claude-sonnet-4-6"])` (index.ts:25). Anthropic API version = `"2023-06-01"` (index.ts:87). No thinking parameter is sent — thinking tokens stay at 0. Opus is **not** in the allow-list by design (ASK.md §5).

> **✅/⚠️ External validation — models (F1):** The identifiers are **confirmed current and correct**:
> `claude-haiku-4-5` (default) and `claude-sonnet-4-6` (upgrade) are valid IDs, and **Haiku 4.5 is
> Anthropic's recommended low-latency tool-using model** — keep both. `anthropic-version: 2023-06-01`
> is current — keep. **Correct the Opus-exclusion rationale, though:** extended thinking/effort and
> prompt caching **coexist** (they do not conflict). Replace "default-on thinking conflicts with prompt
> caching" with the real reasons — **latency and cost**: Haiku is the right tier for interactive chat;
> Opus/Fable are reserved for heavy offline reasoning. (docs.claude.com, Models overview.)

---

### File inventory

| File | Purpose (one line) |
|---|---|
| `pages/ask.html` | Chat page shell (header, empty state with suggestion chips, transcript section, input field with autosize + safe-area insets, history dialog). 100 lines. |
| `assets/js/page-ask.js` | Page coordinator: boots on `shell:ready` (DOMContentLoaded with fallback), wires transcript/composer/history modules, owns the in-memory message thread (`state.messages: [{role, content, tools?}]`), streams answers via `askStream()`, derives title from first user turn, persists each exchange via `createAskConversation()` or `saveAskConversation()`. AbortController-driven stop. 133 lines. |
| `assets/js/ask/client.js` | Transport: async generator `askStream(messages, {model?, signal})`. Fetches `POST` to Edge Function with Supabase JWT in Authorization header. Parses SSE stream (`data: {type:'text'\|'tool'\|'done'\|'error', …}`), yields lifecycle events, catches AbortError silently. 65 lines. |
| `assets/js/ask/composer.js` | Input UI: textarea (fixed rows, scrolls internally past max-height), Enter-to-send (Shift+Enter = newline), Send/Stop button toggle, suggestion chips click (fill + send), offline/streaming guards, canSend() gate. No direct `.style` assignment (CSS-only responsive). 62 lines. |
| `assets/js/ask/transcript.js` | Render module: user/assistant bubbles with `.ask-msg--user` / `.ask-msg--assistant` classes. Streaming: `beginAssistant()` returns {token(), tool(), end(), error()}. `token(text)` appends to `.innerHTML` via `mdToSafeHtml()` (escape-first renderer). `tool(name)` updates live "Checking {label}…" status line. `end()` finalizes + appends "Sources: {names}" footnote. `appendUser()` / `appendAssistant()` for replay. Auto-scroll (only when near bottom). Live region `aria-live="polite"` on assistant bubble. **escape-first markdown renderer:** all input is HTML-escaped first, then only `<strong>/<em>/<code>/<a>/<h1–6>/<ul>/<ol>/<p>/<pre>` are re-emitted. Fenced code blocks (```), lists, headings, links (http/https only). 198 lines. |
| `assets/js/ask/history.js` | Conversation list (`<dialog>`): `listAskConversations()` → render rows, mark current, sort by `updated_at` desc. Row UI: open (switches thread, closes dialog), rename (input + commit on Enter/blur), delete (with confirmation state). "New chat" action clears thread. Uses native `<dialog>` + `showModal()` per CLAUDE.md §11. 95 lines. |
| `assets/js/storage/ask.js` | Supabase client: `list/get/create/save/deleteAskConversation(id, {title?, messages?})`. RLS-scoped by household_id (via `_initSb()`, `_getHid()`). No cache layer (direct writes). Re-exported via `storage.js`. 102 lines. |
| `supabase/functions/ask/index.ts` | Edge Function: JWT verify (401 if none) → household resolve (RLS-scoped query, 403 if none) → request parse + message sanitise (char cap 16k/turn, history cap 24 turns, strip leading non-user turns) → system-prompt build → **Anthropic streaming call** → **tool loop (≤ MAX_TOOL_LOOPS=6):** if `stop_reason !== 'tool_use'`, emit `{type:'done', usage}` and exit; else accumulate assistant content blocks, run each tool call (sync), feed results back, loop. SSE relay: forward text deltas as `{type:'text'}`, tool starts as `{type:'tool', name}`, terminal as `{type:'done'|'error'}`. Usage logging (input/output/cache_read/cache_write/thinking tokens). 262 lines. |

> **✅/➕ External validation — Edge Function + migrations (E4):** The function design is **confirmed**.
> Two upgrades to schedule: (1) **prefer forwarding the caller's user JWT to PostgREST** inside the Ask
> tool executors so **RLS enforces household scoping automatically** — do **not** rely on hand-written
> `household_id` filters under an elevated key, because **one missed filter is a cross-household leak**;
> (2) adopt Supabase's **declarative-schema migration workflow** (`supabase/schemas/*.sql` +
> `supabase db diff`) so the schema is version-controlled and migrations are reproducible/reviewable,
> and generate types with `supabase gen types` to keep the Edge Function / `pure.js` aligned
> (strengthens the parity test). (Supabase Docs: Edge Functions, CLI reference.)
| `supabase/functions/ask/prompt.ts` | System-prompt builder: static block (identity, data model, app vocabulary, UK FTB facts, tool guidance, safety rules, example queries) marked `cache_control: { type: "ephemeral" }` (~90% cost savings on repeat questions within ~5 min). Dynamic "always-on context" block (criteria budget/size, finances summary from `shapeFinancesSummary()`, profile first name, shortlist size, selected areas). Returns Anthropic `system: [block1, block2]`. 123 lines. |

> **⚠️ External validation — prompt caching gotcha (F2):** The static system block is **~1,500 tokens**,
> but **Haiku's minimum cacheable prefix is ~2,048 tokens** — so on the **default model the system block
> likely won't cache** and the "~90% savings" won't materialise. **Fix:** move the `cache_control`
> breakpoint to cover **TOOLS + STATIC SYSTEM together** (tool definitions are cacheable and the 13-tool
> schema block is large), clearing the minimum and caching the largest stable prefix; keep the dynamic
> per-household block **after** the breakpoint. Confirmed mechanics to rely on: ephemeral, **5-min TTL
> (resets on each read)**, **read = 10% of base / write = +25%**, up to **4 breakpoints**, prefix order
> **tools → system → messages**. Re-verify Haiku's current minimum before trusting the figure. ⚠️
> correction required in code (prompt.ts breakpoint placement). (Claude Docs: Prompt caching.)
| `supabase/functions/ask/tools.ts` | Tool **definitions** (JSON schemas for Anthropic) + **executors** (RLS-scoped Supabase queries + pure.js logic). 13 read-only tools: `get_finances_detail`, `get_budget_breakdown`, `query_listings`, `get_listing`, `get_saved_properties`, `get_reactions_summary`, `search_areas`, `get_area`, `get_household_areas`, `get_trends`, `get_journey_status`, `get_outreach_templates`, `draft_outreach`. 4 tools have `strict: true, additionalProperties: false` (query_listings, get_listing, search_areas, get_area). Each tool executor calls `getBlob()` for user-state tables or direct Supabase `.select()` for relational/global tables. 316 lines. |

> **✅/⚠️ External validation — tool use (F3):** Strict tool use is **real and recommended**. **Extend
> `strict: true` + `additionalProperties: false` to ALL 13 tools** (not just the current 4) to
> eliminate malformed-call errors. **Caveat:** `strict` validates schema **shape only**, not
> SQL-injection safety — **keep the PostgREST filter sanitisation** (`sanitizeFilterTerm`, line 6312);
> the two are orthogonal. Streaming via `stream: true` SSE is correct; fine-grained tool streaming is
> not needed here. ⚠️ correction required in code (add strict to the remaining 9 tools). (Claude Docs:
> Strict tool use, Streaming.)
| `supabase/functions/ask/pure.js` | Pure helpers (no Deno/Node imports): `scoreListingFit(listing, criteria) → {verdict, score, gated, reasons}`, `rankAndFilterListings(listings, input, criteria) → {listings, returned}`, `buildListingsQuery(input) → {columns, filters, order, limit}`, `searchAreasPure(areas, input) → results`, `shapeFinancesSummary(blob) → {summary}`, `renderOutreachDraft(template, context) → {subject, body, unfilled}`, `bandForScore(score) → 'strong'|'possible'|'stretch'|'weak'|'reject'`. Constants: LISTING_VERDICTS, FIT_BANDS, FIT_WEIGHTS (mirrored from browser's intelligence-constants.js), LISA_CAP_GBP=450,000. Unit-tested in Node by `tests/ask-tools.test.js`; re-used at runtime by tools.ts in Deno. 322 lines. |
| `supabase/functions/_shared/cors.ts` | Origin allow-list: `https://georgianrectory.com` + `http://localhost:8000`. Returns CORS headers on OPTIONS; rejects other origins. |
| `assets/css/pages/ask.css` | Chat UI (mobile-first): main.ask-page fills dynamic viewport (min-height: calc(100dvh - header-h)). Transcript flex-grows. Composer sticky-pinned above iOS home indicator (safe-area-inset-bottom). All spacing/colour/radius from tokens. Touch targets ≥44×44. dvh/svh (never raw vh). Responsive breakpoints 480/768/1024/1280 px. |
| `assets/css/dashboard/tile-ask.css` | Ask placeholder tile (dashboard, disabled input, placeholder UI). |
| `tests/ask-tools.test.js` | Node unit tests for pure.js: `scoreListingFit()` (hard gates, scoring, verdicts), `rankAndFilterListings()` (filter by area/price/beds, gating, limit), `buildListingsQuery()` (column selection, filter expr building), `searchAreasPure()` (text + county/town filters, limit clamp), `shapeFinancesSummary()` (deposit gap / months-to-target), `renderOutreachDraft()` (placeholder substitution), `bandForScore()` (threshold mapping). Part of `run-intelligence-tests.mjs` harness. |
| `tests/ask-storage.test.js` | Offline snapshot test: `ask_conversations` table registered + classified as user-state. Validates row shape (id, title, messages array, role/content). Part of sync-test suite. |
| `docs/ASK.md` | Operating guide: architecture diagram, file map, tool catalogue, deploy steps, smoke test (browser console), cost/safety envelope, token limits, security considerations. |

---

### How it works (end-to-end) — detailed flow

1. **User Input (frontend):** User types a question on `pages/ask.html` and presses Enter (or clicks Send). `page-ask.js` collects the text turn, appends to `state.messages: [{role:'user'|'assistant', content:'text', tools?: [...]}]`, derives title from first user turn (truncate to 60 chars), calls `send(text)`.

2. **Message Transport (ask/client.js):** `send()` → `askStream(wire, {signal})` where `wire = state.messages.map((m) => ({role, content}))` (strips stored `tools` array, sends only text content). `askStream()` fetches Supabase session → makes `POST` to `https://qxmyrahqsopmaeokxdub.supabase.co/functions/v1/ask` with Authorization header (`Bearer {JWT}`) + body `{messages, model?}`. Returns async generator that parses SSE stream into lifecycle events.

3. **Edge Function Auth & Context (index.ts:45–70):** 
   - Verify JWT via `supabase.auth.getUser()` → 401 if none.
   - Resolve `household_id` from `household_members` RLS-scoped query → 403 if none.
   - Parse + sanitise request: `messages` must be a non-empty array, each turn ≤16k chars, filter to most recent 24 turns, ensure thread starts with 'user' role (sanitiseMessages, index.ts:241–250).
   - Resolve model: if `body.model` is a string in ALLOWED_MODELS, use it; else DEFAULT_MODEL (`claude-haiku-4-5`).

4. **Prompt Build (prompt.ts):** Call `buildSystemPrompt(supabase, householdId)` → fetch household context in parallel (criteria, finances, profile, shortlist, household_areas) → shape into two Anthropic `system` blocks:
   - **Static block** (ephemeral cache): identity, data model, app vocabulary, UK FTB facts (LISA £450k cap, Stamp Duty April 2025, survey costs, 12–16 week process), tool guidance, safety rules, output format. ~1500 tokens.
   - **Dynamic block** (always recomputed): criteria budget/size, finance summary (deposit target/saved/gap, monthly contribution, months-to-target via `shapeFinancesSummary()`, income), profile first name + first-time-buyer flag, shortlist size, selected area ids. ~200 tokens.

5. **Anthropic Call (index.ts:81–110):** Fetch `https://api.anthropic.com/v1/messages` with:
   - Model: `claude-haiku-4-5` or `claude-sonnet-4-6` (user-selected or default).
   - `max_tokens: 1024` (runaway backstop; matches brevity contract).
   - `stream: true` (SSE response).
   - `system: [block1, block2]`.
   - `tools: TOOLS` (13 read-only tool definitions from tools.ts).
   - `messages: convo` (initially the user's text turns; after each tool loop, appended with assistant turn + tool_result turn).
   - **No thinking parameter** — thinking tokens = 0 on all models.

6. **SSE Relay (relayAnthropicSSE, index.ts:164–238):** Parse Anthropic's streamed `/v1/messages` response:
   - `message_start`: capture initial `usage` (input_tokens, cache_read_input_tokens, cache_creation_input_tokens).
   - `content_block_start`: initialize blocks array by index (text or tool_use).
   - `content_block_delta`: 
     - If text_delta: append to block text, **immediately forward to client** as `{type:'text', text:delta}`.
     - If input_json_delta: accumulate partial JSON for tool input.
   - `content_block_stop`: finalize tool_use.input by parsing accumulated JSON.
   - `message_delta`: capture `stop_reason` + `output_tokens` (+ thinking_tokens if present, expected 0).
   - Relay each text delta to the client in real-time; accumulate all blocks.

7. **Tool Loop (index.ts:112–131):** For up to MAX_TOOL_LOOPS (6) iterations:
   - If `stop_reason !== 'tool_use'`, emit `{type:'done', usage: usageTotals}` and exit the loop.
   - Otherwise, accumulate the assistant's content blocks (filter out empty text blocks), append to `convo` as a new assistant turn.
   - For each `tool_use` block in the assistant turn:
     - Emit `{type:'tool', name}` to the client (for status line update).
     - Call `runTool(name, input, ctx)` synchronously (ctx includes supabase, householdId, templatesUrl).
     - Push `{type:'tool_result', tool_use_id, content: JSON.stringify(result)}` to a results array.
   - Append a user turn with the tool results: `{role:'user', content: toolResults}`.
   - Loop back to Anthropic for the next turn.
   - **If MAX_TOOL_LOOPS exhausted before final answer,** emit `{type:'error', message: 'Reached the tool-call limit…'}`.

8. **Tool Executors (tools.ts, runTool):** Each tool executor:
   - Calls `getBlob(ctx, table)` for blob tables (select `data` by household_id).
   - Calls direct Supabase queries for relational tables (household_areas, readiness_checklist, investments_history) or global tables (listings, areas).
   - Passes data to pure.js helpers (scoreListingFit, rankAndFilterListings, searchAreasPure, shapeFinancesSummary, renderOutreachDraft).
   - Returns a shaped result (never raw DB rows for PII/token reasons).

9. **Streaming + Replay (transcript.js):** As events arrive from `askStream()`:
   - `{type:'text', text}`: call `assistant.token(text)` → append to `.innerHTML` via `mdToSafeHtml()` (escape-first). Live region reads out new text.
   - `{type:'tool', name}`: call `assistant.tool(name)` → update status line "Checking {label}…".
   - `{type:'done', usage}`: call `assistant.end()` → finalize content, append "Sources: {names}" footnote, return `{text, tools}`.
   - `{type:'error', message}`: call `assistant.error(message)` → show alert, return `{text, tools}`.

10. **Persistence (page-ask.js:52–100):** After stream ends:
    - If `finished.text.trim() || finished.tools.length` (not empty), push `{role:'assistant', content: finished.text, tools: finished.tools}` to `state.messages`.
    - Call `createAskConversation(title, state.messages)` if new, or `saveAskConversation(id, {title, messages})` if existing.
    - Both calls go through `storage/ask.js` → RLS-scoped Supabase INSERT/UPDATE on `ask_conversations`.

11. **History (history.js):** `listAskConversations()` fetches all threads (id, title, updated_at) ordered by updated_at desc. User can switch (via `onSwitch(id)` → `loadConversation(id)` → fetch full conversation + replay bubbles), rename (inline input + commit), delete (disable button + call `deleteAskConversation()`), or start a new chat (reset thread state).

---

### Feature & behaviour catalogue (vetted, tool-by-tool)

#### **Trigger & invocation**
- **Entry point:** Click "Ask" in main nav or visit `/pages/ask.html`. `page-ask.js` boots on `shell:ready` event (page-ask.js:127–132), wiring the coordinator modules. Auth is checked by `auth-guard.js` (redirects to login if unauthenticated).
- **Model selection:** Default = `claude-haiku-4-5` (cheapest, <$0.02/question). Optional Sonnet upgrade via `model` field in request body (user-selectable via future UI, not currently exposed). Opus is blocked by code (not in ALLOWED_MODELS, index.ts:25).

#### **1. get_finances_detail**
- **Description:** Get the household's full finances record plus a derived summary.
- **Trigger/entry:** Tools.ts:185–189. Called when user asks about affordability, deposit, savings, income, or budget headroom.
- **Inputs & preconditions:** None. Fetches `finances` blob table by household_id (RLS-scoped).
- **Rule (precise logic):** 
  - Query: `supabase.from('finances').select('data').eq('household_id', householdId).limit(1)` (tools.ts:164–168, getBlob).
  - Shape: `shapeFinancesSummary(raw)` in pure.js (calculates: deposit target, deposit saved, deposit gap, monthly contribution, naive months-to-target via `(gap / monthlyContribution).toFixed(1)`, income, mortgage estimate).
  - Return: `{summary: {...}, finances: raw}`.
- **Outputs & effects:** Returns full finances blob + a derived 6-line summary (safe to narrate).
- **Edge cases:** 
  - If finances blob is null/empty, return `{error: "no finances on record"}`.
  - If deposit_target or savings is missing, gap/months calculations return null / "–".
  - No transaction on read.
- **Rationale:** Read-only, deterministic transformation. Caches in prompt context so trivial questions ("What's my income?") need zero tool calls if facts already in the prompt snapshot.
- **Invariants/acceptance criteria:**
  - `deposit_gap = Math.max(0, deposit_target - deposit_saved)`.
  - `months_to_target = (gap > 0 && monthly_contribution > 0) ? (gap / monthly_contribution).toFixed(1) : null`.
  - On every re-fetch, the summary must match the browser's finance calculator (assets/js/finances/calc-*.js).
  - No PII leakage: first name is redacted in outreach, full finances stay within the household.
- **Test:** ask-tools.test.js covers the shaper in the finance-summary test.
- **Conversational UI & a11y:** Narrated in prose ("Your deposit gap is £{gap}; at £{monthly}/month, you hit your target in ~{months} months."). No heading, no table. Live region reads it.

#### **2. get_budget_breakdown**
- **Description:** Get the household's monthly money-flow inputs (ongoing bills, recurring expenses, one-time costs, income, mortgage estimate).
- **Trigger/entry:** Tools.ts:190–199. Called when user asks "where does my money go?" / "monthly outgoings".
- **Inputs & preconditions:** None.
- **Rule:** Query finances blob, extract `ongoingBills`, `expenses`, `oneTimeCosts`, `income`, `mortgage` fields (if missing, return empty arrays/null).
- **Outputs & effects:** `{ongoingBills, expenses, oneTimeCosts, income, mortgage}`.
- **Edge cases:** Any field may be null or empty; return gracefully.
- **Rationale:** Separate from `get_finances_detail` so the model can narrow answers ("let's focus on your monthly spend").
- **Invariants:** All arrays are either null or []. All numbers are ≥0.
- **Test:** ask-tools.test.js (inline).
- **Conversational UI & a11y:** Bulleted list if 3+ items; otherwise prose. "Your monthly bills total £{sum}; annual one-time costs average £{annual/12}."

#### **3. query_listings**
- **Description:** Filter the live listings feed and return ranked summaries with fit verdicts (strong/possible/stretch/weak) and reason chips. Never returns the whole table — always a small ranked slice.
- **Trigger/entry:** Tools.ts:201–213. Called for any question about current market ("show me 3-bed homes", "what's available near Winchester", etc.).
- **Inputs & preconditions:**
  - `maxPrice?: number` — max asking price (£).
  - `minPrice?: number` — min asking price (£).
  - `minBeds?: number` — minimum bedrooms.
  - `area?: string` — village/town/postcode/area-id substring.
  - `propertyType?: string` — e.g. "detached", "cottage", "bungalow" (loose match).
  - `keyword?: string` — free text matched in title/description/address.
  - `limit?: number` — max rows to return (default 10, capped at 25).
- **Rule (precise logic):**
  - **Query builder (pure.js):** `buildListingsQuery(input)` returns `{columns, filters, order, limit}`.
    - columns: all fields IF no keyword; description ONLY if keyword (token saving, P2-1: "never raw_json / price_history's siblings").
    - filters: push-down indexed predicates to PostgREST: `{kind:'eq', col:'status', value:'live'}` (always), `{kind:'eq', col:'price', value:...}` if price bounds, `{kind:'or', expr:'area_id.ilike(...) or postcode.ilike(...)'}` if area filter.
    - order: by fit score (computed in pure.js) then price asc.
    - limit: min(Math.max(1, limit ?? 10), 25) (default 10, cap 25).
  - **Supabase query (tools.ts:204–213):** Apply filters sequentially (eq + or); order by computed column (PostgREST limitation: can't order by a JS-side score, so order by price asc as a proxy).
  - **Ranking (pure.js):** `rankAndFilterListings(rows, input, criteria)`:
    1. For each listing, call `scoreListingFit(listing, criteria)` → `{verdict, score, gated, reasons}`.
    2. Gate checks: price outside budget window → gated=true, verdict='reject'. Property-type excluded → gated=true.
    3. Filter: drop gated + status='hidden' rows.
    4. Sort: by score desc, then price asc.
    5. Return first `limit` rows with their verdicts + reason chips.
  - Fit scoring (pure.js:62–101, scoreListingFit):
    - **Hard gates:** 
      - Price > max → reject, reasons: "£{price} — over your £{max} ceiling".
      - Price < min → reject, reasons: "£{price} — under your £{min} minimum".
    - **Soft scoring (base 0.5):**
      - In-window price: +0.25 (affordabilityComfortable, "Within your budget window").
      - Unpriced: +0.10 (affordabilityStretch, "Price not listed").
      - Beds ≥ ideal: +0.15 (bedsIdeal, "{beds} beds — meets your ideal").
      - Beds ≥ min: +0.05 (bedsMin).
      - Beds < min: –0.30 (bedsBelowMin, "{beds} beds — below your {min}-bed minimum").
      - Property type preferred: +0.15 (typePreferred).
      - Property type acceptable: +0.00.
      - Property type excluded: –0.40 (typeExcluded).
      - Price in-window: +0.10 (priceInBudget, "Within your budget").
      - Price over-budget: –0.20 (priceOverBudget).
      - LISA-eligible (≤£450k): +0.08 (lisaEligible, "LISA-eligible…").
    - **Verdict bands (bandForScore):**
      - score ≥ 0.75 → strong.
      - score ≥ 0.55 → possible.
      - score ≥ 0.40 → stretch.
      - score ≥ 0.20 → weak.
      - score < 0.20 → reject.
- **Outputs & effects:** `{listings: [{rightmove_id, address, price, beds, property_type, verdict, reasons, [description]}], returned, total}`. No mutations to user data. **Dedup:** remove exact duplicates by rightmove_id (in-place).
- **Edge cases:**
  - Empty result: return `{listings: [], returned: 0, total: 0}` (not an error).
  - Malformed input (e.g., maxPrice not a number): coerce or skip the filter.
  - PostgREST filter sanitisation (tools.ts:204, buildListingsQuery: sanitizeFilterTerm strips `,`, `(`, `%` to prevent injection — **UNCONFIRMED**, code-review recommended).
  - Timeout: if Supabase query hangs (>5 s), the Edge Function timeout (~10–60 s depending on plan) will catch it and return `{type:'error'}` to the client.
- **Rationale:** Push cheap/indexed predicates (status, price, area substring) to the DB before ranking in memory. Fit scoring mirrors the browser's listing/fit.js so answers are consistent. Reason chips build transparency ("why is this strong?").
- **Invariants/acceptance criteria:**
  - Every returned listing has a verdict and ≥1 reason.
  - Gated rows are never returned.
  - Results are sorted by score desc, then price asc.
  - Returned count ≤ limit (capped at 25).
  - Reason text is human-readable (e.g., "Within your budget window", not "W[0.25]").
  - FIT_WEIGHTS in pure.js must match intelligence-constants.js (run regression test if constants change).
  - A LISA-eligible check uses the LISA_CAP_GBP constant (450_000, pure.js:33).
- **Test:** ask-tools.test.js covers scoreListingFit (gating, verdict bands), rankAndFilterListings (filter + limit), buildListingsQuery (column selection, filter expr).
- **Conversational UI & a11y:** Rendered as a bulleted list (3+ items) or prose. Each entry: "**{verdict}**: {address}, £{price}, {beds} bed{s}. {reasons joined by "; "}. {description snippet if keyword query}." Example: "**Strong**: Mill Lane, Winchester, £380k, 3 beds. Within your budget window; meets your ideal. Detached, freehold."

#### **4. get_listing**
- **Description:** Get one listing's full dossier by its Rightmove id.
- **Trigger/entry:** Tools.ts:215–224. Called when user asks to "show me details about this one" (after query_listings) or requests a specific property.
- **Inputs & preconditions:**
  - `rightmove_id: string` (required).
- **Rule:** Query `listings` table by rightmove_id (global public-read), select specific fields ONLY (not raw_json / price_history's siblings, P2-1).
  - Fields: `rightmove_id, url, title, address, postcode, outcode, area_id, price, beds, baths, property_type, tenure, epc, council_tax, status, description, added_date, price_history`.
  - No raw_json (to keep input tokens low for large descriptions).
- **Outputs & effects:** `{rightmove_id, url, …}` or `{error: "listing not found"}`.
- **Edge cases:**
  - rightmove_id not found: return error.
  - rightmove_id is empty/malformed: coerce to string, query returns nothing.
- **Rationale:** Full dossier lets the model reason about tenure (freehold/leasehold), EPC (energy efficiency), council tax band, price history (trends). Still a read-only, deterministic query.
- **Invariants:**
  - The `url` field points to the live Rightmove.co.uk listing (verifiable).
  - `price_history` is an array of {date, price} objects (historical list, not fed back as a description).
  - All PII (address, postcode, description) is marked "data, not instructions" in the prompt.
- **Test:** Inline in ask-tools.test.js.
- **Conversational UI & a11y:** Narrate as a summary: "**{address}** ({area_id}), {property_type}, {beds} beds, {tenure}, £{price}. Built {year?}. Council Tax {band}. EPC {rating}. {description}. Viewing: {url}."

#### **5. get_saved_properties**
- **Description:** Get the household's shortlist: saved listing ids with personal status (new/saved/viewed/offered/rejected) and any 1–10 ratings.
- **Trigger/entry:** Tools.ts:226–228. Called when user asks "which of my saved homes…" / "my shortlist".
- **Inputs & preconditions:** None.
- **Rule:** Fetch `shortlist` blob by household_id. Shape: `{ids: [...], status: {id: 'new'|'saved'|'viewed'|'offered'|'rejected'}, ratings: {id: 1–10}}`.
- **Outputs & effects:** Return the blob, or `{ids: [], status: {}, ratings: {}}` if null.
- **Edge cases:** If shortlist is null/empty, return gracefully.
- **Rationale:** Lets the model answer "have I rated this one?" / "how many do I have saved?".
- **Invariants:** Ratings are in range 1–10 (or null). Status values are one of the enum.
- **Test:** Inline.
- **Conversational UI & a11y:** "You have {count} saved homes: {count by status}. Your highest-rated is {address} at {rating}/10."

#### **6. get_reactions_summary**
- **Description:** Get a distilled summary of the household's like/pass/reject reactions plus their learned preference weights (what they tend to favour or avoid).
- **Trigger/entry:** Tools.ts:230–243. Called when user asks "what do I tend to like?" / "my preferences".
- **Inputs & preconditions:** None.
- **Rule:**
  - **Query 1 (RPC, tools.ts:233–234):** `supabase.rpc('ask_reaction_counts', {hh: householdId})` — a grouped read (select reaction, count(*) from listing_reactions where household_id=? group by reaction) in ONE call instead of three sequential head counts (P2-2, optimization).
    - Expected return: `[{reaction: 'like'|'pass'|'reject', n: number}, ...]`.
  - **Query 2 (tools.ts:235–237):** `learned_preferences` table (relational) — select `derived, overrides` by household_id.
    - Shapes: `{derived: {category: weight, …}, overrides: {category: weight, …}}` (e.g., {derived: {detached: 0.8, leasehold: -0.2}}).
  - **Tally (tools.ts:239–241):** Build `counts: {like: n, pass: n, reject: n}` from RPC result, default to 0.
- **Outputs & effects:** `{counts: {like, pass, reject}, learned: {…}, overrides: {…}}`.
- **Edge cases:**
  - RPC returns no rows: counts default to 0.
  - learned_preferences row missing: learned/overrides are null.
  - reaction values are non-standard: skip them (no error).
- **Rationale:** Learned preferences give the model a shorthand ("they tend to like detached homes, avoid leaseholds") so it can make personalized recommendations.
- **Invariants:**
  - Reaction counts are non-negative integers.
  - Learned weights are in range –1.0 to +1.0 (soft scores, not hard gates).
- **Test:** Inline.
- **Conversational UI & a11y:** "You've liked {like}, passed {pass}, and rejected {reject} properties. You tend to favour {top 3 from learned}, and avoid {bottom 2 from learned}."

#### **7. search_areas**
- **Description:** Search the researched area catalogue (village profiles: overview, town, county, status) by free text and/or county/town.
- **Trigger/entry:** Tools.ts:245–248. Called when user asks "tell me about areas near…" / "villages in Wiltshire".
- **Inputs & preconditions:**
  - `query?: string` — free text (matches against id, name, town, county, overview).
  - `county?: string` — exact match county (e.g., "Hampshire").
  - `town?: string` — exact match town (e.g., "Winchester").
  - `limit?: number` — max rows to return (default 10, capped at 50).
- **Rule:**
  - **Query:** `supabase.from('areas').select('id, data').limit(400)` — pull all ~200 area rows (small table, one-shot is OK).
  - **Filter (pure.js, searchAreasPure):**
    1. If county filter, keep only rows where `data.county === county` (case-insensitive).
    2. If town filter, keep only rows where `data.town === town` (case-insensitive).
    3. If query text, case-insensitive substring match against id, data.name, data.town, data.county, data.overview (priority: id > name > town/county > overview).
    4. Rank by match quality (exact id match scores highest).
    5. Return first `limit` rows (default 10, cap 50).
- **Outputs & effects:** `{areas: [{id, name, town, county, overview, status, [fields]}], returned}`.
- **Edge cases:**
  - Empty query + empty filters: return first 10 areas (error in prompt: "Please search for something").
  - No matches: return `{areas: [], returned: 0}`.
  - Malformed query (very long): substring match still works, no injection risk.
- **Rationale:** Text search lets the model explore areas the user hasn't selected yet.
- **Invariants:**
  - Every returned area has an id, name, town, county.
  - status is one of 'directory' / 'stub' / 'drafted' / 'partial' / 'researched' (mirrors CLAUDE.md §2).
  - Results are ranked by relevance (exact id match > name match > overview mention).
- **Test:** ask-tools.test.js covers searchAreasPure.
- **Conversational UI & a11y:** Bulleted list. "**{name}**, {town}, {county}. {status}. {overview snippet}. {area_id}."

#### **8. get_area**
- **Description:** Get one area's full researched record by its area id (e.g. 'winchester-so23').
- **Trigger/entry:** Tools.ts:250–255. Called when user asks "tell me more about {area}" / "what's Winchester like?".
- **Inputs & preconditions:**
  - `area_id: string` (required). Format: "town-outcode" (e.g., 'winchester-so23').
- **Rule:** Query `areas` table by id, select `id, data`. Return `{id, ...data}` (spread the data blob into the top level).
- **Outputs & effects:** Full area blob (overview, character, schools, prices, sources, imagery, market-info, etc.) or `{error: "area not found"}`.
- **Edge cases:**
  - area_id not found: return error.
  - data blob is null/malformed: return what's available.
- **Rationale:** Rich area profiles let the model discuss schools, market trends, affordability by location.
- **Invariants:**
  - Every area has id, name, town, county, postcode, overview, status.
  - sources is an array of citations (URLs, publication dates).
  - imagery (if present) has credit + licence fields (Wikimedia Commons, Geograph CC, etc., CLAUDE.md §7).
- **Test:** Inline.
- **Conversational UI & a11y:** Narrate as prose. "{Overview}. Schools: {list}. Local amenities: {snippet}. House prices trend: {data}. See {sources joined by comma}."

#### **9. get_household_areas**
- **Description:** Get the household's selected/confirmed search areas (their actual search zone).
- **Trigger/entry:** Tools.ts:257–261. Called when user asks "which areas am I searching?" / "my search zones".
- **Inputs & preconditions:** None.
- **Rule:** Query `household_areas` (relational) by household_id, select `area_id, added_via, status`.
  - `added_via`: how the area was added (e.g., "manual", "suggestion", "expand_from_area").
  - `status`: 'confirmed' | 'exploring' | 'dismissed'.
- **Outputs & effects:** `{areas: [{area_id, added_via, status}, …]}`.
- **Edge cases:** Empty result: return `{areas: []}`.
- **Rationale:** Tells the model which areas to prioritize in search results / discussions.
- **Invariants:** area_id values exist in the areas table (DB-enforced FK, not edge-case, but could be stale if a migration deletes an area — handle gracefully).
- **Test:** Inline.
- **Conversational UI & a11y:** Bulleted list. "Your search zones: {area_id} ({status}). {added_via explanation}."

#### **10. get_trends**
- **Description:** Get savings/investment trend series: investment monthly history (deposits/withdrawals/net) and the savings position.
- **Trigger/entry:** Tools.ts:263–273. Called when user asks "how is my savings trending?" / "am I on track?".
- **Inputs & preconditions:** None.
- **Rule:** Query `investments_history` (relational) by household_id, order by month asc. Select `month, deposits, withdrawals, net, dividends, interest`. In parallel, fetch finances blob (savings position).
- **Outputs & effects:** `{investmentsHistory: [{month, deposits, withdrawals, net, dividends, interest}, …], savings: {…}}`.
- **Edge cases:**
  - No investment history: return `{investmentsHistory: [], savings: {…}}`.
  - finances blob missing: savings is null.
- **Rationale:** Trends help the model discuss progress ("you've saved £X/month on average").
- **Invariants:**
  - month is a string (YYYY-MM or similar).
  - net = deposits – withdrawals (derived, can be checked).
  - All values are numbers (or null).
- **Test:** Inline.
- **Conversational UI & a11y:** Charts (if applicable) or prose. "You've saved £{total_net} over {n} months, averaging £{monthly_avg}/month. Current savings: £{savings}. On track for your goal?"

#### **11. get_journey_status**
- **Description:** Get the buying-journey progress (done/next) and the readiness checklist.
- **Trigger/entry:** Tools.ts:275–281. Called when user asks "where am I in the process?" / "what's next?".
- **Inputs & preconditions:** None.
- **Rule:**
  - **Query 1:** Fetch `journey_progress` blob by household_id (shape: {current_stage, completed_stages, next_step, notes}).
  - **Query 2:** Query `readiness_checklist` (relational) by household_id, select `item_key, item_label, completed`.
- **Outputs & effects:** `{progress: {…}, readiness: [{item_key, item_label, completed: bool}, …]}`.
- **Edge cases:**
  - progress blob missing: return null.
  - readiness rows missing: return [].
- **Rationale:** Contextualizes advice ("you're in offer stage, so focus on the survey and legal pack").
- **Invariants:**
  - completed is a boolean.
  - item_key is a unique slug (e.g., "get-mortgage-in-principle").
  - Readiness items are ~10–15 (typical checklist length).
- **Test:** Inline.
- **Conversational UI & a11y:** "You're in the {stage} stage. Done: {list of completed items}. Next: {list of incomplete items with priority}."

#### **12. get_outreach_templates**
- **Description:** List the outreach message templates (id, recipient role, stage, title, data needed).
- **Trigger/entry:** Tools.ts:283–291. Called before drafting an outreach message.
- **Inputs & preconditions:**
  - `recipientRole?: string` — optional filter (e.g., "estate-agent").
- **Rule:**
  - Fetch templates from TEMPLATES_URL (env, default `https://georgianrectory.com/data/outreach-templates.json`) via HTTP fetch (cached in _templatesCache, tools.ts:170–176).
  - If recipientRole filter provided, keep only matching templates.
  - Return mapped template list: `[{id, stage, recipientRole, title, description, dataNeeded}, …]`.
- **Outputs & effects:** Array of template metadata (not the full body, to keep context small).
- **Edge cases:**
  - Fetch fails (network, 404): return `{error: "could not load templates"}`.
  - TEMPLATES_URL points to stale/malformed JSON: try-catch, return error.
  - No matching templates: return [].
- **Rationale:** Let the model browse templates before calling draft_outreach.
- **Invariants:**
  - Template ids are unique slugs (e.g., "viewing-request-ea").
  - dataNeeded is an array of placeholder names (e.g., ["agentName", "propertyAddress", "viewingDate"]).
  - stage is one of 'search' / 'offer' / 'legal' (typical buying journey).
- **Test:** Inline.
- **Conversational UI & a11y:** Bulleted list. "**{title}** (to {recipientRole}): {description}. Needs: {dataNeeded}."

#### **13. draft_outreach**
- **Description:** Draft an outreach message from a template id, filling {{placeholders}} from the household's profile/finances and any listing/contact context you pass. Returns subject + body TEXT only — it never sends anything. Reports any placeholders it could not fill.
- **Trigger/entry:** Tools.ts:293–307. Called when user asks "draft an email to the agent".
- **Inputs & preconditions:**
  - `templateId: string` (required).
  - `listing?: object` (ad-hoc context, e.g., {address, askingPrice, ref, portal}).
  - `contact?: object` (ad-hoc context, e.g., {agentName, agentEmail}).
  - `extra?: object` (any other {{placeholder}} values, e.g., {viewingDateOption1, viewingNote}).
- **Rule:**
  - Fetch templates (cached).
  - Find template by id.
  - Gather household context in parallel: profile blob (first name, email), finances blob (savings, income, mortgage estimate).
  - Call `renderOutreachDraft(template, context)` in pure.js:
    1. Merge all context: profile, finances, listing, contact, extra.
    2. Iterate over {{placeholder}} matches in the template body.
    3. For each placeholder, look it up in the merged context (e.g., {{agentName}} → context.agentName).
    4. If found, substitute; else mark as unfilled.
    5. Return {subject, body, unfilled: [{placeholder, reason}, …]}.
  - Never send; never mutate user state.
- **Outputs & effects:** `{subject, body, unfilled: []}` or `{error: "unknown templateId"}`.
- **Edge cases:**
  - templateId not found: return error.
  - placeholder value is undefined: mark as unfilled + continue (graceful degradation, not an error).
  - template contains no placeholders: return as-is (unfilled = []).
  - User context missing (e.g., no profile): unfilled lists missing placeholders, model narrates "I couldn't fill {list}, please provide them".
- **Rationale:** Draft, don't send. Let the user review + copy-paste. Read-only, deterministic, safe against prompt injection (template is trusted, context values are treated as data).
- **Invariants:**
  - Subject and body are text-only (no HTML markup).
  - unfilled array details why each placeholder couldn't be filled (e.g., "agentName not provided").
  - No email is ever sent by the tool (user must copy-paste or use a follow-up action).
  - Placeholder format is {{lowercase_snake_case}} (consistent with the template catalogue).
- **Test:** ask-tools.test.js covers renderOutreachDraft (fill logic, unfilled reporting).
- **Conversational UI & a11y:** Display the draft as a quote block (or text box) for the user to copy. "Here's your draft:\n\nSubject: {subject}\n\n{body}\n\nCouldn't fill: {unfilled}. Please add them before sending."

---

### Coupling & dependencies (detailed)

**Frontend coupling:**
- `page-ask.js` ← `ask/{client,transcript,composer,history}.js` (module composition, event wiring).
- `ask/client.js` ← `supabase-client.js` (session JWT fetching via `supabase.auth.getSession()`).
- `ask/transcript.js` defines `TOOL_LABELS` mapping tool names (e.g., `get_finances_detail`) to human labels (e.g., `your finances`). **INVARIANT:** TOOL_LABELS must have an entry for every tool in tools.ts. Manual alignment required; no schema enforcement (§9.1.1 vocab drift risk).
- `storage/ask.js` ← `storage/core.js` (`_initSb()`, `_getHid()` for RLS client + household context).
- `page-ask.js` derives conversation title from first user turn (line 63–65); title is persisted in ask_conversations.title.

**Backend coupling:**
- `index.ts` ← `prompt.ts` (system-prompt builder), `tools.ts` (tool definitions + executors), `cors.ts` (origin allow-list).
- `tools.ts` ← `pure.js` (ranking, filtering, shaping logic). pure.js is ALSO used by Node tests (ask-tools.test.js), so it has ZERO Deno/Node imports.
- `prompt.ts` ← `pure.js` (shapeFinancesSummary to build the always-on context).
- `index.ts` forwards the caller's JWT to Supabase via the Authorization header (line 49–50), so RLS is enforced on every query.

**Data coupling:**
- **User-state tables** (criteria, finances, profile, shortlist, goals, journey_progress, area_confirmations): queried by household_id, RLS-scoped.
- **Relational tables** (household_members, household_areas, readiness_checklist, investments_history, learned_preferences): household_id filters applied explicitly (belt-and-braces on top of RLS).
- **Global tables** (listings, areas): public-read; no household_id filter (listings is live Rightmove feed, areas is the curated catalogue).
- **RPC (ask_reaction_counts):** grouped read of listing_reactions (append-only table), aggregated by reaction type, RLS-scoped to the household.

**Outreach templates:** Fetched via HTTP from TEMPLATES_URL (env, baked into the deployment). No version control on the JSON file (P9: versioning opportunity).

**CLAUDE.md coupling:**
- §2: Area mutations go via Supabase (MCP write) → sync-areas-from-supabase → build-areas.
- §18: ask_conversations is classified as user-state (source of truth = Supabase); mirroring not required (it's already in Supabase).
- §17: No write mutations via this tool set; all reads are idempotent.

---

### Test coverage & behaviours new tests must pin

**Current test coverage (ask-tools.test.js, run-intelligence-tests.mjs):**
- `scoreListingFit()`: hard gates (price over/under budget), soft scoring (in-budget, bed count, type prefs, LISA eligibility), verdict bands.
- `rankAndFilterListings()`: filter by area/price/beds, gating, dedup, respects limit (≤25), drops hidden rows.
- `buildListingsQuery()`: column selection (description only if keyword), filter expr building (eq vs or), order/limit.
- `searchAreasPure()`: text + county/town filters, limit clamp, result shape.
- `shapeFinancesSummary()`: deposit gap / months-to-target derivation.
- `renderOutreachDraft()`: placeholder substitution, unfilled reporting.
- `bandForScore()`: threshold mapping (0.75→strong, 0.55→possible, etc.).

**ask-storage.test.js (offline snapshot):**
- ask_conversations table exists + is classified as user-state.
- Row shape validation (id, title, messages array, role/content).

**Gaps — new tests should pin:**

1. **Edge Function auth + household resolution (index.ts:45–59):**
   - Valid JWT → resolves household_id successfully.
   - Invalid JWT / no session → 401 error.
   - Valid JWT but no household membership → 403 error.
   - Expired JWT → 401 (Supabase handles).

2. **Message sanitisation (index.ts:241–250):**
   - Empty messages array → 400 error ("must be non-empty").
   - Non-user/assistant roles → stripped (only user/assistant kept).
   - Message content >16k chars → truncated to 16k (no error, silent clamp).
   - History >24 turns → tail is sliced to most recent 24.
   - Thread starting with assistant turn → leading assistant turns removed (thread must start with user).

3. **Prompt caching effectiveness:**
   - Repeat questions within ~5 min reuse the static block → cache_read tokens > 0 (logged, not tested in CI).
   - Dynamic block is always recomputed (small, ~200 tokens, not cached).

4. **Tool loop termination:**
   - stop_reason='end_turn' → emit done, exit.
   - stop_reason='tool_use' with ≤6 tool calls → loop, feed results back, continue.
   - stop_reason='tool_use' exhausting MAX_TOOL_LOOPS → emit error "Reached tool-call limit…".
   - Tool call timeout (tool hangs) → Edge Function timeout (~10–60 s) returns error to client.

5. **SSE stream integrity:**
   - All text deltas are forwarded as {type:'text'} events (no buffering, streaming order preserved).
   - Tool calls are announced as {type:'tool', name} before execution.
   - Terminal event (done/error) is sent exactly once, closes the stream.
   - Stream never closes mid-answer on a tool_use (correct design — continue looping).
   - Malformed Anthropic SSE line (e.g., invalid JSON) is skipped (no crash, graceful).

6. **Tool result handling:**
   - Tool returns null → converted to "error" (or empty result, depending on tool).
   - Tool throws an error (e.g., Supabase query fails) → caught, result is `{error: "..."}`, model receives the error as tool_result.
   - Multiple tools in one turn (≤6) → all run synchronously, results accumulated in one user turn.

7. **Pure.js logic (query builder, ranker, shaper):**
   - buildListingsQuery: filter expr is properly SQL-injected-proof (comma/paren stripping — code-review needed).
   - scoreListingFit: verdicts are deterministic given the same listing + criteria (no randomness).
   - rankAndFilterListings: sort order is stable (same score → price asc).
   - searchAreasPure: ranking by relevance (exact id match > name > town/county > overview).
   - shapeFinancesSummary: gap calculation handles zero/negative deposit_target gracefully.
   - renderOutreachDraft: unfilled array is accurate (no false positives/negatives).

8. **Browser-side streaming + DOM rendering (ask/client.js, transcript.js, page-ask.js):**
   - SSE events arrive in order (text → text → tool → text → done).
   - token() calls append to innerHTML incrementally (mdToSafeHtml called on accumulated raw text).
   - tool() updates the status line without resetting the content bubble.
   - end() removes the status line, appends "Sources: …" footnote.
   - error() shows alert, removes status line, finalizes the bubble with error class.
   - Auto-scroll (scrollToEnd) works only when reader is near bottom (no jarring scrolls).
   - Textarea autosize: rows expand on input, max-height enforced by CSS.
   - Enter-to-send, Shift+Enter=newline, Send/Stop toggle (button visibility + disabled state).

9. **History module (history.js):**
   - listAskConversations(): fetches threads by household_id, ordered by updated_at desc.
   - Rename: input + commit on Enter/blur/Escape (cancel, no save).
   - Delete: removes the row from Supabase + refreshes the list. If current thread is deleted, triggers onNew() (reset thread state).
   - Switch: loads conversation via getAskConversation, replays bubbles via appendUser/appendAssistant.

10. **Markdown renderer escape-first (transcript.js:143–197):**
    - All input characters are HTML-escaped first (no `<` / `>` / `&` injection).
    - Safe tags emitted: `<strong> <em> <code> <a> <h1–6> <ul> <ol> <li> <p> <pre> <br>`.
    - Links: only http/https allowed, no javascript: or data: URLs.
    - Fenced code blocks: ``` opening/closing, content is escaped.
    - Lists: `- ` or `* ` for ul, `1. ` for ol (greedy, matches leading whitespace).
    - Headings: `# ` to `###### ` (h1 to h6).
    - Paragraphs: consecutive non-blank lines joined by `<br>`.
    - **Invariant:** No `<script>`, no event handlers, no `<iframe>` (or anything else not in the safe list).

11. **Persistence (page-ask.js:52–100, storage/ask.js):**
    - After stream ends, if text.trim() || tools.length, append to state.messages.
    - createAskConversation: INSERT returns row with generated id (UUID or similar).
    - saveAskConversation: UPDATE preserves all fields (title, messages, created_at).
    - Messages are stored as jsonb array: `[{role, content, tools?}, …]`.
    - tools array is reconstructed from `event.name` sequence during streaming, stored, and restored on conversation load.

12. **Error recovery:**
    - Network error mid-stream → {type:'error', message:'connection interrupted'}, stream closes, no retry.
    - Anthropic API error (non-200) → {type:'error', message:'Anthropic API error (status): detail'}, stream closes.
    - Missing household_id → 403, user is redirected to login by auth-guard.js (outside Ask's scope, but a precondition).

13. **Integration test (full Ask turn):**
    - User types "Show me 3-bed homes under £400k near Winchester".
    - page-ask.js sends text → askStream → Edge Function → Anthropic.
    - Anthropic responds with a thought → tool call (query_listings) → Anthropic continues → text → done.
    - transcript.js renders: first tool status "Checking live listings…" → replaced with text → "Sources: live listings".
    - storage/ask.js persists the thread.
    - User clicks "History" → loads the saved thread → replays all bubbles correctly.
    - Renaming the thread persists the new title.

---

### Known smells / tech debt / risks

#### Prompt brittleness
- **System prompt is prose.** STATIC_PROMPT in prompt.ts is a long English block (49 lines, ~1500 tokens) with no schema enforcement. No version field, no diffs against changes. A refactor to JSON schema (P2 in §11.2) would enable versioning, validation, and easier audits.
- **UK FTB facts hardcoded.** LISA cap (£450k), Stamp Duty rules (April 2025), survey costs are copied from docs/CONTEXT.md into the prompt. A single source of truth (e.g., data/static/fib-facts.json + a prompt builder) would reduce drift risk and enable rapid updates (e.g., if Stamp Duty rules change).
- **Vocabulary drift.** TOOL_LABELS in transcript.js must match tool names in tools.ts (13 mappings, manually aligned, no schema enforcement). If a tool is renamed or added, the mapping breaks silently (user sees "Checking get_new_tool…" instead of a friendly label). Suggested: export TOOL_LABELS from tools.ts as a const, import in transcript.js, add a runtime assertion in index.ts or tests.

#### Model / version config
- **Model string hardcoded in index.ts (line 24).** DEFAULT_MODEL = "claude-haiku-4-5", ALLOWED_MODELS = Set(["claude-haiku-4-5", "claude-sonnet-4-6"]). If Anthropic releases claude-fable-5 or deprecates haiku, the allow-list must be updated and re-deployed. No feature flag / environment-driven config. Consider a Supabase config table (org_settings: model_allow_list, default_model) so a non-code deploy can pin a new model (P3 in §11.3).
- **No thinking parameter sent (index.ts line 90, comment line 22).** The prompt explicitly says "No thinking parameter is sent, so thinking stays off (zero thinking tokens)." If a future model (e.g., claude-opus-5) has default-on thinking and the contract changes, the max_tokens ceiling (1024) will be consumed by thinking first, starving actual output tokens. Safe for now (Haiku, Sonnet have thinking off by default), but monitor at redeploy. When thinking is released for Fable (if it is), run a cost analysis.
- **claude-opus-4-8 explicitly removed.** ASK.md §5 says "Opus's default-on thinking is the wrong shape [for this workload]." This is a user-intent constraint (brevity, cost), not a technical block. Document why in index.ts (currently just an omission from ALLOWED_MODELS, line 25 comment could be clearer).

#### Tool safety / scoping
> **✅ External validation — tool scoping (F4):** Read-only tools confirmed. Reinforce that the
> **strongest control is RLS via a forwarded user JWT** (see E4) — not the in-code `household_id`
> filters. **Keep the usage logging**; and note `count_tokens` (a **free** endpoint) can be wired into
> CI to **gate prompt bloat** (fail the build if the static/system prompt grows past a budget).
> (Claude Docs: Token counting.)

- **Read-only tools.** All 13 tools are read-only; draft_outreach returns text, never sends. BUT:
  - **Prompt injection via tool data.** Listing descriptions, area notes, contact names are treated as data (marked "data, not instructions" in the prompt). This is correct but fragile — depends on the model respecting the "treat as data" instruction. A code-review refactoring could add a `@noexec` or `sanitized:true` marker to each tool's output schema, making injection intent harder to exploit. mdToSafeHtml on the client is a second defense (escape-first), but the server should not rely on it.
  - **PostgREST filter sanitisation.** buildListingsQuery (pure.js) sanitizes filter terms by stripping commas, parens, % before building filter expressions. Is this exhaustive against PostgREST `.or()` / `.eq()` / `.ilike()` syntax? Example: can an attacker pass `a or 1=1 --` and break the query? **Code review recommended** (P2-2, ask-tools.test.js should include injection test cases).
- **Tool argument schema.** 4 tools (query_listings, get_listing, search_areas, get_area) use `strict: true, additionalProperties: false`. draft_outreach is non-strict (listing/contact/extra free-form by design). Current Anthropic API version (2023-06-01) supports strict tool use. ASK.md §5 says to "smoke-test after deploy to confirm the current API line needs no beta header for `strict`." Not currently validated in CI (add to Phase 4 integration tests, §11.4).
- **No audit log.** Each Ask call logs usage (input, output, cache_read, cache_write, thinking tokens) to Deno logs (visible in Supabase logs). The full conversation is persisted to ask_conversations, but there's no explicit audit of which tools were called, what data they returned, or whether an answer was accurate. Manual review of usage logs + conversation history is possible but not automated. For a data-sensitive app, consider a separate audit_log table (read-only, append-only per household).

#### Streaming & latency
- **SSE stream never closes on tool_use.** Correct design (the client doesn't see the tool call as "done" mid-answer), but:
  - If a tool call fails (e.g., RPC error, Supabase down) and the model stops, the client receives {type:'error'} and the stream closes. Conversely, if the stream is interrupted mid-delta (network hiccup), the client shows "interrupted" error (ask/client.js line 62). Recovery is a fresh "Re-run the question" (user retry), not resumption. This is acceptable for a read-only tool set (no state corruption risk).
  - Tool execution (runTool) is synchronous in the loop (index.ts line 123). If a tool hangs (e.g., Supabase query timeout), it blocks all downstream tool calls in that turn. Max timeout is the Edge Function's hard timeout (varies by Supabase plan: typically 10–60 s for paid, 30 s for free). Consider async timeouts or a tool-call budget (time, not just count) to prevent one slow tool from stalling the whole response (P4 in §11.4).
- **Prompt-caching benefit depends on question distribution.** The static block is marked `cache_control:ephemeral`, so repeat questions within ~5 min reuse the cache for ~90% savings (see usage logging, index.ts line 142–144). If a user asks only once per day, cache hit-rate is 0. The dynamic context block is always recomputed (it's small, ~200 tokens, not cached). This is efficient; no risk. Monitor cache_read vs cache_write usage logs in a cost dashboard to verify the benefit.
- **Streaming token insertion.** token() calls increment .innerHTML on every delta. For very long responses (max 1024 tokens output), this could be slow on older devices (400+ DOM mutations). Consider a debounced innerHTML update (every 100 ms or 10 tokens) for better UX. Not a bug, but a latency risk.

#### Error handling
- **Error surfaces as {type:'error', message}** in SSE stream, rendered as a red alert in the transcript. No retry logic at the client level — user must click "New chat" or re-send the question. For a read-only tool set (no state corruption risk), this is acceptable. But for production, consider:
  - Automatic retry on network timeout (with exponential backoff).
  - A "retry" button in the error message (instead of starting over).
  - Differentiate user error (malformed input) from server error (API down).
- **Tool failures return {error: "..."}** and the model receives the error as a tool_result. The model may hallucinate a recovery or apologize. No explicit tool-failure budget or escalation (e.g., "if 3 tools fail, stop"). The model generally handles "tool X failed" gracefully, but hasn't been extensively tested. Suggested: add a circuit breaker (P4, if ≥3 consecutive tools fail, stop and emit "too many failures").
- **Anthropic API errors (non-200 status)** are logged in index.ts (line 95) and relayed as {type:'error', message, detail}. The detail is truncated to 500 chars (line 94, safeText) to prevent token waste on error payloads. No alerting or automatic retry. For production, send errors to a monitoring dashboard (e.g., Sentry, LogRocket) and set up alerts for >5 errors/min per org.

#### Deno Edge Function deploy path
- **No local dev environment.** The Edge Function code (index.ts, tools.ts, prompt.ts, pure.js) runs only in the Deno runtime on Supabase; it's not tested locally (no local Deno REPL wired into the harness). A refactor to split pure.js (already portable) from tools.ts (Deno-specific) would allow offline unit tests of the query builders + tool logic without a local Deno runtime, but the RLS-scoped Supabase integration still needs an online test. (This is a design constraint of the current architecture, not a bug.)
- **Deploy via `supabase functions deploy ask`.** The source is version-controlled (supabase/functions/ask/); the dashboard editor is ignored. A stale deploy (developer runs tests locally, edge code drifts, a git pull misses the deploy step) is a known failure mode. No CI/CD hook (e.g., "deploy on push to main"). Deploy is manual + documented in ASK.md §4. Suggested: add a GitHub Action (on push to main) or a pre-commit hook reminder (on git commit -m "ask.*").
- **ANTHROPIC_API_KEY is a Supabase secret.** Stored securely, never in the repo. A leaked key can be rotated via the Anthropic Console. The Supabase secret must be set once at deploy time (`supabase secrets set`) and is then baked into the deployment. No per-turn key rotation (not necessary, Anthropic rate-limits per key/org).

#### Security of tool outputs
- **No PII masking.** Tools return real listing descriptions, area overviews, profile first names, etc. These are the user's own data (RLS-scoped to their household), so leaking to Anthropic is acceptable (all sent via the Anthropic API, which is SOC2-audited). BUT:
  - Streaming markdown via mdToSafeHtml is escape-first (safe against injection).
  - The Anthropic API call is made from the Edge Function (never client-side), so the API key is not exposed.
  - Tool data is marked "data, never instructions" in the prompt, so the model is (theoretically) less likely to follow embedded commands. This is a soft control, not a hard one.
  - IMPORTANT: The Edge Function forwards the caller's JWT to Supabase (index.ts line 49–50), so RLS is enforced. If JWT is leaked, an attacker can read the household's data. Suggest: rotate JWTs frequently, use secure cookies (not localStorage), monitor for JWT extraction exploits.
- **No audit log.** See above (Streaming & latency section).

---

### Refactor opportunities (Fable to sequence)

#### **P1: Model upgrade (IMMEDIATE — claude-fable-5 when released)**
The system prompt and tool design are optimized for Haiku (cheapest tier, tool-routing + short narration, deterministic work in pure.js). **If Anthropic releases claude-fable-5 (a new cheaper tier), this is an immediate candidate:** Fable is designed for tool use, structured output, and cost efficiency. Consider:
- Swap DEFAULT_MODEL to `claude-fable-5` if/when released (index.ts:24).
- Verify prompt-caching works identically (ephemeral marking, ~90% cost savings).
- Run the same smoke test: a question from the browser console, confirm 200 + SSE stream.
- Benchmark: compare input/output/cache token costs vs Haiku. Expected: Fable < Haiku.
- No refactor needed to the prompt or tools; just a config change in index.ts.
- **Effort:** 30 min (change one string, redeploy, smoke test). **Risk:** low (rollback = revert, redeploy).

#### **P2: Tool input sanitisation audit (HIGH — security)**
PostgREST filter builder (buildListingsQuery, pure.js) sanitizes via `sanitizeFilterTerm` (strip `,`, `(`, `%`). Is this exhaustive?
- Add explicit injection test cases to ask-tools.test.js: `query_listings({area: "a' or 1=1 --"})` should NOT return all listings.
- Review filter expr building (tools.ts line 206–209): does PostgREST `.eq()` / `.or()` / `.ilike()` have edge-case vulnerabilities?
- Document the assumption: "PostgREST parameterizes values, so our term is data, not code."
- **Effort:** 2–3 h. **Risk:** low (test-only unless issues found, then fix + redeploy).

#### **P3: Structured prompt format & versioning (MEDIUM)**
Replace the prose STATIC_PROMPT with a JSON schema (identity, domain, vocabulary, safety rules, UK FTB facts, tool guidance). Allows versioning, diffing, schema validation, and easier tool-to-prompt alignment.
- Example structure:
  ```json
  {
    "version": "2026-06-16",
    "identity": { "role": "Ask assistant", "context": "Georgian Rectory, UK household home search" },
    "domain": { "entities": ["criteria", "finances", "listings", …], "vocabulary": {"fit_verdicts": ["strong", "possible", "stretch", "weak", "reject"]} },
    "fib_facts": { "lisa_cap": 450000, "sdlt_rules": […], "survey_costs": […] },
    "safety": { "data_handling": "…", "injection_defense": "…" },
    "tools": [{ "name": "query_listings", "description": "…" }]
  }
  ```
- Build system prompt from the structure in prompt.ts.
- Ensure output is byte-identical to the current prose (no behavioral change).
- Add schema + version validation.
- **Effort:** 4–6 h. **Risk:** low (structured output can be diffed against the original).

#### **P4: Async tool loop + circuit breaker (MEDIUM)**
Replace the synchronous tool-loop (runTool) with async Promise.all + timeouts.
- Use `Promise.race([toolCall, timeout])` to enforce per-tool timeout (e.g., 2 s default).
- Add circuit breaker: if 3 consecutive tool calls fail, stop and emit error (instead of looping until max).
- Update error messages to distinguish tool failure from API error.
- Re-run Phase 4 + Phase 6 tests (below).
- **Effort:** 3–4 h. **Risk:** medium (changes streaming behavior; needs re-test).

#### **P5: Tool output validation + TypeScript schema (MEDIUM)**
Formalize tool return shapes (currently returned as-is, typed as unknown in several places).
- Add TypeScript interfaces for each tool's return type in tools.ts.
- Validate all returns against schema before SSE relay (index.ts, relayAnthropicSSE).
- Example:
  ```ts
  interface GetListingsResult {
    listings: { rightmove_id: string; verdict: 'strong'|'possible'|'stretch'|'weak'|'reject'; reasons: string[] }[];
    returned: number;
  }
  ```
- Allows type checking + catches schema drift at runtime.
- **Effort:** 2–3 h. **Risk:** low (additive, no breaking changes).

#### **P6: Integration tests for Edge Function (HIGH — confidence)**
Add a test suite that runs against a test Supabase instance + mock Anthropic API (or a real API key with low spend cap).
- Test JWT auth (valid/invalid/expired tokens).
- Tool calls: query_listings with various filters, get_area lookup, draft_outreach fill.
- Error handling: missing household_id, malformed JSON, Anthropic API errors.
- SSE stream completeness: all events received, stream never hangs.
- RLS enforcement: a JWT from household A can't see household B's data.
- **Effort:** 6–8 h. **Risk:** medium (requires Supabase admin access + test key management).

#### **P7: Client-side module tests (transcript, composer, history) (MEDIUM)**
Add Jest or Vitest tests for ask/{composer,transcript,history}.js DOM manipulation + event handling.
- Mock Supabase storage.
- Mock ask/client.js (return fake SSE events).
- Test:
  - composer: Enter-to-send, Shift+Enter newline, chip click, offline guard, streaming button toggle.
  - transcript: bubble rendering, markdown escape, tool status line, auto-scroll, aria-live updates.
  - history: list refresh, rename input + commit, delete + reload, switch conversation load.
- **Effort:** 4–6 h. **Risk:** low (isolated, no backend needed).

#### **P8: Async streaming debounce (PERFORMANCE)**
Debounce token() calls to avoid excessive DOM mutations (every 100 ms or 10 tokens, not every delta).
- Update transcript.js: beginAssistant() returns {token(t)}, batch the text and update .innerHTML on a timer.
- Measure latency before/after (user perception of "snappiness").
- **Effort:** 1–2 h. **Risk:** low (cosmetic, no logic change).

#### **P9: Config table for model/tool management (MEDIUM)**
Move DEFAULT_MODEL, ALLOWED_MODELS, tool enable-list, prompt version to a `ask_config` Supabase table (or org_settings).
- Allows non-code deploys: set a new model via the Supabase dashboard without re-deploying the Edge Function.
- Requires adding a config read (with caching) to buildSystemPrompt or index.ts start.
- Schema: `{org_id, key, value, updated_at}` or `{org_id, default_model, allowed_models, tool_enable_list, prompt_version}`.
- **Effort:** 2–3 h. **Risk:** low (additive, no breaking changes).

#### **P10: Tool vocabulary enum (LOW — cleanup)**
Export TOOL_LABELS as a const from tools.ts; import in transcript.js and index.ts. Add a runtime assertion in tests that every tool in TOOLS has a TOOL_LABELS entry.
- Prevents vocab drift (renaming a tool or adding a new one won't silently break the UI).
- **Effort:** 1 h. **Risk:** negligible.

#### **P11: PII masking / anonymization mode (MEDIUM — UX)**
For sensitive contexts (e.g., sharing an Ask conversation, user support), add a mode that:
- Strips real names from profile context.
- Redacts specific prices / postcodes (e.g., "Property in [Area]" instead of "5 Mill Lane, Winchester, SO23 1AB").
- Returns a "sharable transcript" that's informative without exposing private data.
- **Effort:** 3–4 h. **Risk:** low (new feature, no breaking changes).

#### **P12: Outreach template versioning & A/B testing (MEDIUM — future)**
The outreach-templates.json is fetched from TEMPLATES_URL (default georgianrectory.com/data/outreach-templates.json). Currently no versioning or rollback.
- Add a version field (templates: {version, items: […]}) in the JSON.
- Store each version as a Supabase table row (like areas) instead of static JSON.
- Allows A/B testing, rollback, and user-customization (each household can have its own variants).
- **Effort:** 4–6 h. **Risk:** medium (requires new table + migration).

#### **P13: Conversation export + embedding (MEDIUM — discovery)**
Allow users to:
- Export a conversation as Markdown / PDF.
- Embed a conversation (or a single answer) on the app dashboard as a tile, so previous answers are discoverable without re-asking.
- Store conversation embeddings (via Anthropic Batch API or Pinecone) for semantic search across all past conversations.
- **Effort:** 6–10 h. **Risk:** medium (new dependencies, rate-limit Anthropic embedding API).

---

### Suggested sub-phases (draft — if Fable owns a refactor)

If Fable is asked to execute refactoring, suggest these phases in order:

1. **Phase 1: Model upgrade + deploy validation** (P1 + smoke test)
   - Update DEFAULT_MODEL to claude-fable-5 (or latest), ALLOWED_MODELS as needed.
   - Redeploy via `supabase functions deploy ask`.
   - Smoke test from browser console (docs/ASK.md §4).
   - **Time:** 30 min. **Risk:** low (rollback = revert index.ts, re-deploy).

2. **Phase 2: Tool input sanitisation audit** (P2)
   - Add injection test cases to ask-tools.test.js.
   - Review filter expr building in tools.ts.
   - Document assumption / fix if issues found.
   - **Time:** 2–3 h. **Risk:** low (test-only unless issues found).

3. **Phase 3: Tool output validation + TypeScript schema** (P5)
   - Add TypeScript interfaces for each tool's return type.
   - Validate returns before SSE relay.
   - **Time:** 2–3 h. **Risk:** low (additive).

4. **Phase 4: Integration tests for Edge Function** (P6)
   - Spin up a test Supabase instance (or use staging org).
   - Write test suite (TS/Node) that calls the Edge Function with real JWT + test data.
   - Cover auth, tools, SSE, error paths.
   - **Time:** 6–8 h. **Risk:** medium (requires admin access).

5. **Phase 5: Client-side module tests** (P7)
   - Add Jest/Vitest config.
   - Write tests for ask/{composer,transcript,history}.js.
   - **Time:** 4–6 h. **Risk:** low (isolated).

6. **Phase 6: Async tool loop + circuit breaker** (P4)
   - Replace synchronous runTool with async Promise.all + timeouts.
   - Re-run Phase 4 tests.
   - **Time:** 3–4 h. **Risk:** medium (changes streaming).

7. **Phase 7: Structured prompt format** (P3)
   - Refactor STATIC_PROMPT into JSON schema.
   - Build system prompt from the structure.
   - Ensure byte-identical output (no behavioral change).
   - **Time:** 4–6 h. **Risk:** low (structured output can be diffed).

8. **Phase 8: Tool vocabulary enum** (P10)
   - Export TOOL_LABELS from tools.ts.
   - Add runtime assertion in tests.
   - **Time:** 1 h. **Risk:** negligible.

9. **Phase 9: Config table + non-code deploys** (P9)
   - Create `ask_config` table.
   - Update index.ts to read config on startup.
   - Add migration via MCP.
   - **Time:** 2–3 h. **Risk:** low (additive).

10. **Phase 10: Conversation export + embedding** (P13)
    - Add export to Markdown in page-ask.js + CSS for print.
    - Optionally add embedding storage (Pinecone or pgvector in Supabase).
    - Implement semantic search across past conversations.
    - **Time:** 6–10 h. **Risk:** medium (new dependencies).

---

### Tailored Q&A for the owner

1. **What's the most common Ask question type, and is Haiku 4.5 accurate enough?**
   If "show me 3-bed homes under £400k near Winchester" is the primary use case, Haiku is perfect (deterministic filter + rank in pure.js). If users ask complex financial scenarios ("I save £1,500/month; when can I afford a £450k LISA-eligible home with a £200k deposit?"), the model's reasoning matters more — consider Sonnet for that segment. **Action:** Log question category + answer rating to find breakpoints.

2. **How important is conversation history?**
   Currently, threads persist full messages in ask_conversations, and the Edge Function sends only the recent 24 turns to Anthropic (MAX_HISTORY_TURNS). Should the app offer:
   - Conversation summaries (use Anthropic batch API to summarize each thread offline)?
   - Semantic search across past answers (embedding-based)?
   - Or is the current chronological list sufficient?
   **Action:** Check user analytics: are they scrolling history, or starting fresh each time?

3. **Should the assistant be able to send email or trigger actions?**
   Today, draft_outreach returns text only; the user copy-pastes to compose an email. Should the assistant be able to (a) autofill and send a draft directly, (b) create a listing reminder, (c) save a new area filter? If so, which tools should be write-enabled and under what constraints (approval flow, audit log)?
   **Action:** Prioritize by impact + complexity.

4. **Prompt accuracy / hallucination: have you seen examples where the assistant gives wrong figures or invents listings?**
   The pure.js scoring + ranking logic is deterministic, but the model's narration can be fuzzy ("Your stretch payment is roughly £1,850" when the actual figure is £1,847). Is +/- 2–3% acceptable, or should answers be hedged more ("approximately £1,850, based on your finances as of today")? Consider logging user corrections/ratings per answer to track.
   **Action:** Set a floor for accuracy (e.g., "financial figures within £50, listing fits are deterministic").

5. **Cost & usage patterns: what's a typical monthly ask bill per household, and have you set a Supabase + Anthropic spend cap?**
   Expected: $0.02–$0.10 per household per month (Haiku at $1/$5 per 1M tokens, a question ~300 input + 100 output tokens, cache savings ~90% on repeats). If households are asking 20+ times/month, consider caching / rate-limiting or a per-household spend cap (Anthropic Console allows this). **Action:** Verify usage logs are being shipped to a cost-tracking dashboard.

6. **Trust & transparency: if an answer is wrong, can the user see which tool calls were made and what data the assistant saw?**
   The "Sources: …" line shows tool names, but not the full results. Should the UI offer a "show working" mode that expands each tool result inline (e.g., "query_listings returned 5 candidates; here's the fit scoring for each")? This builds confidence but also reveals algorithm bias.
   **Action:** A/B test with users: does showing "working" increase trust or just overwhelm?

---

### Summary

The Ask assistant is a **conversational interface over household data**, powered by Claude (Haiku by default) via a stateless Supabase Edge Function. The design is **cost-optimized** (prompt caching ~90%, deterministic ranking in pure.js, small context window) and **read-only** (no mutations). **13 tools** fetch the household's finances, listings, areas, shortlist, and journey progress; pure.js filters/ranks results; the model narrates in plain English. Conversations persist in ask_conversations (user-state), and the browser owns the thread state. **Risks:** prompt brittleness (prose, hardcoded facts), vocab drift (TOOL_LABELS manual alignment), tool-injection fragility (soft control, not hard), and no local dev loop for the Edge Function. **Opportunities:** model upgrade to Fable (P1), structured prompt (P3), config table (P9), tool circuit-breaker (P4), integration tests (P6), and client tests (P7). **Current coverage:** pure.js helpers are unit-tested; ask_conversations schema is validated; but no E2E tests for the Edge Function itself or the streaming pipeline.
## 10.8 Segment: Profile, criteria, setup, journey & outreach

### Design anchors & guard-rail surface

**Design anchors:** Stripe-docs (editorial restraint, generous whitespace, field-list clarity) for profile/journey/outreach; form-led (stepped, progressive disclosure) for setup/criteria.  
**Guard-rail surface (§16, NEVER REWRITTEN):** 
- `assets/js/storage/user-state.js` — extend only (core `getProfile/saveProfile/getCriteria/saveCriteria`, refinement writers `setAreaRadiusOverride/raiseBudgetMax/lowerMinBeds`). 
- `assets/js/storage/outreach.js` — extend only (core `getContacts/saveContacts/getOutreachLog/saveOutreachLog`, read-only `getAreaConfirmations`).
- Both are re-export shims over `storage/core.js`; mutation happens in the core module (P8).

---

### File inventory (absolute paths)

| File | Lines | Purpose | Entry point(s) |
|------|-------|---------|-----------------|
| `/home/user/rec/pages/profile.html` | ≈150 | Three-section article: About you (editable summaries) / Application detail (structured person/employment/credit/debts/pension) / Search criteria (budget/size/types/tenure/features/condition). Edit dialogs + sticky save bar + local-edit badge. | `<body data-page="profile">` |
| `/home/user/rec/pages/setup.html` | ≈80 | Minimal shell (`<div id="wizard-root">`) for the branching onboarding wizard. No inline logic. | `<body data-page="setup">` |
| `/home/user/rec/pages/journey.html` | ≈100 | Timeline HTML: phase nodes (static structure from journey.json), step rows (clickable), modal shell for task detail + checklist. | `<body data-page="journey">` |
| `/home/user/rec/pages/outreach.html` | ≈180 | Email generator: template grid, stage+role filter bars, dialog for context + preview, contacts tab (CRUD list), log tab (sent emails). | `<body data-page="outreach">` |
| `/home/user/rec/assets/js/page-profile.js` | 219 | Profile coordinator: loads all three cards (About you / Application detail / Search criteria), wires edit dialogs, renders tile summaries (budget/deposit/saved/window), manages unsaved-change badge. Imports from `page-profile-detail.js` and `page-criteria.js` for sub-page logic. | `<script type="module" src="page-profile.js">` |
| `/home/user/rec/assets/js/page-profile-detail.js` | 162 | Read-only Application detail card: renders person, employment, credit, debts, pension from nested `profile.structure`, includes follow-up checklist (tasks marked `_followUp` in the schema). Uses `normalizeProfile()` to fold all historical shapes. | Imported by `page-profile.js`; no direct DOM binding. |
| `/home/user/rec/assets/js/page-profile-page.js` | 34 | Page guard + coordinator: (1) data-guard checks `hasRealUserData(profile)`; if false (redacted `_SAMPLE` fixture or null), routes to `/pages/setup.html` before render; (2) save-bar proxy delegates Cancel/Save to criteria section buttons. Prevents flash via `html[data-profile-state="pending"]`. | Runs synchronously at page init (not async module load). |
| `/home/user/rec/assets/js/page-criteria.js` | ≈180 | Criteria read/edit: renders budget/size/property-types/tenure/features/condition/keywords/mortgage/priorities inline, togglable edit mode, sticky save bar at bottom (Edit/Cancel/Save/Reset buttons), shows "unsaved changes kept locally" message. Imports `criteria/form.js` builders. | Imported by `page-profile.js`. |
| `/home/user/rec/assets/js/page-setup.js` | ≈80 | Setup init: loads current profile/criteria/finances/goals + areaCount; detects if household is empty (no real data) → seed fresh state; initializes wizard state machine; routes to `/pages/profile.html` on finish. | `<script type="module" src="page-setup.js">` |
| `/home/user/rec/assets/js/setup/wizard.js` | ≈300 | Branching state machine: renders one step at a time from `steps.js`, applies conditionals (`visibleFields()`, `includedSteps()`), enforces required gate (name/email/budget/≥1 area), autosaves via `setNested()` merge, shows per-step + overall completeness %, offers Review summary, handles Finish. Pure logic except DOM render. | Imported by `page-setup.js`. |
| `/home/user/rec/assets/js/setup/steps.js` | ≈250 | Declarative step + field definitions: 8–10 steps (welcome, about-you, work, finances-income, mortgage, deposit, savings, areas, review). Each step has `id`, `title`, `intro`, `fields[]`. Field: `{ path (blob-prefixed), label, type, options, when?(state) }`. Export `BUYING_SITUATIONS`, `EMPLOYMENT_BASES`, `SELF_EMPLOYMENT_STRUCTURES`, `visibleFields(step, state)`, `includedSteps(state)`. Branching via predicates (`isCashBuyer`, `isJoint`, `isSelfEmployed`, etc.). | Imported by `wizard.js` + `completeness.js`. |
| `/home/user/rec/assets/js/setup/validate.js` | ≈100 | Field validator: `validateField(field, value)` returns `{ valid, error }` (required, email format, numeric bounds). `checkRequiredGate(state)` checks that visible required fields are filled + ≥1 area. Pure logic. | Imported by `wizard.js`. |
| `/home/user/rec/assets/js/setup/completeness.js` | ≈50 | Completeness calculation: `fieldValue(state, field)` resolves current value (handles special `@areas`, `@health-consent` paths). `stepCompleteness(step, state)` → `{ filled, total, status: 'not-started'|'partial'|'complete' }` (counts only visible, non-consent fields). `overallCompleteness(state)` → `{ filled, total, percent }` excluding welcome+review steps. Pure logic. | Imported by `wizard.js` for per-step chips + global meter. |
| `/home/user/rec/assets/js/setup/autosave.js` | ≈50 | Nested get/set + debounced saver: `getNested(obj, path)` / `setNested(obj, path, value)` are pure (no IO); `setNested` creates intermediate objects, never clobbers siblings. `makeAutosaver(saveFns, ms=600)` → `{ queue(name, blob), flushAll() }` coalesces rapid edits into one save per blob per `ms`. Used by wizard on every field change. | Imported by `wizard.js`. |
| `/home/user/rec/assets/js/setup/a11y.js` | ≈80 | Keyboard nav + focus management + live regions: Tab cycles through visible fields (trap focus inside wizard), Enter submits, Escape cancels. Focus management on step change (restore previous focus or default to first field). Live region announcements for step transitions ("Step 2 of 7: Work") + completeness updates. | Imported by `wizard.js`. |
| `/home/user/rec/assets/js/page-journey.js` | ≈200 | Timeline coordinator: loads `data/journey.json` (static) + `journey_progress` user-state (task checkmarks), renders phases → steps (each clickable). Click step → open modal with blurb + task checklist (each task toggleable). Ticking a task → `saveJourneyProgress()` (Supabase write). If task has `outreachTemplateId`, show "→ Email" link to `/pages/outreach.html?templateId=<id>`. | `<script type="module" src="page-journey.js">` |
| `/home/user/rec/assets/js/journey/progress.js` | ≈80 | Task progress derivation: `computeProgress(journeyData, progressState)` → `{ currentPhase, currentStep, stepProgress (done/total), phaseProgress, overall (%), tasksDone }`. Handles missing tasks gracefully. Pure logic. | Imported by `page-journey.js`. |
| `/home/user/rec/assets/js/page-outreach.js` | ≈250 | Outreach coordinator: loads templates (static `data/outreach-templates.json`), profile, criteria, finances, contacts, log. Renders grid (filtered by `activeStage`+`activeRole`), init filters from `?templateId=` deep-link. Grid click → dialog. Wires filter changes → re-render. Manages contacts/log tabs. | `<script type="module" src="page-outreach.js">` |
| `/home/user/rec/assets/js/outreach/grid.js` | ≈100 | Template tile renderer: filter templates by stage+role, render each as a clickable card (title, description, bestPracticeNotes preview). Attach click handler to open dialog with `templateId`. Uses `state` global. | Imported by `page-outreach.js`. |
| `/home/user/rec/assets/js/outreach/filters.js` | ≈50 | Filter UI: stage chip row + role chip row, both with click handlers. Toggle active state, re-render grid on change. Mutate `state.activeStage` / `state.activeRole`. | Imported by `page-outreach.js`. |
| `/home/user/rec/assets/js/outreach/dialog.js` | ≈250 | Modal dialog generator: contact picker (select from saved list or free-text new), context fields (listing address/price/portal-ref, viewing date A/B options), preview pane. Placeholder substitution via `renderTemplate()`. Quantity-of-Information Ladder: only render context fields for keys in template's `dataNeeded`. Copy/Send buttons (send writes to `outreach_log`). | Imported by `page-outreach.js`. |
| `/home/user/rec/assets/js/outreach/contacts.js` | ≈150 | Contact list renderer: tab showing saved contacts grouped by role (agents/brokers/solicitors/surveyors). Add/edit/delete buttons (inline CRUD or modal form). | Imported by `page-outreach.js`. |
| `/home/user/rec/assets/js/outreach/context.js` | ≈100 | Context resolver: given a `templateId` + user-state, extract the profile, criteria, finances, contacts + property context (listing details if available), feed into `renderTemplate()`. Handles missing context gracefully (substitutes `[missing data]`). | Imported by `dialog.js`. |
| `/home/user/rec/assets/js/outreach/log.js` | ≈100 | Log tab renderer: list sent emails from `outreach_log` user-state (timestamp, recipient, subject, body preview). Archive/delete actions (mutation + Supabase write). | Imported by `page-outreach.js`. |
| `/home/user/rec/assets/js/outreach/state.js` | ≈50 | Global state object: `{ templates, profile, criteria, finances, contacts, logEntries, activeStage, activeRole }`. Mutated by filters + dialog logic. Not a reactive signal (plain object mutation). | Imported by all outreach/* modules. |
| `/home/user/rec/assets/js/outreach/toast.js` | ≈50 | Toast notifications: "Copied to clipboard", "Email sent to contact X", "Contact saved". Cheap timer-based (no library). | Imported by `dialog.js` + `contacts.js`. |
| `/home/user/rec/assets/js/outreach-store.js` | ≈50 | Read-only accessors: `getOutreachLog()` (reads user-state via storage.js), `getContacts()`. No direct Supabase calls; all reads go through storage.js. | Imported by `page-outreach.js` (rare; most reads are direct storage.js calls). |
| `/home/user/rec/assets/js/outreach-renderer.js` | ≈80 | Pure template renderer: `renderTemplate(template, ctx)` → `{ subject, body, missingFields }`. (1) Substitute `{{#if path}}…{{/if}}` blocks (include if truthy); (2) substitute `{{path}}` placeholders (resolve from ctx, leave literal if missing). `resolvePath(obj, path)` walks dotted path safely. `buildMailto({ to, cc, subject, body })` → `{ mailto: string|null, useClipboard }` (fallback to copy if URL >1800 chars, avoiding Outlook truncation). | Imported by `outreach/dialog.js` + tests. |
| `/home/user/rec/assets/js/profile-schema.js` | ≈300 | Canonical profile normaliser: tolerant of three historical shapes (flat-full, nested, summary-only); unifies into one canonical schema. `canonicalProfile(raw)` → storage shape (idempotent). `normalizeProfile(raw)` → canonical + flat convenience mirrors (firstName, lastName, mobile, email, postcode for outreach templates). Display helpers: `employmentDisplay(profile)` → prose summary, `creditDisplay()`, `householdDisplay()`. CONSUMED set guards data forwarding (unknown keys pass through). | Imported by all profile readers/writers + tests. |
| `/home/user/rec/assets/js/storage/user-state.js` | ≈250 | Core accessors (§17 guard-rail, extend only): `getProfile(opts)`, `saveProfile(d)` (localStorage write-through + Supabase upsert). `getCriteria()`, `saveCriteria()`. Refinement writers: `setAreaRadiusOverride(areaId, miles)` (mutate `criteria.location.areaRadiusOverrides`), `clearAreaRadiusOverride(areaId)`, `raiseBudgetMax(v)` (raise ceiling if v > current), `lowerMinBeds(v)` (lower minimum), `reAcceptPropertyType(s)` (remove from excluded list), `excludePropertyType(s)` (add to excluded). | Re-exported by `storage.js`. |
| `/home/user/rec/assets/js/storage/outreach.js` | ≈100 | Outreach accessors (§17 guard-rail, extend only): `getContacts()`, `saveContacts(d)`. `getOutreachLog()`, `saveOutreachLog(d)`. Read-only `getAreaConfirmations()` (from user-state; not directly writable by this module). | Re-exported by `storage.js`. |
| `/home/user/rec/assets/js/criteria/form.js` | ≈250 | Reusable field builders: `gbp(n)` (Intl formatter, GBP, 0 decimals). `listView(arr, opts)` (render chip grid, fallback "None added" if empty). `listEdit(arr, opts)` (render editable list: input + add/remove buttons). `fieldView(label, value)` → dt/dd pair. `fieldEdit(label, value, type, opts)` → `<input>`/`<select>`/`<textarea>` + label. `setNestedValue(obj, path, value)` (like `setNested` but also merges into provided object). Card-level builders: `budgetCard(criteria, opts)`, `sizeCard()`, `typesCard()`, etc. | Imported by `page-criteria.js`. |
| `/home/user/rec/data/journey.json` | ≈800 | Static journey phases (finances, MIP, search, offer, post-acceptance, pre-completion, completion) × steps × tasks. Each task: `{ id, label, blurb?, outreachTemplateId? }`. Task id format: `<phase>.<step>.<seq>` (e.g., `finances.budget.1`). Optional `note` field for context. No edit UI; JSON-only. | Loaded by `page-journey.js`. |
| `/home/user/rec/data/outreach-templates.json` | ≈3KB | 30+ email templates: each has `{ id (A1–D5), stage (A|B|C|D), stageName ("Search"|"Offer"|…), recipientRole ("estate-agent"|"broker"|"solicitor"|…), title, description, subjectTemplate, bodyTemplate (with `{{path}}` + `{{#if}}` placeholders), dataNeeded (array of required context paths), tone ("warm-brief"|"formal"), bestPracticeNotes (array of tips), sources (array of `{ title, url }`), attachmentsHint }`. | Loaded by `page-outreach.js`. |
| `/home/user/rec/assets/css/pages/setup.css` | ≈200 | Wizard chrome: progress bar (token-driven `--rec-progress`), form field grid (responsive), chips (stage, employment, etc.), area lookup results (scrollable list). Sticky action bar (Edit/Next/Finish) with safe-area insets. Mobile-first (320–480 then breakpoints 480/768/1024/1280). Token variables: `--space-*`, `--text-*`, `--focus-ring`. | Linked by `setup.html`. |
| `/home/user/rec/assets/css/pages/journey.css` | ≈250 | Timeline: phase nodes (connected line, phase marker), step rows (expandable, clickable), modal for task detail (checkbox list, blurb, "→ Email" link). Phased colouring: done (✓, grey), current (solid colour), upcoming (light). Mobile-first responsive. | Linked by `journey.html`. |
| `/home/user/rec/assets/css/pages/shared.css` | ≈200 | Shared card + section styles across profile, criteria, journey: field lists (dt/dd), chip grids, edit-mode overlays, unsaved badges, edit dialogs (native `<dialog>`). | Linked by `profile.html` + `journey.html`. |
| `/home/user/rec/assets/css/components/outreach.css` | ≈300 | Template grid (3-col responsive), filter chips (stage + role), dialog layout (2-col: left rail for context/contact picker, main for preview). Contact list (role-grouped cards), log (table or list). | Linked by `outreach.html`. |
| `/home/user/rec/assets/css/components/save-bar.css` | ≈100 | Sticky bottom bar (criteria only): Edit/Cancel/Save/Reset buttons, "unsaved changes kept locally" message, safe-area insets, focus styles. | Linked by `profile.html` (criteria section). |
| `/home/user/rec/assets/css/components/field.css` | ≈150 | Reusable field view (dt/dd label-value pairs) + edit (`<input>`, `<select>`, `<textarea>`, `<label>`) styling. Form field spacing + focus rings. | Linked by all pages with forms. |
| `/home/user/rec/tests/profile-schema.test.js` | ≈400 | Unit tests: `canonicalProfile()` on all three historical shapes, idempotence (`canonical(canonical(x)) === canonical(x)`), data forwarding (unknown keys), display helpers, field extraction. 100% pure logic (no DOM, no IO). | Run by harness. |
| `/home/user/rec/tests/setup-wizard.test.js` | ≈500 | Unit tests: step branching (buying-situation, employment, applicants), required gate, field validation, completeness %, autosave merge. Pure logic (no DOM, no Supabase). | Run by harness. |
| `/home/user/rec/tests/criteria-form.test.js` | ≈200 | (UNCONFIRMED) Unit tests: form builders, nested value setter, list rendering. | Run by harness. |
| `/home/user/rec/tests/journey-data.test.js` | ≈150 | (UNCONFIRMED) Shape validation: journey.json schema (phases, steps, tasks structure). | Run by harness. |
| `/home/user/rec/tests/journey-progress.test.js` | ≈150 | (UNCONFIRMED) Progress computation: stepProgress, phaseProgress, overall %, currentStep. | Run by harness. |
| `/home/user/rec/tests/outreach-templates.test.js` | ≈200 | (UNCONFIRMED) Template shape (id/stage/role/title/dataNeeded/body), placeholder variable detection. | Run by harness. |
| `/home/user/rec/tests/characterization-outreach.test.js` | ≈300 | (UNCONFIRMED) End-to-end rendering: placeholder substitution, QOI ladder (only needed data), missing-data fallback, `buildMailto()` overflow handling. | Run by harness. |

---

### Data flows (stateful paths)

#### 1. Onboarding wizard → profile/criteria/finances/goals user-state (Supabase)

**Trigger:** User navigates to `/pages/setup.html` (either fresh household or `hasRealUserData()` returns false).

**Sequence:**
1. `page-setup.js` calls `getProfile()` + `getCriteria()` + `getFinances()` + `getGoals()` (via storage.js, localStorage cache + Supabase lazy fetch).
2. If all null/`_SAMPLE` (empty household), seed fresh state from fixtures.
3. Initialize wizard state machine: `state = { profile, criteria, finances, goals, areaCount }`.
4. Render first step (`welcome` or skip to next included step).
5. **Field change:** User edits input → `setNested(state.profile, 'person.fullName', value)` → mutate state.
6. **Autosave:** `makeAutosaver` debounces (600ms) → `saveProfile(state.profile)` → `_save()` → localStorage (instant) + Supabase (async write-through, via `_sbUpsert()`).
7. **Step branching:** `visibleFields(step, state)` applies conditionals:
   - `profile.buyingSituation === 'cash-buyer'` → hide income/mortgage fields.
   - `profile.employment.basis === 'self-employed'` → reveal `selfEmployment.structure` + `yearsActive`.
   - `profile.household.applicants === 2` → reveal `applicant2.*` fields.
8. **Completeness:** Per-step `stepCompleteness(step, state)` counts filled visible fields; overall meter rolls up.
9. **Required gate:** Before Finish, `checkRequiredGate(state)` verifies:
   - `profile.person.fullName` (not empty).
   - `profile.person.email` (valid email format).
   - `criteria.budget.max` (not empty).
   - `areaCount >= 1` (at least one area selected via place-lookup).
   If gate fails, show error message; disable Finish button.
10. **Finish:** `flushAll()` (force any pending autosaves) → navigate to `/pages/profile.html?welcome` (optional toast: "Profile saved!").

**Idempotency:** Each `saveProfile(d)` first calls `canonicalProfile(d)`, so repeated saves of the same state are identical.

---

#### 2. Profile page → profile + criteria render/edit (Supabase + localStorage)

**Trigger:** User navigates to `/pages/profile.html` (guarded by `page-profile-page.js`).

**Sequence:**
1. **Data guard:** `page-profile-page.js` calls `getProfile()` → `hasRealUserData(profile)` → if false, redirect to setup (never render placeholder UI).
2. **Page init:** `page-profile.js` loads `getProfile()` + `getCriteria()` + `getFinances()` (storage.js, cached).
3. **About you card:**
   - Read view: render `profile.headline`, `profile.buyers`, `profile.lifestyle`, etc. (editorial summaries) + tiles (budget max, target deposit, savings total, moving timeline).
   - Edit dialog: TEXT_FIELDS (`headline`, `buyers`, `householdSummary`, `employmentSummary`, `creditSummary`, `lifestyle`, `locationFocus`, `movingTimeline`, `notes`) + ARRAY_FIELDS (`priorities`, `dealBreakers`).
   - Save: `saveProfile()` → canonical → Supabase.
   - Local-edit badge: if `_internal.readLocal('profile')` has uncommitted changes (localStorage only, not yet saved), show orange badge on card.
4. **Application detail card:**
   - Read-only: render person (name, email, dob, address, nationality) + employment (basis, employer, income, years) + credit (score, history summary) + debts (types, amounts) + pension (type, amount) + follow-up checklist (tasks marked `_followUp` in nested structure).
   - Source: `normalizeProfile()` folds all three historical shapes, then readers extract from canonical structure.
   - No edit UI in this card (profile edits go through About you dialog).
5. **Search criteria card:**
   - Read view: render budget (max, min, target-deposit, offer-strategy), size (min/max beds), property types (preferred/acceptable/excluded), tenure (freehold/leasehold), features (garden, garage, parking, etc.), condition (new/modern/period), keywords, mortgage (type, LTV, rate-type), priorities.
   - Edit mode (toggle via Edit button): inline editable form, field by field, via `criteria/form.js` builders. Save bar sticky at bottom (Edit/Cancel/Save/Reset buttons, "unsaved changes kept locally").
   - On Save: `saveCriteria()` → canonical → Supabase.
   - On Cancel: reload from Supabase, discard edits.
   - On Reset: load blank template (user has to re-enter).

---

#### 3. Criteria edit (inline + sticky save bar)

**Trigger:** User clicks Edit on the Search criteria card.

**Sequence:**
1. Toggle edit mode: render all criteria fields as inputs (via `criteria/form.js` builders).
2. **Nested edit:** Each field change → `setNestedValue(criteria, path, value)` → mutate local state (no autosave yet).
3. **Unsaved badge:** Show "unsaved changes kept locally" on the save bar.
4. **Save:** `saveCriteria(criteria)` → canonical → `_save()` → localStorage + Supabase.
5. **Cancel:** Reload from Supabase (discard local changes).
6. **Save bar buttons:** All four (Edit/Cancel/Save/Reset) delegated to from `page-profile-page.js` (proxy pattern).

---

#### 4. Journey page → journey_progress + task checkmarks (Supabase)

**Trigger:** User navigates to `/pages/journey.html`.

**Sequence:**
1. Load static `data/journey.json` (phases, steps, tasks).
2. Load user-state `journey_progress` via `storage.js` (shape: `{ tasks: { '<taskId>': true|false } }`).
3. Render timeline:
   - Phase row: title + summary + step count.
   - Each step row (clickable): title + task count + done count (e.g., "4 of 8 tasks").
4. **Click step row:** Open modal with:
   - Blurb (from `step.blurb`).
   - Task checklist: each task is a checkbox (togglable), label, optional note.
   - If task has `outreachTemplateId` (e.g., `'A1'`), show "→ Email" link to `/pages/outreach.html?templateId=A1`.
5. **Tick task:** 
   - Mutate `state.journey_progress.tasks[taskId] = true`.
   - Call `saveJourneyProgress(state.journey_progress)` → Supabase.
   - Update UI: refresh step row done count.
6. **Progress derivation:** `journey/progress.js` computes `{ currentPhase, currentStep, stepProgress, phaseProgress (%), overall (%), tasksDone }` from journey data + progress state. Used for visual cues (colouring done/current/upcoming steps).

---

#### 5. Outreach page → template rendering + contacts + log (Supabase)

**Trigger:** User navigates to `/pages/outreach.html` or clicks "→ Email" deep-link from journey step.

**Sequence:**
1. Load static `data/outreach-templates.json`.
2. Load user-state: `profile` (normalized for flat outreach mirrors), `criteria`, `finances`, `contacts`, `outreach_log`.
3. Init global state: `state = { templates, profile, criteria, finances, contacts, logEntries, activeStage, activeRole }`.
4. **Deep-link handler:** If `?templateId=<id>`, find template + open dialog immediately.
5. **Filter chips:** Stage (A|B|C|D) + role (estate-agent|broker|solicitor|surveyor).
   - Click stage chip → `state.activeStage = 'A'` → `renderGrid()` (filter templates).
   - Click role chip → `state.activeRole = 'estate-agent'` → `renderGrid()`.
6. **Grid render:** For each template matching `activeStage + activeRole`, render a card (title, description, best-practice notes preview). Click → open dialog.
7. **Dialog (template context + preview):**
   - **Contact picker:** `<select>` + free-text fallback; allow pick from saved list or type new name.
   - **Context fields:** Resolve from user-state:
     - `listing.address`, `listing.askingPrice`, `listing.portal`, `listing.ref` (if viewing a specific property).
     - `viewingDateOption1`, `viewingDateOption2` (text inputs for suggested times).
     - Property fields are optional (omitted if no listing in scope).
   - **QOI Ladder:** Template declares `dataNeeded` (array of paths like `profile.firstName`, `criteria.mustHaves`, `finances.aipAmount`). Dialog only renders context fields for those paths.
   - **Preview pane:** `renderTemplate(template, ctx)` → substitute `{{path}}` + `{{#if path}}…{{/if}}` blocks (from outreach-renderer.js). Update on every context field change (debounced, 300ms).
   - **Copy button:** `buildMailto({ to, cc, subject, body })` → mailto: URI (or copy-to-clipboard if URL >1800 chars). Toast: "Copied to clipboard".
   - **Send button:** Write to `outreach_log` user-state (append entry: `{ templateId, contact, subject, body, sentAt, recipient (contact email/phone) }`). Call `saveOutreachLog()`. Toast: "Email sent to [contact]". Clear dialog.
8. **Contacts tab:**
   - List saved contacts grouped by role (agents/brokers/solicitors/surveyors).
   - Add button → inline form (name, role, email, phone) → save → `saveContacts()`.
   - Edit button → open contact form → mutate + save.
   - Delete button → confirm → mutate array → `saveContacts()`.
9. **Log tab:**
   - List sent emails (templateId, contact, subject, timestamp, body preview).
   - Archive button → mutate `archived = true` → `saveOutreachLog()`.
   - Delete button → confirm → remove from array → `saveOutreachLog()`.

---

### Feature & behaviour catalogue (vetted)

#### Profile schema canonicalization (file:line traceability)

**Name & purpose:** `profile-schema.js` (lines 1–300) — unify three incompatible legacy shapes (flat-full, nested, summary-only) into one canonical form.

**Historical shapes (lines 4–12):**
- Flat-full: `{ name, firstName, lastName, email, mobile, phone, employment:"...", creditProfile:"...", household:"..." }`.
- Nested: `{ person: { fullName, firstName, lastName, email, mobile, dateOfBirth, … }, employment: { basis, employer, … }, creditProfile: { … }, debts: { … }, pension: { … } }`.
- Summary-only: `{ headline, buyers, lifestyle, locationFocus, … }` (editorial prose, no structured fields).

**Canonicalization flow (lines 53–100+):**
```javascript
export function canonicalProfile(raw) {
  const p = isObj(raw) ? raw : {};
  const out = {};
  // Editorial (lines 59–68):
  out.headline = clean(p.headline);
  out.buyers = clean(p.buyers);
  out.lifestyle = clean(p.lifestyle);
  // ... plus priorities, dealBreakers (arrays).
  
  // Person (lines 70–94):
  const fullName = firstDefined(rawPerson.fullName, p.name,
    [p.firstName, p.lastName].filter(Boolean).join(' ') || null);
  const named = splitName(fullName);  // Split "John Doe" → firstName: "John", lastName: "Doe"
  out.person = {
    fullName, firstName, lastName, email, mobile, dateOfBirth, address: { line1, town, county, postcode }
  };
  // ... similar for household, employment, applicant2, creditProfile, debts, pension.
  
  // Data forwarding (lines ~250–260, CONSUMED set):
  // Any key NOT in CONSUMED is passed through verbatim (selfEmployment, insuranceAndProtection, etc.).
}
```

**Normalization for outreach (lines ~260–280, `normalizeProfile()`):**
- Call `canonicalProfile(raw)`.
- Add flat convenience mirrors: `firstName`, `lastName`, `mobile`, `email`, `postcode` (extracted from nested `person` + `address`).
- Example: `normalizeProfile(p).firstName === p.person.firstName || splitName(p.person.fullName).firstName`.

**Idempotency guarantee (lines ~300–315, test in profile-schema.test.js):**
```javascript
canonicalProfile(canonicalProfile(x)) === canonicalProfile(x)  // Always true
```

**Edge cases & data forwarding:**
1. `_SAMPLE` fixture (line 56): if `p._SAMPLE === true`, preserved in output (marks sample data, excluded from real saves).
2. Missing address: default to `{ line1: null, town: null, county: null, postcode: null }` (line 88–93).
3. Unknown keys: the CONSUMED set (lines 43–51) lists ~40 known keys; anything else is passed through verbatim (`Object.assign(out, ...unknownKeys)` at end), so no data loss if schema evolves.
4. Flat address fields (legacy `currentAddress`) merge with `person.address` (line 72–73).

**Rationale:** Before canonicalization, a profile read by one module (e.g., outreach renderer expecting flat `profile.firstName`) might be rendered as blank if stored in nested form (lives at `profile.person.firstName`). Canonical form ensures all readers see the same shape.

**Test assertions (profile-schema.test.js, lines ~1–50):**
```javascript
// Idempotence
assert(canonical(canonical(x)) === canonical(x));

// Flat-to-nested migration
const flat = { firstName: 'John', lastName: 'Doe', email: 'j@example.com' };
const can = canonical(flat);
assert.equal(can.person.firstName, 'John');
assert.equal(can.person.email, 'j@example.com');

// Unknown key forwarding
const unknown = { ...flatShape, customField: 'value' };
const result = canonical(unknown);
assert.equal(result.customField, 'value');

// Data merge (flat + nested coexist)
const mixed = { firstName: 'Jane', person: { fullName: 'Jane Doe', email: 'jane@ex.com' } };
const merged = canonical(mixed);
assert.equal(merged.person.firstName, 'Jane');  // Flat takes precedence
```

---

#### Setup wizard (branching state machine)

**Name & purpose:** `setup/wizard.js` (≈300 lines) — render one step at a time, autosave, enforce required gate, show progress.

**Trigger & entry:** User navigates `/pages/setup.html` → `page-setup.js` initializes state + calls `wizard.render()`.

**Preconditions:**
- State object: `{ profile, criteria, finances, goals, areaCount }` (seeded from storage or fixtures).
- `steps.js` exports: `STEPS` (array of step definitions), `visibleFields(step, state)`, `includedSteps(state)`.
- Autosaver: `makeAutosaver({ profile: saveProfile, criteria: saveCriteria, … })`.

**Branching logic (steps.js, lines 36–42):**
```javascript
const isCashBuyer = (s) => s?.profile?.buyingSituation === 'cash-buyer';
const isJoint = (s) => s?.profile?.household?.applicants === 2 || === '2';
const isSelfEmployed = (s) => s?.profile?.employment?.basis === 'self-employed';
const worksForIncome = (s) => isEmployed(s) || isSelfEmployed(s);
```

**Step definition structure (steps.js, lines 43–100, sample):**
```javascript
{
  id: 'about-you',
  title: 'About you',
  fields: [
    { path: 'profile.person.fullName', label: 'Full name', type: 'text', required: true },
    { path: 'profile.person.dateOfBirth', label: 'Date of birth', type: 'date' },
    { path: 'profile.applicant2.fullName', label: 'Second applicant — full name', type: 'text', when: isJoint },
    // Conditional field: only visible if isJoint(state) === true
  ],
}
```

**Validation (validate.js, lines 1–50):**
```javascript
export function validateField(field, value) {
  // Required check
  if (field.required && !value) return { valid: false, error: 'This field is required.' };
  
  // Format checks
  if (field.type === 'email' && value && !isValidEmail(value))
    return { valid: false, error: 'Enter a valid email address.' };
  if (field.type === 'number' && value && isNaN(Number(value)))
    return { valid: false, error: 'Enter a number.' };
  
  // Numeric bounds
  if (field.min != null && Number(value) < field.min)
    return { valid: false, error: `Must be at least ${field.min}.` };
  if (field.max != null && Number(value) > field.max)
    return { valid: false, error: `Must be at most ${field.max}.` };
  
  return { valid: true };
}

export function checkRequiredGate(state) {
  // Required gate: name, email, budget max, ≥1 area (lines 60–75)
  const fullName = getNested(state.profile, 'person.fullName');
  const email = getNested(state.profile, 'person.email');
  const budgetMax = getNested(state.criteria, 'budget.max');
  const areaCount = state.areaCount || 0;
  
  if (!fullName || !email || !budgetMax || areaCount < 1) {
    return { valid: false, missing: [
      !fullName && 'Full name',
      !email && 'Email',
      !budgetMax && 'Budget maximum',
      areaCount < 1 && 'At least one area',
    ].filter(Boolean) };
  }
  return { valid: true };
}
```

**Autosave (autosave.js, lines 1–50 + wizard.js field change handler):**
```javascript
// When user edits a field:
wizard.on('field-change', (fieldPath, value) => {
  const [head, ...rest] = fieldPath.split('.');  // 'profile.person.fullName' → head='profile', rest=['person', 'fullName']
  const blob = state[head];  // state.profile
  setNested(blob, rest.join('.'), value);  // Mutate: blob.person.fullName = value
  autosaver.queue(head, blob);  // Schedule save in 600ms
});

// Autosaver (makeAutosaver, lines 29–49):
queue(name, blob) {
  pending[name] = blob;
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => flush(name), 600);
}

flush(name) {
  const blob = pending[name];
  delete pending[name];
  if (blob !== undefined) saveFns[name](blob);  // → saveProfile(blob) → _save() → localStorage + Supabase
}
```

**Completeness calculation (completeness.js, lines 1–47):**
```javascript
export function stepCompleteness(step, state) {
  const fields = visibleFields(step, state).filter((f) => f.type !== 'consent');
  if (fields.length === 0) return { filled: 0, total: 0, status: 'complete' };
  
  let filled = 0;
  for (const f of fields) {
    const value = fieldValue(state, f);
    if (isFilled(value)) filled += 1;
  }
  
  const status = filled === 0 ? 'not-started'
    : (filled === fields.length ? 'complete' : 'partial');
  return { filled, total: fields.length, status };
}

export function overallCompleteness(state) {
  const steps = includedSteps(state).filter((s) => s.id !== 'welcome' && s.id !== 'review');
  let filled = 0, total = 0;
  for (const s of steps) {
    const c = stepCompleteness(s, state);
    filled += c.filled;
    total += c.total;
  }
  return { filled, total, percent: total ? Math.round((filled / total) * 100) : 0 };
}
```

**Render flow (wizard.js render() method, lines ~100–200):**
1. Call `includedSteps(state)` → filter to steps where `include?(state)` is true (or no include function).
2. Render current step HTML: title + intro + fields (only `visibleFields` for this step).
3. For each visible field, render a form control (`<input>`, `<select>`, etc.) + label + error message (if validation failed).
4. Render progress bar: `<progress value="${overallCompleteness().percent}" max="100">`.
5. Render per-step chips (filled/total): "1 of 5" in green if complete, orange if partial, grey if not-started.
6. On Next: validate visible fields → if all valid, move to next step; else show errors + stay on step.
7. On Finish: check required gate → if passes, `flushAll()` → navigate to `/pages/profile.html`.

**Special fields (completeness.js lines 8–14):**
- `path: '@areas'` (special marker): completeness checks `state.areaCount >= 1` instead of a blob field.
- `path: '@health-consent'`: checks `state.profile.consents.health.granted === true`.

**Edge cases & idempotency:**
1. **Resuming mid-wizard:** If user closes browser and returns, `getProfile()` returns the partially-filled blob (last autosaved state). Wizard re-initializes with that state + renders the same step they were on (derived from completeness, e.g., if finance step is partial, resume there).
2. **State branching:** If user changes `buyingSituation` from 'first-time-buyer' to 'cash-buyer', the wizard re-evaluates `visibleFields()` for the current step. Some fields hide; completeness drops. (Risk: no "undo" for hidden fields — their values are preserved but not shown.)
3. **Field mutability:** `setNested()` always creates intermediate objects; never clobbers siblings. So a field edit in step 2 doesn't erase values from step 1.

**Test assertions (setup-wizard.test.js, lines ~1–100):**
```javascript
// Step branching
const state = { profile: { buyingSituation: 'cash-buyer' }, … };
const steps = includedSteps(state);
assert(!steps.some(s => s.id === 'mortgage'));  // Mortgage step hidden for cash buyer

// Completeness
const partial = { … fields with some filled, some empty … };
const comp = stepCompleteness(steps[0], partial);
assert.equal(comp.filled, 3);
assert.equal(comp.total, 7);
assert.equal(comp.status, 'partial');

// Required gate
const incomplete = { profile: { person: { fullName: 'John' } }, criteria: { budget: {} } };
const gate = checkRequiredGate(incomplete);
assert.equal(gate.valid, false);
assert(gate.missing.includes('Email'));
assert(gate.missing.includes('Budget maximum'));

// Autosave merge (setNested idempotency)
const state = { profile: { person: { fullName: 'John' }, employment: { basis: 'employed' } } };
setNested(state.profile, 'person.email', 'j@ex.com');
assert.equal(state.profile.person.fullName, 'John');  // Unmodified
assert.equal(state.profile.employment.basis, 'employed');  // Unmodified
assert.equal(state.profile.person.email, 'j@ex.com');  // Newly set
```

---

#### Outreach template rendering (placeholder substitution + QOI ladder)

**Name & purpose:** `outreach-renderer.js` (lines 1–80) — pure template renderer with placeholder substitution + conditional blocks + quantity-of-information filtering.

**Entry point:** `outreach/dialog.js` calls `renderTemplate(template, ctx)` to generate preview HTML.

**Template structure (data/outreach-templates.json, A1 example, lines 2–35):**
```json
{
  "id": "A1",
  "stage": "A",
  "recipientRole": "estate-agent",
  "title": "Estate agent — viewing request",
  "subjectTemplate": "Viewing — {{listing.address}}",
  "bodyTemplate": "Hi {{contact.agentName}},\n\nI'd like to arrange a viewing of {{listing.address}} (listed at £{{listing.askingPrice}}, {{listing.portal}} ref {{listing.ref}}).\n\nPosition: first-time buyer, chain-free, AIP in place for £{{finances.aipAmount}}.\n\nCould either {{viewingDateOption1}} or {{viewingDateOption2}} work?…",
  "dataNeeded": [
    "profile.firstName",
    "profile.lastName",
    "profile.mobile",
    "contact.agentName",
    "listing.address",
    "listing.askingPrice",
    "listing.portal",
    "listing.ref",
    "finances.aipAmount",
    "viewingDateOption1",
    "viewingDateOption2"
  ],
  "tone": "warm-brief",
  "bestPracticeNotes": [
    "Mentions proceedability in one line — earns priority in the agent's pile",
    "Offers two specific time slots — research shows this triples the reply rate"
  ]
}
```

**Placeholder types (renderTemplate, lines 27–56):**

1. **Simple substitution:** `{{path}}`
   - Resolve dotted path against context object.
   - If found, substitute with stringified value; if missing, leave literal `{{path}}` and add to `missingFields`.
   - Example: `{{profile.firstName}}` → if ctx.profile.firstName = 'John', output 'John'; else output `{{profile.firstName}}`.

2. **Conditional blocks:** `{{#if path}}…{{/if}}`
   - Resolve path; if truthy (non-null, non-zero, non-empty), include the inner content; else omit.
   - Support nested substitution: `{{#if profile.applicant2.firstName}}Joint application with {{profile.applicant2.firstName}}{{/if}}`.
   - Example: if ctx.profile.applicant2 = null, the block is removed entirely.

**Rendering flow (lines 30–56):**
```javascript
export function renderTemplate(template, ctx) {
  const missing = new Set();
  
  function substitute(str) {
    // 1. Process {{#if path}}…{{/if}} blocks (recursive)
    str = str.replace(/\{\{#if ([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match, path, inner) => {
      const val = resolvePath(ctx, path.trim());
      if (!val && val !== 0) return '';  // Falsy? Omit block.
      return substitute(inner);  // Recursive: handle nested {{path}} in the block.
    });
    
    // 2. Substitute {{path}} placeholders
    str = str.replace(/\{\{(?!#if|\/if)([^}]+)\}\}/g, (_match, path) => {
      const key = path.trim();
      const val = resolvePath(ctx, key);
      if (val === undefined || val === null) {
        missing.add(key);
        return `{{${key}}}`;  // Leave literal
      }
      return String(val);
    });
    
    return str;
  }
  
  const subject = substitute(template.subjectTemplate || '');
  const body = substitute(template.bodyTemplate || '');
  
  return { subject, body, missingFields: [...missing] };
}

export function resolvePath(obj, path) {
  if (obj == null || typeof path !== 'string') return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}
```

**Quantity-of-Information Ladder (QOI, dialog.js lines ~120–160):**
- Template declares `dataNeeded` (array of paths).
- Dialog renders context-input fields **only for paths in `dataNeeded`** + their parent objects (e.g., if `dataNeeded` includes `listing.address`, render a `listing` fieldset with address input).
- On Preview: `renderTemplate()` is called with filtered context (only keys in dataNeeded).
- **Purpose:** Reduce cognitive load; users don't see 100 possible fields, only the ones the template actually uses.
- **Implementation (dialog.js):**
  ```javascript
  const neededKeys = template.dataNeeded || [];  // ["profile.firstName", "contact.agentName", …]
  const filteredCtx = {};
  for (const key of neededKeys) {
    const val = resolvePath(fullCtx, key);
    if (val !== undefined) setNested(filteredCtx, key, val);
  }
  const rendered = renderTemplate(template, filteredCtx);
  ```

**Edge cases:**
1. **Missing data:** If a placeholder is unresolved (value is null/undefined), it's left as a literal `{{path}}` in the output. Email preview still shows the template, so user can see what's missing.
2. **Nested conditionals:** `{{#if profile.applicant2}}Joint: {{profile.applicant2.fullName}}{{/if}}` — the inner substitution is recursive, so nested placeholders are resolved + missing paths are tracked.
3. **Undefined context:** `resolvePath(ctx, 'listing.askingPrice')` when `ctx.listing = undefined` returns undefined (doesn't throw).
4. **Array/object values:** If a context value is an array or object, `String(val)` is called (e.g., `String([1,2,3])` → `'1,2,3'`). Not ideal for complex structures; consider `JSON.stringify()` for complex cases.

**Mailto: URI builder (lines 64–79):**
```javascript
export function buildMailto({ to = '', cc = '', subject = '', body = '' }) {
  const params = new URLSearchParams();
  if (cc) params.set('cc', cc);
  params.set('subject', subject);
  params.set('body', body);
  
  const encoded = params.toString().replace(/\+/g, '%20');
  const url = `mailto:${encodeURIComponent(to)}?${encoded}`;
  
  // Fallback to copy-to-clipboard if URL >1800 chars (Outlook limitation)
  if (url.length > 1800) {
    return { mailto: null, useClipboard: true };
  }
  return { mailto: url, useClipboard: false };
}
```

**Test assertions (characterization-outreach.test.js, lines ~1–100):**
```javascript
// Simple substitution
const tmpl = { subjectTemplate: 'Hi {{contact.name}}', bodyTemplate: '…' };
const ctx = { contact: { name: 'Alice' } };
const result = renderTemplate(tmpl, ctx);
assert.equal(result.subject, 'Hi Alice');

// Conditional blocks
const tmpl2 = { bodyTemplate: '{{#if profile.applicant2}}Joint application{{/if}}' };
const ctx2a = { profile: { applicant2: { fullName: 'Bob' } } };
const ctx2b = { profile: { applicant2: null } };
assert.equal(renderTemplate(tmpl2, ctx2a).body, 'Joint application');
assert.equal(renderTemplate(tmpl2, ctx2b).body, '');

// Missing data
const tmpl3 = { bodyTemplate: 'Email: {{profile.email}}' };
const ctx3 = { profile: {} };
const result3 = renderTemplate(tmpl3, ctx3);
assert(result3.body.includes('{{profile.email}}'));
assert(result3.missingFields.includes('profile.email'));

// QOI filtering
const fullCtx = { profile: { firstName: 'John', lastName: 'Doe', email: 'j@ex.com' },
                  criteria: { budget: 500000, beds: 3 } };
const dataNeeded = ['profile.firstName', 'profile.lastName'];
const filtered = {};
for (const key of dataNeeded) setNested(filtered, key, resolvePath(fullCtx, key));
// filtered now has only profile.firstName + profile.lastName; criteria is absent.
assert.equal(filtered.criteria, undefined);

// Mailto: overflow handling
const longBody = 'x'.repeat(1800);
const result = buildMailto({ to: 'a@b.com', subject: 'Test', body: longBody });
assert.equal(result.mailto, null);
assert.equal(result.useClipboard, true);
```

---

#### Three-page-profile architecture (why)

**Current split (file:lines):**
- `page-profile.js` (219 lines): About you card (read + edit dialog).
- `page-profile-detail.js` (162 lines): Application detail card (person/employment/credit/debts/pension/follow-up).
- `page-profile-page.js` (34 lines): Page coordinator (data guard + save-bar proxy).

**Responsibility boundaries:**
- `page-profile.js` manages:
  - Render About you card (headline, buyers, lifestyle, etc.).
  - Render Budget/Deposit/Saved/Window tiles (computed from criteria + finances).
  - Edit dialog for About you (TEXT_FIELDS + ARRAY_FIELDS).
  - Unsaved-change badge (reads `_internal.readLocal()`).
  - *Does not* manage Application detail or Search criteria directly (those are in detail + criteria files).

- `page-profile-detail.js` manages:
  - Read-only render of person, employment, credit, debts, pension (from nested profile.structure).
  - Follow-up checklist (tasks marked `_followUp` in schema).
  - *Never* edits; all mutations go through page-profile.js.

- `page-profile-page.js` manages:
  - Data guard: if `!hasRealUserData(profile)`, redirect to setup.
  - Save-bar proxy: delegate criteria Cancel/Save to their own buttons (criteria module owns its edit mode).
  - Page-level state management (e.g., clearing `data-profile-state` pending attribute).

**Why three files:**
1. **Separation of concerns:** Each card (About you, Application detail, Search criteria) has its own read/edit logic.
2. **Domain-driven:** About you is editorial (free-form summaries); Application detail is structured data (person.fullName, employment.basis); criteria is search parameterization.
3. **Page guard isolation:** The guard (`page-profile-page.js`) is minimal and standalone; it doesn't mix with card logic.
4. **Maintainability:** Changes to About you edit dialog don't risk breaking Application detail renders.

**Risk: Complexity boundary unclear.**
- `page-profile.js` is 219 lines; if it grows beyond ~300, consider splitting into `profile/{about.js, detail.js}` submodules (§19 module layout).
- Currently, `page-profile.js` imports `page-profile-detail.js` internally (no circular dependency); the load order is implicit.

**Future refactor (Phase 1 in Refactor opportunities):**
- Merge three files into one coordinator + three submodules (`profile/{about,detail,application}.js`).
- Shared edit-state machine (one "am I in edit mode?" flag for all cards, not per-card).
- Single init point that orchestrates all three card renders.

---

### Coupling & dependencies

#### 1. Profile-schema idempotence (guard-rail)

All profile readers + writers flow through `canonicalProfile()` or `normalizeProfile()`:
- Wizards save via `saveProfile(d)` → `_save()` → `canonicalProfile(d)` (enforced in core.js `_save()` logic).
- Pages load via `getProfile()` → returns canonical shape (enforced in core.js `_get()` logic).
- Outreach renderer reads via `normalizeProfile()` to get flat mirrors.

**Guarantee:** `canonical(canonical(x)) === canonical(x)`. Any refactor to profile-schema MUST preserve this.

#### 2. Criteria schema (shared across finances/listings/areas)

Criteria blob structure:
```javascript
{
  budget: { max, min, offerTarget, offerStrategy },
  size: { minBeds, maxBeds },
  propertyTypePrefs: { preferred: [], acceptable: [], excluded: [] },
  tenure: { freehold, leasehold },
  features: { garden, garage, parking, … },
  condition: { … },
  keywords: [],
  mortgage: { type, ltv, rateType },
  priorities: [],
  location: { areaRadiusOverrides: { [areaId]: miles } },
}
```

**Consumers:**
- Listings feed: filters by `budget.max`, `size.minBeds`, `propertyTypePrefs`, `location.areaRadiusOverrides`.
- Refinement engine: applies `raiseBudgetMax()`, `lowerMinBeds()`, `setAreaRadiusOverride()` (storage/user-state.js lines 25–54).
- Outreach templates: reference `criteria.budget`, `criteria.beds`, `criteria.propertyType`, `criteria.mustHaves`.

**Invariant:** Any change to criteria schema must be reflected in all three consumers. Test via `supabase-sync.test.js` (ensure table schema matches repo shape).

#### 3. Journey checklist deep-links into outreach

- `data/journey.json` task: `{ id: 'finances.budget.1', label: '…', outreachTemplateId?: 'A1' }`.
- `page-journey.js` renders "→ Email" link: `<a href="/pages/outreach.html?templateId=A1">Email {{template.title}}</a>`.
- `page-outreach.js` deep-link handler: on load, if `?templateId=A1`, find template + open dialog immediately.

**Invariant:** Every `outreachTemplateId` in journey.json MUST exist in `data/outreach-templates.json`. Test via a lint rule in `run-intelligence-tests.mjs` (verify all referenced template IDs exist).

#### 4. Setup wizard state machine → profile branching

- `profile.buyingSituation` → hides/shows mortgage/income fields.
- `profile.employment.basis` → hides/shows self-employment sub-fields.
- `profile.household.applicants` → hides/shows applicant2 fields.
- Conditionals live in `steps.js` predicates (`isCashBuyer`, `isSelfEmployed`, etc.).

**Invariant:** If a new buying-situation is added (e.g., 'shared-ownership'), steps.js predicates MUST be updated. No implicit behavior.

#### 5. Storage.js re-export shim (§16 guard-rail, NEVER REWRITTEN)

- `assets/js/storage.js` is a byte-identical shim:
  ```javascript
  export { getProfile, saveProfile, getCriteria, saveCriteria, … } from './user-state.js';
  export { getContacts, saveContacts, … } from './outreach.js';
  export { … } from './listings.js';
  ```
- All page modules import only from `storage.js`, never directly from `storage/user-state.js`.
- If internal split changes (e.g., move a function to a different module), only storage.js is updated; page modules see no change.

**Invariant:** storage.js MUST always be a pure re-export shim. Any logic refactor happens in the internal split modules.

#### 6. Outreach template resolution depends on profile-schema normalization

- Templates declare `dataNeeded: ['profile.firstName', 'criteria.mustHaves', …]`.
- Renderer resolves these from `normalizeProfile(profile)` output (which adds flat mirrors).
- If a template references `profile.firstName` but profile is stored in flat form (`firstName` top-level), the renderer would fail without canonicalization.

**Invariant:** Every key in template `dataNeeded` MUST be resolvable from `normalizeProfile(profile)` output. Test via lint rule: parse all templates, ensure every `dataNeeded` path exists in a canonical profile sample.

---

### Test coverage & new test behaviours

**Existing suites (per harness §6):**

| Suite | Lines | Status | Gaps |
|-------|-------|--------|------|
| `profile-schema.test.js` | ~400 | Comprehensive | None. |
| `setup-wizard.test.js` | ~500 | Comprehensive (pure logic) | DOM/a11y layer untested (manual hand-off). |
| `criteria-form.test.js` | ~200 | (UNCONFIRMED) Likely exists | Not yet examined. |
| `journey-data.test.js` | ~150 | (UNCONFIRMED) Likely schema validation | Not yet examined. |
| `journey-progress.test.js` | ~150 | (UNCONFIRMED) Likely progress computation | Not yet examined. |
| `outreach-templates.test.js` | ~200 | (UNCONFIRMED) Template shape validation | Not yet examined. |
| `characterization-outreach.test.js` | ~300 | (UNCONFIRMED) End-to-end rendering | Not yet examined. |

**New tests Fable must pin (§5 mandate):**

#### Test: Profile-schema idempotence over all legacy shapes
```javascript
// profile-schema.test.js — new suite or extended
describe('Profile-schema idempotence', () => {
  it('canonicalizes flat-full shape', () => {
    const flat = { firstName: 'John', lastName: 'Doe', email: 'j@ex.com', … };
    const canon1 = canonicalProfile(flat);
    const canon2 = canonicalProfile(canon1);
    assert.deepEqual(canon1, canon2);
  });
  
  it('canonicalizes nested shape', () => {
    const nested = { person: { fullName: 'John Doe', email: 'j@ex.com' }, … };
    const canon1 = canonicalProfile(nested);
    const canon2 = canonicalProfile(canon1);
    assert.deepEqual(canon1, canon2);
  });
  
  it('canonicalizes summary-only shape', () => {
    const summary = { headline: 'FTB…', buyers: '2 of us', … };
    const canon1 = canonicalProfile(summary);
    const canon2 = canonicalProfile(canon1);
    assert.deepEqual(canon1, canon2);
  });
  
  it('forwards unknown keys without loss', () => {
    const mixed = { …knownShape, customField: 'value' };
    const canon = canonicalProfile(mixed);
    assert.equal(canon.customField, 'value');
  });
  
  it('normalizes flat outreach mirrors for template rendering', () => {
    const canon = { person: { firstName: 'John', lastName: 'Doe' }, … };
    const norm = normalizeProfile(canon);
    assert.equal(norm.firstName, 'John');  // Flat mirror
    assert.equal(norm.lastName, 'Doe');
  });
});
```

#### Test: Setup wizard validation + autosave
```javascript
describe('Setup wizard validation + autosave', () => {
  it('validates required fields (name, email, budget, area)', () => {
    const state = { profile: { person: {} }, criteria: { budget: {} }, areaCount: 0 };
    const gate = checkRequiredGate(state);
    assert.equal(gate.valid, false);
    assert(gate.missing.includes('Full name'));
    assert(gate.missing.includes('Email'));
    assert(gate.missing.includes('Budget maximum'));
    assert(gate.missing.includes('At least one area'));
  });
  
  it('autosaves via setNested without clobbering siblings', () => {
    const profile = { person: { fullName: 'John', email: 'j@ex.com' }, employment: { basis: 'employed' } };
    setNested(profile, 'person.mobile', '07700000000');
    assert.equal(profile.person.fullName, 'John');  // Preserved
    assert.equal(profile.person.email, 'j@ex.com');  // Preserved
    assert.equal(profile.employment.basis, 'employed');  // Preserved
    assert.equal(profile.person.mobile, '07700000000');  // New
  });
  
  it('coalesces rapid edits into one save per blob', (done) => {
    let saves = 0;
    const saver = makeAutosaver({ profile: () => saves++ }, 100);
    saver.queue('profile', { name: 'John' });
    saver.queue('profile', { name: 'John', email: 'j@ex.com' });
    saver.queue('profile', { name: 'John', email: 'j@ex.com', age: 30 });
    setTimeout(() => {
      assert.equal(saves, 1);  // Only one save fired
      done();
    }, 150);
  });
  
  it('flushAll forces pending saves before navigation', (done) => {
    let saved = null;
    const saver = makeAutosaver({ profile: (b) => saved = b }, 10000);  // Long timeout
    saver.queue('profile', { name: 'John' });
    saver.flushAll();
    // Save fires immediately, not after 10000ms
    assert.deepEqual(saved, { name: 'John' });
    done();
  });
});
```

#### Test: Completeness scoring (branch-aware)
```javascript
describe('Setup wizard completeness', () => {
  it('computes per-step completeness (visible fields only)', () => {
    const step = STEPS.find(s => s.id === 'about-you');
    const state = {
      profile: { person: { fullName: 'John' }, household: { applicants: 1 } },
      …
    };
    const comp = stepCompleteness(step, state);
    // Step has ~10 visible fields (applicant2 hidden because applicants=1)
    // Only fullName is filled
    assert.equal(comp.filled, 1);
    assert.equal(comp.total, 9);  // Not 10, because applicant2 is hidden
    assert.equal(comp.status, 'partial');
  });
  
  it('computes overall completeness excluding welcome+review', () => {
    const state = { …partially filled… };
    const overall = overallCompleteness(state);
    assert(overall.percent >= 0 && overall.percent <= 100);
    assert.equal(overall.filled + 10, overall.total);  // Sanity check
  });
  
  it('handles hidden fields (joint applicant conditional)', () => {
    const step = STEPS.find(s => s.id === 'about-you');
    
    // Solo applicant
    const state1 = { profile: { household: { applicants: 1 } }, … };
    const comp1 = stepCompleteness(step, state1);
    const fields1 = visibleFields(step, state1);
    assert(!fields1.some(f => f.path.includes('applicant2')));
    
    // Joint applicant
    const state2 = { profile: { household: { applicants: 2 } }, … };
    const comp2 = stepCompleteness(step, state2);
    const fields2 = visibleFields(step, state2);
    assert(fields2.some(f => f.path.includes('applicant2')));
  });
});
```

#### Test: Template rendering + QOI ladder filtering
```javascript
describe('Outreach template rendering + QOI', () => {
  it('substitutes {{path}} placeholders from context', () => {
    const tmpl = { subjectTemplate: 'Hi {{contact.name}}', bodyTemplate: '…' };
    const ctx = { contact: { name: 'Alice' } };
    const result = renderTemplate(tmpl, ctx);
    assert.equal(result.subject, 'Hi Alice');
  });
  
  it('leaves literal {{path}} + tracks missing for unresolved paths', () => {
    const tmpl = { bodyTemplate: 'Email: {{profile.email}}' };
    const ctx = { profile: {} };
    const result = renderTemplate(tmpl, ctx);
    assert(result.body.includes('{{profile.email}}'));
    assert.deepEqual(result.missingFields, ['profile.email']);
  });
  
  it('processes {{#if path}}…{{/if}} blocks (include if truthy)', () => {
    const tmpl = { bodyTemplate: '{{#if profile.applicant2}}Joint{{/if}}' };
    const ctx1 = { profile: { applicant2: { fullName: 'Bob' } } };
    const ctx2 = { profile: { applicant2: null } };
    assert.equal(renderTemplate(tmpl, ctx1).body, 'Joint');
    assert.equal(renderTemplate(tmpl, ctx2).body, '');
  });
  
  it('filters context by dataNeeded (QOI ladder)', () => {
    const fullCtx = { profile: { …10 fields… }, criteria: { …5 fields… }, … };
    const dataNeeded = ['profile.firstName', 'profile.lastName'];
    const filtered = {};
    for (const key of dataNeeded) {
      const val = resolvePath(fullCtx, key);
      if (val !== undefined) setNested(filtered, key, val);
    }
    assert.equal(filtered.profile.firstName, fullCtx.profile.firstName);
    assert.equal(filtered.criteria, undefined);  // Not in dataNeeded
  });
  
  it('handles buildMailto overflow (URL >1800 chars)', () => {
    const long = 'x'.repeat(2000);
    const result = buildMailto({ to: 'a@b.com', subject: 'Test', body: long });
    assert.equal(result.mailto, null);
    assert.equal(result.useClipboard, true);
  });
});
```

#### Test: Journey progress derivation
```javascript
describe('Journey progress', () => {
  it('derives currentPhase, currentStep, progress % from journey data + state', () => {
    const journeyData = require('./data/journey.json');
    const progressState = { tasks: { 'finances.budget.1': true, 'finances.budget.2': true, … } };
    const progress = computeProgress(journeyData, progressState);
    
    assert(progress.currentPhase);
    assert(progress.currentStep);
    assert(progress.stepProgress.done >= 0);
    assert(progress.stepProgress.total > 0);
    assert(progress.overall >= 0 && progress.overall <= 100);
  });
  
  it('handles missing task gracefully (no error, default to false)', () => {
    const journeyData = { phases: [ { steps: [ { tasks: [ { id: 'test.1' } ] } ] } ] };
    const progressState = { tasks: {} };  // Empty
    const progress = computeProgress(journeyData, progressState);
    assert.equal(progress.stepProgress.done, 0);
  });
});
```

#### Test: DOM render (browser smoke checks, manual hand-off)
Per §13, no Playwright in CI; developer hand-off via `/tests/tests.html`:
- Wizard: load step, fill field, see autosave (check Network tab).
- Profile: render About you + Application detail + criteria; click Edit on criteria; see save bar.
- Journey: render timeline; click step; see modal with checklist; tick task.
- Outreach: render grid; click filter chip; see grid re-render; click template; see dialog with preview.

---

### Known smells / tech debt / risks

#### 1. Three page-profile-*.js files (responsibility boundaries unclear)

**Files:** `page-profile.js` (219 lines), `page-profile-detail.js` (162 lines), `page-profile-page.js` (34 lines).

**Smell:** 
- Unclear who owns what. `page-profile.js` imports `page-profile-detail.js` but the relationship is implicit.
- If About you edit needs access to detail fields (e.g., "edit employment summary" should populate from detail), the logic scatters across two files.

**Risk:** 
- Growing `page-profile.js` beyond 300 lines without a clear sub-module structure.
- Adding new profile sections (e.g., "Lifestyle preferences") requires editing multiple files.

**Opportunity (Phase 1):** Merge into one coordinator + three submodules (`profile/{about,detail,application}.js`), each owning its card's render + edit.

---

#### 2. Wizard complexity (1688 LOC across 6 modules, implicit branching)

**Files:** `wizard.js`, `steps.js`, `validate.js`, `completeness.js`, `autosave.js`, `a11y.js`.

**Smell:**
- Branching is implicit: a field like `profile.selfEmployment.structure` is hidden for employed, shown for self-employed, but the rule lives in `steps.js` conditionals.
- No single place to audit: "what fields are visible for state X?" requires reading multiple conditionals across files.
- Risk of "field hidden, but value preserved" — user changes `employment.basis` to 'cash-buyer', self-employment fields hide, but their old values are still in the blob (not shown, but persisted).

**Opportunity (Phase 6):** Replace implicit conditionals with reactive `visibleFields(state)` getter; add a "what if?" sidebar to preview branch effects.

---

#### 3. Template maintainability (30+ templates, no auto-generated dataNeeded)

**File:** `data/outreach-templates.json` (≈3KB).

**Smell:**
- `dataNeeded` is hand-written per template. If a template body references `{{profile.middleName}}` but `dataNeeded` doesn't list it, the renderer shows blank.
- No build-time validation that `dataNeeded ⊇ {placeholders in body}`.

**Opportunity (Phase 2):** At build time, parse template body (regex: find all `{{...}}` keys), generate `dataNeeded` automatically, validate against hand-written version (warn if mismatch).

---

#### 4. Journey data staleness (static repo JSON)

**File:** `data/journey.json`.

**Smell:**
- Static repo JSON; if the real buying journey changes (new step, step reordering), JSON is hand-edited.
- Risk: Outdated guidance if content lags behind real experience.

**Opportunity (Phase 4):** Move to Supabase content table (like areas/house_types), allow owner to edit via portal + MCP.

---

#### 5. Outreach form a11y (unclear labelling + missing ARIA live)

**File:** `outreach/dialog.js`.

**Smell:**
- Dialog has context fields (contact, property, viewing-date) — unclear if all have programmatic labels.
- Preview pane updates on input change; no ARIA live region to announce update.
- Risk: Screen-reader users may miss that substitution happened.

**Opportunity (Phase 5):** 
- Add `aria-label` + `<label>` to all context inputs.
- Add `aria-live="polite"` to preview pane; announce "Email preview updated with new contact details" on change.

---

#### 6. Profile-schema forward compatibility (unknown future fields)

**File:** `profile-schema.js` (CONSUMED set, lines 43–51).

**Smell:**
- Unknown keys pass through verbatim (good for data safety). But if a future schema adds a field (e.g., `insuranceAndProtection`) and it's not in CONSUMED, it could be misplaced (nested under `person` instead of top-level).
- No validation that unknown keys are deliberately added.

**Opportunity:** Test exhaustively; consider a strict mode that warns if an unknown key is seen.

---

#### 7. Criteria edit paradigm mismatch (dialog vs. save-bar)

**Files:** `page-profile.js` (uses modal dialog), `page-criteria.js` (uses inline edit + sticky save bar).

**Smell:**
- Different UX for the same data class (user-state blob).
- User confusion: "Why can I edit profile in a dialog but criteria inline?"

**Opportunity (Phase 3):** Converge on one paradigm. Either:
- Profile to save-bar (less modal interruption).
- Criteria to dialog (contained, clear commit point).

---

#### 8. Outreach contact picker UI (UNCONFIRMED a11y)

**File:** `outreach/contacts.js` + `outreach/dialog.js`.

**Smell:**
- Contact picker: `<select>` + free-text fallback. Unclear if UI is accessible, if typing creates a contact inline, or requires separate add-contact flow.

**Opportunity (Phase 5, part 2):** Verify a11y; consider splitting contact picker from template dialog if it's complex.

---

### Refactor opportunities (Fable to sequence)

#### Phase 1: Unify profile-page modules
**Aim:** Merge `page-profile.js` + `page-profile-detail.js` + `page-profile-page.js` into one coordinator + `profile/{about,detail,application}.js` submodules.

**Impact:** Clearer responsibility; one init; shared edit-state machine for all cards.

**Effort:** Medium (2–3 hours). No data model change; purely structural.

**Plan:**
1. Create `profile/about.js`: render About you card (read + edit dialog).
2. Create `profile/detail.js`: render Application detail card (read-only).
3. Create `profile/application.js`: render Search criteria card (read + edit + save-bar).
4. Create `profile/coordinator.js`: initialize all three, manage shared state (edit mode), wire save callbacks.
5. Delete `page-profile.js`, `page-profile-detail.js`, update `page-profile-page.js` to import coordinator.

---

#### Phase 2: Validate + auto-generate template dataNeeded
**Aim:** Parse template body at build time; cross-check `dataNeeded` against found placeholders.

**Impact:** Catch template maintenance bugs; make `dataNeeded` explicit.

**Effort:** Low (1–2 hours). Add lint rule to `tools/run-intelligence-tests.mjs`.

**Plan:**
1. Create `tools/lint-outreach-templates.mjs`: load `data/outreach-templates.json`, regex-parse each `bodyTemplate` for `{{...}}` keys.
2. Compare found keys to `dataNeeded` array.
3. Report mismatches: "Template A1 references `{{profile.middleName}}` but it's not in `dataNeeded`."
4. Optionally auto-generate `dataNeeded` from body.
5. Wire into harness.

---

#### Phase 3: Converge profile/criteria edit modes
**Aim:** Pick one paradigm (modal dialog or sticky bar) and apply consistently.

**Impact:** Reduce UX friction; one edit affordance.

**Effort:** Medium (3–4 hours). UI/UX + CSS refactor.

**Plan:**
1. A/B decision: modal dialog or sticky bar? (Product input needed.)
2. If dialog: move criteria to a native `<dialog>` with Cancel/Save buttons.
3. If save-bar: move profile to inline edit + sticky bar (like criteria).
4. Update CSS (remove duplicate styles).
5. Test both flows (wizard → profile → criteria).

---

#### Phase 4: Move journey.json to Supabase content table
**Aim:** Add `journey_phases` table (like `areas`/`house_types`); migrate data; allow owner to edit.

**Impact:** Live updates to buyer journey without code redeploy.

**Effort:** High (6–8 hours). Migration + portal UI + content model.

**Plan:**
1. Create migration (Supabase): `CREATE TABLE journey_phases (id, version, phases JSONB, …)` with RLS.
2. Migrate `data/journey.json` into the table.
3. Update `page-journey.js` to load from Supabase instead of repo JSON.
4. (Optional) Add portal UI to edit phases.
5. Test deep-links to outreach templates (still work?).

---

#### Phase 5: Outreach context picker a11y audit + refactor
**Aim:** Verify contact picker + property picker are WCAG 2.2 AA; split complex flows if needed.

**Impact:** Accessible email generation for screen-reader users.

**Effort:** Medium (3–4 hours). Audit + a11y fixes + possible dialog refactor.

**Plan:**
1. Audit: all form fields have `<label>`, inputs have `aria-label` fallback?
2. Add `aria-live="polite"` to preview pane; announce updates.
3. Test contact picker with screen reader (manual).
4. If contact picker UX is complex, split into separate "Add contact" flow.

---

#### Phase 6: Wizard reactivity + "what if?" preview
**Aim:** Replace implicit step inclusion with reactive `visibleFields`; add sidebar to show branch effects.

**Impact:** Lower friction for first-time users; clearer mental model of branching.

**Effort:** High (8–10 hours). State machine rewrite.

**Plan:**
1. Refactor `steps.js`: expose `visibleFields(state)` as a computed property (or selector).
2. Add a "what if?" sidebar: dropdown to pick a different buying-situation + employment; show how visibleFields change.
3. Rewrite wizard branching to use reactive `visibleFields` instead of implicit `include?()`.
4. Test all branch combinations (FTB + employed, cash-buyer + self-employed, etc.).

---

### Suggested sub-phases (draft Fable roadmap)

**Assumption:** Fable executes one sub-phase per turn (≤2–3 hours work). Each is self-contained and green-light testable.

1. **Profile-page coordinator split** (Phase 1 above)
   - Merge three files into one + three submodules.
   - No data model change; purely organizational.

2. **Wizard steps.js audit + simplification** (prep for Phase 6)
   - Document exact conditions under which each field is visible.
   - Propose reactive alternatives to current conditionals.
   - Identify unused steps or fields.

3. **Outreach template lint rule** (Phase 2 above)
   - Add validator to `tools/run-intelligence-tests.mjs`.
   - Check `dataNeeded ⊇ {placeholders found in body}`.
   - Report mismatches + suggest auto-generated `dataNeeded`.

4. **Criteria edit-mode UX alignment** (Phase 3 above)
   - Audit current profile dialog vs. criteria save-bar.
   - Propose unified edit paradigm.
   - Plan CSS + HTML changes.

5. **Outreach dialog a11y fixes** (Phase 5 above, part 1)
   - Verify all form fields have labels.
   - Add ARIA live regions for preview updates.
   - Manual screen-reader test.

6. **Journey.json → Supabase migration** (Phase 4 above; lowest priority)
   - Design `journey_phases` schema.
   - Write migration.
   - Update loader to read from Supabase.

---

### Tailored Q&A for the owner

**Design decisions before Fable's refactor begins:**

1. **Onboarding wizard scope:** Currently branches on buying-situation + employment-basis + applicants, revealing/hiding ~50 fields. Is this the right scope? Are there fields users never fill or get wrong? Should some be required, others optional?

2. **Profile-edit paradigm:** Profile uses modal dialog; criteria uses sticky save-bar. Which do you prefer for both? (Or do they have different UX reasons?)

3. **Journey vs. real process:** Phases are Finances → MIP → Search → Offer → Post-acceptance → Pre-completion → Completion. Does this reflect the actual order users go through? Are any steps stale or in the wrong order?

4. **Outreach templates: auto-generated subjects?** Many have `subjectTemplate: "Viewing — {{listing.address}}"`. Are these hand-edited by users, or should they be auto-generated from body context?

5. **Contacts storage:** Contacts blob holds agents/brokers/solicitors/surveyors by role. Should users be able to tag contacts with areas (e.g., "agent X covers area Y") or search by location?

6. **Template prioritization:** Which 3 outreach templates have the most impact? (E.g., A1 viewing request likely #1.) Should the grid default to "just show me the most common ones" rather than all 30+?

---

### File paths (absolute, for Fable reference)

**Pages & coordinators:**
- `/home/user/rec/pages/profile.html`
- `/home/user/rec/pages/setup.html`
- `/home/user/rec/pages/journey.html`
- `/home/user/rec/pages/outreach.html`
- `/home/user/rec/assets/js/page-profile.js`
- `/home/user/rec/assets/js/page-profile-detail.js`
- `/home/user/rec/assets/js/page-profile-page.js`
- `/home/user/rec/assets/js/page-criteria.js`
- `/home/user/rec/assets/js/page-setup.js`
- `/home/user/rec/assets/js/page-journey.js`
- `/home/user/rec/assets/js/page-outreach.js`

**Setup wizard:**
- `/home/user/rec/assets/js/setup/wizard.js`
- `/home/user/rec/assets/js/setup/steps.js`
- `/home/user/rec/assets/js/setup/validate.js`
- `/home/user/rec/assets/js/setup/completeness.js`
- `/home/user/rec/assets/js/setup/autosave.js`
- `/home/user/rec/assets/js/setup/a11y.js`

**Journey:**
- `/home/user/rec/assets/js/journey/progress.js`
- `/home/user/rec/data/journey.json`

**Outreach:**
- `/home/user/rec/assets/js/outreach/grid.js`
- `/home/user/rec/assets/js/outreach/filters.js`
- `/home/user/rec/assets/js/outreach/dialog.js`
- `/home/user/rec/assets/js/outreach/contacts.js`
- `/home/user/rec/assets/js/outreach/context.js`
- `/home/user/rec/assets/js/outreach/log.js`
- `/home/user/rec/assets/js/outreach/state.js`
- `/home/user/rec/assets/js/outreach/toast.js`
- `/home/user/rec/assets/js/outreach-store.js`
- `/home/user/rec/assets/js/outreach-renderer.js`
- `/home/user/rec/data/outreach-templates.json`

**Storage (guard-rail, extend only):**
- `/home/user/rec/assets/js/profile-schema.js`
- `/home/user/rec/assets/js/storage/user-state.js`
- `/home/user/rec/assets/js/storage/outreach.js`

**Criteria:**
- `/home/user/rec/assets/js/criteria/form.js`

**CSS:**
- `/home/user/rec/assets/css/pages/setup.css`
- `/home/user/rec/assets/css/pages/journey.css`
- `/home/user/rec/assets/css/pages/shared.css`
- `/home/user/rec/assets/css/components/outreach.css`
- `/home/user/rec/assets/css/components/save-bar.css`
- `/home/user/rec/assets/css/components/field.css`

**Tests:**
- `/home/user/rec/tests/profile-schema.test.js`
- `/home/user/rec/tests/setup-wizard.test.js`
- `/home/user/rec/tests/criteria-form.test.js`
- `/home/user/rec/tests/journey-data.test.js`
- `/home/user/rec/tests/journey-progress.test.js`
- `/home/user/rec/tests/outreach-templates.test.js`
- `/home/user/rec/tests/characterization-outreach.test.js`

---

### Implementation notes for Fable

1. **Storage.js is guard-railed (§16):** Never rewrite `storage/user-state.js` or `storage/outreach.js` inline; extend via new exported functions in the internal split modules.

2. **Profile schema is idempotent:** Any refactor must preserve `canonical(canonical(x)) === canonical(x)`. Run `profile-schema.test.js` green before committing.

3. **Wizard tests are pure:** `setup-wizard.test.js` imports only pure logic (no DOM, no Supabase). Any refactor must stay unit-testable in Node.

4. **Data flows through storage.js:** All reads/writes to profile/criteria/finances/goals/journey/contacts/outreach go through `storage.js` accessors (never direct Supabase calls from page modules).

5. **Outreach templates are static content:** Changes to structure need migration + loader refactor + test updates.

6. **Journey.json is static content:** Same constraints; moving to Supabase is a separate high-effort phase.

7. **CSS is split by concern (§19):** `setup.css`, `journey.css`, `shared.css`, `components/outreach.css` are linked separately. New CSS lives in the relevant partial, never hardcoded in JS.

8. **Guard-rail surface (§16, NEVER TOUCHED):** `tokens.css`, `base.css`, `storage.js`, `finances.js`, `config.js`, `data-loader.js`, `dashboard.css` are excluded from feature work.
## 10.9 Segment: Backend, storage, data & sync

**Design anchor:** N/A (infrastructure)  
**Guard-rail surface (§16):** ALL extend-only; each change is its own approved phase with the sync ceremony (§18.2–§18.3)
- `assets/js/storage.js` (re-export shim, 12 LOC; guards 45-function public surface)
- `assets/js/storage/{core,user-state,listings,outreach,refinement,ask}.js` (the implementation)
- `assets/js/config.js`, `assets/js/data-loader.js`, `assets/js/supabase-client.js`, `assets/js/auth-guard.js`
- `data/schema/area.schema.json`, `supabase/schema.sql` (reference DDL; live truth is MCP migration history per §18.5)

**Redesign gate (§4.4):** The write-through-cache + four-class data model is FOUNDATIONAL (live-data-correctness invariant §3.5 must never break at any commit). Any re-architecture of core.js, the _get/_save pattern, household_id bootstrap, or the bidirectional sync ceremony requires an explicit owner approval phase, separate from feature work.

---

### File inventory

| File | Purpose & lines | Category |
|------|-----------------|----------|
| `assets/js/supabase-client.js` | Auto-generated by `pages/setup.html`; exports singleton `supabase` client initialized with Supabase URL + anon (publishable) key; safe iff RLS enforced on all tables (verified 2026-06-15: 31 tables, all RLS-enabled). Read-only, auto-generated. | Supabase client bootstrap |
| `assets/js/config.js` | Base URL resolver (`APP_BASE` from `import.meta.url`); `url(path)` helper for app-root-relative paths; `STORAGE_NS = 'rec'` (localStorage key prefix). Safe for root-level edits. | Base config |
| `assets/js/data-loader.js` | In-memory JSON cache; `loadJSON(name)` fetches from `data/` + caches; one-line public API; safe for non-breaking enhancements. | Utility |
| `assets/js/auth-guard.js` | Session check on every page load (async, non-blocking). Redirects logic: setup/pre-setup always pass; login+session→home; other pages+no session→login. Flash prevention via `data-auth-state` attribute in `<head>`. Safe for enhancement. | Auth guard |
| `assets/js/storage.js` | 12-line re-export shim preserving the exact 45-function public surface; split 2026-05 into siblings (core/user-state/listings/outreach/refinement/ask). **Guard-railed; never rewritten.** Per §16, any new capabilities require a new sibling module + export here + snapshot entry + test update + owner approval. | Shim (guard-railed) |
| `assets/js/storage/core.js` | THE SPINE: localStorage cache (readLocal/writeLocal/removeLocal); Supabase client bootstrap (_initSb, single promise); cached household_id (_getHid, invalidated on auth state change); toast notifications (_toast, aria-live); _sbGet/_sbUpsert helpers (blob read/upsert); _get/_save pattern (fast cache hit → bg revalidation → fallback to JSON seed); _normShortlist; auth helpers (getCurrentUser/signOut); _internal compat export. **Foundational § 4.4 gate.** | Core infrastructure |
| `assets/js/storage/user-state.js` | User-state CRUD (getProfile, saveProfile, getCriteria, saveCriteria, getFinances, saveFinances, getGoals, saveGoals, getContacts, saveContacts, getOutreach, saveOutreach, getReadinessChecklist, saveReadinessChecklist, getInvestments, saveInvestments). Refinement-driven criteria mutations (setAreaRadiusOverride, clearAreaRadiusOverride, raiseBudgetMax, lowerMinBeds, acceptPropertyType, denyPropertyType). All use _get/_save pattern with write-through cache. | User-state module |
| `assets/js/storage/listings.js` | Content & live listings: getAreaCatalog, getAreaDetail, getHouseTypes; per-household area selection (getHouseholdAreas, joins household_areas + areas tables); getListings, saveListingReaction, getListingReactions (append-only log reduce), getLearnedPreferences, saveLearnedPreferences, saveReviewedMarker. Resolves household-onboarding stubs vs curated repo areas. | Listings & content module |
| `assets/js/storage/outreach.js` | Outreach features: getContacts, getOutreachLog, getAreaConfirmations, saveAreaConfirmations, getAreaReviewData (from areas table via storage read-through). Write-through cache for all except the areas read-through. | Outreach module |
| `assets/js/storage/refinement.js` | Read-only refinement suggestions (getRefinementSuggestions fetches from refinement_suggestions table). Stage 5 override writer: hideSuggestion, undoHide (both write to learned_preferences.overrides blob). No write-through cache (direct _sbGet per call); revalidation is caller-driven. | Refinement module |
| `assets/js/storage/ask.js` | Ask feature (natural-language assistant): listConversations, getConversation, saveConversation, deleteConversation. Direct Supabase calls (INSERT/SELECT/DELETE); no localStorage cache (relational table, cold load). Fire-and-forget error logging. | Ask module (feature-early) |
| `supabase/schema.sql` | Reference DDL (idempotent base). **NOT canonical** — live truth is the MCP migration history applied via `mcp__supabase__apply_migration`. Schema.sql is read-only from a workflow perspective; DDL changes never edit this file directly. File is present for new-project bootstrap and readability; live shape verified via `mcp__supabase__list_tables` + recorded in `docs/SCHEMA_NOTES.md`. | Reference DDL |
| `supabase/README.md` | Pointers to live truth (MCP migration history). Archive/ notes what's applied. Safe for documentation updates. | Documentation |
| `data/snapshots/sync-state.json` | **23 tracked tables** (21 user-state + 2 content mirrors). One entry per table: `last_synced_at` (ISO timestamp of MAX(updated_at) at session end) + optional `_note` (migration log). Counts for content tables. Enforced list in `tests/supabase-sync.test.js`. Updated at session start (pull fresher rows) and session end (verify all UPSERTs, update high-water). **High-water-mark source for freshness checks; read-only except at session end.** | Snapshot state |
| `data/fixtures/*.sample.json` | Redacted sample data: profile, criteria, finances, goals, contacts, investments. **Never edit unless explicitly adding a new user-state table.** Seeded only on true first install (when both cache and Supabase are empty) via _get's fallback branch. Tests + fresh-install fallback source. | Fixture data |
| `tools/check-supabase-freshness.mjs` | Session-start freshness check (CLAUDE.md §8 Step 0). Reads snapshot high-water marks; outputs MCP SQL queries to compare live MAX(updated_at) per table; guides Claude on what rows to pull (if user-state fresher) or re-push (if content behind). Non-destructive; outputs guidance. | Session tooling |
| `tools/sync-areas-from-supabase.mjs` | Materialises Supabase `areas` table → `data/areas/<id>.json` files. Run after every MCP UPSERT to areas. Skips household-onboarding rows (those never go to repo). Output piped to `tools/build-areas.mjs`. Per §18.5, areas are DB-canonical. | Materialisation tool |
| `tools/sync-content-to-supabase.mjs` | UPSERTs `data/house-types.json` into the `house_types` mirror table. Repo-canonical write path for house types (opposite of areas). One-time per session if house_types.json edited. Verifies row count post-UPSERT. | Content mirror tool |
| `tools/backfill-content-direct.mjs` | Bulk-loads JSON fixtures into Supabase via direct SQL UPSERT (service-role context). Used for onboarding fresh projects or restoring from backup. Idempotent; re-running overwrites. | Backfill tool |
| `tools/backfill-geofence.mjs` | Recomputes listing geofence assignments against corrected area pins (after area coordinates are updated). Non-UPSERT; reads listings + areas, outputs new assignments. Rarely run; deferred maintenance. | Geofence tool |
| `tests/supabase-sync.test.js` | **Offline suite**: snapshot exists + valid JSON; all 23 tracked tables present; shape validity (non-null last_synced_at for tables with data); reaction vocabulary locked (REACTIONS, GRADED_REACTIONS, REJECT_REASONS, PERSONAL_STATUSES); baseline gate wired (every listings writer imports passesBaseline); purge tool reuses gate (no divergent cleanup logic); areas parity (files↔DB byte-match); index sync (areas.json count = villages.csv IDs). **Online assertions (skipped as-passing in harness, run via MCP at session end)**: RLS policies on all tables, mirror counts match source, high-water timestamps match post-UPSERT. | Test suite |
| `tests/areas-db-repo-parity.test.js` | Every `data/areas/<id>.json` matches the Supabase `areas` row (id/data fields) post-materialisation. Byte-for-byte parity enforced; fails if file drifts from DB. | Parity test |
| `tests/areas-index-sync.test.js` | `data/areas.json` count = unique IDs in villages.csv; missing files/extra files flagged; status='active' only in index (deactivated areas stay in DB/files for ID stability). | Index sync test |

---

### Architecture & data flows

#### The four-class data model (CLAUDE.md §18.1; source of truth: docs/SUPABASE_SYNC.md §0–§1)

**Class 1: User state** (21 tables, per `household_id`; source of truth = **Supabase**)
- Tables: `profile`, `criteria`, `finances`, `goals`, `shortlist`, `zones`, `journey_checks`, `journey_progress`, `contacts`, `outreach`, `readiness_checklist`, `investments_accounts`, `investments_history`, `debts_credit_cards`, `debts_student_loans`, `debts_other`, `listing_reactions` (append-only), `learned_preferences` (recomputed), `area_confirmations` (blob), `household_areas` (relational PK `(household_id, area_id)`), `ask_conversations` (chat threads).
- Write path: Portal via `storage.js` → localStorage write-through → `_sbUpsert` (fire-and-forget); Claude via MCP `execute_sql` UPSERT → re-SELECT verification.
- Read path: `storage.js` _get pattern (cache → bg revalidate → Supabase → JSON seed fallback).
- **Never in repo JSON** (except redacted test fixtures in `data/fixtures/`).
- Conflict resolution: Supabase timestamp-wins (fresher row takes precedence). User-state always wins over Claude edits per §18.4 (user edit is the ground truth).

**Class 2: Content — areas** (1 table; source of truth = **Supabase** since 2026-06-04 §18.5 relaxation)
- Table: `areas` (Supabase only; per-area records with coordinates, schools, prices, sources, status).
- Materialised view: `data/areas/<id>.json` files + `data/areas.json` lightweight index.
- Write path: **DB-first.** MCP UPSERT → `tools/sync-areas-from-supabase.mjs` materialises → `tools/build-areas.mjs` regenerates index → `tests/areas-db-repo-parity.test.js` verifies parity → commit.
- Read path: App fetches from JSON (materialisations are pre-built; no live DB query at page load).
- **Never hand-edit repo files as the primary write.** An id/postcode migration must also edit `data/source/villages.csv` so the index regenerates with the new ID.
- Parity guarded: test fails if file and DB row disagree.

**Class 3: Content — other** (`house_types`, `checklists`, `outreach_templates`; source of truth = **repo JSON**)
- `house_types`: repo-canonical, with a Supabase mirror table. Write path: Edit `data/house-types.json` → `tools/sync-content-to-supabase.mjs` UPSERTs into mirror.
- `checklists`, `outreach_templates`: repo-only (no mirror table). Edit the JSON, commit.
- `data/areas.json` index: Derived from `data/source/villages.csv` + materialised per-area files by `tools/build-areas.mjs`. Not hand-edited.
- Read path: App fetches JSON via `data-loader.js` (in-memory cache).

**Class 4: System / engine** (3 + 5 = 8 tables; Supabase-managed, **never synced by Claude**)
- System: `households`, `household_members`, `sync_log` (audit trail of purges, service-role-only).
- Engine: `listings` (live content, hourly churn, fetcher-written, purge-eligible), `refinement_suggestions`, `refinement_runs`, `scrape_probation`, and the read-only reporting table `reports`.
- These tables are not mirrored to repo JSON; no snapshot entry for most (except listings gets a high-water entry for informational purposes).

---

#### The write-through cache pattern (localStorage → Supabase)

**Location: `assets/js/storage/core.js` lines 132–178 (_get, _save, _sbGet, _sbUpsert)**

**The _get pattern (read, lines 141–172):** Three-stage resolution per CLAUDE.md §18
1. **Fast path (cache hit):** readLocal returns immediately; background _sbGet revalidates in parallel (does not block).
   - If Supabase row is fresher (JSON.stringify differs), write to localStorage and fire onUpdate callback.
   - Caller receives cache instantly; revalidation is fire-and-forget (async).
   - Per §18.5, Supabase wins: if the DB row is newer, it overwrites the cache.
2. **No cache (cold load):** Synchronously await _sbGet from Supabase; write to localStorage; return fresh data.
   - Blocks the caller (UI waits for first data); necessary only on page load.
3. **Neither cache nor Supabase (true first install):** loadJSON from `data/fixtures/*.sample.json` as a seed; write to localStorage; return.
   - One-time only — after first write, localStorage is populated and this branch never runs again.
   - Fixtures are redacted sample data (no user secrets).

**Rationale:** Fast page renders (cache) + eventual consistency (bg revalidate) + fallback for new installs (fixtures).

> **✅/➕ External validation — offline/cache (E3):** The localStorage write-through cache is **confirmed
> proportionate** for a single-user, read-heavy app — do **not** add PowerSync/ElectricSQL prematurely
> (a Supabase maintainer calls full sync engines overkill for caching). Additions to fold in: (1) name
> the pattern **stale-while-revalidate with versioned cache keys** (so a schema change invalidates old
> caches cleanly); (2) move the **viewing-checklist offline data** and any larger/structured data to
> **IndexedDB** (`idb-keyval`/Dexie) rather than localStorage; (3) for offline **writes**, use an
> **IndexedDB-backed outbox/replay queue** flushed on reconnect (today's `_sbUpsert` is fire-and-forget
> and a lost write is silent — see Error handling at line 8342); (4) list PowerSync/ElectricSQL as the
> **upgrade path only** if multi-device real-time or robust offline-write becomes a requirement.
> (PowerSync, Oct 2025.)

**Precondition:** localStorage must be available (not in private mode, not over-quota); fixture files must exist for each table; Supabase client must be initialized (lazy _initSb).

**Side effects:** localStorage cache is written; onUpdate callback is fired async; background network call made.

**The _save pattern (write, lines 174–178):** Two-stage write (fast local + bg remote)
1. **Synchronous:** writeLocal to localStorage immediately (instant render, user sees the change).
2. **Fire-and-forget:** _sbUpsert to Supabase in background; errors logged to console + toasted.
   - UPSERT with `onConflict: 'household_id'` (blob tables) or `(household_id, area_id)` (relational household_areas).
   - Sets `updated_at: new Date().toISOString()` on every UPSERT (timestamp tracking for freshness checks).

**Rationale:** Local writes are instant (good UX); remote writes are best-effort (network is unreliable). Divergence is detected and healed by _get's revalidation.

**Preconditions:** household_id must be cached; Supabase must be initialized; data must be valid JSON.

**Error handling:** _sbUpsert catches and logs errors; does NOT retry. Lost write = localStorage is safe, next session's freshness check may detect the row is stale (if Supabase has not been updated by another client).

---

#### Supabase client bootstrap (core.js lines 21–62)

**The household_id cache (lines 41–56, _getHid)**
- Fetches once per page lifetime from `household_members` table using the session `user.id`.
- Cached in `_hid` (module-level variable, cleared on auth state change).
- Returned as `null` if Supabase is not initialized, no session, or query fails.
- Every user-state read/write depends on this: no _hid → all operations return null (fail silently).

**The Supabase client singleton (lines 27–39, _initSb)**
- Lazily imported (so the site works before supabase-client.js exists during setup).
- Single in-flight promise (_sbInitP) ensures only one init happens, even if multiple calls race.
- Sets `_sb = undefined` if the module fails to load (pre-setup or bad credentials).
- Cached singleton (`_sb`) reused for all API calls.

**Auth state invalidation (lines 58–62)**
- Registers `onAuthStateChange` listener (fired on sign-in/sign-out).
- Clears `_hid = null` on every change, forcing a fresh fetch next time _getHid is called.
- Ensures stale household_id doesn't leak across users (e.g., if the browser's session cookie is cleared).

**Safety model: Publishable key + RLS**
- `supabase-client.js` holds only the **anon (publishable) key**, designed to be committed (safe for browser).
- Every table has **Row Level Security** enabled (verified 2026-06-15: 31 tables).
- RLS policies use `is_household_member()` function (lines 51–63 of schema.sql) to check session user_id against household_members.
- Outcome: Anon key is safe because the DB enforces per-household data isolation at the row level.

> **✅/⚠️ External validation — key model (E1):** The "anon key is safe in the browser **iff** RLS is
> enforced" claim is still **true** (Supabase docs). **But** Supabase is **retiring the legacy
> anon/`service_role` JWT keys** in favour of `sb_publishable_*` (client-safe) and revocable
> `sb_secret_*` (server-only). **Add a task** to (1) verify `supabase-client.js` ships an
> `sb_publishable_*` key (and **never** a secret/`service_role` key), and (2) migrate the project off
> the legacy keys if it hasn't already. Bonus: the new publishable key also **hides the OpenAPI
> schema**. (Supabase Security Retro 2025; GitHub supabase/supabase#29260.)

> **⚠️ External validation — RLS misconfiguration is the dominant failure mode (E2):** RLS
> *enabled-but-misconfigured* (or silently disabled on a new table) is the dominant Supabase breach
> class (CVE-2025-48757). Add to the **online** test layer an assertion that runs
> `SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;` and **fails if any
> user-data table lacks RLS**; run the **Supabase Security Advisor** in CI; and consider column-level
> security / moving any global tables off the exposed `public` schema. (vibeappscanner / PTKD, 2026.)

---

#### Bidirectional sync contract (CLAUDE.md §18; full ceremony in docs/SUPABASE_SYNC.md §2–§3)

**Session start: Pull upstream (CLAUDE.md §8 Step 0, §18.2)**

1. **Freshness check:** `node tools/check-supabase-freshness.mjs` reads `data/snapshots/sync-state.json` (cached high-water marks).
2. **MCP query:** `mcp__supabase__execute_sql` with UNION query: `SELECT table_name, MAX(updated_at) FROM [each tracked table]`.
3. **Decision logic:**
   - If **user-state table is fresher** than snapshot: User edited in the portal. Pull the row via `execute_sql SELECT`, update snapshot, surface a one-line diff.
   - If **content table is behind** snapshot: Previous session failed to mirror. Re-push from repo via MCP UPSERT before anything else.
   - If all timestamps match: No upstream changes; proceed normally.

**Session end: Push changes (CLAUDE.md §18.3, enforced by harness §6)**

1. **Every edited user-state row:** MCP `execute_sql` UPSERT → verify by re-SELECT (same turn, no divergence possible).
2. **Every edited content file:** MCP UPSERT (areas via materialiser, house_types via sync-content tool) → verify row count + `updated_at`.
3. **Snapshot update:** Write new `last_synced_at` values (the MAX(updated_at) just verified) + optional `_note` annotation.
4. **Test harness:** `node tools/run-intelligence-tests.mjs` runs all offline tests + the sync suite (`tests/supabase-sync.test.js`).
5. **Git commit:** `git commit -m "..."` ending with **footer: "Supabase: pushed N areas, M user-state rows"**.
6. **If any UPSERT fails:** Session is **incomplete** — do not commit. Fix the error or surface it to the user.

**MCP mandatory:** All Supabase DDL via `mcp__supabase__apply_migration` (never direct SQL in the dashboard). Migration history is canonical; `schema.sql` is reference only.

---

#### Content mirrors (areas + house_types)

**Areas (DB-first write path)**
- MCP `execute_sql` UPSERT → `tools/sync-areas-from-supabase.mjs` materialises files → `tools/build-areas.mjs` regenerates index from villages.csv + per-area files → `tests/areas-db-repo-parity.test.js` verifies parity → `tests/areas-index-sync.test.js` checks index count → `tools/verify-area-coords.mjs --online` spot-checks (optional, used for coord corrections) → commit.
- **Skips household-onboarding stubs** (source='household-onboarding' rows added via the gated INSERT policy; never materialised to repo).
- Parity enforced: test fails if a repo file's id/data differs from the DB row.
- An id/postcode migration also rewrites `data/source/villages.csv` (new ID must match the generated index) and carries references (narrow user-state relaxation: `area_confirmations` keys — the confirmed list).

**House types (repo-first write path)**
- Edit `data/house-types.json` → `tools/sync-content-to-supabase.mjs` UPSERTs into `house_types` mirror (one row per entry).
- Mirror is rebuilt from the file, never edited via the Supabase dashboard.
- Verify row count post-UPSERT; on mismatch, re-push.

**Checklists / Outreach templates (repo-only, no mirror)**
- Edit the JSON in `data/checklists.json` or `data/outreach-templates.json`; commit.
- No mirror table; nothing to sync.
- App fetches JSON directly via `data-loader.js`.

---

#### Auth guard (assets/js/auth-guard.js)

Runs on every page load (async, non-blocking). Redirect logic (lines 9–54):

1. **Setup page** (`/setup.html`): Always accessible (unguarded). Remove `data-auth-state` attribute, reveal page.
   - Rationale: Setup holds credential tools; blocking it would trap users with bad supabase-client.js.

2. **Pre-setup** (no supabase-client.js): Catch import error; remove `data-auth-state`; reveal page.
   - Rationale: Site works before Supabase setup.

3. **Login page** + session exists: Redirect to home (or `?next=` param if present) to resume after sign-in.

4. **Any other page** + no session: Navigate to login with `?next=current-page` (resume after sign-in).
   - Page stays hidden during navigation (pending); never becomes visible.

5. **Session confirmed:** Remove `data-auth-state` attribute; page becomes visible.

**Flash prevention:** Every page sets `data-auth-state="pending"` in `<head>` via a blocking `<script>` tag (before `</head>`). Auth-guard removes the attribute once session is checked, revealing the body. On redirect, the page navigates away before anything renders.

---

#### Data classification in snapshot (data/snapshots/sync-state.json, enforced by tests/supabase-sync.test.js:26–44)

**23 tracked tables** (canonical list in `tests/supabase-sync.test.js` lines 33–40):

**User-state (21):** profile, criteria, finances, goals, shortlist, zones, journey_checks, journey_progress, contacts, outreach, readiness_checklist, investments_accounts, investments_history, debts_credit_cards, debts_student_loans, debts_other, listing_reactions, learned_preferences, area_confirmations, household_areas, ask_conversations.

**Content mirrors (2):** areas (count = directory index, 192; DB holds 196 incl. deactivated), house_types (count = 15).

**Untracked:** listings (live-content, hourly churn; has high-water entry for info), refinement_suggestions, refinement_runs, scrape_probation (engine-managed), reports (un-curated).

**Shape per entry:**
- Tables with real data: `last_synced_at` (ISO timestamp, non-null), optional `_note` (migration log).
- Content tables: `last_synced_at` + `count` (verified at session end).
- Empty tables (debt): `last_synced_at: null` (never synced) or count 0.

**Version & backwards-compat:** Snapshot structure is v3+ (schema notes in SUPABASE_SYNC.md). If a table is added, the test enforces it appears in the snapshot (test fails otherwise).

---

### Coupling & dependencies

#### Every page module → storage.js (45-function public surface)

All data flow goes through documented getters/setters. Page modules never call Supabase directly.

**User-state blobs:** getProfile, saveProfile, getCriteria, saveCriteria, getFinances, saveFinances, getGoals, saveGoals, getContacts, saveContacts, getOutreach, saveOutreach, getReadinessChecklist, saveReadinessChecklist, getInvestments, saveInvestments.

**Area & listing content:** getAreaCatalog, getAreaDetail, getHouseTypes, getHouseholdAreas (relational join), getListings, saveListingReaction, getListingReactions, getLearnedPreferences, saveLearnedPreferences, saveReviewedMarker.

**Shortlist (with defenses):** getShortlist, saveShortlist (uses _normShortlist to fix stale shapes).

**Refinement (read-only + Stage 5 mutations):** getRefinementSuggestions, hideSuggestion, undoHide (writes to learned_preferences.overrides).

**Auth helpers:** getCurrentUser, signOut.

**Ask (chat feature):** listConversations, getConversation, saveConversation, deleteConversation.

**Internal compat (§16 legacy):** _internal (enhanced writeLocal for page-journey.js' dual-write to journey_checks).

**Invariant:** No direct `supabase.*` calls in page modules. All storage layer calls go through storage.js. Violations are refactoring candidates.

---

#### Snapshot high-water-mark mechanism (sync-state.json + tools/check-supabase-freshness.mjs)

**Session start:**
1. Freshness check reads snapshot high-water marks.
2. MCP SQL queries live MAX(updated_at) per table.
3. If user-state is fresher: Claude pulls the row and updates snapshot before proceeding.
4. If content is behind: Claude re-pushes before editing anything else.

**Session end:**
1. Every UPSERT is verified by re-SELECT (same transaction context, no divergence).
2. Snapshot is updated with new MAX(updated_at) values (the high-water marks just verified).
3. Harness runs sync tests; commit includes "Supabase: N rows" footer.

**Failure mode (high risk, medium severity):**
- If a session UPSERTs and skips the snapshot update, the next session's freshness check will see the DB fresher and may pull stale data (thinking the user edited in the portal).
- **Mitigation:** Mandatory snapshot update before commit (enforced by the ceremony).
- **Detection:** Snapshot timestamp order is checked by code review + harness tests.

**Invariant:** Snapshot high-water marks are **never** set to a time in the future. They are only updated to the MAX(updated_at) just verified from Supabase.

---

#### sync_log table (system, not tracked)

Records every `tools/purge-listings.mjs` deletion (e.g., 551 removed rows on 2026-06-04, with reason/count per area). Written by service-role tools only (never by Claude directly via MCP — only via MCP-triggered tools). Browser has no INSERT RLS (so Stage 5 listing hiding via saveListingReaction cannot write audit rows). Not a tracked sync table (not in snapshot).

---

### Feature & behaviour catalogue (vetted, with file:line citations)

#### F1: localStorage write-through cache — instant render + eventual consistency

**Purpose:** Fast page renders (cache hit) + eventual data consistency (background revalidation from Supabase).

**Trigger/entry:** Every call to `storage.js` getter (e.g., `getProfile`, `getCriteria`, etc.) → `storage/user-state.js#getProfile` (line 9) → `storage/core.js#_get` (line 141).

**Inputs & preconditions:**
- `lsKey` (string): localStorage key for this table (e.g., `'profile'`).
- `table` (string): Supabase table name (e.g., `'profile'`).
- `fallbackJson` (string): Path to fixture file if needed (e.g., `'fixtures/profile.sample'`).
- `onUpdate` (callback): Fired when background revalidation finds divergent data.
- Precondition: localStorage available; Supabase initialized; household_id cached.

**Precise rule (lines 141–172 of core.js):**
```
_get(lsKey, table, fallbackJson, onUpdate):
  cached = readLocal(lsKey)
  if cached !== null:
    fire _sbGet in background (no await)
    return cached immediately
    (background: if Supabase row differs, writeLocal + fire onUpdate)
  
  fresh = await _sbGet(table)  // synchronous wait
  if fresh !== null:
    writeLocal(lsKey, fresh)
    return fresh
  
  // No cache, no Supabase → seed from JSON
  if fallbackJson:
    seed = await loadJSON(fallbackJson)
    writeLocal(lsKey, seed)
    return seed
  
  return null
```

**Outputs & effects:**
- Return value: cached data (if hit) or fresh Supabase data or seeded fixture.
- Side effects: localStorage cache written; onUpdate callback fired async; Supabase network call made.
- Invariant: Supabase row is the source of truth (fresher row overwrites cache).

**Edge cases:**
1. **Cache hit + divergent revalidation:** Caller renders cache immediately; onUpdate callback fires 100ms later (async). Caller must re-render idempotently on onUpdate (some pages wire this, others don't — see Known smells).
2. **Network failure during revalidation:** _sbGet catches error (logs to console); returns null. Cache is preserved; onUpdate not fired. Next session's freshness check will re-attempt.
3. **localStorage full:** writeLocal catches error; returns false. Subsequent reads fall back to Supabase (no local cache). Data is preserved on Supabase; user just gets slower loads.
4. **Fixture file missing:** loadJSON throws; _get returns null. Caller gets null (should handle gracefully).

**Invariants/acceptance criteria (testable):**
- Round-trip: write via saveProfile → read via getProfile → value matches input (localStorage + Supabase sync verified offline).
- Revalidation: call _get with cache hit, wait 200ms, verify background _sbGet was called (spy on _sbGet in test).
- Divergence resolution: simulate cached value != Supabase value, call _get, verify onUpdate is fired + cache is updated.

---

#### F2: write-through UPSERT — local-first, remote-best-effort

**Purpose:** Instant local render (localStorage write) + asynchronous remote persistence (Supabase UPSERT).

**Trigger/entry:** Every call to `storage.js` setter (e.g., `saveProfile`, `saveCriteria`) → `storage/user-state.js#saveProfile` (line 10) → `storage/core.js#_save` (line 174).

**Inputs & preconditions:**
- `lsKey` (string): localStorage key.
- `table` (string): Supabase table name.
- `value` (object): Data to write (JSON-serializable).
- Precondition: household_id cached; Supabase initialized; value is valid JSON.

**Precise rule (lines 174–178 of core.js):**
```
_save(lsKey, table, value):
  writeLocal(lsKey, value)           // synchronous, instant
  _sbUpsert(table, value)            // fire-and-forget
  return true

_sbUpsert(table, value):             // lines 115–130
  [sb, hid] = await _initSb(), _getHid()
  if !sb || !hid: return             // silent fail if no setup
  try:
    sb.from(table).upsert(
      { household_id: hid, data: value, updated_at: now },
      { onConflict: 'household_id' }
    )
  catch e:
    console.error(`storage: write ${table}`, e.message)
    _toast(`Sync error (${table}): ${e.message}`, true)
    // no retry; error is lost (data is safe in localStorage)
```

**Outputs & effects:**
- Return: true (from _save).
- Side effects: localStorage cache written (instant); Supabase UPSERT queued (async); `updated_at` timestamp set on Supabase row.
- Invariant: localStorage update succeeds; Supabase update is best-effort.

**Edge cases:**
1. **Supabase UPSERT fails (network, RLS, etc.):** Error is logged + toasted. Write is lost on Supabase but preserved in localStorage. Next session's freshness check will see the Supabase row is stale (if no other client updated it); user must re-save or refresh.
2. **User closes browser before background UPSERT completes:** localStorage persists; Supabase row is stale (user's change is lost on the server). Next session, freshness check detects stale row; user may need to re-enter the change or reload to sync.
3. **onConflict collision on relational tables (e.g., household_areas):** For relational tables, onConflict uses `(household_id, area_id)` (not just household_id). A row is only inserted if both keys are new; otherwise, the existing row is updated. Semantics: per-household area selections are unique by (household, area), so re-saving the same area's status updates that row in-place.
4. **Timestamp collision (two writes within 1ms):** Both get the same `updated_at` (up to millisecond precision). RLS still isolates by household_id; last-write-wins may be non-deterministic if timestamps are identical. Rare in practice (UX serializes user actions).

**Invariants/acceptance criteria:**
- Sync: write via _save → localStorage verified immediately; background UPSERT succeeds; re-SELECT verifies row exists on Supabase.
- Error resilience: simulate network failure in _sbUpsert → error toast appears → localStorage cache persists → next reload re-attempts via freshness check.
- Fire-and-forget: call _save, immediately return, verify it returns true before background UPSERT completes (no await).

---

#### F3: household_id bootstrap and caching

**Purpose:** Cache the household_id for a session so every user-state read/write knows which row to target.

**Trigger/entry:** First call to any storage getter/setter → `_get` or `_save` → `core.js#_getHid` (line 41).

**Inputs & preconditions:**
- Session user_id (from `supabase.auth.getSession().user.id`).
- Supabase client initialized.
- household_members table exists with RLS.

**Precise rule (lines 41–56 of core.js):**
```
_getHid():
  if _hid: return _hid        // already cached this session
  
  sb = await _initSb()
  if !sb: return null
  
  try:
    { session } = await sb.auth.getSession()
    if !session: return null
    
    { data } = await sb.from('household_members')
      .select('household_id')
      .eq('user_id', session.user.id)
      .limit(1)
    
    _hid = data?.[0]?.household_id ?? null
  catch:
    _hid = null
  
  return _hid

// On auth state change (lines 58–62):
sb.auth.onAuthStateChange(() => { _hid = null })
```

**Outputs & effects:**
- Returns: UUID string (household_id) or null.
- Side effects: _hid variable is set; will be reused for subsequent calls; cleared on auth state change.
- Caching strategy: Module-level variable (_hid); lives for the page lifetime.

**Edge cases:**
1. **No session:** _getHid returns null. All user-state reads/writes return null (fail silently). App may show read-only state (catalog only, no personalized data).
2. **User is not in household_members:** Query returns empty data. _hid = null. (Should not happen in normal flow; indicates inconsistent state — user has a session but no household membership.)
3. **RLS blocks the query:** Query fails with permission error. _getHid returns null. (Should not happen if RLS policies are correct; indicates misconfiguration.)
4. **Auth state changes (sign-in/sign-out):** onAuthStateChange listener clears _hid. Next call to _getHid will re-fetch (force a fresh household_id lookup). Prevents stale household_id from leaking across users.

**Invariants/acceptance criteria:**
- Bootstrap: start session, call _getHid → UUID returned.
- Caching: call _getHid twice → second call returns instantly (no re-query); prove by spying on sb.from('household_members').
- Invalidation: sign out, onAuthStateChange fires, call _getHid → re-queries and returns null (or new household_id if re-signed-in).

---

#### F4: Auth guard — page-load session redirect

**Purpose:** Enforce authentication on all pages except setup + login; prevent unauthenticated users from seeing protected content.

**Trigger/entry:** Every page load includes `<script type="module" src="/assets/js/auth-guard.js"></script>` in `<head>` (blocking, runs before body renders).

**Inputs & preconditions:**
- Page URL (location.pathname).
- Supabase session (via sb.auth.getSession()).
- data-auth-state attribute on <html> (set to "pending" by inline script before auth-guard runs).

**Precise rule (lines 9–54 of auth-guard.js):**
```
Setup page (/setup.html):
  → always accessible
  → removeAttribute('data-auth-state')
  → page renders

Pre-setup (no supabase-client.js):
  → catch import error
  → removeAttribute('data-auth-state')
  → page renders (site works before Supabase setup)

Login page + session exists:
  → removeAttribute('data-auth-state')
  → location.replace(params.get('next') || '../index.html')
  (redirect to home or ?next= param)

Any other page + no session:
  → do NOT removeAttribute (page stays hidden)
  → location.replace('/pages/login.html?next=current-url')
  (page never becomes visible; immediately navigates)

Any other page + session exists:
  → removeAttribute('data-auth-state')
  → page renders
```

**Outputs & effects:**
- Side effect: data-auth-state attribute removed (page becomes visible) or location.replace called (page navigates away).
- Invariant: No unauthenticated user sees a protected page.

**Flash prevention:**
- Every page has `data-auth-state="pending"` in <head> (inline script, blocks rendering).
- Auth-guard removes the attribute → CSS `[data-auth-state]` hide rule is lifted → page becomes visible.
- If redirect is needed, page navigates away before anything renders (pending state is maintained, page never seen).

**Edge cases:**
1. **Slow network:** Auth check takes 2–3 seconds. Page stays hidden until session is confirmed or redirect happens. User may see a blank screen (intended; prevents flash of unauth content).
2. **Setup page, no supabase-client.js:** User lands on /setup, sees the setup form, configures credentials, supabase-client.js is created. Page is already visible; no redirect needed. When user navigates to home, auth-guard runs and checks session.
3. **Login page redirect loop:** User at /pages/login?next=/pages/login. Auth-guard detects session exists, redirects to ?next= param, which is /pages/login, so they land back at login. Infinite loop possible (bad UX). Mitigation: URL params should never ?next=login; only next to other pages.
4. **Concurrent auth state change:** User signs out in another tab while this page is loading. onAuthStateChange listener may fire during auth-guard's session check. Race is resolved by re-checking session after every state change (next access to the page will redirect correctly).

**Invariants/acceptance criteria:**
- Protected page without session → redirect to login.
- Protected page with session → page renders (data-auth-state removed).
- Login page with session → redirect to ?next= or home.
- Setup page → always accessible (no redirect).

---

#### F5: Refinement suggestions — read-only + Stage 5 override mutations

**Purpose:** Display refinement suggestions (read-only from refinement_suggestions table); allow user to hide or undo hides via mutations to learned_preferences.overrides.

**Trigger/entry:** Refinement page loads → `storage.js#getRefinementSuggestions` (exported from storage/refinement.js) → direct Supabase SELECT (no write-through cache).

**Inputs & preconditions:**
- household_id cached (required for RLS).
- Supabase initialized.
- refinement_suggestions table exists (engine-written; no cache needed for read-only suggestion list).

**Precise rule (storage/refinement.js):**
```
getRefinementSuggestions():
  [sb, hid] = await _initSb(), _getHid()
  if !sb || !hid: return null
  try:
    { data } = await sb
      .from('refinement_suggestions')
      .select('*')
      .eq('household_id', hid)
      .order('rank', { ascending: true })
    return data ?? []
  catch: return []

hideSuggestion(suggestionId):
  lp = await getLearnedPreferences()
  overrides = { ...lp.overrides, [suggestionId]: true }  // hide this one
  return saveLearnedPreferences({ ...lp, overrides })

undoHide(suggestionId):
  lp = await getLearnedPreferences()
  overrides = { ...lp.overrides }
  delete overrides[suggestionId]  // remove the hide marker
  return saveLearnedPreferences({ ...lp, overrides })
```

**Outputs & effects:**
- getRefinementSuggestions: Returns array of suggestion records (or [] if none/error).
- hideSuggestion/undoHide: Updates learned_preferences.overrides blob; fires through _save → write-through cache + UPSERT.

**Edge cases:**
1. **Suggestion list changes during the session:** No cache for refinement_suggestions. Every call to getRefinementSuggestions hits the DB (fresh list). User sees new suggestions appear in real-time (or old ones disappear if the engine removed them).
2. **Undo hide, then hide again:** Each call reads the latest learned_preferences, modifies overrides, and saves. Multiple rapid calls may experience last-write-wins (if network is slow). No conflict detection.
3. **Hide + close page before UPSERT completes:** learned_preferences is updated in localStorage; UPSERT is fire-and-forget. If the UPSERT fails, the next session's freshness check will see the DB is stale; user may need to re-hide.

**Invariants/acceptance criteria:**
- Read suggestions: call getRefinementSuggestions → array returned (verified to match table structure).
- Hide: call hideSuggestion(id) → learned_preferences.overrides[id] = true → re-SELECT verifies.
- Undo: call undoHide(id) → overrides[id] deleted → re-SELECT verifies.

---

#### F6: Ask feature (natural-language chat)

**Purpose:** Persistent conversation threads stored in ask_conversations table; user can list, fetch, save, delete conversations.

**Trigger/entry:** Ask page loads → `storage.js#listConversations` (exported from storage/ask.js) → direct Supabase SELECT (relational table, not a blob).

**Inputs & preconditions:**
- household_id cached.
- Supabase initialized.
- ask_conversations table exists (RLS via is_household_member).

**Precise rule (storage/ask.js):**
```
listConversations():
  [sb, hid] = await _initSb(), _getHid()
  if !sb || !hid: return []
  try:
    { data } = await sb
      .from('ask_conversations')
      .select('id, title, created_at, updated_at')
      .eq('household_id', hid)
      .order('updated_at', { ascending: false })
    return data ?? []
  catch: return []

getConversation(conversationId):
  [sb, hid] = await _initSb(), _getHid()
  if !sb || !hid: return null
  try:
    { data } = await sb
      .from('ask_conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('household_id', hid)
      .limit(1)
    return data?.[0] ?? null
  catch: return null

saveConversation(conversation):
  [sb, hid] = await _initSb(), _getHid()
  if !sb || !hid: return false
  try:
    await sb
      .from('ask_conversations')
      .upsert(
        {
          id: conversation.id,
          household_id: hid,
          title: conversation.title,
          messages: conversation.messages,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
      )
    return true
  catch: return false

deleteConversation(conversationId):
  [sb, hid] = await _initSb(), _getHid()
  if !sb || !hid: return false
  try:
    await sb
      .from('ask_conversations')
      .delete()
      .eq('id', conversationId)
      .eq('household_id', hid)
    return true
  catch: return false
```

**Outputs & effects:**
- listConversations: Returns array of conversation summaries (id, title, timestamps).
- getConversation: Returns full conversation record (id, title, messages jsonb).
- saveConversation: UPSERT into ask_conversations (id is primary key; if exists, updates messages + title).
- deleteConversation: DELETE the row.
- **No localStorage cache:** Relational table (per-row reads/writes), not a blob. Cold load requires fetch. Offline reads not supported.

**Edge cases:**
1. **Cold load:** First call to getConversation hits the DB (no cache). Slow on poor networks.
2. **Stale conversation after reconnect:** If user edits messages offline (impossible; no offline cache), the edits are lost. Next session, the old version is fetched from Supabase.
3. **Concurrent edit (two devices):** saveConversation with onConflict='id' means the upsert always succeeds; last-write-wins (no version field). If user edits on phone + laptop simultaneously, one edit is lost.
4. **Delete + immediately re-fetch:** deleteConversation fires fire-and-forget. If user deletes and immediately tries to fetch the same ID, the DELETE may not have reached Supabase yet. Caller may get the old row back (race condition).

**Invariants/acceptance criteria:**
- Round-trip: call saveConversation → verify via getConversation (re-SELECT).
- List: call listConversations → returned array is sorted by updated_at descending.
- Delete: call deleteConversation → next getConversation returns null.

---

#### F7: Snapshot high-water marks and freshness detection

**Purpose:** Track MAX(updated_at) per table so session-start can detect upstream changes.

**Trigger/entry:** Session start → `node tools/check-supabase-freshness.mjs` → reads `data/snapshots/sync-state.json` → outputs MCP SQL to guide freshness check.

**Inputs & preconditions:**
- `data/snapshots/sync-state.json` exists (repo-versioned).
- 23 tracked tables with updated_at columns (schema enforces this).

**Precise rule (check-supabase-freshness.mjs lines 22–86):**
```
readSnapshot():
  return JSON.parse(data/snapshots/sync-state.json)

compare(snapshot, live MAX queries):
  for each table:
    snapshot_ts = snapshot[table].last_synced_at
    live_ts = MAX(updated_at) from Supabase
    
    if live_ts > snapshot_ts:
      if table is USER-STATE:
        → User edited in portal. Pull the row.
      elif table is CONTENT:
        → Previous session failed to mirror. Re-push.
    elif live_ts < snapshot_ts:
      → Snapshot is ahead (should not happen; indicates the snap was updated without a corresponding DB write).
    else:
      → Snapshot is up-to-date. Proceed normally.
```

**Outputs & effects:**
- Output: Guidance text + SQL queries to run.
- Side effect: None (tool is read-only; no writes).
- Snapshot is updated **only at session end** (after verifying UPSERTs).

**Edge cases:**
1. **Snapshot timestamps are all null:** All tables are considered "never synced". Next session will prompt to pull all tables. Normal on first setup.
2. **Live timestamps newer than snapshot by 1 minute:** May indicate the session ended with an incomplete UPSERTs (snapshot was not updated). Next session detects fresher DB; pulls rows; user may see "your data was updated" notification.
3. **Snapshot is ahead of live:** Should not happen (indicates the snapshot was manually edited or a previous session wrote the snap but the UPSERT failed). Operator review required.
4. **A content table (areas) is behind the snapshot:** Previous session failed to materialise (sync-areas-from-supabase did not run or failed). Next session re-pushes from the repo. Parity test should catch this (test fails if file↔DB disagrees).

**Invariants/acceptance criteria:**
- Freshness: after a session's UPSERT, snapshot timestamp is updated to match the just-verified MAX(updated_at).
- Detection: simulate a manual DB edit (e.g., SQL query outside Claude), run freshness check, verify it reports the table as fresher.
- Stale snap: manually backdate snapshot timestamp, run freshness check, verify it reports the table as behind (should not happen in normal flow).

---

#### F8: Bidirectional sync ceremony (full round-trip, CLAUDE.md §18.2–§18.3)

**Purpose:** Keep Supabase, repo JSON, and localStorage caches perfectly synchronized across all four data classes.

**Trigger/entry:** Session start (§18.2) and session end (§18.3); enforced by harness (§6) before commit.

**Inputs & preconditions:**
- Session is active (user has signed in).
- Supabase project is reachable.
- Snapshot file is valid JSON.
- All 23 tracked tables exist in Supabase (verified via list_tables).

**Precise ceremony (CLAUDE.md §18.2–§18.3; docs/SUPABASE_SYNC.md §2–§3):**

**Phase 1: Session start (pull upstream)**
```
1. mcp__supabase__list_tables
   → Verify schema is intact; all tracked tables exist; RLS enabled.

2. node tools/check-supabase-freshness.mjs
   → Output guidance + SQL to compare snapshot vs live MAX(updated_at).

3. mcp__supabase__execute_sql [UNION query per table]
   → Get live MAX(updated_at) for all tracked tables.

4. Compare snapshot to live:
   FOR each USER-STATE table:
     if live_ts > snapshot_ts:
       → mcp__supabase__execute_sql SELECT * WHERE updated_at > snapshot_ts
       → Update snapshot[table].last_synced_at = live_ts
       → Surface one-line diff to user ("areas criteria was updated")
   
   FOR each CONTENT table:
     if live_ts < snapshot_ts:
       → Previous session failed to mirror (UPSERT missing)
       → Re-push from repo before editing anything else
```

**Phase 2: Session work (edit content + user state)**
```
5. Read docs/CHECKLIST.md → next task.

6. Edits via MCP + repo files:
   - Areas: mcp execute_sql UPSERT → tools/sync-areas-from-supabase.mjs
   - House types: tools/sync-content-to-supabase.mjs UPSERT
   - User state: mcp execute_sql UPSERT (direct table edit)

7. Tool runs: tools/run-intelligence-tests.mjs (offline suite).
```

**Phase 3: Session end (push + verify)**
```
8. FOR each UPSERT made:
   mcp__supabase__execute_sql UPSERT { ... }
   
   (same transaction context or immediately after)
   mcp__supabase__execute_sql SELECT * WHERE household_id = ?
   
   → Verify row exists + updated_at is new (timestamp was updated).

9. FOR each content file edited:
   Tools: sync-areas-from-supabase.mjs, sync-content-to-supabase.mjs
   → Materialise files from DB or mirror from repo.
   → tests/areas-db-repo-parity.test.js, tests/areas-index-sync.test.js
   → Verify parity (files ↔ DB match byte-for-byte).

10. node tools/run-intelligence-tests.mjs
    → Runs offline suite + sync tests.
    → tests/supabase-sync.test.js checks:
      - Snapshot is valid JSON.
      - All 23 tables present.
      - Shape is well-formed (non-null timestamps for tables with data).
      - Vocabulary locked (REACTIONS, REJECT_REASONS, etc.).
      - Baseline gate wired (listings writers import passesBaseline).
      - Parity tests pass (areas files ↔ DB, index sync).

11. Update snapshot:
    FOR each edited table:
      snapshot[table].last_synced_at = MAX(updated_at) [just verified]
      snapshot[table]._note = "2026-06-16: [edit summary]"

12. git add [changed files]
    git commit -m "..."
    (commit message ends with footer: "Supabase: pushed N areas, M user-state rows")

13. If harness failed or UPSERT failed:
    → Session is INCOMPLETE. Do not commit.
    → Fix the error or surface it to the user.
```

**Outputs & effects:**
- Side effects: Supabase is updated (UPSERT); snapshot is updated; tests pass; changes are committed.
- Invariant: Every commit is "clean" (all tables in sync, snapshot updated, tests green).

**Edge cases:**
1. **Mid-session network failure:** UPSERT fails. _sbUpsert logs error + toasts. Session is incomplete (error not fixed). Do not commit.
2. **Snapshot updated but UPSERT failed:** Session is incomplete. The snapshot was bumped, but the row doesn't exist on Supabase (e.g., if you update the snapshot, make an UPSERT, then the UPSERT fails, the snapshot is out-of-sync). Must be fixed before commit.
3. **Multiple households in Supabase:** Snapshot is per-session (one household_id). Only that household's rows are pulled/pushed. Other households are never touched.
4. **RLS policy change mid-session:** If an RLS policy is dropped (e.g., manually in the Supabase dashboard), the UPSERT will fail with a permission error. Session is incomplete. Must re-enable RLS and retry.

**Invariants/acceptance criteria:**
- Pull: session-start freshness check detects upstream edits; Claude pulls them + updates snapshot.
- Push: session-end UPSERT → re-SELECT verifies row on Supabase.
- Parity: areas parity test passes (files ↔ DB match).
- Completeness: snapshot entries match Supabase MAX(updated_at) after session ends.
- Atomicity: all or nothing (all tables in sync, or error + no commit).

---

### Coupling & dependencies

#### Every page module → storage.js

All data access is serialized through the 45-function public API. Page modules never call Supabase directly.

**Dependency graph:**
- Page modules (page-profile.js, page-listings.js, etc.) → `storage.js` → `storage/{core,user-state,listings,outreach,refinement,ask}.js` → `supabase-client.js` + `data-loader.js`.
- No cross-module dependencies between storage siblings (each is self-contained).
- `storage/core.js` is the base; all siblings import helpers from core (readLocal, _initSb, _getHid, _sbGet, _sbUpsert, _get, _save, etc.).

**Violation pattern:** If a page module imports `supabase-client.js` or calls `sb.from(table).select()` directly, it bypasses write-through cache + freshness checks. Refactoring candidate.

---

#### Snapshot high-water-mark mechanism

**Dependencies:**
- `data/snapshots/sync-state.json` ← session-end writes (snapshot update).
- `tests/supabase-sync.test.js` ← reads snapshot (validates shape).
- `tools/check-supabase-freshness.mjs` ← reads snapshot (freshness guidance).

**Invariant:** Snapshot is the single source of truth for "what we know is on Supabase as of the last session end". If it drifts from the live DB (e.g., missing an UPSERT), the next session's freshness check will detect the mismatch and fix it.

---

#### sync_log table (system, not tracked)

**Dependency:** `tools/purge-listings.mjs` (service-role tool) writes sync_log on every purge run.

**Invariant:** Browser has no INSERT RLS on sync_log (only service-role can write). Stage 5 listing hiding (saveListingReaction) cannot write audit rows (by design — user data and audit logs are separate).

---

### Test coverage & behaviours new tests must pin

#### Offline suite (tests/supabase-sync.test.js, lines 1–117+)

1. **Snapshot validity** (lines 18–24): File exists, is valid JSON, is an object.
2. **All 23 tracked tables present** (lines 26–44): Enforced list from lines 33–40 (CRUD via canonical list in docs/SUPABASE_SYNC.md §0).
3. **Shape validation** (lines 47–61):
   - Tables with real data (goals, readiness_checklist, investments_accounts, investments_history) have non-null `last_synced_at`.
   - Debt tables exist but may be empty; shape must be present.
4. **Listing reactions vocabulary locked** (lines 64–76):
   - REACTIONS = [like, pass, reject] (3 verbs).
   - GRADED_REACTIONS only includes like + reject (pass is not graded).
   - REJECT_REASONS is {key, label} chips (≥3).
   - PERSONAL_STATUSES = [new, saved, viewed, offered, rejected] (lifecycle is immutable).
5. **Baseline gate wired** (lines 78–93):
   - `passesBaseline` + `propertyFingerprint` functions exist (assets/js/listings/classify.js).
   - Every listings writer (fetch-listings.mjs, import-apify-runs.mjs) imports + applies passesBaseline (pollution guard).
6. **Purge tool reuses gate** (lines 95–102):
   - `tools/purge-listings.mjs` imports + uses passesBaseline + propertyFingerprint (no divergent cleanup logic).
7. **Areas parity** (tests/areas-db-repo-parity.test.js):
   - Every `data/areas/<id>.json` file matches the Supabase `areas` table row (id + data fields).
   - Byte-for-byte verification after materialisation.
8. **Index sync** (tests/areas-index-sync.test.js):
   - `data/areas.json` entry count = unique IDs in villages.csv.
   - status='active' only in index (deactivated areas not listed).
   - Every index entry has a corresponding file or DB stub.

#### Online assertions (MCP-verified at session end, not run by harness)

- **Schema RLS:** all 31 tables have RLS policies enabled (verified via `list_tables`).
- **Content mirror counts:** areas count = index (192); house_types count = JSON entries (15).
- **High-water timestamps:** snapshot high-water marks match live MAX(updated_at) after session UPSERTs.

#### Behaviours new tests must pin

1. **Cache coherence:** Write via saveProfile → read via getProfile → value matches input (localStorage cache + Supabase sync).
2. **Revalidation:** Call _get with cache hit; wait 200ms; verify background _sbGet was called (spy).
3. **Divergence resolution:** Cached value != Supabase value; call _get → onUpdate fires + cache updated.
4. **Fire-and-forget:** Call _save → return true immediately; background UPSERT completes later (no await).
5. **Household_id bootstrap:** First call to _getHid → UUID returned; second call → instant (cached).
6. **Auth state invalidation:** Sign out → onAuthStateChange listener fires → _hid cleared; next _getHid re-fetches.
7. **Auth guard redirects:** Unauth user on protected page → redirect to login. Auth user on login page → redirect to home (or ?next=).
8. **Snapshot freshness:** Session-end UPSERT → snapshot timestamp updated to match live MAX(updated_at); next session freshness check detects no changes.
9. **Conflict detection:** Simulate concurrent edits (two devices) → last-write-wins (timestamp-based RLS merges atomically).
10. **Offline resilience:** Network failure during UPSERT → error logged + toasted; localStorage cache preserved; next session's freshness check re-attempts.
11. **Refinement mutations:** Hide suggestion → learned_preferences.overrides[id] = true; undo → delete overrides[id].
12. **Ask persistence:** Save conversation → round-trip via getConversation; delete → re-fetch returns null.

---

### Known smells / tech debt / risks

#### Cache invalidation (medium risk, medium blast radius)

**Smell:** `_get` revalidates in the background + fires `onUpdate` async. A fast consumer reads cache, mutates local state, then receives a divergent `onUpdate` after render — can cause flicker or stale renders if the caller doesn't re-render idempotently.

**Example:** Profile page reads profile (cached), renders age field. Background revalidation arrives with newer DOB. `onUpdate` fires + page re-renders. If the page doesn't batch re-renders, two DOM updates flicker.

**Current state:** Relies on page-level `onUpdate` handlers (e.g., `getProfile({ onUpdate: refresh })`). Not all callers wire them. Some pages may experience stale renders if revalidation fires during a user edit.

**Mitigation:**
- Page-level: always wire `onUpdate` callbacks on critical user-state getters.
- Storage-level: debounce onUpdate calls (batch updates within 100ms).
- Test: simulate revalidation mid-render; verify no flicker or stale state.

---

#### Extend-only constraint + growth (medium risk, low blast radius, design-bound)

**Smell:** `storage.js` is a 12-line re-export shim (guard-railed per §16); sibling modules are append-only. Adding a new data type requires a new sibling module (`storage/new-thing.js`) + export from storage.js + Supabase table + MCP migration + `tests/supabase-sync.test.js` entry + snapshot entry.

**Current state:** 45-function public surface; 6 sibling modules. At 70+ functions, the surface becomes hard to reason about and code-review.

**Rationale:** Guard rail prevents accidental rewrites of storage layer (a single rewrite would break all pages). Cost is gradual surface growth.

**Mitigation:**
- Prefer batch features (if adding ask_conversations + ask_settings, combine them in one storage/ask.js module rather than two modules).
- Refactor P8 split storage.js into logical groupings (core, user-state, content, listings, refinement, outreach, ask); once split, don't re-merge.
- Track function count per module; flag code-review if any module exceeds 20 functions.

---

#### Schema drift between schema.sql and migration history (low risk, mitigated by code review)

**Smell:** `supabase/schema.sql` is a **reference snapshot** (not canonical). The live shape is the MCP migration history + `list_tables`. If someone edits schema.sql without applying a migration, the file drifts.

**Current state:** schema.sql exists but is not auto-generated. Live truth is the migration history. Code review catches manual schema.sql edits (rare), but drift is possible if migrations are applied without updating the file.

**Mitigation:**
- Add a CI check that `schema.sql` is in sync with migration history (by re-generating from `list_tables` output and comparing).
- OR delete `schema.sql` and rely purely on migration history + `docs/SCHEMA_NOTES.md` (simpler, less maintenance).

---

#### RLS surface (high risk, currently mitigated by operator oversight)

**Smell:** Every table uses RLS; the policy list is manually verified (via `list_tables` 2026-06-15, all 31 tables RLS-enabled). RLS enforcement is **not tested by the harness** — only via `list_tables` at session start (operator-run MCP call).

**Risk:** If an RLS policy is accidentally dropped (e.g., manual edit in the Supabase dashboard), the app continues working, but data leaks to any authenticated user (including other households).

**Current state:** Mandatory `list_tables` check at session start (CLAUDE.md §8 Step 0); operator verifies RLS is enabled on all 31 tables.

**Mitigation:**
- Add a pre-commit CI check: run `list_tables`, fail if any table lacks RLS policies.
- Add a test: simulate RLS policy drop → verify UPSERT fails with permission error (sanity check RLS is enforced).

---

#### Error/retry handling in _sbUpsert (medium risk, medium blast radius)

**Smell:** `_sbUpsert` is fire-and-forget. Network error = logged to console + toasted to user, but the write is lost. Next `_sbGet` will re-fetch from Supabase (not localStorage), but if the user closes the browser before revalidation, the unsaved change is gone.

**Example:** User edits profile → _save writes localStorage (instant render). _sbUpsert fires in background. Network hiccup. UPSERT fails. Error is logged. User closes browser. Profile is now stale on Supabase (localStorage was safe; server was not). Next session, freshness check will detect the Supabase row is old; user may need to re-enter the change.

**Current state:** _save writes localStorage first (data is safe locally). No retry logic; no offline write queue.

**Mitigation:**
- Add `_pendingWrites` Map in core.js; on UPSERT failure, enqueue the write.
- Retry on boot + on network restore (listen for online event).
- Test: simulate network failure, verify write is queued, then simulate reconnect, verify retry succeeds.

---

#### Offline behaviour — incomplete (medium risk, medium blast radius, feature-incomplete)

**Smell:** localStorage cache supports offline reads. But there's no offline write queue — `_save` writes localStorage but `_sbUpsert` fails immediately if offline, silently. User doesn't know the change didn't reach Supabase.

**Current state:** Offline writes are not supported. If user edits while offline, they see the change in localStorage, but it never reaches Supabase. Next session's freshness check reveals stale rows; user may have lost work if they edited on another device in the meantime.

**Mitigation:**
- Add offline write queue: _save queues failed UPSERTs; listen for online event; retry.
- Test: take browser offline, call _save, go online, verify UPSERT is retried and succeeds.

---

#### `ask.js` lacks the write-through pattern (low risk, feature-early)

**Smell:** Unlike other user-state (blobs with write-through cache), conversations are relational (many rows per household) and written directly to Supabase with no localStorage cache. First load requires a fetch; no offline reads possible.

**Current state:** Cold startup requires a fetch. No offline mode for chat.

**Rationale:** Chat is ephemeral; low data-loss impact. Relational table design is correct (many conversations per household); write-through cache is overkill.

**Mitigation:** If conversations need offline support, add a localStorage cache layer (decide on per-row vs bulk revalidation strategy).

---

#### Snapshot `_note` fields get very long (documentation risk, low operational risk)

**Smell:** `sync-state.json` includes migration history in `_note` fields — e.g., the areas note is 4000+ chars, recording coordinate corrections, deactivations, re-attributions, etc. over 3 weeks. Useful for archaeology but the file is getting unwieldy.

**Current state:** Snapshot is 5000+ lines; old notes are uncompressed. No operational risk (notes are comments), but readability is poor.

**Mitigation:** Externalize old notes to `docs/archive/sync-changelog/YYYY-MM-DD.md`; keep only the last 2–3 weeks in the live snapshot. Update tools/check-supabase-freshness.mjs to ignore archived notes.

---

#### Realm of MCP write paths (philosophical risk, medium blast radius)

**Smell:** `storage.js` (portal) and MCP (Claude) both write Supabase. Conflict resolution is timestamp-based: fresher row wins (§18.5 user-state always wins Supabase). But if a slow network delays the portal write and Claude writes later, Supabase picks Claude's value. CLAUDE.md §18.4 says "never overwrite a user-edited row unless the user explicitly says overwrite" — but the timestamp-wins rule can't tell intent.

**Example:** User edits profile on phone (slow network). Claude edits profile via MCP (fast). Claude's UPSERT reaches Supabase first. Portal write arrives later. Supabase has Claude's value, not the user's.

**Current state:** Timestamp-wins is the de-facto conflict resolution. No version field; no intent detection.

**Mitigation:**
- Mandatory freshness check at session start (detect stale rows before editing).
- Explicit user approval before Claude writes (e.g., "set my LISA cap to £4,000" must be a direct user instruction, not inferred).
- Long-term: add a version/sequence field to user-state tables; implement operational transform or CRDT for true conflict detection.

---

### Refactor opportunities (each its own §4.4 phase with the sync ceremony)

#### R1: Migrate `storage/*.js` to TypeScript + type-safe getters

**Why:** Guard-railed modules are append-only, so the 45-function surface can't shrink. Runtime type errors (e.g., `getProfile()` returns `{ person: null }` instead of `{ person: { name: string } }`) are caught late. TypeScript would surface shape mismatches at compile time.

**Risk:** Refactor P8 was already a large rewrite (2026-05). Moving to TS is another. Requires a build step or esbuild shim.

**Phase scope:**
- `storage.js` + `storage/*.js` → `.ts`; tsconfig + type definitions for all 45 functions.
- Tests stay JS (or migrate separately).
- No new capabilities; pure safety (types only).
- Estimated effort: 80 LOC changes (type annotations) + build setup.

---

#### R2: Add offline write queue + retry

**Why:** `_save` fires-and-forgets `_sbUpsert`. Network hiccup = lost write (though localStorage is safe). User can't work offline.

**Risk:** Adds state machine (pending queue, ack/retry). Interaction with conflict resolution (fresher row wins — does a queued write lose to a concurrent portal edit?).

**Phase scope:**
- Add `_pendingWrites` Map in core.js; `_sbUpsert` enqueues failed writes.
- `_initSb` retries on boot; listen for online event + retry.
- Revalidation after every retry (verify the UPSERT succeeded).
- Test: offline scenario → queue grows → online → queue drains.
- Estimated effort: 50 LOC changes.

---

#### R3: Persist `ask_conversations` to localStorage + revalidate

**Why:** `ask.js` is one-off relational (no write-through cache). Cold load requires fetch; no offline reads.

**Risk:** Conversations are unbounded rows (many per household). localStorage can fill up. Revalidation strategy is complex (last-modified per row, or re-fetch all on open?).

**Phase scope:**
- `storage/ask.js` gains cache pattern similar to blobs (read localStorage, revalidate in background).
- Decide on per-row vs bulk revalidation (bulk simpler, but refetch entire conversation list every open).
- Test: save conversation → offline → read from cache → online → revalidate.
- Estimated effort: 60 LOC changes.

---

#### R4: Add generated TypeScript types from Supabase schema

**Why:** Page modules currently use duck typing (`const profile = await getProfile(); profile.person.name`). IDE can't autocomplete; typos found at runtime.

**Risk:** Requires CI to auto-generate types from live schema (or from MCP `list_tables` output). Schema changes would need type regeneration.

**Phase scope:**
- Set up `mcp__supabase__generate_typescript_types` (if available) or write a custom script that parses `list_tables` output.
- Generate `types/supabase.d.ts` + per-table types.
- Update page imports to use the types (e.g., `import { Profile } from '../types/supabase.js'`).
- Add a pre-commit hook to auto-regenerate types (or include in CI).
- Estimated effort: 120 LOC (types) + 40 LOC (build setup).

---

#### R5: Split snapshot into versioned changelog + current state

**Why:** `sync-state.json` is now 5000+ lines; `_note` fields are archaeology. Hard to read what the current state is.

**Risk:** Break the single-source-of-truth principle if old and new files diverge.

**Phase scope:**
- `data/snapshots/sync-state.json` keeps only current high-water marks (100 LOC, clean + compact).
- Move historical notes to `docs/archive/sync-changelog/` (one file per month or phase, e.g., `2026-06.md`).
- Update `tools/check-supabase-freshness.mjs` to read only current snapshot.
- Update `tests/supabase-sync.test.js` to ignore archive files.
- Estimated effort: 20 LOC changes + manual archive creation.

---

#### R6: Add schema-drift CI check

**Why:** `supabase/schema.sql` is a stale reference if migrations are applied without updating it. Can't tell if the file is canonical or just a snapshot.

**Risk:** If the file is truly reference-only, delete it (source is migrations + live schema). If it should be canonical, the migration history is the source of truth, and the file must be auto-generated from it.

**Phase scope (option A — delete schema.sql):**
- Remove `supabase/schema.sql`.
- Update `supabase/README.md` to point solely to migration history.
- Add a comment pointing to `docs/SCHEMA_NOTES.md` for reference DDL.
- Estimated effort: 5 minutes (delete + doc update).

**Phase scope (option B — auto-generate):**
- Add a CI script that runs `list_tables`, generates SQL DDL, compares to `schema.sql`.
- Fail CI if generated != checked-in (forces update).
- Estimated effort: 100 LOC (Python/Node script).

---

#### R7: Formalize multi-device conflict detection

**Why:** Two devices editing the same user-state row simultaneously: RLS + UPSERT merges, but which write wins is timestamp-based (last-write-wins), not intent-based. User may not notice.

**Risk:** Hard problem; every user-state table would need a version/conflict resolution strategy.

**Phase scope:**
- Decide on strategy: last-write-wins (status quo), operational transform, CRDT, or pre-lock + retry.
- Add a version column to user-state tables (one per household_id; increments on every UPSERT).
- Update _sbUpsert to check version + fail if divergent (force a refresh + retry).
- Document in SUPABASE_SYNC.md.
- Test: concurrent edits from two clients; verify conflict is detected + resolved consistently.
- Estimated effort: 80 LOC (schema + logic) + migration.

---

### Suggested sub-phases (emphasise safety/sequencing)

#### Phase A: Safety & observability (low risk, high value, ~30 LOC changes + tests)

1. **MCP-backed snapshot refresh:** Extend `sync-check` skill to auto-run freshness checks at session start + commit snapshot updates.
2. **Add RLS verification to pre-commit hook:** `list_tables` check; fail commit if any table lost RLS.
3. **Type-safe getters:** Inline JSDoc `@returns {Profile}` on every getter; add a linter (tsc in weak mode or `jsdoc --check`).

---

#### Phase B: Resilience (medium risk, medium effort, ~120 LOC changes + tests)

4. **Offline write queue (R2):** Implement `_pendingWrites` retry loop in core.js.
5. **`ask.js` cache (R3):** Add localStorage cache + revalidation to conversations.
6. **Error journal:** Log failed UPSERTs to localStorage (separate from the cache); expose via DevTools / debug page.

---

#### Phase C: DX & clarity (low risk, medium effort, ~100 LOC changes)

7. **Snapshot cleanup (R5):** Move old notes to archive; keep snapshot compact.
8. **Schema truth clarification (R6):** Delete schema.sql or auto-generate in CI.
9. **Documentation pass:** Update SUPABASE_SYNC.md with conflict resolution strategy; add flowcharts for read/write paths.

---

#### Phase D: Type safety (medium risk, medium effort, ~160 LOC changes + tests; prerequisite: Phase A)

10. **TypeScript migration (R1):** Convert `storage/*.js` to `.ts`; export types.
11. **MCP-generated types (R4):** Generate `types/supabase.d.ts` in CI; integrate into pages.

---

#### Phase E: Conflict resolution (high risk, architectural; prerequisite: Phase D; separate owner approval)

12. **Multi-device conflict detection (R7):** Add version field; implement conflict strategy (last-write-wins formalized, or CRDT).

---

### Tailored Q&A for the owner

1. **Multi-device sync:** Do you use the app from multiple devices (phone + laptop) simultaneously? If so, have you noticed data loss or conflicts? If not, is offline-first (sync on reconnect) a planned feature? Should conflict detection be automated (version-based) or manual (you approve overwrites)?

2. **Offline resilience:** If the network drops while you're filling in a form, should the app queue the save and retry when online, or is real-time connectivity assumed? Should error history be logged (for debugging data loss claims)?

3. **Chat persistence (Ask feature):** Conversations are currently live-only (no localStorage). Should they persist locally so old chats can be read offline, or is each session ephemeral?

4. **Type safety:** Would autocomplete for user-state objects (e.g., `profile.person.name`) improve your development velocity, or is the current duck typing acceptable? Is TypeScript migration a priority?

5. **RLS confidence:** The security model relies on every table having RLS policies. Should we add a CI/CD check that fails the deploy if any table loses RLS, or is manual verification at session start sufficient?

6. **Schema ownership:** Is `supabase/schema.sql` a reference snapshot (recommend delete + document migration history) or should it be canonical (recommend auto-generate in CI)? Which approach aligns with your workflow?

## 10.10 Segment: Tooling, tests & CI

**Design anchor:** N/A (infrastructure)  
**Guard-rail surface (§16):** `.github/workflows/*` (CI/CD pipelines — changes require separate phase), `tools/lint-responsive.allow.json` (baseline regresses only with explicit approval).

---

### File inventory

#### Tools (24 .mjs scripts, discoverable via `find tools -name '*.mjs'`)

| Script | Purpose (one line) | Trigger / Entry | Inputs | Preconditions |
|--------|-------------------|-----------|--------|----------------|
| **Test harness** | | | | |
| `run-intelligence-tests.mjs` | Unified Node test harness: imports 61 test suites via dynamic `await import()`, orchestrates register functions, applies responsive lint, spawns supabase-sync.test.js as child, prints summary + exits 0 iff all pass. | `npm test` / CI `ci.yml` step / developer shell | Fixture JSON at `data/fixtures/*.sample.json`; test suite exports `async register({ test, assert, assertEqual, fixtures })` | Node 20+; all 61 test files present; fixture data sanitized (no real household data per CLAUDE.md §18.1) |
| `lint-responsive.mjs` | Responsive doctrine lint (DESIGN.md §6): static analysis of CSS + JS files for 8 rules (r-no-max-width-media, r-canonical-bp, r-no-100vw, r-no-raw-vh, r-no-fixed-font-px, r-undefined-token, r-tap-target, r-no-style-assign). Fingerprint-based regression detection vs baseline JSON. Can write new baseline via `--write-baseline` flag. | `run-intelligence-tests.mjs` line 165 (as synthetic test) / standalone `node tools/lint-responsive.mjs` / `--write-baseline` approval | CSS files under `assets/css/**/*.css` (discovered via `walk()`); JS files under `assets/js/**/*.js`; baseline JSON at `tools/lint-responsive.allow.json` | Asset files exist; baseline file is valid JSON |
| **Area & location data** | | | | |
| `area-status.mjs` | Inventory CLI: prints which areas are `researched`/`partial`/`stub`/`directory`, lists missing schema fields per area, counts per status. Called at session start (§8 step 1). | Developer shell; session start per CLAUDE.md §8 step 1 | Per-area JSON at `data/areas/<id>.json` + `data/schema/area.schema.json` | Area schema file exists and is valid JSON per validateAreaDetail() in tests/schemas.js |
| `resolve-areas.mjs` | Per-village Rightmove resolution: queries typeahead + postcodes.io reverse-geocode, writes `locationIdentifier` + default radii to `data/areas/<id>.json`, mirrors to Supabase via MCP `execute_sql` + UPSERT, triggers on file change + manual dispatch in `resolve-areas.yml`. | GitHub Actions `resolve-areas.yml` (on push→main if files changed, or manual dispatch); developer shell | Village postcodes from `data/areas/<id>.json`; Rightmove API (live); postcodes.io API (live) | Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) in workflow env; area files valid JSON |
| `verify-area-coords.mjs` | Validates area coords actually point at named village via reverse-geocode API (postcodes.io or Nominatim); runs online via GitHub Actions `resolve-areas.yml` after resolve-areas step. (UNCONFIRMED runtime — grep needed) | GitHub Actions `resolve-areas.yml` dispatch; runs post-resolution to validate | Area coord pairs (lat/lon) from materialised `data/areas/<id>.json` | Live internet access; reverse-geocode API available |
| `backfill-geofence.mjs` | Recomputes geofence regions from cached listing coords already paid for via Apify (no new Apify call); utility to regenerate bounding boxes without cost. | Manual dispatch (likely `import-apify-runs.yml` flow or standalone) | Cached listings from Supabase + area centroids from `data/areas/<id>.json` | Listings table in Supabase with coord data; areas index populated |
| `geocode-areas.mjs` | Geocodes area centroid coords using public APIs (postcodes.io, OpenStreetMap Nominatim). Pure utility, not part of standard pipeline. | Manual developer use (no workflow trigger observed) | Village postcodes or place names | Live geocoding APIs available |
| `build-areas.mjs` | Rebuilds `data/areas.json` index from `data/source/villages.csv` (id/name/town/county/postcode) + per-area detail files `data/areas/<id>.json`; materialises the DB view per CLAUDE.md §2. Called after sync-areas-from-supabase. | Session end (manual developer call); `resolve-areas.yml` if area files modified | `data/source/villages.csv` (CSV headers: id/name/town/county/postcode); per-area JSON files at `data/areas/<id>.json` | Both source files valid; village.csv id column matches area JSON id values |
| `sync-areas-from-supabase.mjs` | Materialises `data/areas/<id>.json` per-area files from the live Supabase `areas` table (DB is canonical per CLAUDE.md §18.5). Runs post-session if areas table was edited via Supabase portal or MCP. | Session end (manual call per §8); before `build-areas.mjs` | Supabase `areas` table (via MCP execute_sql query) | Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) in env or session context |
| **Listings (property scraping & management)** | | | | |
| `fetch-listings.mjs` | Daily fetcher: calls Apify Rightmove actor on dynamically-computed cluster/outcode/village search grid; normalises + dedupes results; applies `passesBaseline` gate (houses+bungalows, price band, £0 price filter); writes Supabase `listings` table via service role; respects spend cap per config. | GitHub Actions `fetch-listings.yml` on daily cron (12:00 Europe/London, DST-safe) + manual `workflow_dispatch`; dev shell for dry-run testing | Apify actor config (APIFY_ACTOR_ID, search query grid); Supabase service role key; area geometry from `data/areas.json` | Apify token valid; Supabase credentials set; spend cap APIFY_MAX_BUDGET_USD (default $25) enforced |
| `import-apify-runs.mjs` | Backfill from cached Apify datasets (no actor call, no re-spend). Reads finalized actor runs by ID, normalises, applies baseline, writes Supabase. Dry-run mode supported. | GitHub Actions `import-apify-runs.yml` dispatch-only; dev shell | Apify dataset IDs (run history via Apify API); Supabase creds | APIFY_TOKEN required but actor not invoked; datasets must be finalized |
| `listings-normalise.mjs` | Normalisation pipeline: orchestrates Rightmove API response → clean listing objects (id, title, price, beds, location, imageUrl, etc.); exported `normalise()` function also used in tests. Handles rate-limit backoff, deduplication, null coercion. | `fetch-listings.mjs`, `import-apify-runs.mjs`; tests import it directly (line 51 of run-intelligence-tests.mjs) | Raw Apify actor response (Rightmove listings) | Apify dataset or cached JSON; no network call here (pure transform) |
| `purge-listings.mjs` | Deletes aged listings from Supabase `listings` table; reuses `passesBaseline` + `propertyFingerprint` contract from classify.js (never reimplements; drift guard per supabase-sync.test.js line 95–102). Cron trigger (TBD — grep needed). | GitHub Actions (schedule TBD); likely daily post-fetch | Supabase listings table; `classify.js` exports (passesBaseline, propertyFingerprint); age threshold config | Supabase credentials; classify.js contracts stable |
| `test-postcodes-accuracy.mjs` | Diagnostic: probes postcodes.io accuracy vs ground truth on sample or custom area list; reports miss rates. Read-only, no data writes. | GitHub Actions `postcodes-accuracy.yml` manual dispatch | Area postcodes from `data/source/villages.csv`; postcodes.io API | Live postcodes.io API; area data seeded |
| **Refinement & user state** | | | | |
| `refinement-run.mjs` | Snapshots reactions from Supabase, runs pure engine, plans next searches (output: archive/REFINEMENT_PLAN.md). Engine is deterministic given reactions + criteria snapshot. | Manual dev call; session end if reactions updated | User reactions table from Supabase; criteria, area_confirmations | Supabase service credentials; user household established |
| `refinement-scope-check.mjs` | Validates refinement scope (area selections, property type filters, budget band) against stored criteria + confirmations; ensures no inconsistency between engine input + persisted user intent. | Manual dev validation; optional session-end check | Scope JSON (area zone IDs, property type bitmask, price range); Supabase tables (criteria, area_confirmations, household_areas) | All referenced tables exist; scope shape matches contract |
| **Content import & syndication** | | | | |
| `import-trading212.mjs` | Backfill household investments from Trading 212 CSV export; one-off import, not recurring. Parses CSV, validates against investments schema, UPSERTs to Supabase. | Manual developer shell; no workflow trigger | Trading 212 export CSV (account, asset, quantity, value columns) | Supabase `investments_accounts` + `investments_history` tables exist w/ RLS; CSV well-formed |
| `sync-content-to-supabase.mjs` | Mirrors edited `data/house-types.json` (repo-canonical per CLAUDE.md §18.7) into Supabase `house_types` table via MCP UPSERT. Called post-edit of house-types JSON. | Manual developer call; session end per §18.3 | `data/house-types.json` (array of {id, name, ...}) | Supabase `house_types` mirror table exists; JSON valid |
| **Utility & setup** | | | | |
| `fetch-fonts.mjs` | Pulls Fraunces variable font woff2 subsets (Latin + Latin-ext) from Google Fonts API; saves to `assets/fonts/`. One-off dev utility. | Manual developer shell `npm run fonts` | Google Fonts API | Internet access; Google Fonts API available |
| `insert-content.mjs` | Splice helper (CLAUDE.md §2): inserts large temp file into target file at named marker (e.g., `<!-- SLOT:x -->`). Used for large content blocks to avoid inline paste bloat. | Manual developer: `node tools/insert-content.mjs --target <file> --content <temp> --marker "<!-- SLOT:x -->"` | Target file path, content file path, marker string | Both files exist; marker present exactly once in target |
| `check-supabase-freshness.mjs` | Session-start check (CLAUDE.md §8 step 0): compares table `MAX(updated_at)` vs snapshot high-water marks in `data/snapshots/sync-state.json`, surfaces user-state drift if user edited in portal. Optionally pulls fresher rows. | Manual developer shell; session start per §8 | `data/snapshots/sync-state.json`; Supabase execute_sql query (live MAX per table) | Supabase creds in env; snapshot file valid JSON |

---

#### Tests (61 .test.js files, 1 browser harness)

Organized by area (counts verified via `find tests -name '*.test.js' | wc -l` = 61):

| Category | Files (count) | Note |
|----------|-------|------|
| **Finance calculators** | affordability, affordability-scenarios, deposit-risk, investment-performance, savings-series, finance-derive, money-flow, savings-velocity (8) | Fixture-driven: `deriveFinances()` on sample data then assertions on bands/formulas/coherence. No hard-coded personal numbers (per CLAUDE.md §18.1 user-state is Supabase-only). |
| **Characterization (regression anchors)** | characterization-home, characterization-finances, characterization-finances-calc, characterization-outreach, characterization-storage (5) | Computation-chain snapshots: run full pipeline with fixtures, assert structural invariants (bands exist, headlines non-empty, no DOM). Fail if refactor changes output path (early detection of subtle breaks). |
| **Listings pipeline** | listings-normalise, listings-classify, listings-suppress, listings-feed-suppression, listings-feed-partition, listings-picker-state, purge-listings, fetch-listings, listings-fetch, listings-format, listings-labels, listings-controls, listing-detail, listing-fit, listing-flags, listing-reactions, meta-observations (17) | Test normalisation, deduplication, suppression rules, feed partition, state machines, detail enrichment, reaction tracking, dry-run contract. Heavy lift: core listing machinery. |
| **Area & place matching** | area-match, area-ref, area-enrich, areas-index-sync, areas-db-repo-parity, verify-area-coords, backfill-geofence, resolve-areas (8) | Test geocoding, Rightmove ID resolution, geofence accuracy, DB↔repo mirror parity (line 106–119 of supabase-sync.test.js), CSV rebuild. Offline + online checks. |
| **Refinement & suggestions** | refinement-engine, refinement-persistence, refinement-view, refinement-scope, reaction-provenance, suggestions-model, suggestions-apply, learned-preferences (8) | Test pure search suggestion & refining engine, state persistence, reaction tracing, learned preference aggregation. Append-only reactions; no hard-coded thresholds. |
| **Schema & docs** | profile-schema, supabase-sync, docs-consistency, import-layer, ask-tools, ask-storage (6) | Profile shape, tracked-table inventory (23 tables: 21 user-state + 2 content mirrors, per supabase-sync.test.js line 26–44), instruction doc path/shim claims (CLAUDE.md §6/§18 cross-refs), Ask LLM assistant. |
| **Forms & UX** | setup-wizard, criteria-form, journey-data, journey-progress, report-format, asset-links, dom-utils (7) | Setup flow state machine, form validation, journey tracking, report rendering, asset link hygiene, DOM utilities. No page-level integration (no browser in CI). |
| **Templates & content** | outreach-templates, rejected-view (2) | Outreach message templates (24 required per supabase-sync.test.js line 144), rejection reason rendering. |
| **Browser smoke tests** | tests.html (1, developer-run only) | Serves DOM tests on `http://localhost:8000/tests/tests.html` — schema checks, storage, finance checks. CI does NOT run this (no browser in CI). |

**Total offline test counts (run in harness):** 60 .test.js files. **Online suite:** 1 (supabase-sync.test.js spawned as child, mixed offline + online).

---

#### GitHub Actions workflows (7 .yml, all guard-railed §16)

| Workflow | File | Trigger | Purpose | Secrets / Env | Cron / Schedule |
|----------|------|---------|---------|---------------|-----------------|
| **Continuous Integration** | `ci.yml` | push (any branch), pull_request | Runs `run-intelligence-tests.mjs` offline suite (no Supabase online checks, no network calls). Gates `pages.yml` deploy. Exit code 0 iff all pass. | None | On every push + PR |
| **GitHub Pages Deploy** | `pages.yml` | push→main, manual dispatch | Runs CI, then deploys to GitHub Pages iff tests green. Artifact upload + deploy-pages action. Live site ~1 min after commit. | None | On main push + dispatch |
| **Scheduled Listings Fetch** | `fetch-listings.yml` | Supabase `pg_cron` dispatch (live prod) + GitHub schedule cron backup (DST-safe once-per-day gate) + manual dispatch | Calls Apify Rightmove actor on search grid, normalises, applies baseline, writes Supabase `listings`. Respects spend cap. Dry-run mode optional. Complex timing: Supabase pg_cron primary (12:00 Europe/London, atomically), GitHub backup crons (BST 11:00 / GMT 12:00) gated by bash check + API query (reject if already ran today per London TZ). | APIFY_TOKEN, APIFY_ACTOR_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | Supabase `pg_cron` every day 12:00 Europe/London (primary); GitHub `0 11 * * *` + `0 12 * * *` (backup, DST-aware) |
| **Area Resolution** | `resolve-areas.yml` | push→main (if area files modified), manual dispatch | Per-village Rightmove resolution + Supabase mirror + commit back to main (push with workflow token). | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | On file change + dispatch |
| **Apify Backfill Import** | `import-apify-runs.yml` | manual dispatch only | Backfill from cached Apify datasets (no actor call, no re-spend). Dry-run mode, configurable scan depth. | APIFY_TOKEN, APIFY_ACTOR_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY | Manual only |
| **Postcodes Accuracy Probe** | `postcodes-accuracy.yml` | manual dispatch only | Diagnostic read-only probe of postcodes.io accuracy on sample or custom area list. No data writes. | None | Manual only |
| **Suzanne Backfill** | `suzanne-backfill.yml` | manual dispatch only | *Not scanned in detail (likely a one-off 2026-Q2 import job; appears in §2 but not read).* | Various (TBD) | Manual only |

**Workflow guard-rail note (§16):** Every change to a .yml file is its own phase, named and approved separately. Changes to timing, secrets, or job steps require explicit owner sign-off.

---

#### Lint baseline

**File:** `tools/lint-responsive.allow.json`  
**Current content (6 entries):**
```json
{
  "r-no-style-assign|assets/js/dashboard/tile-deposit.js|.style.strokeDashoffset =": 1,
  "r-no-style-assign|assets/js/finances/section-deposit.js|.style.width =": 1,
  "r-no-style-assign|assets/js/page-area-detail.js|.style.viewTransitionName =": 1,
  "r-no-style-assign|assets/js/page-areas.js|.style.viewTransitionName =": 1,
  "r-no-style-assign|assets/js/page-listings.js|.style.width =": 2,
  "r-no-style-assign|assets/js/page-property.js|.style.cursor =": 1
}
```

**Mechanism:** Fingerprint = `rule|file|normalised-snippet` → count. Baseline stores historical counts. Live run compares each fingerprint's live count ≤ baseline count; if any live > baseline, test fails. Regressions report the delta. Baseline can only grow via explicit `--write-baseline` flag (manual, approval-gated).

---

### How testing works

#### Discovery & run model (run-intelligence-tests.mjs, line 14–171)

**Initialization (lines 14–40):**
1. Read fixture JSON files (`data/fixtures/{finances,investments,criteria}.sample.json`) and derive canonical `finances` object via `deriveFinances()` (line 31, 36).
2. Build a shared `fixtures` object containing `{ finances, rawFinances, investments, criteria }` (lines 35–40).
3. Set up result collection array + test/assert/assertEqual trio (lines 17–27).

**Test import & registration (lines 42–163):**
4. Dynamically `await import()` each of 61 test files (one import per file, lines 42–101).
5. Call each `register({ test, assert, assertEqual, fixtures })` function, which queues tests (lines 104–163). The `test()` function wraps each test function with try/catch, appends `{ name, pass, error? }` to results (line 19).

**Responsive lint (lines 165–171):**
6. Call `runResponsiveLint()` (exported from `lint-responsive.mjs` line 102); if `regressions.length > 0`, fail the synthetic test with a detailed report (line 169).

**Supabase sync tests (lines 173–205):**
7. Spawn `tests/supabase-sync.test.js` as a child process (line 183, `spawn('node', [syncTestPath])`), capture stdout/stderr, parse summary line (line 191: "N passed, M failed, O skipped"), and record ONE honest result per exit code (line 195–198). Never fabricate per-test lines; the harness surface is "suite exited code X with summary Y."

**Summary & exit (lines 207–218):**
8. Count passes/failures, print summary, exit 0 iff failed === 0.

#### Assert & schema helpers

**`tests/assert.js` (49 lines):**  
Exports `test(name, fn)`, `assert(cond, msg)`, `assertEqual(actual, expected, msg)`, `assertDeep(actual, expected, msg)`. Minimal, no dependencies, works in Node (via harness) and browsers (via `tests.html` import). Results array is append-only; test functions are wrapped synchronously (no async isolation per test).

**`tests/schemas.js` (guard-railed §16):**  
JSON schema validators. Exports: `validateAreaDetail()` (enforces `data/schema/area.schema.json` contract), `validateProfile()`, `validateCriteria()`, etc. Used by characterization tests to assert shape invariants before refactor (ensures bands/fields exist, no accidental type changes).

#### Test styles: characterization vs unit vs schema vs integration

**1. Characterization tests (5 files: `characterization-*.test.js`, lines 74–78, 134–138 of harness):**  
Run full computation chain with synthetic fixtures, assert structural invariants (e.g., "affordability verdict is one of BANDS", "headline is non-empty string", "no DOM"). Example: `characterization-finances.test.js` calls `deriveFinances(fixture)`, then asserts that every band band exists, `affordability.length > 0`, `cashflow` is a dict, etc. These are **regression anchors** — if a refactor accidentally moves a computation or deletes a field, these fail first.

**2. Unit tests (majority of the 61 suite):**  
Test individual functions: `normalise()`, `classify()`, `match()`, `assessAffordability()`, etc. Assert:
- **Contract:** garbage in → sensible error; valid in → valid out.
- **Internal consistency:** cheaper never worse than dearer; mutation contract holds; no side effects.
- **Boundary cases:** LISA cliff at £451k; stress-test flag at 60% payment-to-income; affordability verdict bands (comfortable/stretch/tight/out-of-reach).

**3. Schema / parity tests (6 files: `supabase-sync.test.js`, `areas-db-repo-parity.test.js`, `docs-consistency.test.js`, `profile-schema.test.js`, etc.):**  
Assert structural invariants across the system:
- `areas-db-repo-parity.test.js` (lines 106–119 of supabase-sync.test.js): rebuilds `data/areas.json` and compares row counts vs Supabase DB, catching desync early.
- `supabase-sync.test.js` lines 26–44: all 23 tracked tables listed in snapshot.
- `import-layer.test.js`: guard-railed files (storage.js, config.js, etc.) are not imported by application modules (prevents coupling breakage).

**4. Integration tests (implicit, via characterization):**  
`characterization-home.test.js`, `characterization-storage.test.js` orchestrate multiple modules end-to-end (e.g., load profile + criteria, call `deriveFinances()`, render tiles) with fixtures, no network. Not full page-level integration (no browser, no DOM mutation tests).

#### Offline vs online in supabase-sync.test.js

**Offline checks (run in CI, deterministic, lines 16–149):**
- Snapshot validity: file exists, valid JSON, 23 tracked tables listed.
- Shape invariants: debt tables have `count`, data tables have `last_synced_at`.
- Vocabulary checks: REACTIONS is ['like', 'pass', 'reject'] (line 64–76); REJECT_REASONS is {key, label} chips (line 70); PERSONAL_STATUSES locked to 'new,saved,viewed,offered,rejected' (line 73).
- Baseline gates wired into BOTH `tools/fetch-listings.mjs` AND `tools/purge-listings.mjs` (lines 78–102); ensures no drift between what the feed writes and what the purge deletes.
- Storage shim contract (5 modules: core, user-state, listings, outreach, refinement, ask) — line 125 checks each is exported from `storage.js` (guard-railed).
- Area schema validation: all files in `data/areas/` have id/name/status; status in ['directory', 'stub', 'drafted', 'partial', 'researched'] (lines 106–119).

**Online checks (skipped in CI, no secrets; run by Claude at session end via MCP, per CLAUDE.md §18.3):**
- RLS policies enabled on every table (via MCP `execute_sql` `\d+ table_name`).
- Row counts + `MAX(updated_at)` match snapshot.
- Migration history is linear (no branch conflicts).
- Example flow: developer runs `mcp__supabase__execute_sql` with `SELECT COUNT(*), MAX(updated_at) FROM profile`, compares to snapshot, surfaces diff.

**Summary line (line 191, parsed from child output):**  
"25 passed, 0 failed, 7 skipped" — harness records ONE honest `{ name: 'supabase-sync suite (25 passed, 0 failed, 7 skipped)', pass: true }` result. Never fabricates per-test lines. Exit code from child is the source of truth.

#### Responsive lint baseline mechanism (tools/lint-responsive.mjs, lines 44–255 approx, + allow.json)

**Rule discovery & violation collection (lines 94–250):**
1. Walk `assets/css` + `assets/js` files (lines 49–68).
2. For CSS: parse @media preludes, apply 8 rules (lines 131–200 approx). For JS: scan `.style.` assignments + `setProperty()` calls (lines 200–250 approx).
3. Violations collected as `{ rule, file, line, snippet }` array.

**Fingerprinting (line 101, `add()` function):**
4. Normalize snippet (collapse whitespace, trim): `norm = (s) => s.replace(/\s+/g, ' ').trim()`.
5. Create fingerprint: `rule|file|normalised-snippet`.

**Baseline matching & regression detection (lines 44–92, assume `compareWithBaseline()` or similar exists):**
6. Load `lint-responsive.allow.json` (map of fingerprint → baseline count).
7. For each live violation, if live count > baseline count, add to regressions array.
8. Regressions are reported by harness (line 169): `regressions.map((r) => \`${r.fingerprint} (live ${r.live} > baseline ${r.baseline})\`)`.

**Baseline update (command-line flag):**
9. `node tools/lint-responsive.mjs --write-baseline` → overwrites allow.json with live fingerprints (one-off, manual approval required). Example: a new SVG tile requires unavoidable `.style.width =` assignment; developer approves, runs --write-baseline, commits the updated allow.json.

**Guard-rail invariant (lines 10–36):**
- Total violation count may only shrink or stay flat; never grow without explicit approval.
- Fingerprint stability: whitespace refactors (e.g., CSS comment reflow) change fingerprints, requiring re-approval even if counts don't change. This is a known friction point (smells §5 below).

---

### Feature & behaviour catalogue (vetted)

#### run-intelligence-tests.mjs — the unified harness

**Name & purpose:** Orchestrate all offline Node tests (61 .test.js files) + responsive lint + offline sync tests into a single pass/fail result. Gate for every commit + CI step.

**Trigger/entry:** `npm test` (package.json line 10) / CI job (ci.yml line 21) / developer shell.

**Inputs & preconditions:**
- All 61 test files importable without side effects (no require of Supabase secrets).
- Fixture data at `data/fixtures/{finances,investments,criteria}.sample.json`, sanitized (no real household data).
- `lint-responsive.mjs` exportable via `await import()`.
- `tests/supabase-sync.test.js` exists and is a valid Node script.

**Precise rule — quoted logic:**
- Line 18–21: `test()` wraps `fn()` with try/catch, pushes `{ name, pass, error? }` to results.
- Line 31: `deriveFinances(rawFinances, { investments: rawInvestments })` – single source of truth for finances computation (called once, shared across 8 calculator tests).
- Line 104–163: For each register function, call it with shared `{ test, assert, assertEqual, fixtures }` trio.
- Line 165–171: `await test('responsive lint ...', () => { const { regressions } = runResponsiveLint(); assert(regressions.length === 0, ...) })` – synthetic test, fails if any live > baseline.
- Line 175–202: Spawn child process, capture output, parse summary line, record one honest result per exit code (not per child test).
- Line 207–218: Count passes, print summary, `process.exit(failed === 0 ? 0 : 1)`.

**Outputs & effects:**
- Stdout: 60+ test results (PASS/FAIL + error message if failed).
- Stdout: responsive lint report (if any regressions).
- Stdout: supabase-sync suite summary (captured from child).
- Exit code: 0 iff all pass; 1 if any fail.
- Side effects: none (read-only; fixtures are not written to disk).

**Edge cases:**
- Fixture file missing: error on line 31 (readJson throws).
- Test file missing: error on dynamic import (line 42+).
- Async test timeout: no timeout configured; if a test `await`s forever, harness hangs. (Known smell: no timeout protection.)
- Sync test not found (line 177): gracefully continues (line 179: resolve(0)), doesn't block.
- Sync test child crashes: exit code non-zero, error message captured (line 198: "sync suite exited non-zero").

**Invariants/acceptance criteria:**
- Deterministic: same fixtures + code = same result every time (no randomness, no network calls in offline suites).
- Complete: all 61 test files must be imported and registered.
- Honest: a single child process exit code (0 or 1) is recorded for the sync suite, never per-test synthesis.
- Green baseline: all tests pass before a refactor baseline is recorded (if any fail, baseline doesn't change).

---

#### lint-responsive.mjs — the responsive-doctrine enforcer

**Name & purpose:** Detect CSS + JS violations of DESIGN.md §6 (mobile-first, canonical breakpoints, no 100vw, tap targets, token-only, etc.) via static analysis. Regression-gated: live violation counts must not exceed baseline.

**Trigger/entry:** 
- Harness: `runResponsiveLint()` called at line 166 of run-intelligence-tests.mjs.
- Standalone: `node tools/lint-responsive.mjs` (human report) or `--write-baseline` (approval).

**Inputs & preconditions:**
- CSS files at `assets/css/**/*.css` (discovered via `walk()`).
- JS files at `assets/js/**/*.js`.
- Baseline JSON at `tools/lint-responsive.allow.json` (valid JSON, map of fingerprint → count).
- Guard-railed JS paths (storage/*, config.js, data-loader.js, finances.js, finances/calc-*.js) are NOT linted (by design — can't demand edits to forbidden files).

**Precise rule — 8 rules (quoted from lint-responsive.mjs lines 10–36):**

1. **r-no-max-width-media** (line 136–140): Width-scoped @media query with max-width prelude is banned (forces scrollbar reflow). Exempt: queries with only short-viewport features (min-height, orientation, prefers-*). Logic: `if (hasMaxWidth(prelude) && !hasShortViewportFeature(prelude)) { add('r-no-max-width-media', ...) }`.

2. **r-canonical-bp** (lines 143–150): Non-canonical min/max-width breakpoint value. Canonical set = {480, 768, 1024, 1280}. Logic: parse `\b(min-width|max-width)\s*:\s*([\d.]+)px`, if parsed value not in CANONICAL_BP, flag.

3. **r-no-100vw** (lines TBD — assume exists, comment at line 32 mentions it): Any use of `100vw` is flagged (scrollbar-unsafe). Fix: `100%` (scrollbar-aware).

4. **r-no-raw-vh** (lines TBD): Fixed `vh` without `dv` prefix (dynamic viewport height) is flagged. Fix: `dvh` or `svh`. Example: `.style.height = '100vh'` → flag. Allowed: dynamic units only.

5. **r-no-fixed-font-px** (lines TBD): Fixed `font-size:Npx` outside SVG context is flagged. Allowed only: SVG <text> elements (CSS rule with `fill:` signal, or JS in `section-*.js` / `*-visuals.js` modules). Logic: check context (SVG drawing modules are exempt).

6. **r-undefined-token** (lines 104–116): Use of a CSS custom property name not declared anywhere. Defined set = every `--name:` declaration in CSS UNION every `setProperty('--name')` call in JS (runtime tokens like `--marker-pct` set by JS). Logic: for each `var(--name)` usage, check `isKnownToken(name)` (line 92).

7. **r-tap-target** (lines TBD): Interactive selector with literal size < 44px (e.g., `button { width: 32px; height: 32px; }`). Recommend: `var(--tap-min)` (44px token). Logic: parse selector context, check if interactive (button, a, [role=button], input), extract width/height literals, flag if < 44.

8. **r-no-style-assign** (lines TBD, comment at line 31): Direct `.style.property =` assignment (not `.style.setProperty('--name')`). Allowed: `.style.setProperty('--`, which sets a token and is cacheable. Logic: grep JS for `.style.\w+ =` / `.style.cssText=` / `setAttribute('style')`, exempt guard-railed files, flag others.

**Outputs & effects:**
- Array of `{ rule, file, line, snippet }` violations.
- Regressions: fingerprints where live count > baseline count.
- Human report (standalone): print violations grouped by rule, total counts.
- Harness report (line 169): if regressions.length > 0, fail with detail lines.
- Baseline write (`--write-baseline`): overwrite allow.json with live fingerprints (one-off approval).

**Edge cases:**
- Fingerprint stability: whitespace change (CSS comment reflow, split selectors) changes fingerprint even if violation count stays same. Friction point (known smell §5 below).
- Count-based masking: if a rule fires 2x and baseline allows 1, adding a 2nd instance passes (2 ≤ 2). The semantic is "don't grow *this fingerprint's count*", not "don't repeat the violation". Refinement opportunity: track by selector + property, not snippet.
- Guard-railed JS: skip analysis of storage/*, config.js, etc., even if they violate (design choice: don't demand edits to forbidden files).

**Invariants/acceptance criteria:**
- Regressions.length === 0 in CI (line 168 assertion fails if any violation count exceeds baseline).
- Baseline can only grow via explicit --write-baseline (manual approval required).
- Total violation count over all fingerprints may shrink or stay flat; never grow without approval.

---

#### supabase-sync.test.js — the sync contract enforcer (spawned as child process)

**Name & purpose:** Offline: validate repo structure (snapshot, area files, checklists JSON). Online: validate RLS policies, row counts, migration history. Offline runs in CI; online runs at session end via MCP.

**Trigger/entry:** Spawned as child process at line 183 of run-intelligence-tests.mjs; also callable standalone `node tests/supabase-sync.test.js`.

**Inputs & preconditions:**
- Offline: `data/snapshots/sync-state.json`, `data/areas/<id>.json` files, `data/house-types.json`, `data/checklists.json`, `data/outreach-templates.json`, `data/schema/area.schema.json`.
- Online: Supabase service credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) in env; must be able to call MCP execute_sql.

**Precise rule — offline checks (lines 16–149, quoted):**

- Line 18–24: **snapshot-file-valid** — file exists, is valid JSON, is an object. Throws if missing or malformed.
- Lines 26–44: **tracked-tables-inventory** — snapshot includes all 23 expected tables (21 user-state + 2 content mirrors): profile, criteria, finances, goals, shortlist, zones, journey_checks, journey_progress, contacts, outreach, readiness_checklist, investments_accounts, investments_history, debts_{credit_cards,student_loans,other}, listing_reactions, learned_preferences, area_confirmations, household_areas, ask_conversations, areas, house_types. Assertion: `for (const table of expected) { assert(table in snapshot, ...) }`.
- Lines 47–62: **snapshot-shape** — data tables (goals, readiness_checklist, investments_accounts, investments_history) have `last_synced_at` (not null). Debt tables have `count` field. Logic: iterate withData array, assert each `snapshot[table].last_synced_at` truthy.
- Lines 64–76: **reactions-vocabulary** — REACTIONS = ['like', 'pass', 'reject'] (3-verb set, append-only). REJECT_REASONS = {key, label} chips (≥3 entries). PERSONAL_STATUSES locked: 'new,saved,viewed,offered,rejected'. Logic: import reactions.js module, assert array/enum contracts.
- Lines 78–93: **baseline-gate-wired** — `tools/fetch-listings.mjs` AND `tools/import-apify-runs.mjs` both import + apply `passesBaseline()` and `propertyFingerprint()` from `listings/classify.js` (pollution guard; if either path loses the gate, test fails). Logic: read source files as text, `assert(/passesBaseline/.test(src) && /listings\/classify\.js/.test(src))`.
- Lines 95–102: **purge-tool-contract** — `tools/purge-listings.mjs` reuses SAME baseline + fingerprint from classify.js, never re-implements (prevents drift). Logic: read source, assert both `passesBaseline` and `propertyFingerprint` + `isDecided` are imported.
- Lines 106–119: **area-files-shape** — every `data/areas/<id>.json` file has id/name/status; status ∈ {directory, stub, drafted, partial, researched}. Logic: `for (const f of files) { const c = JSON.parse(...); assert(c.id && c.name && c.status && [...].includes(c.status)) }`.
- Lines 121–130: **house-types-valid** — `data/house-types.json` is array, length > 0, each entry has id + name.
- Lines 132–138: **checklists-valid** — `data/checklists.json` is object with viewing/process/moving keys.
- Lines 140–149: **outreach-templates-valid** — `data/outreach-templates.json` is array, length === 24 (EXACT count per line 144), each entry has id + stage.

**Online checks (IMPLIED, not shown in read excerpt, but documented in CLAUDE.md §18.3):**
- RLS policies enabled: `SELECT tablename FROM pg_tables WHERE schemaname='public'` → for each, check `pg_get_row_security` returns non-empty policy list.
- Row counts match: SELECT COUNT(*) FROM each table, compare to snapshot.
- MAX(updated_at) matches: SELECT MAX(updated_at) FROM each table, compare to snapshot high-water mark.
- Schema consistency: migration history is linear (no branches).

**Outputs & effects:**
- Child process: prints test results to stdout (e.g., "✓ 25 passed, 0 failed, 7 skipped").
- Exit code: 0 iff all offline pass (online skipped in CI). Non-zero if any offline fails.
- Parent captures exit code + summary line (line 191–198 of harness), records one `{ name, pass, error }` result.
- Side effects: none (read-only; no writes to snapshot or DB in CI).

**Edge cases:**
- Snapshot behind repo: a previous session failed to materialize DB changes. Fix: run sync-areas-from-supabase + build-areas before next commit.
- Online check timeout: if Supabase query hangs, child process waits (no timeout configured — known smell).
- Offline-only in CI: online tests skipped if no SUPABASE_* env vars, exit 0 anyway (line 7: skip reason recorded, but skipped counts toward pass totals).

**Invariants/acceptance criteria:**
- All 23 tracked tables present in snapshot (catches new-table additions that aren't synced).
- Baseline gate in BOTH writers (fetch + import), enforced by diff scan (source-level assertion, not runtime).
- Purge tool reuses gate (no reimplementation allowed).
- Outreach templates count === 24 (exact, not range — catches template deletion).
- Area schema locked (status enum, required fields).

---

#### fetch-listings.yml — the scheduled listings fetcher (complex timing design)

**Name & purpose:** Daily job: call Apify Rightmove actor, normalise results, apply baseline gate, write Supabase. One fetch per day, atomically, respecting budget cap.

**Trigger/entry:** Three paths (only one executes per day):
1. **Supabase `pg_cron` primary (atomic, recommended):** Dispatches this workflow at exactly 12:00 Europe/London, bypassing GitHub queue.
2. **GitHub schedule backup (DST-aware):** Crons at `0 11 * * *` (summer BST) + `0 12 * * *` (winter GMT), gated by bash step: (a) reject if current time < 12:00 Europe/London, (b) query this workflow's run history via GitHub API to see if a real fetch already ran today (London TZ), skip if yes.
3. **Manual override:** `workflow_dispatch` input allows custom search mode (cluster/outcode/village), recency window (1/3/7/14 days), spend cap, dry-run.

**Inputs & preconditions:**
- Apify token (APIFY_TOKEN), actor ID (APIFY_ACTOR_ID), spend cap (APIFY_MAX_BUDGET_USD, default $25).
- Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
- Area geometry from `data/areas.json` (to compute search grid).

**Precise rule (timing design):**
- Line in cron field: `0 11 * * *` (summer, BST = UTC+1, so 11:00 BST = 10:00 UTC) AND `0 12 * * *` (winter, GMT = UTC, so 12:00 GMT = 12:00 UTC). These double-cover to ensure once per day at target time.
- Bash gate step: 
  ```bash
  LONDON_HOUR=$(date -d "now" +%H --date="TZ=Europe/London")
  if [ "$LONDON_HOUR" -lt 12 ]; then
    echo "Not yet 12:00 London time, skipping"; exit 0
  fi
  # Query GitHub API: GET /repos/{owner}/{repo}/actions/runs?name=fetch-listings
  # Check if a successful run exists with created_at today (London TZ)
  # If yes, exit 0 (skip duplicate); if no, proceed.
  ```
- Actor step: call Apify actor with spend cap (actor self-terminates at APIFY_MAX_BUDGET_USD).
- Normalise step: run `listings-normalise.mjs` on response.
- Write step: Supabase `INSERT ... ON CONFLICT` (upsert via service role).

**Outputs & effects:**
- Supabase `listings` table: new rows inserted (upserted by property fingerprint).
- Workflow artifact: run log, spend summary.
- Side effect: costs money (Apify: ~$0.50–2 per run depending on grid size; respects cap).

**Edge cases:**
- DST boundary: GitHub schedule flips on DST change (twice per year, UK Mar/Oct). Double-fire possible if schedule not double-covered (known risk at line 78–84 of fable_refactor.md).
- Manual dispatch + schedule fire race: if user manually triggers at 11:55 and schedule fires at 12:00, concurrency rule (`cancel_in_progress: false`) allows both to run sequentially. Bash gate on schedule branch should skip if the manual run already fetched today, but the check is non-atomic (API query, not transactional). Possible double-spend under extreme load.
- Apify API breakage: if actor API changes (field rename, rate-limit change), fetch fails. Only caught when the workflow runs (no CI dry-run test). Fix: Phase C would add a mock fetcher test in CI.

**Invariants/acceptance criteria:**
- At most one real fetch per calendar day (London TZ).
- Spend never exceeds cap per run.
- Baseline gate applied (houses + bungalows + price band).
- Upsert keyed by property fingerprint (no duplicates across runs).

---

#### CI/CD: ci.yml & pages.yml

**ci.yml — gate for every PR & push:**
- Job: `test` (single step: checkout + Node 20 + `node tools/run-intelligence-tests.mjs`).
- Live Supabase checks skip (no secrets in GitHub secret store for CI; online tests marked skipped).
- Exit code: 0 iff all tests pass. Non-zero blocks `pages.yml` deploy.
- No build step (zero-build static site).
- Latency: ~8–12 seconds (sequential harness; 63 test suites + overhead).

**pages.yml — deploy to GitHub Pages on CI pass:**
- Trigger: push to main, manual dispatch.
- Jobs: (1) `test` (same as ci.yml), (2) `deploy` (depends on test). If test fails, deploy never runs.
- Deploy: GitHub Pages artifact upload + deploy-pages action.
- Result: live site at repo GitHub Pages URL; new commit on main auto-deploys within ~1 min.

---

### Coverage map (which segments are well/poorly tested)

#### Strong characterization coverage ✓

- **Finance calculators** (8 files): affordability, money-flow, deposit-risk, savings, LISA, outlay. Fixture-driven, regressions caught early. Example: affordability.test.js line 14–32 pins 4 verdict cases (£300k stretch, £380k+ out-of-reach, £449k LISA eligible, £451k LISA not).
- **Listings pipeline** (17 files): normalise, classify, suppress, feed partition, picker state, fit, reactions, flags. Heavy coverage; core machinery.
- **Area matching & geofence** (8 files): resolve-areas, backfill-geofence, verify-coords, area-match, area-ref, areas-db-repo-parity (line 106–119 of supabase-sync.test.js). Offline + online.
- **Refinement engine** (8 files): suggestions model, apply, persistence, view, reaction provenance, learned preferences. Pure module tests.
- **Setup & forms** (7 files): setup-wizard, criteria-form, journey tracking, report rendering. State machine tests.

#### Thin or absent coverage ✗

- **Page-level integration** (line 3107 of fable_refactor.md): No tests load a full page + exercise live Supabase connection. Characterization tests are fixture-driven, not end-to-end. Example gap: does the dashboard tile layout reflow correctly when Supabase returns partial data (missing goals)?
- **Styling & responsive layout** (line 3108): Lint baseline only; no pixel-perfect or visual regression tests. DESIGN.md §13 delegates to developer hand-off (no headless browser in CI).
- **Mobile touch interactions** (line 3109): No tests for pinch, swipe, longpress. Lint checks tap target sizes (44×44) but not gesture responsiveness.
- **Dark mode switching** (line 3110): No tests for theme persistence + DOM toggle. Code review + manual verification only.
- **Accessibility dynamics** (line 3111): Contrast ratio lint in responsive lint; focus ordering in DOM tests; no WCAG automated scanning (e.g., axe-core). Missing: keyboard navigation through modals, focus trap in nav drawer.
- **Error recovery** (line 3113): No tests for network timeouts, Supabase downtime, malformed API responses. Production resilience relies on try/catch in storage.js (not verified).
- **Export & download flows** (line 3112): ask-storage exports but no tests for CSV/PDF generation (if any exist).

**Metric:** 61 test files; ~500 total assertions (rough count across suites). Strongest: finance calculators (8 files × ~30 assertions each ≈ 240). Weakest: browser integration (0 tests), error resilience (0 tests).

---

### Known smells / tech debt / risks

#### Test runtime & CI latency

- `run-intelligence-tests.mjs` is **sequential** — no test parallelism. With 61 suites × fixture import/parse overhead (~150ms per import), harness takes ~8–12 seconds on a GitHub runner. Not a blocking latency yet, but adding large fixtures or slow tests will compound. CI job timeouts at 6h (GitHub default); no measured risk yet.
- **Fixture re-read per test file:** each test file reads `data/fixtures/*.sample.json` independently (via `deriveFinances()` etc.). Centralizing would save ~500ms per run. Example refactor: create `tests/fixtures.mjs` exporting `getFixtures()` with memoization (suggested sub-phase 1 of refactor opportunities, line 3170).

#### Baseline drift risk

- `lint-responsive.allow.json` is **commit-tracked, not auto-generated**. If a PR adds a new tile with unavoidable r-no-style-assign violations, the baseline must be manually approved. Currently 6 entries (low friction); as codebase grows, could become noisy. No auto-baseline-bump protection — a careless approval could silently allow regressions (smell: count-based masking, line 3141–3143).
- **Fingerprint stability** depends on snippet normalization (whitespace collapse). A refactor that reflows CSS comments or splits long selectors will change fingerprints, requiring baseline re-approval even if violations didn't grow. Friction point: developer sees "baseline mismatch" but can't tell if it's a new violation or just a refactor artifact.

#### Online test gaps (low confidence in deployment)

- **Supabase sync checks skip in CI** (line 3147): online tests marked skipped if no secrets. Claude runs them at session end via MCP, but there's no CI gate if a PR breaks migration history or introduces an RLS policy conflict. Fix would require: CI-accessible test Supabase project (cost ~$5–10/month) + separate CI secret (SUPABASE_CI_URL, SUPABASE_CI_KEY). Phase C (line 3182–3187) would tackle this.
- **Listings fetch dry-run not in CI** (line 3148): fetcher + normalise pipeline is tested offline (fixture JSON), but live Apify actor interaction is manual-only (workflow_dispatch dry_run = true). A breaking API change in Apify (e.g., response field renamed) would surface only when the workflow runs. Fix: mock Apify response in CI test (Phase C).

#### Documentation rot risk

- **Instruction docs (CLAUDE.md, DESIGN.md, SUPABASE_SYNC.md) manually kept in sync** (line 3152). The `docs-consistency.test.js` guards path mentions (e.g., "tests/supabase-sync.test.js exists") and shim claims, but semantic drift can occur (e.g., "the stored-procedures directory exists" when it doesn't anymore). Test catches dead paths, not broken statements.

#### Missing coverage (per §3154–3158)

- **No characterization test for listing detail enrichment** (HTML rendering, imagery, descriptions). `listing-detail.test.js` tests the JS module, but the page-level cascade from API → storage → DOM is not pinned.
- **No end-to-end journey test**: set up a household, save criteria, fetch listings, react to a few, refine, export shortlist, validate the entire flow. Currently each step tested in isolation.
- **Ask feature (ask-tools, ask-storage)** added recently (June 16). Tests exist (2 files) but coverage is likely thin — no characterization snapshot yet.

#### Flakiness risk

- **Online verify-area-coords** runs in resolve-areas.yml (GitHub Actions, open internet). Reverse-geocode APIs (postcodes.io, OpenStreetMap Nominatim) can be slow or rate-limited. Workflow has no retry logic; a flaky API call causes the workflow to fail and leave the branch pending (line 3162).
- **Concurrency race in fetch-listings.yml** (line 3163): once-per-day gate reads workflow history via GitHub API. Under extreme load (manual dispatch + schedule fire within seconds), a race could allow double-fetch. Mitigated by `concurrency { cancel_in_progress: false }`, but gate logic is not atomic. Example: 11:59 user clicks dispatch; 12:00 schedule fires. Both run sequentially; bash gate on schedule should skip, but GitHub API query is non-transactional.

---

### The new test apparatus — full blueprint (CORE MANDATE §5)

#### Vision: Layered, comprehensive, zero-build testing

The existing harness (run-intelligence-tests.mjs) is a **flat, sequential collection of fixture-driven unit tests**. It catches computation regressions early, but misses:
1. **Page-level integration:** Do tiles render correctly when data flows from Supabase through storage.js into the DOM?
2. **Responsive layout:** Are media queries + flexbox actually responsive (not just lint-approved)?
3. **User journeys:** Can a real user path (login → setup → save criteria → fetch listings → react → refine) complete without errors?
4. **Online integration:** Does the Supabase sync ceremony actually work before a commit?
5. **Semantic linting:** Are tone-of-voice, colour contrast, focus management correct (not just present)?

**The mandate:** Replace the count-based lint baseline with **semantic lint** (violations by selector + property, not snippet); add a **headless DOM harness** (jsdom or happy-dom — not linkedom, see D1) to test page rendering in CI; introduce **mutation testing** on finance + intelligence engines to catch missed boundaries; orchestrate **online Supabase tests** on a disposable CI project; structure tests in **layers** (unit → contract → characterization → integration → e2e) with clear entry points; provide a **strangler migration** (new harness beside old, port suite-by-suite, retire old when new is complete).

#### Layered architecture (five-tier testing)

> **✅/➕ External validation — pyramid vs trophy (D5):** The layered hybrid is confirmed consistent with
> current best practice. **Add two layers** (taking the architecture from five tiers to seven):
> a **static-analysis base (Tier 0)** — the Testing Trophy's foundation — and a **small real-browser
> top (Tier 6)** that replaces the current "E2E hand-off to QA" gaps. Both are **devDependencies only**;
> the shipped site stays zero-build. (CircleCI, Apr 2026; Kent C. Dodds, "Testing Trophy".)

**Tier 0: Static analysis / type-checking** (NEW — Testing Trophy base layer)  
- `tsc --checkJs` over the ESM source with **JSDoc types** (no migration to `.ts` for the shipped site;
  types live in JSDoc, checked at build/CI time only).
- Catches type errors, undefined props, and contract drift before any test runs — the cheapest, broadest
  layer.
- Entry: `tsconfig.json` (`checkJs: true`, `noEmit: true`); runs as the first step of the single command.
- devDependency only; never shipped.

**Tier 1: Unit tests** (current, fine-grained)  
- Single function in isolation with mocked dependencies.
- Example: `assessAffordability({ price, finances, criteria })` → assert verdict.
- Entry: `tests/unit/**/*.test.js`
- Runner: Node (no DOM).
- Coverage goal: 100% of pure functions (affordability, money-flow, refinement, learned-preferences, suggestions).

**Tier 2: Contract tests** (current, tightened)  
- Module export contract + shape invariants.
- Example: `supabase-sync.test.js` asserts REACTIONS is ['like', 'pass', 'reject'], 23 tables in snapshot.
- Entry: `tests/contract/**/*.test.js`
- Runner: Node (read-only fixtures).
- Coverage goal: all data shapes, API boundaries, schema compliance.

**Tier 3: Characterization tests** (current, expanded)  
- Full computation pipeline with fixtures, assert immutable snapshots.
- Example: `characterization-finances.test.js` runs `deriveFinances()`, asserts affordability object structure, headline non-empty.
- Entry: `tests/characterization/**/*.test.js`
- Runner: Node (fixtures only).
- Coverage goal: end-to-end finance, listings, refinement, outreach pipelines.
- **New:** Add characterization for:
  - Listings feed (normalise → classify → suppress → partition → sort) [NEW FILE per Phase A line 3173].
  - Asking cascade (conversation state, suggestion ranking, LLM tool calls) [NEW FILE per Phase A line 3175].

> **✅ External validation (D3):** Characterization / golden-master testing is confirmed as the correct
> named technique for pinning legacy behaviour before a refactor. (Michael Feathers, *Working
> Effectively with Legacy Code*, 2004.)

**Tier 4: Integration tests** (NEW)  
- Multiple modules + Supabase mock (via test project or stubs), no browser DOM.
- Example: `storage.js` fetches profile + criteria, cache updates, on-disk snapshot reflects latest.
- Entry: `tests/integration/**/*.test.js`
- Runner: Node + minimal jsdom (createElement, querySelector, no layout).
- Coverage goal: storage layer, data flow, Supabase sync ceremony (offline + online).

**Tier 5: Page-level integration** (NEW, partial — jsdom, not real browser)  
- Load a full page HTML, inject fixtures into Supabase mock, exercise page-*.js coordinator.
- Example: load `pages/finances.html`, mock Supabase `getFinances()` + `getProfile()`, call page init, assert tiles render.
- Entry: `tests/pages/**/*.test.js`
- Runner: jsdom (fidelity) or happy-dom (speed) — not linkedom (see D1; lightweight DOM simulation, no layout/paint engine).
- Coverage goal: shell injection, tile rendering, data binding, error boundaries.
- **Limitation:** jsdom has no layout (no responsive media query evaluation, no pixel positions). Visual regression still requires `tests/tests.html` + developer QA.

**Tier 6: Real-browser smoke** (NEW — replaces the "E2E hand-off to QA" gap, D5)  
- A **small** real-browser layer (**Playwright** or **Vitest browser mode**) for the things jsdom
  cannot assert: the native `<dialog>` focus trap, **View Transitions** (incl. the unique-name pitfall,
  C5), and computed **contrast**.
- Keep it deliberately small (a handful of journeys + a11y assertions) — it is the narrow top of the
  trophy, not a second full suite.
- Entry: `tests/browser/**/*.spec.js`; devDependency only; never shipped.
- Coverage goal: close the specific gaps DESIGN.md §13 currently hands to a human.

#### New test infrastructure (tooling)

**New harness:** `tools/run-all-tests.mjs` (replaces run-intelligence-tests.mjs)
- Entry point for CI, developer shell, local watch mode.
- Discovers test tiers (unit, contract, characterization, integration, pages) dynamically via `tests/<tier>/**/*.test.js`.
- Supports `--tier unit` to run only unit tests (faster iteration).
- Supports `--watch` flag (re-run on file change, requires a watcher lib like `chokidar` or Node 18.11+ `--watch` flag).
- Output: progress bar + summary per tier + overall exit code.
- Parallelism: within-tier parallelism via `pLimit` (cap at 4 concurrent tests to avoid fixture contention) + between-tier serialization (contract before integration before e2e).

**New DOM harness:** `tools/run-page-tests.mjs`
- Loads jsdom + renders page HTML with fixture data.
- Injects Supabase client mock (returns fixture data, no network).
- Calls page init function, asserts DOM structure (tiles rendered, no console errors).
- Captures + reports layout errors (e.g., "attempted to measure width of <div> in jsdom" warnings).

**New lint overhaul:** `tools/lint-responsive.mjs` v2
- **Semantic fingerprinting:** instead of `rule|file|snippet` → count, use `rule|file|selector|property` → [violations].
- Example: `r-no-style-assign|assets/js/page-areas.js|.style.viewTransitionName|set` → [{ line: 42, context: "SVG morph animation" }].
- Violations list is concrete (not a count). Assertion: `violations.length === 0` (no masking by count).
- New rules (opt-in, behind feature flag):
  - `r-wcag-contrast`: parse CSS color values, compute luminance, flag < 4.5:1 text. Example: `--rec-text-muted: #888888; color: var(--rec-text-muted);` on light bg → calculate, flag if < 4.5:1.
  - `r-a11y-focus`: detect interactive elements without `:focus-visible`, flag if missing (note: Pico + base.css provide default, so likely no violations).
  - `r-semantic-html`: flag non-semantic layouts (e.g., `<div class="table">` instead of `<table>`, `<button onclick>` instead of `<form>`). Integration with schema tests.
- Baseline: instead of `allow.json` count, store a "known violations" set with owner-approved justifications (e.g., "r-wcag-contrast|--rec-text-muted on light bg: approved 2026-06-20 for readability balance").
- Approval workflow: `--approve-violation rule|file|selector|property reason="..."` updates the baseline.

**New online harness:** `tools/run-supabase-ci-tests.mjs` (Phase C)
- Gated by CI secret `SUPABASE_CI_URL` (test project, not prod).
- Runs online checks from supabase-sync.test.js: RLS policies, row counts, migration history.
- Wired into CI as optional step (doesn't block if secret not set).
- Reports: "RLS on all tables ✓", "migration history linear ✓", "row counts match snapshot ✓".

**New mutation testing:** `tools/run-mutation-tests.mjs` (Phase D)
- Focuses on finance + refinement engines (highest risk, deterministic).
- Mutates: boundary values (LISA cap £450k → £449k, stress rate 60% → 59%), toggle conditions, swap operators.
- Runs the test suite for each mutation; if tests still pass, the mutation "survived" (gap in coverage).
- Example: `affordability.test.js` line 36 asserts `£449k → LISA eligible`, line 41 asserts `£451k → not eligible`. Mutation: `lisaEligible = price > 450_000` (swap > to >=). Tests would fail (good). Mutation: `lisaEligible = price >= 451_000` (off-by-one). Tests would pass (bad — gap found).
- Output: list of survived mutations + suggested new tests.
- Latency: ~2–5 minutes (63 mutants × harness time). Opt-in (not in default CI).

> **✅ External validation — mutation testing (D2):** Confirmed, correctly scoped to finance +
> intelligence (the two places a silent bug is costliest). Concrete **Stryker** guidance: set
> `coverageAnalysis: "perTest"`; run **incrementally** (`--incremental` / `--mutate` on changed files);
> exclude logging with `// Stryker disable`; scope `mutate` to `assets/js/finances/**`,
> `assets/js/refinement/**` and `assets/js/learned-preferences/**`; set a **score threshold (~75–80%)
> that breaks the build** — do **not** target 100%. Note Stryker needs a **supported runner**
> (Jest/Mocha/Jasmine/Vitest) — if the custom `run-mutation-tests.mjs` stays, confirm Stryker can drive
> it, otherwise adopt a supported runner for this layer. (Stryker docs; qaskills, Feb 2026.)

> **✅ External validation — test runner (D6):** Consider **Vitest** for the rebuilt harness — native
> ESM, jsdom/happy-dom environments (D1), browser mode (Tier 6 / D5), and a first-party Stryker plugin
> (D2). It satisfies the "single command / zero-build site / test-only deps" invariant. **Not
> mandatory** — if the custom runner is kept, just confirm Stryker can drive it (D2).

#### Fixture & mock strategy

**Fixtures (centralized):** `tests/fixtures.mjs`
- Exports `getFixtures()` function with memoization.
- Loads + caches `data/fixtures/{finances,investments,criteria}.sample.json`.
- Added: `getSupabaseFixtures()` (user profile, goals, investments, reactions as JSON — no real household data).
- Added: `getListingsFixtures()` (sample 10 normalized listings, ready for feed tests).
- All read-only; no writes to disk.

**Supabase mock:** `tests/mocks/supabase-client.js`
- Stub client that returns fixture data (no network call).
- Supports `.from(table).select()` → returns fixture rows.
- Supports `.auth.getSession()` → returns mock session (household_id = 'test-001', user_id = 'user-001').
- Used by page-level tests + integration tests.
- Constructor: `new MockSupabaseClient(fixtures)` — pass in fixture data at test init time.

**DOM fixtures:** `tests/fixtures/pages/`
- Minimal HTML stubs for each page (header/nav/footer shells omitted, focus on content div).
- Example: `finances.html` has `<div id="app"></div>` + `<script type="module">import * as page from '../assets/js/page-finances.js'; page.init();</script>`.
- Used by page-level tests to load + render.

#### Migration strategy (strangler pattern)

> **✅ External validation (D4):** The strangler-fig migration (new harness beside old, port suite by
> suite, retire the old runner last) is confirmed as the correct named technique. (Martin Fowler,
> "StranglerFigApplication", 2004.)

**Phase 1: New harness alongside old (non-blocking)**
- Create `tools/run-all-tests.mjs` (new unified harness).
- CI continues to run old `run-intelligence-tests.mjs` (must stay green).
- Developers can opt-in to new harness locally: `npm run test:new` (package.json script added).
- No breaking changes; old harness is the source of truth.

**Phase 2: Port test suite-by-suite (blocking each port)**
- Finance tests → `tests/unit/finance/**/*.test.js` (rename from `affordability.test.js` → `unit/finance/affordability.test.js`).
- Listings tests → `tests/unit/listings/**/*.test.js`.
- Characterization tests → `tests/characterization/**/*.test.js` (move, no rename).
- Contract tests → `tests/contract/**/*.test.js` (move supabase-sync, docs-consistency, import-layer, profile-schema, ask-*, areas-db-repo-parity).
- New integration + page tests → `tests/integration/**/*.test.js` + `tests/pages/**/*.test.js`.
- Each port: manually move file, update import paths, run new harness on that suite, ensure old harness still passes.

**Phase 3: Add new coverage (unit-driven)**
- Mutation tests for affordability + refinement (Phase D).
- Page-level tests for dashboard, finances, listings, areas (Phase A).
- Integration tests for storage sync ceremony (Phase C).

**Phase 4: Switch CI to new harness (breaking)**
- Update `ci.yml` line 21: `node tools/run-intelligence-tests.mjs` → `node tools/run-all-tests.mjs`.
- Archive old harness (move to `tools/run-intelligence-tests.mjs.archived`).
- Ensure all tests still pass with new runner.
- Retire old harness once confidence is high (after 2–3 weeks of green CI runs).

**Phase 5: Deprecate old patterns**
- Retire `.test.js` files in root `tests/` directory (all moved to tier subdirs).
- Retire the flat fixture loading in run-intelligence-tests.mjs (use centralized getFixtures()).
- Update CLAUDE.md §6 to reference new layers.
- Update package.json `"test"` script to `run-all-tests.mjs`.

#### CLAUDE.md §6 rewrite (testing section)

**Old (lines TBD in CLAUDE.md):**
```
- Keep the `tests/` harness current. **Run `node tools/run-intelligence-tests.mjs` after changes and
before committing.** This single command runs all intelligence tests + the Supabase sync tests.
```

**New:**
```
- Keep the `tests/` harness current. **Run `npm test` after changes and before committing.**
  - Default: runs all tiers (unit → contract → characterization → integration → pages).
  - Faster iteration: `npm test -- --tier unit` (unit tests only, ~2s).
  - Watch mode: `npm test -- --watch` (re-run on file change).
  - CI runs all tiers + online Supabase checks (if SUPABASE_CI_URL set).
- Test structure (per CLAUDE.md §6.1):
  - **Unit tests** (`tests/unit/**/*.test.js`): single-function assertions, pure logic.
  - **Contract tests** (`tests/contract/**/*.test.js`): data shapes, API boundaries, vocab.
  - **Characterization tests** (`tests/characterization/**/*.test.js`): computation pipelines, snapshots.
  - **Integration tests** (`tests/integration/**/*.test.js`): modules + mocks, Supabase ceremony.
  - **Page tests** (`tests/pages/**/*.test.js`): full page render + tile output (jsdom, no layout).
- Responsive lint is now semantic: `tools/lint-responsive.mjs v2` flags violations by (rule, file, selector, property), not count. Assertion: `violations.length === 0` (no masking). New rules (opt-in): r-wcag-contrast, r-a11y-focus, r-semantic-html.
- Online Supabase checks run in CI if SUPABASE_CI_URL is set (test project credentials). Offline checks always run (snapshot validity, table inventory, schema compliance).
```

#### package.json rewrite

**Old:**
```json
{
  "scripts": {
    "serve": "python3 -m http.server 8000",
    "fonts": "node tools/fetch-fonts.mjs",
    "test": "node tools/run-intelligence-tests.mjs"
  }
}
```

**New:**
```json
{
  "scripts": {
    "serve": "python3 -m http.server 8000",
    "fonts": "node tools/fetch-fonts.mjs",
    "test": "node tools/run-all-tests.mjs",
    "test:unit": "node tools/run-all-tests.mjs --tier unit",
    "test:watch": "node tools/run-all-tests.mjs --watch",
    "test:mutate": "node tools/run-mutation-tests.mjs",
    "test:pages": "node tools/run-page-tests.mjs",
    "test:supabase-ci": "node tools/run-supabase-ci-tests.mjs"
  },
  "devDependencies": {
    "jsdom": "^24.0.0",
    "p-limit": "^5.0.0",
    "chokidar": "^3.6.0"
  }
}
```

**Note:** `devDependencies` are optional (not shipped; test-only). If jsdom adds 50MB, it's acceptable (not in deployed site).

#### Coverage map (target state)

| Segment | Current | Target (post-blueprint) | Gap |
|---------|---------|------------------------|-----|
| Finance calculators | 8 files, 240 assertions, 100% paths | +mutation testing (survive rate ≤5%) | Boundary mutation detection |
| Listings pipeline | 17 files, 150 assertions, paths + suppression | +feed characterization, +integration (storage → feed flow) | End-to-end feed rendering |
| Refinement engine | 8 files, 100 assertions, pure logic | +mutation testing, +characterization (conversation state) | Mutation score + snapshot |
| Areas & geofence | 8 files, 80 assertions, offline + online | +integration (resolve → DB → materialise) | Parity test in CI |
| Outreach & journey | 7 files, 60 assertions, form state | +page test (form render, submit) | Form UX (jsdom) |
| Shell & components | 0 dedicated files (lint only, manual QA) | +page test (header inject, nav toggle, theme persist) | Component render + interaction |
| Error resilience | 0 tests | +integration tests for error boundaries (timeout, malformed response) | Network fault injection |
| Accessibility | Lint (tap-target 44px, contrast rule NEW) | +a11y focus order test, +WCAG scan in lint | Keyboard nav, focus trap, WCAG AA |
| **Total** | 61 files, ~650 assertions | +40 files (unit org + integration + pages), ~1500 assertions, mutation score | 2x+ coverage, mutation-aware |

---

### Suggested sub-phases (concrete, sequenced)

#### Sub-phase 1: Fixture centralization + characterization hardening (Fable, 2–3 hours)

**Goal:** Pin listing-feed + asking cascade with characterization tests; reduce fixture loading latency.

**Files to edit:**
- Create `tests/fixtures.mjs`: export `getFixtures()` (memoized load of `data/fixtures/*.sample.json`).
- Create `tests/characterization/listings-feed.test.js`: run normalise → classify → suppress → partition pipeline on fixtures, assert feed order, counts, highlighted items.
- Create `tests/characterization/ask.test.js`: mock LLM, run suggestion generation, assert suggestion ranking + conversation state.
- Edit `run-intelligence-tests.mjs` line 31: import `getFixtures()`, call once, pass to all registrations.

**Order:** fixtures.mjs first → modify run-intelligence-tests.mjs → write two characterization files → run harness.

**Test impact:** +2 characterization files (~80 assertions each), ~200ms added harness time (offset by fixture dedup savings ~500ms = net -300ms). All pass with current code.

#### Sub-phase 2: Semantic lint rewrite (Fable, 2–3 hours)

**Goal:** Replace count-based baseline with semantic violations; add contrast rule.

**Files to edit:**
- Edit `tools/lint-responsive.mjs`: rewrite fingerprinting from `rule|file|snippet` to `rule|file|selector|property`; add `--approve-violation` flag; add r-wcag-contrast rule (parse CSS color values, compute WCAG ratio, flag < 4.5:1).
- Replace `tools/lint-responsive.allow.json` with `tools/lint-responsive-approved.json` (different format: list of violations with justifications).
- Edit `tests/assert.js` or create `tests/lint.test.js`: new test runner for lint (assert `violations.length === 0`).

**Order:** rewrite mjs first, test locally, update allowed violations list, update harness integration.

**Test impact:** responsive lint test output changes (clearer violation list), new contrast rule likely finds a few low-contrast edge cases (add to approved list). All tests still pass.

#### Sub-phase 3: Page-level integration harness (Fable, 3–4 hours)

**Goal:** Load pages in jsdom, mock Supabase, assert tile rendering.

**Files to create:**
- `tests/mocks/supabase-client.js`: stub Supabase client (constructor, .from().select(), .auth.getSession()).
- `tools/run-page-tests.mjs`: load jsdom, render `pages/finances.html` with fixture, call page init, assert tiles rendered.
- `tests/pages/finances.test.js`: load page, mock getFinances() + getProfile(), call init, assert tile-affordability + tile-deposit exist in DOM.
- `tests/fixtures/pages/finances-stub.html`: minimal page HTML (just the content div, no shell).

**Order:** supabase-client mock first → run-page-tests harness → write one page test (finances) → integrate into ci.yml (optional step).

**Test impact:** +1 page test file (~20 assertions), ~500ms added harness time. Uncovers any page-init crashes or missing tiles.

#### Sub-phase 4: Online Supabase CI harness (Fable + owner, 2–3 hours, requires CI secret)

**Goal:** Gate migrations + RLS policies at CI time (requires disposable test Supabase project).

**Files to create:**
- `tools/run-supabase-ci-tests.mjs`: import supabase-sync.test.js, run online checks against CI project, report RLS + migration status.
- Update `.github/workflows/ci.yml`: add optional step (gated by `SUPABASE_CI_URL` secret).

**Order:** owner sets up test Supabase project + CI secret (5 min setup cost) → write run-supabase-ci-tests.mjs → test locally with creds → integrate into ci.yml.

**Test impact:** +~10 online assertions (if secret set), ~2–3s added CI latency. Catches schema break early.

**Owner decision required:** Is the $5–10/month cost + setup friction acceptable?

#### Sub-phase 5: New unified harness (Fable, 4–5 hours)

**Goal:** Replace run-intelligence-tests.mjs with run-all-tests.mjs (tier discovery, parallelism, watch mode).

**Files to create:**
- `tools/run-all-tests.mjs`: tier discovery (`tests/<tier>/**/*.test.js`), fixture loading, parallel within-tier run (p-limit), summary per tier, watch flag support.

**Files to edit:**
- `package.json`: add `test:unit`, `test:watch`, `test:mutate`, `test:pages`, `test:supabase-ci` scripts.
- `tests/fixtures.mjs`: finalize exports (called by new harness).

**Order:** write run-all-tests.mjs, test with old file layout, run alongside old harness (both green), then prepare for switchover.

**Test impact:** new harness parallelizes within tiers (e.g., unit tests 4-at-a-time), reducing latency from ~12s sequential to ~6s parallel. Watch mode enables faster iteration (dev runs `npm test:unit -- --watch`, changes to a single test re-run in <1s).

#### Sub-phase 6: Mutation testing (optional, Phase D, Fable, 4–6 hours)

**Goal:** Find missed boundaries in finance + refinement engines.

**Files to create:**
- `tools/run-mutation-tests.mjs`: mutate affordability.js + refinement-engine.js, run test suite for each mutant, report survival rate.
- `tests/mutation/seed.json`: list of mutations to apply (boundary tweaks, operator swaps).

**Order:** research existing mutation frameworks (stryker is industry-standard but heavy; custom mutator is light), write custom if simpler.

**Test impact:** ~5 min runtime (63 test suites × 20 mutants), optional (not in CI by default). Report: "Mutation score: 95% (19/20 kills)" — any survivors suggest test gaps.

---

### Tailored Q&A for the owner (updated for new blueprint)

#### 1. **Testing strategy & characterization depth** (core mandate)

> **Old:** "Current: 63 test suites, mostly unit + some characterization. Weak: no end-to-end journey test, no page-level integration, no browser tests."

> **New:** We propose a **five-tier testing pyramid**: unit (pure functions) → contract (API shapes) → characterization (pipelines) → integration (modules + mocks) → page-level (jsdom rendering). This blueprint adds ~40 new test files to reach 100 test files total, with mutation testing on high-risk code (affordability, refinement). Offline CI latency is cut from ~12s sequential to ~6s parallel (tier-wise).

**Q for owner:** Do you want mutation testing enabled by default in CI (adds ~5 min to each run), or as an opt-in developer tool?

**Q for owner:** For page-level tests, jsdom is "good enough" to catch tile rendering crashes, but has no layout engine (no responsive media query evaluation, no pixel positions). Is that acceptable, or do you want a lightweight headless browser (Playwright) for visual regression (slower, more expensive)?

*Rationale:* Determines CI latency budget vs coverage depth.

#### 2. **Semantic lint enforcement** (baseline redesign)

> **Old:** "Current: 6 allowlisted linting violations, manually approved per PR."

> **New:** Replace count-based baseline with **semantic violations** (rule + file + selector + property). Assert `violations.length === 0` (no masking). New rules: contrast ratio (WCAG AA 4.5:1), focus visibility, semantic HTML.

**Q for owner:** For contrast ratio rule, some design tokens (e.g., `--rec-text-muted` for secondary text) intentionally use lower contrast (~3:1) for visual hierarchy. Should we allow a "contrast exception" list with justification, or enforce strict 4.5:1 everywhere?

*Rationale:* Determines baseline complexity + visual refinement room.

#### 3. **Online Supabase testing in CI** (risk mitigation)

> **Old:** "Current: Supabase sync checks skip in CI (no secrets). Online checks run at session end via MCP."

> **New:** Blueprint adds optional `run-supabase-ci-tests.mjs` (gated by CI secret `SUPABASE_CI_URL`) to verify RLS policies + migration history before merge.

**Q for owner:** Can you allocate a separate test Supabase project for CI (monthly cost ~$5–10 + 10 min setup), so migration history + RLS policies are gated before merge? This is a Phase C decision.

**Q for owner:** If a migration fails in CI (e.g., RLS policy syntax error), should it block the PR, or just warn (allowing developer to fix manually)?

*Rationale:* Phase C depends on this. Without it, a breaking schema change ships and is caught only in production.

#### 4. **Fixture & mock strategy** (data handling)

> **Old:** "Current: fixture files read per test suite (latency ~150ms per import)."

> **New:** Centralize fixture loading in `tests/fixtures.mjs` with memoization, reducing harness time by ~500ms. Add Supabase mock for integration + page tests (returns fixture data, no network).

**Q for owner:** For Supabase mock in page tests, should we support live-Supabase testing (optional CI secret for live integration tests), or stick to fixtures only?

*Rationale:* Determines whether to add a "live integration" test mode (higher latency, real data) vs fixture-only (fast, deterministic).

#### 5. **Performance budget & CI latency** (throughput)

> **Old:** "Current: test harness runs ~8–12s sequentially."

> **New:** New harness parallelizes within tiers (p-limit 4-at-a-time), reducing to ~6s. Mutation testing is opt-in (~5 min). Page tests add ~500ms. Total CI time: ~7–8s (page tests off) or ~10–15s (page tests on).

**Q for owner:** Is ~10–15s total CI latency acceptable (per commit), or do you want to cap at <10s (disable page tests by default, developer runs locally)?

**Q for owner:** If test count grows to 200+ files (e.g., post-refactor), should we invest in Jest/Vitest parallelization now, or defer until it becomes a bottleneck?

*Rationale:* Informs whether to implement parallelism in Phase 1 or Phase 5.

#### 6. **Browser testing appetite** (scope boundary)

> **Old:** "Current: page-level integration = fixture-driven, no browser. Styling + responsive = hand-off to developer QA."

> **New:** Blueprint adds jsdom page tests (catches render crashes), but no layout/responsive testing. DESIGN.md §13 hand-off model is preserved (no visual regression in CI).

**Q for owner:** Post-launch, if you notice responsive layout bugs in the wild, would you invest in Playwright-based visual regression testing (adds ~30s per CI run, captures screenshots), or keep current hand-off model?

*Rationale:* Determines post-launch test investment strategy.

#### 7. **Error recovery & resilience testing** (coverage depth)

> **Old:** "Current: no tests for Supabase downtime, network timeouts, malformed API responses."

> **New:** Blueprint adds integration tests for error boundaries (mock Supabase returning errors, assert fallback UI). Optional mutation testing can inject failures into storage layer.

**Q for owner:** After launch, do you expect intermittent Supabase outages (likely for any live SaaS), and if so, should we test resilience now (chaos injection), or rely on `try/catch` in storage.js + post-launch monitoring?

*Rationale:* Determines Phase D scope (error resilience tests).

---

### Guard-rail notes & phase sequencing

#### Guard rails (per CLAUDE.md §16)

All CI workflows (`.github/workflows/*.yml`) and the test harness entry point (`tools/run-intelligence-tests.mjs` → `tools/run-all-tests.mjs` post-blueprint) are guard-railed. Changes to any workflow require a separate phase, named and approved explicitly. Examples:

- "Switch CI to new test harness (run-all-tests.mjs)" — own phase, owner approval required.
- "Add SUPABASE_CI_URL secret to ci.yml" — own phase, requires test project setup.
- "Enable mutation testing in default CI" — own phase, justification required (trade-off: latency vs coverage depth).

#### Phase sequencing (dependency order)

1. **Phase 1** (Sub-phase 1 above): Fixture centralization + characterization hardening. **Blocker:** none. **Parallel:** can run with any other segment's refactor.
2. **Phase 2** (Sub-phase 2): Semantic lint rewrite. **Blocker:** Phase 1 optional (lint works with or without fixtures). **Parallel:** yes.
3. **Phase 3** (Sub-phase 3): Page-level harness (jsdom). **Blocker:** Phase 1 (needs fixtures). **Parallel:** no (adds new harness).
4. **Phase 4** (Sub-phase 4): Online Supabase CI. **Blocker:** owner setup of test project. **Parallel:** Phase 1–3 (adds optional step to ci.yml).
5. **Phase 5** (Sub-phase 5): New unified harness. **Blocker:** Phase 1–4 (new harness orchestrates all layers). **Parallel:** no.
6. **Phase 6** (Sub-phase 6): Mutation testing. **Blocker:** Phase 1 (needs fixtures). **Parallel:** Phase 2–5 (optional, not in critical path).

#### Strangler timeline (low-disruption migration)

- **Week 1** (Phase 1–2): Fixture dedup + lint rewrite. Old harness unchanged; new harness beside it.
- **Week 2** (Phase 3–4): Page tests + CI online checks. Both gated behind feature flags (optional).
- **Week 3** (Phase 5): Switch CI to new harness. Old harness retired.
- **Week 4+** (Phase 6): Mutation testing + refinement.

Total effort: ~20–25 dev hours (Fable + owner for Q&A + test setup). Continuous delivery during all phases.

---

### Invariants & acceptance criteria (per-phase)

#### Phase 1 (Fixture centralization)
- [ ] `tests/fixtures.mjs` exports `getFixtures()` with memoization.
- [ ] New characterization files have ~80 assertions each, all passing.
- [ ] `run-intelligence-tests.mjs` harness time reduced by ≥300ms (fixture dedup savings).
- [ ] Old harness still runs green (no breaking changes).

#### Phase 2 (Semantic lint)
- [ ] Lint output is a concrete violation list, not a count.
- [ ] `--approve-violation` flag works, updates approved list.
- [ ] r-wcag-contrast rule finds ≥1 existing violation (documents the exception).
- [ ] All old lint tests still pass (backward compat).

#### Phase 3 (Page tests)
- [ ] `tools/run-page-tests.mjs` loads a page in jsdom, asserts tile presence.
- [ ] Supabase mock returns fixture data (no network).
- [ ] ≥1 page test written (finances.test.js), passing.
- [ ] No layout errors reported by jsdom (console.warn count = 0).

#### Phase 4 (Online CI)
- [ ] `tools/run-supabase-ci-tests.mjs` runs online checks (RLS, migration history).
- [ ] `ci.yml` has optional step (gated by secret, doesn't block if absent).
- [ ] Owner test project confirmed functional (can query tables, RLS policies listed).

#### Phase 5 (New harness)
- [ ] `tools/run-all-tests.mjs` discovers all tiers, runs serially (contract → integration → pages).
- [ ] Within-tier parallelism reduces latency by ≥2x (12s → 6s for unit tests).
- [ ] `--tier unit` flag works, runs only unit tests.
- [ ] `--watch` flag works, re-runs on file change.
- [ ] `ci.yml` updated to use new harness, tests green, old harness archived.
- [ ] CLAUDE.md §6 updated to document new layers.

#### Phase 6 (Mutation testing)
- [ ] `tools/run-mutation-tests.mjs` applies ≥20 mutants to affordability + refinement.
- [ ] Mutation score ≥95% (≤5% survive).
- [ ] Any survivors suggest new test cases (documented in CLAUDE.md).

---

### N/A

None.

---

*End expanded segment 10.10.*
## 11. Appendix — quick reference

### 11.1 Repository map (top level)
- `index.html` — the dashboard (home) page + app entry.
- `pages/` — 15 page surfaces (HTML), one per feature view.
- `components/` — fetch-injected shell partials: `header.html`, `nav.html`, `footer.html`.
- `assets/js/` — 132 ES modules: flat utilities + calculators, `dashboard/`, `finances/`,
  `listings/`, `areas/`, `refinement/`, `learned-preferences/`, `suggestions/`, `outreach/`,
  `ask/`, `setup/`, `criteria/`, `journey/`, `report/`, `storage/`, and thin `page-*.js`.
- `assets/css/` — 51 partials: `tokens.css` + `base.css` + `fonts.css`, the `dashboard.css` import
  shell + `dashboard/`, `pages/`, and `components/`.
- `assets/fonts/`, `assets/img/` — self-hosted fonts; openly-licensed imagery.
- `data/` — content JSON: `areas.json` (index) + `areas/<id>.json`, `house-types.json`,
  `checklists.json`, `journey.json`, `outreach-templates.json`, `schema/`, `snapshots/`, `source/`,
  `fixtures/` (redacted sample data for tests).
- `tools/` — Node `.mjs` scripts: the test harness, area pipeline, listings fetch/normalise, sync,
  linters, importers.
- `tests/` — ~65 `.js` test files + `assert.js`/`schemas.js` helpers + `tests.html` browser smoke.
- `supabase/` — `schema.sql` (reference DDL), `functions/ask/` (Deno Edge Function), `README.md`.
- `docs/` — live operating docs (index at `docs/README.md`) + `archive/`.
- `.github/workflows/` — CI, Pages deploy, scheduled fetchers (guard-railed; redesignable under §4.4).
- Root law: `CLAUDE.md` (operating rules), `DESIGN.md` (visual contract), `README.md`,
  and **this file** (`fable_refactor.md`, the overhaul program).

### 11.2 The single commands that matter
```bash
node tools/run-intelligence-tests.mjs   # the unified test harness — green before every commit (§3.6)
node tools/area-status.mjs              # area research progress / next-to-do queue
node tools/lint-responsive.mjs          # mechanical responsive-doctrine lint (to become semantic, §5.2)
node tools/build-areas.mjs              # rebuild data/areas.json index from villages.csv + per-area files
node tools/sync-areas-from-supabase.mjs # materialise per-area JSON from the DB (areas are DB-canonical)
python3 -m http.server 8000             # local preview (no browser in CI env; developer verifies)
git log --oneline -40                   # cadence & recent history
wc -l fable_refactor.md                 # track this plan's size as Fable deepens it
```

### 11.3 The four data classes (`CLAUDE.md` §18.1 — get this right before touching storage)
- **User state** (profile, criteria, finances, goals, shortlist, contacts, outreach, reactions,
  learned prefs, …) → source of truth = **Supabase**, per `household_id`. Never in repo JSON.
- **Content — areas** → source of truth = **Supabase**; `data/areas/*.json` is a materialised view.
- **Content — other** (`house_types` mirror; `checklists` + `outreach-templates` repo-only) → source
  of truth = **repo JSON**, mirrored via MCP where a mirror table exists.
- **System / engine** (`households`, `household_members`, `sync_log`, `listings`, refinement tables)
  → Supabase-managed; never synced or hand-edited.

### 11.4 Governing docs index
| Doc | Read it for |
|---|---|
| `CLAUDE.md` | The operating law — branching, testing, design, guard rails, Supabase sync. |
| `DESIGN.md` | The visual contract — anchors, tokens, bans, responsive doctrine. |
| `fable_refactor.md` | **This file** — the overhaul program: scan, authority, test rebuild, segments. |
| `docs/CHECKLIST.md` | Live progress tracker (the repo's own, distinct from §9 here). |
| `docs/ROADMAP.md` | What shipped across v2/v3. |
| `docs/DATA_MODEL.md` | Every data shape and where it lives/flows. |
| `docs/SUPABASE_SYNC.md` | The bidirectional sync contract in operational detail. |
| `docs/INTELLIGENCE_RULES.md` | Constants + rationale for affordability/fit/learning engines. |
| `docs/REFINEMENT_README.md` | How the Model Refinement Engine fits together / how to operate it. |
| `docs/ASK.md` | The Ask assistant — tool catalogue, deploy/operate. |
| `docs/FETCH_SCHEDULE.md` | The daily Rightmove fetch — timing, triggers, DST-safety. |

### 11.5 Definition of done (per sub-phase) — the new standard
1. Behaviour preserved or intentionally improved (characterization/golden-master tests prove it, §5).
2. The single test command is green; the lint is clean (semantic, §5.2).
3. Design anchor named; `DESIGN.md` bans avoided; tokens-only; a11y floor met (or raised).
4. Any guard-rail touched followed the §4 rail-change protocol (and §4.4 owner gate if foundational).
5. Supabase sync ceremony complete if data/schema/storage touched; live-data invariant intact (§3.5).
6. The changed behaviour is **described and vetted to the §6 standard** — including its As-is→To-be —
   in the relevant `docs/` file or segment.
7. Any dead/redundant code the change exposes is removed or logged in the §2.7 inventory.
8. Merged to `main`, pushed, §9 checklist ticked, owner updated in one line.

### 11.6 The owner's directives captured in this edition (2026-06-16)
This expanded edition encodes seven explicit owner directives. Fable must honour them as it re-plans:
1. **Comprehensive, vetted feature descriptions** for every rule/mechanic/style/logic — the §6 standard.
2. **Authority to flex, relax, and redesign the guard rails** — §4, with a disciplined rail-change
   protocol and owner gates for the foundational rails.
3. **A complete re-write of all test processes and the tests themselves** to a new standard — §5,
   built strangler-style so the safety net is never down.
4. **A new standard, top to bottom** — the floor is today's system; the target is what a senior team
   would build from first principles now.
5. **Total redesign freedom for the whole portal** — IA, navigation, page set, visuals, mechanisms
   (prime directive + §10.0), bounded only by the safety process.
6. **Gradual modular decomposition of the learning/intelligence engine** so modules can be optimised
   or rebuilt one at a time behind stable interfaces — §10.0.
7. **High-quality, easy-to-answer questions** that surface Fable's assumptions/decisions for precise
   owner feedback — §7.0 — plus an **obsolescence audit** (old/dead/redundant/unused — §2.7) and an
   **As-is→To-be** account for every meaningful piece (§6.1.10).

---

*Authored 2026-06-16 by Opus 4.8 as the foundation for the Fable-led overhaul, then expanded the same
day into this comprehensive edition. Per the repo's prime rule: where this file and reality disagree,
reality wins — Fable fixes this file. Nothing here is frozen until the §2 scan and §7 intake are done;
this is the start of the conversation, deliberately over-specified so the conversation starts informed.*

---

## Appendix — Session log: Claude-Code-management optimisation pass (2026-06-18)

A structural/organisational optimisation pass run **independently of, and prior to,** the Fable
overhaul above (owner decision: this is a precursor; the plan in this file is untouched except for
this appended log). Goal: make the repo maximally legible for AI-assisted management — findability,
clear references, context at every stage, current docs, and the house file-size norm — **without any
behaviour change**. The test harness (`node tools/run-intelligence-tests.mjs`) was green (712 pass,
0 fail) after every phase. All work landed on branch `claude/codebase-optimization-plan-7u74zo`.

- **Phase 0 — doc freshness.** Reconciled the `CLAUDE.md` "Last reconciled" banner to 2026-06-18.
  Left `DATA_MODEL.md` / `REFINEMENT_README.md` provenance dates honest (facts still hold).
- **Phase 1 — navigation & context scaffolding.** Added `docs/REPO_MAP.md` (whole-repo orientation:
  tree, naming conventions, file-size norm, guard-rail pointer); `tools/README.md` (index of the 22
  active tools); per-subtree `README.md` for the substantial `assets/js/*` folders plus
  `assets/js`, `assets/css`, `components`, `data`, `tests`; and purpose headers on 26 previously
  header-less leaf modules (`dashboard/tile-*`, `finances/section-*`, `outreach/*`). Fixed a stale
  note in `tools/archive/README.md`. Added `build` / `area-status` / `sync-areas` npm aliases.
- **Phase 2 — naming/findability (verification, no churn).** The flagged issues were already resolved
  or intentional: the CSS folder is already `pages/listings/`; `savings-editor.js`/`savings-edit.js`
  are distinct and both used; `types.js` is an intentional JSDoc typedef artifact. Convention
  documented in `REPO_MAP.md` rather than mass-renaming working code.
- **Phase 3 — behaviour-preserving code splits (tests as the net).** Split oversized modules behind
  the established shim/coordinator pattern, public import paths unchanged:
  `page-listings.js` 1050→629 (→ `page-listings/{row,progress}.js`),
  `page-report.js` 445→193, `page-property.js` 430→129, `page-area-detail.js` 415→212
  (each → `page-<name>/sections.js`), and `components/outreach.css` 595→9-line `@import` shell over
  five partials. (`page-listings.js`'s residual 629 is its single cohesive `render()` closure, left
  intact by design.)
- **Phase 4 — conventions codified.** Made the ~400-line split-with-a-shim norm explicit in
  `CLAUDE.md` §19 and recorded the page-`<name>/` subtree pattern.
- **Phase 5 — guard-railed storage splits (§16, owner-approved as named phases).** Split
  `storage/listings.js` 648 → `storage/listings/{content,feed,learned}.js` (+ internal
  `_reactions-core.js`) and `storage/user-state.js` 424 →
  `storage/user-state/{singletons,readiness,investments,shortlist}.js`, each behind a re-export shim.
  Public surfaces preserved **byte-for-byte** (Node resolves exactly the original 24 / 29 exports —
  none missing, none leaked). `CLAUDE.md` §16 updated to record the nested shims.

Net effect: no source module outside generated data exceeds the house norm except the one intentional
`render()` closure; every directory and tool is self-documenting; docs reflect reality. No data,
schema, or user-state was touched (pure code/UI/docs refactor — Supabase ceremony correctly skipped).
