/**
 * Hand-curated JSDoc type definitions for this app's data shapes.
 *
 * Replaces the generated `supabase-types.ts` (removed in REFACTOR P3): a `.ts`
 * file cannot load on this zero-build static site, so it gave the project nothing.
 * These JSDoc `@typedef`s are instead consumed by the editor / TypeScript language
 * server for plain JS — real IntelliSense and type-checking with no build step.
 *
 * Reference a type from any module with an `import()` JSDoc tag placed in a
 * comment above the value, e.g. annotate a variable with
 * `@type {import('./types.js').Finances}` before `const f = await getFinances();`.
 *
 * Scope is a CURATED subset, not a 1:1 schema mirror: the JSON row envelope plus
 * the core user-state payloads (the `data` blob of each singleton table). Deeply
 * nested, freeform config sub-trees are intentionally typed loosely as `Object`
 * so they stay accurate as the shapes evolve. The canonical runtime contract
 * remains the live Supabase schema (read via the MCP connector) and the redacted
 * shape samples in `data/fixtures/` — keep this file reconciled to those.
 *
 * @module types
 */

/* ───────────────────────── JSON + row envelopes ───────────────────────── */

/**
 * A JSON-serialisable value — mirrors a Postgres `jsonb` column. Recursive.
 * @typedef {(string | number | boolean | null | { [key: string]: Json } | Json[])} Json
 */

/**
 * Content-table row envelope (`areas`, `house_types`). Not household-scoped;
 * the repo JSON is the source of truth and these rows mirror it.
 * @typedef {Object} ContentRow
 * @property {string} id
 * @property {Json} data — the content payload (e.g. an area or house-type record)
 * @property {string} updated_at — ISO timestamp
 */

/**
 * Per-household user-state row envelope (`profile`, `criteria`, `finances`,
 * `goals`, `contacts`, …). The typed payloads below are what populate `data`.
 * @typedef {Object} HouseholdRow
 * @property {string} id
 * @property {string} household_id
 * @property {Json} data
 * @property {string} updated_at — ISO timestamp
 */

/* ─────────────────────────── profile payload ──────────────────────────── */

/**
 * @typedef {Object} Address
 * @property {string} line1
 * @property {string} [town]
 * @property {string} [county]
 * @property {string} postcode
 */

/**
 * @typedef {Object} Person
 * @property {string} fullName
 * @property {string} [dateOfBirth] — ISO date
 * @property {string} [mobile]
 * @property {string} [email]
 * @property {Address} address
 * @property {Address[]} [previousAddresses]
 * @property {string} [nationality]
 * @property {Object} [household] — living arrangement, dependents, contributions
 */

/**
 * @typedef {Object} Employment
 * @property {string} employer
 * @property {string} [industry]
 * @property {string} [role]
 * @property {string} [startDate]
 * @property {('permanent'|'fixed-term'|'contract'|'self-employed'|string)} [type]
 * @property {string} [probationStatus]
 * @property {string} [workPattern]
 * @property {number} [tenureYears]
 */

/**
 * `profile` table payload — personal, employment, credit and debt context.
 * @typedef {Object} Profile
 * @property {Person} person
 * @property {Employment} employment
 * @property {Object} [creditProfile] — credit scores + electoral-roll status
 * @property {Object} [debts] — credit cards, student loan, car finance, …
 * @property {Object} [pension]
 * @property {Object} [insuranceAndProtection]
 * @property {Object} [healthFactors]
 */

/* ────────────────────────── criteria payload ──────────────────────────── */

/**
 * @typedef {Object} Budget
 * @property {number} min
 * @property {number} max
 * @property {number} [offerTarget]
 * @property {string} [offerStrategy]
 * @property {number} [depositPct]
 */

/**
 * `criteria` table payload — the property search specification.
 * @typedef {Object} Criteria
 * @property {Budget} budget
 * @property {Object} size — bedroom/bathroom minimums + ideals
 * @property {Object} [location] — area source + search radius
 * @property {string[]} [propertyTypes]
 * @property {Object} [propertyTypePrefs] — preferred / acceptable / excluded
 * @property {Object} [tenure]
 * @property {Object} [propertyStatus]
 * @property {Object} [features] — mustHave / niceToHave
 * @property {Object} [mortgage] — target max, rate, term, LTV range
 * @property {Object} [areaCriteria] — counties, settlement weighting, walkability
 */

/* ────────────────────────── finances payload ──────────────────────────── */

/**
 * @typedef {Object} Income
 * @property {number} annualGrossBase
 * @property {number} [monthlyNetTakeHome]
 * @property {string} [taxCode]
 * @property {Object} [deductions] — payeTax, nationalInsurance, employeePension, studentLoan
 * @property {number} [annualBonus]
 * @property {Object} [bonus] — structure, schedule, expectedAnnualised, confidence
 */

/**
 * @typedef {Object} FinancesMortgage
 * @property {number} targetMax
 * @property {number} ratePctAssumed
 * @property {number} termYears
 * @property {string} [ltvRange]
 * @property {number} [estimatedMonthlyPayment]
 * @property {string} [fixedRatePref]
 */

/**
 * A one-time purchase cost line (deposit / SDLT / legal / furnishing / major).
 * @typedef {Object} CostItem
 * @property {string} item
 * @property {number} cost
 * @property {string} [notes]
 * @property {('sdlt'|'legal'|'removal'|'contingency'|'furnishing'|'major'|string)} [category]
 */

/**
 * A recurring bill or expense line.
 * @typedef {Object} BillItem
 * @property {string} item
 * @property {number} [annual]
 * @property {number} [monthly]
 * @property {number} [weekly]
 */

/**
 * `finances` table payload — income, outgoings, savings goal and cost lines
 * consumed by the calculators in `finances.js`.
 * @typedef {Object} Finances
 * @property {string} currency
 * @property {boolean} firstTimeBuyer
 * @property {Income} income
 * @property {Object} [outgoings]
 * @property {Object} [goal] — targetDeposit, targetPropertyPrice, depositPct
 * @property {Object} [savings] — current, monthlyContribution, history
 * @property {FinancesMortgage} [mortgage]
 * @property {CostItem[]} [oneTimeCosts]
 * @property {BillItem[]} [ongoingBills]
 * @property {BillItem[]} [expenses]
 * @property {Object[]} [shoppingList]
 * @property {Object[]} [giftCards]
 */

/* ──────────────────── goals · contacts · investments ──────────────────── */

/**
 * `goals` table payload — timeline plus deposit/mortgage targets. The planning
 * engine auto-calibrates the final numbers from these soft targets.
 * @typedef {Object} Goals
 * @property {Object} timeline — horizon, type, confidence
 * @property {Object} target — propertyPriceBand, currentSystemCentre, engineAutoCalibrate
 * @property {Object} deposit — hopedFor, currentSavings, gapToHoped, fundingSource
 * @property {Object} [mortgage] — term/length preferences + comparison set
 * @property {Object} [softFields] — biggestConcern, visionStatement
 */

/**
 * `contacts` table payload — professional contacts grouped by role.
 * (Fixture ships empty arrays; the per-role item shape is freeform.)
 * @typedef {Object} Contacts
 * @property {Object[]} agents
 * @property {Object[]} brokers
 * @property {Object[]} solicitors
 * @property {Object[]} surveyors
 */

/**
 * `investments_accounts` table payload — holdings earmarked for the deposit.
 * @typedef {Object} Investments
 * @property {Object} [trading212ISA] — ISA value, strategy epochs, de-risking advice
 * @property {Object} [lisa] — LISA eligibility + recommendation
 * @property {Object} [crypto]
 * @property {Object[]} [physicalAssets]
 */

export {};
