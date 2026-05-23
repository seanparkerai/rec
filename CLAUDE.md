# CLAUDE.md — Operating Rules for this Repository

This file governs how Claude (and any AI assistant) works in this repo. Read it at the **start of every
session**. These rules exist to keep work safe, resumable, and high quality.

## 1. Branching & commits
- Work and commit **directly to `main`**. Do **not** create sub-feature branches for this project.
- **Commit + push after every major step** (e.g. after each checklist phase or content batch) so any new
  chat can resume from a known-good state.
- Use clear, descriptive commit messages.

## 2. Large content writes (IMPORTANT)
- When adding a **large block of content to an already-large file**, do **not** paste it inline.
- Instead: **write the block to a separate temp file first**, then run the splice helper:
  ```bash
  node tools/insert-content.mjs --target <file> --content <tempfile> --marker "<!-- SLOT:x -->" --mode before
  ```
- For JSON list files, append before the closing marker (see `tools/insert-content.mjs --help`).
- Delete temp files after a successful splice.

## 3. Reading large files
- Read large files in **chunks of ≤200 lines** (use `offset`/`limit`), not all at once.

## 4. Start-of-cycle scan
- At the **start of any work session**, dispatch **Haiku-model scans** (fast/cheap) to summarise current
  repo + relevant file state before editing. Then read `docs/CHECKLIST.md` to find the next task.

## 5. Checklist discipline
- Keep `docs/CHECKLIST.md` in lockstep with `docs/PLAN.md`.
- Tick items as you complete them and **commit** so progress is never lost.

## 6. Testing & regression
- Keep the `tests/` harness current. **Run it after changes and before committing.**
- Add/extend benchmark tests (calculators, JSON schemas) as features grow so regressions surface early.

## 7. Content accuracy & imagery
- Write area/house content **only after detailed, place-specific and type-specific web searches**
  (exact place name + exact property type). Record sources in each record's `sources[]`.
- Use **only openly-licensed images** (Wikimedia Commons, Geograph CC, Unsplash, official tourism),
  **downloaded** into `assets/img/{areas,house-types}/`, with `credit` + `licence` recorded in the JSON.
- Never hotlink unattributed copyrighted search-engine images.

## 8. Resume protocol (start here in a fresh chat)
1. Read `docs/CHECKLIST.md` (what's done / next).
2. Read `docs/PLAN.md` (the master plan) and `docs/CONTEXT.md` (research facts).
3. Run a Haiku scan of any files you'll touch.
4. Run the test harness.
5. Continue at the **first unchecked** checklist item.

## Project shape (quick reference)
- Zero-build static site: plain HTML + CSS + vanilla JS, all libraries via CDN.
- Shared shell via fetch-injected partials (`components/`), styled with Pico CSS + tokens.
- Data as JSON in `data/`, user edits persisted via `assets/js/storage.js` (localStorage now → backend later).
- Hosted on **GitHub Pages** (deploy on push to `main`). Preview locally with `python3 -m http.server`.
