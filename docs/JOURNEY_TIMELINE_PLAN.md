# Buying-Journey Timeline — implementation status

A single long, scrollable vertical timeline of the end-to-end house-buying journey.
Each step is tappable and opens a modal with a blurb + a sub-checklist of tasks you tick
off. Progress persists per household in Supabase (`journey_progress`) with the usual
localStorage write-through; the Home "Where you are" tile reflects it.

## Decisions taken (all the recommended option)
1. **Reused** the existing `pages/journey.html` (was "Checklists") rather than adding a new page.
2. **New `journey_progress` table** (blob `{ tasks: { taskId: true } }`) — leaves legacy
   `journey_checks` untouched and gives real two-way sync.
3. **Persist only the set of ticked task ids.** A step is done when all its tasks are ticked;
   a phase when all its steps are; the current step is the first not-done step.

## What shipped (Phases A–D)
- **A — data/schema/storage:** `data/journey.json` (9 phases / 30 steps / 96 tasks);
  `journey_progress` table (RLS + 3 policies + `updated_at` trigger) via the
  `add_journey_progress` MCP migration; `getJourneyProgress`/`saveJourneyProgress` in
  `assets/js/storage/user-state.js`; tracked in `data/snapshots/sync-state.json`
  (21 tracked tables); `tests/journey-data.test.js`.
- **B+C — page + modal:** `pages/journey.html` rewritten as the timeline + `<dialog>` step
  modal + reset-confirm `<dialog>`; `assets/js/page-journey.js` coordinator; pure helpers
  in `assets/js/journey/progress.js`; styles in `assets/css/pages/journey.css`
  (tokens only, mobile bottom-sheet); `tests/journey-progress.test.js` +
  `getJourneyProgress` default/round-trip in `characterization-storage.test.js`.
  Nav label → "Buying journey".
- **D — Home tile:** `assets/js/dashboard/tile-journey.js` repointed to
  `data/journey.json` + `getJourneyProgress`; `index.html` heading/action updated.

## Contracts / gotchas
- **Task ids are a stable contract.** `data/journey.json` task ids are `phase.step.n`;
  renaming one orphans existing ticks. Only ever append. Enforced by `tests/journey-data.test.js`.
- `data/journey.json` is **content** (repo-JSON, canonical) — like `checklists.json`, it has
  **no** Supabase mirror table. Only the tick state (`journey_progress`) lives in Supabase.
- Verify on device (no browser here): tick round-trip portal → Supabase → second context;
  no horizontal scroll at 320px; node states + modal feel; reduced-motion.

## Not done — Phase E (OPTIONAL, needs separate approval)
Retiring the legacy flat checklists: remove the `journey-checks` special case in
`assets/js/storage/core.js` (a **§16 guard-railed** file), drop the `journey_checks` table,
delete `data/checklists.json` + its validator, and clean `page-data-sync.js` /
`pages/data-sync.html` enumerations. Left untouched on purpose — its own named phase.
