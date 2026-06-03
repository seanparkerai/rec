# CLAUDE.md — Operating Rules for this Repository

> **Last reconciled 2026-06-03.** If reality and this file disagree, **reality wins — fix this file.**

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

## 3. Reading files
- Read what you need with `offset`/`limit`. Don't blind-`cat` huge generated/binary files. No fixed
  line-chunk ritual — a capable model can read a whole source file at once.

## 4. Start-of-cycle scan
- At the **start of any work session**, summarise the current repo + relevant file state before editing,
  then read `docs/CHECKLIST.md` to find the next task. This is a habit, not a required separate
  cheap-model/subagent call — read the files directly.

## 5. Checklist discipline
- Keep `docs/CHECKLIST.md` in lockstep with `docs/PLAN.md`.
- Tick items as you complete them and **commit** so progress is never lost.

## 6. Testing & regression
- Keep the `tests/` harness current. **Run `node tools/run-intelligence-tests.mjs` after changes and before committing.** This single command runs all intelligence tests + the Supabase sync tests.
- Add/extend benchmark tests (calculators, JSON schemas) as features grow so regressions surface early.
- **Supabase sync tests are non-negotiable** for commits touching data, schema, or `assets/js/storage.js`. They are included in the unified harness above. The **offline** harness (`tests/supabase-sync.test.js`) asserts what can be checked without a live connection: (a) `data/snapshots/sync-state.json` is valid and lists all 20 tracked tables; (b) every file in `data/areas/*.json` has a valid `id`/`name`/`status` (status in the documented enum) — **all** files are validated, not a sample; (c) the content files (`house-types.json`, `checklists.json`, `outreach-templates.json`) have their expected shape; (d) the backfill tooling is present. The **online** assertions — `areas` mirror row count == repo area files, and per-table freshness vs the snapshot — require a live Supabase connection and are reported by the suite as **skipped** (never counted as passing). Claude runs those online checks via the Supabase MCP connector at session start/end per §8/§18. The runner records one honest pass/fail per suite from the child exit code and never fabricates per-test lines.

## 7. Content accuracy & imagery
- Write area/house content **only after detailed, place-specific and type-specific web searches**
  (exact place name + exact property type). Record sources in each record's `sources[]`.
- Use **only openly-licensed images** (Wikimedia Commons, Geograph CC, Unsplash, official tourism),
  **downloaded** into `assets/img/{areas,house-types}/`, with `credit` + `licence` recorded in the JSON.
- Never hotlink unattributed copyrighted search-engine images.

## 8. Resume protocol (start here in a fresh chat)

See §18 for the full Supabase sync contract.

0. **Supabase freshness check — only if this session edits data, schema, or user-state** (skip entirely
   for pure code/UI/docs refactors that touch no data). When it applies, it's a lightweight check, not a
   blocking ceremony:
   - `mcp__supabase__list_tables` — confirm the 23 curated tables exist with RLS enabled (inventory in
     `docs/SUPABASE_SYNC.md` §0).
   - `node tools/check-supabase-freshness.mjs` (or `execute_sql` for `MAX(updated_at)` per table),
     compared to `data/snapshots/sync-state.json`. If a **user-state** table is fresher (the user edited
     in the portal), pull that row via `execute_sql`, update the snapshot, and surface the diff in one
     line before continuing.
1. **Run `node tools/area-status.mjs`** — prints which areas are `researched` / `partial` / `stub` and
   which fields are missing. Use `--missing` to filter and `--id <area-id>` to inspect one. This is the
   canonical view of research progress and the next-to-do queue.
2. Read `docs/CHECKLIST.md` (what's done / next) and `docs/PLAN.md` (master plan) + `docs/CONTEXT.md`
   (research facts) + `docs/SUPABASE_SYNC.md` (sync contract).
3. Run the test harness (`node tools/run-intelligence-tests.mjs` — includes the sync test, §6).
4. Continue at the **first unchecked** checklist item — or, for area research, the next `partial` or
   `directory` area surfaced by `area-status.mjs`.

## Project shape (quick reference)
- Zero-build static site: plain HTML + CSS + vanilla JS, all libraries via CDN.
- Shared shell via fetch-injected partials (`components/`), styled with Pico CSS + tokens.
- Content data (areas, house-types, checklists, outreach-templates) as JSON in `data/`. Test fixtures (redacted sample data) in `data/fixtures/`.
- **User-state data (profile, finances, criteria, goals, contacts, investments) lives exclusively in Supabase — NOT in repo JSON files.** Accessed via `mcp__supabase__execute_sql` (Claude Code) or `assets/js/storage.js` (browser, localStorage write-through cache backed by Supabase).
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

No browser in this environment: there is **no screenshot / Playwright / Chromium / Lighthouse step**.
Verify what you can in code; hand the visual pass to the developer. (No need to announce the absence.)

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
- **Client**: `assets/js/supabase-client.js` — auto-generated by `pages/setup.html`. Exports `supabase`. **It is committed** and holds only the Supabase URL + the **publishable (anon) key**, which is designed to be public in a browser app and is safe **iff Row Level Security is enforced** (it is — all 25 live tables have RLS enabled). It is therefore intentionally *not* gitignored.
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

Live schema: **23 curated tables** (verified via `list_tables` 2026-06-03, all RLS-enabled) = **18 user-state + 2 content mirrors + 3 system**. Of these, **20 are "tracked"** for the sync contract (18 user-state + 2 content); the 3 system tables are Supabase-managed and never synced by Claude. **Physical table count is 25** — the 23 curated plus the un-curated `reports` table and the fetcher-written, live-content `listings` table (neither tracked). `docs/SUPABASE_SYNC.md` §0 is the authoritative inventory; §6's and §8's counts must match it. (`listing_reactions` is user-state but **append-only**; `learned_preferences` is recomputed user-state; the fetcher-written `listings` table is live-content and is **not** tracked.)

| Class | Tables | Source of truth | Sync direction |
|-------|--------|-----------------|----------------|
| **User state (household)** | `profile`, `criteria`, `finances`, `goals`, `shortlist`, `zones`, `journey_checks`, `contacts`, `outreach`, `readiness_checklist`, `investments_accounts`, `investments_history`, `debts_credit_cards`, `debts_student_loans`, `debts_other`, `listing_reactions` (append-only), `learned_preferences` (recomputed), `area_confirmations` — **NOT in repo JSON files** | **Supabase** (per household_id) | Portal write → Supabase live · Claude write → MCP `execute_sql` UPSERT (INSERT for append-only `listing_reactions`) · `storage.js` mirrors to localStorage for offline reads · `data/fixtures/*.sample.json` provides redacted sample data for tests/fresh-install only |
| **Content** | `areas`, `house_types` mirrors (+ `data/areas/*.json`, `data/house-types.json`, `data/checklists.json`, `data/outreach-templates.json` in repo) | **Repo JSON** (git-versioned) | Claude edits the JSON file → immediately mirrors to Supabase content table via MCP UPSERT · portal reads from repo first, falls back to mirror |
| **Index / derived** | `data/areas.json` (lightweight directory) | Built from content | Regenerated by `tools/build-areas.mjs`; mirrored along with content |
| **System / audit** | `households`, `household_members`, `sync_log` | Supabase-managed | Never edited directly by Claude |

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

- Does NOT write user-state via repo JSON files. User-state JSON files no longer exist in the repo — there is only the Supabase row, fetched via `_sbGet()`.
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

### 18.7 Content-mirror status

The `areas` (195 rows) and `house_types` (15 rows) mirror tables **exist and are live** (verified via
`list_tables` 2026-05-30, RLS enabled). When Claude edits `data/areas/*.json` or `data/house-types.json`,
mirror the change to the matching Supabase table per §18.3.

`checklists` and `outreach_templates` have **no** mirror table yet — those content files
(`data/checklists.json`, `data/outreach-templates.json`) remain repo-JSON-only. Do **not** attempt to
UPSERT them to Supabase; there is nothing to mirror to. If a mirror is wanted, add the table via
`mcp__supabase__apply_migration` first (its own named §17 phase).

## 19. Module layout

The JS/CSS is split into small single-purpose modules (post 2026-05 refactor): flat utilities and
calculators in `assets/js/`, tile modules in `assets/js/dashboard/`, finance sections in
`assets/js/finances/`, outreach modules in `assets/js/outreach/`, and thin `page-*.js` coordinators
(one per page). Rather than maintain a hand-written list here (which rots), get the **current** map
on demand:

```bash
find assets/js -name '*.js' | sort      # all JS modules
find assets/css -name '*.css' | sort    # CSS partials (see §16 / dashboard.css import shell)
```

### `assets/css/` — structure
```
tokens.css          ← guard-railed; colours, type, spacing tokens
base.css            ← global resets and shared layout
fonts.css           ← @font-face declarations (self-hosted faces)
dashboard.css       ← @import shell loaded by every page (guard-railed)
dashboard/          ← per-tile CSS partials
  tile-card.css, tile-deposit.css, tile-affordability.css, tile-money-flow.css,
  tile-shortlist.css, tile-journey.css, tile-criteria.css, tile-ask.css,
  tile-extended.css, tile-v3-visuals.css, base.css
pages/              ← per-page CSS partials (imported by dashboard.css)
  areas.css, area-detail.css, area-review.css, areas-rows.css, finances.css,
  finances-widgets.css, finances-charts.css, journey.css, house-types.css, map.css,
  listings.css, property.css, report.css, shared.css, placeholder.css
pages/data-sync/    ← split from data-sync.css (P7g): state/tools/guide/fetch.css.
                      data-sync.css is now an @import shell linked DIRECTLY by
                      pages/data-sync.html (NOT via dashboard.css).
pages/listings/     ← split from listings.css (P7h): controls/cards/states/widgets.css
                      (listings.css stays an @import shell, still dashboard-imported).
components/         ← reusable component CSS
  card.css, chip.css, dialog.css, field.css, filter-sheet.css, finance-stage.css,
  outreach.css, save-bar.css, segmented.css, sheet.css, table.css, tile.css, toc.css
```
