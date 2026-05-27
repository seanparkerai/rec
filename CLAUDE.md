# CLAUDE.md — Operating Rules for this Repository

This file governs how Claude (and any AI assistant) works in this repo. Read it at the **start of every
session**. These rules exist to keep work safe, resumable, and high quality.

## 1. Branching & commits
- Work and commit **directly to `main`**. Do **not** create sub-feature branches for this project.
- **Commit + push after every major step** (e.g. after each checklist phase or content batch) so any new
  chat can resume from a known-good state.
- Use clear, descriptive commit messages.

## 2. Area content — per-area JSON files (IMPORTANT)
- Area data is split: `data/areas.json` is the **lightweight directory index**;
  the full per-area record (overview, character, schools, prices, sources…) lives
  at **`data/areas/<id>.json`**, one file per area.
- When researching or revising an area, **edit `data/areas/<id>.json` directly** with
  the `Write` tool (one file at a time keeps diffs reviewable). Do **not** paste
  content into `data/areas.json`, and do **not** resurrect `docs/Areadetails.md`
  (now archived under `docs/archive/`).
- The canonical shape lives at `data/schema/area.schema.json` and is enforced by
  `validateAreaDetail()` in `tests/schemas.js`. Set `status` on every save:
  `directory` → `stub` → `drafted` → `partial` → `researched`.
- After editing detail files, optionally run `node tools/build-areas.mjs` — it
  reads per-area files as the source of truth and rebuilds the index from them.

### Other large content writes
- For any other large block being added to an already-large file, do **not** paste
  inline. Write the block to a temp file and use the splice helper:
  ```bash
  node tools/insert-content.mjs --target <file> --content <tempfile> --marker "<!-- SLOT:x -->" --mode before
  ```
- Delete temp files after a successful splice.

## 3. Reading large files
- Read large files in **chunks of ≤200 lines** (use `offset`/`limit`), not all at once.

## 4. Start-of-cycle scan
- At the **start of any work session**, summarise current repo + relevant file state before editing
  (use a cheap/fast model or subagent scan). Then read `docs/CHECKLIST.md` to find the next task.

## 5. Checklist discipline
- Keep `docs/CHECKLIST.md` in lockstep with `docs/PLAN.md`.
- Tick items as you complete them and **commit** so progress is never lost.

## 6. Testing & regression
- Keep the `tests/` harness current. **Run `node tools/run-intelligence-tests.mjs` after changes and before committing.** This single command runs all intelligence tests + the Supabase sync tests.
- Add/extend benchmark tests (calculators, JSON schemas) as features grow so regressions surface early.
- **Supabase sync tests are non-negotiable** for commits touching data, schema, or `assets/js/storage.js`. They are included in the unified harness above. The harness asserts: (a) every content file in `data/areas/*.json` has a row in the `areas` mirror table with a fresher-or-equal `updated_at`; (b) every user-state table has a non-null row for the active household (or is intentionally empty per schema defaults); (c) no localStorage-only data type exists outside the documented set in §18.

## 7. Content accuracy & imagery
- Write area/house content **only after detailed, place-specific and type-specific web searches**
  (exact place name + exact property type). Record sources in each record's `sources[]`.
- Use **only openly-licensed images** (Wikimedia Commons, Geograph CC, Unsplash, official tourism),
  **downloaded** into `assets/img/{areas,house-types}/`, with `credit` + `licence` recorded in the JSON.
- Never hotlink unattributed copyrighted search-engine images.

## 8. Resume protocol (start here in a fresh chat)

**Step 0 is mandatory and comes before everything else.** See §18 for the full Supabase sync contract.

0. **MCP-first Supabase freshness check.** Before any session that edits data, schema, or user-state, call the Supabase MCP connector (skip for pure code refactors that touch no data):
   - `mcp__supabase__list_tables` — confirm all 10 tables exist with RLS enabled.
   - `mcp__supabase__execute_sql` against the freshness view (or run
     `node tools/check-supabase-freshness.mjs`) to fetch `MAX(updated_at)` per table.
   - Compare to `data/snapshots/sync-state.json` (the locally-cached snapshot of last-known timestamps).
     If Supabase is fresher for any user-state table (the user has been editing in the portal), **pull
     that row via `execute_sql`** and update both the snapshot and the cached repo overlay. Surface the
     diff to the user in one short line before continuing.
1. **Run `node tools/area-status.mjs`** — prints which areas are `researched` /
   `partial` / `stub` and exactly which fields are missing per area. Use
   `--missing` to filter to incomplete areas and `--id <area-id>` to inspect one.
   This is the canonical view of research progress and the next-to-do queue.
2. Read `docs/CHECKLIST.md` (what's done / next) and `docs/PLAN.md` (master plan)
   + `docs/CONTEXT.md` (research facts) + `docs/SUPABASE_SYNC.md` (sync contract).
3. Run a Haiku scan of any files you'll touch.
4. Run the test harness (`node tools/run-intelligence-tests.mjs` **and** the sync test in §6).
5. Continue at the **first unchecked** checklist item — or, for area research,
   the next `partial` or `directory` area surfaced by `area-status.mjs`.

## Project shape (quick reference)
- Zero-build static site: plain HTML + CSS + vanilla JS, all libraries via CDN.
- Shared shell via fetch-injected partials (`components/`), styled with Pico CSS + tokens.
- Data as JSON in `data/`, user edits persisted via `assets/js/storage.js` (localStorage write-through cache backed by Supabase).
- Hosted on **GitHub Pages** (deploy on push to `main`). Preview locally with `python3 -m http.server`.

---

## 9. Design quality (front-end)

This project commits to a single visual direction: **"calm precise editorial"** — restrained palette,
generous whitespace, deliberate typography, no AI-generic patterns. Every UI change must reinforce that
direction; if it doesn't, refactor before commit. The full visual contract — anchors, tokens, fonts,
bans, verification — lives in **`DESIGN.md`** at the repo root. Read it before any UI change and name
the relevant anchor (*Stripe-docs* or *Linear-dense*) in the commit message.

- **Banned patterns (do not ship)** — purple gradients on white, uniform shadow-floated SaaS cards in a
  uniform grid, centred hero with a single drop-shadowed CTA, emoji used as icons, generic stock-photo
  heroes, seven-pastel palettes, hover micro-interactions on every element, drop-shadow-as-decoration.
- **Type** — fluid, modular via `clamp(min, preferred, max)`; **one** ratio (1.250 minor third). No fixed
  `px` font sizes. **Never** default to Inter, Roboto, Arial, Open Sans, Lato or system-ui — pick one
  display + one body face per project and record both here.
- **Spacing** — strict 4 px base scale only: `0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 / 3 / 4 / 6 rem`
  (4/8/12/16/24/32/48/64/96 px). Use the `--space-*` tokens; no arbitrary `padding: 13px`.
- **Colour** — dominant + a single accent; never a flat palette of evenly-distributed pastels. All colour,
  spacing, radius and z-index values are CSS custom properties on `:root` in `tokens.css`. **Never** hard-code
  hex inside component CSS.
- **Focus** — a single `--focus-ring` token with ≥3:1 contrast against both adjacent colours; applied via
  `:focus-visible` (never `:focus`).
- **Motion** — at most one orchestrated reveal per page, CSS-only. Honour `prefers-reduced-motion: reduce`
  with a global rule that disables/shortens animations and transitions.
- **Match complexity to direction** — minimal direction = restraint, precision, careful spacing; do not
  add elaborate effects to a minimal aesthetic.

## 10. Mobile-first & responsive

- **Mobile-first** — write the 320–480 px layout first, then progressively enhance. Never start at desktop
  and shrink.
- **Breakpoints** — content-driven; standardise on **480 / 768 / 1024 / 1280 px**. Add a new one only when
  content actually breaks.
- **Touch targets** — interactive elements ≥**44×44** CSS px (or ≥24×24 with ≥24 px spacing per WCAG 2.2
  SC 2.5.8 — the absolute floor).
- **Safe-area insets** — every fixed/sticky top or bottom bar uses
  `padding-top: max(<scale>, env(safe-area-inset-top))` (and matching `-bottom` / `-left` / `-right`).
- **Primary actions on mobile** — sticky bottom bar in the thumb zone, not buried at the top of a form.
- **Horizontal scroll** — never on the page itself at 320 px width (assert in tests). Where intentional
  (nav, chip rows), show an overflow fade and use `scroll-snap-type: x mandatory`.
- **Full-height regions** — use `dvh` / `svh`, not `vh`, to handle mobile browser chrome.
- **Component responsiveness** — prefer container queries (`container-type: inline-size`); reserve media
  queries for page-level layout.

## 11. Accessibility (WCAG 2.2 AA — the floor, not the ceiling)

- **Contrast** — text ≥**4.5:1**; ≥**3:1** for ≥18 pt / 14 pt bold and for UI components / focus indicators.
- **Targets** — ≥24×24 with ≥24 px spacing (SC 2.5.8); 44×44 preferred.
- **Focus visible** — via `:focus-visible`; a focused element must never be hidden by a sticky bar — use
  `scroll-margin` to compensate (SC 2.4.11 Focus Not Obscured, AA).
- **Landmarks** — one `<main id="main">`, plus `<header> <nav> <footer>` on every page; include a
  skip-link to `#main` as the first focusable element.
- **Forms** — every control has a programmatically associated `<label>`; required state expressed in text
  or icon, never colour alone.
- **Colour-only information is banned** — pair every colour signal with icon, text, pattern or weight.
- **Live regions** — dynamic updates announced via `aria-live="polite"`; clear the region between
  announcements; do not combine with focus moves.
- **Motion** — honour `prefers-reduced-motion`; any animation >5 s has a pause control.
- **Keyboard** — every interactive element reachable via Tab in DOM order with Enter/Space activation;
  trap focus only inside an open `<dialog>`.
- **Native modals** — use `<dialog>`; do not use `window.confirm` / `alert` / `prompt` for production UI.

## 12. Pico CSS conventions (we use Pico v2)

- **Semantic HTML first** — reach for Pico's class-less defaults before adding a custom class.
- **Theme via variables, not source edits** — override `--pico-*` tokens in `:root` (light),
  `[data-theme="dark"]` (manual), and `@media (prefers-color-scheme: dark)` (auto).
- **Dark mode switching** — set `data-theme="dark"` on `<html>`, persisted in `localStorage`.
  Do not toggle classes.
- **Project tokens** — prefix project-specific tokens (`--rec-*`, `--space-*`, `--text-*`, `--focus-ring`)
  so they never collide with `--pico-*`.
- **Group controls** with `<fieldset role="group">` rather than building custom toolbars.
- **Do not import** Pico's coloured themes (`pico.<color>.min.css`) and then override the colour — pick one.

## 13. Verification for UI changes

There is **no screenshot / Playwright / Chromium / Lighthouse step** in this workflow. The assistant runs
in an environment without a browser, so do **not** attempt to capture screenshots, run `verify-ui.mjs`,
or render pages — and do **not** keep announcing that these are unavailable. Just verify what you can in
code and hand the visual check to the developer.

Before declaring a UI change complete:

- **Code self-review** — re-read the diff and reason through the layout/cascade: spans, grid tracks,
  specificity, token resolution. Catch the obvious breakage (collapsed grids, undefined tokens, overflow)
  by reading, since you can't see it.
- **Test harness** — `node tools/run-intelligence-tests.mjs` green before commit. The browser-side
  `tests/tests.html` (no-horizontal-scroll, no-inline-style, reachability) is run by the developer.
- **Design intent in mind** — keep contrast (4.5:1 / 3:1), reduced-motion behaviour, and the page's
  anchor (Stripe-docs / Linear-dense) correct in the markup and tokens you write.
- **Hand off the visual pass** — when a change genuinely needs eyes (spacing, alignment, colour, the feel
  of an animation), state briefly what to look at and let the developer confirm on their device. One short
  hand-off line, not a repeated disclaimer.

## 14. Plan Mode contract

Every plan — phase, sub-task, or any significant edit — must enumerate, in order:

1. **Files to edit, with the specific sections inside each.** Naming a file is not enough — name the section, function, fieldset, component, or insertion point.
2. **Order of operations** — the literal sequence of edits and supporting commands.
3. **Test impact** — which existing tests are affected, which new tests are added, how the harness is run, and whether it ran green.
4. **Explicit out-of-scope list** — files and concerns this phase will *not* touch.

If scope changes mid-execution — a new file is needed, a §16 file is touched, a refactor surfaces — **stop, surface the divergence, and re-plan**. Do not power through.

## 15. Subagent contract

Subagents are tools, not autonomous workers. The contract:

- **One level of delegation.** A subagent may not spawn further subagents. The main thread orchestrates.
- **No long-running processes.** No dev servers, watchers, or background jobs that outlive the agent's reply.
- **Reports, then exits.** Every subagent returns a single summary to the main thread; it does not commit, push, or hand off to another subagent.

## 16. Out-of-scope guard rails

The following files are **never touched** by feature work. Modifying any of them is its own phase, named and approved separately:

- `assets/css/tokens.css` — colour, type, spacing tokens.
- `assets/js/storage.js` — Supabase-backed storage layer (see §17). **Extend, do not rewrite.**
- `assets/js/config.js` — base-URL + `url()` helpers.
- `assets/js/data-loader.js` — JSON loader.
- `assets/js/finances.js` — finance calculators. **Extend, do not rewrite.**
- `assets/css/dashboard.css` — `@import` entry shell (order-sensitive); extend by appending imports only.
- `data/schema/area.schema.json` — per-area schema.
- `.github/workflows/*` — CI / deploy pipelines.

If a phase appears to require a change to any of these, stop and re-plan as a separate, named phase.

## 17. Backend: Supabase

The app uses **Supabase** for cloud storage and authentication.

- **Schema**: `supabase/schema.sql` — idempotent Postgres DDL. Run in Supabase → SQL Editor. All tables use Row Level Security.
- **Client**: `assets/js/supabase-client.js` — auto-generated by `pages/setup.html`. Exports `supabase`. **Not committed to the repo** (generated on first setup); add to `.gitignore` if you want to keep it local.
- **Storage abstraction**: `assets/js/storage.js` — the only file that calls Supabase for data. Uses a localStorage write-through cache for instant renders, then revalidates from Supabase in the background.
- **Auth guard**: `assets/js/auth-guard.js` — checks for a Supabase session on every page load; redirects to `pages/login.html` if unauthenticated.
- **Login**: `pages/login.html` — email + password form backed by `supabase.auth.signInWithPassword`.
- **Setup guide**: `pages/setup.html` — interactive 5-phase checklist for first-time setup.

### Adding a new data type

1. Add a table to `supabase/schema.sql` (with RLS policies using `is_household_member()`).
2. Apply the migration **via the Supabase MCP connector** (`mcp__supabase__apply_migration`), not by
   hand-copying SQL into the dashboard. The connector is the single, authoritative path for schema
   changes in this repo — this guarantees migration history stays aligned with the project state.
3. Add a `get<Type>()` / `save<Type>()` pair to `assets/js/storage.js` following the `_get` / `_save` pattern.
4. Do **not** call Supabase directly from any page module — go through `storage.js`.
5. Extend `tests/supabase-sync.test.js` to cover the new table (see §6).
6. Decide whether the type is **user state** (per-household, lives in Supabase as source of truth) or
   **content** (canonical in repo JSON, mirrored to Supabase) — both classifications and their sync
   directions are defined in §18 and `docs/SUPABASE_SYNC.md`.

## 18. Supabase as live database — bidirectional sync contract

Supabase is the **live source of truth** for all stateful data in this app. Two parties write to it,
and Claude MUST keep them in lockstep:

- **The user**, by logging into the deployed portal and editing values (profile, criteria, finances,
  shortlist toggles, drawn map zones, journey ticks, contacts, outreach drafts). These writes already
  flow through `assets/js/storage.js` → Supabase. Do not touch that path.
- **Claude**, by editing content (areas, house-types, checklists, outreach-templates) or by performing
  bulk updates the user has asked for (e.g. "update my finances with these figures"). Claude's writes
  MUST go through the Supabase MCP connector — never via repo JSON alone for user-state data, and
  always with a mirror push for content data.

### 18.1 Data classification

| Class | Tables / files | Source of truth | Sync direction |
|-------|----------------|-----------------|----------------|
| **User state** | `profile`, `criteria`, `finances`, `shortlist`, `zones`, `journey_checks`, `contacts`, `outreach` | **Supabase** (per household_id) | Portal write → Supabase live · Claude write → MCP `execute_sql` UPSERT · `storage.js` mirrors to localStorage for offline reads |
| **Content** | `data/areas/*.json`, `data/house-types.json`, `data/checklists.json`, `data/outreach-templates.json` | **Repo JSON** (git-versioned) | Claude edits the JSON file → immediately mirrors to a Supabase content table via MCP UPSERT · portal reads from repo first, falls back to mirror |
| **Index / derived** | `data/areas.json` (lightweight directory) | Built from content | Regenerated by `tools/build-areas.mjs`; mirrored along with content |

### 18.2 Mandatory MCP-first session start

This is the operational form of §8 Step 0. Before any edit in any session, Claude MUST:

1. Call `mcp__supabase__list_tables` to confirm the schema is intact and RLS is enabled.
2. Run `node tools/check-supabase-freshness.mjs` (or equivalent direct MCP `execute_sql`) to fetch
   `MAX(updated_at)` from every table. Compare to `data/snapshots/sync-state.json`.
3. If any **user-state** table is fresher than the snapshot, the user edited in the portal since the
   last session. Pull that row via `execute_sql`, write it into the local repo overlay
   (`data/snapshots/<table>.json`), and surface a one-line summary to the user.
4. If any **content** table is *behind* the repo JSON, that means a previous Claude session committed
   files but failed to mirror. Re-push the affected files via `execute_sql` UPSERT before doing
   anything else.

### 18.3 Mandatory MCP-first session end

Before any commit + push, Claude MUST:

1. For every **user-state** value Claude changed this session: UPSERT via `execute_sql` against the
   household_id row. Verify by re-SELECTing the row.
2. For every **content** file edited: UPSERT the JSON payload into the matching content mirror table
   (`areas`, `house_types`, `checklists`, `outreach_templates`). Verify row count + `updated_at`.
3. Update `data/snapshots/sync-state.json` with the new high-water `updated_at` for every table.
4. Run the test harness including `tests/supabase-sync.test.js`.
5. Only then `git add` + `git commit` + `git push`. The commit message MUST end with a one-line
   "Supabase: pushed N areas, M user-state rows" footer so the audit trail is visible in git log.

If any MCP write fails, the session is **incomplete**. Do not commit a half-sync. Either fix the
failure or surface it to the user before exiting.

### 18.4 User-portal writes — hands off

The portal's `assets/js/storage.js` already writes the 8 user-state tables on every save. Claude:

- Does NOT write user-state via repo JSON files. There is no `data/profile.json` overlay that overrides
  Supabase — there is only the Supabase row, fetched via `_sbGet()`.
- DOES use MCP `execute_sql` when the user instructs Claude to update their data ("update my finances
  with these figures", "set my LISA cap to £4,000"). The write goes directly to the Supabase row, not
  to a temporary JSON file.
- Verifies the write by re-SELECTing the row inside the same turn.

### 18.5 Conflict resolution

- **User state**: Supabase always wins. Claude never overwrites a user-edited row unless the user
  explicitly says "overwrite this with X". If `updated_at` is newer than what Claude expects, stop
  and ask.
- **Content**: Repo JSON always wins. The mirror is rebuilt from repo files; the mirror is never
  edited via the Supabase dashboard. If drift is detected, the mirror is re-pushed from repo.
- **Schema**: All DDL goes through `mcp__supabase__apply_migration`. Never edit the schema in the
  Supabase web dashboard — the migration history is the source of truth.

### 18.6 What "always use the connector" means in practice

- Claude reads schema state via `mcp__supabase__list_tables` — not by reading `supabase/schema.sql` and
  trusting it.
- Claude reads user data via `mcp__supabase__execute_sql` — not by reading localStorage exports.
- Claude applies DDL via `mcp__supabase__apply_migration` — not by hand-pasting SQL.
- Claude does NOT bypass MCP "to save time". A skipped MCP call is a sync bug waiting to happen and
  will fail the §6 sync tests at commit time.

### 18.7 Pending content-mirror schema work

The content mirror tables (`areas`, `house_types`, `checklists`, `outreach_templates`) are not yet in
`supabase/schema.sql`. Phase 10 in `docs/CHECKLIST.md` covers adding them via
`mcp__supabase__apply_migration`, backfilling from repo JSON, and wiring the sync verification test.
Until that phase ships, content edits remain repo-JSON-only; the §18.2/§18.3 mirror steps activate
once the migration is in place. Session-start freshness checks against user-state tables apply
immediately.

## 19. Module layout (post-refactor)

After the 2026-05 refactor (Phases 0–9), the JS and CSS are split as follows.

### `assets/js/` — flat utilities
| File | Purpose |
|------|---------|
| `dom.js` | `byId`, `setText`, `setHTML`, `on`, `esc` — DOM micro-utilities |
| `motion.js` | `prefersReducedMotion()` helper |
| `svg.js` | `SVG_NS`, `createSVGElement` |
| `css-vars.js` | `cssVar()` — reads a CSS custom property value |
| `intelligence-constants.js` | `LADDER_RANGE`, `LTI_BANDS`, `SDLT_BANDS`, `LISA_LIMIT`, `STRESS_RATE` |
| `flow-constants.js` | `FLOW_PALETTE`, `FLOW_ORDER` |
| `affordability.js` | Affordability verdict engine |
| `finance-derive.js` | Derived finance figures |
| `money-flow.js` | Money-flow shape |
| `savings-velocity.js` | Savings velocity + projection |
| `savings-series.js` | Savings time-series |
| `deposit-risk.js` | Deposit-risk waterfall |
| `investment-performance.js` | T212 investment performance |
| `outreach-renderer.js` | Outreach template renderer |
| `outreach-store.js` | Outreach persistence helpers |
| `format.js` | Currency / date formatters |

### `assets/js/dashboard/` — 12 dashboard tile modules
`tile-lede`, `tile-deposit`, `tile-deposit-risk`, `tile-affordability`, `tile-affordability-scenarios`, `tile-money-flow`, `tile-shortlist`, `tile-journey`, `tile-criteria`, `tile-isa-ytd`, `tile-readiness`, `tile-savings-visuals`

### `assets/js/finances/` — 8 finance section modules
`chart-helpers`, `section-deposit`, `section-deposit-risk`, `section-flow`, `section-isa-attribution`, `section-later`, `section-breakdowns`, `section-v3-charts`

### `assets/js/outreach/` — 8 outreach modules
`context`, `grid`, `filters`, `dialog`, `contacts`, `log`, `toast`, `state`

### `assets/js/page-*.js` — thin page coordinators
One per page: `page-home`, `page-finances`, `page-outreach`, `page-data-sync`, `page-about-search`, `page-profile`, `page-profile-detail`, `page-area-detail`, `page-areas`, `page-criteria`, `page-house-types`, `page-journey`, `page-map`

### `assets/css/` — structure
```
tokens.css          ← guard-railed; colours, type, spacing tokens
base.css            ← global resets and shared layout
dashboard.css       ← @import shell loaded by every page (guard-railed)
dashboard/          ← per-tile CSS partials
  tile-card.css, tile-deposit.css, tile-affordability.css, tile-money-flow.css,
  tile-shortlist.css, tile-journey.css, tile-criteria.css, tile-ask.css,
  tile-extended.css, tile-v3-visuals.css, base.css
pages/              ← per-page CSS partials (imported by dashboard.css)
  areas.css, area-detail.css, finances.css, finances-widgets.css,
  finances-charts.css, journey.css, house-types.css, map.css, areas-rows.css,
  shared.css, placeholder.css, data-sync.css
components/         ← reusable component CSS
```
