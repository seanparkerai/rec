# listings/ — v3 listings engine: UI & logic

**Domain:** The Rightmove listings feed: classification, fit-scoring, reaction capture, suppression, filtering, formatting, and the detail/navigation UI.

**Naming convention:** Functional split — `classify.js`, `fit.js`, `reactions.js`, `suppress.js` (pure logic: no DOM, no Supabase, no network; run in Node tools AND the browser). UI/control modules: `controls.js`, `detail.js`, `nav.js`, `reactions-ui.js`, `rating-ui.js`, `picker-state.js`, etc.

**Entry points & architecture:**
- `classify.js` — property-type allow/reject rules (houses vs. flats). Fingerprinting for duplicate suppression. Pure; used in browser AND the fetcher tool.
- `fit.js` — v3 L2 scoring: affordability gate + soft signals (beds, type, LISA, EPC, learned preferences) → 5-band verdict + contributions breakdown. Pure.
- `reactions.js` — reaction vocabulary (like, pass, reject), reasons, validation. Pure; used in browser AND tests.
- `fetch.js` — "Pull listings" buttons; triggers the server-side GitHub workflow via the RPC `request_rightmove_fetch`.
- `controls.js`, `detail.js`, `nav.js`, etc. — UI wiring for feed display, property detail, navigation, suppress/react interactions.

**Key constraint:** Pure modules have NO DOM, NO storage, NO fetch — they import cleanly in Node (tools/fetch-listings.mjs). UI modules are browser-only.

**Live file list:** `find assets/js/listings -name '*.js' | sort`

See docs/REPO_MAP.md for the whole-repo map.
