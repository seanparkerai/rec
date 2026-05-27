# docs/audit-notes.md — Documentation currency audit

**Audit date:** 2026-05-27  
**Purpose:** Phase 0.5 of the refactor plan. Answer six questions per doc file; drive targeted slim edits only.

Six audit questions per file:
1. Is every rule still true?
2. Is any rule preventing legitimate edits?
3. Is the rule covered elsewhere (duplication)?
4. Is the file overpacked (> 200 lines, hard to absorb under context pressure)?
5. Is the file still load-bearing, or is it a session artefact?
6. Does it use sharp, measurable phrasing?

---

## CLAUDE.md (331 lines)

**Q1 — Still true?** Mostly yes. Three stale spots:
- `§1` "Work and commit directly to `main`" — correct for normal work, but session instructions may specify a named branch. The rule is not wrong; sessions override it. Keep as-is.
- **`Project shape` paragraph**: "`storage.js` (localStorage now → backend later)" — backend (Supabase) is now live. The "→ backend later" is stale. **Fix: remove the stale aside.**
- `§4` "dispatch Haiku-model scans" — names a specific model version. The rule's intent is "summarise before editing", not "use this exact model". **Fix: reword to be model-agnostic.**

**Q2 — Preventing legitimate edits?** One concern:
- `§6` says "Supabase sync tests are non-negotiable. `tests/supabase-sync.test.js` must pass" — this implies running the test separately, but `node tools/run-intelligence-tests.mjs` already includes it. The double-mention creates confusion. **Fix: simplify to "run `node tools/run-intelligence-tests.mjs`; it includes sync tests."**
- `§8 step 0` says "Before reading any local file, call the Supabase MCP connector" — this triggers for every refactoring session including pure code refactors that touch no data. This rule is appropriate for data/schema sessions but unnecessarily broad otherwise. **Fix: scope to "before any session that edits data, schema, or user-state".**

**Q3 — Duplication?** `§9–§11` design/mobile/a11y rules duplicate `DESIGN.md` content somewhat. However they're a useful compact reference. Acceptable duplication.

**Q4 — Overpacked?** At 331 lines, borderline. The §18 block (87 lines) is very detailed. That depth is appropriate because the sync contract is complex. Accept as-is; do not expand.

**Q5 — Load-bearing?** Fully load-bearing. Every section has active value.

**Q6 — Sharp phrasing?** Mostly yes. `§4` "dispatch Haiku-model scans" is the main vague spot (fixed above).

**§16 guard-rail audit (per entry):**
- `tokens.css` — **KEEP.** Colour/type/spacing tokens are a design decision requiring explicit approval. Touching without intent breaks the visual contract.
- `storage.js` — **KEEP.** The Supabase write-through cache logic is the app's data spine. Bugs here silently corrupt user state.
- `config.js` — **KEEP.** 11 lines, stable, handles both local and /rec/ path resolution. Never change without full test.
- `data-loader.js` — **KEEP.** JSON loading + caching layer. Stable, tested. No reason to change.
- `finances.js` — **KEEP** ("extend, don't rewrite"). Pure calc functions are correct and tested. Extending with new exports is fine; rewriting the core functions risks breaking the 174-test harness. The "extend" path is clear and tested.
- `area.schema.json` — **KEEP.** Changing the schema silently invalidates 195 per-area files if the schema validator doesn't catch drift.
- `.github/workflows/*` — **KEEP.** CI/deploy pipelines are shared infrastructure; changes affect live site.

**Net changes:** 3 targeted fixes (Project shape stale text, §4 model name, §6 double-mention, §8 scope).

---

## DESIGN.md (107 lines)

**Q1 — Still true?** Yes. All five overhaul rules remain operative.

**Q2 — Preventing legitimate edits?** No.

**Q3 — Duplication?** `§3 Bans` says "See `CLAUDE.md §9`" implicitly. Minor but acceptable — bans belong here as the visual source of truth.

**Q4 — Overpacked?** No (107 lines).

**Q5 — Load-bearing?** Yes.

**Q6 — Sharp phrasing?** Yes.

**Net changes:** None.

---

## README.md

**Q1 — Still true?** Need to verify storage paragraph; likely has the same "localStorage now → backend later" stale text.

**Q5 — Load-bearing?** Yes — public-facing intro.

**Net changes:** Check and fix any "backend later" references.

---

## PROGRESS.md

**Q1 — Still true?** It's a session log from 2026-05-26. The phases it describes have shipped.

**Q5 — Load-bearing?** No — it's a historical session log. The state it describes is now captured in `docs/CHECKLIST.md` and the git history.

**Net changes: Archive to `docs/archive/PROGRESS-2026-05-26.md`.** Do not delete — preserves archaeology.

---

## docs/PLAN.md (251 lines)

**Q1 — Still true?** It's the v2 plan. Phases 1–7 are complete. v3 is complete. Phase 10 Supabase sync is largely complete (pending user backfill action).

**Q5 — Load-bearing?** Partially — v2 rationale is still useful archaeology. But "continuing to read it as the current plan" risks confusion with the refactor plan.

**Net changes:** Add a "v2 COMPLETE" header at the top. No deletions — the rationale is still useful history.

---

## docs/CHECKLIST.md (393 lines)

**Q1 — Still true?** Yes. Phases 0–7 all ticked. v3 all ticked. Phase 10 has two outstanding user actions (run backfill script).

**Q5 — Load-bearing?** Yes — has one live action (Supabase backfill). Keep.

**Q4 — Overpacked?** At 393 lines, hard to scan quickly. The checked boxes are archaeology; the outstanding boxes are active. But slimming would risk losing context. Keep as-is.

**Net changes:** None. Note: `REFACTOR_CHECKLIST.md` is now the tracker for refactor work; `docs/CHECKLIST.md` remains the tracker for feature work.

---

## docs/CONTEXT.md (140 lines)

**Q1 — Still true?** UK first-time buyer facts are stable (2026). SDLT thresholds, mortgage rates are from 2026.

**Q5 — Load-bearing?** Yes — source reference for area content.

**Net changes:** None.

---

## docs/INTELLIGENCE_RULES.md (162 lines)

**Q1 — Still true?** Income multiples, stress test rate, LISA cap, LTV tiers are all cited and stable.

**Q5 — Load-bearing?** Yes — the constants extracted in Phase 2 of the refactor come from here.

**Net changes:** None.

---

## docs/ROADMAP.md (69 lines)

**Q1 — Still true?** Outreach is marked "Shipped in v3.0". Live listings and Ask page are still pending. Correct.

**Q5 — Load-bearing?** Yes.

**Net changes:** None.

---

## docs/AREAS.md (250 lines)

**Q5 — Load-bearing?** Yes — master list of areas with research status.

**Net changes:** None.

---

## docs/DATA_MODEL.md (129 lines)

**Q1 — Still true?** Should be checked against current storage.js signatures. Likely the new `getGoals()`, `getReadiness()`, `getInvestmentsHistory()` (from v3) are not reflected.

**Q5 — Load-bearing?** Yes — reference for adding new data types.

**Net changes:** Note that it may lag v3 additions. Flag for Phase 11 update.

---

## docs/SUPABASE_SYNC.md (136 lines)

**Q1 — Still true?** Yes. The sync contract is fully current.

**Q5 — Load-bearing?** Yes — referenced by `CLAUDE.md §18`.

**Net changes:** None.

---

## docs/USER_PROFILE.md (63 lines)

**Q5 — Load-bearing?** Yes — narrative template for profile.

**Net changes:** None.

---

## docs/SUPABASE_MIGRATION.md (60 lines)

**Q5 — Load-bearing?** Likely partially stale (was early migration notes). Low-risk to keep.

**Net changes:** None.

---

## docs/STRICT_Codex_Prompt_Remaining_Areas.md (124 lines)

**Q5 — Load-bearing?** This is an area-research prompt template. Still useful for area research sessions.

**Net changes:** None.

---

## Summary of changes to apply

| File | Change |
|------|--------|
| `CLAUDE.md` | Fix 4 stale/vague spots (see above) |
| `PROGRESS.md` | Archive to `docs/archive/PROGRESS-2026-05-26.md` |
| `docs/PLAN.md` | Add "v2 COMPLETE" header |
| `README.md` | Fix any "backend later" stale text |
| All others | No change |
