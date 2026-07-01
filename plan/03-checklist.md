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
- [x] 1.2 `tools/run-all-tests.mjs` stood up beside the old runner (`npm run test:new`): dynamic tier discovery, same `register()` contract (suites port by moving), `--tier` filter, per-tier summaries, lint + sync suite on full runs with online-skips reported as unrun. *(2026-07-01)*
- [x] 1.3 Fixtures centralised in `tests/fixtures.mjs` (memoised; both runners consume it) + `tests/mocks/supabase-client.js` (chainable fixture-backed stub, self-tested by the first unit-tier suite, 6/6). *(2026-07-01)*
- [x] 1.4 Batch A ported: 9 finance suites → `tests/unit/`, 2 → `tests/characterization/`; legacy runner + browser harness re-pointed; legacy 783/0, new harness 142/142. *(2026-07-01)*
- [x] 1.5 Batch B ported: 20 listings-pipeline suites → `tests/unit/` (incl. fetch/purge/backfill tool tests); legacy 783/0, new harness 365/365. *(2026-07-01)*
- [x] 1.6 Batch C ported: 11 intelligence-engine suites → `tests/unit/`. *(2026-07-01)*
- [x] 1.7 Batch D ported: 10 contract suites → `tests/contract/` (root-path + dynamic-import fixes; live docs re-pointed to the tiered paths; supabase-sync stays a spawned suite by design). Legacy 783/0; new 649/649. *(2026-07-01)*
- [x] 1.8 Remaining 14 suites ported (11 → unit, 3 → characterization); only the spawned `supabase-sync.test.js` stays at root by design. Porting complete: 67 suite files across tiers; legacy 783/0, new harness 789/789. *(2026-07-01)*
- [x] 1.9 DOM tier live: pure shell mechanics extracted to `assets/js/shell-core.js` (DI-friendly; `components.js` now the thin bootstrapper, behaviour preserved), first `tests/pages/shell.test.js` renders the real partials in jsdom (injection, nav resolution, active-state incl. the characterized 3-link home behaviour, failure fallback, theming); runner fixed to drain async tests. New 795/795; legacy 783/0. *(2026-07-01)*
- [x] 1.10 Semantic lint v2: baseline is now a justified RATCHETING allow-list ({count, reason} per fingerprint; new-by-identity always fails; stale allowances fail until `--tighten-baseline` locks the fix in; `--write-baseline` resnapshot removed as a laundering hazard). 7 entries ported with recorded reasons; both runners assert regressions+stale. *(2026-07-01)*
- [x] 1.11 RLS rail live: `tools/check-rls.mjs` (psql over SUPABASE_DB_URL; fails CI on any public table without RLS; honest SKIPPED without the secret) + 5 contract tests pinning its decision logic + `ci.yml` step (§16 rail phase, pre-authorised). Activates fully at owner step 2.16. *(2026-07-01)*
- [x] 1.12 Tier-0 type-check live with a RATCHETING scope (deviation recorded: the planned listings/storage/finances start = 90+ errors through the untyped import graph — whole-graph typing stays the Phase-9 R1/R4 job; scope starts clean at shell-core/config/dom/format, fixed via JSDoc-only annotations, and may only GROW as phases rebuild modules). `npm run typecheck` + Tier-0 step in the new harness. New 801/801; legacy 788/0. *(2026-07-01)*
- [x] 1.13 CUT OVER: `npm test` / `ci.yml` / `pages.yml` / CLAUDE.md §6 / DESIGN.md / live docs + skills all point at `tools/run-all-tests.mjs`; the legacy runner is a thin forwarder (deleted at the Phase-10 leanness sweep, refinement of "archive" so every documented command keeps working). **Phase 1 complete — re-baseline: 801/801 (598 unit + 120 contract + 69 characterization + 6 pages + Tier-0 + lint + sync 16/0/3-skip) across 69 tier-discovered suites, ~5s offline; devDeps jsdom/happy-dom/typescript.** *(2026-07-01)*

**Phase 2 — ⭐ FLAGSHIP: listings pipeline, DB-canonical rework (§10.4/§10.5/§10.9 + `logs/2026-07-01-listings-m2m.md` §5)**

*2.A — Pin current behaviour (before any change)*
- [x] 2.1 `withinGeofence()` characterized: existing unit coverage audited (petals/tiebreak/corroboration/membership already pinned); new `tests/characterization/geofence-pipeline.test.js` pins the subtle contracts the rework leans on — km-sorted membership, primary-position independence, INCLUSIVE buffer boundary, exact mi conversion, sectoral membership, mixed-universe resolution, determinism (7 tests). 808/808. *(2026-07-01)*
- [x] 2.2 Feed contract pinned at the INTEGRATION tier: the REAL `getListings()` runs under Node against the fixture mock via a new `core.js` test seam (`__REC_TEST_SB__` + `_resetStorageForTests`, extend-only §16 change) — membership scoping, Problem A (membership beats primary), Problem B (origin exclusion), paused-link exclusion, `geofence_pass` false/null/reveal semantics, status filter, ordering, membership attachment, empty-scope short-circuit (7 tests). Runner now executes tests sequentially (integration suites share process state). 815/815. *(2026-07-01)*
- [x] 2.3 Composed target-pipeline golden-master (`tests/characterization/fetch-targets.test.js`): radius-tuning → demand-gating → cluster targets → dedupe over a fixture universe with exact serialized output (tight clusters, coarse whole-outcode fallback, shared-identifier merge, origin absence), tuning/exploration reshaping, the cluster≤outcode cost invariant, and partial demand pruning. 2.A complete. 819/819. *(2026-07-01)*

*2.B — One geofence universe*
- [x] 2.4 `tools/lib/geofence-universe.mjs` created: pure `buildUniverse()` core (inclusion = coords AND (active OR linked); tuning applied; outcode grouping) + `toVillage` (lifted) + `applyRadiusTuning` (moved from the fetcher, re-exported for compat) + DB REST edge and repo materialised-view edge; 6 unit tests incl. stubbed-REST composition and a real-repo smoke (175 villages / 18 outcodes today). 825/825. *(2026-07-01)*
- [x] 2.5 Fetcher migrated: `loadOutcodeMap` is now a thin call to the canonical `loadUniverseFromRepo()` (divergent parsing deleted; tuning overlay already shared since 2.4; live stub merge unchanged); golden-master byte-identical. `import-apify-runs` consumes the same export, so it rides along until its own 2.8 migration. 825/825. *(2026-07-01)*
- [x] 2.6 `backfill-listing-areas.mjs` migrated: local `toVillage` deleted (re-exported from the lib for the --villages path + tests); `restLoadVillages` is now the canonical DB edge; stale `applyRadiusTuning` cross-import from the fetcher removed. 825/825. *(2026-07-01)*
- [x] 2.7 `backfill-geofence` + `radius-tune` migrated onto the canonical loader; new `includeDisabled` option preserves radius-tune's full-catalog geometry (historic reactions in disabled areas keep bearings) with a unit test; all three divergent loaders are now DEAD. 826/826. *(2026-07-01)*
- [x] 2.8 ONE MATCHER: importer accept-gate unified onto `withinGeofence` (in-buffer accepted; near-miss ≤20 km stored-but-hidden preserving includeOutOfArea; wrong-region/coordinate-less dropped); `matchListingToArea` deleted from `listings-normalise.mjs` (+ its 3 tests); dead `assignArea` deleted from the fetcher; new contract rail `tests/contract/one-matcher.test.js` scans tool sources so the retired matchers can never return (it caught a residual import during the change). 2.B complete — one universe, one matcher. 825/825. *(2026-07-01)*

*2.C — One membership truth*
- [x] 2.9 MIGRATION LIVE (`derived_primary_from_listing_areas`): `uniq_listing_areas_primary` partial unique index (multi-primary structurally impossible) + `replace_listing_areas` v2 (validates exactly-one-primary at the boundary; DERIVES `listings.area_id` from the junction in the same transaction). Pre-gate 0 mismatches/0 multi-primary; synthetic 4-assertion live verification passed + cleaned; real data untouched (1067/4028). Applied via execute_sql WITH history insert (apply_migration approval stream down — disclosed); mirror + DATA_MODEL + SUPABASE_SYNC updated incl. the §18.3 parity SQL. FOUND: 4 live geofence-passing listings with zero membership (feed-invisible today) → 2.11 repair queue. 825/825. *(2026-07-01)*
- [x] 2.10 Writers simplified to write-membership-once: `membershipFor` is verdict-driven (stored-column alignment + `primaryFix` deleted; `primaryDrift` kept as a stale-geofence-fields signal pairing with `backfill-geofence`); raw `emitSql`/`--emit-sql` write path deleted (would bypass the deriving RPC — RPC is the ONLY membership writer; `--from-file` is report-only); `restReplace` fix-upsert dropped. Fetcher/importer keep setting the identical initial `area_id` on insert (RPC re-derives). Tests rewritten to the new contract. 825/825. *(2026-07-01)*
- [x] 2.11a HOTFIX (2026-07-01): the 3 repairable feed-invisible listings (173588246, 90359223, 90374985) recomputed through the canonical machinery (buildUniverse + membershipFor, DB-edge-identical universe incl. stubs+tuning) and written via the deriving RPC — 13 membership rows, parity 0. 174197870 is correctly OUT of every buffer under today's tuned radii (stubbington 0.76 mi): its stale geofence_pass=true is a FIELD refresh for the sweep.
- [ ] 2.11b Full membership + geofence-field sweep runs in CI via the 2.15 workflow (fields first via backfill-geofence, then membership via the RPC path), checksum-verified — a ~4,000-row bulk write belongs in CI, not MCP-transported SQL (log §5.8). Unblocked by ⚙ 2.16.

*2.D — One visibility predicate*
- [x] 2.12 Migration LIVE (`household_feed_rpc`): `household_feed(p_household_id, …)` SECURITY DEFINER RPC — membership ∩ non-origin active areas ∩ curated-disable ∩ `geofence_pass` ∩ baseline (classify.js constants + \y-translated type regexes, anti-drift-pinned by `tests/contract/household-feed.test.js` over the `supabase/archive/schema-household-feed.sql` mirror), ordered + paged, `areas` jsonb attached; fixture reference impl `tests/mocks/household-feed-rpc.js` (12 contract tests). Live verify: exact set parity with the reference predicate (392=392, 0 missing/extra/doubled), Shedfield visible, baseline hides only the ever-liked £435k row (already decided-suppressed → zero visible-row change); guard verified anon/member/non-member. Applied via execute_sql + history insert (apply_migration approval stream down — disclosed, as 2.9). 837/837. *(2026-07-01)*
- [x] 2.13 `storage/listings/feed.js` pointed at the RPC (rail phase, pre-authorised): scoped read = ONE `household_feed` call (paged; names resolved client-side); the client id-list `.in()`, local origin filter, catalog-disable filter and double geofence gate all retired; unscoped path (saved view/signed-out) unchanged. Feed integration contract (2.2) green THROUGH the cutover — the mock now serves the RPC from the 2.12 reference impl; the sync-suite source-scan re-pinned to the new one-predicate contract (retired plumbing can't return). 837/837. *(2026-07-01)*
- [x] 2.14 Live acceptance vs the RPC (all §3 invariants of the 2026-07-01 log hold): Whiteley the sole origin, 224 origin-only listings hidden with **0 leaking** into the feed; Shedfield 90328152 visible via waltham-chase-so32 membership despite its wickham primary stamp (Problem A); owner feed 392 rows (exact set-parity vs the reference predicate proven at 2.12; 395→392 is listings churn); all 3 households return sane feeds (97/392/431). 2.D complete — one visibility predicate, live and consumed. *(2026-07-01)*

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
