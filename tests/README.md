# Test Harness — Pure-JS Intelligence Tests

Node/browser regression tests for calculations, schemas, storage, and Supabase sync. The harness is
**zero-framework** — each test file exports a `register({ test, assert, assertEqual, fixtures })`
function.

## Structure

- **`<domain>.test.js`** — one test file per domain (finance, affordability, area schemas, etc.);
  register all suites via the common harness interface.
- **`assert.js`** — minimal assertion helpers (`test`, `assert`, `assertEqual`, `assertDeep`) +
  render function for browser output. No external dependencies.
- **`schemas.js`** — JSON schema validators (`validateAreaDetail()`, etc.); support utility for
  checking data shape correctness.
- **`tests.html`** — in-browser test harness; served locally (`python3 -m http.server`) for manual
  smoke checks.
- **`characterization-*.test.js`** — snapshot-based regression tests that pin existing render
  output as baselines; used to detect unintended changes.

## Running Tests

- **Node harness** (CI + local): `node tools/run-all-tests.mjs` or `npm test`
  — runs all `*.test.js` + the offline Supabase sync test.
- **Browser harness** — open `tests/tests.html` over HTTP for interactive results (includes
  storage + DOM shape checks).
- **Sync tests** — `tests/supabase-sync.test.js` runs offline assertions against committed snapshots
  (online MCP assertions reported as skipped; run via the connector at session start/end per
  CLAUDE.md §8/§18).

For the live test list, run `find tests -name '*.test.js'`.

See docs/REPO_MAP.md for the whole-repo map.
