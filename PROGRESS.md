# PROGRESS.md — Session: rec data model & intelligence expansion

## Session started: 2026-05-26

### Files read (anti-loop log)
1. **CLAUDE.md** — governs repo: zero-build static site, main branch, Supabase MCP sync, strict design rules, no browser in this env.
2. **data/finances.json** — snapshot-based; income uses old fields (annualBaseSalary £64k, takeHomeMonthly £3590 — stale vs £3543.54). Has ongoingBills, expenses, shoppingList, giftCards arrays to preserve.
3. **data/criteria.json** — existing budget/size/features structure. Needs merge with expanded property types, renovation appetite, lifestyle vision, area scoring weights.
4. **assets/js/affordability.js** — clean pure-function module; exports `assessAffordability()`. Uses `finances.income.annualBaseSalary + annualBonus` for gross. Import path: `./finances.js`.
5. **supabase/schema.sql** — idempotent DDL; tables: households, household_members, profile, (+ others). Uses RLS `is_household_member()` helper.

### State check
- `data/profile.json` exists but is old simple-summary format — needs full replacement per spec.
- `data/goals.json` — MISSING (to create)
- `data/investments.json` — MISSING (to create)
- `data/imports/` — directory MISSING (to create)
- `assets/js/deposit-risk.js` — MISSING (Phase 2)
- `assets/js/investment-performance.js` — MISSING (Phase 2)
- `scripts/import-trading212.mjs` — MISSING (Phase 3)

---

## Phase 1 — Data model expansion
_Status: COMPLETE — committed a55b6ba_

All 6 JSON files created/updated, all arrays preserved, 0 test failures.
Key correction: take-home updated from £3590 → £3543.54 (April 2026 payslip).

---

## Phase 2 — Intelligence engine extensions
_Status: COMPLETE_

- `assets/js/deposit-risk.js`: new pure module; Luke's state → high-risk verdict (100% equity ETF, 3-6mo timeline, urgency=high)
- `assets/js/affordability.js`: added `assessAffordabilityScenarios()` — 3 scenarios: £340k/stretch/now, £375k/tight/10mo, £400k/tight/10mo
- `assets/js/savings-velocity.js`: added `getVelocityFromHistory()` — stub-safe, 3-month window, 1/3/6/12mo projections
- `assets/js/investment-performance.js`: new pure module — stub-safe, epoch attribution, total return %
- Tests: 3 new test files (deposit-risk, affordability-scenarios, investment-performance) + tests.html wired

---

## Phase 3 — Historical import
_Status: COMPLETE_

- `scripts/import-trading212.mjs`: new Node.js importer; reads 1+ T212 CSVs, deduplicates by ID (fallback composite key), aggregates monthly deposits/dividends/interest/realisedPnL, tags epochs, writes data/imports/trading212-history.json
- Importer tested on synthetic CSV; all columns validated, epoch tagging confirmed
- `data/imports/trading212-history.json` restored to stub (user will run importer with their real CSV)
- `page-finances.js` updated: imports analysePerformance + assessDepositRisk; renderISAAttribution() + renderDepositRiskTile() added (both gracefully stub-safe)
- `page-home.js` updated: imports analysePerformance; renderISAYTD() added (stub-safe, shows YTD contributions)

---

## Phase 4 — Dashboard surface upgrades
_Status: COMPLETE_

- index.html: 3 new tiles added to bento (readiness, deposit-risk, affordability scenarios); ISA YTD stat added to deposit tile
- page-home.js: renderReadinessTile(), renderDepositRiskTile(), renderAffordabilityScenariosTile() + renderISAYTD() wired
- pages/profile.html: redirect stub replaced with full read-only profile page (6 sections)
- assets/js/page-profile-detail.js: new module rendering person/employment/credit/debts/pension + followup list from new profile.json format
- assets/css/dashboard.css: verdict-badge, readiness, deposit-risk, scenario, ISA attribution, profile-dl styles appended
- tests/schemas.js: validateProfile() updated to accept new nested format (backward compatible with old format)
- Visual check needed by developer at 320/375/768/1280px widths


