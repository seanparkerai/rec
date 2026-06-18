# finances/

This directory holds the Finances page's section renderers and chart helpers.

## Structure

- **Section renderers** (`section-*.js`) — render DOM tiles, tables, and charts for each section of the finances page: Deposit, Breakdowns, Flow, Later, ISA Attribution, Deposit Risk, and v3 Charts.
- **Chart helpers** (`chart-helpers.js`) — shared utilities for Chart.js configuration, month label formatting, and stub-state rendering for when historical data is unavailable.
- **Pure calculators** (`calc-*.js`) — guard-railed per CLAUDE.md §16; compute deposit progress, mortgage rates, LISA bonuses, savings velocity, outlay breakdowns, and affordability metrics. Never directly touched in feature work. Re-exported by `assets/js/finances.js`.

## Data flow

Calculators (`calc-*.js`) compute aggregates from household data → sections import calculators and format/DOM helpers → sections render interactive charts and DOM. No direct database calls; data flows through the caller.

For the live file list, run `find assets/js/finances -name '*.js'`.

See docs/REPO_MAP.md for the whole-repo map.
