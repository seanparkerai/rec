# Shared Components — Fetch-Injected HTML Partials

Reusable page components (header, nav, footer) fetched and injected into every page via
`assets/js/components.js`. Zero-build, no framework.

## Structure

- **`header.html`** — site branding, theme toggle, user display, sign-out button. Injected at
  `<div id="app-header">`.
- **`nav.html`** — mobile drawer + desktop nav menu. Injected at `<div id="app-nav">`.
- **`footer.html`** — page footer. Injected at `<div id="app-footer">`.

## Patterns

Components are **plain HTML** with inline event handlers (`data-nav`, `id=nav-toggle`, etc.)
wired via `components.js`. They inherit design tokens and Pico CSS styling from the app's
stylesheet chain (`tokens.css` → `base.css` → `dashboard.css` or page-specific overrides).

All interactive elements use semantic HTML + ARIA attributes (buttons, nav landmarks, skip link).

## Deployment

Each component is fetched once on page load and cached in the DOM. Changes to a component file
require a browser hard-refresh (cache-bust).

See docs/REPO_MAP.md for the whole-repo map.
