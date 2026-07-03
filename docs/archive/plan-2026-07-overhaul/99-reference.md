# Quick reference — §11 appendix

> Split from `fable_refactor.md` (2026-07-01, content unchanged). Directory: [`plan/README.md`](README.md).

## 11. Appendix — quick reference

### 11.1 Repository map (top level)
- `index.html` — the dashboard (home) page + app entry.
- `pages/` — 15 page surfaces (HTML), one per feature view.
- `components/` — fetch-injected shell partials: `header.html`, `nav.html`, `footer.html`.
- `assets/js/` — 132 ES modules: flat utilities + calculators, `dashboard/`, `finances/`,
  `listings/`, `areas/`, `refinement/`, `learned-preferences/`, `suggestions/`, `outreach/`,
  `ask/`, `setup/`, `criteria/`, `journey/`, `report/`, `storage/`, and thin `page-*.js`.
- `assets/css/` — 51 partials: `tokens.css` + `base.css` + `fonts.css`, the `dashboard.css` import
  shell + `dashboard/`, `pages/`, and `components/`.
- `assets/fonts/`, `assets/img/` — self-hosted fonts; openly-licensed imagery.
- `data/` — content JSON: `areas.json` (index) + `areas/<id>.json`, `house-types.json`,
  `checklists.json`, `journey.json`, `outreach-templates.json`, `schema/`, `snapshots/`, `source/`,
  `fixtures/` (redacted sample data for tests).
- `tools/` — Node `.mjs` scripts: the test harness, area pipeline, listings fetch/normalise, sync,
  linters, importers.
- `tests/` — ~65 `.js` test files + `assert.js`/`schemas.js` helpers + `tests.html` browser smoke.
- `supabase/` — `schema.sql` (reference DDL), `functions/ask/` (Deno Edge Function), `README.md`.
- `docs/` — live operating docs (index at `docs/README.md`) + `archive/`.
- `.github/workflows/` — CI, Pages deploy, scheduled fetchers (guard-railed; redesignable under §4.4).
- Root law: `CLAUDE.md` (operating rules), `DESIGN.md` (visual contract), `README.md`,
  and **this file** (`fable_refactor.md`, the overhaul program).

### 11.2 The single commands that matter
```bash
node tools/run-all-tests.mjs   # the unified test harness — green before every commit (§3.6)
node tools/area-status.mjs              # area research progress / next-to-do queue
node tools/lint-responsive.mjs          # mechanical responsive-doctrine lint (to become semantic, §5.2)
node tools/build-areas.mjs              # rebuild data/areas.json index from villages.csv + per-area files
node tools/sync-areas-from-supabase.mjs # materialise per-area JSON from the DB (areas are DB-canonical)
python3 -m http.server 8000             # local preview (no browser in CI env; developer verifies)
git log --oneline -40                   # cadence & recent history
wc -l fable_refactor.md                 # track this plan's size as Fable deepens it
```

### 11.3 The four data classes (`CLAUDE.md` §18.1 — get this right before touching storage)
- **User state** (profile, criteria, finances, goals, shortlist, contacts, outreach, reactions,
  learned prefs, …) → source of truth = **Supabase**, per `household_id`. Never in repo JSON.
- **Content — areas** → source of truth = **Supabase**; `data/areas/*.json` is a materialised view.
- **Content — other** (`house_types` mirror; `checklists` + `outreach-templates` repo-only) → source
  of truth = **repo JSON**, mirrored via MCP where a mirror table exists.
- **System / engine** (`households`, `household_members`, `sync_log`, `listings`, refinement tables)
  → Supabase-managed; never synced or hand-edited.

### 11.4 Governing docs index
| Doc | Read it for |
|---|---|
| `CLAUDE.md` | The operating law — branching, testing, design, guard rails, Supabase sync. |
| `DESIGN.md` | The visual contract — anchors, tokens, bans, responsive doctrine. |
| `fable_refactor.md` | **This file** — the overhaul program: scan, authority, test rebuild, segments. |
| `docs/CHECKLIST.md` | Live progress tracker (the repo's own, distinct from §9 here). |
| `docs/ROADMAP.md` | What shipped across v2/v3. |
| `docs/DATA_MODEL.md` | Every data shape and where it lives/flows. |
| `docs/SUPABASE_SYNC.md` | The bidirectional sync contract in operational detail. |
| `docs/INTELLIGENCE_RULES.md` | Constants + rationale for affordability/fit/learning engines. |
| `docs/REFINEMENT_README.md` | How the Model Refinement Engine fits together / how to operate it. |
| `docs/ASK.md` | The Ask assistant — tool catalogue, deploy/operate. |
| `docs/FETCH_SCHEDULE.md` | The daily Rightmove fetch — timing, triggers, DST-safety. |

### 11.5 Definition of done (per sub-phase) — the new standard
1. Behaviour preserved or intentionally improved (characterization/golden-master tests prove it, §5).
2. The single test command is green; the lint is clean (semantic, §5.2).
3. Design anchor named; `DESIGN.md` bans avoided; tokens-only; a11y floor met (or raised).
4. Any guard-rail touched followed the §4 rail-change protocol (and §4.4 owner gate if foundational).
5. Supabase sync ceremony complete if data/schema/storage touched; live-data invariant intact (§3.5).
6. The changed behaviour is **described and vetted to the §6 standard** — including its As-is→To-be —
   in the relevant `docs/` file or segment.
7. Any dead/redundant code the change exposes is removed or logged in the §2.7 inventory.
8. Merged to `main`, pushed, §9 checklist ticked, owner updated in one line.

### 11.6 The owner's directives captured in this edition (2026-06-16)
This expanded edition encodes seven explicit owner directives. Fable must honour them as it re-plans:
1. **Comprehensive, vetted feature descriptions** for every rule/mechanic/style/logic — the §6 standard.
2. **Authority to flex, relax, and redesign the guard rails** — §4, with a disciplined rail-change
   protocol and owner gates for the foundational rails.
3. **A complete re-write of all test processes and the tests themselves** to a new standard — §5,
   built strangler-style so the safety net is never down.
4. **A new standard, top to bottom** — the floor is today's system; the target is what a senior team
   would build from first principles now.
5. **Total redesign freedom for the whole portal** — IA, navigation, page set, visuals, mechanisms
   (prime directive + §10.0), bounded only by the safety process.
6. **Gradual modular decomposition of the learning/intelligence engine** so modules can be optimised
   or rebuilt one at a time behind stable interfaces — §10.0.
7. **High-quality, easy-to-answer questions** that surface Fable's assumptions/decisions for precise
   owner feedback — §7.0 — plus an **obsolescence audit** (old/dead/redundant/unused — §2.7) and an
   **As-is→To-be** account for every meaningful piece (§6.1.10).

---

*Authored 2026-06-16 by Opus 4.8 as the foundation for the Fable-led overhaul, then expanded the same
day into this comprehensive edition. Per the repo's prime rule: where this file and reality disagree,
reality wins — Fable fixes this file. Nothing here is frozen until the §2 scan and §7 intake are done;
this is the start of the conversation, deliberately over-specified so the conversation starts informed.*

---

