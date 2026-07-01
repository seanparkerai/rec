# DATA_MODEL.md — rec data layer reference

Generated: 2026-05-26. Updated: 2026-06-02 (doc-privacy purge — personal values removed; field shapes kept).

> **This file documents data *shapes* (field names and purpose) only — never actual values.** All
> user-state data (profile, finances, criteria, goals, debts, investments, and Trading 212 imports) is
> **not** in the repo. References below to `data/profile.json`, `data/finances.json`, `data/goals.json`,
> `data/investments.json`, `data/imports/trading212-history.json`, etc. describe the **historical JSON
> shape** — those files no longer exist. The canonical store is **Supabase** (user-state tables,
> accessed via `mcp__supabase__execute_sql`; see `docs/SUPABASE_SYNC.md` §0 for the full table
> inventory). Redacted sample data for tests/fresh-install lives in `data/fixtures/*.sample.json`.

---

## File map

| File / Store | Purpose | Read by | Update cadence |
|------|---------|---------|---------------|
| **Supabase `profile`** | Buyer profile: person, employment, credit, lifestyle, deal-breakers, timeline | `storage.js` → `page-profile-detail.js` | Via MCP or portal save |
| **Supabase `finances`** | Income, deductions, bills, expenses, savings, shopping, gift cards, outgoings | `storage.js` → `page-finances.js`, `page-home.js`, `affordability.js`, `money-flow.js` | Via MCP or portal save |
| **Supabase `criteria`** | Search preferences: budget band, property types, features, area preferences | `storage.js` → `page-criteria.js`, `affordability.js`, `page-home.js` | Via MCP or portal save |
| **Supabase `goals`** | Deposit target, timeline, funding source | `storage.js` → `page-home.js`, `deposit-risk.js` | Via MCP or portal save |
| **Supabase `debts_*`** | Credit cards, student loan, other debts | `storage.js` → profile/finances surfaces | Via MCP or portal save |
| **Supabase `investments_accounts` / `investments_history`** | Deposit-fund account structure + transaction history | `storage.js` → `deposit-risk.js`, `page-home.js`, `page-finances.js` | After CSV import via `tools/import-trading212.mjs` |
| `data/fixtures/*.sample.json` | Redacted sample data for tests and fresh-install fallback | `tools/run-intelligence-tests.mjs`, `storage.js` (fallback) | Updated by Claude during refactors |
| `data/areas/*.json` | Per-area research (character, prices, schools, sources) | `page-areas.js`, `page-area-detail.js` | After area research |
| `data/areas.json` | Lightweight area directory index | `page-areas.js`, `page-home.js` | Rebuilt by `tools/build-areas.mjs` |

---

## `profile` shape

**Shape:** Nested object with sections for person, employment, credit, debts, pension, insurance, health.

**Key fields (names only — values live in Supabase):**
- `person.*` — identity (name, date of birth, address) and household details
- `employment.startDate`, `.probationStatus` — lender flags
- `creditProfile.scoresChecked` — boolean; with `_followUp` notes for unchecked scores
- `pension.employeeContributionMonthly` — monthly pension contribution (reduces take-home)

**`_followUp` fields:** Scattered across `creditProfile`, debts, and `pension`. Surfaced on the profile
page's "Things to check" section.

---

## `finances` shape

**Shape:** Flat + nested. Keep existing array keys unchanged when updating.

**Key fields (income):**
- `income.annualGrossBase` — annual gross base salary
- `income.monthlyNetTakeHome` / `income.takeHomeMonthly` — monthly net take-home
- `income.deductions` — PAYE, National Insurance, pension, student loan
- `income.bonus` — discretionary; **not used in main affordability projections**
- `income.payRise` — scenario toggle only; not used in main projections

**Key arrays (preserve on merge):** `ongoingBills`, `expenses`, `shoppingList`, `giftCards`, `oneTimeCosts`

**Outgoings block:** `outgoings.householdContribution`, `outgoings.creditCardPayment` (minimum payment).

---

## `criteria` shape

**Shape:** Flat + extended blocks.

**Legacy keys:** `budget`, `size`, `location`, `propertyTypes`, `propertyTypePrefs`, `tenure`,
`features`, `mustHaves`, `niceToHaves`, `keywords`, `mortgage`.

**Extended keys:**
- `propertyTypesExpanded` — allowed / ruled-out property types
- `sizeExpanded` — minimum and ideal bed counts; home-office handling
- `propertyAge`, `renovationAppetite` — renovation tolerance
- `featuresExpanded.heating` — heating requirements
- `dealBreakersExpanded` — deal-breaker list
- `lifestyle` — two-tier ideal vs acceptable setting
- `areaCriteria` — settlement-type weights, walkability scoring, commute context

---

## `goals` shape

**Shape:** Flat sections.

**Key fields:**
- `target.currentSystemCentre` — engine-calibrated centre price (auto-calibrates)
- `deposit.hopedFor`, `deposit.currentSavings`, `deposit.fundingSource`
- `readiness.checklist` — boolean/null map; drives the "next action" on the dashboard readiness tile
- `mortgage.comparisonsToOffer` — list of term lengths to compare

**Update pattern:** Flip booleans in `readiness.checklist` as each action is completed.

---

## `investments_accounts` shape

**Shape:** One account per key.

**Key fields:**
- `*.currentPortfolioValue` — current account value (as of a dated snapshot)
- `*.earmarkPct` — share of the fund earmarked for the deposit
- `*.strategyEpochs` — labelled strategy phases over time
- `*.depositRiskManagement.scenarios` — pre-computed market-drop scenarios
- `*.withdrawalReadiness` — seasoning recommendation before mortgage application
- `lisa.status` — Lifetime ISA status / rationale

---

## `data/imports/trading212-history.json` shape

**Shape:** Generated by `tools/import-trading212.mjs`. Stub until the importer is run.

**Key fields:**
- `summary.totalDeposited`, `.netContributed`, `.totalDividends`, `.totalInterest`
- `monthlySummary[]` — YYYY-MM aggregated rows with epoch tag
- `tickerExposure{}` — per-ticker net deployed
- `epochs.*` — contribution totals per strategy phase

**Importer usage:**
```bash
node tools/import-trading212.mjs path/to/export.csv [path/to/export2.csv ...]
```
Validates the CSV column format, deduplicates by transaction ID, writes the output file.

---

## Intelligence engine modules

| Module | Key export | Inputs | Notes |
|--------|-----------|--------|-------|
| `assets/js/affordability.js` | `assessAffordability()`, `assessAffordabilityScenarios()` | finances, criteria, goals | Bonus/payRise NOT used in main projections |
| `assets/js/money-flow.js` | `getMoneyFlow()`, `getMoneyFlowPostMove()` | finances | Pre/post-move bucket shapes |
| `assets/js/savings-velocity.js` | `getSavingsVelocity()`, `getVelocityFromHistory()` | finances / history | History variant stub-safe |
| `assets/js/deposit-risk.js` | `assessDepositRisk()` | investments, goals | Verdict from earmarked-equity share × timeline |
| `assets/js/investment-performance.js` | `analysePerformance()`, `getMonthlyCumulativeDeposits()`, `getEpochAttribution()` | history | Stub-safe. Adds cumulative + per-epoch helpers. |
| `assets/js/savings-series.js` | `buildSavingsSeries()` | history + finances + goal | Composes monthly cumulative deposits with the engine baseline projection. Stub-safe. |
| `assets/js/finances.js` | `calcSDLT()`, `calcMonthlyMortgage()`, `calcLTV()` etc. | primitives | Pure; do not rewrite |

## Listings ↔ areas (live content)

`listings` is fetcher-written live content (Supabase only, never git-synced; see
`docs/SUPABASE_SYNC.md`). Two complementary columns/tables tie a listing to areas:

| Field | Meaning |
|-------|---------|
| `listings.area_id` | The **primary** area — the single named/nearest village (address tiebreak in `withinGeofence`). Consumed by `page-property.js` (area-detail lookup) and `page-listings.js` (per-area radius + probation via `normArea`). **Do not drop or repurpose.** |
| `listing_areas` (m2m) | The **full membership set** — one row per area whose geofence *contains* the listing (`rightmove_id`, `area_id`, `distance_mi`, `is_primary`). Exactly one `is_primary=true` row, equal to `listings.area_id`. Live content (service-role write, public read). |

Village geofences **overlap**, so a listing can sit inside several areas at once. The feed
scopes to a household's areas via `listing_areas` membership (filter by `rightmove_id`), NOT the
single `area_id` — so a listing physically inside an area you hold is visible even when its
primary is one you don't. Writers: both `tools/fetch-listings.mjs` and
`tools/import-apify-runs.mjs` emit membership from `withinGeofence().areas` via the
`replace_listing_areas` RPC; `tools/backfill-listing-areas.mjs` seeded existing rows.

**Origin areas** (`household_areas.is_origin=true`): a home/commute-anchor area. It counts for
commute math but is **excluded from the listing feed and the fetcher demand set** — its
catchment is where the household lives, not where they want to buy. Contrast a **target** area
(the default) whose listings the household wants to see.
