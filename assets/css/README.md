# CSS Architecture — Tokens-First Design System

Pico CSS v2 base + project tokens + ordered component imports. All colour, spacing, type, and
radius values are CSS custom properties in `tokens.css` — never hard-coded.

## Structure

- **`tokens.css`** (guard-railed) — design tokens: hues (OKLCH), surfaces, accent, semantic
  aliases, Pico-v2 mapping. Single accent colour + one danger colour. Dark mode via auto
  `prefers-color-scheme` or manual `data-theme="dark"`.
- **`fonts.css`** — font-face declarations (sans, serif, mono).
- **`base.css`** — global layout (header, nav, footer, container) + `@import` shell for component
  primitives.
- **`dashboard.css`** (guard-railed, order-sensitive) — `@import` shell for dashboard-specific
  partials and page-specific overrides.

## Components & Pages

- **`components/*.css`** — primitives (card, tile, sheet, chip, segmented, table, field, dialog,
  save-bar, filter-sheet, toc, finance-stage).
- **`pages/*.css`** — per-page overrides; some are themselves `@import` shells over subfolders
  (e.g. `pages/finances/`).

## Design Contract

Read **`DESIGN.md`** for the visual anchors, responsive breakpoints (320/480/768/1024/1280 px),
type scale, spacing scale, focus states, motion rules, and banned patterns. Every UI change must
reinforce the "calm precise editorial" direction.

For the live file structure, run `find assets/css -name '*.css' | sort`.

See docs/REPO_MAP.md for the whole-repo map.
