# REFACTOR_CHECKLIST.md — live progress tracker

> **Resume here ↓**
> Next action: Phase 3.1 — create `assets/js/dashboard/` directory; extract `tile-lede.js` from `page-home.js`
> Last commit on branch: phase 2 complete (see git log)
> Tests last run: 2026-05-27 — 184/184 passed
> Active phase: Phase 3 — split page-home.js into dashboard tile modules

---

## Pre-flight (do these once per session, then proceed)
- [ ] Clone is on `claude/inspiring-mccarthy-aZyfb`, working tree clean (`git status` empty)
- [ ] `git pull origin claude/inspiring-mccarthy-aZyfb` succeeded
- [ ] `node tools/run-intelligence-tests.mjs` is green
- [ ] `REFACTOR_PLAN.md` Part A (Context) re-read this session
- [ ] `CLAUDE.md` re-read this session

## Phase 0 — Safety net
- [x] 0.1 Create `tests/characterization-home.test.js`
- [x] 0.2 Create `tests/characterization-finances.test.js`
- [x] 0.3 Create `tests/characterization-outreach.test.js`
- [x] 0.4 Register the three new tests in `tools/run-intelligence-tests.mjs`
- [x] 0.5 Tests report 174/174 passed
- [x] 0.6 Create `REFACTOR_PLAN.md` and `REFACTOR_CHECKLIST.md`
- [x] 0.7 Commit + push: `test(refactor): phase 0 — characterization snapshots for home, finances, outreach`

## Phase 0.5 — Documentation audit
- [x] 0.5.1 Read `CLAUDE.md` end-to-end; list outdated/duplicated/over-restrictive rules in `docs/audit-notes.md`
- [x] 0.5.2 Read `DESIGN.md`
- [x] 0.5.3 Read `README.md`
- [x] 0.5.4 Audit `docs/*.md` and `PROGRESS.md` for redundancy and staleness
- [x] 0.5.5 Review `CLAUDE.md §16` guard-rail list — all 7 entries justified; all kept
- [x] 0.5.6 Apply slim-only edits: fixed 4 stale spots in CLAUDE.md (326←331 lines); added v2 COMPLETE to PLAN.md; archived PROGRESS.md; updated README.md test count + backend note
- [x] 0.5.7 Commit + push: `docs: phase 0.5 — currency audit, slim redundant rules`

## Phase 1 — Foundation utilities
- [x] 1.1 Create `assets/js/dom.js` (esc, byId, setText, setHTML, on)
- [x] 1.2 Create `assets/js/motion.js` (prefersReducedMotion)
- [x] 1.3 Create `assets/js/svg.js` (SVG_NS, createSVGElement)
- [x] 1.4 Create `assets/js/css-vars.js` (cssVar)
- [x] 1.5 Create `tests/dom-utils.test.js`; tests green
- [x] 1.6 Replace inline copies in `page-home.js` + SVG_NS import
- [x] 1.7 Replace inline copies in `page-finances.js` + SVG_NS_F alias import
- [x] 1.8 Replace inline copies in `page-outreach.js`
- [x] 1.9 Replace inline copies in `page-area-detail.js`
- [x] 1.10 Replace inline copies in `page-areas.js`
- [x] 1.11 Replace inline copies in `page-criteria.js`
- [x] 1.12 Replace inline copies in `page-house-types.js`
- [x] 1.13 Replace inline copies in `page-journey.js`
- [x] 1.14 Replace inline copies in `page-map.js`
- [x] 1.15 Replace inline copies in `page-profile.js`
- [x] 1.16 Replace inline copies in `page-profile-detail.js` (setText wrapper with '—' fallback)
- [x] 1.17 Grep verification: zero duplicate declarations outside new files ✅
- [x] 1.18 Final commit + push: phase 1 complete

## Phase 2 — Constants extraction
- [x] 2.1 Create `assets/js/intelligence-constants.js`
- [x] 2.2 Create `assets/js/flow-constants.js`
- [x] 2.3 Replace magic numbers in `affordability.js`; commit + push
- [x] 2.4 Replace `LADDER_*` / `FLOW_PALETTE` in `page-home.js`; commit + push
- [x] 2.5 Replace `FLOW_PALETTE` in `page-finances.js`; commit + push

## Phase 3 — Split `page-home.js` (one commit per tile)
- [x] 3.1 Create `assets/js/dashboard/`; extract `tile-lede.js`
- [x] 3.2 Extract `tile-deposit.js`
- [x] 3.3 Extract `tile-affordability.js`
- [x] 3.4 Extract `tile-money-flow.js`
- [x] 3.5 Extract `tile-shortlist.js`
- [x] 3.6 Extract `tile-journey.js`
- [x] 3.7 Extract `tile-criteria.js`
- [x] 3.8 Slim `page-home.js` to co-ordinator (< 200 lines)

## Phase 4 — Split `page-finances.js` (one commit per chart/tile)
- [x] 4.1 Create `assets/js/finances/`; extract `chart-helpers.js`
- [x] 4.2 Extract 8 chart modules — one per commit
- [x] 4.3 Extract 7 tile modules — one per commit
- [x] 4.4 Slim `page-finances.js` to co-ordinator (< 200 lines)

## Phase 5 — Split `page-outreach.js` (one commit per feature)
- [x] 5.1 Create `assets/js/outreach/`; extract `context.js`
- [x] 5.2 Extract `grid.js`
- [x] 5.3 Extract `filters.js`
- [x] 5.4 Extract `dialog.js`
- [x] 5.5 Extract `contacts.js`
- [x] 5.6 Extract `log.js`
- [x] 5.7 Extract `toast.js`
- [x] 5.8 Slim `page-outreach.js` to co-ordinator (< 200 lines)

## Phase 6 — Split `dashboard.css` (one commit per extracted section)
- [x] 6.1 Create `assets/css/dashboard/` and `assets/css/pages/`
- [x] 6.2 Extract 7 tile CSS files — one per commit
- [x] 6.3 Extract 7 page CSS files — one per commit
- [x] 6.4 Slim `dashboard.css` to `@import` entry shell
- [ ] 6.5 Developer visual eyeball on every page; record pass in checklist

## Phase 7 — `data-sync.html` extraction
- [x] 7.1 Extract `<style>` to `assets/css/pages/data-sync.css`; commit + push
- [x] 7.2 Extract `<script>` to `assets/js/page-data-sync.js`; commit + push
- [x] 7.3 (Optional) refactor new JS to use `dom.js` helpers
- [ ] 7.4 Developer smoke-checks page

## Phase 8 — `about-search.html` inline-handler removal
- [x] 8.1 Remove `onclick=` attributes; add listeners in module; commit + push

## Phase 9 — Naming polish
- [x] 9.1 Audit `supabase-types.ts` location
- [x] 9.2 Confirm `page-profile.js` vs `page-profile-detail.js`
- [x] 9.3 Folder hygiene sweep
- [x] 9.4 Commit + push

## Phase 11 — Post-refactor doc reconciliation
- [x] 11.1 Re-read every doc file against final state
- [x] 11.2 Update `CLAUDE.md §16` guard-rail list
- [x] 11.3 Add `CLAUDE.md §19` "Module layout (post-refactor)"
- [x] 11.4 Update `README.md` module map
- [x] 11.5 Update `docs/PLAN.md` foot with refactor completion note
- [x] 11.6 Create `docs/REFACTOR_NOTES.md` archaeology summary
- [x] 11.7 Archive `REFACTOR_CHECKLIST.md` and `REFACTOR_PLAN.md` to `docs/archive/`
- [x] 11.8 Final commit + push: `docs: phase 11 — post-refactor reconciliation`

---

## Session log
- 2026-05-27 — Phase 0 complete: characterization tests (174/174), REFACTOR_PLAN.md + REFACTOR_CHECKLIST.md created
- 2026-05-27 — Phase 0.5 complete: doc audit, 4 CLAUDE.md fixes, PLAN.md v2-complete note, PROGRESS.md archived, README updated
- 2026-05-27 — Phase 1 complete: dom.js/motion.js/svg.js/css-vars.js created; 11 page modules updated; 10 esc/$/SVG_NS duplicates eliminated; 184/184 tests
- 2026-05-27 — Phase 2 complete: intelligence-constants.js + flow-constants.js; FLOW_PALETTE/LADDER_RANGE/LTI_BANDS/etc extracted; 184/184 tests
- 2026-05-27 — Phase 3 complete: 12 dashboard tile modules; page-home.js → coordinator
- 2026-05-27 — Phase 4 complete: 8 finance section modules; page-finances.js → coordinator
- 2026-05-27 — Phase 5 complete: 8 outreach modules; page-outreach.js → coordinator
- 2026-05-27 — Phase 6 complete: dashboard.css split into @import shell + per-tile/page partials
- 2026-05-27 — Phase 7 complete: data-sync.html style+script extracted; dom.js helpers applied; 184/184 tests
- 2026-05-27 — Phase 8 complete: about-search.html onclick= removed; page-about-search.js module created
- 2026-05-27 — Phase 9 complete: 5 phase-numbered CSS files renamed; supabase-types.ts + profile naming confirmed
- 2026-05-27 — Phase 11 complete: CLAUDE.md §16+§19 updated, README test count, PLAN.md note, REFACTOR_NOTES.md; files archived
