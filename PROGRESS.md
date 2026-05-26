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

---

## Phase 5 — Documentation + Supabase handoff
_Status: COMPLETE_

- `docs/DATA_MODEL.md`: new — all 7 JSON files documented (purpose, key fields, update cadence, consumer modules)
- `docs/INTELLIGENCE_RULES.md`: extended with deposit-risk verdict thresholds and affordability-scenarios spec + maintenance instructions
- `supabase/schema-additions.sql`: 7 new tables (goals, investments_accounts, investments_history, debts_credit_cards, debts_student_loans, debts_other, readiness_checklist) + ALTER profile for extended_data. All RLS. Idempotent. NOT executed here — awaiting Supabase MCP run.
- `docs/SUPABASE_MIGRATION.md`: new — explains what schema-additions.sql is, how to apply (MCP preferred), what needs wiring post-migration

---

## HANDOFF

### Completed (this session)

**Phase 1 — Data model:**
- `data/profile.json` — full nested profile (person/employment/credit/debts/pension/insurance)
- `data/finances.json` — income corrected to April 2026 payslip (take-home £3,543.54); outgoings block added; all arrays preserved
- `data/criteria.json` — expanded property types, renovation appetite, lifestyle two-tier vision, area scoring; legacy keys preserved
- `data/goals.json` — deposit targets, readiness checklist, timeline
- `data/investments.json` — T212 ISA structure, epochs, risk scenarios, LISA skip rationale
- `data/imports/trading212-history.json` — stub (ready for real CSV import)

**Phase 2 — Intelligence engine:**
- `assets/js/deposit-risk.js` — high-risk verdict for Luke's state (100% equity, 3-6mo)
- `assets/js/affordability.js` — `assessAffordabilityScenarios()` (3-scenario: £340k/stretch/now, £375k/tight/10mo, £400k/tight/10mo)
- `assets/js/savings-velocity.js` — `getVelocityFromHistory()` (stub-safe, 3-month window)
- `assets/js/investment-performance.js` — `analysePerformance()` (stub-safe, epoch attribution)
- Tests: 3 new test files wired into tests.html

**Phase 3 — Historical import:**
- `scripts/import-trading212.mjs` — Node.js T212 CSV importer; runs as: `node scripts/import-trading212.mjs path/to/export.csv`
- `page-finances.js` — ISA attribution + deposit-risk tile (both stub-safe)
- `page-home.js` — ISA YTD stat (stub-safe)

**Phase 4 — Dashboard surfaces:**
- 3 new bento tiles: readiness, deposit-at-risk, affordability scenarios
- `pages/profile.html` — full read-only profile page (person/employment/credit/debts/pension/followup)
- `assets/js/page-profile-detail.js` — new module for new profile.json format

**Phase 5 — Docs + Supabase:**
- `docs/DATA_MODEL.md`, `docs/INTELLIGENCE_RULES.md` (extended), `docs/SUPABASE_MIGRATION.md`
- `supabase/schema-additions.sql` — idempotent DDL for 7 new tables (NOT yet applied)

### Deferred

- Credit scores (Experian/Equifax/TransUnion) — `null` with `_followUp` in profile.json; populate after user checks
- Pension pot value — `null` with `_followUp`; populate from provider portal
- Student loan balance — `null`; retrieve from student loans portal
- Pay rise confirmation (£66k scenario) — `confidence: low`; monitor
- Barclays bank statement import — not built
- Barclaycard balance clearing confirmation — action pending
- LISA: no account opened; if timeline slips past 12 months, open with £1 to start the clock
- T212 CSV import — user needs to run: `node scripts/import-trading212.mjs path/to/your-export.csv`
- Supabase schema migration — see `docs/SUPABASE_MIGRATION.md` and `supabase/schema-additions.sql`
- storage.js extensions for new tables (goals, investments, readiness checklist)
- LLM ask front-end, Rightmove scraping, outreach sending — all remain placeholder

### Exact next step

Run the Supabase migration prompt in Claude web with the Supabase MCP connector enabled.
The companion prompt should apply `supabase/schema-additions.sql` via `mcp__supabase__apply_migration`,
then wire up storage.js to the new tables, and extend `tests/supabase-sync.test.js`.



