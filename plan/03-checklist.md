# Living checklist — §9 the resumable backlog spine

> Split from `fable_refactor.md` (2026-07-01, content unchanged). Directory: [`plan/README.md`](README.md).

## 9. Living program checklist (Fable maintains this)

> This checklist is the spine the Session Mandate refers to. During the Plan-Mode overhaul, replace
> this stub with the agreed, sequenced backlog of **atomic steps** — each small enough to complete,
> test, commit, and tick in a single short working spell (§3.1). Tick + commit after every merged step
> so any credit-limited or cold session resumes from the exact next unticked line. Record baseline
> metrics here (test count/runtime, lint violations, segment coverage) so progress is measured, not
> asserted.

**Phase 0 — Onboarding (all in Plan Mode; ends at owner approval)**
- [x] Plan Mode entered; session confirmed read-only until approval (Session Mandate). *(2026-07-01)*
- [x] Full-codebase scan complete (§2); inventories verified/corrected — dated "§2 scan corrections"
      sections appended to `segments/10.{1,4,5,6,8,9,10}` + drift summary in `plan/README.md`. *(2026-07-01)*
- [x] Harness green at baseline; baseline metrics recorded: **783 pass / 0 fail** (+ sync 16/0/3
      online-skips); 67 test files; responsive-lint baseline 7 entries; 145 JS / 53 CSS / 28 tools /
      14 page surfaces. *(2026-07-01)*
- [x] Supabase schema + RLS confirmed via MCP: **33 tables, all RLS-enabled**. Snapshot NOT fresh —
      drift found (`profile` 06-21, `shortlist` 06-28, `learned_preferences` 07-01, `areas` 06-28 vs
      older high-water marks); reconcile per §18.2 at the first data-session start. *(2026-07-01)*
- [x] **Owner-directed insertion (2026-07-01): split `fable_refactor.md` into `plan/`** — granular
      files + directory index; merged to `main` (`91cec46`).
- [x] Global Q&A intake (§7.1) complete; answers recorded in `04-program.md` §1. *(2026-07-01)*
- [x] Guard-rail audit (§4.5) delivered (`04-program.md` §4); gates pre-authorised via the plan (owner, §7 intake). *(2026-07-01)*
- [x] New test standard (§5.2) designed (`04-program.md` §5); owner signed off the full blueprint incl. test-only devDependencies. *(2026-07-01)*
- [x] "State of the system" note delivered with top-3 targets (session note, 2026-07-01; summary in `plan/README.md` known-drift + `04-program.md`).
- [x] The plan (now `plan/`) overhauled into the final step-by-step program + atomic backlog (`b1ea902`). *(2026-07-01)*
- [x] Plan presented and **owner-approved** (2026-07-01) — execution unlocked.
- [x] On approval: overhauled plan committed *before* any product code moves (`b1ea902` + close-out ticks).


---

> **Backlog authored 2026-07-01 from the §2 scan + §7 intake (decisions in [`04-program.md`](04-program.md)).**
> Sequencing: the 2026-07-01 ⭐ TOP PRIORITY DIRECTIVE supersedes the 2026-06-16 "front-end first"
> order — **listings pipeline first (after the Phase-1 net core), mobile-first UI second.**
> Rules: one step = one commit = one tick, merged to `main`, harness green (§3). Phases 1–2 are
> atomic now; Phases 3–10 are expanded to atomic granularity just-in-time when their block starts
> (§0.2 mode-2 decision, `04-program.md` §1). ⚙ = flagged owner action.

**Phase 1 — The net, first: new test-harness core (§5; strangler — old runner stays green throughout)**
- [x] 1.1 devDependencies added (jsdom ^29.1.1, happy-dom ^20.10.6) + package-lock.json; Pages deploy verified unaffected (uploads a fresh checkout, node_modules gitignored). *(2026-07-01)*
- [ ] 1.2 Stand up `tools/run-all-tests.mjs` beside the old runner: tier discovery over `tests/{unit,contract,characterization,integration,pages}/`, `--tier` filter, per-tier summary, honest online-skip reporting.
- [ ] 1.3 Centralise fixtures: `tests/fixtures.mjs` (memoised loaders over `data/fixtures/*.sample.json`) + `tests/mocks/supabase-client.js` (fixture-backed stub with `.from().select()` + mock session).
- [ ] 1.4 Port suite batch A (pure finance: affordability, calc-*, money-flow, savings) into `tests/unit/` + `tests/characterization/`; both runners green.
- [ ] 1.5 Port suite batch B (listings: classify, fit, feed-partition, suppress, reactions, listing-areas) likewise.
- [ ] 1.6 Port suite batch C (refinement/learned-prefs/suggestions/radius) likewise.
- [ ] 1.7 Port suite batch D (contract: supabase-sync, docs-consistency, schemas, areas-parity, profile-schema, ask-*) into `tests/contract/`.
- [ ] 1.8 Port remaining suites (dashboard tiles, live-feed, outreach, shell utils); old runner now a thin alias.
- [ ] 1.9 jsdom page-test harness (`tools/run-page-tests.mjs` or a `pages` tier): first test renders shell injection + nav active-state on a fixture DOM.
- [ ] 1.10 Semantic lint v2: rewrite `tools/lint-responsive.mjs` fingerprinting to (rule|file|selector|property) identity with an approved-violations baseline replacing counts; port the 7 allow-entries.
- [ ] 1.11 RLS CI assertion (new rail, E2): offline contract test over the tracked-table inventory + a CI-gated online check that fails if any public table has RLS disabled.
- [ ] 1.12 Tier-0 type-check: `tsconfig.json` (`checkJs`, `noEmit`) scoped to `assets/js/{listings,storage,finances}/` to start; wire as the harness's first step; fix or `@ts-ignore`-with-reason the initial findings.
- [ ] 1.13 Cut over: `package.json` test script + `ci.yml` + `CLAUDE.md` §6 point at the new runner; old runner archived; re-baseline metrics here.

**Phase 2 — ⭐ FLAGSHIP: listings pipeline, DB-canonical rework (§10.4/§10.5/§10.9 + `logs/2026-07-01-listings-m2m.md` §5)**

*2.A — Pin current behaviour (before any change)*
- [ ] 2.1 Characterization tests for `withinGeofence()` over a fixture village set: scalar + petal radii, overlap tiebreak, name corroboration, membership set shape.
- [ ] 2.2 Characterization tests for the feed contract: membership scoping, origin exclusion, `geofence_pass`, gate order, decided suppression, fingerprint dedupe (extend `tests/listing-areas.test.js`).
- [ ] 2.3 Golden-master test for `fetch-listings` target-building: villages → outcodes → clusters → demand-gating, from fixtures (no network).

*2.B — One geofence universe*
- [ ] 2.4 Extract `tools/lib/geofence-universe.mjs`: DB-canonical loader (areas active OR household-linked incl. stubs, `area_search_tuning` scalar+petal applied) with an offline repo-files fallback mode; unit-test both modes.
- [ ] 2.5 Migrate `fetch-listings.mjs` onto the shared loader (delete `loadOutcodeMap` + inline tuning overlay); golden-master 2.3 must not change demand output for the fixture case.
- [ ] 2.6 Migrate `backfill-listing-areas.mjs` onto it (delete `restLoadVillages`/`toVillage`).
- [ ] 2.7 Migrate `backfill-geofence.mjs` (delete `loadActiveVillages`) and `radius-tune.mjs` (`loadAreaCentres`) onto it.
- [ ] 2.8 Migrate `import-apify-runs.mjs` onto it and delete `matchListingToArea()` + `assignArea()` from the ingestion path — `withinGeofence()` is now the only matcher (one-predicate invariant test).

*2.C — One membership truth*
- [ ] 2.9 Migration: derived primary — `listing_areas` gains the authority; `listings.area_id` maintained from it (trigger or writer discipline + DB CHECK/view), with a parity invariant test that can never drift.
- [ ] 2.10 Update all writers (fetcher, importer, backfills) to write membership once and derive the primary; delete per-writer primary alignment code.
- [ ] 2.11 Re-run the full membership backfill via the one canonical path; checksum-verify (md5 parity as 2026-07-01); reconcile snapshot.

*2.D — One visibility predicate*
- [ ] 2.12 Migration: `household_feed(household_id)` SECURITY DEFINER RPC/view — membership ∩ non-origin active areas ∩ `geofence_pass` ∩ baseline, paged; contract-tested against fixtures.
- [ ] 2.13 Point `storage/listings/feed.js` at the RPC (rail phase, pre-authorised): client id-list `.in()` and the double-gate retired; feed characterization (2.2) green throughout.
- [ ] 2.14 Live acceptance: re-verify the Shedfield/Whiteley invariants (§3 of the 2026-07-01 log) + counts vs the RPC.

*2.E — Freshness, dedupe, origins, hygiene*
- [ ] 2.15 Re-membership sweep workflow (`.github/workflows/remembership.yml`): recompute membership + geofence on area add/disable/radius-tune + weekly; no-ops until ⚙ secrets exist.
- [ ] 2.16 ⚙ Owner adds `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL` repo secrets (unlocks 2.15, refinement-run.yml, CI backfills).
- [ ] 2.17 Dedupe audit: pin relist-under-new-id, cross-run, and price_history-merge behaviour with tests; fix any double-show a listing can reach via two memberships or a relist.
- [ ] 2.18 Listing lifecycle audit: status transitions + purge criteria documented and contract-tested; `purge-listings.mjs` on the shared universe.
- [ ] 2.19 Origin/target as first-class UI: area-picker + profile let a household mark "live/commute here" vs "want to buy here", writing `household_areas.is_origin` (replaces the one-off SQL seed).
- [ ] 2.20 Strip dead mechanics + reconcile docs (DATA_MODEL, SUPABASE_SYNC, FETCH_SCHEDULE, INTELLIGENCE_RULES, REPO_MAP) + re-verify §2.7 leanness; flagship exit review against the §3 contract of the 2026-07-01 log.

**Phase 3 — Mobile-first UI/UX overhaul (IA rethink, page-by-page on existing foundations)** *(expand to atomic on entry)*
- [ ] 3.1 IA + navigation proposal (mobile-first wireframe note per page, anchor per view) → ⚙ owner design review before build.
- [ ] 3.2 C1: OKLCH/`color-mix` `@supports` fallbacks in `tokens.css` (rail phase).
- [ ] 3.3 Shell resilience: partial-injection timeout + minimal fallback + visible error; theme/header extracted to modules; page tests.
- [ ] 3.4 Listings feed page rebuild (cards, thumb-zone reactions, pagination/virtual scroll, controls) — the flagship's face.
- [ ] 3.5 Property dossier rebuild (collapsible sections, lazy gallery + srcset).
- [ ] 3.6 Dashboard rebuild (tile hierarchy, at-a-glance precedence).
- [ ] 3.7 Areas + map rebuild (incl. the queued MapLibre GL + PMTiles upgrade as its own sub-block).
- [ ] 3.8 Finances page rebuild (chart sizing/a11y, SVG title/desc, aria).
- [ ] 3.9 Profile/journey/ask/saved/rejected passes; a11y hardening (contrast + focus lint rules on); real-browser smoke tier if warranted.

**Phase 4 — Intelligence engine (module-by-module per §10.0; 8 modules incl. radius)** *(expand on entry)*
- [ ] 4.1 Interface-pin the 8 modules with tests; then per module: Fisher's exact before BH-FDR (B3 ⚠); Bayesian-core decision (B5) with gate-pass-rate logging (B6); explainability whySignals (P10a); probation re-probe UX (P10h); reason aggregation (P10c); weight-snapshot persistence (P10i); enable scheduled cadence (⚙ secrets); Stryker on engine modules.

**Phase 5 — Finances (trust surface; every visible-number change flagged §3.10b)** *(expand on entry)*
- [ ] 5.1 Golden-master grid + Stryker over `calc-*`; then: LISA withdrawal 12-month rule (A3 ⚠); stress-test → rate-rise sensitivity relabel + configurable uplift (A5 ⚠); LISA/SDLT cap-mismatch warning (A4); FTB-model additions (A7); chart/data-flow cleanups from §10.3 phases A–E.

**Phase 6 — Areas content & data quality** *(expand on entry)*
- [ ] 6.1 Matched-price lookup extracted to one shared function (triplication dies); priceSummary baked at materialisation; stub predicate unified; coordinate-quality + completeness surfacing; content research batches continue per CLAUDE.md §7.

**Phase 7 — Ask assistant** *(expand on entry)*
- [ ] 7.1 Model upgrade to `claude-fable-5` (P1); cache breakpoint over TOOLS+SYSTEM + strict on all 13 tools + JWT forwarding (F2/F3/E4 ⚠); tool-input sanitisation audit (P2); Edge-Function integration tests (P6); prompt versioning + new tool-contract rail (04-program §4).

**Phase 8 — Profile, criteria, journey** *(expand on entry)*
- [ ] 8.1 Unify the three profile modules; auto-generate template dataNeeded; journey.json → content-table decision; field-engine reactivity; outreach-via-Ask polish.

**Phase 9 — Backend/storage resilience** *(expand on entry)*
- [ ] 9.1 Offline write queue + retry (R2); ask-conversations cache (R3); snapshot split into current + changelog (R5); one schema truth incl. `supabase/archive/` (R6); publishable-key migration (E1 ⚠); generated types (R4/E4); multi-device conflict strategy decision (R7, own gate).

**Phase 10 — Process & rails re-baseline** *(expand on entry)*
- [ ] 10.1 `docs/adr/` + template with every §4 rail change mapped (G2); commitlint in CI (G3); ⚙ branch protection + required CI on `main` (G1); new rails live (spend, tool-contract, RLS); CLAUDE.md §16/§6 + DESIGN.md re-baselined to the rebuilt system; final §2.7 leanness sweep.
