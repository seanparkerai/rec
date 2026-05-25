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
- At the **start of any work session**, dispatch **Haiku-model scans** (fast/cheap) to summarise current
  repo + relevant file state before editing. Then read `docs/CHECKLIST.md` to find the next task.

## 5. Checklist discipline
- Keep `docs/CHECKLIST.md` in lockstep with `docs/PLAN.md`.
- Tick items as you complete them and **commit** so progress is never lost.

## 6. Testing & regression
- Keep the `tests/` harness current. **Run it after changes and before committing.**
- Add/extend benchmark tests (calculators, JSON schemas) as features grow so regressions surface early.

## 7. Content accuracy & imagery
- Write area/house content **only after detailed, place-specific and type-specific web searches**
  (exact place name + exact property type). Record sources in each record's `sources[]`.
- Use **only openly-licensed images** (Wikimedia Commons, Geograph CC, Unsplash, official tourism),
  **downloaded** into `assets/img/{areas,house-types}/`, with `credit` + `licence` recorded in the JSON.
- Never hotlink unattributed copyrighted search-engine images.

## 8. Resume protocol (start here in a fresh chat)
1. **Run `node tools/area-status.mjs`** — prints which areas are `researched` /
   `partial` / `stub` and exactly which fields are missing per area. Use
   `--missing` to filter to incomplete areas and `--id <area-id>` to inspect one.
   This is the canonical view of research progress and the next-to-do queue.
2. Read `docs/CHECKLIST.md` (what's done / next) and `docs/PLAN.md` (master plan)
   + `docs/CONTEXT.md` (research facts).
3. Run a Haiku scan of any files you'll touch.
4. Run the test harness.
5. Continue at the **first unchecked** checklist item — or, for area research,
   the next `partial` or `directory` area surfaced by `area-status.mjs`.

## Project shape (quick reference)
- Zero-build static site: plain HTML + CSS + vanilla JS, all libraries via CDN.
- Shared shell via fetch-injected partials (`components/`), styled with Pico CSS + tokens.
- Data as JSON in `data/`, user edits persisted via `assets/js/storage.js` (localStorage now → backend later).
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
2. Re-run the schema in Supabase SQL Editor.
3. Add a `get<Type>()` / `save<Type>()` pair to `assets/js/storage.js` following the `_get` / `_save` pattern.
4. Do **not** call Supabase directly from any page module — go through `storage.js`.
