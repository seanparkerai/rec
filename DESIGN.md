# DESIGN.md — Visual direction for "rec"

The single source of truth for how this app looks. Read this before any UI change. Name the relevant **anchor** in every UI commit message.

---

## 1. Anchors

Two named anchors. Every view is one or the other — never both, never neither.

### Stripe-docs (long-form, editorial)
For content-led views: `pages/profile.html` (the profile + criteria summary/edit surface), `pages/area-detail.html`, `pages/property.html` (listing dossier), `pages/journey.html`.

- Single-column reading width (≤68ch) on mobile, two-column (content + sticky rail) ≥768 px.
- Display headings in Fraunces with optical sizing; generous leading (1.5–1.6 body, 1.15 display).
- Surfaces almost monochrome; accent reserved for primary action and active state.
- Hairline rules, not boxes. No shadow-floated cards.
- Inline figures with caption + licence; sources as footnotes with tap previews.

### Linear-dense (data-rich UI)
For tools and data: `index.html`, `pages/areas.html`, `pages/finances.html`, `pages/listings.html`, `pages/saved-listings.html`, `pages/refinement.html`.

- Compact rhythm: tight rows, dense tables, monospace numerals.
- Asymmetric / bento layouts — never a uniform grid of identical cards.
  **Sanctioned exception (owner decision 2026-07-02):** the property-listings photo feed
  (`.prop-list--grid` on Browse/Saved) flows the image-led card 2-up ≥768 and 3-up ≥1280 — a
  content/media index (photos ARE the content, like a gallery), not a SaaS card grid. Cards stay
  flat (whitespace separation, no shadows, no boxes); the §3 shadow-floated-card ban still applies.
- Sticky thumb-zone primary actions on mobile (safe-area-inset aware).
- Filters as chip rows with scroll-snap; full filter sets open in `<dialog>`.
- Keyboard-first: every action has a visible focus state and a sensible Tab order.

---

## 2. Tokens

All visual values come from `assets/css/tokens.css`. Component CSS **never** hard-codes hex, px sizes for type, or arbitrary spacing.

### Colour — OKLCH + `color-mix`
- One neutral hue (warm near-black / off-white) and one accent (emerald).
- Derive hover / active / muted / surface via `color-mix(in oklch, …)`. Never define two saturated colours.
- Light and dark themes share the same hue ladder, flipped in lightness.
- Light: dominant ≈ `oklch(99% 0.005 95)` background, ink ≈ `oklch(20% 0.02 250)`, accent ≈ `oklch(55% 0.12 160)`.
- Dark: background ≈ `oklch(15% 0.015 250)`, ink ≈ `oklch(94% 0.01 95)`, accent ≈ `oklch(72% 0.13 160)`.
- **Legacy fallback (C1, 2026-07-01):** `tokens.css` ends with an `@supports not (color: oklch(…))`
  block of sRGB approximations — custom properties fail at *usage* time, so an override block is the
  only working fallback. Any new oklch/`color-mix` token must be added there too;
  `tests/contract/tokens-fallback.test.js` fails the harness if it isn't.

### Spacing — 4 px base, no exceptions
`--space-1 … --space-24` (4/8/12/16/24/32/48/64/96 px). If a value isn't on the scale, change the layout, not the token.

### Type — one ratio (1.250 minor third)
- Display: **Fraunces** (variable, optical sizing 11–144, weights 400–600, SOFT 50). For H1/H2 and oversized numerals.
- Body: **Instrument Sans** (400/500). Everything else.
- Data: **JetBrains Mono** (400/500). Prices, dates, distances, EPC, calculator outputs, table numerals.
- Self-hosted via Fontsource files in `assets/fonts/`. `font-display: swap`. Never Inter / Roboto / Arial / Open Sans / Lato / system-ui.

### Radius / shadow / focus
- `--rec-radius: 12px`, `--rec-radius-sm: 8px`. No other values.
- Shadow used **sparingly** for genuine elevation (sheet, dialog), never decoration.
- `--focus-ring`: single token, ≥3:1 contrast both sides, applied via `:focus-visible` only.
  It is a **box-shadow value** (`0 0 0 3px <color>`) — apply it as `box-shadow: var(--focus-ring)`.
  As `outline:` it is invalid at computed-value time and silently KILLS the global focus outline
  (found live ×29, fixed 2026-07-02; `r-focus-ring-as-outline` lints against return). Component
  outlines use `2px solid var(--accent)` — the same idiom as the global `*:focus-visible` in
  `base.css`. Removing an outline without a same-block replacement is linted (`r-focus-kill`);
  container-level `:focus-within` indicators are allow-listed with reasons, never silent.

### Motion
- One orchestrated reveal per page, CSS only.
- Cross-document View Transitions for list → detail (areas, house-types).
- All animation honours `prefers-reduced-motion: reduce` (global rule in `base.css`).

---

## 3. Bans (this list is authoritative — `CLAUDE.md` §9 defers here)

Do not ship any of these:

- Purple gradients on white.
- Uniform shadow-floated SaaS cards in a uniform grid.
- Centred hero with a single drop-shadowed CTA.
- Emoji used as icons.
- Generic stock-photo heroes.
- Seven-pastel palettes.
- Hover micro-interactions on every element.
- Drop-shadow-as-decoration.
- Hero KPI cards on a personal dashboard.
- Coloured left-border "pill" row indicators (use a background tint instead).
- Inline styles (always CSS classes).

If any of these appears, refactor before commit.

---

## 4. Verification

No screenshot / Playwright / Lighthouse step — the assistant has no browser. Verify in code, and the
developer confirms the visuals on-device.

Before merging any UI change:

1. Re-read the diff and reason through the layout (spans, grid tracks, specificity, token resolution).
2. `node tools/run-all-tests.mjs`: green. (`tests/tests.html` smoke checks are run by the developer.)
3. Keep each page true to its anchor — **Stripe-docs** or **Linear-dense**. If it could be mistaken for
   generic SaaS, redo it.
4. For anything that needs eyes (spacing, colour, alignment, motion), hand the developer one short note on
   what to check.

---

## 5. Five rules of the overhaul

Adopted at v2 plan adoption. Every page and component in the v2 overhaul must reinforce these:

1. **At-a-glance precedence** — every page answers its core question in the first 600 px of viewport. No scroll for the lead verdict.
2. **No isolated calculators** — every calculator on a page shares inputs from the canonical finances + criteria state (Supabase via `storage.js`) and updates together. The four siloed widgets on the old finances page were the anti-pattern.
3. **Always show, then explain** — numbers in mono come first; prose lives in `<details>` or a right-rail caption. Verdicts over essays.
4. **No graphic without a verdict** — every chart annotates an answer (e.g. *"you hit target in March 2027"*). No decoration. If a chart has no caption-as-answer, replace it with a number or remove it.
5. **Visual cues replace text** — banding (comfortable / stretch / tight / out-of-reach), coloured fit dots, money-flow bars instead of category lists. Existing accent / ink / paper palette only; derive shades via `color-mix`. Never a seven-pastel palette to differentiate categories.

---

## 6. Responsive doctrine

The contract for the systematic mobile-responsiveness overhaul. Enforced where mechanical by
`tools/lint-responsive.mjs` (count-based baseline in `tools/lint-responsive.allow.json`, wired into
`node tools/run-all-tests.mjs`); the rest is hand-off + device QA.

1. **Breakpoints — `min-width` only.** Canonical **480 / 768 / 1024 / 1280**. Layout `max-width` media
   queries are banned (`r-no-max-width-media`); `prefers-*`, `orientation`, and `*-height` queries are
   exempt — those are the sanctioned short-viewport queries, not layout breakpoints. 480 =
   phone-landscape/phablet (1→2 col); 768 = tablet portrait (iPad 768/810/834 all land here); 1024 =
   tablet-landscape/laptop (sticky rails/TOC spine); 1280 = outer gutters / 3-up only.
2. **iPad 600–800 band rule.** No layout transition may land inside 600–800. Two-step grids only: 1→2 at
   480, 2→N at 768. Anything currently breaking at 540/600/640/720/800/899/900/960 moves to 480 (only if
   it truly fits phone-landscape) or 768.
3. **Landscape / short-viewport — two axes.** *Width:* every fixed/sticky/full-bleed element uses
   `max(<scale>, env(safe-area-inset-left))` and `-right` (the notch goes to the side in landscape), plus
   `-top`/`-bottom`. *Height:* full-height regions use `@media (max-height: 600px)` (add
   `and (orientation: landscape)` only where it must not also fire on a short *portrait* phone) to drop
   vertical padding to `--space-2/3`, collapse decorative panels, cap modal/sheet/lightbox chrome, and
   make full-height splits scroll. Height query, not orientation alone — tall tablets-in-landscape must
   not be penalised.
4. **Touch targets** ≥ **44×44** (`--tap-min`); absolute floor 24×24 (`--tap-min-floor`) with ≥24px
   spacing. Sub-controls may be 32px only when spaced ≥24px apart. `r-tap-target` flags interactive
   selectors carrying a literal size < 44px.
5. **`dvh`/`svh`** for full-height regions — `dvh` for live height, `svh` only where layout must not jump
   as browser chrome hides (peek-sheets); never raw `vh` (`r-no-raw-vh`); one idiom per element.
6. **Container-query-first for components** (`container-type: inline-size`); media queries reserved for
   page-level layout. Keep the sanctioned `@container card (max-width: 360px)`.
7. **No inline `style=`** in markup or JS-emitted HTML (`r-no-inline-style-attr`, `r-no-style-assign`).
   Static → a CSS class in the relevant partial. Genuinely dynamic numeric values →
   `el.style.setProperty('--x', v)` + a CSS rule consuming `var(--x)` (the existing
   `--seasoning-pct`/`--marker-pct` pattern). `.style.setProperty('--…')` is the one allowed JS style call.
8. **SVG charts** keep `viewBox` + `preserveAspectRatio`, sized `width: 100%; height: auto` (+`max-height`);
   JS draws in viewBox space and sets no pixel root size. **Fixed `px` font-size is allowed only on SVG
   `text`** (the `r-no-fixed-font-px` convention): in CSS, a rule that also sets `fill:` (SVG-text styling);
   in JS, the SVG-drawing modules `assets/js/**/section-*.js` and `*-visuals.js`. Everywhere else, fixed-px
   font-size is flagged.
9. **iOS input-zoom.** Any focusable control (`input`/`select`/`textarea`) resolves to **≥16px** effective
   font at mobile, or Safari zoom-jumps on focus. Floor relevant `clamp()` minimums at `1rem`.
10. **Reduced motion.** All transitions/animations honour `@media (prefers-reduced-motion: reduce)`.
11. **Modal a11y.** Fullscreen-rebased dialog/sheet/drawer must focus-trap, set background `inert`, and
    lock scroll while open. Any part living in guard-railed JS is surfaced as a §14 item, not skipped.

### Full-bleed widths
`100vw` is banned (`r-no-100vw`); the fix is **`100%`** (scrollbar-aware), never `100dvw` — `100dvw`
re-introduces the horizontal-scroll overflow the rule exists to eliminate. Gutter math
(`calc(100vw - …)`) migrates to `calc(100% - …)`.
