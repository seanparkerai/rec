# Plan: Unify user data across the portal (finances/savings/profile)

## Context — why this is needed

Users see savings, name, job, outgoings and finances appear inconsistently across the portal —
correct in some places, empty/null/£0 in others — and the **Ask** assistant reports ~£0 saved when
the household actually has 30,000+ toward their deposit.

This is **not** a missing-data problem. The data is in Supabase. It's a **broken data contract**:
different parts of the system read the same logical value from *different field names*, and some
paths reimplement the savings math incompletely. Confirmed against real rows (read-only MCP query):

| household | cash `savings.current` | `savings.totalSavings` (stored) | Trading 212 ISA (earmarked) | What's wrong |
|---|---|---|---|---|
| `9628b44f` | £0 | — | **£32,994 @ 100%** | Ask reads cash only → reports "£0 saved" |
| `4deadb32` | £2,500 | — | £50,000 @ 100% | savings has legacy keys `_note`, `depositTarget`, `depositReached` |
| `f36e6215` | £0 | **£53,000** | — | onboarding wizard wrote £53k into the *derived-only* key `totalSavings`; every reader expecting `current` sees £0 |

### Root causes (all confirmed in code)

1. **No single source of truth for "deposit savings."** The browser dashboard uses
   `deriveFinances()` (`assets/js/finance-derive.js:94-102`), which correctly computes
   `totalSavings = cash savings + earmarked ISA`. The Ask edge function **reimplements** this in
   `supabase/functions/ask/pure.js:272-291` (`shapeFinancesSummary`) but reads only
   `savings.current` and **never fetches investments** (`prompt.ts:60-98` fetches
   criteria/finances/profile/shortlist/areas but **not** `investments_accounts`). This is the
   direct cause of the "£0 saved" Ask answer.

2. **`totalSavings` is a derived field being written as raw input.** The onboarding wizard
   (`assets/js/setup/steps.js:121`) writes `finances.savings.totalSavings`, but `deriveFinances`
   *computes and overwrites* that key from `savings.current` + investments. So a wizard-written
   value is silently zeroed on the next read (household `f36e6215`). The wizard also writes
   `finances.outgoings.monthlyEssentials` / `rentOrMortgage` (`steps.js:107-108`) — **fields no
   reader consumes** (the app reads itemized `ongoingBills[]`/`expenses[]`), and deposit target to
   `goals.deposit.target` while readers use `finances.goal.targetDeposit` / `criteria.budget.targetDeposit`.

3. **Not every page derives.** Page coordinators that call `deriveFinances` (page-home,
   page-finances, page-listings, page-property, page-saved-listings) render savings correctly. But
   `assets/js/page-profile.js:38` reads `finances.savings.totalSavings ?? .current` on **raw,
   underived** finances → `undefined`, then £0. Same class of bug anywhere finances is read without
   `deriveFinances({investments})`. This is why the same value shows differently per page.

4. **Silent fallback to stale/sample data** (`assets/js/storage/core.js`). When `household_id`
   can't be resolved (auth lag, RLS hiccup, no membership row), `_sbGet` returns `null`, background
   revalidation is skipped (`core.js:147`), and the user keeps seeing cached or `_SAMPLE` fixture
   data with no signal. Contributes to intermittent empties.

### Intended outcome
One canonical definition of every user-facing finance/profile value, computed in **one** place and
consumed identically by the dashboard, finances page, profile, and the Ask assistant — for **all**
households. Existing corrupted rows repaired. "Deposit savings" everywhere = **cash +
earmarked-ISA portion** (confirmed product decision).

---

## Phase 1 — Unify the savings/finance derivation (browser + edge parity)

**Goal:** the Ask assistant and every browser surface compute deposit savings the same way,
including the earmarked ISA.

- `supabase/functions/ask/prompt.ts` → `gatherContext()`: add `investments_accounts` to the
  parallel fetch (select the same columns as `getInvestments`, ~`data, provider, current_value,
  earmark_pct, account_type`), shape into the `{ trading212ISA: {...} }` form, and pass it into the
  finance summary.
- `supabase/functions/ask/pure.js` → `shapeFinancesSummary(raw, investments)`: compute
  `depositSaved = cash savings + earmarked-ISA portion`, **mirroring** `finance-derive.js:94-102`
  exactly (earmarkPct>0 ⇒ that %; else full value). `depositGap`/`monthsToTarget` derive from the
  corrected `depositSaved`. Also surface ISA so the model can name it.
- **Eliminate the drift risk:** extract the savings-total math (`finance-derive.js:88-109`) into a
  small **pure, shared helper** (e.g. `computeDepositSavings(finances, investments)`) that *both*
  `finance-derive.js` and the edge `pure.js` import, so they can never diverge again. (`pure.js`
  is already a shared browser/edge/test module; `finance-derive.js` is **not** in the §16 guard
  list, so it may be edited.) If a single import across the Deno/edge boundary proves impractical,
  fall back to mirrored code **pinned by a parity test** (Phase 4).
- Redeploy the `ask` edge function (`mcp__supabase__deploy_edge_function`).

**Representative files:** `supabase/functions/ask/prompt.ts`, `supabase/functions/ask/pure.js`,
`assets/js/finance-derive.js`.

## Phase 2 — One derived-finances loader for the browser; fix non-deriving readers

**Goal:** no page ever renders raw, underived finances.

- Add a tiny shared helper (e.g. `getDerivedFinances()` in a new `assets/js/finance-load.js`, or
  exported beside `deriveFinances`) that does the `getFinances` + `getInvestments` + `deriveFinances`
  dance once, so pages stop re-implementing it. Reuse existing `getFinances`/`getInvestments`
  (`assets/js/storage/user-state.js`) and `deriveFinances`.
- Convert finance-reading coordinators to use it. **Critical fix:** `assets/js/page-profile.js`
  (reads `totalSavings` on raw finances). Audit the other coordinators for the same pattern and
  route them through the helper.
- **Null-guard the display:** where a tile prints a figure (e.g. `finances/section-deposit.js:8`,
  `dashboard/tile-readiness.js:25`), ensure a missing value renders an explicit "—"/"not set"
  rather than a misleading `£0`, and pair any colour signal with text (CLAUDE.md §11).
- Make `tile-lede.js` go through `normalizeProfile()` like the other profile readers
  (`profile-schema.js`) so name/job/headline never read a legacy shape as empty.

## Phase 3 — Fix the onboarding wizard's write contract

**Goal:** the wizard writes only **canonical raw keys**, so onboarding data survives derivation.

- `assets/js/setup/steps.js`:
  - `finances.savings.totalSavings` → **`finances.savings.current`** (raw cash). (If a user's
    deposit lives in an ISA, that's captured via the investments step, not here.)
  - `finances.outgoings.monthlyEssentials` / `rentOrMortgage` → write to the structures the app
    actually reads: one labelled entry each in `finances.expenses[]` / `finances.ongoingBills[]`
    (the arrays summed by `money-flow.js` / `section-breakdowns.js`).
  - Deposit target → single source `finances.goal.targetDeposit` (what `finance-derive.js:104`
    reads); stop writing the parallel `goals.deposit.target`.
- Verify the save path (`saveFinances`) persists these via the normal `storage.js` write-through.

## Phase 4 — Tests (regression lock)

- **Parity test:** assert `shapeFinancesSummary(finances, investments).depositSaved` ===
  `deriveFinances(finances, {investments}).savings.totalSavings` across fixtures incl. the
  "£0 cash + earmarked ISA" case. Extend `tests/ask-tools.test.js` / `tests/finance-derive.test.js`.
- **Wizard-contract test:** the wizard's saved shape contains only canonical keys and round-trips
  through `deriveFinances` without losing the entered savings/outgoings/target.
- Update `data/fixtures/finances.sample.json` only if the canonical shape gains/loses a key
  (it already uses `current`, so likely no change).
- Run the full harness: `node tools/run-intelligence-tests.mjs` (includes Supabase sync tests).

## Phase 5 — One-time data repair (existing corrupted rows)

**Goal:** fix the live households without clobbering user-edited values (CLAUDE.md §18.5 —
Supabase wins; only *move misplaced* data, never reduce a populated field).

Per household, via `mcp__supabase__execute_sql`, **SELECT → review → UPDATE → re-SELECT**:
- `f36e6215`: move `savings.totalSavings` (£53,000) → `savings.current` (currently 0); remove the
  derived-only key `totalSavings`.
- `4deadb32` (+ any row): strip legacy/derived keys from `savings` — `_note`, `depositTarget`,
  `depositReached`, and any stored `totalSavings`/`savingsGap`/`monthsToSave`/`giftCardsValue`
  (these are recomputed by `deriveFinances`). Migrate `depositTarget` → `goal.targetDeposit` if a
  canonical target is missing.
- `9628b44f`: no savings value to move (cash legitimately £0; deposit is the ISA) — just confirm
  clean keys. The Ask fix in Phase 1 restores the "30,000+" answer.
- Update `data/snapshots/sync-state.json` high-water marks; finish with the §18.3 commit footer.

## Phase 6 (optional, separate named phase — touches §16 guard-railed file)

Harden `household_id` resolution in `assets/js/storage/core.js` so an unresolved id doesn't
silently strand the user on cached/`_SAMPLE` data: distinguish "no session yet" (retry) from
"no household" (surface), and don't suppress a genuine fetch error indefinitely. **`storage/*.js`
is guard-railed (CLAUDE.md §16) — extend, don't rewrite; this is its own approved phase**, kept
separate so the data-contract fixes (Phases 1–5) land first and independently.

---

## Out of scope
- `assets/css/tokens.css`, `assets/js/storage.js` shim re-exports, `assets/js/config.js`,
  `data-loader.js`, `finances.js`/`calc-*.js`, `dashboard.css`, `area.schema.json`,
  `.github/workflows/*` (CLAUDE.md §16) — except the explicit, separately-scoped Phase 6.
- Areas/house-types content and any non-finance/profile data.

## Verification (end to end)
1. `node tools/run-intelligence-tests.mjs` → green (parity + wizard + sync tests).
2. Redeploy `ask` edge function; via MCP, re-SELECT the households and confirm each savings blob
   has only canonical keys and the corrected `current`.
3. Sanity-derive each household: `deriveFinances(finances, {investments}).savings.totalSavings`
   should be 9628b44f ≈ £32,994, 4deadb32 ≈ £52,500, f36e6215 = £53,000.
4. Browser hand-off (no browser here, CLAUDE.md §13): on the dashboard, profile, finances pages and
   the Ask box, savings reads the same non-zero figure everywhere; ask "how much have I saved
   toward my deposit?" → returns ~£32,994 citing the earmarked ISA.
5. Commit + push with the §18.3 Supabase footer.
