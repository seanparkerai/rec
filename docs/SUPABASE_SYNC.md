# SUPABASE_SYNC.md — Bidirectional sync contract

This document is the operational detail behind **CLAUDE.md §18**. It explains how Claude (via the
Supabase MCP connector) and the user (via the deployed portal) keep the database, the repo, and
local caches in perfect lockstep.

Read this once at the start of any session that involves data, schema, or storage changes. Treat
the table in §1 as authoritative — every data type in the app belongs to exactly one class.

---

## 1. Source-of-truth matrix

| Class | Tables / files | Canonical store | Writer | Reader |
|-------|----------------|-----------------|--------|--------|
| **User state** | `profile`, `criteria`, `finances`, `shortlist`, `zones`, `journey_checks`, `contacts`, `outreach` — **no repo JSON file** | Supabase row (one per household_id) | Portal via `storage.js`, OR Claude via MCP `execute_sql` | `storage.js` reads with localStorage write-through cache |
| **Test fixtures** | `data/fixtures/*.sample.json` | Repo file (git-versioned, redacted) | Claude only | Test harness (`tools/run-intelligence-tests.mjs`) and fresh-install fallback in `storage.js` |
| **Content (per-area)** | `data/areas/<id>.json` | Repo file (git-versioned) | Claude only | App fetches the JSON; Supabase `areas` mirror table answers ad-hoc queries |
| **Content (catalogues)** | `data/house-types.json`, `data/checklists.json`, `data/outreach-templates.json` | Repo file | Claude only | App fetches the JSON; Supabase `house_types` / `checklists` / `outreach_templates` mirror tables for queries |
| **Index** | `data/areas.json` | Derived from per-area files via `tools/build-areas.mjs` | Build tool | App fetches the JSON; Supabase `areas` mirror table |
| **Schema** | `supabase/schema.sql` | Migration history applied via MCP | Claude only, via `mcp__supabase__apply_migration` | Supabase project state |

Anything not in this table is either ephemeral UI state (URL params, in-memory only) or a bug —
flag it to the user, do not invent a new class.

---

## 2. Session lifecycle

### 2.1 Session start (mandatory, before any edit)

```
┌─────────────────────────────────────────────────────────┐
│ 1. mcp__supabase__list_tables      → schema sanity check │
│ 2. tools/check-supabase-freshness  → MAX(updated_at) per │
│                                      table               │
│ 3. compare to data/snapshots/sync-state.json             │
│ 4a. user-state fresher? pull row, surface diff           │
│ 4b. content mirror behind? re-push from repo             │
│ 5. proceed to §8 step 1 of CLAUDE.md                     │
└─────────────────────────────────────────────────────────┘
```

If any of steps 1–4 fails or surfaces an unexpected change, **stop and check with the user**. Do not
"proceed and clean up later" — that's how silent drift starts.

### 2.2 Mid-session writes

| Trigger | What Claude does |
|---------|------------------|
| User says "update my finances with X" | `mcp__supabase__execute_sql` UPSERT to `finances` row · re-SELECT to verify · update local snapshot |
| User says "research area X" | Edit `data/areas/<id>.json` via `Write` tool · UPSERT JSON into `areas` mirror table · update snapshot |
| User says "add a new house type" | Edit `data/house-types.json` · UPSERT into `house_types` mirror · update snapshot |
| Claude refactors a calculator | No Supabase write — code only |
| Claude touches `supabase/schema.sql` | NOT allowed via direct edit — open a phase, draft the migration, apply via `mcp__supabase__apply_migration` |

### 2.3 Session end (mandatory, before commit)

```
┌─────────────────────────────────────────────────────────┐
│ 1. Verify every Claude-side write landed (re-SELECT)     │
│ 2. tests/supabase-sync.test.js must pass                 │
│ 3. tools/run-intelligence-tests.mjs must pass            │
│ 4. Update data/snapshots/sync-state.json                 │
│ 5. git add + git commit + git push                       │
│ 6. Commit message footer: "Supabase: N areas, M rows"    │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Why this design

**Why content lives in repo JSON, not Supabase as primary**

Areas are reviewable, diff-able, cite-able content. Git history is the source of truth for
"what changed, when, by whom, with what sources". Stashing 195 area records in a JSONB column would
collapse that history into opaque database rows. The mirror table exists for query convenience
(fast filters, joins with shortlist / user state), not as the canonical store.

**Why user state lives in Supabase, not repo JSON**

User state changes hundreds of times per session and is per-household. Persisting that in git would
be absurd, and persisting it only in localStorage (the pre-Supabase architecture) lost data when the
user cleared their browser. Supabase + RLS gives durability + multi-device + multi-household.

**Why MCP is mandatory, not "preferred"**

Two writers (portal + Claude) without coordination = drift. The MCP connector is the *one*
coordination point Claude has into Supabase. Skipping it for "speed" means Claude is working from a
stale repo snapshot while the user has been editing in the portal — every guidance Claude gives
becomes wrong without warning. Mandatory MCP-first ensures Claude always works from the same
universe as the user.

---

## 4. Failure modes and recovery

| Symptom | Cause | Recovery |
|---------|-------|----------|
| `tests/supabase-sync.test.js` fails: "count mismatch on areas" | A content file edit didn't mirror | Re-run the UPSERT for the missing rows; do not commit until green |
| `tests/supabase-sync.test.js` fails: "user-state row missing" | Brand-new household never saved the relevant page | Acceptable if the page hasn't been visited; mark the row optional in the test fixture |
| Session-start freshness check shows user-state newer than expected | User edited in the portal since last session | Pull + surface; never overwrite without explicit confirm |
| MCP `execute_sql` returns `permission denied` | RLS rejected the write — household_id mismatch | Re-fetch the user's household_id via the auth path; do not bypass RLS |
| Schema drift between `supabase/schema.sql` and live | Someone applied DDL outside MCP | Reapply the canonical schema via `mcp__supabase__apply_migration`; record the incident in `docs/CHECKLIST.md` |

---

## 5. What this does NOT cover

- **Auth flow** — sign-in / sign-up / password reset live in `pages/login.html` and
  `pages/setup.html` and use Supabase Auth directly. Not Claude's concern unless changing the flow.
- **Storage buckets** — not currently used. If we add image hosting via Supabase Storage, that gets
  its own §6 in this document and its own sync test.
- **Edge functions** — none today. Same note as above.
- **Realtime subscriptions** — out of scope; the app polls on navigation.

---

## 6. Quick reference — the only commands you should reach for

```bash
# Read what's in Supabase right now (via MCP, not psql)
mcp__supabase__list_tables                     # schema sanity check
mcp__supabase__execute_sql "SELECT ..."        # any read
mcp__supabase__execute_sql "INSERT/UPDATE ..." # any user-state or content-mirror write
mcp__supabase__apply_migration                 # any DDL

# Local sync tooling
node tools/check-supabase-freshness.mjs        # MAX(updated_at) per table vs local snapshot
node tools/sync-content-to-supabase.mjs        # push repo JSON to mirror tables (Phase 10)
node tools/run-intelligence-tests.mjs          # full test harness incl. sync test
```

If you're reaching for `curl`, `psql`, or pasting SQL into the Supabase web dashboard — stop. You're
outside the MCP-first contract. Either use the MCP connector or open a new phase in `CHECKLIST.md`
to explain why an exception is needed.
