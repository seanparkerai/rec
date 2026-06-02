# USER PROFILE — about the buyer

> **Personal data lives in the database, not in this repo.** The buyer profile, search preferences,
> budget/finances, goals and investments are stored **only** in the private Supabase database
> (`profile`, `criteria`, `finances`, `goals`, `investments_accounts`, `debts_*` tables), protected by
> Row Level Security. Access them via the portal or `mcp__supabase__execute_sql` — never by adding
> figures back into this file.

This document intentionally holds **no** personal figures, salary, savings, budget, or search-criteria
detail. It previously narrated the buyer profile inline; that content was migrated to the database and
removed from the repo so personal financial information is not visible to anyone with repository access.

## Where each thing lives

| Topic | Source of truth (Supabase table) |
|-------|----------------------------------|
| Who's buying, employment, credit, lifestyle, deal-breakers, timeline | `profile` |
| Search preferences (budget band, beds, types, tenure, features, locations, keywords) | `criteria` |
| Income, deductions, bills, expenses, savings, mortgage assumptions | `finances` |
| Deposit target, timeline, funding source | `goals` |
| Investment / deposit-fund holdings | `investments_accounts` · `investments_history` |
| Debts (credit cards, student loan, other) | `debts_credit_cards` · `debts_student_loans` · `debts_other` |

For the data **shape** (field names, not values) see `docs/DATA_MODEL.md`. For the sync contract see
`docs/SUPABASE_SYNC.md` and `CLAUDE.md` §18.
