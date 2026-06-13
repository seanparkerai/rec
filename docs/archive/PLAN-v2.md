# `rec` — v2 Overhaul Plan (deliverable)

> **STATUS: v2 COMPLETE (2026-05)** — All phases shipped. v3 Outreach also shipped. Code-quality refactor (Phases 0–9 of `REFACTOR_PLAN.md`) also complete (2026-05). Current active plan: Phase 10 (Supabase sync hardening) tracked in `docs/CHECKLIST.md`.
>
> **Note (2026-05-27):** User-state JSON files (`data/finances.json`, `data/criteria.json`, etc.) referenced in this document have been removed from the repo in the data security refactor. They live exclusively in Supabase. References in this document are historical.


## Context

`rec` is a zero-build static site for a UK first-time buyer (Hampshire/Wiltshire). The data layer is rich — `data/finances.json` holds income, take-home, savings velocity, expenses, post-move outgoings, mortgage assumptions; `data/criteria.json` holds budget and offer strategy; per-area files (`data/areas/<id>.json`) carry prices, council tax bands, schools, transport, sources. The current pages render that data *informationally* (definition lists, tables, four isolated calculators) — never as a *decision surface*. The single most important question a first-time buyer asks — *"can I afford a £X house, and what does it do to my month?"* — has no answer on the site today.

v2 overhauls the seven existing pages to be visual-first and adds a small intelligence layer (affordability, money-flow, savings-velocity) that the surfaces consume. Live listings, real outreach, and an LLM front end are **out of scope** — they get polished placeholder pages so the IA reflects the eventual shape without spending time on features that need maintaining.

## Verified state of the repo

| Concern | Reality | Implication |
| --- | --- | --- |
| Pages | 7 exist: `index.html`, `pages/{finances,areas,area-detail,map,journey,house-types,about-search}.html` | About-search is out of scope; the other six get overhauled |
| Page modules | One `page-*.js` per page; auto-init pattern | Edit in place; no router work |
| Calcs | `assets/js/finances.js` exports `calcMonthlyMortgage`, `calcSDLT`, `calcLTV`, `lisaEligible`, `calcLISABonus`, `calcDepositProgress`, `calcMonthsToTarget`, `projectSavings`, `totalInitialOutlay` | **Reuse, do not duplicate** |
| Storage | `assets/js/storage.js` exposes `getFinances/getCriteria/getProfile/getAreas/getAreaDetail/getHouseTypes/getShortlist/saveShortlist/...` | Use it; no direct localStorage in page modules |
| Data shape | `finances.json` already has `monthlyOutgoingsPostMove` (bills + expenses + mortgage + total) | Post-move story is real data |
| Formatters | `gbp/gbpPence/pct` are duplicated inline in page modules | New `assets/js/format.js` + a refactor pass |
| Areas index | `data/areas.json` lacks prices/council-tax-band; per-area files have them | `tools/build-areas.mjs` extended to bake a summary |
| Design system | `DESIGN.md` anchors: **Stripe-docs** (editorial) and **Linear-dense** (data). Tokens in `assets/css/tokens.css` (OKLCH, fluid type, 4px spacing). 11 component CSS files | No new tokens, no new dependencies |
| Tests | `tests/tests.html` + `tests/assert.js` + `tests/schemas.js`; benchmarks for finance calcs already in place | Append new tests in same pattern |
| Tooling | `tools/area-status.mjs`, `tools/build-areas.mjs`, `tools/insert-content.mjs`, `tools/run-intelligence-tests.mjs` all real | Use as is |
| CLAUDE.md | Sections numbered through §13 | §14/§15/§16 are free |
| Missing pages | `pages/{listings,outreach,ask}.html` and `docs/{INTELLIGENCE_RULES,ROADMAP}.md` do not exist | Created in Phase 1/5 |

## Five rules of the overhaul (added to DESIGN.md)

1. **At-a-glance precedence** — every page answers its core question in the first 600 px of viewport.
2. **No isolated calculators** — every calculator on a page shares inputs from `finances.json` + `criteria.json` and updates together.
3. **Always show, then explain** — numbers in mono come first; prose lives in `<details>` or right-rail caption.
4. **No graphic without a verdict** — every chart annotates an answer (e.g. "you hit target in March 2027"); no decoration.
5. **Visual cues replace text** — banding (comfortable/stretch/tight/out-of-reach), coloured fit dots, money-flow bars instead of category lists. Existing accent/ink/paper palette only; derive shades via `color-mix`.

Bans appended: hero KPI cards on a personal dashboard; coloured left-border "pill" row indicators (use background tint); inline styles (always CSS classes).

## Out of scope for v2 (do not touch)

- Live property listings (Rightmove/Zoopla/OnTheMarket/Apify/Land Registry).
- Email automation, mailto drafting, broker/agent outreach.
- LLM integration, natural-language query parsing, Claude API calls.
- New dependencies, build steps, frameworks, backend, auth.
- `assets/css/tokens.css` colour/type/spacing values.
- Deploy workflow.
- `pages/about-search.html` (untouched in v2; revisit in v3).
- `pages/profile.html` and `pages/criteria.html` (untouched in v2; revisit in v3). *Decision recorded at plan adoption: existing four-input model on those pages survives unchanged for now; the new affordability widget lives on Finances/Dashboard.*

---

## Phase 1 — Constitution + design rules · ~0.5 ev

**Goal**: ratify operating rules before any code moves.

**Files**:
- `CLAUDE.md` — append three sections (numbers verified free):
  - **§14 Plan Mode contract** — every plan must list (a) files to edit with sections inside each, (b) order of operations, (c) test impact, (d) explicit out-of-scope. Diverging mid-execution means stop and re-plan.
  - **§15 Subagent contract** — subagents may not spawn sub-subagents, may not open headed browsers, may not start long-running processes. One level of delegation; main thread orchestrates.
  - **§16 Out-of-scope guard rails** — these files are NEVER touched by feature work: `assets/css/tokens.css`, `assets/js/storage.js`, `assets/js/config.js`, `assets/js/data-loader.js`, `assets/js/finances.js` (extend, don't rewrite), `data/schema/area.schema.json`, `.github/workflows/*`. Touching any of these is its own phase.
- `DESIGN.md` — append new section "Five rules of the overhaul" (use next available section number; do not renumber existing sections). Append three new bans to the bans list.
- `docs/INTELLIGENCE_RULES.md` *(new)* — affordability rule constants and their sources:
  - Income multiple bands: ≤4.5× (comfortable), ≤5.0× (stretch), ≤5.5× (tight). Source: HSBC, Halifax, Barclays published norms 2024–2026.
  - Stress-test rate: assumed rate + 3 pp. Source: PRA stress-testing guidance.
  - Payment-to-take-home bands: ≤35% (comfortable), ≤45% (stretch), ≤50% (tight).
  - Post-move spare cash floors: ≥£400/mo (comfortable), ≥£100/mo (stretch).
  - LISA cap: £450k property price (statutory).
  - LTV tiers (rate cliffs): 60/75/85/90/95.
- `docs/ROADMAP.md` *(new)* — one-pager listing v3 features (live listings, outreach, ask) with what each will do and what data it'll need.

**Tests**: `tests/tests.html` re-run — no code changed, must still pass.

**Acceptance**: docs render in `tests` page-reachable checks; no functional change. Commit: `docs: phase 1 — constitution + design overhaul rules`.

---

## Phase 2 — Intelligence engine · ~1 ev

**Goal**: three pure modules and shared formatters, fully tested before any UI consumes them.

**Files (new)**:
- `assets/js/format.js` — `gbp(n)`, `gbpPence(n)`, `pct(n, decimals=0)`, `monthsAsDuration(n)` (→ `"1y 3m"`), `dateFromMonths(n, from?)`. Replace inline duplicates in `page-home.js`, `page-finances.js`, `page-areas.js`, `page-area-detail.js`, `page-journey.js`, `page-house-types.js` (mechanical edit; same return values).
- `assets/js/affordability.js` — exports `assessAffordability({ price, finances, criteria, councilTaxBand? })`. Pure. Composes `calcMonthlyMortgage`, `calcSDLT`, `calcLTV`, `lisaEligible` from `finances.js`. Returns `{ verdict, headline, maxBorrowEstimate, maxPropertyAtCurrentDeposit, maxPropertyAtTargetDeposit, loanRequired, ltvPct, ltvTier, depositGapToTier, monthlyPI, monthlyPIStressed, monthlyTotal, monthlySpareAfter, monthlySpareNow, spareDelta, bandSignals: { incomeMultiple, paymentToIncome, stressedPaymentToIncome, lisaEligible }, whyVerdict: string[] }`. Rule constants imported at top from `docs/INTELLIGENCE_RULES.md` values (literal duplication is fine — it's a few numbers).
- `assets/js/money-flow.js` — exports `getMoneyFlow(finances)` and `getMoneyFlowPostMove(finances, monthlyMortgage)`. Pure. Returns inflows/buckets shape ready for stacked-bar rendering.
- `assets/js/savings-velocity.js` — exports `getSavingsVelocity(finances, scenarios?)`. Wraps existing `projectSavings`. Default scenario set: ±£100/mo, ±£200/mo, ±£500/mo, £5k windfall, £10k windfall, "target +£20k". Returns `{ baseline: { etaDate, etaMonths, projection[] }, scenarios: [...], cliffs: { lisaMax } }`.

**Files (modified)**:
- `tests/tests.html` — register a new test module. Pattern matches existing inline `test()` calls.
- `tests/affordability.test.js` *(new)* — hand-computed cases:
  - hand-computed cases spanning each verdict band (comfortable → out-of-reach)
  - LISA-eligibility edges either side of the statutory cap (eligible just under, ineligible just over)
  - a high-stressed-rate case → `whyVerdict` flags the stress test
- `tests/money-flow.test.js` *(new)* — flow sums equal take-home; post-move spare = take-home − bills − expenses − mortgage.
- `tests/savings-velocity.test.js` *(new)* — baseline ETA matches `calcMonthsToTarget`; +£500/mo shortens by expected delta.

**Out of scope**: any HTML/CSS; any consumer of these modules.

**Acceptance**: all new tests green; the verdict for the default finances at the household's offer target resolves as expected (see `tests/affordability.test.js`). Commit: `feat: phase 2 — intelligence engine (affordability, money-flow, savings-velocity, format)`.

---

## Phase 3 — Dashboard overhaul · ~1.5 ev  · *Linear-dense*

**Goal**: `index.html` becomes a single-glance decision surface.

**Files**:
- `index.html` — replace bento contents (preserve `<main id="main">` and shell partials).
- `assets/js/page-home.js` — rewrite render functions; import `affordability.js`, `money-flow.js`, `savings-velocity.js`, `format.js`.
- `assets/css/dashboard.css` — append (do not refactor existing rules): `.ladder`, `.ladder__band`, `.ladder__marker`, `.flow`, `.flow__seg`, `.journey-track`, `.scenario-chip` and dark-mode variants. All values via tokens.

**Tiles, in order**:
1. **Lede strip** (full width, ~180 px) — single editorial line synthesised from criteria (property type, region, target price and deposit ETA); right-side 4-mono-numeral mini-strip from existing lede.
2. **Deposit story** (2/3 left) — banded arc (bank/LISA/projected-compound via `color-mix`), inline horizontal stacked bar for "where this month's take-home goes", ETA below. **Scenario chip row** at the foot: `+£200/mo · +£500/mo · +£5k windfall` — clicking animates the arc to the alternate state (CSS transition only, no library).
3. **Affordability verdict** (1/3 right) — horizontal price ladder spanning the search budget range, banded comfortable/stretch/tight/out-of-reach, marker at `offerTarget`. Single-sentence verdict in display font. Two **ephemeral** "what about £X?" inputs that slide the marker. *(No persistence — confirmed.)*
4. **Money-flow** (full width) — side-by-side **today vs after-move** flows. Pure SVG (stacked horizontal bars, segment widths proportional to monthly amounts; inline mono labels). The "after" panel highlights the new mortgage segment and shrunk spare. Caption: the spare-cash drop after the move (e.g. "Spare drops from £X to £Y/mo."). Tapping a segment expands its line items in a `<details>` below.
5. **Shortlist with fit dots** (5 cols left) — each row a coloured circle from `assessAffordability` against that area's `prices.avg<BedType>` (em-dash when absent).
6. **Journey track** (7 cols right) — single horizontal track viewing→process→moving with milestone dots and a pulsing current position. Below the track: the single next action across all three lists with a tick button. Reusable as a shared component for Phase 4c.
7. **Criteria-as-prose + spec strip** (full width) — one English sentence synthesised from `criteria.json`, with a compact mono strip below.
8. **Ask-anything placeholder** (full width, muted) — disabled input with caption "Ask anything — coming in v3"; links to `pages/ask.html` once Phase 5 lands.

**Implementation notes**:
- Ladder and money-flow: pure inline SVG (no D3, no Chart.js). Mortgage/scenario charts: keep Chart.js (already loaded).
- Hover/tap interactions respect `prefers-reduced-motion`.

**Acceptance**: harness green; no horizontal scroll at 320 px (existing tests cover this); changing `offerTarget` in `finances.json` moves the marker and verdict; developer eyeballs the page. Commit: `ui: phase 3 — dashboard overhaul (linear-dense)`.

---

## Phase 4 — Existing pages overhauled

### Phase 4a — Finances · ~1 ev  · *Linear-dense*

**Files**: `pages/finances.html`, `assets/js/page-finances.js`, `assets/css/dashboard.css` (append).

**Now panel**:
- Replace the existing definition-list trio (Income/Goal/Savings) with one full-width money-flow diagram (same component as the dashboard).
- Bills/expenses/shopping-list/gift-cards tables stay, but each row gains a sparkbar (CSS-only `<div>` with a width %).
- Existing hero ring → richer deposit-story tile (LISA band visible).

**Later panel**:
- Side-by-side now-vs-after outgoings (money-flow component).
- **Unified affordability widget** replacing the four siloed calculators: one price slider (default = `offerTarget`); below, a mono grid showing required deposit · loan · LTV (with band-tier) · SDLT · LISA eligibility · monthly P&I · stressed P&I · post-move spare. Verdict pill colour-banded. All consumed from `assessAffordability`. The four old fieldsets are **removed**, not kept alongside.
- Savings-velocity line chart with 3–4 ghosted scenarios + baseline (Chart.js). Title: "What if…"
- One-time costs / shopping / gift-cards become `<details>` collapsible.

**Acceptance**: all four old calculator inputs still resolvable through the new widget (parity check in `tests/affordability.test.js`). Commit: `ui: phase 4a — finances overhaul (linear-dense)`.

### Phase 4b — Areas + area detail · ~1 ev  · *Linear-dense + Stripe-docs*

**Files**:
- `tools/build-areas.mjs` — extend to bake a `priceSummary` block (avgDetached/Semi/Terraced/Bungalow + `asOf` date) and `councilTaxBand` from each per-area file into the index entry. Re-run the tool; commit the regenerated `data/areas.json`.
- `data/schema/area.schema.json` — the index schema (if formalised) gains `priceSummary` and `councilTaxBand` optional fields. (Per-area schema already has them; do not touch.)
- `pages/areas.html` + `assets/js/page-areas.js`:
  - Add columns: fit dot (computed via `assessAffordability` against `priceSummary.avg<MatchingBedType>`), bed-fit, council tax band — all sortable.
  - Filter pills extend with `Fit: comfortable / stretch / tight`.
  - Compare drawer: select 2–4 areas → drawer slides up with side-by-side mono columns.
- `pages/area-detail.html` + `assets/js/page-area-detail.js`:
  - Verdict strip across the top (accent-soft, mono numerals).
  - Re-order page: facts grid first, prose collapsed into `<details>` below.
  - Schools list gains Ofsted dots inline. Transport gains coloured commute bands.
  - Page-foot mini affordability widget (slider) tied to the same engine.

**Acceptance**: index regeneration leaves data identical except for the new fields. `tests/schemas.js` extended to validate the new index shape. Commit: `ui: phase 4b — areas overhaul (linear-dense + stripe-docs)`.

### Phase 4c — Journey + map + house-types polish · ~0.5 ev

**Journey** (`pages/journey.html` + `page-journey.js`): replace three vertical checklists with a single horizontal track (the same component as the dashboard tile) + a top progress band + a next-action row.

**Map** (`pages/map.html` + `page-map.js`): colour-code markers (shortlisted = full accent; researched = accent-soft; partial = paper-3 outline; stub = hairline). Marker popups gain fit dot + council tax band + link to detail. Add a corner legend.

**House types** (`pages/house-types.html` + `page-house-types.js`): fill in the page — gallery cards with image, type name, typical price band for the user's search area (cross-reference `house-types.json` × `priceSummary` from the new areas index), and "found in N of your shortlisted areas".

**Acceptance**: harness green; developer eyeballs each page. Commit: `ui: phase 4c — journey + map + house-types polish`.

---

## Phase 5 — Placeholder pages · ~0.5 ev  · *Stripe-docs*

**Files (new)**:
- `pages/listings.html` (~80 lines) — "Live listings" page mock. Eyebrow "Coming in v3", h1, lead, muted illustration zone (single accent-soft block, mono caption — no emoji, no stock graphic), 4–6 bullet "what this will do" list, three dimmed example rows mocked in the eventual listings-list style, disabled "Notify me when ready" button, roadmap footer linking `docs/ROADMAP.md`.
- `pages/outreach.html` (~80 lines) — three card placeholders for viewing-request, mortgage-broker-intro, post-viewing-followup templates, each with example subject + disabled Copy button.
- `pages/ask.html` (~80 lines) — disabled NL input + suggestion-chip examples (a natural-language property query, etc.).

**Files (modified)**:
- `components/nav.html` — final link order: `Home · About · Areas · House Types · Listings (soon) · Ask (soon) · Finances · Journey · Map · Outreach (soon)`. `(soon)` is a small mono superscript in muted ink (CSS, not text content).
- Phase 3's ask-anything placeholder slot now `href`s `pages/ask.html`.

**Acceptance**: three pages render at all breakpoints in both themes (developer-reviewed); `tests/tests.html` page-reachable checks updated to include them. Commit: `feat: phase 5 — placeholder pages for v3 capabilities`.

---

## Phase 6 — Verification + polish · ~0.5 ev

**Scope**:
- No screenshot / axe / Lighthouse step (see CLAUDE.md §13) — verify in code; the developer reviews
  visuals by eye in the browser.
- `README.md` feature list updated to reflect v2.
- Final `node tools/run-intelligence-tests.mjs` run.
- Tag `v2.0`.

**Acceptance**: code review + harness green; developer has eyeballed the pages; release tagged. Commit: `chore: phase 6 — verification pass; tag v2.0`.

---

## Implementation notes / risks

- **Areas index bloat**: baking `priceSummary` + `councilTaxBand` into `data/areas.json` grows it from ~85 KB to ~120 KB (estimated). Acceptable for one fetch on a static site; defer further optimisation.
- **SVG vs Chart.js**: ladder, money-flow, and journey-track are pure SVG (no library). Line charts (savings projection, scenarios) keep Chart.js (already loaded). Do not introduce a third charting solution.
- **Shared journey component**: the same renderer powers the dashboard tile (Phase 3) and the journey page (Phase 4c). Build once in Phase 3, lift to a shared module in Phase 4c.
- **Reduced motion**: every transition (arc animation, scenario chip morph, journey pulse) honours `prefers-reduced-motion: reduce` via a single global rule already present in `base.css`.
- **Ephemeral scenario inputs**: confirmed — typing in the ladder's "what about?" input updates the marker but does not persist. No `saveCriteria` call.
- **Phase 1 first**: docs-only Phase 1 ratifies guard rails before any other phase touches code; the §16 list is referenced by every subsequent phase to know what's untouchable.

## Verification commands (per phase)

```bash
# Module test harness (assistant runs this)
node tools/run-intelligence-tests.mjs

# Local server (for the developer's own browser review + the browser smoke suite)
python3 -m http.server 8000
open http://localhost:8000/tests/tests.html   # eyeball: all green

# Area progress (no behavioural impact in v2 but used by Phase 4b)
node tools/area-status.mjs

# Rebuild index (Phase 4b only, after extending build-areas.mjs)
node tools/build-areas.mjs
```

Visual review is done by eye in the browser by the developer — there is no screenshot/Playwright step
(see CLAUDE.md §13).

## Resume protocol

When picking this up cold:
1. Read this plan top-to-bottom.
2. `git log --oneline -20` to see which phase commits have landed.
3. `node tools/area-status.mjs` for content state (orthogonal but useful context).
4. Open `tests/tests.html` — must be green before starting a new phase.
5. Start the next unfinished phase via the runbook below.

## Execution runbook (paste this above each phase prompt)

> Read `CLAUDE.md` and `DESIGN.md` first, including the new sections added in Phase 1 (§14/§15/§16 of CLAUDE.md and the five rules in DESIGN.md). Honour them without exception.
>
> This is an overhaul of an existing static site. Do not touch the files listed in CLAUDE.md §16. Do not introduce new dependencies, build steps, frameworks, or backend. Do not implement live listings, real outreach, or an LLM — the relevant phase says exactly what "placeholder" means.
>
> Produce a plan in CLAUDE.md §14 format: files to edit with specific sections per file, order of operations, test impact, explicit out-of-scope list. If you find yourself wanting to refactor outside the named scope, stop and re-plan. Run `tests/tests.html` after every batch of edits and before each commit.
>
> Do this phase only. Wait for approval before edits. When approved, execute, run the test harness, commit with the message shown at the foot of the phase, and stop.
