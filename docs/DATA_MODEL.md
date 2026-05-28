# DATA_MODEL.md — rec data layer reference

Generated: 2026-05-26. Updated: 2026-05-27 (data security refactor — user-state JSON files removed).

> **Note (2026-05-27):** User-state data (profile, finances, criteria, goals, contacts, investments) was removed from the repo in the data security refactor. References to `data/profile.json`, `data/finances.json`, etc. in this document are historical — those files no longer exist. The canonical store is Supabase (access via `mcp__supabase__execute_sql`). Redacted sample data for tests lives in `data/fixtures/*.sample.json`.

---

## File map

| File / Store | Purpose | Read by | Update cadence |
|------|---------|---------|---------------|
| **Supabase `profile`** | Full buyer profile: person, employment, credit, debts, pension | `storage.js` → `page-profile-detail.js` | Via MCP or portal save |
| **Supabase `finances`** | Income, deductions, bills, expenses, savings, shopping, gift cards | `storage.js` → `page-finances.js`, `page-home.js`, `affordability.js`, `money-flow.js` | Via MCP or portal save |
| **Supabase `criteria`** | Search criteria: budget, property types, features, area preferences | `storage.js` → `page-criteria.js`, `affordability.js`, `page-home.js` | Via MCP or portal save |
| **Supabase `goals`** | Deposit target, timeline, readiness checklist | `storage.js` → `page-home.js`, `deposit-risk.js` | Via MCP or portal save |
| **Supabase `investments_accounts` / `investments_history`** | Trading 212 ISA structure, T212 transaction history | `storage.js` → `deposit-risk.js`, `page-home.js`, `page-finances.js` | After T212 CSV import via `scripts/import-trading212.mjs` |
| `data/fixtures/*.sample.json` | Redacted sample data for tests and fresh-install fallback | `tools/run-intelligence-tests.mjs`, `storage.js` (fallback) | Updated by Claude during refactors |
| `data/areas/*.json` | Per-area research (character, prices, schools, sources) | `page-areas.js`, `page-area-detail.js` | After area research |
| `data/areas.json` | Lightweight area directory index | `page-areas.js`, `page-home.js` | Rebuilt by `tools/build-areas.mjs` |

---

## `data/profile.json`

**Shape:** Nested object with sections for person, employment, credit, debts, pension, insurance, health.

**Key fields:**
- `person.fullName`, `person.dateOfBirth`, `person.address` — identity
- `person.household.monthlyHouseholdContribution` — £480/mo informal family payment; appears on bank statements
- `employment.startDate`, `.probationStatus` — lender flags
- `creditProfile.scoresChecked` — boolean; all scores currently `null` with `_followUp` notes
- `debts.creditCards[].currentBalance` — Barclaycard £307; earmarked for clearing pre-application
- `debts.studentLoan.plan` — Plan 1, £278/mo deduction; balance unknown
- `pension.employeeContributionMonthly` — £146.76/mo; reduces take-home

**`_followUp` fields:** Scattered across `creditProfile`, `debts.studentLoan`, and `pension`. Surfaced on the profile page's "Things to check" section.

---

## `data/finances.json`

**Shape:** Flat + nested. Keep existing array keys unchanged when updating.

**Key fields (income):**
- `income.annualGrossBase` — £64,000 (corrected April 2026)
- `income.monthlyNetTakeHome` / `income.takeHomeMonthly` — £3,543.54 (corrected; old snapshot had £3,590)
- `income.deductions` — PAYE £1,090.86, NI £274.17, pension £146.76, student loan £278.00
- `income.bonus` — discretionary, last £3k in May 2025; **not used in main affordability projections**
- `income.payRise` — scenario toggle only; not used in main projections

**Key arrays (preserve on merge):** `ongoingBills`, `expenses`, `shoppingList`, `giftCards`, `oneTimeCosts`

**Outgoings block (new):** `outgoings.householdContribution` £480/mo, `outgoings.creditCardPayment` £13/mo minimum.

---

## `data/criteria.json`

**Shape:** Flat + extended blocks.

**Legacy keys (preserved):** `budget`, `size`, `location`, `propertyTypes`, `propertyTypePrefs`, `tenure`, `features`, `mustHaves`, `niceToHaves`, `keywords`, `mortgage`.

**New keys (appended):**
- `propertyTypesExpanded` — includes cottage/end-terrace; rules out new-build-estate/flat
- `sizeExpanded` — min 2 beds, ideal 3; home office = spare bedroom
- `propertyAge`, `renovationAppetite` — mid-level renovation acceptable
- `featuresExpanded.heating` — central heating required; gas/oil/LPG/heat pump acceptable
- `dealBreakersExpanded` — includes "right next to schools", "ex-council estate"
- `lifestyle` — two-tier: ideal (rural village, beams, quiet lane) vs acceptable (semi-rural, character preserved)
- `areaCriteria` — settlement-type weights (trueVillage=1.0 → withinCity=0), walkability scoring, commute context (no car)

---

## `data/goals.json`

**Shape:** Flat sections.

**Key fields:**
- `target.currentSystemCentre` — £375k (engine auto-calibrates)
- `deposit.hopedFor` — £50k; `deposit.currentSavings` — £31,193; `deposit.fundingSource` — T212 ISA 100%
- `readiness.checklist` — boolean/null map; drives the "next action" on the dashboard readiness tile
- `mortgage.comparisonsToOffer` — ["25y", "30y", "35y", "40y"]

**Update pattern:** Flip booleans in `readiness.checklist` as Luke completes each action.

---

## `data/investments.json`

**Shape:** One account per key.

**Key fields:**
- `trading212ISA.currentPortfolioValue` — £31,193 (as of 2026-05-26)
- `trading212ISA.earmarkPct` — 100%; entire fund earmarked for deposit
- `trading212ISA.strategyEpochs` — stockpicker (to 2026-01-01) → etfCore (2026-01-02 onwards)
- `trading212ISA.depositRiskManagement.scenarios` — 10%/20% drop pre-computed
- `trading212ISA.withdrawalReadiness` — 3-month seasoning recommended before mortgage application
- `lisa.status` — "none"; skip rationale: 12-month hold makes it unusable on current timeline

---

## `data/imports/trading212-history.json`

**Shape:** Generated by `scripts/import-trading212.mjs`. Stub until user runs the importer.

**Key fields:**
- `summary.totalDeposited`, `.netContributed`, `.totalDividends`, `.totalInterest`
- `monthlySummary[]` — YYYY-MM aggregated rows with epoch tag
- `tickerExposure{}` — per-ticker net £ deployed
- `epochs.stockpicker`, `.etfCore` — contribution totals per strategy phase

**Importer usage:**
```bash
node scripts/import-trading212.mjs path/to/export.csv [path/to/export2.csv ...]
```
Validates T212 column format, deduplicates by transaction ID, writes output file.

---

## Intelligence engine modules

| Module | Key export | Inputs | Notes |
|--------|-----------|--------|-------|
| `assets/js/affordability.js` | `assessAffordability()`, `assessAffordabilityScenarios()` | finances, criteria, goals | Bonus/payRise NOT used in main projections |
| `assets/js/money-flow.js` | `getMoneyFlow()`, `getMoneyFlowPostMove()` | finances | Pre/post-move bucket shapes |
| `assets/js/savings-velocity.js` | `getSavingsVelocity()`, `getVelocityFromHistory()` | finances / history | History variant stub-safe |
| `assets/js/deposit-risk.js` | `assessDepositRisk()` | investments, goals | Luke current = high-risk (100% equity, 3-6mo) |
| `assets/js/investment-performance.js` | `analysePerformance()`, `getMonthlyCumulativeDeposits()`, `getEpochAttribution()` | history | Stub-safe. v3 adds cumulative + per-epoch helpers. |
| `assets/js/savings-series.js` | `buildSavingsSeries()` | history + finances + goal | v3: composes monthly cumulative deposits with the engine baseline projection for the savings-over-time chart. Stub-safe. |
| `assets/js/finances.js` | `calcSDLT()`, `calcMonthlyMortgage()`, `calcLTV()` etc. | primitives | Pure; do not rewrite |
