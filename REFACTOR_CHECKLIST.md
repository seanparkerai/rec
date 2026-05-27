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
- [ ] 3.1 Create `assets/js/dashboard/`; extract `tile-lede.js`
- [ ] 3.2 Extract `tile-deposit.js`
- [ ] 3.3 Extract `tile-affordability.js`
- [ ] 3.4 Extract `tile-money-flow.js`
- [ ] 3.5 Extract `tile-shortlist.js`
- [ ] 3.6 Extract `tile-journey.js`
- [ ] 3.7 Extract `tile-criteria.js`
- [ ] 3.8 Slim `page-home.js` to co-ordinator (< 200 lines)

## Phase 4 — Split `page-finances.js` (one commit per chart/tile)
- [ ] 4.1 Create `assets/js/finances/`; extract `chart-helpers.js`
- [ ] 4.2 Extract 8 chart modules — one per commit
- [ ] 4.3 Extract 7 tile modules — one per commit
- [ ] 4.4 Slim `page-finances.js` to co-ordinator (< 200 lines)

## Phase 5 — Split `page-outreach.js` (one commit per feature)
- [ ] 5.1 Create `assets/js/outreach/`; extract `context.js`
- [ ] 5.2 Extract `grid.js`
- [ ] 5.3 Extract `filters.js`
- [ ] 5.4 Extract `dialog.js`
- [ ] 5.5 Extract `contacts.js`
- [ ] 5.6 Extract `log.js`
- [ ] 5.7 Extract `toast.js`
- [ ] 5.8 Slim `page-outreach.js` to co-ordinator (< 200 lines)

## Phase 6 — Split `dashboard.css` (one commit per extracted section)
- [ ] 6.1 Create `assets/css/dashboard/` and `assets/css/pages/`
- [ ] 6.2 Extract 7 tile CSS files — one per commit
- [ ] 6.3 Extract 7 page CSS files — one per commit
- [ ] 6.4 Slim `dashboard.css` to `@import` entry shell
- [ ] 6.5 Developer visual eyeball on every page; record pass in checklist

## Phase 7 — `data-sync.html` extraction
- [ ] 7.1 Extract `<style>` to `assets/css/pages/data-sync.css`; commit + push
- [ ] 7.2 Extract `<script>` to `assets/js/page-data-sync.js`; commit + push
- [ ] 7.3 (Optional) refactor new JS to use `dom.js` helpers
- [ ] 7.4 Developer smoke-checks page

## Phase 8 — `about-search.html` inline-handler removal
- [ ] 8.1 Remove `onclick=` attributes; add listeners in module; commit + push

## Phase 9 — Naming polish
- [ ] 9.1 Audit `supabase-types.ts` location
- [ ] 9.2 Confirm `page-profile.js` vs `page-profile-detail.js`
- [ ] 9.3 Folder hygiene sweep
- [ ] 9.4 Commit + push

## Phase 11 — Post-refactor doc reconciliation
- [ ] 11.1 Re-read every doc file against final state
- [ ] 11.2 Update `CLAUDE.md §16` guard-rail list
- [ ] 11.3 Add `CLAUDE.md §19` "Module layout (post-refactor)"
- [ ] 11.4 Update `README.md` module map
- [ ] 11.5 Update `docs/PLAN.md` foot with refactor completion note
- [ ] 11.6 Create `docs/REFACTOR_NOTES.md` archaeology summary
- [ ] 11.7 Archive `REFACTOR_CHECKLIST.md` and `REFACTOR_PLAN.md` to `docs/archive/`
- [ ] 11.8 Final commit + push: `docs: phase 11 — post-refactor reconciliation`

---

## Session log
- 2026-05-27 — Phase 0 complete: characterization tests (174/174), REFACTOR_PLAN.md + REFACTOR_CHECKLIST.md created
- 2026-05-27 — Phase 0.5 complete: doc audit, 4 CLAUDE.md fixes, PLAN.md v2-complete note, PROGRESS.md archived, README updated
- 2026-05-27 — Phase 1 complete: dom.js/motion.js/svg.js/css-vars.js created; 11 page modules updated; 10 esc/$/SVG_NS duplicates eliminated; 184/184 tests
- 2026-05-27 — Phase 2 complete: intelligence-constants.js + flow-constants.js; FLOW_PALETTE/LADDER_RANGE/LTI_BANDS/etc extracted; 184/184 tests
