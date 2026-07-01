# CLAUDE.md — Operating Rules for this Repository

> **Last reconciled 2026-06-18.** If reality and this file disagree, **reality wins — fix this file.**
> Inventories (tables, files, counts) are never restated here — each has one named source of truth.

This file governs how Claude (and any AI assistant) works in this repo. Read it at the **start of
every session**. These rules exist to keep work safe, resumable, and high quality.

## 1. Branching & commits
- Work and commit **directly to `main`** — do **not** create sub-feature branches — unless the
  session explicitly mandates a feature branch (e.g. a managed remote session).
- **Commit + push after every major step** (e.g. after each checklist phase or content batch) so any
  new chat can resume from a known-good state.
- Use clear, descriptive commit messages.

## 2. Area content — per-area JSON files (IMPORTANT)
- Area data is split: `data/areas.json` is the **lightweight directory index**;
  the full per-area record (overview, character, schools, prices, sources…) lives
  at **`data/areas/<id>.json`**, one file per area.
- **The Supabase `areas` mirror is the source of truth (RELAXED §18.5, 2026-06-04 owner decision).**
  `data/areas/<id>.json` is a **materialised view** regenerated from the DB by
  `tools/sync-areas-from-supabase.mjs`. When researching or revising an area, **write the change to
  Supabase via MCP, then materialise** (`sync-areas-from-supabase` → `build-areas`) — do **not**
  hand-edit a per-area file as the primary write (the parity test `tests/contract/areas-db-repo-parity.test.js`
  fails if a file drifts from the DB). Do **not** paste content into `data/areas.json`, and do **not**
  recreate `Areadetails.md` (the pre-JSON monolith — deleted from `docs/archive/`, in git history).
- The canonical shape lives at `data/schema/area.schema.json` and is enforced by
  `validateAreaDetail()` in `tests/schemas.js`. Set `status` on every save:
  `directory` → `stub` → `drafted` → `partial` → `researched`.
- After materialising, run `node tools/build-areas.mjs` — it rebuilds the `data/areas.json` index
  from `data/source/villages.csv` (id/name/town/county/postcode) + the per-area content files. An
  id/postcode migration therefore **also edits `villages.csv`** so the regenerated id matches the DB.

### Other large content writes
- For any other large block being added to an already-large file, do **not** paste
  inline. Write the block to a temp file and use the splice helper:
  ```bash
  node tools/insert-content.mjs --target <file> --content <tempfile> --marker "<!-- SLOT:x -->" --mode before
  ```
- Delete temp files after a successful splice.

## 3. Session habits
- **Read efficiently** — use `offset`/`limit` for what you need; don't blind-`cat` huge
  generated/binary files. A capable model can read a whole source file at once.
- **Start of session** — summarise the current repo + relevant file state before editing, then read
  `docs/CHECKLIST.md` to find the next task (full protocol: §8).
- **Checklist discipline** — `docs/CHECKLIST.md` is the single live tracker. Tick items as you
  complete them and **commit** so progress is never lost. Completed plans and finished checklist
  phases are archived under `docs/archive/` — never resurrected into the live file.

## 6. Testing & regression
- Keep the `tests/` harness current. **Run `node tools/run-intelligence-tests.mjs` after changes and
  before committing.** This single command runs all intelligence tests + the Supabase sync tests.
- Add/extend benchmark tests (calculators, JSON schemas) as features grow so regressions surface early.
- **Supabase sync tests are non-negotiable** for commits touching data, schema, or
  `assets/js/storage.js` (they run inside the unified harness). The **offline** suite
  (`tests/supabase-sync.test.js`) checks snapshot validity for **every tracked table** — the
  canonical list is enforced there and documented in `docs/SUPABASE_SYNC.md` §0 — plus area/content
  file shape. **Online** assertions are reported as **skipped**, never as passing; Claude runs those
  via the MCP connector at session start/end per §8/§18. The runner records one honest pass/fail per
  suite from the child exit code.

## 7. Content accuracy & imagery
- Write area/house content **only after detailed, place-specific and type-specific web searches**
  (exact place name + exact property type). Record sources in each record's `sources[]`.
- Use **only openly-licensed images** (Wikimedia Commons, Geograph CC, Unsplash, official tourism),
  **downloaded** into `assets/img/{areas,house-types}/` (directories created on first download —
  imagery work is still queued in `docs/CHECKLIST.md`), with `credit` + `licence` recorded in the JSON.
- Never hotlink unattributed copyrighted search-engine images.

## 8. Resume protocol (start here in a fresh chat)

See §18 for the full Supabase sync contract.

0. **Supabase freshness check — only if this session edits data, schema, or user-state** (skip entirely
   for pure code/UI/docs refactors that touch no data). When it applies, it's a lightweight check, not a
   blocking ceremony:
   - `mcp__supabase__list_tables` — confirm the tracked tables exist with RLS enabled (inventory in
     `docs/SUPABASE_SYNC.md` §0).
   - `node tools/check-supabase-freshness.mjs` (or `execute_sql` for `MAX(updated_at)` per table),
     compared to `data/snapshots/sync-state.json`. If a **user-state** table is fresher (the user edited
     in the portal), pull that row via `execute_sql`, update the snapshot, and surface the diff in one
     line before continuing.
1. **Run `node tools/area-status.mjs`** — prints which areas are `researched` / `partial` / `stub` and
   which fields are missing. Use `--missing` to filter and `--id <area-id>` to inspect one. This is the
   canonical view of research progress and the next-to-do queue.
2. Read `docs/CHECKLIST.md` (what's done / next). Add `docs/CONTEXT.md` (research facts) for content
   sessions and `docs/SUPABASE_SYNC.md` (sync contract) for data sessions.
3. Run the test harness (`node tools/run-intelligence-tests.mjs` — includes the sync test, §6).
4. Continue at the **first unchecked** checklist item — or, for area research, the next `partial` or
   `directory` area surfaced by `area-status.mjs`.

## Project shape (quick reference)
- Zero-build static site: plain HTML + CSS + vanilla JS, all libraries via CDN.
- Shared shell via fetch-injected partials (`components/`), styled with Pico CSS + tokens.
- Content data (areas, house-types, checklists, outreach-templates) as JSON in `data/`. Test fixtures (redacted sample data) in `data/fixtures/`.
- **User-state data (profile, finances, criteria, goals, contacts, investments) lives exclusively in Supabase — NOT in repo JSON files.** Accessed via `mcp__supabase__execute_sql` (Claude Code) or `assets/js/storage.js` (browser, localStorage write-through cache backed by Supabase).
- Hosted on **GitHub Pages** (deploy on push to `main`). Preview locally with `python3 -m http.server`.
- Project skills (resume / area-research / sync-check) live in `.claude/skills/`.

---

## 9. Design quality (front-end)

This project commits to a single visual direction: **"calm precise editorial"** — restrained palette,
generous whitespace, deliberate typography, no AI-generic patterns. Every UI change must reinforce
that direction; if it doesn't, refactor before commit. **`DESIGN.md` at the repo root is the sole
owner of the visual contract** — anchors (*Stripe-docs* / *Linear-dense*), tokens, type scale,
colour rules, spacing scale, and the banned-pattern list. Read it before any UI change and name the
relevant anchor in the commit message. All colour/spacing/radius/z-index values are CSS custom
properties in `tokens.css` — never hard-code hex or off-scale spacing in component CSS.

## 10. Mobile-first & responsive

- **Mobile-first** — write the 320–480 px layout first, then progressively enhance. Never start at
  desktop and shrink.
- Breakpoints **480 / 768 / 1024 / 1280 px**, `min-width` only; touch targets ≥44×44; safe-area
  insets on fixed bars; `dvh`/`svh` never raw `vh`; container queries for components; no horizontal
  page scroll at 320 px.
- The full responsive doctrine — including the iPad 600–800 band rule, SVG chart sizing, iOS
  input-zoom floors, and the mechanical lint (`tools/lint-responsive.mjs`, wired into the harness) —
  lives in **`DESIGN.md` §6** and supersedes any older prose.

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

No browser in this environment — verification is code self-review + the harness
(`node tools/run-intelligence-tests.mjs` green before commit), then a one-line visual hand-off to
the developer for anything that genuinely needs eyes. The full procedure is **`DESIGN.md` §4**;
browser-side smoke checks (`tests/tests.html`) are run by the developer.

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
- `assets/js/storage.js` + `assets/js/storage/*.js` (incl. its subfolders) — Supabase-backed storage layer (see §17). `storage.js` is a re-export shim (P8) over `storage/{core,user-state,listings,outreach,refinement,ask}.js`. Two of those are themselves shims over a subfolder: `storage/listings.js` → `storage/listings/{content,feed,learned}.js` (+ the internal `_reactions-core.js`), and `storage/user-state.js` → `storage/user-state/{singletons,readiness,investments,shortlist}.js`. The subfolders are part of this guard-railed layer. **Extend, do not rewrite.**
- `assets/js/config.js` — base-URL + `url()` helpers.
- `assets/js/data-loader.js` — JSON loader.
- `assets/js/finances.js` + `assets/js/finances/calc-*.js` — finance calculators; `finances.js` is a re-export shim (P9) over `finances/calc-{purchase,lisa,savings,outlay}.js`. **Extend, do not rewrite.**
- `assets/css/dashboard.css` — `@import` entry shell (order-sensitive); extend by appending imports only.
- `data/schema/area.schema.json` — per-area schema.
- `.github/workflows/*` — CI / deploy pipelines.

If a phase appears to require a change to any of these, stop and re-plan as a separate, named phase.

## 17. Backend: Supabase

The app uses **Supabase** for cloud storage and authentication.

- **Schema**: `supabase/schema.sql` — idempotent Postgres DDL, **reference only**; the MCP migration
  history is canonical (see `supabase/README.md`). All tables use Row Level Security.
- **Client**: `assets/js/supabase-client.js` — exports `supabase`. **It is committed** and holds only the Supabase URL + the **publishable (anon) key**, which is designed to be public in a browser app and is safe **iff Row Level Security is enforced** (it is — verify via `list_tables`: every table has RLS enabled). It is therefore intentionally *not* gitignored.
- **Storage abstraction**: `assets/js/storage.js` — a re-export shim (P8) over `assets/js/storage/{core,user-state,listings,outreach,refinement,ask}.js`, the only modules that call Supabase for data. `core.js` owns the client bootstrap + cached `household_id`; all use a localStorage write-through cache for instant renders, then revalidate from Supabase in the background.
- **Auth guard**: `assets/js/auth-guard.js` — checks for a Supabase session on every page load; redirects to `pages/login.html` if unauthenticated.
- **Login**: `pages/login.html` — email + password form backed by `supabase.auth.signInWithPassword`.
- **Onboarding = the profile**: there is no separate setup wizard. New users land on `pages/profile.html`, where every field (profile, finances, criteria, areas) is editable inline via the shared field engine (`assets/js/forms/field-renderer.js` over `assets/js/setup/steps.js`); a first-run banner guides them until real data exists. Areas are added via the reusable picker (`assets/js/areas/area-picker.js`) on the profile and the areas/map page.

### Adding a new data type

1. Add a table to `supabase/schema.sql` (RLS policies via `is_household_member()`).
2. Apply the migration via `mcp__supabase__apply_migration` — never by hand-copying SQL into the
   dashboard. The connector keeps migration history aligned with project state.
3. Add a `get<Type>()` / `save<Type>()` pair to `assets/js/storage.js` (`_get` / `_save` pattern).
4. Do **not** call Supabase directly from any page module — go through `storage.js`.
5. Extend `tests/supabase-sync.test.js` to cover the new table (see §6).
6. Classify it — **user state** or **content** — per §18.1 and `docs/SUPABASE_SYNC.md`.

## 18. Supabase as live database — bidirectional sync contract

Supabase is the **live source of truth** for all stateful data in this app. Two parties write to it,
and Claude MUST keep them in lockstep: **the user** via the deployed portal (writes flow through
`assets/js/storage.js` → Supabase — do not touch that path), and **Claude** via the Supabase MCP
connector — never via repo JSON alone for user-state data, and always with a mirror push for
content data.

### 18.1 Data classification

Every stateful value belongs to exactly one of four classes. **The authoritative table-by-table
inventory, counts, and history live in `docs/SUPABASE_SYNC.md` §0–§1; the enforced tracked-table
list is in `tests/supabase-sync.test.js`. Never restate counts here.**

- **User state** (per household_id — profile, criteria, finances, goals, shortlist, zones, journey,
  contacts, outreach, readiness, investments, debts, reactions, learned preferences, area
  selections/confirmations): source of truth = **Supabase**. Portal writes via `storage.js`; Claude
  via MCP UPSERT (INSERT for append-only `listing_reactions`). **Never in repo JSON** —
  `data/fixtures/*.sample.json` is redacted sample data for tests/fresh-install only.
- **Content — `areas`**: source of truth = **Supabase** (§18.5 relaxation, 2026-06-04);
  `data/areas/*.json` is a materialised view (see §2).
- **Content — other** (`house_types` mirror; `checklists` + `outreach-templates` repo-only):
  source of truth = **repo JSON**, mirrored via MCP UPSERT where a mirror exists (§18.7).
  `data/areas.json` is derived by `tools/build-areas.mjs`.
- **System / engine** (`households`, `household_members`, `sync_log`, plus fetcher-written
  `listings` + its `listing_areas` m2m membership junction, and the engine-managed refinement
  tables): Supabase-managed; never synced or directly edited by Claude. (`listing_areas` records
  every area whose geofence contains a listing — `listings.area_id` stays the single primary;
  `household_areas.is_origin` marks home/commute anchors excluded from the feed + fetch. See
  `docs/SUPABASE_SYNC.md` / `docs/DATA_MODEL.md`.)

### 18.2 Mandatory MCP-first session start

The operational form of §8 Step 0. Before any edit: (1) `mcp__supabase__list_tables` — schema intact,
RLS on; (2) `node tools/check-supabase-freshness.mjs` (or `execute_sql` `MAX(updated_at)` per table)
vs `data/snapshots/sync-state.json`; (3) a fresher **user-state** table means the user edited in the
portal — pull the row, update the snapshot, surface a one-line diff; (4) a **content** table *behind*
the repo means a previous session failed to mirror — re-push via UPSERT before anything else.

### 18.3 Mandatory MCP-first session end

Before any commit + push: (1) UPSERT every user-state value changed this session and verify by
re-SELECT; (2) UPSERT every edited content file into its mirror table (where one exists, §18.7) and
verify row count + `updated_at`; (3) update `data/snapshots/sync-state.json` high-water marks;
(4) run the harness incl. `tests/supabase-sync.test.js`; (5) only then commit + push, ending the
commit message with the one-line footer **"Supabase: pushed N areas, M user-state rows"**.
If any MCP write fails, the session is **incomplete** — do not commit a half-sync; fix it or surface
it to the user before exiting.

### 18.4 User-portal writes — hands off

The portal's `storage.js` already writes the user-state tables on every save. Claude never writes
user-state via repo JSON (no such files exist — only the Supabase row, fetched via `_sbGet()`). When
the user instructs Claude to update their data ("set my LISA cap to £4,000"), the write goes directly
to the Supabase row via MCP `execute_sql`, verified by re-SELECT inside the same turn.

### 18.5 Conflict resolution

- **User state**: Supabase always wins. Claude never overwrites a user-edited row unless the user
  explicitly says "overwrite this with X". If `updated_at` is newer than what Claude expects, stop
  and ask.
- **Content — `areas` (RELAXED 2026-06-04, owner decision):** the DB wins; if a file and the DB
  disagree, the file is re-materialised. Every area change follows the §2 write path: **write the DB
  via MCP → `sync-areas-from-supabase` → `build-areas` → `verify-area-coords --online` →
  `run-intelligence-tests` → commit.** `data/snapshots/areas.json` +
  `tests/contract/areas-db-repo-parity.test.js` guard this. An id/postcode migration also rewrites
  `data/source/villages.csv` and carries references (incl. the user-state `area_confirmations`
  keys — the narrow §18.4 relaxation).
- **Content — other (`house_types`, `checklists`, `outreach-templates`)**: repo JSON wins; the
  mirror is rebuilt from repo files and never edited via the dashboard. On drift, re-push from repo.
- **Schema**: all DDL via `mcp__supabase__apply_migration` — never the web dashboard; the migration
  history is the source of truth.

### 18.6 What "always use the connector" means in practice

Schema state is read via `list_tables` (not by trusting `supabase/schema.sql`); user data via
`execute_sql` (not localStorage exports); DDL via `apply_migration` (not hand-pasted SQL). Claude
does NOT bypass MCP "to save time" — a skipped MCP call is a sync bug waiting to happen and will
fail the §6 sync tests at commit time.

### 18.7 Content-mirror status

The `areas` and `house_types` mirror tables exist and are live (verify via `list_tables`). `areas`
is DB-canonical (§18.5); edits to `data/house-types.json` are mirrored to `house_types` per §18.3.
`checklists` and `outreach_templates` have **no** mirror table — those files stay repo-JSON-only; do
not UPSERT them. If a mirror is wanted, add the table via `apply_migration` first (its own §17 phase).

## 19. Module layout

The JS/CSS is split into small single-purpose modules (post 2026-05 refactor): flat utilities and
calculators in `assets/js/`, tile modules in `assets/js/dashboard/`, finance sections + calculators
in `assets/js/finances/`, the storage layer in `assets/js/storage/`, listings modules in
`assets/js/listings/`, refinement-engine modules in `assets/js/refinement/`, Ask + Compose modules in
`assets/js/ask/` (incl. `compose.js` and the folded-in `messages.js`; outreach is authored through
Ask Compose — the old `assets/js/outreach/` grid was retired, leaving only the pure `outreach-renderer.js`
+ `outreach-store.js` helpers), and thin `page-*.js` coordinators (one per page). CSS mirrors this:
`tokens.css` (guard-railed) + `base.css` + `fonts.css`, the order-sensitive `dashboard.css` `@import`
shell (guard-railed, §16), per-tile partials in `dashboard/`, per-page partials in `pages/` (some are
themselves `@import` shells over a subfolder), and reusable component CSS in `components/`.

**File-size norm — split with a shim past ~400 lines.** Keep modules focused (roughly ≤400 lines).
When one outgrows that, split it into a subfolder of single-purpose modules behind a **thin
re-export shim** that keeps the public import path unchanged — the pattern of `storage.js`
(→ `storage/*.js`) and `finances.js` (→ `finances/calc-*.js`). A large `page-<name>.js` coordinator
does the same: its pure view-builders move into `page-<name>/*.js` (e.g. `page-listings/`,
`page-property/`, `page-area-detail/`), leaving the stateful `render()`/`init()`
coordinator thin and keeping its `<script>` entry path unchanged. Generated/aggregated data files
are exempt (they're regenerated, never hand-split). The whole-repo map lives in `docs/REPO_MAP.md`.

Hand-written file lists rot — get the **current** map on demand:

```bash
find assets/js -name '*.js' | sort      # all JS modules
find assets/css -name '*.css' | sort    # CSS partials
```
