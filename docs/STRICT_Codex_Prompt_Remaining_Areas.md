# Codex Prompt — Complete All Remaining Area Records (Strict Quality / No Shortcuts)

Copy/paste everything below into a fresh Codex chat.

```text
You are working in repository: /workspace/rec

PRIMARY OBJECTIVE
Populate every remaining untouched area record to a high-research standard in one continuous session, processing in fixed batches of 10 areas and committing after each batch.

NON-NEGOTIABLE PRECHECK (DO THIS FIRST)
1) Read these files in order before any edits:
   - CLAUDE.md (all sections, especially workflow, file-write rules, accuracy and resume protocol)
   - docs/PLAN.md
   - docs/CONTEXT.md
   - docs/CHECKLIST.md
   - docs/AREAS.md
   - data/schema/area.schema.json
   - tools/area-fields.mjs
   - tools/area-status.mjs
2) Run:
   - node tools/area-status.mjs --missing
3) Build queue from status output.

SCOPE CONTROL (STRICT)
- ONLY modify records that are still untouched/directory stubs.
- DO NOT edit records already marked researched or partial.
- DO NOT “improve”, “standardise”, or rewrite existing non-empty records in this run.
- If a file has meaningful existing content, skip it.

ANTI-SHORTCUT RULES (HARD FAIL IF BROKEN)
- No templated prose: each area’s text must be genuinely place-specific.
- No copy/paste structure repeated with only place-name swaps.
- No invented facts, guessed commute times, or synthetic amenities.
- No source dumping: every listed source must have been used for a concrete field.
- No uncited hard claims (school rating, prices, distance, station, council-tax statement, etc.).
- No “generic village” filler language that could fit anywhere.
- No single-source factual claims where a second corroborating source is reasonably available.

MINIMUM RESEARCH STANDARD PER AREA
Before writing each area:
1) Perform at least 3 place-specific searches using exact format:
   "<area name> <county> <postcode>"
2) Consult and cross-check, where available:
   - Wikipedia / local history reference
   - Parish/town/council or official local authority pages
   - School pages and/or Ofsted references
   - Rightmove sold-price or house-price page for local postcode area
   - National Rail / Trainline / station data for nearest rail access
   - Map-based distance/time reference
3) Cross-check important facts across at least 2 distinct sources.

REQUIRED DATA QUALITY BAR PER AREA FILE
Write ONLY to: data/areas/<id>.json
Populate with specific, grounded content:
- overview: 3–5 specific sentences (geography + historical anchor + present-day character)
- character: specific built form / settlement pattern / atmosphere
- amenities[]: named facilities/services
- schools[]: named schools with useful context and approximate distance where available
- transport.commutes[]: realistic route/time context (no fabricated precision)
- prices{}: dated market snapshot with source URL
- thingsToDo[]: named local activities/places
- placesToEat[]: named pubs/cafés/restaurants where applicable
- pros[] / cons[]: concrete trade-offs specific to location
- whoItSuits: honest, specific suitability paragraph
- sources[]: minimum 4 distinct URLs actually used

STATUS RULE
- Use status="researched" only when required content is substantively complete.
- If key fields are genuinely unavailable after good-faith research, keep truthful null/[] and set status="partial".
- Never fabricate content to force researched status.

IMAGERY RULE
- Only openly licensed images (Wikimedia Commons, Geograph CC, Unsplash, official tourism permissions).
- If licensing/download certainty is not available, leave images: [].
- No hotlinking.

BATCH EXECUTION LOOP (10 AT A TIME)
Repeat until zero directory records remain:
1) Select next 10 untouched directory records, clustered by nearby area/postcode where possible.
2) Research and populate all 10 files.
3) Update docs/CHECKLIST.md progress note.
4) Run validation/status checks.
5) Commit.
6) Ensure local main contains the commit via deterministic merge flow.
7) Continue immediately to next 10 without asking for confirmation.

DETERMINISTIC MERGE FLOW (ALWAYS USE THIS)
After each batch commit:
1) Record current branch and ensure work is committed.
2) Ensure local main exists:
   - git show-ref --verify --quiet refs/heads/main || git branch main
3) Switch to main:
   - git switch main
4) Fast-forward main from your working branch only:
   - git merge --ff-only <work-branch>
5) Verify:
   - git rev-parse --abbrev-ref HEAD   (must be main)
   - git log --oneline -n 1            (must show batch commit)
If ff-only fails, stop and report exact divergence instead of forcing merge.

COMMIT MESSAGE FORMAT
Research batch: <id1>, <id2>, <id3> … (+10 areas, +X% complete)

OUTPUT AFTER EACH BATCH
Provide:
- 10 IDs completed
- status counts (researched / partial / directory)
- commit hash + message
- merge verification result (main at latest commit: yes/no)
- next 10 queued IDs

FINAL OUTPUT (END OF SESSION)
When no directory records remain, provide:
- final node tools/area-status.mjs summary
- total areas completed this session
- ordered list of all batch commits
- any unresolved blockers with exact reason and impacted IDs

BEHAVIOURAL REQUIREMENTS
- Do not ask “should I continue?” between batches.
- Continue autonomously unless blocked by contradiction/data integrity issue/tooling failure.
- Prefer accuracy over speed; if uncertain, verify before writing.
```
