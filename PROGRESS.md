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
_Status: IN PROGRESS_

