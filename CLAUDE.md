# CLAUDE.md — Operating Rules for this Repository

This file governs how Claude (and any AI assistant) works in this repo. Read it at the **start of every
session**. These rules exist to keep work safe, resumable, and high quality.

## 1. Branching & commits
- Work and commit **directly to `main`**. Do **not** create sub-feature branches for this project.
- **Commit + push after every major step** (e.g. after each checklist phase or content batch) so any new
  chat can resume from a known-good state.
- Use clear, descriptive commit messages.

## 2. Large content writes (IMPORTANT)
- When adding a **large block of content to an already-large file**, do **not** paste it inline.
- Instead: **write the block to a separate temp file first**, then run the splice helper:
  ```bash
  node tools/insert-content.mjs --target <file> --content <tempfile> --marker "<!-- SLOT:x -->" --mode before
  ```
- For JSON list files, append before the closing marker (see `tools/insert-content.mjs --help`).
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
1. Read `docs/CHECKLIST.md` (what's done / next).
2. Read `docs/PLAN.md` (the master plan) and `docs/CONTEXT.md` (research facts).
3. Run a Haiku scan of any files you'll touch.
4. Run the test harness.
5. Continue at the **first unchecked** checklist item.

## Project shape (quick reference)
- Zero-build static site: plain HTML + CSS + vanilla JS, all libraries via CDN.
- Shared shell via fetch-injected partials (`components/`), styled with Pico CSS + tokens.
- Data as JSON in `data/`, user edits persisted via `assets/js/storage.js` (localStorage now → backend later).
- Hosted on **GitHub Pages** (deploy on push to `main`). Preview locally with `python3 -m http.server`.

---

## 9. Design quality (front-end)

This project commits to a single visual direction: **"calm precise editorial"** — restrained palette,
generous whitespace, deliberate typography, no AI-generic patterns. Every UI change must reinforce that
direction; if it doesn't, refactor before commit. Reference style anchors when designing a new view
(e.g. *Linear-dense*, *Stripe-docs*, *Notion-soft*) and name the anchor in the commit message.

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

Before declaring a UI change complete:

- **Screenshot at 375 / 768 / 1280 px** (Playwright/Chromium when available; manual browser resize as
  fallback) and save under `artifacts/screenshots/<task>/`. Review the screenshots, not just the markup.
- **No horizontal scroll** at 320 px (`document.documentElement.scrollWidth === clientWidth`). Encoded
  as a check in `tests/tests.html`.
- **Contrast** — verify light + dark token pairs meet 4.5:1 / 3:1; spot-check changed surfaces in DevTools.
- **Reduced motion** — load with `prefers-reduced-motion: reduce` forced (DevTools → Rendering); confirm
  no animation runs longer than ~0.01 s.
- **Axe** — zero serious/critical violations on the changed page (DevTools axe panel or `@axe-core/cli`).
- **Test harness** — `tests/tests.html` all-green before commit.
- **Lighthouse (when CI lands)** — target Performance ≥90, Accessibility ≥95, Best Practices ≥95, SEO ≥90.
