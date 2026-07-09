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
| `data/fixtures/*.sample.json` | Redacted sample data for tests and fresh-install fallback | `tools/run-all-tests.mjs`, `storage.js` (fallback) | Updated by Claude during refactors |
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
| `listings.area_id` | The **primary** area — **DERIVED from `listing_areas.is_primary` since 2026-07-01** (migration `derived_primary_from_listing_areas`): the `replace_listing_areas` RPC updates it in the same transaction as every membership write, so it can never drift. Still the single named/nearest village (address tiebreak in `withinGeofence`); consumed by `page-property.js` and `page-listings.js`. **Do not drop, repurpose, or write directly — write membership.** |
| `listing_areas` (m2m) | The **full membership set** — one row per area whose geofence *contains* the listing (`rightmove_id`, `area_id`, `distance_mi`, `is_primary`). Exactly one `is_primary=true` row per non-empty set — enforced structurally (`uniq_listing_areas_primary` partial unique index + RPC boundary validation, 2026-07-01) — and `listings.area_id` is derived from it. Live content (service-role write, public read). |

Village geofences **overlap**, so a listing can sit inside several areas at once. The feed
scopes to a household's areas via `listing_areas` membership (filter by `rightmove_id`), NOT the
single `area_id` — so a listing physically inside an area you hold is visible even when its
primary is one you don't. Writers: both `tools/fetch-listings.mjs` and
`tools/import-apify-runs.mjs` emit membership from `withinGeofence().areas` via the
`replace_listing_areas` RPC; `tools/backfill-listing-areas.mjs` seeded existing rows.

**One visibility predicate (2026-07-01):** the `household_feed(p_household_id, …)` SECURITY
DEFINER RPC owns the whole per-household rule in one place — membership ∩ active
areas ∩ curated-disable ∩ `geofence_pass` ∩ baseline, ordered + paged, with the full membership
set attached as `areas` jsonb. Contract: `supabase/archive/schema-household-feed.sql` +
`tests/contract/household-feed.test.js` (fixture reference implementation:
`tests/mocks/household-feed-rpc.js`). The storage feed read is pointed at it in step 2.13.

**Origin areas — RETIRED (2026-07-09, ADR 0009):** the `is_origin` home/commute-anchor
carve-out (2026-07-01 → 2026-07-09) was removed by owner directive as a never-intended
feature. The column is dropped, the RPC and fetcher no longer read it, and the picker's
"Home" toggle is gone: **every active household area is a target** — the only per-area
feed/fetch switch is the reversible pause (`status: active|inactive`).

### The visibility contract — every way a listing can be absent or hidden (2026-07-09 audit)

**Invariant: a listing may only be invisible for a reason on this list.** Anything else is a
bug — and it is checked mechanically, not by trust: `tools/audit-listing-coverage.mjs`
(run nightly with `--fix` by `.github/workflows/coverage-sentinel.yml`, red run = violation)
re-derives membership from coordinates, reconciles every `listings` row into exactly one
bucket per household, and fails on any UNEXPLAINED residue.

*Never fetched (absent from the DB):*
1. **Not near any active area** — only areas in the demand set (≥1 active household link) are
   searched, each within its search radius.
2. **Outside the scraped price band** — searches run at the household-budget union band
   (currently min £300k); cheaper listings are never fetched even though the feed would show
   them. Known trade-off — widen a budget to widen the band.
3. **Search-source filters** — houses/bungalows only, ≥2 beds, and the text-match new-build
   drop (owner decision 2026-06-04) apply at source.
4. **Per-target result cap** — 200 results/search; a capped page now logs a loud
   `⚠ TRUNCATED` warning naming the target (2026-07-09).
5. **Recency window** — scheduled runs only see listings added in the last ~day; standing
   stock needs a FOUNDATION_MODE pull (recency filter omitted = all live stock;
   `foundation-rural-thin.yml` covers the rural thin tail).

*Fetched but not in the feed (in the DB, named bucket):*
6. **`archived_at` set** — purge/archival with a recorded `archive_reason`; revealable via
   `p_include_archived`.
7. **No membership in one of YOUR active areas** — paused links, other households' areas.
8. **`geofence_pass=false`** — outside every buffer; revealable via "out of area" toggle.
9. **Baseline in the RPC** — excluded type / off-band KNOWN price / under-beds (unknown
   values always pass).

*In the feed but hidden client-side (each has a visible count + reveal):*
10. **Affordability gate / junk (auction, over-55) / confirmed refinement hides** — "Show
    hidden" reveals all three; counts in the feed summary.
11. **Decided suppression** — liked → Saved page, passed/rejected → Rejected page (by id AND
    property fingerprint so re-lists stay decided); never silently gone, always on a page.
12. **Fingerprint dedupe** — same physical property collapses to one representative (counted).

**Retired/forbidden mechanisms:** `is_origin` (ADR 0009); learned `dropAreas`/`dropOutcodes`
narrowing only runs with `USE_LEARNED=1`, which no workflow sets; `scrape_probation` is
user-driven pause, currently empty. Membership drift from AREA_IDS-scoped runs (the bug that
hid whole catchments' worth of junction rows) was fixed 2026-07-09 — the geofence index is
frozen before the search scope is applied — and the sentinel self-heals any residue nightly.

### Listing lifecycle (audited + pinned, step 2.18)

`listings.status` ∈ `live | under_offer | sstc | withdrawn` — stamped by
`mapStatus()` (`tools/listings-normalise.mjs`) from the source's free-text status at
normalise-time and refreshed on every re-sight via the UPSERT. **Nothing else writes it**
(personal statuses — new/saved/viewed/offered/rejected — live on `shortlist`, never here).
A delisted property simply stops being re-seen: its `status`/`last_seen` freeze and it ages
into the purge. Out-of-buffer rows (`geofence_pass=false`, stored-but-hidden) are never
re-upserted by the fetcher (it writes in-buffer only), so they age out the same way.

`tools/purge-listings.mjs` (dry-run by default; `APPLY=1` deletes) removes, in order —
ever-**liked** rows are unconditionally protected first: (a) `baseline` violations
(`passesBaseline`, the shared gate), (b) `rejected-stale` (current reaction = reject, by id
OR fingerprint so relists count, unseen > `REJECT_HALF_LIFE_DAYS`=14), (c) `stale` (unseen >
`STALE_DAYS`=30, catches delisted/withdrawn). `PURGE_REASONS` is the **complete** reason set
(pinned by `tests/unit/purge-listings.test.js` — an undocumented drive-by reason once
crashed the tool). Each purged listing's `listing_areas` rows are deleted alongside it (no
FK — junction hygiene, also pinned); the reject signal survives forever in the append-only
`listing_reactions` log, so suppression outlives the purged row.
