# Protocol — §2 kickoff scan · §3 safety & merge · §4 rail authority · §5 test mandate · §6 description standard

> Split from `fable_refactor.md` (2026-07-01, content unchanged). Directory: [`plan/README.md`](README.md).

## 2. Kickoff protocol — the enormous scan (do this first, every fresh program)

Before re-planning or editing, Fable performs a complete sweep and writes its findings back into the
relevant per-segment sections of this file. The scan is not optional and is not a skim. It is the
single most important hour of the program: everything downstream inherits its accuracy.

**2.1 Inventory & verify (mechanical).**
```bash
find assets/js -name '*.js' | sort        # JS modules (expect ~132)
find assets/css -name '*.css' | sort      # CSS partials (expect ~51)
ls pages/ components/ data/ tools/ tests/  # surfaces, partials, data, tooling
node tools/run-all-tests.mjs      # the single unified harness — must be green at start
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

**3.3 Per-step planning discipline (`CLAUDE.md` §14, sharpened).** *(Distinct from the top-of-file
Session Mandate: that puts the whole discovery-and-design session in Claude Code **Plan Mode**; this is
the lightweight plan each individual execution step writes down after approval.)* Before each step,
enumerate in order:
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

