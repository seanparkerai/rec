# Test Fixtures — SYNTHETIC sample data (ignore for any analysis)

> **These files contain fictional, synthetic placeholder values — NOT real user data.**
> Every figure, name, address and holding here is invented for tests and the fresh-install
> fallback. Do **not** analyse, cite, or treat any value in this folder as anyone's actual
> finances, criteria, profile, or investments. Each file carries a top-level `_SAMPLE` marker
> saying the same thing.

Real user-state data lives **only** in Supabase (never committed to this repo). These fixtures
just mirror the *shape* of those tables so tests and a first-run install have something to render.
See `docs/SUPABASE_SYNC.md` for the real data model.

| File | Mirrors (shape only) |
|------|----------------------|
| `finances.sample.json` | `finances` Supabase table |
| `investments.sample.json` | `investments_accounts` Supabase table |
| `goals.sample.json` | `goals` Supabase table |
| `criteria.sample.json` | `criteria` Supabase table |
| `profile.sample.json` | `profile` Supabase table |
| `contacts.sample.json` | `contacts` Supabase table |
