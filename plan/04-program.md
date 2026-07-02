# Program design — the agreed overhaul architecture (2026-07-01)

> Authored by Fable (claude-fable-5) from the §2 scan + §7 intake. This file records the
> **decisions**; the sequenced atomic backlog lives in [`03-checklist.md`](03-checklist.md).
> Directory: [`plan/README.md`](README.md).

## 1. Intake record (§7, answered by the owner 2026-07-01)

| Decision | Owner's answer |
|---|---|
| Listings-pipeline depth | **Full DB-canonical rework** — one loader, one geofence predicate, `listing_areas` as single source of truth, one per-household visibility RPC, scheduled re-membership. |
| Test apparatus | **Full §5 blueprint** — test-only devDependencies allowed (jsdom/happy-dom; optionally Vitest, Stryker). Site ships zero-build regardless. |
| UI overhaul depth | **Rethink IA, rebuild page-by-page** on the existing token/shell/CSS foundations (scan verdict: already cleanly mobile-first; leverage is IA + page design). |
| North star | **Feed quality + trust in numbers.** Tie-breaker for every downstream design decision. |
| §4.4 foundational gates | **Pre-authorised via this plan.** Approval of the program plan IS the owner gate for the named storage/schema/CI/finance rail phases; re-ask only on scope divergence. §3.10b still applies: any change to a financial number the buyer sees is called out in the commit + progress note. |
| CI secrets (service-role) | Owner's reply addressed merge mechanics, not the secrets. **Recorded as: plan around it.** All bulk-write tooling is built CI-runnable; one flagged owner step adds `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_URL` repo secrets; until then MCP-run with checksum gating stays the documented fallback. |
| Cuts | **Cut nothing.** All surfaces stay (journey, rejected, live-feed included). |
| Pacing | **Steady, no deadline.** Tiny committed steps; quality gates never compressed. |

**Plan-mode latitude decision (§0.2, dated 2026-07-01):** mode (2) — the plan is maintained as
this directory; Phases 1–2 are decomposed to atomic steps now (they are next); Phases 3–10 are
decomposed to named, one-sentence steps now and expanded to full atomic granularity **just-in-time
when their block starts**, folding in what earlier phases taught. Rationale: speculative
atomic steps for month-later work rot; the resume contract only needs the *next* steps atomic.

## 2. Priority order (owner-directed, unchanged)

1. **P1 — The safety net** (Phase 1): new test harness core stood up first, because every later
   phase leans on it (§5.3 — never leave the net down). Small, fast, additive.
2. **P2 — THE FLAGSHIP: listings pipeline** (Phase 2): find → pull → store → filter → organise →
   per-household area management, raised to the §6 standard (TOP PRIORITY DIRECTIVE).
3. **P3 — Mobile-first UI/UX overhaul** (Phase 3).
4. **P4+ — the rest in coupling order:** intelligence engine (couples to listings), finances,
   areas content/map, Ask, profile/journey, backend/storage resilience, process rails.

## 3. Flagship target architecture (the four collapses)

The end-state contract (from `logs/2026-07-01-listings-m2m.md` §3): *every household sees a true,
complete, de-duplicated reflection of all properties inside any area they hold — nothing missing,
nothing doubled, nothing leaked, nothing from where they already live.*

1. **One geofence universe.** A single shared loader (`tools/lib/geofence-universe.mjs`) building
   the DB-canonical village set — areas `active` OR household-linked (incl. onboarding stubs),
   with `area_search_tuning` (scalar + directional petals) applied — consumed by the fetcher,
   both backfills, the importer, purge, and radius-tune. The three divergent loaders
   (`loadOutcodeMap`, `loadActiveVillages`, `restLoadVillages`) and the repo-only asymmetry die.
2. **One matching predicate.** `withinGeofence()` is the only decisive matcher in ingestion;
   `matchListingToArea()` (20 km nearest) and the fetcher's `assignArea()` are retired from the
   write path.
3. **One membership truth.** `listing_areas` becomes the single source; the primary is derived
   (DB view/generated column + writer discipline), `listings.area_id` maintained *from* it —
   drift impossible by construction, verified by a parity invariant test.
4. **One visibility predicate.** A per-household feed RPC/view (`household_feed`) owns
   membership + origin exclusion + area status + `geofence_pass` + baseline in ONE place;
   `storage/listings/feed.js` consumes it. The client-side `.in('rightmove_id', …)` scale wall
   and the belt-and-braces double-gate are retired. Feed behaviour is pinned by characterization
   tests before, during, and after.

Plus: scheduled re-membership sweep (area add/disable/radius-tune no longer staleify membership),
end-to-end dedupe audit (relists, price_history, cross-membership double-show), origin/target as a
first-class UI concept in the area picker, and CI as the only supported bulk-write path.

## 4. Guard-rail audit (§4.5 deliverable — the next-generation rail system)

| Rail | Verdict | Action |
|---|---|---|
| `tokens.css` | **Earned its keep**; missing OKLCH/`color-mix` fallbacks (C1) | Keep extend-posture; C1 fallback phase in P3. |
| `storage.js` + `storage/*` | Earned its keep; the *feed read path* redesign is required by the flagship | Redesign under this plan's pre-authorised §4.4 gate; write-through-cache contract + live-data invariant (§3.5) preserved at every commit. |
| `config.js`, `data-loader.js` | Sound, small | Keep; characterise then modernise opportunistically. |
| `finances.js` + `calc-*` | Sound; two known ⚠ corrections (A3 LISA 12-month, A5 stress relabel) | Golden-master + mutation tests first, then corrections; every visible-number change flagged (§3.10b). |
| `dashboard.css` shell | Sound | Keep append-only. |
| `area.schema.json` | Sound | Changes only as sequenced migrations. |
| `.github/workflows/*` | Sound; growing (9 yml incl. refinement-run, radius-tune) | All changes remain named phases with rollback notes. |
| **MISSING RAIL: Apify/fetch spend** | No rail guards the scrape budget beyond env defaults | New rail: budget caps + demand-gating asserted by a contract test; any change to spend parameters is a named phase. |
| **MISSING RAIL: Edge Function prompt/tool surface** | Ask's prompt + 13 tools have no drift guard | New rail: tool-contract test (names/schemas pinned); prompt versioned in-repo. |
| **MISSING RAIL: RLS** | Verified only manually at session start | New rail: RLS assertion in CI (E2) — fails if any table loses RLS. Pulled into Phase 1. |

## 5. Test apparatus (approved shape)

Seven tiers per the validated §10.10 blueprint: Tier 0 `tsc --checkJs` (JSDoc) → unit → contract →
characterization → integration → page (jsdom) → small real-browser smoke (deferred until P3 needs
it). New runner `tools/run-all-tests.mjs` beside the old, strangler-ported, single green command
preserved throughout; semantic lint v2 (violation identity, not counts); online Supabase checks
never reported as passing when skipped; Stryker mutation testing scoped to finances + refinement +
learned-preferences at ~75–80% threshold, opt-in, added in their phases. devDependencies only.

## 5b. Recorded decisions (ADR-style, dated)

- **2026-07-01 — B5 declined: keep the five explainable gates (step 4.4).** The validation
  review offered a Bayesian Beta-Bernoulli core (global reject rate as prior) unifying
  confidence, cold-start and disproportionality into one posterior. Decision: **keep the
  gates.** Rationale: the review's own trade-off — Bayesian models are better-calibrated at
  small n but lose the explicit gates the product exposes to the user — and the owner's north
  star ranks *trust/explainability* alongside feed quality; the gates ARE the explanation the
  Refinement page shows. The cheaper statistical win was taken instead (Fisher's exact, 4.2),
  and gate pass-rates are now audited per run (4.3). **Revisit trigger:** if the 4.3
  calibration data shows systematic miscalibration (e.g. gates passing noise or starving
  obvious signals across many runs), reopen as its own named phase.

## 6. Owner-action items (each one flagged as a checklist step when reached)

1. Add repo secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
   (+ optional `REFINEMENT_HOUSEHOLD_ID`) — unlocks refinement-run.yml, the re-membership sweep,
   and CI-run backfills.
2. Ask admin handoff (pre-existing): `ANTHROPIC_API_KEY` Supabase secret + deploy the `ask`
   Edge Function (docs/CHECKLIST.md).
3. On-device visual checks when a UI phase hands one off (DESIGN.md §4).
