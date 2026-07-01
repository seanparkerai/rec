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
- [ ] Global Q&A intake (§7.1) complete; answers recorded.
- [ ] Guard-rail audit (§4.5) delivered; redesign recommendations agreed with owner.
- [ ] New test standard (§5.2) designed; owner sign-off on shape + any dev dependency.
- [ ] "State of the system" note delivered with top-3 targets.
- [ ] The plan (now `plan/`) overhauled into the final step-by-step program + atomic backlog.
- [ ] Plan presented and **owner-approved** — the one gate that starts product-code execution.
- [ ] On approval: overhauled plan committed *before* any product code moves.

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
