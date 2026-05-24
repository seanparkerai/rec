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

If any of these appears in a screenshot, refactor before commit.

---

## 4. Verification

Before merging any UI change:

1. `node tools/verify-ui.mjs` — screenshots every page at 320 / 375 / 768 / 1280 in light + dark + reduced-motion under `artifacts/screenshots/<task>/`.
2. axe-core CLI: zero serious/critical violations on the changed pages.
3. Lighthouse: Perf ≥90, A11y ≥95, BP ≥95, SEO ≥90.
4. `tests/tests.html`: all green.
5. Eyeball the screenshot grid: each page reads as **Stripe-docs** or **Linear-dense** per its anchor. If it could be mistaken for generic SaaS, redo it.
