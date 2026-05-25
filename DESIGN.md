# DESIGN.md — Visual direction for "rec"

The single source of truth for how this app looks. Read this before any UI change. Name the relevant **anchor** in every UI commit message.

---

## 1. Anchors

Two named anchors. Every view is one or the other — never both, never neither.

### Stripe-docs (long-form, editorial)
For content-led views: `pages/profile.html`, `pages/area-detail.html`, `pages/house-types.html`, `pages/journey.html`.

- Single-column reading width (≤68ch) on mobile, two-column (content + sticky rail) ≥768 px.
- Display headings in Fraunces with optical sizing; generous leading (1.5–1.6 body, 1.15 display).
- Surfaces almost monochrome; accent reserved for primary action and active state.
- Hairline rules, not boxes. No shadow-floated cards.
- Inline figures with caption + licence; sources as footnotes with tap previews.

### Linear-dense (data-rich UI)
For tools and data: `index.html`, `pages/criteria.html`, `pages/areas.html`, `pages/finances.html`, `pages/map.html`.

- Compact rhythm: tight rows, dense tables, monospace numerals.
- Asymmetric / bento layouts — never a uniform grid of identical cards.
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

### Motion
- One orchestrated reveal per page, CSS only.
- Cross-document View Transitions for list → detail (areas, house-types).
- All animation honours `prefers-reduced-motion: reduce` (global rule in `base.css`).

---

## 3. Bans (verbatim from `CLAUDE.md` §9)

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
2. `node tools/run-intelligence-tests.mjs`: green. (`tests/tests.html` smoke checks are run by the developer.)
3. Keep each page true to its anchor — **Stripe-docs** or **Linear-dense**. If it could be mistaken for
   generic SaaS, redo it.
4. For anything that needs eyes (spacing, colour, alignment, motion), hand the developer one short note on
   what to check.

---

## 5. Five rules of the overhaul

Adopted at v2 plan adoption. Every page and component in the v2 overhaul must reinforce these:

1. **At-a-glance precedence** — every page answers its core question in the first 600 px of viewport. No scroll for the lead verdict.
2. **No isolated calculators** — every calculator on a page shares inputs from `data/finances.json` + `data/criteria.json` and updates together. The four siloed widgets on the current finances page are the anti-pattern.
3. **Always show, then explain** — numbers in mono come first; prose lives in `<details>` or a right-rail caption. Verdicts over essays.
4. **No graphic without a verdict** — every chart annotates an answer (e.g. *"you hit target in March 2027"*). No decoration. If a chart has no caption-as-answer, replace it with a number or remove it.
5. **Visual cues replace text** — banding (comfortable / stretch / tight / out-of-reach), coloured fit dots, money-flow bars instead of category lists. Existing accent / ink / paper palette only; derive shades via `color-mix`. Never a seven-pastel palette to differentiate categories.
