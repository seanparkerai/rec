# Segments — §10 index · §10.0 modular decomposition

> Split from `fable_refactor.md` (2026-07-01, content unchanged). Directory: [`plan/README.md`](../README.md).


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
