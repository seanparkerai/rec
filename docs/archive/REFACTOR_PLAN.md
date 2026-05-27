# `rec` — Comprehensive Refactoring Plan & Operating Guide for Claude

> A full sweep of the `seanparkerai/rec` codebase, an evidence-based plan to clean it up, and an
> operating manual that gives any future Claude session enough context to execute each phase
> correctly without re-discovering the rules.

**Audit date:** 27 May 2026  
**Audit scope:** every file in `main` at the time of writing  
**Status:** Phase 0 complete — see `REFACTOR_CHECKLIST.md` for live progress

---

## 0 · How to use this document

1. **Part A — Context for Claude.** Non-negotiable facts about this project.
2. **Part B — The Audit.** What was found in the repo, with numbers.
3. **Part C — The Phased Plan.** Eleven phases sequenced by risk and dependency.
4. **Part D — Per-phase prompt cards.** Copy-paste prompts for each phase.
5. **Part E — Best-practice reference card.** Condensed checklist from Anthropic's May 2026 guidance.
6. **Part F — Addendum: documentation currency & resume-safe checklist discipline.**

Phases are independent enough to execute out of order **if** you respect the dependency lines.
**Phase 0 (safety net) must run before everything else.**

---

# PART A — Context for Claude

## A.1 What `rec` actually is

- **Zero-build static web app.** Plain HTML, CSS, vanilla JS modules. Libraries via CDN.
- **Served from GitHub Pages**, auto-deployed on push to `main`.
- **Data is JSON in `data/`**, user edits persisted via `assets/js/storage.js` (Supabase + localStorage write-through cache).
- **The dashboard is the product.** `index.html` is a 7-tile bento for UK first-time buyers.
- **Backend is Supabase**, accessed via MCP. User-state lives in Supabase; content lives in repo JSON.

## A.2 Guard rails — files NEVER touched by a refactor

`CLAUDE.md §16` declares these out-of-scope for feature work and for every refactor phase:

```
assets/css/tokens.css           ← design tokens
assets/js/storage.js            ← Supabase storage layer
assets/js/config.js             ← base-URL helper
assets/js/data-loader.js        ← cached JSON loader
assets/js/finances.js           ← pure finance calcs
data/schema/area.schema.json    ← canonical area shape
.github/workflows/*             ← CI / deploy
```

If a phase appears to require a change to any of these: **stop, surface it, re-plan.**

## A.3 Operating rules (short version)

- Commit + push directly to the active branch after every phase/sub-step.
- Run `node tools/run-intelligence-tests.mjs` before every commit.
- Read large files in chunks of ≤200 lines.
- No inline styles in HTML. No inline event handlers. No hard-coded hex in component CSS.
- Pure modules (`finances.js`, `affordability.js`, `format.js`, etc.) stay DOM-free.
- MCP-first Supabase sync — see `CLAUDE.md §18`.

## A.4 The refactor philosophy

Refactoring is **behaviour-preserving by definition.** Every phase is one of: Extract, Split, Rename, Move. This plan does NOT introduce a build step, framework, new data model, new features, or touch guard-railed files.

---

# PART B — The audit

## B.1 Headline metrics (at audit date)

| Class | Files | Total LOC |
|---|---|---|
| JavaScript (`assets/js/*.js`) | 28 | 6,657 |
| CSS (`assets/css/**/*.css`) | 17 | 3,218 |
| HTML pages (`pages/*.html` + `index.html`) | 16 | 3,774 |
| Per-area data JSON (`data/areas/*.json`) | 195 | n/a |
| Tools (`tools/*.mjs`) | 13 | ~1,800 |
| Tests (`tests/*`) | 13 | ~1,200 |

## B.2 The ten files that drive the refactor

| Rank | File | LOC | Verdict |
|---|---|---|---|
| 1 | `data/areas.json` | 4,073 | Generated index — leave alone |
| 2 | `pages/data-sync.html` | 1,662 | **HOTSPOT** — 610 lines inline CSS, 718 lines inline JS |
| 3 | `assets/css/dashboard.css` | 1,525 | **Split candidate** |
| 4 | `assets/js/page-home.js` | 1,022 | **Split candidate** |
| 5 | `assets/js/page-finances.js` | 879 | **Split candidate** |
| 6 | `data/outreach-templates.json` | 824 | Data — leave alone |
| 7 | `assets/js/page-outreach.js` | 650 | **Split candidate** |

## B.3 Duplication map

### B.3.1 `esc()` — HTML escape helper

Found verbatim in **11 files** (all page-*.js modules). All copies byte-identical.

### B.3.2 `$()`, `setText()`, `setHTML()` — DOM micro-utilities

`const $ = (id) => document.getElementById(id)` — **8+ files**. `setText`/`setHTML` in 3 files with subtle behavioural drift.

### B.3.3 `prefersReducedMotion()`, `cssVar()`, `SVG_NS_F`

`prefersReducedMotion` — 2 files. `cssVar` — 1 file currently, pattern will spread. `SVG_NS_F` — 1 file, named inconsistently.

## B.4 Inline-style and inline-script violations

- `pages/data-sync.html` — 610 lines inline `<style>`, 718 lines inline `<script type="module">`. Largest violation by an order of magnitude.
- `pages/about-search.html` — two `onclick=` attributes.

## B.5 Magic constants inside JS modules

- `FLOW_PALETTE` — duplicated in `page-home.js` and `page-finances.js`.
- LISA cap (450000), LTV tiers, income multiples — literals in `affordability.js` and `page-home.js`.

## B.6 What the codebase does well

- `assets/js/format.js` — clean, pure, JSDoc'd. Template for new modules.
- `assets/js/config.js` — perfect single-responsibility module.
- `assets/css/tokens.css` — OKLCH-based, project-prefixed tokens.
- `CLAUDE.md` — plan-mode contract, guard rails, MCP-first sync.
- Per-area JSON with schema validator.
- 174-test harness (as of Phase 0).

---

# PART C — The phased plan

## C.0 Module dependency graph (target state)

```
pure modules (no DOM, importable by Node tests)
  config.js | format.js | intelligence-constants.js (NEW)
  finances.js | affordability.js | money-flow.js
  savings-velocity.js | savings-series.js | finance-derive.js
  deposit-risk.js | investment-performance.js | outreach-renderer.js

browser-only utility modules (NEW)
  dom.js        ← esc, byId, setText, setHTML, on
  motion.js     ← prefersReducedMotion
  svg.js        ← SVG_NS, createSVGElement
  css-vars.js   ← cssVar

data + auth
  data-loader.js | storage.js | supabase-client.js | auth-guard.js

page-level co-ordinators (SLIM)
  page-home.js | page-finances.js | page-outreach.js | ...

tile / feature modules (NEW dirs)
  dashboard/tile-*.js
  finances/{tile,chart}-*.js
  outreach/*.js
```

---

## Phase 0 — Safety net (characterization tests) ✅ COMPLETE

**Status:** 174/174 tests passing (40 new characterization tests added).

Files created: `tests/characterization-home.test.js`, `tests/characterization-finances.test.js`,
`tests/characterization-outreach.test.js`.

Registered in `tools/run-intelligence-tests.mjs`.

---

## Phase 0.5 — Documentation audit

**Goal.** Audit all supporting docs against current reality. Default direction: **delete, not add.**

**Why now.** Before any code changes, so Claude operates under clean, current rules.

**Files to audit.**
```
CLAUDE.md | DESIGN.md | README.md | PROGRESS.md
docs/PLAN.md | docs/CHECKLIST.md | docs/CONTEXT.md | docs/ROADMAP.md
docs/AREAS.md | docs/DATA_MODEL.md | docs/INTELLIGENCE_RULES.md
docs/SUPABASE_MIGRATION.md | docs/SUPABASE_SYNC.md | docs/USER_PROFILE.md
docs/STRICT_Codex_Prompt_Remaining_Areas.md
```

**Audit questions for every file:**
1. Is every rule still true?
2. Is any rule preventing legitimate edits? (Scrutinise `CLAUDE.md §16` specifically.)
3. Is the rule covered elsewhere (duplication)?
4. Is the file overpacked (> 200 lines and hard to absorb)?
5. Is the file still load-bearing, or is it a session artefact?
6. Does it use sharp, measurable phrasing (not vague)?

**Known concerns:**
- `CLAUDE.md §16` — some guard rails may be overly restrictive now that the codebase has stabilised.
- `CLAUDE.md §6` — "run sync test separately" duplicates `run-intelligence-tests.mjs` which already includes it.
- `docs/PLAN.md` — v2 has shipped; completed phases should move to archive.
- `PROGRESS.md` — session log; archive it.

**Hard constraint.** Slim-only. No additions to `CLAUDE.md`/`DESIGN.md` here (that's Phase 11).

**Acceptance.** `docs/audit-notes.md` written; `CLAUDE.md` line count ≤ current; every §16 entry justified or removed. Tests still green.

**Commit message.** `docs: phase 0.5 — currency audit, slim redundant/stale rules`

---

## Phase 1 — Foundation utilities

**Goal.** Create `dom.js`, `motion.js`, `svg.js`, `css-vars.js`; replace 11 inline copies of `esc`, `$`, `setText`, `setHTML`, `prefersReducedMotion`, `cssVar`, `SVG_NS`.

**Dependencies.** Phase 0 must be green.

**Files to create.**
```
assets/js/dom.js       ← esc, byId, setText, setHTML, on
assets/js/motion.js    ← prefersReducedMotion
assets/js/svg.js       ← SVG_NS, createSVGElement
assets/js/css-vars.js  ← cssVar
tests/dom-utils.test.js
```

**`dom.js` template.**
```javascript
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
export const byId = (id, root = document) =>
  (root === document ? document.getElementById(id) : root.querySelector('#' + id));
export function setText(id, value, opts = {}) {
  const el = byId(id);
  if (!el) return;
  if (opts.clearLoading !== false) delete el.dataset.loading;
  el.textContent = (value === null || value === undefined || value === '')
    ? (opts.fallback ?? '') : String(value);
}
export function setHTML(id, html, opts = {}) {
  const el = byId(id);
  if (!el) return;
  if (opts.clearLoading !== false) delete el.dataset.loading;
  el.innerHTML = html;
}
export const on = (el, evt, fn, opts) => el?.addEventListener(evt, fn, opts);
```

**Files to modify.** All 11 page modules: replace local `esc`/`$`/`setText`/`setHTML`/`prefersReducedMotion`/`cssVar`/`SVG_NS_F` with imports.

Import pattern:
```javascript
import { esc, byId as $, setText, setHTML, on } from './dom.js';
import { prefersReducedMotion } from './motion.js';
import { SVG_NS, createSVGElement } from './svg.js';
import { cssVar } from './css-vars.js';
```

**Execution order.** One file per commit. Run tests after each.

**Acceptance.**
- `node tools/run-intelligence-tests.mjs` green at every step.
- `grep -rn "const esc = " assets/js/ | grep -v dom.js` → empty.
- `grep -rn "const \$ = " assets/js/ | grep -v dom.js` → empty.

**Commit message format.** `refactor(utils): phase 1.<n> — replace local copies in <file>`

**Out of scope.** Any §16 file. Module splits (Phases 3–5).

---

## Phase 2 — Constants extraction

**Goal.** Extract `FLOW_PALETTE` (duplicated in `page-home.js` + `page-finances.js`) and the LISA cap / LTV tier / income multiple literals (in `affordability.js` + `page-home.js`) into shared files.

**Dependencies.** Phase 1 helpful but not required.

**Files to create.**
```
assets/js/intelligence-constants.js   ← LISA_CAP, LTV_TIERS, INCOME_MULTIPLE, LADDER, etc.
assets/js/flow-constants.js           ← FLOW_PALETTE, FLOW_ORDER
```

**Files to modify.** `affordability.js`, `page-home.js`, `page-finances.js`.

**Acceptance.** `grep -n "450000\|4\.5\|5\.5" assets/js/affordability.js` → only in imports/comments.

**Commit message.** `refactor(constants): phase 2 — extract intelligence + flow constants`

---

## Phase 3 — Split `page-home.js` into dashboard tile modules

**Goal.** Turn `page-home.js` (1,022 lines) into a thin co-ordinator (~150 lines) plus 7 tile modules under `assets/js/dashboard/`.

**Dependencies.** Phases 0 and 1.

**Files to create.**
```
assets/js/dashboard/tile-lede.js
assets/js/dashboard/tile-deposit.js
assets/js/dashboard/tile-affordability.js
assets/js/dashboard/tile-money-flow.js
assets/js/dashboard/tile-shortlist.js
assets/js/dashboard/tile-journey.js
assets/js/dashboard/tile-criteria.js
```

**Pattern.** Each tile exports a single `render*(state)` function. `page-home.js` becomes imports + state load + dispatch.

**Execution order.** One tile per commit. Characterization tests must stay green after each.

**Acceptance.** `wc -l assets/js/page-home.js` < 200. All 7 tile files exist.

**Commit message format.** `refactor(home): phase 3.<n> — extract <tile> to dashboard/tile-<name>.js`

---

## Phase 4 — Split `page-finances.js`

**Goal.** Split 879-line `page-finances.js` into `assets/js/finances/` — 7 tile modules + 8 chart modules + chart helpers.

**Dependencies.** Phases 0, 1, 2.

**Key concern.** Chart instance lifecycle: each chart module owns `let _chart = null;` and exposes `destroy()`.

**Files to create.** `chart-helpers.js`, `tile-flow-now.js`, `tile-flow-later.js`, `tile-affordability-widget.js`, `tile-deposit-risk.js`, `tile-isa-attribution.js`, `tile-breakdowns.js`, `tile-headline.js`, and 8 chart modules.

**Commit message format.** `refactor(finances): phase 4.<n> — extract <feature> to finances/<file>.js`

---

## Phase 5 — Split `page-outreach.js`

**Goal.** Split 650-line `page-outreach.js` into `assets/js/outreach/` — grid, filters, dialog, contacts, log, context, toast.

**Dependencies.** Phases 0, 1.

**Commit message format.** `refactor(outreach): phase 5.<n> — extract <feature> to outreach/<file>.js`

---

## Phase 6 — Split `dashboard.css`

**Goal.** Turn 1,525-line `dashboard.css` into a thin `@import` entry shell plus per-tile and per-page component files.

**Dependencies.** None (CSS is decoupled). Best after Phase 3 (JS tile boundaries clarify CSS ownership).

**Important.** Move-only. No selector rewrites. Visual output must be byte-identical.

**Execution order.** One section per commit. Developer reloads page after each.

---

## Phase 7 — `pages/data-sync.html` extraction

**Goal.** Extract 610-line inline `<style>` to `assets/css/pages/data-sync.css` and 718-line inline `<script>` to `assets/js/page-data-sync.js`.

**Exception.** The 4-line pre-paint FOUC shim `<script>` stays inline.

**Commit messages.**
```
refactor(data-sync): phase 7.1 — extract <style> to assets/css/pages/data-sync.css
refactor(data-sync): phase 7.2 — extract <script> to assets/js/page-data-sync.js
```

---

## Phase 8 — `about-search.html` inline-handler removal

**Goal.** Remove `onclick=` attributes from `pages/about-search.html`; bind listeners in the JS module.

**Acceptance.** `grep -rn "onclick=" pages/ index.html` → empty.

---

## Phase 9 — Naming and consistency sweep

**Targets.** `supabase-types.ts` location; `page-profile.js` vs `page-profile-detail.js` audit; folder hygiene (`data/source/` → `tools/source/`).

---

## Phase 11 — Post-refactor doc reconciliation

**Goal.** Update all docs to match the new structure. Add `CLAUDE.md §19` "Module layout". Archive this checklist and plan.

---

# PART D — Per-phase prompt cards

## D.0 — Master prompt (read first in every session)

```
Read REFACTOR_PLAN.md in full. Then read CLAUDE.md in full.
Before writing any code:
1. Confirm Phase 0 is on the branch. If not, run it first.
2. Run node tools/run-intelligence-tests.mjs — must be green.
3. Recite: (a) which phase, (b) which files to edit, (c) which are out of scope per §16.
4. ONE atomic change per commit. Run tests after each. Push.
If anything requires a §16 guard-railed file, stop and surface it.
```

## D.1 — Phase 0 prompt (DONE)

Phase 0 is complete (174/174 tests). Skip to Phase 0.5.

## D.2 — Phase 0.5 prompt

```
Execute Phase 0.5 of REFACTOR_PLAN.md: documentation audit.
- Read every file listed in Part C §Phase 0.5 end-to-end.
- Write docs/audit-notes.md answering the 6 audit questions per file.
- For CLAUDE.md §16: justify each guard rail in one sentence or remove it.
- Apply slim-only edits: delete redundant/stale/duplicated content.
- DO NOT add to CLAUDE.md or DESIGN.md (that is Phase 11).
- Tests must still be green.
Commit: docs: phase 0.5 — currency audit, slim redundant/stale rules
Out of scope: any code change, any tokens.css change.
```

## D.3 — Phase 1 prompt

```
Execute Phase 1 of REFACTOR_PLAN.md: extract dom.js, motion.js, svg.js, css-vars.js.
Phase 0 must be green. Verify first.
- esc must be byte-identical to existing inline copies.
- byId(id, root = document) replaces both getElementById and ROOT.querySelector variants.
- setText/setHTML: opts.clearLoading (default true), opts.fallback (default '').
- One file replacement per commit. Run characterization tests after each.
Commit per file: refactor(utils): phase 1.<n> — replace local copies in <file>
Out of scope: §16 files, module splits.
```

---

# PART E — Best-practice reference card

## E.1 The refactoring fundamentals

1. **Characterization tests first.** ✅ Done (Phase 0).
2. **Find seams.** Modules, function boundaries, exported symbols.
3. **Small reversible steps.** Each commit must compile and test green.
4. **No two-codebase periods.** Don't leave two equivalent paths in the tree.
5. **Behaviour preservation is the definition of refactoring.**

## E.2 The `rec`-specific dos and don'ts

**Do:**
- Run tests before every commit.
- Commit + push after every sub-step.
- Hand the visual pass to the developer with a one-line note.
- Read `CLAUDE.md` at the start of every session.

**Don't:**
- Touch any §16 file outside its own dedicated phase.
- Introduce a build step.
- Render UI from a pure module.
- Add a new font.
- Hard-code hex in component CSS.
- Use `:focus` (use `:focus-visible`).

## E.3 The single hardest thing

The temptation to fix things while you're in there. **Resist.** Write any bugs you spot in `docs/REFACTOR_NOTES.md` and fix them in a separate commit after the refactor lands.

---

# PART F — Addendum: documentation currency & resume-safe checklist discipline

## F.1 Cross-cutting requirement

Every phase ends with:
1. `node tools/run-intelligence-tests.mjs` — must be green.
2. `REFACTOR_CHECKLIST.md` updated (tick just-completed step; set "Resume here").
3. `git add && git commit && git push`.
4. Verify push landed: `git log -1 --oneline origin/<branch>`.

**A phase is not "done" until the checklist update is on the branch.**

## F.2 Resume protocol — first 60 seconds of every fresh session

1. Read `REFACTOR_CHECKLIST.md` — the "Resume here" block.
2. `git log --oneline -5` — confirm matches checklist.
3. `git status` — working tree must be clean.
4. `node tools/run-intelligence-tests.mjs` — must be green.
5. Read the relevant Phase section in this file.
6. Read `CLAUDE.md`.
7. Begin the literal next action in the "Resume here" block.

If steps 1–4 surface a discrepancy: **fix it first, then proceed.**

## F.3 The anti-pattern this section exists to prevent

A session ends mid-phase with green tests locally but no push. The next session pulls stale state, redoes work or skips ahead, then collides with dangling commits hours later. The mitigation: **no sub-step is done until pushed.**
